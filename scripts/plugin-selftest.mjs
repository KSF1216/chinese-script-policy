// Regression test for the DSH plugin entry, run against the REAL skill registry
// (@deepseek-ai/dsh-skill) instead of a hand-written fake context.
//
// Why this exists: a fake context only checks the shape we assume. The real
// registry caught a bug a fake never would - a runtime skill without a `source`
// string still appears in the catalog, then throws when the model actually loads
// it ('loaded skill "..." source must be a string'). So this mounts the real
// registry, mounts our plugin, and then both lists and loads the skill.
//
// Usage: node scripts/plugin-selftest.mjs [path-to-node_modules-with-deepseek]
// Exits 0 when the registry serves the skill, or when DSH is not installed here
// (nothing to test). Exits 1 on a real contract failure.
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function findModulesRoot() {
  const explicit = process.argv[2]
  if (explicit) return explicit

  // Plain resolution first: works when this package sits inside a profile that
  // can already see the harness packages.
  try {
    return dirname(dirname(require.resolve('@deepseek-ai/dsh-skill/package.json')))
  } catch { /* keep probing */ }

  // npx cache: where `npx @deepseek-ai/dsh` unpacks itself.
  const npxRoot = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      const candidate = join(npxRoot, entry, 'node_modules')
      if (existsSync(join(candidate, '@deepseek-ai', 'dsh-skill', 'package.json'))) return candidate
    }
  }
  return null
}

const modulesRoot = findModulesRoot()
if (!modulesRoot) {
  console.log('SKIP: @deepseek-ai/dsh-skill not found (no DSH install to test against)')
  console.log('      pass the path explicitly: node scripts/plugin-selftest.mjs <node_modules>')
  process.exit(0)
}

const load = (p) => import(pathToFileURL(p).href)
const asPlugin = (mod) => {
  if (typeof mod === 'function') return mod
  if (typeof mod.apply === 'function') return mod
  if (mod.default && (typeof mod.default === 'function' || typeof mod.default.apply === 'function')) return mod.default
  throw new Error('not a cordis plugin: ' + Object.keys(mod).join(','))
}

const problems = []
try {
  const cordis = await load(join(modulesRoot, '@deepseek-ai', 'cordis', 'lib', 'index.js'))
  const registry = asPlugin(await load(join(modulesRoot, '@deepseek-ai', 'dsh-skill', 'lib', 'index.js')))
  const plugin = asPlugin(await load(join(here, '..', 'index.mjs')))
  const Context = cordis.Context ?? cordis.default?.Context ?? cordis.default

  console.log('registry modules :', modulesRoot)
  console.log('plugin name      :', plugin.name, '| inject:', JSON.stringify(plugin.inject))

  const ctx = new Context()
  ctx.plugin(registry)
  ctx.plugin(plugin)
  await new Promise((resolve) => setTimeout(resolve, 50))

  const catalog = await ctx.skills.list({ cwd: process.cwd() })
  console.log('catalog          :', catalog.length, 'entr(y/ies)')
  for (const s of catalog) console.log('  -', s.name, '| provider:', s.provider, '| source:', s.source)

  const found = catalog.find((s) => s.name === 'chinese-script-policy')
  if (!found) problems.push('the skill is not in the catalog')
  if (found && found.provider !== 'runtime') problems.push('expected provider "runtime", got "' + found.provider + '"')

  // The part that matters: loading it must not throw.
  let loaded = null
  try {
    loaded = await ctx.skills.get('chinese-script-policy', { cwd: process.cwd() })
  } catch (e) {
    problems.push('get() threw: ' + e.message)
  }
  if (!loaded) problems.push('get() returned nothing')
  else {
    console.log('loaded body      :', loaded.content.length, 'chars')
    console.log('resourceBase     :', JSON.stringify(loaded.resourceBase))
    if (!loaded.content.includes('繁體中文')) problems.push('loaded body does not look like this skill')
    if (loaded.content.includes('---\nname:')) problems.push('frontmatter was not stripped')
    if (loaded.resourceBase?.kind !== 'directory') problems.push('resourceBase is not a directory hint')
  }
} catch (e) {
  problems.push('harness error: ' + e.message)
}

// ---------------------------------------------------------------------------
// The write guard. The plugin owns it now: a DSH profile needs no
// hook bridge row, so this plugin is the only thing
// standing between the model and a bad write.
//
// Tested in two layers, because they fail differently:
//   - the pure decision (resolveSection / inspectWrite), driven directly;
//   - the mounted listener, driven through the REAL cordis waterfall, which is
//     how the harness calls it (ctx.waterfall(carrier, 'tools/pre-execute', …)).
// Plus one fake context for the settings wiring, which needs no harness.
// ---------------------------------------------------------------------------
let guardChecks = 0
let guardProblems = 0
const guard = (ok, message) => {
  guardChecks++
  if (!ok) {
    guardProblems++
    problems.push(message)
  }
}

