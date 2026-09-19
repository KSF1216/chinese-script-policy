#!/usr/bin/env node
// Regenerates the conversion tables this skill ships with:
//
//   scripts/simplified-to-traditional.json   Simplified -> Traditional
//   scripts/traditional-to-simplified.json   Traditional -> Simplified
//   scripts/tc-vocabulary.json               the opt-in regional vocabulary layer
//   scripts/sc-vocabulary.json               the REVERSE wording layer (TC -> SC)
//   scripts/cjk-compatibility.json           compatibility ideographs -> canonical forms
//
// Build time only. Nothing here is needed at runtime, and OpenCC does not have to be
// installed - the tables are plain JSON that the CLI and the offline page both read.
//
//   node scripts/build-s2t.js [sourceDir] [outDir]
//
// sourceDir defaults to %TEMP%\opencc-check, outDir to this directory. Pass a temp
// directory as outDir to regenerate and diff without touching the committed tables.
//
// Read from sourceDir (OpenCC dictionaries, Apache-2.0 - see THIRD-PARTY-NOTICES.md):
//
//   STCharacters.txt  STPhrases.txt          -> simplified-to-traditional.json
//   TSCharacters.txt  TSPhrases.txt          -> traditional-to-simplified.json
//   TWPhrases.txt     TWVariantsPhrases.txt  -> tc-vocabulary.json
//
// Glyph preferences are deliberately NOT read from sourceDir: they live in
// scripts/glyph-preferences.json, so a change upstream cannot silently change which
// glyph this project shows.
//
// Two rules this script follows on purpose:
//
//   1. THE PROJECT'S OWN FILE IS THE SOURCE OF TRUTH. Upstream data is laid down
//      first and the entries already in the project file go ON TOP of it, so a local
//      correction survives every rebuild instead of being silently reverted - the
//      exact trap that hand-editing a generated file used to be. Entries that differ
//      from upstream are listed in the file's own `$localEdits` header, which is what
//      keeps the deviation reviewable without a second file to sync. Fixing a word
//      therefore means editing the table (recipe in references/conversion.md), not
//      this script.
//   2. THE OUTPUT IS OUR FILE IN OUR FORMAT. OpenCC's names and layout stop at the
//      parser; every file written here carries a `$format` header and our own keys,
//      and the data keys are the ones core.js reads.
//
// Rebuild after changing a dictionary, then run `npm test`: the local edits are
// pinned by fixtures, so a correction that gets lost fails the tests instead of
// shipping quietly.
const fs = require('fs');
const path = require('path');

const SRC = process.argv[2] || path.join(process.env.TEMP || process.env.TMP || '/tmp', 'opencc-check');
const OUT = process.argv[3] || __dirname;
const FORMAT = 'chinese-script-policy/table@1';
const SRC_URL = 'https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/';

const SOURCE_FILES = [
  'STCharacters.txt', 'STPhrases.txt',
  'TSCharacters.txt', 'TSPhrases.txt',
  'TWPhrases.txt', 'TWVariantsPhrases.txt',
  'TWPhrasesRev.txt', 'CJK_Compatibility_Ideographs.txt',
];

// Read everything before writing anything: a half-written table would be worse than
// no table, because it would still load and quietly convert less.
function readSources() {
  const missing = SOURCE_FILES.filter((f) => !fs.existsSync(path.join(SRC, f)));
  if (missing.length) {
    console.error('missing OpenCC dictionaries in ' + SRC + ':');
    for (const f of missing) console.error('  ' + f + '\n    ' + SRC_URL + f);
    console.error('\nPut them in one directory (or pass it as the first argument) and run again.');
    process.exit(1);
  }
  const out = {};
  for (const f of SOURCE_FILES) out[f] = fs.readFileSync(path.join(SRC, f), 'utf8');
  return out;
}

// OpenCC dictionaries are "key candidate candidate ..." lines. The first candidate is
// the default and the rest are alternates this project does not use, so first wins;
// a key that appears twice keeps its first row, because upstream's ordering is part of
// the signal.
function parseOpencc(text) {
  const table = {};
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split(/\s+/);
    if (parts.length >= 2 && table[parts[0]] === undefined) table[parts[0]] = parts[1];
  }
  return table;
}

function maxKeyLen(table) {
  let n = 2;
  for (const k of Object.keys(table)) {
    const len = [...k].length;
    if (len > n) n = len;
  }
  return n;
}

