// DSH plugin entry for the chinese-script-policy skill.
//
// This file is the ONLY DSH-specific code in the package. Everything else
// (SKILL.md, scripts/, the data tables, hooks.json) is harness-neutral, which is
// why the package name carries no `dsh-` prefix and why there is no second,
// "generic" package to keep in sync.
//
// Installed as a bundle (`dsh plugin --profile <name> add <package>`), a profile
// gets the skill without copying anything into $DSH_HOME/skills: this module
// registers it through the @deepseek-ai/dsh-skill registry, the documented
// "embedded skills" path. The same directory also works as a plain local skill
// (copy or clone it to $DSH_HOME/skills/chinese-script-policy, or to another
// harness's skill root) — one tree, several install routes, so they cannot drift
// apart.
//
// It also owns the write guard: one `tools/pre-execute` listener that refuses a
// write whose content fails the policy, using the SAME decision function as the
// CLI hook (lib.guardInspect). A DSH profile therefore needs no second
// dependency — no second plugin — to get write-time blocking;
// hooks.json stays for harnesses that speak the Claude Code hook protocol.
//
// The guard reads its switches from the plugin's OWN configuration, declared
// below as a schemastery `Config` whose fields are all `.volatile()`. That is
// the DSH 0.1.7 contract for a plugin that can be edited while it runs:
//
//   * the fields are what the Plugins page offers for this entry (the settings
//     namespace IS the profile entry id), and a write lands in the active
//     profile's `cordis.patch.yml`;
//   * a volatile-only change does NOT remount the plugin: the loader writes the
//     new value into the SAME reference objects and emits
//     `loader/volatile-update`. So every read goes through `field.get()` at the
//     moment of use - caching a value during apply() would freeze the switch.
//
// The 0.1.6 API (`ctx.settings.installSection(...)` plus a hand-rolled
// descriptor carrying toJSON()/type/dict) no longer exists and has no shim: the
// schema IS the declaration now. That is why this file imports schemastery -
// package.json declares it as a peerDependency, which is what lets a *linked*
// bundle resolve the harness's own copy instead of shipping a second one.
//
// SKILL.md stays the single source of truth for name/description/whenToUse; the
// frontmatter is parsed here rather than duplicated as constants. The body is
// passed through with the frontmatter stripped, which is what the filesystem
// provider hands the model too.
//
// ESM on purpose, and index.mjs rather than index.js: the skill's own scripts
// (lib.js, tradzh.js, pre-write-check.js) are CommonJS, so package.json must NOT
// declare "type": "module" or they stop loading.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

export const name = 'chinese-script-policy'
export const inject = ['skills']

const here = dirname(fileURLToPath(import.meta.url))
// scripts/ is CommonJS, so the plugin reaches it through createRequire rather
// than an import statement.
const require = createRequire(import.meta.url)
const lib = require('./scripts/lib.js')

/**
 * The settings namespace, which in DSH 0.1.7 IS the profile entry id: the form
 * for this plugin is addressed by the id its loader row declares, so this string
 * has to stay equal to `id:` in cordis.patch.yml. A row without an `id` gets a
 * random one from the loader, and no form can ever address it.
 */
export const SETTINGS_NAMESPACE = 'chinese-script-policy'
/** Tools whose content the guard inspects. */
export const GUARDED_TOOLS = ['write', 'edit']
// Field names a tool call may use for the text being written and for its path.
// Kept in step with scripts/pre-write-check.js, which faces the same ambiguity.
const CONTENT_FIELDS = ['content', 'new_string', 'newText', 'new_str', 'text', 'value']
const PATH_FIELDS = ['file_path', 'path', 'file']

/**
 * The plugin's declared configuration (DSH 0.1.7). Every field is `.volatile()`,
 * which is what puts it on the Plugins page and what makes a change land in the
 * running reference objects instead of remounting the plugin.
 *
 * `script` keeps the old boolean spelling in its union on purpose: versions
 * 1.0-1.1 stored `true` (= traditional) and `false` (= off) in a settings
 * section, and a profile patch written back then has to keep loading - a schema
 * that rejects it would take the guard down, silently, at boot.
 */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  mode: z.union(['block', 'warn']).default('block').volatile(),
  script: z.union(['traditional', 'simplified', 'off', z.boolean()]).default('traditional').volatile(),
  register: z.boolean().default(true).volatile(),
  japanese: z.boolean().default(true).volatile(),
  fileTypes: z.union(['off', 'warn', 'block']).default('warn').volatile()
})