try {
  const plugin = asPlugin(await load(join(here, '..', 'index.mjs')))
  const defaults = plugin.resolveSection(undefined)
  guard(JSON.stringify(defaults) === JSON.stringify({ enabled: true, mode: 'block', script: 'traditional', register: true, japanese: true, fileTypes: 'warn' }),
    'resolveSection defaults changed: ' + JSON.stringify(defaults))
  // fileTypes is its own three-way switch and defaults to warn: the rule acts on other
  // people's files, so blocking by default would look broken to someone who never asked.
  guard(plugin.resolveSection({ fileTypes: 'block' }).fileTypes === 'block', 'fileTypes:"block" was not kept')
  guard(plugin.resolveSection({ fileTypes: 'off' }).fileTypes === 'off', 'fileTypes:"off" was not kept')
  guard(plugin.resolveSection({ fileTypes: 'nonsense' }).fileTypes === 'warn',
    'an unknown fileTypes value did not fall back to warn')
  const off = plugin.resolveSection({ enabled: false, mode: 'warn', japanese: false })
  guard(off.enabled === false && off.mode === 'warn' && off.japanese === false && off.script === 'traditional',
    'resolveSection ignored an explicit override: ' + JSON.stringify(off))

  // The script axis is a three-way choice, and a section stored by an older build
  // spelled it as a boolean: true meant Traditional, false meant "do not check".
  guard(plugin.resolveSection({ script: 'simplified' }).script === 'simplified',
    'script:"simplified" was not kept')
  guard(plugin.resolveSection({ script: false }).script === 'off',
    'the legacy boolean false no longer maps to script:"off"')
  guard(plugin.resolveSection({ script: true }).script === 'traditional',
    'the legacy boolean true no longer maps to script:"traditional"')
  guard(plugin.resolveSection({ script: 'nonsense' }).script === 'traditional',
    'an unknown script value did not fall back to traditional')

  const simp = plugin.inspectWrite('write', { file_path: 'a.md', content: '我听见了。' }, defaults)  // check-ok
  guard(typeof simp === 'string' && simp.includes('BLOCKED'), 'a Simplified write was not refused')
  guard(plugin.inspectWrite('write', { file_path: 'a.md', content: '我聽見了。' }, defaults) === undefined,
    'a clean Traditional write was refused')
  guard(plugin.inspectWrite('read', { file_path: 'a.md', content: '我听见了。' }, defaults) === undefined,  // check-ok
    'a tool outside write|edit was guarded')
  guard(plugin.inspectWrite('write', { content: '我听见了。' }, { ...defaults, enabled: false }) === undefined,  // check-ok
    'enabled:false still refused a write')
  guard(plugin.inspectWrite('write', { content: '予定' }, { ...defaults, japanese: false }) === undefined,  // check-ok
    'the japanese axis was refused even though it was switched off')
  guard(plugin.inspectWrite('write', { content: '予定' }, defaults) !== undefined,  // check-ok
    'a Japanese-only word was not caught by the japanese axis')
  guard(plugin.inspectWrite('write', { file_path: join(here, 'japanese-only.json'), content: '我听见了。' }, defaults) === undefined,  // check-ok
    '.tradzhignore was not honoured')

  // script:"simplified" is the mirror image: Traditional-only glyphs are the fault,
  // Simplified content is fine, and the advice must say so.
  const mirrored = { ...defaults, script: 'simplified' }
  const trads = plugin.inspectWrite('write', { file_path: 'a.md', content: '這是繁體說明。' }, mirrored)
  guard(typeof trads === 'string' && trads.includes('BLOCKED') && trads.includes('Simplified'),
    'script:"simplified" did not refuse Traditional-only glyphs with Simplified advice: ' + String(trads).split('\n')[0])
  guard(plugin.inspectWrite('write', { file_path: 'a.md', content: '这是简体说明。' }, mirrored) === undefined,  // check-ok
    'script:"simplified" refused content that is already Simplified')
  // The Japanese arrow has to point at the stored script, not always at Traditional.
  const jpArrow = plugin.inspectWrite('write', { content: '予定' }, mirrored)  // check-ok
  guard(typeof jpArrow === 'string', 'a Japanese-only word was not caught with script:"simplified"')
  guard(plugin.inspectWrite('write', { content: '那个软件' }, { ...defaults, script: 'off' }) === undefined,  // check-ok
    'script:"off" still checked the script axis')
  guard(plugin.inspectWrite('write', { content: '这是简体。' }, { ...defaults, script: 'off' }) === undefined,  // check-ok
    'script:"off" refused Simplified content')

  // Windows file-type traps, as their own entry point. The write tools always emit UTF-8
  // without a BOM, so "a .ps1 with non-ASCII" IS the combination that fails to parse on
  // PowerShell 5.1 - and it is the only combination this criterion can fire on.
  const ps1Warn = plugin.inspectFileType('write', { file_path: 'x.ps1', content: '# 中文註解' }, defaults)
  guard(Boolean(ps1Warn) && ps1Warn.severity === 'warn' && ps1Warn.reason.includes('file type'),
    'a .ps1 with non-ASCII was not reported in the default (warn) mode: ' + JSON.stringify(ps1Warn))
  const ps1Block = plugin.inspectFileType('write', { file_path: 'x.ps1', content: '# 中文註解' },
    { ...defaults, fileTypes: 'block' })
  guard(Boolean(ps1Block) && ps1Block.severity === 'block',
    'fileTypes:"block" did not upgrade the .ps1 trap: ' + JSON.stringify(ps1Block))
  guard(plugin.inspectFileType('write', { file_path: 'x.ps1', content: '# pure ASCII' }, defaults) === undefined,
    'a pure-ASCII .ps1 was reported')
  guard(plugin.inspectFileType('write', { file_path: 'x.psm1', content: '# 中文' }, defaults) !== undefined,
    'a .psm1 with non-ASCII was not reported')
  guard(plugin.inspectFileType('write', { file_path: 'x.md', content: '# 中文' }, defaults) === undefined,
    'a non-script file type was reported')
  guard(plugin.inspectFileType('write', { file_path: 'x.cmd', content: 'echo 中文' },
    { ...defaults, fileTypes: 'block' }).severity === 'warn',
    'a batch file with non-ASCII was escalated to block (it still runs, so it must stay a warn)')
  guard(plugin.inspectFileType('write', { file_path: 'x.cmd', content: 'echo a\necho b' }, defaults) !== undefined,
    'a batch file with LF-only endings was not reported')
  guard(plugin.inspectFileType('write', { file_path: 'x.cmd', content: 'echo a\r\necho b' }, defaults) === undefined,
    'a batch file with CRLF endings was reported')
  guard(plugin.inspectFileType('write', { file_path: 'x.ps1', content: '# 中文' },
    { ...defaults, fileTypes: 'off' }) === undefined,
    'fileTypes:"off" still checked the file type')
  guard(plugin.inspectFileType('read', { file_path: 'x.ps1', content: '# 中文' }, defaults) === undefined,
    'a tool outside write|edit was file-type guarded')
  guard(plugin.inspectFileType('write', { content: '# 中文' }, defaults) === undefined,
    'a call with no path was file-type guarded')

  // The mounted listener, through real cordis: exactly how the harness calls it.
  // (cordis was loaded inside the first try block, so it is re-loaded here rather
  // than leaking a block-scoped binding.)
  const cordisModule = await load(join(modulesRoot, '@deepseek-ai', 'cordis', 'lib', 'index.js'))
  const Context2 = cordisModule.Context ?? cordisModule.default?.Context ?? cordisModule.default
  const ctx2 = new Context2()
  ctx2.plugin(asPlugin(await load(join(modulesRoot, '@deepseek-ai', 'dsh-skill', 'lib', 'index.js'))))
  ctx2.plugin(plugin)
  await new Promise((resolve) => setTimeout(resolve, 50))
  if (typeof ctx2.waterfall !== 'function') {
    console.log('guard waterfall : not available on this cordis build (listener test skipped)')
  } else {
    const allow = () => Promise.resolve({ kind: 'allow' })
    const denied = await ctx2.waterfall(null, 'tools/pre-execute',
      { name: 'write', arguments: { file_path: 'a.md', content: '我听见了。' } }, allow)  // check-ok
    guard(denied && denied.kind === 'deny' && String(denied.reason).includes('BLOCKED'),
      'the mounted listener did not deny a Simplified write: ' + JSON.stringify(denied))
    const passed = await ctx2.waterfall(null, 'tools/pre-execute',
      { name: 'write', arguments: { file_path: 'a.md', content: '我聽見了。' } }, allow)
    guard(passed && passed.kind === 'allow', 'the mounted listener did not allow a clean write')

    // The file-type trap through the same listener: the default is warn, so the write lands
    // (the model is told, the bytes still go through) - that is the whole point of the switch.
    const ps1Warned = await ctx2.waterfall(null, 'tools/pre-execute',
      { name: 'write', arguments: { file_path: 'x.ps1', content: '# 中文註解' } }, allow)
    guard(ps1Warned && ps1Warned.kind === 'allow',
      'the mounted listener blocked a .ps1 in the default warn mode: ' + JSON.stringify(ps1Warned))

    // ...and with the switch turned to block, the same call is refused.
    const ctx3 = new Context2()
    ctx3.plugin(asPlugin(await load(join(modulesRoot, '@deepseek-ai', 'dsh-skill', 'lib', 'index.js'))))
    ctx3.plugin(plugin, { fileTypes: 'block' })
    await new Promise((resolve) => setTimeout(resolve, 50))
    const ps1Denied = await ctx3.waterfall(null, 'tools/pre-execute',
      { name: 'write', arguments: { file_path: 'x.ps1', content: '# 中文註解' } }, allow)
    guard(ps1Denied && ps1Denied.kind === 'deny' && String(ps1Denied.reason).includes('file type'),
      'the mounted listener did not deny a .ps1 with fileTypes:"block": ' + JSON.stringify(ps1Denied))
  }

  // Settings wiring: the row config is the base layer, the card writes the user
  // layer, and the listener must read whichever is current.
  const captured = {}
  const fakeCtx = {
    skills: { register: () => () => {} },
    effect: (fn) => { fn(); return () => {} },
    inject: (names, cb) => cb({ settings: { installSection: (...args) => { captured.section = args } } }),
    on: (evt, fn) => { captured.listener = fn },
    logger: { warn: () => {} }
  }
  plugin.apply(fakeCtx, { mode: 'block' })
  guard(Array.isArray(captured.section) && captured.section[1] === plugin.SETTINGS_NAMESPACE,
    'the settings section was not installed under the expected namespace')
  guard(typeof captured.listener === 'function', 'no tools/pre-execute listener was registered')
  if (typeof captured.listener === 'function') {
    let nextCalls = 0
    const next = () => { nextCalls++; return Promise.resolve({ kind: 'allow' }) }
    const first = await captured.listener({ name: 'write', arguments: { content: '我听见了。' } }, next)  // check-ok
    guard(first && first.kind === 'deny' && nextCalls === 0, 'the listener did not deny before next()')
    // The settings card flips the switches: warn mode must let the write through.
    captured.section[4].setSource(() => plugin.resolveSection({ mode: 'warn' }))
    const warned = await captured.listener({ name: 'write', arguments: { content: '我听见了。' } }, next)  // check-ok
    guard(warned && warned.kind === 'allow' && nextCalls === 1, 'warn mode still denied the write')
    captured.section[4].setSource(() => plugin.resolveSection({ enabled: false }))
    await captured.listener({ name: 'write', arguments: { content: '我听见了。' } }, next)  // check-ok
    guard(nextCalls === 2, 'enabled:false did not let the write through')
  }
} catch (e) {
  problems.push('guard error: ' + e.message)
}

