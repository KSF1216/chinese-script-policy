// Regression test for the command line itself - the layer the other tests never reached.
//
// Why this file exists: selftest.js covers core.js and web-selftest.mjs covers the page,
// but the flags are wired in tradzh.js and nothing tested that. It shipped a real bug:
// convertToTraditional() did not forward the Japanese flag, so
// `--to-traditional --convert-japanese` was a silent no-op - the conversion ran, the
// glyph did not move, and every other test stayed green (the page passes its own
// arguments). These cases are the documented recipes, run as real child processes,
// exactly the way a user or an agent would run them.
//
// The text of each case lives in selftest-cases.json (`cli` section): that file is in
// .tradzhignore, so this file has no Simplified or Cantonese sample text in it.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, 'tradzh.js')
const { cli: cases } = JSON.parse(readFileSync(join(here, 'selftest-cases.json'), 'utf8'))

const problems = []
let ok = 0
for (const c of cases) {
  const r = spawnSync(process.execPath, [cli, ...c.args], { input: '', encoding: 'utf8' })
  const out = (r.stdout || '') + (r.stderr || '')
  const issues = []
  if (r.status !== c.exit) issues.push('exit ' + r.status + ' (want ' + c.exit + ')')
  if (c.has && !out.includes(c.has)) {
    issues.push('output lacks ' + JSON.stringify(c.has) + ', got ' + JSON.stringify(out.trim().slice(0, 120)))
  }
  if (c.lacks && out.includes(c.lacks)) issues.push('output should not contain ' + JSON.stringify(c.lacks))
  if (issues.length) problems.push(c.name + ': ' + issues.join('; '))
  else ok++
}

console.log('\nCLI recipes                    (' + cases.length + ' cases)')
console.log('  ' + ok + '/' + cases.length + (problems.length ? '   wrong: ' + problems.slice(0, 3).join(' | ') : ''))

if (problems.length) {
  console.log('\nFAIL: the documented CLI recipes do not behave as documented')
  process.exit(1)
}
console.log('\nPASS: every documented CLI recipe behaves as documented')
