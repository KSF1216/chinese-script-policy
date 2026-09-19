#!/usr/bin/env node
// Regression test for both conversion directions. Run: node selftest.js
//
// The per-stage numbers are also the answer to the obvious question: why does
// one direction need a 49,257-entry phrase table when the other needs only 480?
// Because for Simplified -> Traditional the character table alone is close to
// useless, while for Traditional -> Simplified it is close to sufficient.
//
// Exit 0 = every phrase-aware case correct. Exit 1 = a regression.
const fs = require('fs');
const path = require('path');
const { toTraditional, toSimplified, toWritten, scanTextCantonese, scanTextJapanese, compatChars, normalizeCompatibility, puaChars, detectEncoding, decodeBytes, knownHanzi } = require('./lib.js');

// The fixtures live in selftest-cases.json: the Simplified -> Traditional inputs
// are Simplified by definition, and keeping them out of this file means the
// checker and the write hook do not have to be told to ignore a .js file.
const { s2t: S2T, t2s: T2S, known: KNOWN, written: WRITTEN, writtenConvert: WRITTEN_CONVERT, pua: PUA,
  compat: COMPAT, encoding: ENCODING_SECTION, japanese: JAPANESE, japanesePhraseOnly: JP_PHRASE_ONLY,
  japaneseConvert: JP_CONVERT, japaneseConvertToSimplified: JP_CONVERT_S, tcVocab: TC_VOCAB } = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'selftest-cases.json'), 'utf8'));
const ENCODING = ENCODING_SECTION.cases;

// Note on the KNOWN list: OpenCC's t2s config does not touch 著 at all. In
// Simplified, 著 keeps the zhu reading (著名, 著作) and 着 takes the others, so
// 著急 should become 着急; splitting those apart needs the tw2s
// config, which is intentionally not implemented here.
function run(label, cases, fn, variants, primary) {
  const res = variants.map((v) => ({ name: v.name, wrong: [] }));
  for (const [input, expected] of cases) {
    variants.forEach((v, i) => {
      const got = fn(input, v.opts);
      if (got !== expected) res[i].wrong.push(input + ' -> ' + got + ' (want ' + expected + ')');
    });
  }
  console.log('\n' + label + '  (' + cases.length + ' cases)');
  for (const r of res) {
    const right = cases.length - r.wrong.length;
    console.log('  ' + r.name.padEnd(20) + right + '/' + cases.length +
      (r.wrong.length ? '   wrong: ' + r.wrong.slice(0, 3).join(', ') + (r.wrong.length > 3 ? ' ...' : '') : ''));
  }
  return res[primary].wrong.length;
}

const s2tBad = run('Simplified -> Traditional', S2T,
  (t, o) => toTraditional(t, o.phrases, o.tc),
  [{ name: 'char table only', opts: { phrases: false, tc: false } },
   { name: 'phrases (no TC)', opts: { phrases: true, tc: false } },
   { name: 'phrases + TC', opts: { phrases: true, tc: true } }], 2);

const t2sBad = run('Traditional -> Simplified', T2S,
  (t, o) => toSimplified(t, o.phrases),
  [{ name: 'char table only', opts: { phrases: false } },
   { name: 'phrases', opts: { phrases: true } }], 1);

console.log('\nKnown differences (not counted):');
for (const [what, why] of KNOWN) console.log('  ' + what.padEnd(22) + why);

// Register axis: detection only (there is no Cantonese -> written conversion
// table on purpose). The "clean" cases matter more than the "flag" ones - they
// are the traps: shared glyphs (係, 唔, 睇, 幾, 邊, 傾), dropped entries
// (收工, 返工, 幾時) and the sheep noise (咩咩) must NOT be flagged.
const writtenWrong = [];
for (const [text, want] of WRITTEN) {
  const hit = scanTextCantonese(text).length > 0;
  const expect = want === 'flag';
  if (hit !== expect) writtenWrong.push(text + ' -> ' + (hit ? 'flagged' : 'clean') + ' (want ' + want + ')');
}
console.log('\nCantonese register detection  (' + WRITTEN.length + ' cases)');
console.log('  ' + (WRITTEN.length - writtenWrong.length) + '/' + WRITTEN.length +
  (writtenWrong.length ? '   wrong: ' + writtenWrong.slice(0, 4).join(', ') : ''));

