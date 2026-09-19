#!/usr/bin/env node
// tradzh - one tool for the whole Traditional/Simplified workflow: read, check,
// convert and write. Keeping it in a single implementation is deliberate: two
// implementations (Node + PowerShell) drifted apart and cost real time chasing
// inconsistent results.
//
// Modes:
//   check   default. scan files/dirs/text and report wrong-script glyphs.
//   write   write UTF-8 (no BOM) AFTER checking; refuses to write simplified.
//   fix     convert (either direction) then write.
//
// Usage:
//   tradzh <file...>                 check files
//   tradzh --dir <dir>               check a directory tree
//   tradzh --text "..."              check a string
//   tradzh --write <file>            check stdin, then write it to <file>
//   tradzh --fix --write <file>      convert stdin, then write it
//   tradzh --to-traditional --text "..."   convert a string and print it
//   tradzh --read <file>             print a file's text, decoding correctly
//   tradzh --encoding <file>         report how a file is encoded
//
// Both conversion directions run offline from tables compiled out of OpenCC
// (see build-s2t.js); OpenCC itself is optional.
//
// Three independent axes are checked:
//   traditional <-> simplified   script/orthography   (table convertible)
//   written                      register: Cantonese colloquial vs written
//                                Chinese (detect only - the model rewrites)
//
// Why this file exists at all: an AI's Traditional/Simplified knowledge is a
// fuzzy impression, not a lookup table. It misreads shared glyphs (您 什麼 可以 我)
// as Simplified, and picks the wrong candidate going Simplified -> Traditional.
// A mechanical check against verified tables avoids both.

const fs = require('fs');
const path = require('path');
// No child_process here on purpose: this CLI used to probe for an installed `opencc`
// binary and prefer it, which made the output depend on the machine. See the note above
// convertToTraditional.

let glyphSet, scanText, summarize, ignored;
try {
  ({
    glyphSet, scanText, scanTextVariant, scanTextPua, puaChars, traditionalOnlyGlyphs, japaneseOnlyGlyphs,
    japaneseTables, cantoneseTables, cantoneseAllowed, toSimplified, toTraditional, toWritten, stripJapanese,
    scanTextCantonese, scanTextJapanese, scanTextCompat, compatChars, summarize, hitOccurrences, ignored, walk, isTextFile, detectEncoding,
    readTextSmart, writeTextUtf8, knownHanzi,
    consoleHazards, codepageSupported, codepageIsUniversal, CODEPAGE_FILE,
  } = require('./lib.js'));
} catch (e) {
  console.error('tradzh: cannot load lib.js: ' + e.message);
  process.exit(2);
}

const UTF8_NO_BOM = 'utf8';

// ------------------------------------------------------------------ convert --
// Simplified -> Traditional runs entirely from the compiled OpenCC tables (see
// build-s2t.js) - no OpenCC install, and no dependence on what happens to be on PATH.
//
// This used to probe for an installed `opencc` and prefer it, because its s2twp config
// rewrites the wording (軟件 -> 軟體). That made the SAME input produce
// different output on different machines (軟體 where OpenCC was installed, 軟件 where it
// was not) - the opposite of what this tool is for. The wording layer is now a
// bundled table, applied only when asked: --wording.
//
// --offline is accepted and is now simply the default behaviour; it is kept so existing
// scripts and documentation do not break.
//
// useJapanese is a separate argument because the Japanese step is opt-in: forgetting to
// forward it here is exactly the bug that made --to-traditional --convert-japanese a
// silent no-op, which is why scripts/cli-selftest.mjs now walks the documented recipes.
function convertToTraditional(text, useWording = false, useJapanese = false) {
  return toTraditional(text, true, true, useWording, useJapanese);
}

