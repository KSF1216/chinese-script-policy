#!/usr/bin/env node
// Pins the API the README documents for WEB APPLICATIONS.
//
// Why this file exists: the package used to expose only "." (the DSH plugin) and
// "./client" (the browser settings card), so a web app could not write the obvious
// `import { scanText } from 'chinese-script-policy/lib'` - Node answered
// ERR_PACKAGE_PATH_NOT_EXPORTED. That was never a JavaScript limitation: core.js is
// dependency-free and runs in both Node and the browser (it IS the engine behind
// dist/tradzh.html). It was one missing line in the exports map - exactly the kind of
// thing that silently regresses, hence this test.
//
// Layers, each one measured rather than assumed:
//   1. the packaging contract: every documented subpath exists and points at a real file
//   2. the ESM shim: named exports are invisible through a UMD wrapper, so core.mjs
//      re-exports them - and must re-export EXACTLY the keys core.js has
//   3. the two documented recipes, which must AGREE with each other:
//        - server  : lib.js   - reads the bundled JSON tables itself (needs fs)
//        - no-fs   : core.js  - the same algorithm with tables injected by hand
//                  (browser bundle, Edge/Workers, or any runtime without fs)
//
// Test data is written with \u escapes on purpose: this file has to pass the repo's own
// Simplified / Japanese axes, so the fixtures below are code points, not literals.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let checks = 0;
let failed = 0;
function ok(label, cond, detail) {
  checks++;
  if (cond) { console.log('  ok   ' + label); }
  else { failed++; console.log('  FAIL ' + label + (detail ? '  <- ' + detail : '')); }
}

// SIMP: one short sentence in Simplified - the U+8F6F U+4EF6 word for "software"  // check-ok
// TRAD: the same sentence in Traditional. It becomes the U+8EDF U+4EF6 word, because
//       --wording (tc wording) is OFF by default.
const SIMP = '\u540e\u9762\u7684\u8f6f\u4ef6\u5f88\u5e72\u51c0';
const TRAD = '\u5f8c\u9762\u7684\u8edf\u4ef6\u5f88\u4e7e\u6de8';
const JP = '\u7adc'; // U+7ADC: a shinjitai, neither Traditional nor Simplified