// ---------------------------------------------------------------------------
// Settings. The GUI card exists only for a namespace the HOST describes: the tab
// renders the intersection of "namespaces describe() serves" and "cards
// registered into settings.plugin.item". A schema that breaks describe()
// therefore removes the card silently - and takes every other card in the tab
// with it. That is exactly what happened once: the hand-rolled resolver had no
// toJSON(), so describe() threw "registration.schema.toJSON is not a function".
// So: mount the real settings service and its file provider (into a temp
// document, never the user's settings.yaml) and check the namespace is really
// described.
// ---------------------------------------------------------------------------
let settingsChecks = 0
let settingsProblems = 0
const setting = (ok, message) => {
  settingsChecks++
  if (!ok) {
    settingsProblems++
    problems.push(message)
  }
}

try {
  const asWrapped = (mod, fallback) => (typeof mod.apply === 'function'
    ? { name: mod.name ?? fallback, inject: mod.inject, apply: mod.apply }
    : mod.default)
  const cordis3 = await load(join(modulesRoot, '@deepseek-ai', 'cordis', 'lib', 'index.js'))
  const Context3 = cordis3.Context ?? cordis3.default?.Context ?? cordis3.default
  const pluginMod = asPlugin(await load(join(here, '..', 'index.mjs')))

  const ctx3 = new Context3()
  ctx3.plugin(asWrapped(await load(join(modulesRoot, '@deepseek-ai', 'dsh-settings', 'lib', 'index.js')), 'settings'))
  ctx3.plugin(asWrapped(await load(join(modulesRoot, '@deepseek-ai', 'dsh-settings-file', 'lib', 'index.js')), 'settings-file'),
    { path: join(tmpdir(), 'chinese-script-policy-selftest-settings.yaml') })
  // Our plugin injects 'skills'; a stub keeps this test off the skill registry.
  ctx3.reflect.provide('skills', { register: () => () => {} })
  await new Promise((r) => setTimeout(r, 80))
  const service = ctx3.get('settings')
  setting(service !== undefined, 'the settings service did not come up in the test harness')
  setting(typeof pluginMod.resolveSection.toJSON === 'function',
    'the settings resolver has no toJSON(), which is what makes describe() throw')

  ctx3.plugin(pluginMod, { enabled: true })
  await new Promise((r) => setTimeout(r, 250))

  if (service) {
    let described = null
    try {
      described = service.describe()
    } catch (e) {
      setting(false, 'describe() threw: ' + String(e.message).split('\n')[0])
    }
    if (described) {
      setting(described.some((d) => d.ns === pluginMod.SETTINGS_NAMESPACE),
        'our namespace is not in describe(): ' + JSON.stringify(described.map((d) => d.ns)))
    }
    try {
      service.describe({ redactSecrets: true })
    } catch (e) {
      setting(false, 'describe({redactSecrets:true}) threw: ' + String(e.message).split('\n')[0])
    }
    const value = service.get(pluginMod.SETTINGS_NAMESPACE)
    setting(Boolean(value) && value.enabled === true && value.mode === 'block',
      'the described section did not resolve to the row config: ' + JSON.stringify(value))
  }
} catch (e) {
  problems.push('settings error: ' + e.message)
}