// --------------------------------------------------------------------- args ---
function parseArgs(argv) {
  const o = { files: [], mode: 'check', quiet: false, force: false, json: false, text: null, dir: null, target: null, variant: 'traditional', doWrite: false, doConvert: false, offline: false, wording: false, wantJapaneseConvert: false,
    // The console-encoding axis is its own mode with its own default (a codepage, not a
    // glyph table). See references/console-encoding-hazard.md.
    consoleHazard: false, codepage: 950, codepageGiven: false,
    // Which conversion steps to run. One axis per flag, so a caller can run the tool
    // once per step instead of relying on one pass to do everything (see convertText).
    steps: { script: null, written: false, japanese: false } };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quiet') o.quiet = true;
    else if (a === '--force') o.force = true;
    else if (a === '--offline') o.offline = true;
    else if (a === '--wording') o.wording = true;
    else if (a === '--json') o.json = true;
    else if (a === '--console-hazard') o.consoleHazard = true;
    else if (a === '--codepage') { o.codepage = argv[++i]; o.codepageGiven = true; }
    else if (a === '--text') { o.text = argv[++i]; o.mode = 'check'; }
    else if (a === '--dir') { o.dir = argv[++i]; o.mode = 'check'; }
    else if (a === '--write') { o.target = argv[++i]; o.doWrite = true; }
    else if (a === '--fix') { o.doConvert = true; o.doWrite = true; }
    else if (a === '--read') { o.target = argv[++i]; o.mode = 'read'; }
    else if (a === '--encoding') { o.target = argv[++i]; o.mode = 'encoding'; }
    else if (a === '--variant') { o.variant = (argv[++i] || '').toLowerCase(); }
    else if (a === '--simplified') { o.variant = 'simplified'; }
    else if (a === '--traditional') { o.variant = 'traditional'; }
    else if (a === '--written') { o.variant = 'written'; }
    else if (a === '--japanese') { o.variant = 'japanese'; }
    else if (a === '--to-simplified') { o.variant = 'simplified'; o.doConvert = true; o.steps.script = 'simplified'; }
    else if (a === '--to-traditional') { o.variant = 'traditional'; o.doConvert = true; o.steps.script = 'traditional'; }
    else if (a === '--to-written') { o.variant = 'written'; o.doConvert = true; o.steps.written = true; }
    else if (a === '--convert-japanese') { o.doConvert = true; o.steps.japanese = true; }
    else if (a === '--to-japanese') { o.wantJapaneseConvert = true; }
    else if (a === '--help' || a === '-h') o.mode = 'help';
    // Anything else starting with a dash is an error, never a file name. Silently
    // ignoring an unknown flag makes a typo - or a flag that was RENAMED - look like it
    // worked, and the wording layer simply does not get applied. The wording flags were
    // collapsed into one in 1.1.0, so those get a pointer instead of a generic message.
    else if (a.startsWith('-') && a !== '-') {
      const renamed = { '--tw-vocab': '--wording', '--cn-vocab': '--wording',
        '--tc-vocab': '--wording', '--sc-vocab': '--wording' };
      o.argError = renamed[a]
        ? a + ' was renamed to ' + renamed[a] + ' in 1.1.0'
        : 'unknown option: ' + a;
    }
    else o.files.push(a);
  }
  return o;
}



function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
    setTimeout(() => resolve(d), 5000);
  });
}

function reportFindings(label, hits, o, puaHits, compatHits) {
  const { lines, chars } = summarize(hits);
  const axis = hitOccurrences(hits);
  const pua = puaHits ? hitOccurrences(puaHits) : 0;
  const compat = compatHits ? hitOccurrences(compatHits) : 0;
  if (!hits.length && !pua && !compat) {
    if (!o.quiet && !o.json) console.log('OK    ' + label);
    return { axis: 0, pua: 0, compat: 0 };
  }
  if (!o.quiet && hits.length) {
    if (o.json) {
      const phrases = [...new Set(hits.flatMap((h) => h.phrases ?? []))];
      console.log(JSON.stringify({ file: label, lines, chars, ...(phrases.length ? { phrases } : {}) }, null, 2));
    } else {
      console.log('FAIL  ' + label + '  (' + lines + ' line(s), ' + axis + ' occurrence(s))');
      for (const h of hits) {
        const cps = (h.chars ?? []).map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
        const parts = [];
        if (cps.length) parts.push(cps.join(' '));
        if (h.phrases && h.phrases.length) parts.push(h.phrases.join(' '));
        console.log('        line ' + h.line + ': ' + parts.join('   |   '));
        console.log('          ' + h.text);
      }
    }
  }
  if (puaHits && puaHits.length) {
    if (!o.quiet) {
      const cps = [...new Set(puaHits.flatMap((h) => h.chars))]
        .map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
      console.log('WARN  ' + label + '  (' + puaHits.length + ' line(s), ' + pua +
        ' private-use character(s): ' + cps.join(' ') + ')');
      console.log('        Private-use characters (U+E000-U+F8FF) are not real hanzi. A Big5/HKSCS file');
      console.log('        decoded through a PUA mapping looks exactly like this - the characters were');
      console.log('        lost. Convert the source to UTF-8 with an HKSCS-aware tool before using it.');
    }
  }
  if (compatHits && compatHits.length) {
    if (!o.quiet) {
      const pairs = [...new Set(compatHits.flatMap((h) => h.chars))]
        .map((c) => c + ' (U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')');
      console.log('WARN  ' + label + '  (' + compatHits.length + ' line(s), ' + compat +
        ' compatibility ideograph(s): ' + pairs.join(' ') + ')');
      console.log('        These are DUPLICATE encodings of ordinary characters (U+F900-U+FAFF and');
      console.log('        friends), usually from round-tripping Big5 / JIS / KS X 1001 text. They look');
      console.log('        identical and break search, dedup and comparison. Conversion normalises them;');
      console.log('        see references/encoding.md.');
    }
  }
  return { axis, pua, compat };
}

