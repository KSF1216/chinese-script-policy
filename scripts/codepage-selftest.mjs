// Regression test for the codepage repertoire table (scripts/codepage-repertoire.json),
// the file build-codepage.ps1 generates with .NET.
//
// Why this exists: that table is the entire basis of the console-hazard axis, and it is the
// kind of artifact that fails SILENTLY. .NET's default encoder fallback replaces a character
// it cannot encode with '?' instead of throwing, so a generator that forgets
// ExceptionFallback produces a table claiming everything is printable - every check then
// passes and the axis becomes useless while looking healthy.
//
// The counts below were measured INDEPENDENTLY for references/console-encoding-hazard.md by
// enumerating code points and encoding each one. The generator works the other way round
// (enumerate byte sequences, decode them), so agreeing is real evidence and not a tautology.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const table = JSON.parse(readFileSync(join(here, 'codepage-repertoire.json'), 'utf8'))
const cp950 = new Set([...table.repertoires['950']])

let checks = 0
const problems = []
const check = (ok, message) => {
  checks++
  if (!ok) problems.push(message)
}
const cp = (c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')

// Measured 2026-09-18 with ExceptionFallback on both the encoder and the decoder.
const ranges = [
  ['CJK unified 4E00-9FFF', 0x4E00, 0x9FFF, 7924],
  ['CJK ext A 3400-4DBF', 0x3400, 0x4DBF, 6592],
  ['compat ideographs F900-FAFF', 0xF900, 0xFAFF, 510],
  ['punct/kana 3000-30FF', 0x3000, 0x30FF, 228],
  ['fullwidth FF00-FFEF', 0xFF00, 0xFFEF, 148],
]
for (const [name, lo, hi, want] of ranges) {
  let got = 0
  for (let c = lo; c <= hi; c++) {
    if (!cp950.has(String.fromCodePoint(c))) got++
  }
  check(got === want, 'cp950 ' + name + ': expected ' + want + ' unencodable, got ' + got)
}

// Totals, so a change ANYWHERE in the table is caught - not just inside the ranges above.
// These counts are printed by build-codepage.ps1 when it runs.
// Added after a deliberate check: removing 100 characters from OUTSIDE the five ranges left
// this file green, i.e. the first version of this test could not catch the very failure it
// was written for. Pinning the totals closes that hole.
const totals = { 950: 19712, 936: 23942, 932: 9274, 1252: 128, 20936: 7485 }
for (const [codePage, want] of Object.entries(totals)) {
  const got = [...((table.repertoires || {})[codePage] || '')].length
  check(got === want, 'codepage ' + codePage + ': expected ' + want + ' encodable characters, got ' + got)
}

// The naming trap: Windows calls codepage 936 "gb2312", but 936 is GBK and encodes every
// common Traditional character. The STRICT GB2312-80 repertoire is 20936. Both directions
// are pinned here, because "we support gb2312" only means something once you know which of
// the two you are talking about - and they fail on opposite kinds of text.
const gbk = new Set([...((table.repertoires || {})['936'] || '')])
const gb2312 = new Set([...((table.repertoires || {})['20936'] || '')])
for (const c of ['\u9AD4', '\u8EDF', '\u6DE8', '\u9EB5', '\u88E1']) {
  check(gbk.has(c), 'cp936 (GBK) should encode ' + cp(c))
  check(!gb2312.has(c), 'cp20936 (strict GB2312) should NOT encode ' + cp(c))
}
check(gb2312.size > 0 && gb2312.size < gbk.size,
  'strict GB2312 must be a smaller repertoire than GBK (' + gb2312.size + ' vs ' + gbk.size + ')')

// Spot checks in escapes on purpose: the source of THIS file stays plain ASCII, so the
// repo-wide checker never has to look at Simplified glyphs here.
const unencodable = ['\u952E', '\u8BF7', '\u2705', '\u4E28', '\u5F3A', '\u5173', '\u95ED']
const encodable = ['\u9375', '\u8EDF', '\u9AD4', '\u4E7E', '\u6DE8', '\u88E1']
for (const c of unencodable) check(!cp950.has(c), 'cp950 must NOT encode ' + cp(c))
for (const c of encodable) check(cp950.has(c), 'cp950 SHOULD encode ' + cp(c))

// The same doc measured that 35 of the 2,637 Simplified-only glyphs are cp950-encodable at
// all - the "the existing tables cannot cover this axis" number.
const simplified = JSON.parse(readFileSync(join(here, 'simplified-only.json'), 'utf8'))
const list = Array.isArray(simplified) ? simplified : (simplified.glyphs || simplified.chars || [])
let inCp950 = 0
for (const c of list) if (cp950.has(c)) inCp950++
check(list.length === 2637, 'the Simplified-only table should hold 2,637 glyphs, got ' + list.length)
check(inCp950 === 35, 'exactly 35 Simplified-only glyphs are cp950-encodable, got ' + inCp950)

// The codepages that encode all of Unicode can never report anything, and the others need a
// table; a missing repertoire would silently turn every check into "clean".
for (const p of ['54936', '65001']) {
  check((table.coversAll || []).includes(p), 'coversAll should list ' + p)
}
for (const p of ['936', '932', '1252']) {
  check(typeof (table.repertoires || {})[p] === 'string', 'missing repertoire for codepage ' + p)
}

console.log('\ncodepage repertoire            (' + checks + ' checks)')
console.log('  ' + (checks - problems.length) + '/' + checks +
  (problems.length ? '   wrong: ' + problems.slice(0, 3).join(' | ') : ''))
if (problems.length) {
  console.log('\nFAIL: the codepage table no longer matches the measured numbers')
  process.exit(1)
}
console.log('\nPASS: the codepage repertoire reproduces the measured numbers')