/**
 * Read one declared field, whichever shape it arrives in.
 *
 * With `Config` declared, `apply()` receives a resolved section whose volatile
 * fields are `{ get() }` references - so a switch flipped in the GUI is visible
 * on the very next read - while the pure tests (and any caller holding only raw
 * YAML) pass plain values. Both are real, so both are read here.
 *
 * @param {Record<string, unknown>} raw - resolved section or plain object.
 * @param {string} key - field name.
 * @returns {unknown} the current value, or undefined when the field is unset.
 */
function readSwitch(raw, key) {
  const value = raw[key]
  if (value && typeof value === 'object' && typeof value.get === 'function') return value.get()
  return value
}

/**
 * Resolve the switches into the plain shape the guard works with.
 *
 * The defaults here mirror `Config` exactly, and `resolveSection` is what the
 * tests drive directly, so it must keep working with a plain object and with
 * nothing at all.
 *
 * @param {unknown} value - resolved section, plain layers, or undefined.
 * @returns {{enabled: boolean, mode: 'block'|'warn', script: 'traditional'|'simplified'|'off', register: boolean, japanese: boolean, fileTypes: 'off'|'warn'|'block'}}
 */
export function resolveSection(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const mode = readSwitch(raw, 'mode')
  const script = readSwitch(raw, 'script')
  const fileTypes = readSwitch(raw, 'fileTypes')
  return {
    enabled: readSwitch(raw, 'enabled') !== false,
    // Which script this project stores. Three states, not a checkbox:
    // 'traditional' (default) flags Simplified-only glyphs, 'simplified' flags
    // Traditional-only glyphs, 'off' skips the axis. `false` is the old spelling
    // of 'off' and `true` of 'traditional', so a section stored by an older
    // version keeps meaning what it meant.
    mode: mode === 'warn' ? 'warn' : 'block',
    script: script === 'simplified' ? 'simplified'
      : (script === 'off' || script === false) ? 'off'
        : 'traditional',
    register: readSwitch(raw, 'register') !== false,
    japanese: readSwitch(raw, 'japanese') !== false,
    // The Windows file-type traps (lib.fileTypeTrap). It owns a switch of its own, and it
    // defaults to WARN rather than block on purpose: this rule acts on other people's files,
    // and blocking by default would look broken to someone who never asked for it.
    // 'off' | 'warn' (default) | 'block'.
    fileTypes: fileTypes === 'off' ? 'off' : (fileTypes === 'block' ? 'block' : 'warn')
  }
}

function pickField(obj, names) {
  if (!obj || typeof obj !== 'object') return null
  for (const n of names) {
    if (typeof obj[n] === 'string' && obj[n].length) return { name: n, value: obj[n] }
  }
  return null
}

/**
 * Decide one tool call. Pure, so the selftest can drive it without a harness.
 * @param {string} toolName - the tool being called.
 * @param {Record<string, unknown>} args - that call's arguments.
 * @param {ReturnType<typeof resolveSection>} settings - resolved switches.
 * @returns {string|undefined} the reason to show the model, or undefined to allow.
 */
export function inspectWrite(toolName, args, settings) {
  if (!settings.enabled) return undefined
  if (!GUARDED_TOOLS.includes(toolName)) return undefined
  const pathHit = pickField(args, PATH_FIELDS)
  const contentHit = pickField(args, CONTENT_FIELDS)
  if (!contentHit) return undefined
  const found = lib.guardInspect(contentHit.value, {
    target: pathHit ? pathHit.value : '',
    scriptTarget: settings.script === 'simplified' ? 'simplified' : 'traditional',
    axes: {
      script: settings.script !== 'off',
      register: settings.register,
      japanese: settings.japanese
    }
  })
  return found ? found.reason : undefined
}

/**
 * The file-type traps, as their own entry point.
 *
 * Kept separate from inspectWrite on purpose: that function answers "is the Chinese right",
 * this one answers "will this file type even parse". They own different switches, this one
 * defaults to warn, and both live here so the plugin and the CLI cannot drift apart.
 *
 * @returns {{reason: string, severity: 'block'|'warn'}|undefined}
 */