// What each axis is called in messages, and how its table size is reported.
const AXES = {
  traditional: { label: 'Traditional', bad: 'Simplified-only glyphs', size: () => glyphSet().size + ' glyphs' },
  simplified: { label: 'Simplified', bad: 'Traditional-only glyphs', size: () => traditionalOnlyGlyphs().size + ' glyphs' },
  written: {
    label: 'written Chinese',
    bad: 'Cantonese colloquial markers',
    size: () => {
      const t = cantoneseTables();
      return t.chars.size + ' glyphs + ' + t.phrases.length + ' phrases + ' +
        t.weakPhrases.length + ' weak (need corroboration) + ' + t.patterns + ' patterns';
    },
  },
  japanese: {
    label: 'Traditional Chinese (no Japanese forms)',
    bad: 'Japanese-only glyphs',
    // Two layers: characters (竜 発 図, which --to-traditional can rewrite) and words  // check-ok
    // (予定 予約 丁寧, detection only - their characters are all valid Chinese).  // check-ok
    size: () => { const t = japaneseTables(); return t.chars.size + ' glyphs + ' + t.phrases.length + ' phrases'; },
  },
};

// The axis descriptions quote the very glyphs the axes flag, so those lines carry the
// checker's `check-ok` marker - which is maintenance metadata, not help text. Strip it
// on the way out (see the console.log below) so --help stays readable.
const HELP = `tradzh - Traditional/Simplified workflow in one tool

  tradzh <file...>                 check files (Traditional by default)
  tradzh --dir <dir>               check a directory tree
  tradzh --text "..."              check a string
  tradzh --write <file>            read stdin, check it, then write UTF-8 (no BOM)
  tradzh --fix <file>              convert from stdin, check, then write
  tradzh --read <file>             print file text, decoding it correctly
  tradzh --encoding <file>         report a file's encoding

  --variant <traditional|simplified|written|japanese>   which axis the text must satisfy
  --simplified / --traditional / --written / --japanese  shorthand for --variant
  --to-simplified / --to-traditional   script step: set the variant AND convert (with --fix)
  --to-written                         register step: Cantonese -> written Chinese, the
                                       unambiguous subset only (嘅 -> 的, 唔該 -> 謝謝).  // check-ok
                                       What it cannot convert it reports, and the written
                                       axis still refuses to store the rest
  --convert-japanese                   Japanese step: shinjitai -> Traditional
                                       (竜 -> 龍). OFF unless asked for, because a document  // check-ok
                                       may quote Japanese on purpose  // check-ok
  --wording                            also use the target script's local wording; OFF by
                                       default. WHICH table applies is decided by the
                                       direction: 簡->繁 uses 繁體偏好 (軟件 -> 軟體、硬碟、
                                       滑鼠、資訊), 繁->簡 uses 簡體偏好 (軟體 -> 软件、  // check-ok
                                       網路 -> 网络、計程車 -> 出租车). Off by default  // check-ok
                                       because both wordings are correct Chinese, so
                                       switching them is a preference, not a correction
  --console-hazard                     a THIRD axis, independent of script / register /
                                       japanese: does a line PRINT a character the target
                                       codepage cannot encode? A file can be correct
                                       Traditional Chinese and still crash a program at run
                                       time - the Windows console is cp950, and cp950
                                       cannot encode 15,402 of the code points measured
                                       (all of CJK ext A, plus 丨 丿 丶, plus every emoji).
                                       Only lines calling print / echo / logging / logger /
                                       log / console / raise are inspected: the same
                                       character in a comment or a variable name never
                                       reaches the console, so it is NOT reported.
  --codepage <n>                       codepage for --console-hazard (default 950).
                                       Tables: 950 936 932 1252 20936. 54936 (GB18030) and
                                       65001 (UTF-8) encode every Unicode character, so
                                       they can never report anything. Careful: 936 is what
                                       Windows calls "gb2312" but it is really GBK (it
                                       encodes Traditional too); the strict GB2312-80
                                       repertoire is 20936, which cannot encode 體 軟 淨.
  --quiet   exit code only        --force  overwrite without refusing
  --json    machine-readable output
  --offline accepted for compatibility; the built-in tables are now the only path,
            so behaviour never depends on whether OpenCC happens to be installed

Each conversion axis is its own step, so run the tool once per step:
    tradzh --convert-japanese --write a.txt < in.txt     # 1. clear Japanese
    tradzh --to-written       --write b.txt < a.txt      # 2. Cantonese -> written Chinese
    tradzh --to-traditional   --write c.txt < b.txt      # 3. script, 繁 or 簡
ORDER MATTERS, and there is exactly one right one: 竜 has no entry in the  // check-ok
Traditional->Simplified tables, so the Japanese step has to come before 繁->簡
(竜 -> 龍 -> 龙). Doing it the other way leaves 龍 in a Simplified file - which the  // check-ok
Simplified axis then flags, so the mistake is loud rather than silent.

Exit: 0 clean / 1 wrong-variant glyph found OR a file that could not be decoded /
      2 usage or IO error.

Encoding: files whose bytes fit no known encoding are reported as WARN and counted
in the exit code - a file that was never checked must not look like a clean one.
Files positively identified as another language (Japanese, Korean, single-byte
Latin/Cyrillic) get a NOTE instead: there is nothing Chinese in them to check.
--read on either kind exits 2 with the reason, rather than printing mojibake.

Private-use characters (U+E000-U+F8FF) are always reported as a warning: they are
the signature of a Big5/HKSCS file decoded through a PUA mapping, in which those
characters were silently lost. See references/encoding.md.

The script axis has TWO DIRECTIONS and you use ONE of them; the two filter axes are
separate switches that stack on top:
  --variant traditional (default) flags Simplified-only glyphs
  --variant simplified           flags Traditional-only glyphs
  --variant written              flags Cantonese colloquial markers (glyphs AND
                                 phrases - some Cantonese wording uses only
                                 standard characters, so the phrase layer matters)
  --variant japanese             flags Japanese-only glyphs (shinjitai: 竜 発 図 円 駅).  // check-ok
                                 These are neither Simplified nor Traditional, so the
                                 Simplified table cannot see them. Characters that are
                                 also valid Traditional Chinese (峰 群 床 才) are NOT
                                 in this table - flagging them would be a false alarm.
                                 It also flags Japanese-only WORDS (予定 予約 丁寧 世論),  // check-ok
                                 whose characters are all valid Chinese.
                                 Conversion is a separate, opt-in step: --convert-japanese
                                 rewrites the glyphs (竜 -> 龍), and the words are  // check-ok
                                 DETECTION ONLY - the model has to rewrite those. Words
                                 that Chinese also uses (交差 暴露 放棄) are not in it.

Write mode refuses to persist text that fails the axis unless those lines are
marked check-ok, or --force is given. Files listed in .tradzhignore are skipped;
for the written axis a project can also keep <cwd>/cantonese-allow.json.

Conversion is built in for BOTH script directions and needs no OpenCC install:
  Traditional -> Simplified  4,148 characters + 480 phrase entries
  Simplified -> Traditional  4,012 characters + 49,257 phrase entries
                             + OpenCC TWVariants, so the output uses the common
                             glyph forms (裡, 麵)
                             + 830 entries of 繁體偏好 wording (軟件 -> 軟體, 硬盤 -> 硬碟)
                               and 810 of 簡體偏好 wording; either table applies only with
                               --wording, which picks it by the conversion direction
Compatibility ideographs (U+F900-FAFF and friends) are normalised by BOTH conversion
directions and reported as a warning when checking: they are DUPLICATE encodings of
ordinary characters, usually from round-tripping Big5 / JIS / KS X 1001 text. They look
identical and break search, dedup and comparison silently. See references/encoding.md.

The reverse wording layer is opt-in too, and it is the other half of the same switch:
--wording applies whichever table matches the direction (繁->簡 rewrites tc wording into
wording on the Traditional side before 繁 -> 簡 (軟體 -> 軟件 -> 软件). Without it a  // check-ok
Simplified file keeps tc wording (软体, 网路, 计程车), which a Simplified reader does not write.

The Japanese step is NOT part of either one unless you ask (--convert-japanese): a
document may quote Japanese, and 竜 -> 龍 / 竜 -> 龍 -> 龙 is a rewrite the caller  // check-ok
should choose. Kokuji cannot be converted either way (畑 stays 畑), which is why the  // check-ok
axis only flags them.
No installed OpenCC is consulted: the same input gives the same output on every machine.

Register conversion is PARTIAL by design: --to-written converts only the Cantonese that
cannot occur in written Chinese at all (嘅 -> 的, 唔該 -> 謝謝, 冇 -> 沒有). Everything made  // check-ok
of ordinary characters (屋企, 邊度, 得閒, 點解) stays detection-only, because those strings  // check-ok
do occur across word boundaries in written text (房屋企業, 旁邊度過, 取得閒置, 早點解決).  // check-ok
Word order and grammar (你行先 -> 你先走, 畀本書我 -> 給我一本書) are the model's job, so
run --to-written, then let the model rewrite what the report says is left.`;

