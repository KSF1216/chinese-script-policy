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
// The guard reads its switches from a settings section, so a settings card can
// turn it off, warn instead of block, or drop one axis, without editing YAML.
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

export const name = 'chinese-script-policy'
export const inject = ['skills']

const here = dirname(fileURLToPath(import.meta.url))
// scripts/ is CommonJS, so the plugin reaches it through createRequire rather
// than an import statement.
const require = createRequire(import.meta.url)
const lib = require('./scripts/lib.js')

/** Settings namespace holding this plugin's switches. */
export const SETTINGS_NAMESPACE = 'chinese-script-policy'
/** Tools whose content the guard inspects. */
export const GUARDED_TOOLS = ['write', 'edit']
// Field names a tool call may use for the text being written and for its path.
// Kept in step with scripts/pre-write-check.js, which faces the same ambiguity.
const CONTENT_FIELDS = ['content', 'new_string', 'newText', 'new_str', 'text', 'value']
const PATH_FIELDS = ['file_path', 'path', 'file']

/**
 * Resolve the settings section: the plugin row's `config` is the base layer, a
 * settings card writes the user layer on top, and these are the defaults.
 *
 * Hand-rolled instead of a schemastery schema on purpose: this package has no
 * dependencies (it must install anywhere, and its tests run without
 * `npm install`), and the settings core only CALLS the schema with the merged
 * layers while REGISTERING a namespace.
 *
 * Describing is a different matter, and the first version of this file learned
 * that the hard way: the GUI's card list is built from the host's
 * `settings.describe()`, which needs `schema.toJSON()`, and redaction walks the
 * schema's own `type`/`dict`. Without them describe() throws
 * "registration.schema.toJSON is not a function" - taking EVERY card in the
 * Plugin configuration tab down with it, not just ours. So the resolver carries
 * the same descriptor a schemastery schema would produce for these five fields.
 *
 * @param {unknown} value - merged raw layers.
 * @returns {{enabled: boolean, mode: 'block'|'warn', script: 'traditional'|'simplified'|'off', register: boolean, japanese: boolean}}
 */
export function resolveSection(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    enabled: raw.enabled !== false,
    mode: raw.mode === 'warn' ? 'warn' : 'block',
    // Which script this project stores. Three states, not a checkbox:
    // 'traditional' (default) flags Simplified-only glyphs, 'simplified' flags
    // Traditional-only glyphs, 'off' skips the axis. `false` is the old spelling of
    // 'off' and `true` of 'traditional', so a section stored by an older version
    // keeps meaning what it meant.
    script: raw.script === 'simplified' ? 'simplified'
      : (raw.script === 'off' || raw.script === false) ? 'off'
        : 'traditional',
    register: raw.register !== false,
    japanese: raw.japanese !== false
  }
}

/** Field descriptors: the shape schemastery's toJSON() would emit for this section. */
export const SECTION_FIELDS = {
  enabled: { type: 'boolean' },
  mode: { type: 'string' },
  script: { type: 'string' },
  register: { type: 'boolean' },
  japanese: { type: 'boolean' }
}

resolveSection.type = 'object'
resolveSection.dict = SECTION_FIELDS
resolveSection.toJSON = () => ({ type: 'object', dict: { ...SECTION_FIELDS } })

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

  // Switches: the row config is the base layer, the settings card writes the user
  // layer. When the settings service is absent the row config still applies.
  let current = () => resolveSection(config)
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, resolveSection, config, {
        setSource: (source) => { current = source },
        onChange: () => {}
      })
    })
  }

  if (typeof ctx.on !== 'function') return
  ctx.on('tools/pre-execute', async (exec, next) => {
    const settings = current()
    let reason
    try {
      reason = inspectWrite(exec && exec.name, (exec && exec.arguments) || {}, settings)
    } catch {
      reason = undefined // fail open: a broken guard must never break a turn
    }
    if (!reason) return next()
    if (settings.mode === 'warn') {
      // Warn mode exists for a project that is still migrating: the model is told,
      // the bytes still land.
      if (ctx.logger && typeof ctx.logger.warn === 'function') {
        ctx.logger.warn('chinese-script-policy: ' + reason.split('\n')[0])
      }
      return next()
    }
    return { kind: 'deny', reason }
  })
}
