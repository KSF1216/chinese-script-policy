#!/usr/bin/env node
// End-to-end check of this package as a DSH bundle, against a REAL DSH instance.
//
// Why it exists: the unit tests can only check shapes. Two of this plugin's
// failure modes are invisible to them, and both have actually happened:
//
//   1. a bare import of a harness package that a LINKED bundle cannot resolve
//      fails the entry at load time, and a service named in `inject` that the
//      host does not implement parks it. Either way the host prints
//      "did not activate" / "pending (waiting for service: ...)" and the guard
//      never runs - silently, because nothing else depends on it.
//   2. a schema the settings service cannot project leaves the entry with no
//      editable fields - the card never appears, silently.
//
// The third failure mode of the same family - a client module whose `inject`
// names a service no client provides, which makes the browser's boot audit THROW
// and takes the whole GUI down - is pinned by scripts/plugin-selftest.mjs
// against the client's service list, because it is a property of the injected
// names rather than of a running host. What this script adds for the browser half
// is the other half of that story: every served bundle EVALUATES, and our module
// registers itself.
//
// So this boots a THROWAWAY instance: its own $DSH_HOME under the OS temp dir,
// its own port, and a profile that lists this package as a bundle. Nothing under
// the user's real ~/.dsh is read or written. It then checks, in order:
//
//   * the host booted with every entry active (no pending, no failure);
//   * the host SERVES our settings namespace (the real `settings/describe`);
//   * the served client bundles evaluate and register our module.
//
// Usage:
//   node dev/dsh-boot-check.mjs [--port 3099] [--keep]
//   node dev/dsh-boot-check.mjs --url http://127.0.0.1:3099 --home <scratch home>
//
// Requires a DSH install (the npx cache is probed like the other selftests do)
// and a writable temp directory. Exits 0 when every check passes, 1 otherwise.
import { spawn } from 'node:child_process'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import net from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const hit = argv.find((value) => value === name || value.startsWith(name + '='))
  if (hit === undefined) return fallback
  const [, inline] = hit.split('=')
  if (inline !== undefined) return inline
  const index = argv.indexOf(hit)
  return argv[index + 1]
}
const PORT = Number(option('--port', '3099'))
const KEEP = argv.includes('--keep')
const ATTACH = option('--url', null)
const ATTACH_HOME = option('--home', null)
const PACKAGE_NAME = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).name
const NAMESPACE = PACKAGE_NAME

const problems = []
const note = (line) => console.log('  ' + line)
const ok = (line) => console.log('  ok   ' + line)
const bad = (line) => { problems.push(line); console.log('  FAIL ' + line) }

// ---------------------------------------------------------------- discovery
function findDshBin() {
  const explicit = option('--dsh-bin', null)
  if (explicit) return explicit
  const npxRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      const candidate = join(npxRoot, entry, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

// ---------------------------------------------------------------- scratch home
function writeScratchProfile(home) {
  const profile = join(home, 'profiles', 'web')
  mkdirSync(join(profile, 'node_modules'), { recursive: true })
  writeFileSync(join(profile, 'cordis.yml'), '# scratch profile root, written by dev/dsh-boot-check.mjs\n[]\n')
  writeFileSync(join(profile, 'cordis.patch.yml'), '# scratch profile patch layer\n[]\n')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { [PACKAGE_NAME]: 'link:' + repo.replaceAll('\\', '/') },
    dsh: {
      profile: {
        bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', PACKAGE_NAME],
        patchReload: 'live',
      },
    },
  }, null, 2) + '\n')
  // pnpm would make this link itself; the check deliberately does not run a
  // package manager, so it makes the link by hand (a junction needs no admin).
  const link = join(profile, 'node_modules', PACKAGE_NAME)
  if (!existsSync(link)) symlinkSync(repo, link, 'junction')
  return profile
}

// ---------------------------------------------------------------- http
const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((resolve) => setTimeout(() => resolve({ status: 0, text: label + ' timed out after ' + ms + 'ms', failed: true }), ms)),
])

function fetchText(base, path, { method = 'GET', body, cookie } = {}) {
  const url = new URL(path, base)
  return withTimeout(new Promise((resolve) => {
    const headers = {}
    if (cookie) headers.cookie = cookie
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = Buffer.byteLength(body)
    }
    const req = request({
      host: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers: res.headers }))
    })
    req.on('error', (error) => resolve({ status: 0, text: error.message, failed: true }))
    req.end(body)
  }), 15000, path)
}