// The conversion pipeline, in the one correct order (see core.js):
//   japanese  ->  register  ->  script
// 竜 has no entry in the Traditional->Simplified tables, so the Japanese step has to run  // check-ok
// before 繁->簡 for 竜 -> 龍 -> 龙 to work; running it after would leave 龍 in a Simplified  // check-ok
// file (which the Simplified axis then flags, so the mistake is loud, not silent).
function convertText(text, o) {
  let out = String(text);
  if (o.steps.japanese && o.steps.script !== 'traditional') out = stripJapanese(out);
  if (o.steps.written) out = toWritten(out);
  // --wording is ONE switch for one preference, not two tables to choose from: the
  // DIRECTION picks the table (簡->繁 uses 繁體偏好, 繁->簡 uses 簡體偏好), so there is no
  // way to pair the wrong wording with a direction.
  if (o.steps.script === 'traditional') out = convertToTraditional(out, o.wording, o.steps.japanese);
  else if (o.steps.script === 'simplified') out = toSimplified(out, true, false, o.wording);
  return out;
}

// A partial conversion must never look complete. After converting, report what is left
// in the axes we did NOT just convert - silently leaving Cantonese or Japanese words
// behind is exactly the failure mode this project keeps having to fix.
function reportLeftovers(text, o) {
  if (o.quiet) return;
  const left = [];
  if (o.variant !== 'written') {
    const h = scanTextCantonese(text);
    if (h.length) left.push(hitOccurrences(h) + ' Cantonese marker(s): ' + marksOf(h).join(' '));
  }
  if (o.variant !== 'japanese') {
    const h = scanTextJapanese(text);
    if (h.length) left.push(hitOccurrences(h) + ' Japanese-only item(s): ' + marksOf(h).join(' '));
  }
  for (const line of left) {
    console.error('tradzh: note - the converted text still has ' + line);
  }
  if (left.length) {
    console.error('        Conversion only covers what a table can decide; these need the model to rewrite.');
  }
}

