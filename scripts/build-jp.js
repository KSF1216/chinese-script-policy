#!/usr/bin/env node
// Regenerates japanese-only.json: the characters that are Japanese in modern use
// and are NOT valid Traditional Chinese.
//
// Why the fourth axis exists: a Japanese shinjitai looks like Chinese at a glance.
// 竜/発/図/円/駅 read as ordinary hanzi, and a model that is asked for Traditional  // check-ok
// Chinese can emit them - the same class of miss as writing Simplified, but one the
// Simplified tables cannot see, because a shinjitai is neither Simplified nor
// Traditional. Measured 2026-09: of OpenCC's 403 shinjitai entries, 112 were already
// covered by the Simplified-only table and 48 by the conversion tables, so 243 were
// completely invisible to this tool. This table closes that gap.
//
// Source (OpenCC, Apache-2.0) - download both into one directory, then run:
//   node build-jp.js [sourceDir]
//
//   https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/JPShinjitaiCharacters.txt
//   https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/JPShinjitaiPhrases.txt
//
// Default sourceDir is %TEMP%\opencc-check (same place build-s2t.js reads).
//
// Output: { chars: string[], map: {...}, phrases: string[] }
//   chars   the detection table, same shape as simplified-only.json's contents
//   map     the same characters that have an unambiguous Traditional target, used by
//           the --to-traditional pass. Only characters that are NOT valid Traditional
//           are in here, so a normal Traditional text can never be rewritten by it.
//   phrases Japanese-only WORDS (予定 予約 丁寧 世論) - DETECTION ONLY, see below  // check-ok
//
// Why the phrase layer is detection-only, and why it is curated rather than taken
// whole: OpenCC's JPShinjitaiPhrases was written for the jp2t config (Japanese text ->
// Traditional), so 交差 -> 交叉 is correct for a Japanese input and WRONG for a Chinese
// one - 交差 is a 教育部 headword (ㄐㄧㄠ ㄔㄞ, to report a finished task). The criterion
// here is therefore not "is this Japanese?" but "would a Chinese writer type this
// string?", and it is checked against the 教育部 dictionaries. A wrong detection only
// blocks a write; a wrong conversion corrupts text, so the list never reaches
// --to-traditional.
//
// Two filters, both measured 2026-09-16 (235 entries in the source):
//   1. entries whose characters the character table already flags    - 71 dropped
//   2. entries that are Chinese (see PHRASE_EXCLUDE)                 - 38 dropped
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(process.env.TEMP || process.env.TMP || '/tmp', 'opencc-check');
const OUT = path.join(__dirname, 'japanese-only.json');

// OpenCC lists these as shinjitai, but cp950 (Windows Big5) can represent them, so
// they are legitimate Traditional Chinese characters and flagging them would be a
// false alarm - the same mistake this project already fixed once for 峰/床/痴.
// 峰, 床, 群, 才, 唇, 岳, 連, 衛 and the rest of this list are ordinary Chinese;
// characters that only *look* similar are NOT here (猫, 姉, 値 are absent from Big5,  // check-ok
// so they stay in the table and are correctly flagged).
//
// Derivation (2026-09, all 403 single-character keys): encode the character with
// cp950 and decode it back; a round trip that returns the same character means Big5
// can represent it. 57 of 403 came back representable:
//
//   $e=[System.Text.Encoding]::GetEncoding(950)
//   $e.GetString($e.GetBytes($c)) -eq $c        # true => exclude
//
// Pinned here rather than computed at build time because Node cannot encode Big5,
// so a Node-side test would silently always pass. If OpenCC adds a shinjitai that is
// also a valid Chinese character, this list has to be extended by hand - that is the
// point: it is a reviewed list, not a derived one.
const VALID_CHINESE_TOO =
  '万与並予伝体余併偽党凜即台唇岳峰庄床弁御恒慎才晃概槙欠為煙瓶痴痺真研秘稜粧粽糸緒缶群翻舖芸萌虫蚕衛褒触証豊連郎鎮餅';  // check-ok

