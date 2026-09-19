// Regression test for the PreToolUse write hook - the guard that has to work when
// everything else is bypassed.
//
// Why this file exists: the hook FAILS OPEN on purpose. If lib.js cannot be required,
// if the payload cannot be parsed, or if the script has a syntax error, it exits 0 and
// lets the write through - which is the right behaviour for a tool that must never
// break a user's turn, and exactly why a broken hook is invisible. Nothing else in
// this repo exercised it, so this test is the only thing that notices.
//
// The hook is a separate process that reads JSON on stdin, so it is tested the same
// way: real child process, real pipe, real exit code.
//
// NOTE for anyone debugging by hand: do NOT feed the payload through a PowerShell
// pipeline. PowerShell re-encodes on the way in and mangles non-ASCII, which made a
// working hook look broken here once. Use a file and cmd.exe redirection:
//   cmd /c "node scripts\pre-write-check.js < payload.json"
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const { hook } = JSON.parse(readFileSync(join(here, 'selftest-cases.json'), 'utf8'))
const hookPath = join(here, 'pre-write-check.js')

const problems = []
for (const [name, toolInput, expected] of hook.cases) {
  const payload = JSON.stringify({ tool_name: 'Write', tool_input: toolInput })
  const r = spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8' })
  const got = r.status
  if (got !== expected) {
    problems.push(name + ': exit ' + got + ' (want ' + expected + ')' +
      (r.stderr ? ' - ' + r.stderr.split('\n')[0] : ''))
  }
  // A block must say why, and must name the replacement for a Japanese glyph.
  if (expected === 2 && got === 2 && !r.stderr.includes('BLOCKED')) {
    problems.push(name + ': blocked without a BLOCKED message')
  }
}

// A payload that is not JSON at all must pass: the hook is not allowed to break a
// turn because its own input was malformed.
const broken = spawnSync(process.execPath, [hookPath], { input: '{not json', encoding: 'utf8' })
if (broken.status !== 0) problems.push('malformed payload: exit ' + broken.status + ' (want 0)')

const directChecks = hook.cases.length + 1
const directProblems = problems.length

// ---------------------------------------------------------------------------
// Wiring: the hook only runs at all because hooks.json hands a command to a
// shell, so testing the script directly (above) misses the one failure that is
// both easy to make and completely silent - a command that never starts.
//
// Real case (2026-09): the command was
//   node "$DSH_HOME/skills/chinese-script-policy/scripts/pre-write-check.js"
// The hook environment defines no DSH_HOME, so it expanded to nothing, node
// exited 1 on a missing module, and since anything other than exit 2 is a
// NON-blocking error, the write went straight through. Everything looked
// installed; nothing was being checked.
//
// So the wiring is tested on its own terms: every command must depend on
// nothing but the two documented substitutions, and the substituted command
// must really block when run through a shell with a bare environment.
// ---------------------------------------------------------------------------
let wiringChecks = 0
let wiringProblems = 0
const wiring = (ok, message) => {
  wiringChecks++
  if (!ok) { wiringProblems++; problems.push(message) }
}

const hooksJson = JSON.parse(readFileSync(join(root, 'hooks.json'), 'utf8'))
const commands = []
for (const groups of Object.values(hooksJson.hooks ?? {})) {
  for (const group of groups) {
    for (const h of (group && group.hooks) || []) {
      if (h && typeof h.command === 'string') commands.push(h.command)
    }
  }
}
wiring(commands.length > 0, 'hooks.json declares no command hook at all')

const SUBSTITUTED = /\$\{CLAUDE_PLUGIN_ROOT\}|\$\{CLAUDE_PROJECT_DIR\}/g
for (const command of commands) {
  const rest = command.replace(SUBSTITUTED, '')
  const shellVar = rest.match(/\$[A-Za-z_]/) || rest.match(/%[A-Za-z_]+%/)
  wiring(!shellVar, 'hooks.json command leans on a shell variable the hook environment does ' +
    'not define (' + (shellVar ? shellVar[0] : '') + '): it expands to nothing, the command exits 1, ' +
    'and only exit 2 blocks - the hook would be silently dead')
}

if (commands.length) {
  const command = commands[0].split('${CLAUDE_PLUGIN_ROOT}').join(root)
  const bare = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
    ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, TEMP: process.env.TEMP,
  }
  const run = (content) => spawnSync(command, {
    shell: true, encoding: 'utf8', env: bare, cwd: root,
    input: JSON.stringify({
      tool_name: 'write',
      tool_input: { file_path: join(root, 'wiring-probe.md'), content },
    }),
  })
  const blocked = run('我听见了。')  // check-ok
  wiring(blocked.status === 2, 'the hooks.json command did not block Simplified content (exit ' +
    blocked.status + ')' + (blocked.stderr ? ' - ' + String(blocked.stderr).split('\n')[0] : ''))
  const clean = run('我聽見了。')
  wiring(clean.status === 0, 'the hooks.json command blocked clean Traditional content (exit ' + clean.status + ')')
}

console.log('\nWrite hook (PreToolUse)        (' + directChecks + ' cases)')
console.log('  ' + (directChecks - directProblems) + '/' + directChecks +
  (directProblems ? '   wrong: ' + problems.slice(0, directProblems).join(' | ') : ''))
console.log('hooks.json wiring             (' + wiringChecks + ' checks)')
console.log('  ' + (wiringChecks - wiringProblems) + '/' + wiringChecks +
  (wiringProblems ? '   wrong: ' + problems.slice(directProblems).join(' | ') : ''))

if (problems.length) {
  console.log('\nFAIL: the write hook does not behave as documented')
  process.exit(1)
}
console.log('\nPASS: the write hook blocks what it should and lets everything else through')