/** Sign the browser-session cookie the same way the page's own bootstrap does. */
function mintCookie(home, authority) {
  const credentials = join(home, '.credentials.yaml')
  if (!existsSync(credentials)) throw new Error('no .credentials.yaml in ' + home + ' (has the instance booted?)')
  const match = readFileSync(credentials, 'utf8').match(/client-connection\/browser-session:[\s\S]*?secret:\s*([A-Za-z0-9_-]+)/)
  if (!match) throw new Error('client-connection/browser-session secret not found in ' + credentials)
  const b64url = (buffer) => Buffer.from(buffer).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
  const secret = Buffer.from(match[1].replaceAll('-', '+').replaceAll('_', '/') + '=', 'base64')
  const now = Date.now()
  const payload = b64url(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 3600_000 }))
  return 'dsh-auth-' + b64url(createHash('sha256').update(authority).digest()) + '=v1.' + payload +
    '.' + b64url(createHmac('sha256', secret).update(payload).digest())
}

const rpc = async (base, cookie, endpoint, args = {}) => {
  const response = await fetchText(base, '/api/' + endpoint, {
    method: 'POST',
    cookie,
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args } }),
  })
  if (response.failed || response.status !== 200) return { ok: false, why: response.status + ' ' + response.text.slice(0, 200) }
  try {
    const parsed = JSON.parse(response.text)
    if (parsed && parsed.result && parsed.result.ok === true) return { ok: true, value: parsed.result.value }
    return { ok: false, why: JSON.stringify(parsed && parsed.result ? parsed.result.error ?? parsed.result : parsed).slice(0, 300) }
  } catch {
    return { ok: false, why: 'not JSON: ' + response.text.slice(0, 200) }
  }
}

// ---------------------------------------------------------------- boot
const waitForPort = (port, timeoutMs) => new Promise((resolve) => {
  const deadline = Date.now() + timeoutMs
  const attempt = () => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => {
      socket.destroy()
      if (Date.now() > deadline) resolve(false)
      else setTimeout(attempt, 500)
    })
  }
  attempt()
})