// --- 和製漢字 (kokuji): characters invented in Japan, no Chinese ancestor -------------  // check-ok
// Source: ja.wikipedia 「和製漢字」, revision 109822326 (2026-06-06), the section
// 「和製漢字の例」. ONLY the first field of each table row is a kokuji: the notes mention
// other characters (杤 for 栃, 匀 for 匂, and the Chinese-made metric 兛/兞), so taking a  // check-ok
// whole row would import wrong entries.
//
// The article itself says the real number is 1500-2600 depending on the definition, so
// this is a curated COMMON subset, not a complete list - do not claim completeness.
// Pinned instead of fetched: a build step that scrapes a wiki table breaks the day
// someone edits the article. The revision id above is what the list was taken from.
//
// Audited 2026-09-16: 28 candidates -> 21 kept. Seven were dropped because cp950 (Big5)
// or GB2312 can represent them, which means they are Chinese, not Japanese-only:
//   腺 俣 搾 鱈 萩 粁 瓩  // check-ok
// (腺 is a normal modern Chinese character; 俣 is the Simplified form of 俁; 粁 and 瓩  // check-ok
// ended up in Big5. Flagging any of them would be a false alarm.)
// Re-run that audit with:
//   $e=[System.Text.Encoding]::GetEncoding(950); $e.GetString($e.GetBytes('<char>')) -eq '<char>'
// and for GB2312 (lead A1-F7, trail A1-FE): $b=[Text.Encoding]::GetEncoding(936).GetBytes('<char>')
const KOKUJI = '峠辻笹榊栃畠畑匂凪凧凩枠込躾働錻襷辷糀樫竏';  // check-ok

// --- the phrase layer's exclusion list: these are CHINESE, so they must not be flagged
//
// Reviewed 2026-09-16 against the 教育部 dictionaries. Two groups:
//
// (a) confirmed Chinese - either an MOE headword or ordinary modern Chinese. Flagging
//     any of these would block a writer who is doing nothing wrong:
const PHRASE_EXCLUDE_CHINESE = {
  '交差': '教育部有詞目（ㄐㄧㄠ ㄔㄞ，向長官報告任務完成）',
  '連合': '教育部有詞目（例句：連合所有的消費者一同抵制；也作「聯合」）',
  '意向': '中文詞（意向書）；OpenCC 想改的「意嚮」反而不是中文',
  '凶器': '中文詞（凶器）；「兇器」只是異體偏好',
  '暴露': '常見中文詞',
  '放棄': '常見中文詞',
  '連結': '常見中文詞（超連結）',
  '停泊': '常見中文詞（船停泊在港內）',
  '衰退': '常見中文詞',
  '欠缺': '常見中文詞（欠缺經驗）',
  '浸透': '常見中文詞（汗水浸透了衣服）',
  '弦歌': '中文詞（弦歌不輟）',
  '連絡': '教育部兩者並行（連絡／聯絡）',
  '火炎': '中文詞（火炎山，苗栗地名）',
  '暗夜': '中文文學用語',
  '講和': '中文詞（兩國講和）',
  '相克': '中文詞（五行相克），教育部作「相剋」',
  '障壁': '繁體經濟用語（貿易障壁）',
};