console.log('packaging contract (the exports map)');
{
  const want = {
    '.': './index.mjs',
    './lib': './scripts/lib.js',
    './client': './lib/client.js',
  };
  for (const [key, target] of Object.entries(want)) {
    ok('exports["' + key + '"] -> ' + target,
      pkg.exports[key] === target,
      'got ' + JSON.stringify(pkg.exports[key]));
    ok('  target exists: ' + target, existsSync(path.join(ROOT, target)));
  }
  // ./core is conditional: ESM gets the shim (named exports), CJS and bundlers get the
  // UMD file, which is the same object either way.
  const core = pkg.exports['./core'];
  ok('exports["./core"] is conditional (import/require)', !!core && typeof core === 'object');
  ok('exports["./core"].import -> ./scripts/core.mjs', core && core.import === './scripts/core.mjs',
    core && core.import);
  ok('exports["./core"].require -> ./scripts/core.js', core && core.require === './scripts/core.js',
    core && core.require);
  ok('  target exists: ./scripts/core.mjs', existsSync(path.join(ROOT, 'scripts', 'core.mjs')));
  ok('exports["./tables/*"] -> ./scripts/*.json',
    pkg.exports['./tables/*'] === './scripts/*.json',
    'got ' + JSON.stringify(pkg.exports['./tables/*']));
  // The tables live in scripts/, so a web app can only reach them if scripts/ ships.
  ok('files whitelist ships scripts/', pkg.files.includes('scripts'));
  ok('files whitelist ships examples/', pkg.files.includes('examples'));
  ok('zero runtime dependencies', Object.keys(pkg.dependencies || {}).length === 0);

  // Every file a package.json script tells you to run must be IN the tarball - otherwise
  // `npm test` works in a checkout (which has every file) and dies in the package a user
  // gets. Found 2026-09-20 by unpacking the tarball: `test:cards` pointed at tools/cards.mjs,
  // which was not in `files` at all, and `test:repo` needed cantonese-allow.json, which was
  // not either. scripts/tarball-selftest.mjs is the full check (it runs the suite there);
  // this is the cheap static half that stays in the dev loop.
  const shipped = new Set();
  const addShipped = (rel) => {
    const abs = path.join(ROOT, rel);
    let entries;
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { shipped.add(rel.replace(/\\/g, '/')); return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      addShipped(path.join(rel, entry.name));
    }
  };
  for (const rel of pkg.files || []) addShipped(rel);
  const entryPoints = new Set();
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    for (const match of String(command).matchAll(/(?:\bnode\s+|-File\s+)([^\s"']+)/g)) {
      const target = match[1].replace(/\\/g, '/').replace(/^\.\//, '');
      if (!target.startsWith('-') && /\.(m?js|cjs|ps1)$/i.test(target)) entryPoints.add(target);
    }
  }
  const missing = [...entryPoints].filter((rel) => !shipped.has(rel));
  ok('every script npm may run is shipped (' + entryPoints.size + ' entry point(s))',
    missing.length === 0 && entryPoints.size >= 5, missing.join(', '));
}

console.log('ESM shim (named exports are invisible through a UMD wrapper)');
{
  const cjs = require(path.join(ROOT, 'scripts', 'core.js'));
  const esm = await import(pathToFileURL(path.join(ROOT, 'scripts', 'core.mjs')).href);
  const named = Object.keys(esm).filter((k) => k !== 'default').sort();
  const actual = Object.keys(cjs).sort();
  ok('core.mjs re-exports EXACTLY the keys of core.js',
    JSON.stringify(named) === JSON.stringify(actual),
    'shim: [' + named.join(' ') + ']  core: [' + actual.join(' ') + ']');
  ok('core.mjs default is the very same object', esm.default === cjs);
  ok('shim exposes createCore as a named export', typeof esm.createCore === 'function');
}

console.log('recipe 1: server-side Node (chinese-script-policy/lib)');
{
  const lib = require(path.join(ROOT, 'scripts', 'lib.js'));
  for (const name of ['scanText', 'scanTextCantonese', 'scanTextJapanese',
                      'toTraditional', 'toSimplified', 'toWritten', 'stripJapanese',
                      'guardInspect', 'guardMessage', 'summarize']) {
    ok('lib exports ' + name, typeof lib[name] === 'function');
  }
  ok('lib.toTraditional converts', lib.toTraditional(SIMP) === TRAD, lib.toTraditional(SIMP));
  // Measured: exactly two glyphs in that sentence are Simplified-only - U+8F6F and
  // U+51C0. U+540E and U+5E72 are NOT, because both also exist in Traditional
  // ("queen", "to interfere") - which is why this axis is glyph-based, not
  // "looks Simplified"-based.
  const hits = lib.scanText(SIMP);
  ok('lib.scanText finds the Simplified-only glyphs (measured: U+8F6F, U+51C0)',
    hits.length === 1 && hits[0].chars.length === 2, JSON.stringify(hits));
  ok('lib.scanText is silent on Traditional', lib.scanText(TRAD).length === 0);
  ok('lib.scanTextJapanese finds U+7ADC', lib.scanTextJapanese(JP).length === 1);
  const denied = lib.guardInspect(SIMP);
  ok('lib.guardInspect returns a reason to show the model',
    !!denied && typeof denied.reason === 'string' && denied.reason.length > 0);
  ok('lib.guardInspect returns null for clean text', lib.guardInspect(TRAD) === null);
  // A web app usually wants the axes switchable, the same way the settings card does.
  const off = lib.guardInspect(SIMP, { axes: { script: false, register: false, japanese: false } });
  ok('lib.guardInspect honours axes (all off -> null)', off === null);
  const flipped = lib.guardInspect(SIMP, { scriptTarget: 'simplified' });
  ok('lib.guardInspect can flip the axis (scriptTarget: simplified)',
    flipped === null, 'a Simplified-only glyph cannot violate a Simplified target');
  // The script axis is ONE axis with TWO DIRECTIONS, not two independent axes. Pinning
  // this here because the docs once drew it as two columns and claimed a front end could
  // tick both - which would flag every Chinese document in existence.
  const tradSide = lib.scanTextVariant(TRAD, 'simplified');
  const simpSide = lib.scanTextVariant(SIMP, 'traditional');
  ok('a Traditional text IS flagged by the simplified direction (U+5F8C U+8EDF U+6DE8)',
    tradSide.length === 1 && tradSide[0].chars.length === 3, JSON.stringify(tradSide));
  ok('a Simplified text IS flagged by the traditional direction',
    simpSide.length === 1);
  ok('=> the two directions can never both be required',
    lib.guardInspect(TRAD, { scriptTarget: 'simplified' }) !== null
    && lib.guardInspect(TRAD, { scriptTarget: 'traditional' }) === null);
}

console.log('recipe 2: no-fs runtime (chinese-script-policy/core + injected tables)');
{
  const { createCore } = require(path.join(ROOT, 'scripts', 'core.js'));
  const T = (n) => JSON.parse(readFileSync(path.join(ROOT, 'scripts', n), 'utf8'));
  // These nine names are the documented contract - they are what lib.js's core() passes.
  const tables = {
    simplifiedOnly: T('simplified-only.json'),
    traditionalOnly: T('traditional-only.json'),
    japanese: T('japanese-only.json'),
    tcVocab: T('tc-vocabulary.json'),
    scVocab: T('sc-vocabulary.json'),
    compat: T('cjk-compatibility.json'),
    t2s: T('traditional-to-simplified.json'),
    s2t: T('simplified-to-traditional.json'),
    cantonese: T('cantonese-only.json'),
  };
  const core = createCore(tables);
  const lib = require(path.join(ROOT, 'scripts', 'lib.js'));
  ok('core.toTraditional agrees with lib', core.toTraditional(SIMP) === TRAD);
  ok('core.scanText agrees with lib',
    JSON.stringify(core.scanText(SIMP)) === JSON.stringify(lib.scanText(SIMP)));
  ok('core.scanTextJapanese finds U+7ADC', core.scanTextJapanese(JP).length === 1);
  ok('core.toSimplified round-trips', core.toSimplified(TRAD) === SIMP, core.toSimplified(TRAD));
  // The whole point of core.js: it must not reach for Node built-ins.
  const src = readFileSync(path.join(ROOT, 'scripts', 'core.js'), 'utf8');
  ok('core.js requires nothing from Node',
    !/require\(\s*['"](fs|path|process|node:)/.test(src));
  ok('core.js is UMD (a browser <script> gets window.TradzhCore)',
    src.includes('module.exports = api') && src.includes('root.TradzhCore = api'));
}

console.log('the shipped example is wired the documented way');
{
  const src = readFileSync(path.join(ROOT, 'examples', 'web-app', 'server.mjs'), 'utf8');
  ok('example loads the package by its documented specifier',
    src.includes("require('chinese-script-policy/lib')"));
  ok('example falls back to the repo path so a clone works without installing',
    src.includes("'scripts', 'lib.js'"));
  ok('example uses the SAME guard as the write hook (guardInspect)',
    src.includes('policy.guardInspect'));
}

console.log('what a web app must NOT use');
{
  // ./client is the DSH settings card: it self-registers into the DSH client bundle and
  // touches window at import time. Right for DSH, wrong for a server.
  let threw = null;
  try { require(path.join(ROOT, 'lib', 'client.js')); } catch (e) { threw = e; }
  ok('./client throws outside a browser (documented as DSH-only)',
    !!threw && /window is not defined/.test(String(threw.message)), String(threw && threw.message));
  // And "." is the DSH plugin, not a converter API.
  ok('"." is the DSH plugin, not a converter API',
    existsSync(path.join(ROOT, 'index.mjs')) && pkg.main === 'index.mjs');
}

console.log('terminology: the settled names are pinned, because they regressed twice');
{
  // 2026-09, three rounds of naming:
  //   * the LAYER (one switch) is 用語偏好; the two tables it picks BY DIRECTION are
  //     繁體偏好 and 簡體偏好. Naming the layer 繁簡偏好 is wrong - it sounds like the
  //     script axis - and naming it after a place (兩岸詞彙, 臺灣用語, cross-strait) is
  //     wrong too: the preference is not owned by a region.
  //   * the CHECK frame is "one script axis with two directions (use one) + two filter
  //     axes", never "four axes" - the two directions can never both be on, which the
  //     older wording implied a front end could do.
  // Both regressed more than once, so they are a test rather than a convention.
  // PUBLISHING.md is deliberately NOT scanned: it is the changelog, and explaining the
  // rule means quoting the rejected names - the same reason it has to quote the renamed
  // flags. Every other doc describes the feature itself, so it may not use them.
  const docs = ['README.md', 'SKILL.md', 'THIRD-PARTY-NOTICES.md',
    'examples/web-app/index.html', 'examples/web-app/server.mjs',
    ...readdirSync(path.join(ROOT, 'references')).map((f) => 'references/' + f)];
  const banned = ['\u7e41\u7c21\u504f\u597d', '\u5169\u5cb8\u8a5e\u532f',
    '\u81fa\u7063\u7528\u8a9e', '\u5927\u9678\u7528\u8a9e', 'cross-strait'];
  const offenders = [];
  for (const rel of docs) {
    const src = readFileSync(path.join(ROOT, rel), 'utf8');
    for (const bad of banned) if (src.includes(bad)) offenders.push(rel + ' has ' + bad);
  }
  ok('no doc names the layer after a region, or after the script axis',
    offenders.length === 0, offenders.join('; '));

  const framed = ['README.md', 'SKILL.md'].filter((rel) =>
    /\u56db\u689d\u8ef8|\u4e09\u689d\u8ef8/.test(readFileSync(path.join(ROOT, rel), 'utf8')));
  ok('README and SKILL.md use the 主軸二選一 + 副軸 frame (not "N axes")',
    framed.length === 0, framed.join(', '));
  ok('the npm description describes the wording layer and drops the four-axes claim',
    pkg.description.includes('wording preference') && !/four axes/.test(pkg.description));
  // Measured 2026-09-18: the registry keeps only the first 255 characters of the
  // description (packument AND version document both read 255, while the tarball's
  // package.json had all 514), so 1.1.0's npm page ended mid-word. ASCII-only as well,
  // because we do not know whether that limit counts characters or bytes.
  ok('the npm description fits the registry limit (<=255 chars, ASCII only)',
    pkg.description.length <= 255 && !/[^\x00-\x7F]/.test(pkg.description),
    pkg.description.length + ' chars');
  // PUBLISHING.md carries a copy-paste block for the npm description (one of the four
  // exposure points). Found 2026-09-19: the block had drifted - it was missing the last
  // sentence the real field carried - and nothing could see it, because every other check
  // reads package.json only. Pin the two together.
  //
  // PUBLISHING.md is NOT shipped (it is maintainer-only), so this check has to skip in a
  // tarball install instead of throwing: `npm test` from an unpacked package used to work
  // and a readFileSync on a missing file turned it into ENOENT exit 1 (found 2026-09-20 by
  // unpacking the package and running its own suite). Skipping is announced in the label -
  // a silent pass would be worse than no check.
  const publishing = path.join(ROOT, 'PUBLISHING.md');
  if (existsSync(publishing)) {
    ok('the PUBLISHING.md npm-description block is the real description, verbatim',
      readFileSync(publishing, 'utf8').includes(pkg.description));
  } else {
    ok('the PUBLISHING.md npm-description block was NOT checked (no PUBLISHING.md: tarball install, not a checkout)',
      true);
  }

  // ---------------------------------------------------------------------------
  // The headline table sizes are written into prose in a dozen files, and until 2026-09-20
  // nothing compared them to the data: rebuild a table and every document keeps the old
  // number (PUBLISHING.md section 4 asks a human to keep a map of "number -> files").
  //
  // Two rules keep this from becoming a false-positive machine:
  //   * the values are DERIVED from the data files - never copied from the prose. A copy
  //     would satisfy itself and pass forever, which is the trap this repo already paid for
  //     once (a test that could not fail).
  //   * only numbers >= 100 are pinned: searching prose for "3" or "17" matches dates, line
  //     numbers and other counts, so the small Cantonese counts stay a human checklist item.
  // Numbers are compared with the thousands separator removed, because the prose uses both
  // forms (1,002 and 1002).
  // ---------------------------------------------------------------------------
  {
    const loadTable = (name) => JSON.parse(readFileSync(path.join(ROOT, 'scripts', name), 'utf8'));
    const keys = (value) => Object.keys(value || {}).length;
    // The union is computed by the shipped code itself (scripts/lib.js), not re-derived here:
    // two implementations of the same set would drift, and the point is to check the DOCS.
    const libApi = require(path.join(ROOT, 'scripts', 'lib.js'));
    const jp = loadTable('japanese-only.json');
    const cantonese = loadTable('cantonese-only.json');
    const rows = [
      { what: 'simplified -> traditional phrases', value: keys(loadTable('simplified-to-traditional.json').phrase),
        files: ['SKILL.md', 'THIRD-PARTY-NOTICES.md', 'references/cli.md', 'references/conversion.md',
          'references/data-files.md', 'references/encoding.md', 'scripts/core.js', 'scripts/selftest.js', 'scripts/tradzh.js'] },
      { what: 'knownHanzi union', value: libApi.knownHanzi().size,
        files: ['references/encoding.md', 'scripts/core.js'] },
      { what: 'wording preference (tc) phrases', value: keys(loadTable('tc-vocabulary.json').phrase),
        files: ['SKILL.md', 'references/cli.md', 'references/conversion.md', 'references/data-files.md', 'scripts/tradzh.js'] },
      { what: 'wording preference (sc) phrases', value: keys(loadTable('sc-vocabulary.json').phrase),
        files: ['SKILL.md', 'THIRD-PARTY-NOTICES.md', 'references/cli.md', 'references/conversion.md',
          'references/data-files.md', 'scripts/tradzh.js'] },
      { what: 'compatibility ideographs', value: keys(loadTable('cjk-compatibility.json').map),
        files: ['SKILL.md', 'THIRD-PARTY-NOTICES.md', 'references/data-files.md', 'references/encoding.md'] },
      { what: 'japanese-only characters', value: (jp.chars || []).length,
        files: ['README.md', 'SKILL.md', 'references/cli.md', 'references/data-files.md', 'references/japanese.md'] },
      { what: 'japanese-only phrases', value: (jp.phrases || []).length,
        files: ['README.md', 'SKILL.md', 'references/cli.md', 'references/data-files.md', 'references/japanese.md'] },
      { what: 'japanese-only conversion map', value: keys(jp.map),
        files: ['SKILL.md', 'THIRD-PARTY-NOTICES.md', 'references/data-files.md', 'references/japanese.md'] },
      { what: 'simplified-only glyphs', value: loadTable('simplified-only.json').length,
        files: ['README.md', 'SKILL.md', 'references/cli.md', 'references/data-files.md',
          'references/glyph-table.md', 'references/japanese.md'] },
      { what: 'traditional-only glyphs', value: loadTable('traditional-only.json').length,
        files: ['README.md', 'SKILL.md', 'references/data-files.md'] },
    ];
    const cache = new Map();
    const read = (rel) => {
      if (!cache.has(rel)) {
        cache.set(rel, readFileSync(path.join(ROOT, rel), 'utf8').replace(/(\d),(\d)/g, '$1$2'));
      }
      return cache.get(rel);
    };
    for (const row of rows) {
      const value = row.value;
      const missing = row.files.filter((rel) => !read(rel).includes(String(value)));
      ok('the documents state the current ' + row.what + ' count (' + value + ')',
        missing.length === 0, missing.length ? 'not found in: ' + missing.join(', ') : '');
    }
    // The Cantonese counts are small enough that a prose search proves nothing, but the data
    // itself is still worth pinning: these numbers are the ones PUBLISHING.md lists by hand.
    ok('the cantonese table still has the shape the documents describe (' +
      (cantonese.chars || []).length + ' chars, ' + (cantonese.phrases || []).length + ' phrases, ' +
      (cantonese.weakPhrases || []).length + ' weak, ' + (cantonese.patterns || []).length + ' patterns)',
      (cantonese.chars || []).length === 17 && (cantonese.phrases || []).length === 30 &&
      (cantonese.weakPhrases || []).length === 15 && (cantonese.patterns || []).length === 3);
  }

  // Front ends: ONE switch, same name, in all four places that expose it.
  const page = readFileSync(path.join(ROOT, 'scripts', 'web-page.js'), 'utf8');
  ok('the offline page has exactly one wording checkbox',
    (page.match(/id="opt-wording"/g) || []).length === 1);
  ok('the offline page labels that checkbox 用語偏好',
    /id="opt-wording">\s*\u7528\u8a9e\u504f\u597d/.test(page));
  ok('the offline page tells the user which table the direction picked',
    page.includes('\u7c21\u9ad4\u504f\u597d') && page.includes('\u7e41\u9ad4\u504f\u597d'));
  ok('the CLI --wording flag is a single switch (help text frame fixed)',
    readFileSync(path.join(ROOT, 'scripts', 'tradzh.js'), 'utf8').includes('--wording')
    && !readFileSync(path.join(ROOT, 'scripts', 'tradzh.js'), 'utf8').includes('four axes'));
  ok('the shipped example asks for the switch by the same name',
    readFileSync(path.join(ROOT, 'examples', 'web-app', 'server.mjs'), 'utf8')
      .includes('wording = false'));
}

// ---------------------------------------------------------------------------
// Public files: no machine-specific strings.
//
// PUBLISHING.md asks for this by hand after a publish: unpack the published tarball and scan
// it - no local absolute paths, no tokens, no private project or model names. It is a test
// now. The scope is the WHOLE repo, not just package.json's `files` whitelist:
//
//   * this repo is public, so everything in it is published, not only the tarball;
//   * `package.json` SHIPS but is not in its own `files` list, so a whitelist-driven scan
//     never looked at the one file every install reads first. Found 2026-09-19: its
//     description carried a name that is also a local folder name. Repo-wide subsumes the
//     tarball, so there is no second list to keep in sync.
//
// TWO needle lists, and the split is the whole point:
//   * GENERIC ships. It holds shapes, not names: an absolute Windows user path, a bare drive
//     letter. Useful to anyone who installs this package.
//   * names that are private to ONE machine come from an OPTIONAL, UNVERSIONED file
//     (.ship-deny.txt in the repo root, listed in .gitignore). Naming them inside a file that
//     ships - even split into fragments, even "to forbid them" - publishes them. This block
//     did exactly that once and had to be rewritten; see PUBLISHING.md. The deny file itself
//     is the one file that must be skipped, because it is the list.
// ---------------------------------------------------------------------------
{
  const GENERIC = [
    ['C:' + '\\Users', 'an absolute Windows user path'],
    ['C:' + '/Users', 'an absolute Windows user path'],
    ['H:' + '\\', 'a bare drive letter outside the documented placeholder'],
  ];
  const DENY_FILE = '.ship-deny.txt';
  const extra = existsSync(path.join(ROOT, DENY_FILE))
    ? readFileSync(path.join(ROOT, DENY_FILE), 'utf8').split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    : [];
  const FORBIDDEN = [...GENERIC, ...extra.map((needle) => [needle, 'from the local .ship-deny.txt'])];
  const leaks = (text, list = FORBIDDEN) => list
    .filter(([needle]) => text.includes(needle))
    .map(([needle, why]) => needle + ' (' + why + ')');

  // Prove the detector can fail before trusting a clean result: a guard that cannot be shown
  // to catch anything is not a guard. The sample uses the generic patterns plus a made-up
  // needle, so this self-test never spells out a real name either.
  const synthetic = 'made-up-needle-for-the-self-test';
  const sample = 'text with ' + GENERIC[0][0] + '\\someone and ' + synthetic;
  ok('the public-file leak detector really detects',
    leaks(sample, [...GENERIC, [synthetic, 'synthetic']]).length === 2,
    JSON.stringify(leaks(sample, [...GENERIC, [synthetic, 'synthetic']])));

  // `.board` is machine-local state written by the board plugin that runs over these
  // workspaces (it holds absolute paths by design, which is why it must never ship). It is
  // excluded here for the same reason `node_modules` is: it is not one of our files.
  // `test:tarball` forbids it independently, so this exclusion cannot hide a shipped leak.
  const SKIP = new Set(['node_modules', '.git', DENY_FILE, '.board']);
  // ...but skipping a directory in the LEAK SCAN is only safe if git also refuses to track it.
  // Otherwise the scan looks away while `git add -A` stages absolute paths into a public repo
  // (found 2026-09-22: `.board/board.json` held 14 absolute user-path strings and was untracked
  // but NOT ignored). Tie the two together: every skip beyond the two git always-ignores must
  // be named in .gitignore. This is the cheap check that would have caught it.
  {
    // A tarball install has no .gitignore (it is not in `files`), and nothing there is under
    // version control - so the invariant is not applicable, and the check must SAY that rather
    // than fail. (First version failed the packaged suite: `npm test` inside the tarball went
    // red with "1 of 81 checks failed". `test:tarball` is what caught it.)
    const gitignorePath = path.join(ROOT, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignore = readFileSync(gitignorePath, 'utf8');
      const mustBeIgnored = [...SKIP].filter((entry) => entry !== 'node_modules' && entry !== '.git');
      const notIgnored = mustBeIgnored.filter((entry) => !new RegExp('(^|\\n)\\s*' + entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?\\s*(\\n|$)').test(gitignore));
      ok('everything the leak scan skips is also gitignored (' + mustBeIgnored.join(', ') + ')',
        notIgnored.length === 0,
        'not in .gitignore: ' + notIgnored.join(', '));
    } else {
      ok('the gitignore invariant was NOT checked (no .gitignore: tarball install, not a checkout)', true);
    }
  }
  const TEXT_FILE = /\.(md|txt|js|mjs|cjs|ts|json|ya?ml|html|ps1|cmd|bat|sh)$/i;
  const scanned = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else {
        const rel = path.relative(ROOT, abs);
        if (TEXT_FILE.test(rel)) scanned.push(rel);
      }
    }
  })(ROOT);
  const offenders = [];
  for (const rel of scanned) {
    for (const hit of leaks(readFileSync(path.join(ROOT, rel), 'utf8'))) {
      offenders.push(rel + ' has ' + hit);
    }
  }
  ok('no public file names a machine-specific path, project or model',
    offenders.length === 0, offenders.slice(0, 4).join('; '));
  // The regression test for the hole this rewrite closed: package.json ships but is not in
  // its own `files` list, so a whitelist-driven scan silently skipped it.
  ok('the leak scan covers package.json (it ships without being in its own files list)',
    scanned.includes('package.json'), scanned.length + ' files scanned');
  // Over an empty list this would pass forever, so make sure it really walked the repo.
  // The needle count is in the name so a missing .ship-deny.txt is visible, not silent.
  ok('the leak scan ran with ' + FORBIDDEN.length + ' needle(s) over ' + scanned.length + ' file(s)',
    scanned.length >= 50, scanned.length + ' files');
}

// ---------------------------------------------------------------------------
// The repo's own script files obey the file-type rules SKILL.md states.
//
// This is the rule that was broken BY the repo itself: scripts/build-codepage.ps1 once carried
// 15 non-ASCII bytes in a comment - written by an agent that had just documented the rule - and
// nothing caught it, because the existing checks all looked at Chinese glyph axes and none of
// them looked at the FILE TYPE. Bytes, not glyphs: `.ps1` pure ASCII; `.cmd`/`.bat` pure ASCII
// with CRLF.
// ---------------------------------------------------------------------------
{
  const SKIP = new Set(['node_modules', '.git']);
  const rel = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else rel.push(path.relative(ROOT, abs));
    }
  })(ROOT);

  // Both predicates take the RAW BYTES: a text read would hide the difference between a
  // UTF-8 byte sequence and the ANSI bytes that make PowerShell 5.1 fail (references/encoding.md).
  const nonAsciiBytes = (buf) => {
    let n = 0;
    for (const byte of buf) if (byte > 0x7f) n++;
    return n;
  };
  const loneLf = (buf) => {
    let lf = 0;
    let crlf = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== 10) continue;
      lf++;
      if (i > 0 && buf[i - 1] === 13) crlf++;
    }
    return lf - crlf;
  };

  // Prove both can fail before trusting them: a detector that has never gone red proves nothing.
  ok('the non-ASCII byte detector really detects',
    nonAsciiBytes(Buffer.from('# \u4e2d\u6587')) === 6 &&
    nonAsciiBytes(Buffer.from('# pure ASCII')) === 0,
    String(nonAsciiBytes(Buffer.from('# \u4e2d\u6587'))));
  ok('the lone-LF detector really detects',
    loneLf(Buffer.from('echo a\necho b\necho c')) === 2 && loneLf(Buffer.from('echo a\r\necho b')) === 0,
    String(loneLf(Buffer.from('echo a\necho b\necho c'))));

  const ps1 = rel.filter((f) => /\.(ps1|psm1)$/i.test(f));
  const batch = rel.filter((f) => /\.(cmd|bat)$/i.test(f));
  const ps1Bad = ps1.filter((f) => nonAsciiBytes(readFileSync(path.join(ROOT, f))) > 0);
  const batchBad = batch.filter((f) => {
    const buf = readFileSync(path.join(ROOT, f));
    return nonAsciiBytes(buf) > 0 || loneLf(buf) > 0;
  });
  ok('every .ps1 in the repo is pure ASCII',
    ps1Bad.length === 0, ps1Bad.join(', '));
  ok('every .cmd/.bat in the repo is pure ASCII with CRLF',
    batchBad.length === 0, batchBad.join(', '));
  // Neither list is empty here in practice, but an empty one must not read as a pass.
  ok('the file-type scan really walked the repo (' + ps1.length + ' .ps1, ' + batch.length + ' .cmd/.bat)',
    ps1.length >= 2 && rel.length >= 25, ps1.length + ' .ps1, ' + batch.length + ' batch, ' + rel.length + ' files');
}

console.log('');
if (failed) {
  console.log('FAIL: ' + failed + ' of ' + checks + ' checks failed');
  process.exit(1);
}
console.log('PASS: every documented web-application entry point exists and both recipes agree ('
  + checks + ' checks)');
