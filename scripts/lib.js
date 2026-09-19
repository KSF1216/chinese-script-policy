// Shared entry point for the chinese-script-policy skill: the IO half.
//
// The algorithms live in core.js - pure, no Node APIs, and shared with the
// browser build (see build-web.js). This file reads the JSON tables, hands them
// to core.js, and adds the filesystem helpers the CLI and the write hook need.
//
// Its public surface is deliberately the same as before the split, so tradzh.js,
// pre-write-check.js and selftest.js did not have to change. One implementation,
// several front ends: Node + PowerShell copies used to drift apart here and it
// cost real time to untangle.
//
// The glyph list contains ONLY characters that exist in Simplified but not in
// Traditional. Shared glyphs (您, 什麼, 可以, 我) are deliberately excluded: an
// earlier hand-written list included them and flagged correct Traditional text.
// So is the OpenCC "variant preference" pair 群 -> 羣, where 群 is the standard
// common form.
const fs = require('fs');
const path = require('path');
const { createCore, globToRegExp, detectEncoding, decodeText, scriptMix, chineseScore, puaChars, scanTextPua, SKIP_MARKERS } = require('./core.js');
const SKILL_ROOT = path.join(__dirname, '..');
const LIST_FILE = path.join(__dirname, 'simplified-only.json');
const TRAD_ONLY_FILE = path.join(__dirname, 'traditional-only.json');
const T2S_FILE = path.join(__dirname, 'traditional-to-simplified.json');
const S2T_FILE = path.join(__dirname, 'simplified-to-traditional.json');
const CANTONESE_FILE = path.join(__dirname, 'cantonese-only.json');
const JAPANESE_FILE = path.join(__dirname, 'japanese-only.json');
// s2twp's second step: regional vocabulary (軟件 -> 軟體). Opt-in, see core.js.
// The file is ours, in our layout (see build-s2t.js); OpenCC's own name for this data
// is TWPhrases.txt, and that name stops at the build script.
const TC_VOCAB_FILE = path.join(__dirname, 'tc-vocabulary.json');
// The reverse wording layer (tc wording -> sc wording), used only by
// --to-simplified --wording. Same reasoning as the TC layer, opposite direction.
const SC_VOCAB_FILE = path.join(__dirname, 'sc-vocabulary.json');
// Compatibility ideographs -> canonical characters. Normalisation, not a conversion step:
// both directions apply it, because a duplicate code point cannot be seen otherwise.
const COMPAT_FILE = path.join(__dirname, 'cjk-compatibility.json');
// Project-level allow list, read from the working directory (like .tradzhignore):
// a register exemption is always project-specific, so it never ships with the tool.
const CANTONESE_ALLOW_FILE = 'cantonese-allow.json';

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

// -------------------------------------------------------------- core wiring ---
// Tables are read once, on first use. Reading all six costs ~1.4 MB / ~20 ms,
// which is noise next to walking a directory, and it keeps one cache instead of
// six that could disagree about which tables exist.
let coreCache = null;
function core() {
  if (coreCache) return coreCache;
  coreCache = createCore({
    simplifiedOnly: readJson(LIST_FILE),
    traditionalOnly: readJson(TRAD_ONLY_FILE),
    japanese: readJson(JAPANESE_FILE),
    tcVocab: readJson(TC_VOCAB_FILE),
    scVocab: readJson(SC_VOCAB_FILE),
    compat: readJson(COMPAT_FILE),
    t2s: readJson(T2S_FILE),
    s2t: readJson(S2T_FILE),
    cantonese: readJson(CANTONESE_FILE),
  });
  return coreCache;
}