export function inspectFileType(toolName, args, settings) {
  if (!settings.enabled || settings.fileTypes === 'off') return undefined
  if (!GUARDED_TOOLS.includes(toolName)) return undefined
  const pathHit = pickField(args, PATH_FIELDS)
  const contentHit = pickField(args, CONTENT_FIELDS)
  if (!pathHit || !contentHit) return undefined
  const trap = lib.fileTypeTrap(pathHit.value, contentHit.value)
  if (!trap) return undefined
  // 'block' asks for the trap's own severity ('block' for the .ps1 case, 'warn' for the
  // batch-file cases); the default 'warn' downgrades everything, which is what a rule acting
  // on other people's files should do.
  return { reason: trap.reason, severity: settings.fileTypes === 'block' ? trap.severity : 'warn' }
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(text)
  if (!match) return { data: {}, body: text }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line)
    if (!kv) continue
    let value = kv[2].trim()
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    data[kv[1]] = value
  }
  return { data, body: text.slice(match[0].length) }
}

function registerSkill(ctx) {
  const { data, body } = parseFrontmatter(readFileSync(join(here, 'SKILL.md'), 'utf8'))
  if (!data.name || !data.description) {
    throw new Error('chinese-script-policy: SKILL.md frontmatter is missing name or description')
  }
  const skill = {
    name: data.name,
    description: data.description,
    ...(data.whenToUse ? { whenToUse: data.whenToUse } : {}),
    content: body,
    // `source` is NOT optional, even though the registry's own docs only mention
    // that it fills in the invocation policy and the provider label. A runtime
    // registration without it still shows up in the catalog (runtime entries skip
    // candidate validation) but throws the moment the skill is actually loaded:
    // 'loaded skill "..." source must be a string'. Found by scripts/plugin-selftest.mjs.
    source: 'embedded',
    // Gives the model the base directory for the relative paths the body mentions
    // (scripts/tradzh.js and friends) exactly as the filesystem provider would.
    resourceBase: { kind: 'directory', path: here }
  }
  const register = () => ctx.skills.register(skill)
  // register() returns a Cordis effect disposer; tying it to our fiber keeps
  // teardown order intact. Fall back to a direct call if effect() is unavailable.
  if (typeof ctx.effect === 'function') ctx.effect(register, 'chinese-script-policy skill registration')
  else register()
}

export function apply(ctx, config) {
  registerSkill(ctx)

  // The switches live in this module's own `Config`, so there is no section to
  // install any more. What remains is the companion policy a plugin with its own
  // page declares: "do not synthesize a form for me".
  //
  // It is OPTIONAL and deliberately rides a child context: `settings` may not be
  // composed at all (a bare headless profile), and a service named in the
  // module-level `inject` that is missing would park this whole plugin - guard,
  // skill registration and all - which is exactly the failure this port is
  // fixing. So: never add 'settings' to `inject`.
  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['settings'], (settingsCtx) => {
        const settings = settingsCtx.settings
        if (!settings || typeof settings.configure !== 'function') return
        const configure = () => settings.configure({ auto: false }, ctx.fiber)
        if (typeof settingsCtx.effect === 'function') {
          settingsCtx.effect(configure, 'chinese-script-policy: settings policy')
        } else {
          configure()
        }
      })
    } catch { /* a settings policy is a convenience; the guard must not depend on it */ }
  }

  if (typeof ctx.on !== 'function') return
  ctx.on('tools/pre-execute', async (exec, next) => {
    // Read on EVERY call, never cached during apply: a volatile field is a live
    // reference the loader writes into, so this is what makes a switch flipped in
    // the GUI take effect without remounting the plugin.
    const settings = resolveSection(config)
    let hit
    try {
      const name = exec && exec.name
      const args = (exec && exec.arguments) || {}
      // The file-type trap is asked FIRST: a .ps1 written with non-ASCII will not parse on
      // Windows PowerShell 5.1 whatever the script axis thinks, and it carries its own
      // severity (warn by default - it acts on other people's files).
      hit = inspectFileType(name, args, settings)
      if (!hit) {
        const reason = inspectWrite(name, args, settings)
        if (reason) hit = { reason, severity: settings.mode === 'warn' ? 'warn' : 'block' }
      }
    } catch {
      hit = undefined // fail open: a broken guard must never break a turn
    }
    if (!hit) return next()
    if (hit.severity === 'warn') {
      // Warn exists for a project that is still migrating, and for traps that mostly still
      // work: the model is told, the bytes still land.
      if (ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('chinese-script-policy: ' + hit.reason.split('\n')[0])
      }
      return next()
    }
    return { kind: 'deny', reason: hit.reason }
  })
}