function marksOf(hits) {
  const out = new Set();
  for (const h of hits) {
    for (const c of h.chars || []) out.add(c);
    for (const p of h.phrases || []) out.add(p);
  }
  return [...out];
}

// -------------------------------------------------- console-hazard axis ------
// A THIRD axis, and deliberately NOT folded into the others: "required Traditional" says
// nothing about whether a character can survive being PRINTED, and a file can be perfectly
// correct Traditional and still crash a program at run time. See
// references/console-encoding-hazard.md for the measured case that started this
// (a ComfyUI node printing a Simplified glyph to a cp950 console, which killed the node and
// whose traceback could not even be written to the log).
const HAZARD_SINKS = 'print / echo / logging / logger / log / console / raise';

function runConsoleHazard(o) {
  const cp = Number(o.codepage);
  if (!Number.isInteger(cp) || cp <= 0) {
    console.error('tradzh: --codepage must be a positive integer, e.g. --codepage 950');
    process.exit(2);
  }
  if (o.doWrite || o.doConvert) {
    console.error('tradzh: --console-hazard only CHECKS. It cannot convert or write:');
    console.error('        whether a character is printable is a property of the target');
    console.error('        console, not of the text, so there is nothing to rewrite.');
    process.exit(2);
  }
  const support = codepageSupported();
  if (!codepageIsUniversal(cp) && !support.tables.includes(cp)) {
    console.error('tradzh: no codepage table for ' + cp + ' in this build.');
    console.error('        tables: ' + support.tables.join(', ') +
      '   |   encode everything: ' + support.universal.join(', '));
    console.error('        extend the table with: powershell -NoProfile -ExecutionPolicy Bypass' +
      ' -File scripts/build-codepage.ps1');
    process.exit(2);
  }

  const targets = [];
  if (o.text !== null) {
    targets.push({ label: '(inline text)', text: o.text });
  } else {
    let files = o.files.slice();
    if (o.dir) files = files.concat(walk(o.dir, []));
    files = files.filter((f) => {
      try { return fs.statSync(f).isFile(); } catch { return false; }
    });
    if (!files.length) {
      console.error('tradzh: no readable text files');
      process.exit(2);
    }
    for (const f of files) {
      if (ignored(f)) { if (!o.quiet && !o.json) console.log('IGNORE ' + f); continue; }
      let text;
      try {
        const r = readTextSmart(f);
        if (r.text === null) {
          // Same distinction as the script axis: "nothing to check here" is not a finding,
          // but it must never look like "checked and clean" either.
          if (!o.quiet && !o.json) console.log('NOTE  ' + f + '  (' + r.label + ' - nothing to check)');
          continue;
        }
        text = r.text;
      } catch (e) {
        if (!o.quiet) console.log('SKIP  ' + f + '  (' + e.message + ')');
        continue;
      }
      targets.push({ label: f, text });
    }
  }
  if (!targets.length) {
    if (!o.quiet && !o.json) console.log('RESULT: clean - every file was excluded by .tradzhignore');
    process.exit(0);
  }

  let occurrences = 0;
  let filesWithHits = 0;
  for (const target of targets) {
    const found = consoleHazards(target.text, { codepage: cp });
    if (!found.lines.length) {
      if (!o.quiet && !o.json) console.log('OK    ' + target.label);
      continue;
    }
    const n = found.lines.reduce((a, l) => a + l.chars.length, 0);
    occurrences += n;
    filesWithHits++;
    if (o.json) {
      console.log(JSON.stringify({
        file: target.label,
        codepage: cp,
        lines: found.lines.map((l) => ({
          line: l.line,
          chars: l.chars.map((c) => ({
            char: c,
            codepoint: 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
          })),
        })),
      }, null, 2));
      continue;
    }
    if (o.quiet) continue;
    console.log('FAIL  ' + target.label + '  (' + found.lines.length + ' line(s), ' + n +
      ' character(s) cp' + cp + ' cannot encode)');
    for (const l of found.lines) {
      const marks = l.chars.map((c) => c + ' (U+' +
        c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')');
      console.log('        line ' + l.line + ': ' + marks.join(' '));
      console.log('          ' + l.text);
    }
  }

  if (!o.quiet && !o.json) {
    console.log('');
    if (!occurrences) {
      console.log('RESULT: clean - nothing printed to a cp' + cp + ' console cannot encode');
    } else {
      console.log('RESULT: ' + occurrences + ' character(s) cp' + cp + ' cannot encode, in ' +
        filesWithHits + ' file(s)');
    }
    console.log('        HEURISTIC, not a proof: only lines calling ' + HAZARD_SINKS);
    console.log('        were inspected. The same character in a comment or a variable name');
    console.log('        never reaches the console and is not reported. See');
    console.log('        references/console-encoding-hazard.md.');
  }
  process.exit(occurrences ? 1 : 0);
}