// Thin bindings: same names and signatures as before the split.
function glyphSet() { return core().glyphSet(); }
function traditionalOnlyGlyphs() { return core().traditionalOnlyGlyphs(); }
function japaneseOnlyGlyphs() { return core().japaneseOnlyGlyphs(); }
// The Japanese axis has two layers: characters (convertible) and phrases (detection
// only - Japanese-only words like 予定 丁寧 whose characters are all valid Chinese).  // check-ok
function japaneseTables() { return core().japaneseTables(); }
function t2sTables() { return core().t2sTables(); }
function s2tTables() { return core().s2tTables(); }
function cantoneseTables() { return core().cantoneseTables(); }
function scanText(text) { return core().scanText(text); }
function scanTextWith(set, text) { return core().scanTextWith(set, text); }
function scanTextCantonese(text) { return core().scanTextCantonese(text); }
function scanTextJapanese(text) { return core().scanTextJapanese(text); }
function scanTextVariant(text, variant) { return core().scanTextVariant(text, variant); }
function toSimplified(text, usePhrases = true, useJapanese = false, useWording = false) {
  return core().toSimplified(text, usePhrases, useJapanese, useWording);
}
function toTraditional(text, usePhrases = true, useTc = true, useWording = false, useJapanese = false) {
  return core().toTraditional(text, usePhrases, useTc, useWording, useJapanese);
}
// Named steps, so a caller can run one axis at a time (see core.js):
//   toWritten     Cantonese -> written Chinese, the unambiguous subset only
//   stripJapanese shinjitai -> Traditional (竜 -> 龍); opt-in, and detection is separate  // check-ok
function toWritten(text) { return core().toWritten(text); }
function stripJapanese(text) { return core().stripJapanese(text); }
// Compatibility ideographs: duplicates of ordinary characters, invisible by eye.
function compatChars(text) { return core().compatChars(text); }
function scanTextCompat(text) { return core().scanTextCompat(text); }
function normalizeCompatibility(text) { return core().normalizeCompatibility(text); }
function tcVocabTables() { return core().tcVocabTables(); }
function summarize(hits) { return core().summarize(hits); }
function hitOccurrences(hits) { return core().hitOccurrences(hits); }
function lineSkipped(lines, i) { return core().lineSkipped(lines, i); }

// ---------------------------------------------------------------- ignore -----
// Some files legitimately contain Simplified Chinese: the glyph list itself,
// other locales bundles, vendored upstream source, build output.
function loadIgnoreLines() {
  const lines = [];
  for (const file of [path.join(SKILL_ROOT, '.tradzhignore'), path.join(process.cwd(), '.tradzhignore')]) {
    try {
      for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const l = raw.trim();
        if (l && !l.startsWith('#')) lines.push(l);
      }
    } catch { /* absent is fine */ }
  }
  return lines;
}

// Deliberately NOT cached. The DSH plugin and a hook bridge live in a long-lived
// process, so caching this the first time it is read means a project that adds
// .tradzhignore *after* the process started is ignored until the next restart -
// and the same file is read once per guarded write anyway. Two small file reads
// per write cost ~0.1 ms and cannot go stale.
function ignored(targetPath) {
  const rules = loadIgnoreLines().map(globToRegExp);
  if (!rules.length) return false;
  const full = path.resolve(targetPath);
  const base = path.basename(full);
  const norm = full.replace(/\\/g, '/');
  for (const re of rules) if (re.test(norm) || re.test(base)) return true;
  return false;
}

// ------------------------------------------------------- register allow list ---
// Project allow list: <cwd>/cantonese-allow.json. Accepts either a bare array of
// globs or { "allow": [ "glob" | { "path": "glob", "why": "..." } ] }. Uses the
// same glob dialect as .tradzhignore, on purpose - two dialects would drift.
// Same reasoning as ignored(): no cache, so a project's allow list added while a
// long-lived process is running takes effect on the next write.
function cantoneseAllowRules() {
  const rules = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), CANTONESE_ALLOW_FILE), 'utf8'));
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw.allow) ? raw.allow : []);
    for (const item of list) {
      const glob = typeof item === 'string' ? item : (item && typeof item.path === 'string' ? item.path : '');
      if (glob) rules.push(globToRegExp(glob));
    }
  } catch { /* absent or malformed: nothing is allowed */ }
  return rules;
}

function cantoneseAllowed(targetPath) {
  const rules = cantoneseAllowRules();
  if (!rules.length) return false;
  const full = path.resolve(targetPath);
  const base = path.basename(full);
  const norm = full.replace(/\\/g, '/');
  return rules.some((re) => re.test(norm) || re.test(base));
}

// -------------------------------------------------------------- encoding -----
// Both live in core.js so the web page reads uploaded files with the same code
// instead of keeping its own copy.
//
// The known-hanzi set goes in with the bytes: telling a real Big5 decode from a real
// GB18030 decode needs a frequency proxy, and this project's own conversion tables
// are a good one (see chineseScore in core.js). Without it, a Simplified GB file can
// come out as Big5 mojibake and still be reported clean.
function readTextSmart(file) { return decodeBytes(fs.readFileSync(file)); }
function knownHanzi() { return core().knownHanzi(); }
// Bytes in, { text, enc, label } out. Same contract as core.decodeText, with the
// table-derived hint supplied - so callers never forget to pass it.
function decodeBytes(buf) { return decodeText(buf, knownHanzi()); }