function readJsonIfAny(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Upstream data, with whatever the project already decided put back on top.
function keepLocalEdits(fresh, previous) {
  const data = { ...fresh };
  const localEdits = {};
  for (const [key, value] of Object.entries(previous || {})) {
    if (data[key] !== value) { data[key] = value; localEdits[key] = value; }
  }
  return { data, localEdits };
}

function writeTable(file, header, data, counts, previousTable) {
  const full = path.join(OUT, file);
  fs.writeFileSync(full, JSON.stringify({ $format: FORMAT, ...header, ...data }), 'utf8');
  const kb = (fs.statSync(full).size / 1024).toFixed(0);
  console.log('wrote ' + full + '  (' + kb + ' KB)');
  for (const line of counts) console.log('  ' + line);

  const edits = Object.entries(header.$localEdits || {});
  if (edits.length) {
    console.log('  local edits kept: ' + edits.length);
    for (const [k, v] of edits) console.log('    ' + k + ' -> ' + v);
  }
  // An edit that no longer differs from upstream either means upstream adopted it or
  // someone reverted it: either way it is no longer a deviation worth listing.
  const obsolete = Object.keys((previousTable || {}).$localEdits || {})
    .filter((k) => !(header.$localEdits || {})[k]);
  if (obsolete.length) {
    console.log('  note: ' + obsolete.length + ' previous local edit(s) now match upstream (' +
      obsolete.join(' ') + ') - they can be dropped from the file');
  }
}

const src = readSources();
const previous = {
  s2t: readJsonIfAny(path.join(OUT, 'simplified-to-traditional.json')),
  t2s: readJsonIfAny(path.join(OUT, 'traditional-to-simplified.json')),
  vocab: readJsonIfAny(path.join(OUT, 'tc-vocabulary.json')),
  scVocab: readJsonIfAny(path.join(OUT, 'sc-vocabulary.json')),
  compat: readJsonIfAny(path.join(OUT, 'cjk-compatibility.json')),
};
for (const [name, table] of Object.entries(previous)) {
  if (!table) {
    console.log('note: no previous ' + name + ' table in ' + OUT +
      ' - local edits cannot be carried over into this run');
  }
}

// ------------------------------------------------- Simplified -> Traditional -----
// The direction that needs the phrase table: one Simplified glyph can map to several
// Traditional ones (干 -> 乾/幹/干), so characters alone get about half of common
// two-character words wrong. The glyph-preference pass is folded in here as `tc`.
const charS2T = parseOpencc(src['STCharacters.txt']);
const phraseS2T = keepLocalEdits(parseOpencc(src['STPhrases.txt']), previous.s2t && previous.s2t.phrase);
const preferences = readJsonIfAny(path.join(__dirname, 'glyph-preferences.json'));
if (!preferences || !preferences.preferred) {
  console.error('missing or unreadable scripts/glyph-preferences.json');
  process.exit(1);
}
const glyphs = keepLocalEdits(preferences.preferred, previous.s2t && previous.s2t.tc);

writeTable('simplified-to-traditional.json', {
  $axis: 'script',
  $direction: 'simplified -> traditional',
  $sources: [
    'OpenCC data/dictionary/STCharacters.txt',
    'OpenCC data/dictionary/STPhrases.txt',
    'scripts/glyph-preferences.json (final glyph pass)',
  ],
  $localEdits: phraseS2T.localEdits,
}, {
  maxLen: maxKeyLen(phraseS2T.data),
  char: charS2T,
  phrase: phraseS2T.data,
  tc: glyphs.data,
}, [
  'char   ' + Object.keys(charS2T).length + ' entries',
  'phrase ' + Object.keys(phraseS2T.data).length + ' entries',
  'tc     ' + Object.keys(glyphs.data).length + ' entries',
], previous.s2t);

// ------------------------------------------------- Traditional -> Simplified -----
// Mostly many-to-one, so this direction needs far fewer phrase entries. maxLen is
// written out rather than left implicit: core.js used to carry a hard-coded window,
// which is the kind of number that silently stops matching a longer generated key.
const charT2S = parseOpencc(src['TSCharacters.txt']);
const t2s = keepLocalEdits(parseOpencc(src['TSPhrases.txt']), previous.t2s && previous.t2s.phrase);
writeTable('traditional-to-simplified.json', {
  $axis: 'script',
  $direction: 'traditional -> simplified',
  $sources: [
    'OpenCC data/dictionary/TSCharacters.txt',
    'OpenCC data/dictionary/TSPhrases.txt',
  ],
  $localEdits: t2s.localEdits,
}, {
  maxLen: maxKeyLen(t2s.data),
  char: charT2S,
  phrase: t2s.data,
}, [
  'char   ' + Object.keys(charT2S).length + ' entries',
  'phrase ' + Object.keys(t2s.data).length + ' entries',
], previous.t2s);

// ------------------------------------------------- Script-preference layer (TC) ---
// OpenCC's s2twp is a two-step config and this is the second step:
//   step 1  STPhrases + STCharacters                 (script:  软件 -> 軟件)  // check-ok
//   step 2  TWPhrases + TWVariantsPhrases + TWVariants (wording: 軟件 -> 軟體)
// Only the two phrase dictionaries are needed here. s2twp also chains
// STPhrases_GeneratedFromRegionalPhrases, which OpenCC generates at build time and
// does not ship, so the coverage is most, not all.
//
// It is its own file, and an opt-in flag, on purpose: this step switches between two
// correct Traditional wordings (軟體 vs 軟件), which is a regional preference rather
// than a correction. Applying it by default would make the output depend on a policy
// choice instead of on the text.
const vocab = keepLocalEdits(
  { ...parseOpencc(src['TWPhrases.txt']), ...parseOpencc(src['TWVariantsPhrases.txt']) },
  previous.vocab && previous.vocab.phrase);
writeTable('tc-vocabulary.json', {
  $axis: 'tc-preference',
  $direction: 'traditional -> tc-preference wording, applied only on request',
  $sources: [
    'OpenCC data/dictionary/TWPhrases.txt',
    'OpenCC data/dictionary/TWVariantsPhrases.txt',
  ],
  $localEdits: vocab.localEdits,
}, {
  maxLen: maxKeyLen(vocab.data),
  phrase: vocab.data,
}, [
  'phrase ' + Object.keys(vocab.data).length + ' entries',
], previous.vocab);

// ------------------------------------------------- Reverse wording (TC -> SC) ----
// TWPhrasesRev is the other half of OpenCC's regional data: it turns TAIWAN wording back
// into the SC wording (軟體 -> 軟件, 硬碟 -> 硬盤, 計程車 -> 出租車). It is
// keyed on the Traditional side and runs BEFORE the script conversion, which is the
// reverse order of the TC layer.
//
// Why it is needed: without it 繁->簡 keeps tc wording inside a Simplified file -
// 軟體 became 软体, 網路 became 网路, 計程車 became 计程车, and none of those is what a  // check-ok
// Simplified reader writes (measured 2026-09 on 20 common words: 15 came out that way).
//
// Off by default for the same reason as the TC layer: both sides are correct Chinese
// words, so switching is a regional preference rather than a correction. --wording.
const scVocab = keepLocalEdits(parseOpencc(src['TWPhrasesRev.txt']), previous.scVocab && previous.scVocab.phrase);
writeTable('sc-vocabulary.json', {
  $axis: 'sc-preference',
  $direction: 'tc wording -> sc wording (still the Traditional script), applied before 繁 -> 簡',
  $sources: ['OpenCC data/dictionary/TWPhrasesRev.txt'],
  $localEdits: scVocab.localEdits,
}, {
  maxLen: maxKeyLen(scVocab.data),
  phrase: scVocab.data,
}, [
  'phrase ' + Object.keys(scVocab.data).length + ' entries',
], previous.scVocab);

// ------------------------------------------------- Compatibility ideographs ------
// CJK Compatibility Ideographs (U+F900-FAFF and friends) are DUPLICATE encodings of
// ordinary characters: they arrive from round-tripping Big5 / JIS / KS X 1001 text, look
// identical on screen (豈 U+FA00 next to 豈 U+8C48) and are a different code point.
// Nothing about them looks wrong, which is exactly why they are worth normalising:
// search, dedup and comparison all fail silently.
//
// Unlike every other table here this one is NOT an option - it is normalisation, the same
// text with canonical code points - so both conversion directions apply it first.
// 1,002 entries.
const compat = keepLocalEdits(parseOpencc(src['CJK_Compatibility_Ideographs.txt']), previous.compat && previous.compat.map);
writeTable('cjk-compatibility.json', {
  $axis: 'normalization',
  $direction: 'compatibility ideograph -> canonical character',
  $sources: ['OpenCC data/dictionary/CJK_Compatibility_Ideographs.txt'],
  $localEdits: compat.localEdits,
}, {
  map: compat.data,
}, [
  'map    ' + Object.keys(compat.data).length + ' entries',
], previous.compat);
