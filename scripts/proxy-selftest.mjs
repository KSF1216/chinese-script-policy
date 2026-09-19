// Regression test for examples/llm-proxy/llm-guard-proxy.mjs, run against a REAL http
// upstream (a stand-in llama-server) and a REAL listening proxy - not a hand-rolled stub.
//
// Why it exists: this component's whole job is byte-level behaviour at an HTTP boundary
// (what reaches the upstream, what reaches the front end, and what is deliberately left
// alone). A unit test of convertText() would stay green while the proxy still mangled
// tool_calls, filtered the built-in web UI's HTML, or answered a `stream: true` request
// with an SSE body nobody rewrote. So both servers really listen and the checks speak HTTP.
//
// Usage: node scripts/proxy-selftest.mjs
// Exits 0 when the boundary behaves, 1 on a real contract failure.
import http from 'node:http'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const PROXY_FILE = join(here, '..', 'examples', 'llm-proxy', 'llm-guard-proxy.mjs')
const { startProxy } = await import(pathToFileURL(PROXY_FILE).href)

let checks = 0
const problems = []
const check = (ok, message) => {
  checks++
  if (!ok) problems.push(message)
}

// Canned bodies. The Simplified ones carry the check-ok marker the repo-wide checker
// honours, because in this file they are test DATA, not text this project ships.
const SIMPLIFIED = '后面软件很干净' // check-ok
const TRADITIONAL = '後面軟體很乾淨'
// Wording preferences are OFF by default (軟件 is correct Traditional), so the default
// conversion is 軟件 and --wording is what makes it 軟體.
const CONVERTED_DEFAULT = '後面軟件很乾淨'
const CONVERTED_WORDING = '後面軟體很乾淨'
const KOKUJI = '我的畑。' // check-ok
const NATIVE_PROMPT = '简体中文测试：后面软件很干净，所以我们要' // check-ok

const PAGE = '<!doctype html><title>stand-in llama-server UI</title><h1>fake UI</h1>'
const MODELS = '{"object":"list","data":[{"id":"local","object":"model"}]}'
const PROPS = '{"default_generation_settings":{"n_ctx":32768}}'

const bodyFor = (content, extra = '') =>
  '{"id":"cmpl-1","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":' +
  JSON.stringify(content) + extra + '},"finish_reason":"stop"}],"usage":{"total_tokens":7}}'

const TOOL_CALL_BODY = bodyFor(SIMPLIFIED,
  ',"tool_calls":[{"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"a.md\\"}"}}]')

const seen = []
const upstream = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    seen.push({ url: req.url, body: raw, headers: req.headers })
    const json = (text) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) })
      res.end(text)
    }
    if (req.url === '/') {
      // llama-server's built-in UI serves pre-compressed assets and answers 415
      // "gzip is not supported by this browser" when accept-encoding is missing - the
      // behaviour that proved the proxy was stripping that header from EVERY request
      // instead of only from the ones whose body it has to read.
      if (!String(req.headers['accept-encoding'] || '').includes('gzip')) {
        res.writeHead(415, { 'content-type': 'text/plain; charset=utf-8' })
        return res.end('Error: gzip is not supported by this browser')
      }
      const page = gzipSync(Buffer.from(PAGE))
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
        'content-length': page.length,
      })
      return res.end(page)
    }
    if (req.url === '/v1/models') return json(MODELS)
    if (req.url === '/props') return json(PROPS)
    if (req.url === '/completion') {
      // llama.cpp's NATIVE shape: no choices array, the text at the top level, and the
      // caller's own prompt echoed back verbatim. A proxy that only understands the
      // OpenAI shapes silently does nothing here - a measured bug, not a hypothetical.
      const asked = JSON.parse(raw || '{}')
      return json('{"index":0,"content":' + JSON.stringify(SIMPLIFIED) +
        ',"prompt":' + JSON.stringify(String(asked.prompt || '')) + ',"stop":true,"tokens_predicted":9}')
    }
    if (req.url === '/v1/chat/completions') {
      const asked = String((JSON.parse(raw || '{}').messages || []).map((m) => m.content).join(' '))
      if (asked.includes('toolcall')) return json(TOOL_CALL_BODY)
      if (asked.includes('residual')) return json(bodyFor(KOKUJI))
      if (asked.includes('traditional')) return json(bodyFor(TRADITIONAL))
      return json(bodyFor(SIMPLIFIED))
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end('{"error":{"message":"nope"}}')
  })
})
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
const upstreamUrl = 'http://127.0.0.1:' + upstream.address().port