// Register conversion (--to-written) is PARTIAL, and that is exactly what this section
// pins: the first group must convert, the second must NOT move. The "must not move"
// group is the substring traps - 房屋企業 contains 屋企, 早點解決 contains 點解, 取得閒置  // check-ok
// contains 得閒 - so the day someone adds those phrases to the conversion table, this  // check-ok
// fails instead of quietly corrupting written Chinese. The same loop checks idempotence:
// running the step twice has to change nothing the second time.
const wcWrong = [];
for (const [input, expected] of WRITTEN_CONVERT) {
  const got = toWritten(input);
  if (got !== expected) wcWrong.push(input + ' -> ' + got + ' (want ' + expected + ')');
  if (toWritten(expected) !== expected) wcWrong.push('not idempotent: ' + expected + ' -> ' + toWritten(expected));
}
console.log('\nRegister conversion (--to-written) (' + (WRITTEN_CONVERT.length * 2) + ' checks)');
console.log('  ' + (WRITTEN_CONVERT.length * 2 - wcWrong.length) + '/' + (WRITTEN_CONVERT.length * 2) +
  (wcWrong.length ? '   wrong: ' + wcWrong.slice(0, 3).join(', ') : ''));

// Compatibility ideographs (U+F900-FAFF and friends): DUPLICATE encodings of ordinary
// characters, invisible by eye, which is why they break search and dedup silently. Both
// conversion directions normalise them, and the checker reports them.
const compatWrong = [];
for (const [input, expected, count] of COMPAT) {
  const norm = normalizeCompatibility(input);
  if (norm !== expected) compatWrong.push('normalise ' + JSON.stringify(input) + ' -> ' + JSON.stringify(norm) + ' (want ' + JSON.stringify(expected) + ')');
  if (toTraditional(input) !== expected) compatWrong.push('--to-traditional did not normalise ' + JSON.stringify(input));
  const found = compatChars(input).length;
  if (found !== count) compatWrong.push('detected ' + found + ' compatibility ideograph(s) in ' + JSON.stringify(input) + ' (want ' + count + ')');
}
console.log('\nCompatibility ideographs        (' + (COMPAT.length * 3) + ' checks)');
console.log('  ' + (COMPAT.length * 3 - compatWrong.length) + '/' + (COMPAT.length * 3) +
  (compatWrong.length ? '   wrong: ' + compatWrong.slice(0, 3).join(', ') : ''));

// Private-use characters: the signature of a Big5/HKSCS file whose characters were
// lost in decoding. Silence here was the dangerous outcome, so it is reported (and
// gets its own regression guard).
const puaWrong = [];
for (const [text, expected] of PUA) {
  const got = puaChars(text).length;
  if (got !== expected) puaWrong.push(JSON.stringify(text) + ' -> ' + got + ' (want ' + expected + ')');
}
console.log('\nPrivate-use (PUA) detection    (' + PUA.length + ' cases)');
console.log('  ' + (PUA.length - puaWrong.length) + '/' + PUA.length +
  (puaWrong.length ? '   wrong: ' + puaWrong.join(', ') : ''));

// Encoding detection on real byte patterns. Before this section existed, a
// Japanese Shift-JIS file was reported as GB18030 and "clean", and a Simplified
// GB18030 file was reported as Big5 mojibake - both silently. The fixtures are hex
// because Node has no encoder for Big5/GB18030/Shift-JIS to create them at runtime.
const encWrong = [];
for (const c of ENCODING) {
  const buf = Buffer.from(c.hex, 'hex');
  const det = detectEncoding(buf, knownHanzi());
  const dec = decodeBytes(buf);
  const problems = [];
  if (det.enc !== c.enc) problems.push('detected ' + det.enc + ' (want ' + c.enc + ')');
  if (dec.enc !== c.enc) problems.push('decodeText said ' + dec.enc);
  if (c.label && !det.label.includes(c.label)) problems.push('label ' + JSON.stringify(det.label) + ' lacks ' + JSON.stringify(c.label));
  if (c.text === null) {
    if (dec.text !== null) problems.push('decoded to text, but it must not be checkable');
  } else if (dec.text !== c.text) {
    problems.push('text ' + JSON.stringify(dec.text) + ' (want ' + JSON.stringify(c.text) + ')');
  }
  if (problems.length) encWrong.push(c.name + ': ' + problems.join('; '));
}
console.log('\nEncoding detection             (' + ENCODING.length + ' cases)');
console.log('  ' + (ENCODING.length - encWrong.length) + '/' + ENCODING.length +
  (encWrong.length ? '   wrong: ' + encWrong.join(' | ') : ''));