/** Extract the JSON object assigned to `window.__DSH_BOOT__` from the page. */
function parseBoot(html) {
  const marker = html.indexOf('__DSH_BOOT__')
  if (marker < 0) return null
  const start = html.indexOf('{', marker)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < html.length; i++) {
    const char = html[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * Run a served client bundle the way the page does. The script registers its
 * factories through `window.__ModuleLoader__.load`; instantiating a factory is
 * what executes a module's top level.
 *
 * ONLY our own module is instantiated here. The others are deliberately left
 * registered-but-uninstantiated: with a stand-in `require`, any module that goes
 * through the bundler's interop helper sees an empty namespace and dies on
 * "react.memo is not a function" - a failure of the STAND-IN, not of the module
 * (measured: 6 of the shipped modules do exactly that). Attributing those to this
 * package would be a false alarm, and a guard nobody trusts is worse than none.
 * What the whole-bundle call still proves for every module is the shape that
 * killed this GUI once: the script evaluates, and each factory registers itself.
 */
function evaluateBundle(code, wanted) {
  const registrations = []
  const quiet = { ...console, error: () => {}, warn: () => {}, log: () => {} }
  new Function('window', 'console', code)({
    __ModuleLoader__: { load: (definition) => { registrations.push(definition) } },
  }, quiet)
  const instantiated = []
  for (const definition of registrations) {
    const stub = new Proxy(function stub() {}, {
      get: (target, key) => (key === 'Symbol.toStringTag' ? 'Module' : stub),
      apply: () => stub,
      construct: () => stub,
    })
    let exports = null
    let error = null
    try {
      exports = definition.factory(() => stub)
    } catch (thrown) {
      error = String(thrown && thrown.message ? thrown.message : thrown)
    }
    // Everything is recorded, but only the wanted ids are judged.
    instantiated.push({ id: definition.id, exports: exports || {}, error, judged: wanted.includes(definition.id) })
  }
  return instantiated
}

// ---------------------------------------------------------------- checks
async function check({ base, home }) {
  const authority = new URL(base).host
  // The port starts listening a moment BEFORE the instance has written its
  // credentials, so wait for that file instead of racing it - measured: the first
  // version of this check failed exactly there ("no .credentials.yaml ... has the
  // instance booted?"), which is a flaky guard, not a broken plugin.
  const credentials = join(home, '.credentials.yaml')
  for (let waited = 0; !existsSync(credentials) && waited < 30000; waited += 250) {
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const cookie = mintCookie(home, authority)
  console.log('== 2. the served page and its client modules ==')
  const page = await fetchText(base, '/', { cookie })
  if (page.status !== 200) {
    bad('GET / returned ' + page.status + ' (' + page.text.slice(0, 120) + ')')
    return
  }
  ok('GET / -> 200, ' + page.text.length + ' bytes')
  const boot = parseBoot(page.text)
  if (!boot || !Array.isArray(boot.entries)) {
    bad('the page carries no window.__DSH_BOOT__ entry list (did the boot payload format change?)')
    return
  }
  const mine = boot.entries.filter((entry) => entry.id === PACKAGE_NAME)
  if (mine.length !== 1) {
    bad('the page lists ' + mine.length + ' client module(s) for ' + PACKAGE_NAME + ', want 1')
    return
  }
  ok('the page lists our client module (' + boot.entries.length + ' modules in total)')

  // The batches the page itself preloads, taken from the page rather than built
  // here: the host decides how many modules share a combo (and with which
  // revision), and a hand-built URL is a 404 waiting to happen. The browser
  // evaluates each batch as ONE script, so a throw anywhere in one is a dead GUI.
  const hrefs = [...page.text.matchAll(/plugins\/\?\?[^"'\s<>]+/g)].map((match) => match[0].replaceAll('&amp;', '&'))
  const batches = [...new Set(hrefs)]
  if (batches.length === 0) {
    bad('the page references no client bundle at all')
    return
  }
  const instantiated = []
  let bytes = 0
  for (const href of batches) {
    const bundle = await fetchText(base, href, { cookie })
    if (bundle.status !== 200) {
      bad('a client bundle returned ' + bundle.status + ': ' + href.slice(0, 80) + '...')
      continue
    }
    bytes += bundle.text.length
    try {
      instantiated.push(...evaluateBundle(bundle.text, [PACKAGE_NAME]))
    } catch (error) {
      bad('a client bundle threw while evaluating (this is the dead-GUI failure): ' + error.message)
    }
  }
  ok('fetched and ran ' + batches.length + ' bundle(s), ' + bytes + ' bytes, ' + instantiated.length + ' module registration(s)')
  const failed = instantiated.filter((entry) => entry.judged && entry.error)
  if (failed.length > 0) {
    bad('our module threw while loading: ' + JSON.stringify(failed.slice(0, 3)))
  } else {
    ok('every bundle evaluated and our module instantiated')
  }
  const ours = instantiated.find((entry) => entry.id === PACKAGE_NAME)
  if (!ours) bad('our module did not register under ' + PACKAGE_NAME)
  else if (!ours.exports || typeof ours.exports.apply !== 'function') bad('our module registered no apply()')
  else {
    const inject = Array.isArray(ours.exports.inject) ? ours.exports.inject : []
    ok('our module registered: inject=' + JSON.stringify(inject))
  }

  console.log('== 3. the settings namespace the host serves ==')
  // The namespace is addressed by the profile entry id, and the entry id is what
  // the bundle patch declares.
  const namespaces = {}
  for (const endpoint of ['settings/describe', 'settings.describe']) {
    const described = await rpc(base, cookie, endpoint)
    if (described.ok && described.value && Array.isArray(described.value.namespaces)) {
      for (const view of described.value.namespaces) namespaces[view.ns] = view
      ok(endpoint + ' -> ' + described.value.namespaces.length + ' namespace(s)')
      break
    }
    note(endpoint + ' -> ' + (described.why || 'no value'))
  }
  const view = namespaces[NAMESPACE]
  if (!view) {
    bad('the host does not serve the ' + NAMESPACE + ' namespace (the settings card can never appear); served: ' +
      JSON.stringify(Object.keys(namespaces)))
  } else {
    ok('the host serves ' + NAMESPACE)
    const fields = JSON.stringify(view)
    for (const field of ['enabled', 'mode', 'script', 'register', 'japanese', 'fileTypes']) {
      if (!fields.includes('"' + field + '"')) bad('the served schema does not mention the "' + field + '" field')
    }
  }

  // A card that can save is the point of the whole settings port, so the write is
  // driven here for real - through the SAME RPC the card uses - and then read
  // back, both from the API and from the profile patch the values are supposed to
  // live in. The value is restored afterwards so a kept scratch home stays clean.
  console.log('== 4. a real write reaches the profile patch ==')
  if (!view) {
    bad('no served namespace to write to')
    return
  }
  const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
  const original = view.value && view.value.mode
  const written = await rpc(base, cookie, 'settings/mutate', {
    ns: NAMESPACE,
    ops: [{ op: 'set', path: ['mode'], value: 'warn' }],
    expectedRevision: view.revision,
  })
  if (!written.ok) {
    bad('settings/mutate was refused: ' + JSON.stringify(written.why ?? written.value).slice(0, 200))
    return
  }
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  if (!patch.includes(NAMESPACE) || !patch.includes('mode: warn')) {
    bad('the write did not land in the profile patch (' + patchPath + '): ' + JSON.stringify(patch.slice(-200)))
  } else {
    ok('the write landed in the profile patch (' + patchPath + ')')
  }
  const again = await rpc(base, cookie, 'settings/describe')
  const after = again.ok && Array.isArray(again.value.namespaces)
    ? again.value.namespaces.find((entry) => entry.ns === NAMESPACE)
    : null
  if (!after || !after.value || after.value.mode !== 'warn') {
    bad('the written value did not read back: ' + JSON.stringify(after && after.value))
  } else {
    ok('the written value reads back (mode=' + after.value.mode + ', revision ' + after.revision + ')')
  }
  // The revision fence the card depends on: a write carrying the revision the
  // caller read BEFORE the first write must be refused, not silently applied.
  const stale = await rpc(base, cookie, 'settings/mutate', {
    ns: NAMESPACE,
    ops: [{ op: 'set', path: ['mode'], value: 'block' }],
    expectedRevision: view.revision,
  })
  if (stale.ok) bad('a stale-revision write was accepted (the conflict fence is not working)')
  else ok('a stale-revision write is refused')
  // Put it back, with the revision this read saw.
  await rpc(base, cookie, 'settings/mutate', {
    ns: NAMESPACE,
    ops: [{ op: 'set', path: ['mode'], value: original ?? 'block' }],
    expectedRevision: after ? after.revision : undefined,
  })
}

// ---------------------------------------------------------------- main
let child = null
let scratchRoot = null
try {
  if (ATTACH) {
    if (!ATTACH_HOME) throw new Error('--url needs --home <the scratch DSH_HOME that instance uses>')
    console.log('== 1. attaching to ' + ATTACH + ' (home: ' + ATTACH_HOME + ') ==')
    note('an attached instance is not inspected for boot warnings; only its own log has them')
    await check({ base: ATTACH, home: ATTACH_HOME })
  } else {
    const bin = findDshBin()
    if (!bin) throw new Error('no DSH install found (pass --dsh-bin <.../dsh/lib/bin.js>)')
    const root = join(tmpdir(), 'csp-boot-check')
    if (existsSync(root)) rmSync(root, { recursive: true, force: true })
    const home = join(root, 'home')
    writeScratchProfile(home)
    scratchRoot = root
    console.log('== 1. booting a throwaway DSH ==')
    note('bin  : ' + bin)
    note('home : ' + home + '  (the user\'s ~/.dsh is not touched)')
    note('port : ' + PORT)
    child = spawn(process.execPath, [bin, '--profile', 'web', '--port', String(PORT), '--no-open'], {
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let log = ''
    child.stdout.on('data', (chunk) => { log += String(chunk) })
    child.stderr.on('data', (chunk) => { log += String(chunk) })
    const listening = await waitForPort(PORT, 90000)
    if (!listening) {
      bad('the instance never listened on ' + PORT + '; output was:\n' + log.slice(-2000))
    } else {
      ok('the instance listened on ' + PORT)
      const parked = log.split(/\r?\n/).filter((line) => /pending \(waiting for|did not activate|startup failed/.test(line))
      if (parked.length > 0) bad('the host reported inactive entries:\n    ' + parked.join('\n    '))
      else ok('no entry was parked or failed at boot')
      const tokenMatch = log.match(/\?token=([A-Za-z0-9_-]+)/)
      const base = 'http://127.0.0.1:' + PORT
      const cookie = tokenMatch ? null : undefined
      await check({ base, home })
      if (cookie === null) note('(the instance also printed a bootstrap token: ' + tokenMatch[1].slice(0, 8) + '...)')
    }
  }
} catch (error) {
  bad('harness error: ' + (error && error.message ? error.message : String(error)))
} finally {
  if (child) {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (scratchRoot && !KEEP) {
    try { rmSync(scratchRoot, { recursive: true, force: true }) } catch { /* best effort */ }
  } else if (scratchRoot) {
    console.log('  kept: ' + scratchRoot)
  }
}

console.log('')
console.log(problems.length ? 'FAIL: ' + problems.length + ' problem(s):\n  - ' + problems.join('\n  - ') : 'PASS: the plugin boots, serves its settings namespace, its client bundle runs, and a write reaches the profile patch')
process.exit(problems.length ? 1 : 0)