const ask = (port, content, extra = {}) => fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content }], ...extra }),
})

const openProxies = []
const open = async (options) => {
  const proxy = await startProxy({ port: 0, upstream: upstreamUrl, quiet: true, log: () => {}, ...options })
  openProxies.push(proxy)
  return proxy
}

try {
  const proxy = await open({})

  // --- the guard's actual job -------------------------------------------------
  const converted = await ask(proxy.port, 'case simplified')
  const convertedBody = await converted.text()
  check(converted.status === 200, 'a normal answer did not come back 200')
  check(JSON.parse(convertedBody).choices[0].message.content === CONVERTED_DEFAULT,
    'Simplified text was not converted on the way out: ' + convertedBody)
  check(proxy.stats.converted === 1, 'the conversion was not counted: ' + proxy.stats.converted)
  check(proxy.stats.residuals === 0, 'a clean conversion was reported as having a residual')

  // A clean answer must travel byte for byte - no gratuitous re-serialization.
  const clean = await ask(proxy.port, 'case traditional')
  check(await clean.text() === bodyFor(TRADITIONAL), 'a clean answer was rewritten instead of passed through')
  check(proxy.stats.unchanged >= 1, 'a clean answer was not counted as unchanged')

  // A response carrying tool_calls is never rewritten: an agent's tool call is JSON.
  const tool = await ask(proxy.port, 'case toolcall')
  const toolBody = JSON.parse(await tool.text())
  check(toolBody.choices[0].message.content === SIMPLIFIED,
    'a tool_calls response had its content rewritten: ' + JSON.stringify(toolBody.choices[0].message.content))
  check(Array.isArray(toolBody.choices[0].message.tool_calls) &&
    toolBody.choices[0].message.tool_calls.length === 1, 'the tool_calls array did not survive')
  check(proxy.stats.skippedToolCalls >= 1, 'the tool_calls skip was not counted')

  // What the tables cannot fix is REPORTED, not silently accepted.
  const residual = await ask(proxy.port, 'case residual')
  check(residual.status === 200 && JSON.parse(await residual.text()).choices[0].message.content === KOKUJI,
    'an unconvertible answer did not come back untouched')
  check(proxy.stats.residuals >= 1, 'the residual was not counted: ' + proxy.stats.residuals)

  // llama.cpp's native /completion shape: the text sits at the top level (there is no
  // `choices` array at all) and the caller's prompt comes back echoed.
  const native = await fetch('http://127.0.0.1:' + proxy.port + '/completion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: NATIVE_PROMPT, n_predict: 8 }),
  })
  const nativeBody = JSON.parse(await native.text())
  check(nativeBody.content === CONVERTED_DEFAULT,
    "llama.cpp's native /completion shape was not converted: " + JSON.stringify(nativeBody.content))
  check(nativeBody.prompt === NATIVE_PROMPT,
    'the echoed prompt was rewritten, but that is the caller\'s own text: ' + JSON.stringify(nativeBody.prompt))

  // --- non-streaming, and the whole origin ------------------------------------
  await ask(proxy.port, 'case stream', { stream: true, stream_options: { include_usage: true } })
  const lastChat = seen.filter((s) => s.url === '/v1/chat/completions').pop()
  const upstreamSaw = JSON.parse(lastChat.body)
  check(upstreamSaw.stream === false, 'stream:true was forwarded instead of being downgraded')
  check(!('stream_options' in upstreamSaw), 'stream_options was forwarded with a non-streaming request')
  check(proxy.stats.downgraded === 1, 'the downgrade was not counted: ' + proxy.stats.downgraded)
  check(!lastChat.headers['accept-encoding'], 'accept-encoding was forwarded, so the upstream could gzip')

  // The built-in UI's own behaviour is reproduced here: it NEEDS the caller's
  // accept-encoding, and its body arrives gzipped. Passing a gzipped passthrough through
  // untouched is part of the contract.
  const page = await fetch('http://127.0.0.1:' + proxy.port + '/')
  check(page.status === 200,
    'the built-in UI answered ' + page.status + ' through the proxy (its gzip request was stripped)')
  check(await page.text() === PAGE, 'the upstream page was not proxied byte for byte')
  check(String(page.headers.get('content-type')).includes('text/html'), 'the page lost its content type')
  const pageSeen = seen.filter((s) => s.url === '/').pop()
  check(String(pageSeen && pageSeen.headers['accept-encoding']).includes('gzip'),
    'accept-encoding was stripped from a request whose response is only passed through')

  const models = await fetch('http://127.0.0.1:' + proxy.port + '/v1/models')
  check(await models.text() === MODELS, '/v1/models was not passed through byte for byte')

  const props = await fetch('http://127.0.0.1:' + proxy.port + '/props', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id_slot":0}',
  })
  check(await props.text() === PROPS, 'a non-generation JSON POST was not passed through')

  const missing = await fetch('http://127.0.0.1:' + proxy.port + '/nope')
  check(missing.status === 404, 'an upstream 404 was not forwarded as a 404')

  // --- switching the axis off, and opting into wording preferences -------------
  const off = await open({ script: 'off' })
  const untouched = await ask(off.port, 'case simplified')
  check(JSON.parse(await untouched.text()).choices[0].message.content === SIMPLIFIED,
    'script:off still converted the answer')

  const worded = await open({ wording: true })
  const preferred = await ask(worded.port, 'case simplified')
  const preferredBody = JSON.parse(await preferred.text())
  check(preferredBody.choices[0].message.content === CONVERTED_WORDING,
    'wording:true did not apply the preference table: ' + preferredBody.choices[0].message.content)

  // --- a dead upstream is a clear 502, not a hang ------------------------------
  const dead = http.createServer(() => {})
  await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve))
  const deadPort = dead.address().port
  await new Promise((resolve) => dead.close(resolve))
  const brokenProxy = await open({ upstream: 'http://127.0.0.1:' + deadPort })
  const broken = await ask(brokenProxy.port, 'case simplified')
  const brokenBody = await broken.text()
  check(broken.status === 502, 'a dead upstream did not answer 502: ' + broken.status)
  check(String(JSON.parse(brokenBody).error.type) === 'proxy_error', 'the 502 was not an OpenAI-shaped error')

  // --- the command line itself -------------------------------------------------
  const help = spawnSync(process.execPath, [PROXY_FILE, '--help'], { encoding: 'utf8' })
  check(help.status === 0 && String(help.stdout).includes('llm-guard-proxy'),
    '--help did not print the usage and exit 0')
  const bad = spawnSync(process.execPath, [PROXY_FILE, '--script', 'nonsense'], { encoding: 'utf8' })
  check(bad.status === 2 && String(bad.stderr).includes('must be traditional'),
    'an invalid --script did not exit 2 with a message: ' + bad.status + ' / ' + bad.stderr)
} catch (e) {
  problems.push('proxy selftest error: ' + String(e && e.stack || e))
} finally {
  for (const proxy of openProxies) await proxy.close().catch(() => {})
  await new Promise((resolve) => upstream.close(resolve))
}

console.log('\nllm proxy output guard       (' + checks + ' checks)')
console.log('  ' + (checks - problems.length) + '/' + checks +
  (problems.length ? '   wrong: ' + problems.join(' | ') : ''))
console.log(problems.length ? '\nFAIL: ' + problems.join('; ') : '\nPASS: the proxy rewrites what it should and only that')
process.exit(problems.length ? 1 : 0)