// Japanese axis. The "clean" fixtures are the point of this section: 57 of OpenCC's
// 403 shinjitai entries are also valid Traditional Chinese characters (峰 群 床 才),
// and flagging those would re-create the 峰/床/痴 false alarm this project already
// fixed once. One clean fixture is literally those 57 characters.
const jpWrong = [];
for (const [text, want] of JAPANESE) {
  const hit = scanTextJapanese(text).length > 0;
  if (hit !== (want === 'flag')) {
    jpWrong.push(JSON.stringify(text).slice(0, 40) + ' -> ' + (hit ? 'flagged' : 'clean') + ' (want ' + want + ')');
  }
}
for (const [from, to] of JP_CONVERT) {
  const got = toTraditional(from, true, true, false, true);
  if (got !== to) jpWrong.push('--to-traditional --convert-japanese ' + from + ' -> ' + got + ' (want ' + to + ')');
  // The invariant behind the table: whatever the axis flags, the converter clears.
  if (scanTextJapanese(got).length) jpWrong.push('--to-traditional left ' + got + ' flagged');
}
// The word layer is DETECTION ONLY, and this is the test that keeps it that way: the
// words must be flagged, and the converter must leave them completely alone. (OpenCC's
// own jp2t config does convert them, 予定 -> 預定; that direction was deliberately not  // check-ok
// taken - a wrong conversion corrupts text, a wrong detection only blocks a write.
// See references/japanese.md and THIRD-PARTY-NOTICES.md.)
for (const [word] of JP_PHRASE_ONLY) {
  if (!scanTextJapanese(word).length) jpWrong.push('the phrase layer must flag ' + word);
  const got = toTraditional(word);
  if (got !== word) jpWrong.push('detection-only word was converted: ' + word + ' -> ' + got);
}
// Both directions have to clear Japanese forms, and that is not obvious: a shinjitai
// has no entry in the Traditional->Simplified tables, so --to-simplified used to emit
// 竜/発/図 unchanged. It goes through the Traditional form first (竜 -> 龍 -> 龙).  // check-ok
// Kokuji stay put in both directions - no Chinese ancestor means nothing to convert to.
for (const [from, to] of JP_CONVERT_S) {
  const got = toSimplified(from, true, true);
  if (got !== to) jpWrong.push('--to-simplified --convert-japanese ' + from + ' -> ' + got + ' (want ' + to + ')');
}
const jpCases = JAPANESE.length + JP_CONVERT.length + JP_CONVERT_S.length + JP_PHRASE_ONLY.length * 2;
console.log('\nJapanese axis (shinjitai + 和製漢字 + words) (' + jpCases + ' cases)');  // check-ok
console.log('  ' + (jpCases - jpWrong.length) + '/' + jpCases +
  (jpWrong.length ? '   wrong: ' + jpWrong.slice(0, 3).join(', ') : ''));

// Wording preference layer (--wording, and the page's ONE 「用語偏好」 checkbox).
// The guards matter more than the conversions: 地鐵/幼兒園 are the same word on both
// sides, and 面對/麵條 must keep the glyph distinction the phrase table already made -
// turning the option on must not start mangling text that was already correct.
const tcWrong = [];
for (const [input, plain, want] of TC_VOCAB) {
  const a = toTraditional(input);
  const b = toTraditional(input, true, true, true);
  if (a !== plain) tcWrong.push(input + ' 預設 -> ' + a + ' (want ' + plain + ')');
  if (b !== want) tcWrong.push(input + ' --wording -> ' + b + ' (want ' + want + ')');
}
console.log('\nTC preference (--wording)(' + (TC_VOCAB.length * 2) + ' checks)');
console.log('  ' + (TC_VOCAB.length * 2 - tcWrong.length) + '/' + (TC_VOCAB.length * 2) +
  (tcWrong.length ? '   wrong: ' + tcWrong.slice(0, 3).join(', ') : ''));

const failed = s2tBad + t2sBad + writtenWrong.length + wcWrong.length + compatWrong.length + puaWrong.length + encWrong.length + jpWrong.length + tcWrong.length;
console.log('\n' + (failed ? 'FAIL: ' + failed + ' case(s) wrong' : 'PASS: every phrase-aware case correct'));
process.exit(failed ? 1 : 0);