// (b) not verified either way, but a Chinese writer plausibly types them (usually a
//     homophone variant), so they stay out - flagging a Chinese miswriting is exactly
//     the false alarm this axis keeps trying not to be. Each says what the standard
//     Chinese form is; the ones marked 「未查證」 can be promoted after an MOE lookup.
//
// RE-CHECKED 2026-09-16 with 教育部 / 教育百科 lookups, conclusion: keep every one of them
// out. Three now have citations instead of a hunch - 混然 IS a 教育部 headword
// (dict.revised.moe.edu.tw ID 86153), and 高進 / 踏襲 / 暖房 appear in Chinese dictionaries
// (guoxuedashi, Wiktionary) - and the rest are homophone variants of a standard word
// (焦燥/焦躁, 母指/拇指, 肩甲骨/肩胛骨, 訓戒/訓誡, 輪郭/輪廓, 混然/渾然, 障害/障礙, 集落/聚落,
// 回遊/洄游, 試練/試煉, 決別/訣別, 先端/尖端, 防御/防禦), so a Chinese writer can produce them
// by mistake. Promoting any of them needs a corpus measurement, not a dictionary lookup:
// the cost of a false positive here is a blocked write.
const PHRASE_EXCLUDE_CONSERVATIVE = {
  '先端': '中文偶見，標準作「尖端」',
  '防御': '中文偶見，標準作「防禦」',
  '編集': '中文偶見，標準作「編輯」',
  '暖房': '中文偶見（暖氣／溫室）',
  '焦燥': '中文常見誤寫，標準作「焦躁」',
  '肩甲骨': '中文常見誤寫，標準作「肩胛骨」',
  '試練': '中文偶見，標準作「試煉」',
  '踏襲': '中文偶見，標準作「沿襲」',
  '輪郭': '中文偶見，標準作「輪廓」',
  '選考': '中文偶見，標準作「甄選」',
  '母指': '中文常見誤寫，標準作「拇指」',
  '決別': '中文偶見，標準作「訣別」',
  '確固': '中文偶見（未查證）',
  '混然': '中文偶見，標準作「渾然」',
  '恩義': '中文偶見（未查證）',
  '援護': '中文偶見（未查證）',
  '回遊': '中文偶見，標準作「洄游」',
  '訓戒': '中文常見誤寫，標準作「訓誡」',
  '集落': '中文偶見，標準作「聚落」',
  '障害': '中文偶見，標準作「障礙」',
  '高進': '人名用字（未查證）',
  '破棄': '中文偶見（未查證）',
  '猶予': '中文偶見（未查證）',
};
const PHRASE_EXCLUDE = { ...PHRASE_EXCLUDE_CHINESE, ...PHRASE_EXCLUDE_CONSERVATIVE };

function rows(name) {
  const file = path.join(SRC, name);
  if (!fs.existsSync(file)) {
    throw new Error('missing ' + file + '\n  download it from https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/' + name);
  }
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split('\t');
    if (parts.length < 2) continue;
    out.push({ key: parts[0], cands: parts[1].trim().split(/\s+/).filter(Boolean) });
  }
  return out;
}

const all = rows('JPShinjitaiCharacters.txt');
const excluded = new Set();
const kept = [];
const map = {};
const noTarget = [];
for (const r of all) {
  if ([...r.key].length !== 1) continue; // multi-character entries are phrases
  if (VALID_CHINESE_TOO.includes(r.key)) { excluded.add(r.key); continue; }
  kept.push(r.key);
  // Target for the conversion pass: the first candidate that is not the key itself.
  // OpenCC writes some entries as "keep it" (猫 -> 猫 貓), where the first candidate  // check-ok
  // repeats the key; the Traditional form is the next one.
  const target = r.cands.find((c) => c !== r.key && [...c].length === 1);
  if (target) map[r.key] = target;
  else noTarget.push(r.key);
}

// Sorted by code point so a diff of this table is readable and stable.
// Kokuji go into chars ONLY: they have no Chinese ancestor, so there is no Traditional
// form to convert to. --to-traditional cannot fix them - the model has to rewrite the
// word (畑 -> 田地). That is the one behavioural difference from the shinjitai entries.  // check-ok
const kokuji = [...KOKUJI].filter((c) => !kept.includes(c));
for (const c of kokuji) kept.push(c);
kept.sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
const sorted = {};
for (const k of Object.keys(map).sort((a, b) => a.codePointAt(0) - b.codePointAt(0))) sorted[k] = map[k];

// --- phrase layer ---------------------------------------------------------------------
// Read the phrase source first: this throws before anything is written, so a missing
// download cannot leave a half-built table behind.
const phraseRows = rows('JPShinjitaiPhrases.txt');
// "Already caught" means caught by ANY character axis, not just this one: the hook and
// the default run apply the script axis and both filter axes together, so 抵触 (whose 触 the Simplified table  // check-ok
// already flags) adds nothing by being listed here as well.
const charSet = new Set([...kept, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'simplified-only.json'), 'utf8'))]);
const coveredByChars = [];
const phraseKept = [];
const phraseExcluded = [];
for (const r of phraseRows) {
  if ([...r.key].length < 2) continue;             // a single character is the other table
  if ([...r.key].some((c) => charSet.has(c))) coveredByChars.push(r.key);
  else if (PHRASE_EXCLUDE[r.key]) phraseExcluded.push(r.key);
  else phraseKept.push(r.key);
}
phraseKept.sort((a, b) => (a.codePointAt(0) - b.codePointAt(0)) || a.localeCompare(b));  // check-ok