function writeTextUtf8(file, text) {
  // No-BOM UTF-8 via a temp file plus rename, so the encoding is never the
  // caller's choice and a failure cannot leave a half-written file.
  const dir = path.dirname(path.resolve(file));
  const tmp = path.join(dir, '.' + path.basename(file) + '.tradzh-tmp');
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    fs.writeFileSync(file, text, 'utf8');
  }
}

// ------------------------------------------------------------ file walking ---
function isTextFile(file) {
  return ['.md', '.txt', '.json', '.yml', '.yaml', '.csv', '.srt', '.vtt', '.html', '.htm',
    '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.ps1', '.psm1', '.sh', '.py', '.rb',
    '.go', '.rs', '.java', '.c', '.h', '.cpp', '.css', '.scss', '.xml', '.ini', '.cfg',
    '.toml', '.log', '.tex', '.sql', '.jinja'].includes(path.extname(file).toLowerCase());
}

// includeIgnored exists so a caller can tell "nothing to check here" apart from
// "everything here was excluded by .tradzhignore" - the second is a clean result,
// not an error.
function walk(dir, out, includeIgnored = false) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const ent of entries) {
    // Only universally-safe directories are pruned here. Project-specific ones
    // (a vendored checkout, a model folder) are named in that project's own
    // .tradzhignore instead - this list ships with the tool.
    if (['node_modules', '.git', '.cache'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out, includeIgnored);
    else if (isTextFile(full) && (includeIgnored || !ignored(full))) out.push(full);
  }
  return out;
}