// --------------------------------------------------------------------- main ---
(async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.argError) {
    console.error('tradzh: ' + o.argError);
    console.error("        run 'tradzh --help' for the flag list.");
    process.exit(2);
  }
  // --fix with no step named still means the script direction, which is what it always
  // meant; and a Japanese-only run is verified against the Japanese axis so the words it
  // cannot convert are reported instead of passing as "clean".
  if (o.doConvert && !o.steps.script && !o.steps.written && !o.steps.japanese) {
    o.steps.script = (o.variant === 'simplified') ? 'simplified' : 'traditional';
  }
  if (o.steps.japanese && !o.steps.script && !o.steps.written) o.variant = 'japanese';
  // --wording modifies the script step and needs a direction, because WHICH table applies
  // is decided by that direction. Doing nothing silently is the failure mode this project
  // refuses, so an unusable --wording is an error.
  if (o.wording && o.steps.script !== 'traditional' && o.steps.script !== 'simplified') {
    console.error('tradzh: --wording needs a direction: it applies the TARGET script\'s wording,');
    console.error('        so use it with --to-traditional or --to-simplified (or plain --fix).');
    process.exit(2);
  }
  if (!Object.prototype.hasOwnProperty.call(AXES, o.variant)) {
    console.error("tradzh: --variant must be 'traditional', 'simplified', 'written' or 'japanese'");
    process.exit(2);
  }
  if (o.wantJapaneseConvert) {
    console.error('tradzh: there is no --to-japanese. The Japanese axis only goes one way:');
    console.error('        Japanese -> Traditional (竜 -> 龍, 発 -> 發, 図 -> 圖). Use --convert-japanese');  // check-ok
    console.error('        for that step, or --to-traditional --convert-japanese for both at once.');
    console.error('        Writing Japanese is not something this tool can invent.');
    process.exit(2);
  }
  if (o.mode === 'help' || (!o.files.length && !o.text && !o.dir && !o.target)) {
    console.log(HELP.replace(/[ \t]*(?:\/\/|#) check-ok/g, ''));
    process.exit(o.mode === 'help' ? 0 : 2);
  }

  // The console-encoding axis runs INSTEAD of the script axes, never alongside them: it
  // has its own default (a codepage, not a glyph table), its own message, and no opinion
  // about which script the text is in.
  if (o.consoleHazard) { runConsoleHazard(o); return; }
  if (o.codepageGiven) {
    console.error('tradzh: --codepage only applies to --console-hazard.');
    console.error('        Without it nothing would use the codepage, and silently ignoring');
    console.error('        a flag is how a typo or a renamed flag looks like it worked.');
    process.exit(2);
  }

  // encoding report
  if (o.mode === 'encoding') {
    const det = detectEncoding(fs.readFileSync(o.target), knownHanzi());
    if (o.json) console.log(JSON.stringify({ file: o.target, ...det }, null, 2));
    else console.log(o.target + ': ' + det.label);
    process.exit(0);
  }

  // read text correctly
  if (o.mode === 'read') {
    const { text, label } = readTextSmart(o.target);
    if (text === null) { console.error('tradzh: ' + o.target + ' is ' + label); process.exit(2); }
    // A decoded file can look fine and still have lost characters: see scanTextPua.
    // The warning goes to stderr so it never contaminates the text on stdout.
    const pua = puaChars(text);
    if (pua.length) {
      const cps = pua.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
      console.error('tradzh: warning - ' + pua.length + ' private-use character(s) in ' + o.target +
        ': ' + cps.join(' '));
      console.error('        (' + label + ') These are not real hanzi. A Big5/HKSCS file decoded through a');
      console.error('        PUA mapping looks like this; convert it to UTF-8 with an HKSCS-aware tool first.');
    }
    process.stdout.write(text);
    process.exit(0);
  }

  // write (and optionally convert) from stdin
  if (o.doWrite) {
    let text = await readStdin();
    if (!text) { console.error('tradzh: no stdin content to write'); process.exit(2); }

    // Conversion, if requested. Each step is opt-in; see convertText for the order.
    if (o.doConvert) {
      text = convertText(text, o);
      reportLeftovers(text, o);
    }

    const hits = scanTextVariant(text, o.variant);
    const total = hitOccurrences(hits);
    // Private-use characters are a warning on write, not a refusal: writing is an
    // explicit user action, and a file may legitimately carry PUA glyphs.
    const pua = puaChars(text);
    if (pua.length && !o.quiet) {
      const cps = pua.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
      console.error('tradzh: warning - writing ' + pua.length + ' private-use character(s): ' + cps.join(' '));
      console.error('        They are not real hanzi; if this text came from a Big5/HKSCS file it lost');
      console.error('        its characters in decoding. See references/encoding.md.');
    }
    // Compatibility ideographs are the same class of invisible problem: duplicate code
    // points for ordinary characters. Conversion normalises them, so this is a warning.
    const compat = compatChars(text);
    if (compat.length && !o.quiet) {
      const cps = compat.map((c) => c + ' (U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ')');
      console.error('tradzh: warning - writing ' + compat.length + ' compatibility ideograph(s): ' + cps.join(' '));
      console.error('        These are duplicate encodings, not lost characters; conversion normalises them.');
    }
    if (total && !o.force) {
      reportFindings('(refused write to ' + o.target + ')', hits, o);
      if (!o.quiet) {
        console.error('tradzh: refusing to write ' + AXES[o.variant].label + ' content - it still contains ' +
          AXES[o.variant].bad + '.');
        console.error('        Fix them, mark the lines check-ok, or pass --force.');
      }
      process.exit(1);
    }
    writeTextUtf8(o.target, text);
    if (!o.quiet) {
      console.log('WROTE ' + o.target + '  (UTF-8 no BOM, ' + text.length + ' chars, ' +
        AXES[o.variant].label + (total ? ', ' + total + ' wrong-variant forced' : ', clean') + ')');
    }
    process.exit(0);
  }

  // default: check (and convert first, when asked)
  if (o.text !== null) {
    let text = o.text;
    if (o.doConvert) {
      text = convertText(text, o);
      if (!o.json) console.log('CONVERTED: ' + text);
      reportLeftovers(text, o);
    }
    const found = reportFindings('(inline text)', scanTextVariant(text, o.variant), o, scanTextPua(text), scanTextCompat(text));
    const total = found.axis + found.pua + found.compat;
    if (!o.quiet) console.log('\n' + (total ? 'RESULT: ' + total + ' occurrence(s)' : 'RESULT: clean'));
    process.exit(total ? 1 : 0);
  }

  let files = o.files.slice();
  if (o.dir) files = files.concat(walk(o.dir, []));
  files = files.filter((f) => {
    try { return fs.statSync(f).isFile(); } catch { return false; }
  });

  // Distinguish "there was nothing to look at" from "everything was excluded by
  // .tradzhignore". The second is a clean result, not an error - reporting it as
  // one made a fully-ignored directory look like a failure.
  if (!files.length) {
    const searchRoot = o.dir || (o.files.length ? path.dirname(o.files[0]) : '.');
    let present = [];
    try { present = o.dir ? walk(o.dir, [], true) : []; } catch { /* ignore */ }
    if (present.length) {
      if (!o.quiet) console.log('RESULT: clean - all ' + present.length + ' file(s) excluded by .tradzhignore');
      process.exit(0);
    }
    console.error('tradzh: no readable text files');
    process.exit(2);
  }

  let axisTotal = 0;
  let puaTotal = 0;
  let compatTotal = 0;
  let unreadable = 0;
  for (const f of files) {
    if (ignored(f)) { if (!o.quiet && !o.json) console.log('IGNORE ' + f); continue; }
    // The register axis can be exempted per project. Honouring it here too keeps
    // the CLI and the write hook from disagreeing about the same file.
    if (o.variant === 'written' && cantoneseAllowed(f)) {
      if (!o.quiet && !o.json) console.log('ALLOW ' + f + '  (cantonese-allow.json)');
      continue;
    }
    let text;
    try {
      const r = readTextSmart(f);
      if (r.text === null) {
        if (r.enc === 'undecodable') {
          // Silence here was the real bug: no known encoding fits, so no Chinese
          // check ran on this file, and the run still said "clean". It is counted
          // so the exit code carries the fact too.
          unreadable++;
          if (!o.quiet) {
            if (o.json) {
              console.log(JSON.stringify({ file: f, error: 'could not decode', label: r.label }, null, 2));
            } else {
              console.log('WARN  ' + f + '  (' + r.label + ' - NOT checked)');
              console.log('        No known encoding fits this file, so no Chinese check ran on it. If it is');
              console.log('        a Chinese file, find its real encoding and convert it to UTF-8 first.');
            }
          }
        } else if (!o.quiet && !o.json) {
          // A definite answer ("this is Japanese") or a definite non-text file.
          // Reported so it is never mistaken for "checked and clean", but it is not
          // a finding: there is nothing to check in a file that is not Chinese.
          console.log('NOTE  ' + f + '  (' + r.label + ' - nothing to check)');
        }
        continue;
      }
      text = r.text;
    } catch (e) {
      if (!o.quiet) console.log('SKIP  ' + f + '  (' + e.message + ')');
      continue;
    }
    const found = reportFindings(f, scanTextVariant(text, o.variant), o, scanTextPua(text), scanTextCompat(text));
    axisTotal += found.axis;
    puaTotal += found.pua;
    compatTotal += found.compat;
  }

  const total = axisTotal + puaTotal + compatTotal;
  if (!o.quiet && !o.json) {
    console.log('');
    if (total === 0 && unreadable === 0) {
      console.log('RESULT: clean - no ' + AXES[o.variant].bad + ' (' + AXES[o.variant].size() + ' checked)');
    } else {
      const parts = [];
      if (axisTotal) parts.push(axisTotal + ' ' + AXES[o.variant].bad);
      if (puaTotal) parts.push(puaTotal + ' private-use character(s) (see the warnings above)');
      if (compatTotal) parts.push(compatTotal + ' compatibility ideograph(s) (see the warnings above)');
      if (unreadable) parts.push(unreadable + ' file(s) that could not be decoded (NOT checked - see the warnings above)');
      console.log('RESULT: ' + parts.join(' + '));
    }
  }
  process.exit(total === 0 && unreadable === 0 ? 0 : 1);
})();
