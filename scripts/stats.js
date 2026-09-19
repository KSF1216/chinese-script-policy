#!/usr/bin/env node
// Where the data comes from, by the entry count.
//
// README claims a percentage for "how much of this is OpenCC's curated data vs written
// here". That number must be derivable, not hand-counted - the first version of it was
// wrong twice over: it counted only the Cantonese DETECTION half as original (ignoring
// its conversion half) and it called Cantonese the ONLY original dataset, even though
// the 21 和製漢字 in the Japanese axis come from Japanese Wikipedia, not OpenCC
// (OpenCC simply has no 和製漢字 - see references/japanese.md).
//
// Run: npm run stats

const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const T = (n) => JSON.parse(fs.readFileSync(path.join(HERE, n), 'utf8'));
const C = (o) => (o && typeof o === 'object') ? Object.keys(o).length : 0;

const s2t = T('simplified-to-traditional.json');
const t2s = T('traditional-to-simplified.json');
const simplifiedOnly = T('simplified-only.json');
const traditionalOnly = T('traditional-only.json');
const jp = T('japanese-only.json');
const can = T('cantonese-only.json');
const tc = T('tc-vocabulary.json');
const sc = T('sc-vocabulary.json');
const compat = T('cjk-compatibility.json');

// Entries that are a parallel VIEW of another table are listed separately and not
// double-counted in the total (japanese.map is the 346 shinjitai -> Chinese pairs of
// the same characters already counted in japanese.chars).
const own = [
  ['粵語 chars', can.chars.length, 'own'],
  ['粵語 phrases', can.phrases.length, 'own'],
  ['粵語 weakPhrases', (can.weakPhrases || []).length, 'own'],
  ['粵語 patterns', (can.patterns || []).length, 'own'],
  ['粵語 convertChars', C(can.convertChars), 'own'],
  ['粵語 convertPhrases', C(can.convertPhrases), 'own'],
];

// 和製漢字 are the characters in japanese.chars that have NO shinjitai->Chinese map
// entry: kokuji have no Chinese ancestor, which is exactly why they cannot be
// converted (references/japanese.md). Measured, not hard-coded.
const mapped = new Set(Object.keys(jp.map || {}));
const kokuji = jp.chars.filter((ch) => !mapped.has(ch));

const counted = [
  ['簡→繁 char', C(s2t.char)],
  ['簡→繁 phrase', C(s2t.phrase)],
  ['字形偏好 tc', C(s2t.tc)],
  ['繁→簡 char', C(t2s.char)],
  ['繁→簡 phrase', C(t2s.phrase)],
  ['偵測 simplified-only', simplifiedOnly.length],
  ['偵測 traditional-only', traditionalOnly.length],
  ['日文 chars', jp.chars.length],
  ['日文 phrases', jp.phrases.length],
  ['粵語（全部）', own.reduce((n, r) => n + r[1], 0)],
  ['繁體偏好', C(tc.phrase)],
  ['簡體偏好', C(sc.phrase)],
  ['相容表意文字', C(compat.map)],
];
const parallel = [['日文 map（與 chars 同一批字的對照，不重複計）', C(jp.map)]];

const total = counted.reduce((n, r) => n + r[1], 0);
const ownTotal = own.reduce((n, r) => n + r[1], 0) + kokuji.length;
const opencc = total - ownTotal;
const pct = (100 * opencc / total);

console.log('計入總數的表：');
for (const [k, v] of counted) console.log('  ' + k.padEnd(34) + String(v).padStart(8));
for (const [k, v] of parallel) console.log('  (' + k + ') ' + v);
console.log('');
console.log('本專案原創（不是 OpenCC 的資料）：');
for (const [k, v] of own) console.log('  ' + k.padEnd(34) + String(v).padStart(8));
console.log('  ' + ('和製漢字（日文維基，共 ' + jp.chars.length + ' 字中 ' + kokuji.length + ' 字無中文祖先）').padEnd(34) + String(kokuji.length).padStart(8));
console.log('  ' + '原創合計'.padEnd(32) + String(ownTotal).padStart(8));
console.log('');
console.log('總計 ' + total.toLocaleString() + ' 筆，其中 OpenCC 衍生 ' + opencc.toLocaleString()
  + ' 筆 = ' + pct.toFixed(2) + '%（原創 ' + ownTotal + ' 筆）');
console.log('和製漢字清單：' + kokuji.join(' '));