// --- the project file is the source of truth, same rule as build-s2t.js --------------
// A rebuild lays the freshly built tables down and then puts whatever the project file
// already had back on top, so a local addition survives instead of being silently
// reverted; entries that are not upstream's are listed in the file's own $localEdits
// header. Local REMOVALS are not honoured (the entry returns) - delete it in
// VALID_CHINESE_TOO / KOKUJI / PHRASE_EXCLUDE when that is the intent.
const FORMAT = 'chinese-script-policy/table@1';
const previous = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return null; } })();
const union = (fresh, prev) => {
  const out = [...fresh];
  for (const v of prev || []) if (!out.includes(v)) out.push(v);
  return out.sort((a, b) => (a.codePointAt(0) - b.codePointAt(0)) || a.localeCompare(b));  // check-ok
};
const finalChars = union(kept, previous && previous.chars);
const finalPhrases = union(phraseKept, previous && previous.phrases);
const finalMap = { ...sorted, ...((previous && previous.map) || {}) };
const localEdits = {};
for (const [key, list] of [['chars', finalChars], ['phrases', finalPhrases]]) {
  const added = list.filter((v) => !(key === 'chars' ? kept : phraseKept).includes(v));
  if (added.length) localEdits[key] = added;
}
const changedMap = {};
for (const [k, v] of Object.entries((previous && previous.map) || {})) if (sorted[k] !== v) changedMap[k] = v;
if (Object.keys(changedMap).length) localEdits.map = changedMap;

fs.writeFileSync(OUT, JSON.stringify({
  $format: FORMAT,
  $axis: 'japanese',
  $direction: 'japanese shinjitai / kokuji / Japanese-only words -> detection; the map converts',
  $sources: [
    'OpenCC data/dictionary/JPShinjitaiCharacters.txt',
    'OpenCC data/dictionary/JPShinjitaiPhrases.txt',
    'ja.wikipedia 和製漢字 revid 109822326 (kokuji list, CC BY-SA)',
  ],
  $localEdits: localEdits,
  chars: finalChars,
  map: finalMap,
  phrases: finalPhrases,
}), 'utf8');
if (Object.keys(localEdits).length) {
  console.log('  local edits kept: ' + JSON.stringify(Object.keys(localEdits).map((k) => k + '=' +
    (Array.isArray(localEdits[k]) ? localEdits[k].length : Object.keys(localEdits[k]).length))));
}

console.log('read  ' + all.length + ' entries from JPShinjitaiCharacters.txt');
console.log('wrote ' + OUT);
console.log('  chars  ' + kept.length + ' characters flagged by --japanese');
console.log('         ' + (kept.length - kokuji.length) + ' shinjitai (OpenCC) + ' + kokuji.length +
  ' kokuji (和製漢字, ja.wikipedia - detection only, no Traditional target)');  // check-ok
console.log('  map    ' + Object.keys(sorted).length + ' of them have a Traditional target, so');
console.log('         --to-traditional rewrites them too (竜 -> 龍, 発 -> 發, 図 -> 圖)');  // check-ok
console.log('  excluded as Chinese (in Big5) ' + excluded.size + ': ' + [...excluded].join(' '));
console.log('  phrases ' + phraseKept.length + ' Japanese-only WORDS, detection only: ' +
  phraseKept.slice(0, 8).join(' ') + ' ...');
console.log('          ' + phraseRows.length + ' read from JPShinjitaiPhrases.txt, dropped ' +
  coveredByChars.length + ' already flagged by the character table and ' +
  phraseExcluded.length + ' as Chinese');
console.log('          dropped as Chinese: ' + phraseExcluded.join(' '));
if (noTarget.length) {
  console.log('  detected but not convertible (OpenCC gives no different candidate): ' + noTarget.join(' '));
}
console.log('  size ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB');