// ------------------------------------------------ console encoding hazard -----
// A THIRD axis, and it is not about which script the text is in: it is about whether the
// text can survive being PRINTED. A file can be perfectly correct Traditional Chinese and
// still crash a program at run time, because the Windows console is cp950 and cp950 cannot
// encode the character. Measured 2026-09-18 on a ComfyUI node: printing a Simplified glyph
// raised UnicodeEncodeError: 'cp950' codec can't encode character, the node died, and even
// writing the traceback failed - so the symptom looked like a hang, not a crash.
// See references/console-encoding-hazard.md.
//
// The repertoire table is generated by build-codepage.ps1: Node has no legacy-codepage
// encoder (Buffer does utf8 / latin1 / utf16le only), so .NET measures it once and the
// runtime stays offline and dependency-free.
const CODEPAGE_FILE = path.join(__dirname, 'codepage-repertoire.json');
// Only lines that actually print are inspected. The same character in a comment or in a
// variable name never reaches the console, and flagging those is the same mistake as
// putting shared glyphs in the Simplified list: it buries the real hits in false alarms.
const CONSOLE_SINK = /\bprint\s*[(]|\bprint\s*["']|\becho\b|\braise\b|\b(?:logging|logger|log|console)\./;
// UTF-8 and its aliases encode every Unicode character, so there is nothing to report.
const UTF8_CODEPAGES = [65001, 65000, 1208];

let codepageCache = null;
function codepageTables() {
  if (!codepageCache) codepageCache = readJson(CODEPAGE_FILE);
  return codepageCache;
}

/** True when this codepage encodes every Unicode character (nothing can be a hazard). */
function codepageIsUniversal(codepage) {
  const cp = Number(codepage);
  if (UTF8_CODEPAGES.includes(cp)) return true;
  return (codepageTables().coversAll || []).map(Number).includes(cp);
}

/** The characters a codepage CAN encode, or null when this build has no table for it. */
function codepageRepertoire(codepage) {
  const table = (codepageTables().repertoires || {})[String(Number(codepage))];
  if (typeof table !== 'string') return null;
  return new Set([...table]);
}

/** What this build can check: which tables exist, and which codepages are always safe. */
function codepageSupported() {
  const t = codepageTables();
  return {
    tables: Object.keys(t.repertoires || {}).map(Number).sort((a, b) => a - b),
    universal: [...new Set([...UTF8_CODEPAGES, ...(t.coversAll || []).map(Number)])].sort((a, b) => a - b),
  };
}

/**
 * Find the lines that print a character the target codepage cannot encode.
 *
 * It is a HEURISTIC and the caller must say so: deciding statically which strings reach
 * the console is not decidable in general, so this looks only at the obvious sinks
 * (print / echo / logging / logger / log / console / raise).
 *
 * @param {string} text - the source to inspect.
 * @param {{codepage?: number}} [options] - target codepage, default 950.
 * @returns {{lines: Array, chars: string[], codePage: number, universal: boolean, unsupported?: boolean}}
 */
function consoleHazards(text, options = {}) {
  const codePage = Number(options.codepage || 950);
  if (codepageIsUniversal(codePage)) return { lines: [], chars: [], codePage, universal: true };
  const repertoire = codepageRepertoire(codePage);
  if (!repertoire) return { lines: [], chars: [], codePage, universal: false, unsupported: true };
  const all = String(text).split(/\r?\n/);
  const lines = [];
  const seen = new Set();
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    if (!CONSOLE_SINK.test(line)) continue;
    if (lineSkipped(all, i)) continue;
    const chars = [];
    for (const ch of line) {
      if (ch.codePointAt(0) < 0x80) continue;
      if (repertoire.has(ch)) continue;
      chars.push(ch);
      seen.add(ch);
    }
    if (chars.length) lines.push({ line: i + 1, chars, text: line.trim() });
  }
  return { lines, chars: [...seen], codePage, universal: false };
}

// ------------------------------------------- Windows script-file type traps -----
// A different KIND of rule from every axis above: those look at the Chinese in the content,
// this one looks at the FILE TYPE. Both traps were measured (references/encoding.md):
//
//   * a .ps1 that is UTF-8 WITHOUT a BOM and contains any non-ASCII byte does not parse on
//     Windows PowerShell 5.1 - `The string is missing the terminator` - while the same text
//     as UTF-8+BOM, as UTF-16, or as ANSI (cp950) runs fine. The write tools always write
//     UTF-8 with NO BOM (writeTextUtf8 uses UTF8Encoding(false)), so for a WRITE the trap
//     reduces to: target is a PowerShell script AND the content has any non-ASCII character.
//   * a .cmd/.bat with LF-only line endings makes cmd.exe's `goto` / `set /p` misbehave.
//
// Two properties are deliberate:
//   * it never reads or scans an existing file - it judges only the content being written,
//     so a UTF-16 or BOM-carrying file already on someone's disk is left alone;
//   * a pure-ASCII script can never trigger it, so the common case has no false positives.
const POWER_SHELL_SUFFIX = /\.(ps1|psm1)$/i;
const CMD_SUFFIX = /\.(cmd|bat)$/i;
const NON_ASCII = /[^\x00-\x7F]/;

/**
 * Judge one write by its TARGET TYPE alone.
 *
 * `severity` is what the trap deserves on its own merits: 'block' when the file really would
 * not run, 'warn' when it will probably still run (measured: a UTF-8 .cmd does run). The
 * caller may downgrade everything to 'warn' - which is the default, because this rule acts
 * on other people's files.
 *
 * @param {string} filePath - where the tool is writing.
 * @param {string} content - the text about to be written.
 * @returns {{reason: string, severity: 'block'|'warn'}|undefined}
 */
function fileTypeTrap(filePath, content) {
  const target = typeof filePath === 'string' ? filePath : '';
  if (!target) return undefined;
  const text = String(content == null ? '' : content);
  if (POWER_SHELL_SUFFIX.test(target) && NON_ASCII.test(text)) {
    return {
      severity: 'block',
      reason: 'BLOCKED by chinese-script-policy (file type): ' + target + ' is a PowerShell ' +
        'script and the content has non-ASCII characters. The write tools write UTF-8 WITHOUT ' +
        'a BOM, and Windows PowerShell 5.1 reads .ps1 as ANSI, so the file will not parse ' +
        '(measured: "The string is missing the terminator"). Three ways out: keep the script ' +
        'pure ASCII (put the Chinese in a .md/.json and read it at run time), write UTF-8 WITH ' +
        'a BOM, or generate the file from Node. This rule judges the write only - it never ' +
        'scans existing files.',
    };
  }
  if (!CMD_SUFFIX.test(target)) return undefined;
  if (NON_ASCII.test(text)) {
    return {
      severity: 'warn',
      reason: 'chinese-script-policy (file type): ' + target + ' is a batch file with ' +
        'non-ASCII characters. cmd.exe reads .cmd/.bat as ANSI, so that text is mojibake for ' +
        'anyone on a different code page - it usually still runs (measured), which is why ' +
        'this one warns instead of blocking. Keep .cmd/.bat pure ASCII and put the Chinese in ' +
        'a .md/.json.',
    };
  }
  if (/\n/.test(text) && !/\r\n/.test(text)) {
    return {
      severity: 'warn',
      reason: 'chinese-script-policy (file type): ' + target + ' has LF-only line endings. ' +
        'cmd.exe expects CRLF; with bare LF, `goto` can jump to the wrong label and `set /p` ' +
        'can read an empty value. Write CRLF (or keep the batch file to a single line).',
    };
  }
  return undefined;
}

// ------------------------------------------------------- write-time guard -----
// The single decision behind BOTH write guards: the CLI hook
// (scripts/pre-write-check.js, used by Claude Code and by the DSH hooks bridge)
// and the DSH plugin's own guard (index.mjs). Same axes, same exemptions, same
// message - two implementations would drift, and a write would be blocked by one
// front end while the other allowed it.
//
// Japanese variants are shown with their Traditional form, taken from the same
// table this axis uses, so the model can fix them without a second copy of the
// mapping.
let jpMapCache = null;
function japaneseMap() {
  if (jpMapCache) return jpMapCache;
  jpMapCache = {};
  try {
    jpMapCache = JSON.parse(fs.readFileSync(JAPANESE_FILE, 'utf8')).map || {};
  } catch { /* the message just gets less detail */ }
  return jpMapCache;
}

function guardMessage({ scriptHits, registerHits, japaneseHits, scriptTarget }) {
  const jpMap = japaneseMap();
  // Which script this project stores. The script axis is the same scan either way -
  // it is the table and the advice that flip: 'traditional' flags Simplified-only
  // glyphs, 'simplified' flags Traditional-only glyphs.
  const simplified = scriptTarget === 'simplified';
  const parts = [];
  if (scriptHits.length) {
    const { lines, chars } = summarize(scriptHits);
    const cps = chars.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    parts.push(lines + ' line(s) with ' +
      (simplified ? 'Traditional-Chinese-only glyphs' : 'Simplified-Chinese-only glyphs') +
      ' (' + cps.join(' ') + ')');
  }
  if (registerHits.length) {
    const marks = new Set();
    for (const h of registerHits) {
      for (const c of h.chars ?? []) marks.add(c);
      for (const p of h.phrases ?? []) marks.add(p);
    }
    parts.push(registerHits.length + ' line(s) with Cantonese colloquial markers (' + [...marks].join(' ') + ')');
  }
  if (japaneseHits.length) {
    const { chars } = summarize(japaneseHits);
    const words = [...new Set(japaneseHits.flatMap((h) => h.phrases ?? []))];
    // The arrow must point at the script this project stores: the table maps a
    // shinjitai to its Traditional form, so ask the converter for the Simplified
    // one when that is the target.
    const shown = chars.map((c) => {
      if (!jpMap[c]) return c;
      const target = simplified ? toSimplified(jpMap[c], true, false, false) : jpMap[c];
      return c + ' -> ' + target;
    });
    const detail = shown.concat(words).join(', ');
    parts.push(japaneseHits.length + ' line(s) with Japanese-only ' +
      (words.length && !chars.length ? 'words' : 'glyphs') + ' (' + detail + ')');
  }

  let message = 'BLOCKED by chinese-script-policy: the content you are about to write contains ' +
    parts.join(', and ') + '.\n';
  if (scriptHits.length) {
    message += simplified
      ? 'Rewrite it in Simplified Chinese: this project stores Simplified.\n'
      : 'Rewrite it in Traditional Chinese. Traditional is the project default;\n' +
        'use Simplified only when the user explicitly asks.\n';
  }
  if (registerHits.length) {
    // The examples are the point of this line, so it carries its own marker: the
    // exemption must not depend on which directory the process happens to run in.
    message += 'Stored data is written in standard written Chinese: rewrite the Cantonese wording\n' + // check-ok
      '(嘅 -> 的, 咗 -> 了, 點解 -> 為什麼, 你行先 -> 你先走) and keep the meaning, not the register.\n' +
      'If these files genuinely hold Cantonese source text, list them in cantonese-allow.json.\n';
  }
  if (japaneseHits.length) {
    message += 'Those glyphs are Japanese forms (shinjitai), not Chinese - usually a\n' +
      'pasted or IME-slipped character. Use the ' + (simplified ? 'Simplified' : 'Traditional') +
      ' form (see the arrows above);\n' +
      'pipe the text through the converter to fix them all at once:\n' +
      '  node scripts/tradzh.js --fix ' + (simplified ? '--to-simplified' : '--to-traditional') +
      ' --write <file> < <file>\n';
  }
  message += 'If a line must keep the original on purpose, mark it with "check-ok" (or "simplified-example").\n';
  return message;
}

/**
 * Decide whether writing `text` (to `target`, when known) must be refused.
 * @param {string} text - the content about to be written.
 * @param {{target?: string, scriptTarget?: 'traditional'|'simplified', axes?: {script?: boolean, register?: boolean, japanese?: boolean}}} [options]
 *   `scriptTarget` is WHICH script this project stores; the script axis then flags
 *   the other one (traditional -> Simplified-only glyphs, simplified ->
 *   Traditional-only glyphs). Defaults to 'traditional'.
 * @returns {{scriptHits: unknown[], registerHits: unknown[], japaneseHits: unknown[], reason: string}|null}
 *   null when the write is fine (or the file is exempt), otherwise the hits and
 *   the message the model must see.
 */
function guardInspect(text, options = {}) {
  const axes = options.axes || { script: true, register: true, japanese: true };
  const scriptTarget = options.scriptTarget === 'simplified' ? 'simplified' : 'traditional';
  const target = options.target;
  if (target) {
    if (!isTextFile(target)) return null;
    // .tradzhignore wins: the glyph tables ARE lists of the very characters we look
    // for, and locale bundles are Simplified by design.
    try { if (ignored(target)) return null; } catch { /* fall through */ }
  }
  let scriptHits = [];
  let registerHits = [];
  let japaneseHits = [];
  // scanTextVariant is the same scan the CLI runs for --variant, so the axis cannot
  // mean one thing here and another thing there.
  if (axes.script) scriptHits = scanTextVariant(text, scriptTarget);
  if (axes.register) registerHits = scanTextCantonese(text);
  if (axes.japanese) japaneseHits = scanTextJapanese(text);
  // The written axis can be exempted per project without exempting the file from
  // the script axis - that is why there are two mechanisms and not one ignore.
  if (target && axes.register) {
    try { if (cantoneseAllowed(target)) registerHits = []; } catch { /* fall through */ }
  }
  if (!scriptHits.length && !registerHits.length && !japaneseHits.length) return null;
  return {
    scriptHits,
    registerHits,
    japaneseHits,
    scriptTarget,
    reason: guardMessage({ scriptHits, registerHits, japaneseHits, scriptTarget }),
  };
}

module.exports = {
  guardInspect, guardMessage,
  traditionalOnlyGlyphs, japaneseOnlyGlyphs, japaneseTables, toSimplified, toTraditional, toWritten, stripJapanese, scanTextVariant, scanTextWith,
  cantoneseTables, scanTextCantonese, scanTextJapanese, cantoneseAllowed, hitOccurrences, lineSkipped,
  puaChars, scanTextPua,
  TRAD_ONLY_FILE, T2S_FILE, S2T_FILE, CANTONESE_FILE, JAPANESE_FILE, TC_VOCAB_FILE, SC_VOCAB_FILE, COMPAT_FILE, CANTONESE_ALLOW_FILE,
  glyphSet, scanText, summarize, ignored, walk, isTextFile, tcVocabTables, compatChars, scanTextCompat, normalizeCompatibility,
  detectEncoding, readTextSmart, decodeBytes, writeTextUtf8, globToRegExp, scriptMix, chineseScore, knownHanzi,
  consoleHazards, codepageTables, codepageSupported, codepageIsUniversal, codepageRepertoire, CODEPAGE_FILE, CONSOLE_SINK,
  fileTypeTrap, POWER_SHELL_SUFFIX, CMD_SUFFIX,
  LIST_FILE, SKILL_ROOT, SKIP_MARKERS,
};