// ---------------------------------------------------------------------------
// The browser half (lib/client.js): the settings card. Nothing else in this repo
// loads it - the page does - so a syntax error, a wrong module id or a wrong slot
// key would only show up as a card that never appears in the GUI (or, worse, as
// every client plugin in the page failing to load). It registers itself through
// window.__ModuleLoader__.load and hands back a factory, so this test plays the
// shell's part: a stand-in window captures the registration, a stand-in React
// renders the card once.
// ---------------------------------------------------------------------------
let cardChecks = 0
let cardProblems = 0
const card = (ok, message) => {
  cardChecks++
  if (!ok) {
    cardProblems++
    problems.push(message)
  }
}

try {
  const code = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')
  // The host concatenates every client half into ONE script, so this file must
  // register itself. The dynamic-runner shape (a bare async function body ending
  // in `return {...}`) has no wrapper there, and its top-level return is a
  // SyntaxError that killed the whole bundle - for every plugin, not just ours.
  card(code.includes('window.__ModuleLoader__.load('),
    'the browser half must register itself through window.__ModuleLoader__.load')
  card(!/^[ \t]*(?:import|export)[ \t{]/m.test(code), 'the browser half must not use ESM syntax')
  // React needs a Component base class for the card's error boundary (React has no hook
  // equivalent), and the fake renderer below needs a setState that works in one pass.
  class FakeComponent {
    constructor(props) {
      this.props = props || {};
      this.state = {};
    }
    setState(patch) {
      this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    }
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    Fragment: 'fragment',
    Component: FakeComponent,
  }
  const loadedModules = []
  // The hardening layers report through both ctx.logger and console.error; capture both, so
  // the test can assert that a failure is LOUD (a silent one is the failure mode being fixed).
  const reported = []
  const quietConsole = { ...console, error: (...args) => reported.push(args.map(String).join(' ')) }
  new Function('window', 'console', code)(
    { __ModuleLoader__: { load: (definition) => loadedModules.push(definition) } }, quietConsole)
  card(loadedModules.length === 1, 'the browser half registered ' + loadedModules.length + ' module(s), want 1')
  const definition = loadedModules[0]
  card(Boolean(definition) && definition.id === 'chinese-script-policy',
    'the module id must equal the loader row name, got ' + JSON.stringify(definition && definition.id))
  const browserPlugin = definition ? definition.factory((id) => (id === 'react' ? React : {})) : null
  card(browserPlugin && typeof browserPlugin.apply === 'function', 'the factory did not return a plugin')
  card(Array.isArray(browserPlugin && browserPlugin.inject) && browserPlugin.inject.includes('slots') &&
    browserPlugin.inject.includes('settingsScope'),
    'the browser half must inject slots and settingsScope: ' + JSON.stringify(browserPlugin && browserPlugin.inject))

  let registered = null
  // The card's header line is composed from the REAL dictionary (captured here from
  // ctx.locale.register) and the REAL stored settings, so the checks below exercise
  // the shipped strings rather than a stand-in.
  // ctx.locale.register() receives the WHOLE locale map ({ zh: {...}, en: {...} }), and
  // bind() resolves a key through the CURRENT locale - it is not one flat dictionary. The
  // first version of this stand-in got that wrong, so every lookup fell back to the key
  // name and these checks compared key names instead of the shipped strings.
  let dictionaries = {}
  let localeName = 'zh'
  const settingsSnapshot = { value: {}, writable: true }
  const clientCtx = {
    locale: {
      bind: () => (key) => {
        const table = dictionaries[localeName] || dictionaries.zh || {}
        return table[key] !== undefined ? table[key] : key
      },
      register: (ns, registered) => { dictionaries = registered; return () => {} },
    },
    effect: (fn) => { fn(); return () => {} },
    settingsScope: {
      bind: () => ({
        getSnapshot: () => settingsSnapshot,
        set: async () => {},
        unset: async () => {},
      }),
    },
    slots: {
      inject: (name, generator) => { for (const step of generator()) void step },
      register: (options, component) => { registered = { options, component }; return () => {} },
    },
  }
  browserPlugin.apply(clientCtx)
  card(registered !== null && registered.options.name === 'settings.plugin.item',
    'the card did not register into settings.plugin.item')
  card(registered !== null && registered.options.key === 'chinese-script-policy',
    'the card key is not the settings namespace: ' + JSON.stringify(registered && registered.options))

  // The card must behave like the shipped ones: an <li> whose header collapses the
  // body. The open flag starts as `false`, so the fake React's useState is nudged
  // for that one call to render the expanded state as well - the body only exists
  // while open, and a test that never opens the card would miss the whole form.
  const makeReact = (forceOpen) => ({
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (init) => [
      forceOpen && init === false ? true : (typeof init === 'function' ? init() : init),
      () => {},
    ],
    useEffect: () => {},
    Fragment: 'fragment',
    Component: FakeComponent,
  })
  // The header uses the host's chevron icon when the UI-primitives module resolves, and the
  // text glyph ▾ otherwise. Both paths are pinned here; see CARD/done/NEXT-primitives-require.md
  // for why the module really does resolve (it is a *virtual* module: the web frontend bundle
  // provides it, exactly like react - there is no directory for it under node_modules).
  const ICON_MARKER = 'chevron-icon-marker'
  const ICON = function IconChevronDownOutline14() {
    return { type: ICON_MARKER, props: {}, children: [] }
  }
  // A tiny renderer. createElement alone only builds inert nodes, so anything that has to
  // actually RUN - function components, class components, and the card's error boundary -
  // is invoked here. This is what makes the boundary testable without a browser: a throw
  // inside the card becomes a getDerivedStateFromError call, exactly like React does it.
  const render = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(render)
    if (typeof node.type === 'function') {
      // Real React moves children into props; the fake createElement keeps them apart, so a
      // component would see `props = null` and crash. Rebuild the shape React promises.
      const props = { ...(node.props || {}), children: node.children || [] }
      const isClass = node.type.prototype && typeof node.type.prototype.render === 'function'
      if (isClass) {
        const instance = new node.type(props)
        instance.props = props
        try {
          return render(instance.render())
        } catch (error) {
          if (typeof node.type.getDerivedStateFromError === 'function') {
            instance.state = { ...instance.state, ...node.type.getDerivedStateFromError(error) }
            // React calls componentDidCatch AFTER re-rendering; side effects (logging) live
            // there, not in the static getDerivedStateFromError. Model both, or the card's
            // "report the crash" path would never run in this test.
            if (typeof instance.componentDidCatch === 'function') {
              try { instance.componentDidCatch(error, { componentStack: '' }) } catch { /* logging must not mask the crash */ }
            }
            return render(instance.render())
          }
          throw error
        }
      }
      return render(node.type(props))
    }
    return { type: node.type, props: node.props, children: (node.children || []).map(render) }
  }
  const renderCard = (forceOpen, settings, opts) => {
    settingsSnapshot.value = settings || {}
    const wantIcon = Boolean(opts && opts.withIcon)
    const broken = Boolean(opts && opts.brokenSnapshot)
    const captures = []
    const ctx = {
      ...clientCtx,
      settingsScope: {
        bind: () => ({
          getSnapshot: () => {
            if (broken) throw new Error('settings store unavailable')
            return settingsSnapshot
          },
          set: async () => {},
          unset: async () => {},
        }),
      },
      slots: { ...clientCtx.slots, register: (options, component) => { captures.push(component); return () => {} } },
      logger: { warn: (line) => reported.push(String(line)) },
    }
    const mod = definition.factory((id) => {
      if (id === 'react') return makeReact(forceOpen)
      if (wantIcon && id === '@deepseek-ai/dsh-client-ui-primitives') return { IconChevronDownOutline14: ICON }
      return {}
    })
    mod.apply(ctx)
    const tree = render(captures[0]())
    // The fake createElement always collects children into an array (React keeps a single
    // positional child as-is), so the boundary's passthrough comes back as [element].
    return Array.isArray(tree) && tree.length === 1 ? tree[0] : tree
  }

  // The fake createElement takes children verbatim, so a single array child stays
  // nested (real React flattens it). Walk the tree instead of indexing.
  const flatten = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(flatten)
    const kids = Array.isArray(node.children) ? node.children.flatMap(flatten) : []
    return [node, ...kids]
  }
  const collapsed = renderCard(false)
  card(Boolean(collapsed) && collapsed.type === 'li', 'the card root must be an <li> like the shipped cards')
  const header = flatten(collapsed).find((node) => node.type === 'button')
  card(Boolean(header) && header.props['aria-expanded'] === false, 'the header must start collapsed (aria-expanded=false)')
  // The header line is the ONLY text visible while the card is collapsed, so it has to
  // describe what is actually being checked. It used to be one frozen string that named
  // Simplified-only glyphs even after the script axis was switched to Simplified, which
  // contradicted the radio label right below it in the same card. The old check here
  // ("includes description") also passed on the props key alone, so it proved nothing.
  const descriptionOf = (tree) => {
    const node = flatten(tree).find((n) => n && n.props && n.props.key === 'description')
    return node ? node.children.join('') : ''
  }
  const zh = dictionaries.zh
  const en = dictionaries.en
  card(Boolean(zh) && Boolean(en), 'the browser half registered no dictionaries')
  const titleOf = (tree) => {
    const node = flatten(tree).find((n) => n && n.props && n.props.key === 'name')
    return node ? node.children.join('') : ''
  }
  card(titleOf(collapsed) === zh.title,
    'the collapsed header must show the title, got ' + JSON.stringify(titleOf(collapsed)))
  card(descriptionOf(collapsed) === zh.descPrefix + zh.partScriptTraditional +
    zh.descSeparator + zh.partRegister + zh.descSeparator + zh.partJapanese +
    zh.descSeparator + zh.partFileTypes + zh.descSuffix,
    'the collapsed header must describe the default checks, got ' + JSON.stringify(descriptionOf(collapsed)))
  const asSimplified = descriptionOf(renderCard(false, { script: 'simplified' }))
  card(asSimplified.includes(zh.partScriptSimplified) && !asSimplified.includes(zh.partScriptTraditional),
    'switching the script axis to Simplified must change the header line, got ' + JSON.stringify(asSimplified))
  const asScriptOff = descriptionOf(renderCard(false, { script: 'off' }))
  card(asScriptOff === zh.descPrefix + zh.partRegister + zh.descSeparator + zh.partJapanese +
    zh.descSeparator + zh.partFileTypes + zh.descScriptSkipped + zh.descSuffix,
    'the header line must drop the script axis and say so, got ' + JSON.stringify(asScriptOff))
  // "Nothing is being checked" needs every axis off, the file-type check included:
  // the card must not claim to check nothing while the file-type check is still on.
  const asNothing = descriptionOf(renderCard(false, { script: 'off', register: false, japanese: false, fileTypes: 'off' }))
  card(asNothing === zh.descNone,
    'the header line must say nothing is being checked, got ' + JSON.stringify(asNothing))
  const asGlyphsOff = descriptionOf(renderCard(false, { script: 'off', register: false, japanese: false }))
  card(asGlyphsOff === zh.descPrefix + zh.partFileTypes + zh.descScriptSkipped + zh.descSuffix,
    'the file-type check must still show on the header line when the glyph axes are off, got ' + JSON.stringify(asGlyphsOff))
  const asDisabled = descriptionOf(renderCard(false, { enabled: false }))
  card(asDisabled === zh.enabledOff,
    'the header line must say the guard is off, got ' + JSON.stringify(asDisabled))
  // The same line in the other locale: the parts AND the separator come from that
  // locale's dictionary, so an English user does not get a Chinese list joined by the
  // Chinese separator.
  localeName = 'en'
  const asEnglish = descriptionOf(renderCard(false))
  localeName = 'zh'
  card(asEnglish === en.descPrefix + en.partScriptTraditional + en.descSeparator +
    en.partRegister + en.descSeparator + en.partJapanese + en.descSeparator +
    en.partFileTypes + en.descSuffix,
    'the English header line is wrong, got ' + JSON.stringify(asEnglish))
  card(Object.keys(zh).every((key) => en[key] !== undefined),
    'the English dictionary is missing: ' + Object.keys(zh).filter((key) => en[key] === undefined).join(', '))
  card(!JSON.stringify(collapsed).includes('chinese-script-policy-mode'),
    'the collapsed card must not render the form')

  const expanded = renderCard(true)
  const tree = JSON.stringify(expanded)
  card(tree.includes('chinese-script-policy-mode'), 'the expanded card did not render the block/warn switch')
  card(tree.includes('chinese-script-policy-script') && tree.includes('"scriptSimplified"'),
    'the expanded card did not render the three-way script choice')
  card(tree.includes('"register"') && tree.includes('"japanese"'), 'the expanded card did not render the other axes')
  // The file-type switch must be reachable in the UI, not only honoured by the guard:
  // a setting nobody can turn off (or on) is not a setting.
  card(tree.includes('chinese-script-policy-fileTypes') &&
    tree.includes('"fileTypesOff"') && tree.includes('"fileTypesWarn"') && tree.includes('"fileTypesBlock"'),
    'the expanded card did not render the three-way file-type choice')
  card(descriptionOf(renderCard(false, { fileTypes: 'block' })).includes(zh.partFileTypes) &&
    descriptionOf(renderCard(false, { fileTypes: 'off' })).includes(zh.partFileTypes) === false,
    'the file-type part on the header line must follow the fileTypes setting')
  card(tree.includes('"name":"chinese-script-policy-mode"') || tree.includes('"chinese-script-policy-mode"'),
    'the mode radios are not grouped under the namespace')
  // Last on purpose: the icon is remembered in a module-level variable, so once a render sees
  // the primitives module every later render keeps the icon. (That is the shipped behaviour.)
  card(!flatten(collapsed).some((node) => node.type === ICON) && JSON.stringify(collapsed).includes('\u25be'),
    'without the UI primitives module the header must fall back to the text glyph')
  card(flatten(renderCard(false, {}, { withIcon: true })).some((node) => node.type === ICON_MARKER),
    'when the host provides the UI primitives module the header must render its chevron icon')

  // The two hardening layers. Without them a broken host service costs the user the card -
  // or, for an apply() throw, more than that - with nothing on screen explaining it.
  const escaped = (() => {
    let threw = null
    const ctx = {
      ...clientCtx,
      locale: { bind: () => { throw new Error('locale service missing') }, register: () => () => {} },
      logger: { warn: (line) => reported.push(String(line)) },
    }
    try {
      browserPlugin.apply(ctx)
    } catch (error) {
      threw = error
    }
    return threw
  })()
  card(escaped === null,
    'apply() must not let a broken host service escape (it would travel up the plugin tree): ' +
    (escaped && escaped.message))
  card(reported.some((line) => line.includes('not mounted')),
    'a card that never mounted must say so out loud (ctx.logger or console), not fail silently')
  const crashed = renderCard(false, {}, { brokenSnapshot: true })
  card(JSON.stringify(crashed).includes(zh.crashTitle),
    'a card that throws while rendering must show why, in its own place (boundary), not go blank')
  card(JSON.stringify(crashed).includes('settings store unavailable'),
    'the boundary must print the underlying error message')
  card(reported.some((line) => line.includes('crashed while rendering')),
    'the boundary must also report the crash to the log')
} catch (e) {
  problems.push('browser half error: ' + e.message)
}

console.log('\nplugin write guard            (' + guardChecks + ' checks)')
console.log('  ' + (guardChecks - guardProblems) + '/' + guardChecks +
  (guardProblems ? '   wrong: ' + problems.slice(0, guardProblems).join(' | ') : ''))
console.log('browser settings card         (' + cardChecks + ' checks)')
console.log('  ' + (cardChecks - cardProblems) + '/' + cardChecks +
  (cardProblems ? '   wrong: ' + problems.slice(0, cardProblems).join(' | ') : ''))
console.log('settings section described    (' + settingsChecks + ' checks)')
console.log('  ' + (settingsChecks - settingsProblems) + '/' + settingsChecks +
  (settingsProblems ? '   wrong: ' + problems.slice(0, settingsProblems).join(' | ') : ''))

console.log(problems.length ? '\nFAIL: ' + problems.join('; ') : '\nPASS: the real registry lists and loads this skill')
process.exit(problems.length ? 1 : 0)
