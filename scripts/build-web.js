// Builds the standalone offline page into dist/:
//
//   dist/tradzh.html   one page: paste, convert 繁<->簡, and see where the problems
//                      are, per axis. The original textarea is never rewritten by a
//                      conversion - the result goes to its own box.
//
// It inlines scripts/core.js and the five JSON tables, so the file is fully
// self-contained - no server, no network, no LLM, no Node. It is generated from the
// same core and tables as the CLI, and scripts/web-selftest.mjs compares the
// generated page against the CLI's own fixtures, so "same results" is checked, not
// just claimed.
//
// Run `npm run build:web` after changing any table.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.join(HERE, '..');
const OUT_DIR = process.argv[2] || path.join(ROOT, 'dist');

const read = (f) => fs.readFileSync(path.join(HERE, f), 'utf8');
const coreSrc = read('core.js');

// Inlined as JSON inside <script type="application/json"> blocks: no escaping
// games, and JSON.parse of a string is fast even at 1.25 MB. `</` is escaped so
// table content can never close the script tag early.
const embed = (json) => json.replace(/<\//g, '<\\/');
const tables = {
  simplifiedOnly: embed(read('simplified-only.json')),
  traditionalOnly: embed(read('traditional-only.json')),
  japanese: embed(read('japanese-only.json')),
  tcVocab: embed(read('tc-vocabulary.json')),
  scVocab: embed(read('sc-vocabulary.json')),
  t2s: embed(read('traditional-to-simplified.json')),
  s2t: embed(read('simplified-to-traditional.json')),
  cantonese: embed(read('cantonese-only.json')),
};

// Counts shown in the pages come from the tables themselves, so they cannot go
// stale when a table is regenerated.
const counts = {
  s2tChars: Object.keys(JSON.parse(tables.s2t).char).length,
  s2tPhrases: Object.keys(JSON.parse(tables.s2t).phrase).length,
  t2sChars: Object.keys(JSON.parse(tables.t2s).char).length,
  t2sPhrases: Object.keys(JSON.parse(tables.t2s).phrase).length,
  simplifiedOnly: JSON.parse(tables.simplifiedOnly).length,
  traditionalOnly: JSON.parse(tables.traditionalOnly).length,
  japaneseChars: JSON.parse(tables.japanese).chars.length,
  japanesePhrases: JSON.parse(tables.japanese).phrases.length,
  japaneseConvertible: Object.keys(JSON.parse(tables.japanese).map).length,
  tcVocabPhrases: Object.keys(JSON.parse(tables.tcVocab).phrase).length,
  cantoneseChars: JSON.parse(tables.cantonese).chars.length,
  cantonesePhrases: JSON.parse(tables.cantonese).phrases.length,
  // The version, NOT the build date. The page is committed to git so that it can be
  // downloaded and double-clicked, and a date in the output would make every rebuild
  // differ - which would defeat the byte-for-byte freshness check in web-selftest.mjs
  // and turn the committed file into permanent noise in every diff.
  version: JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version,
};

const SHARED_CSS = `
  :root { color-scheme: light dark; --fg:#1a1a1a; --bg:#f6f6f4; --panel:#fff; --line:#d8d8d4;
          --accent:#2b6cb0; --red:#c0392b; --blue:#2b6cb0; --amber:#a06400; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#e8e8e6; --bg:#16181c; --panel:#1e2126; --line:#33383f;
            --accent:#63a4e0; --red:#ff8a80; --blue:#8ab4f8; --amber:#f2c14e; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:16px; background:var(--bg); color:var(--fg);
         font-family: "Segoe UI", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", system-ui, sans-serif; }
  header { max-width:1100px; margin:0 auto 10px; display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
  h1 { font-size:17px; margin:0; font-weight:600; }
  header span { font-size:12px; opacity:.65; }
  main { max-width:1100px; margin:0 auto; display:flex; flex-direction:column; gap:10px; }
  textarea { width:100%; min-height:24vh; padding:12px; font-size:15px; line-height:1.7; resize:vertical;
             background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:8px; font-family:inherit; }
  .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  button { font:inherit; font-size:15px; padding:9px 20px; border-radius:8px; cursor:pointer;
           border:1px solid var(--line); background:var(--panel); color:var(--fg); }
  button:hover { border-color:var(--accent); color:var(--accent); }
  button:active { transform:translateY(1px); }
  #status { font-size:13px; opacity:.8; margin-left:auto; }
  footer { max-width:1100px; margin:12px auto 0; font-size:12px; opacity:.6; line-height:1.6; }
  code { font-family: ui-monospace, Consolas, monospace; }
`;

const page = (title, subtitle, body, uiScript, extraCss) => `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${SHARED_CSS}${extraCss || ''}</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <span>${subtitle}</span>
</header>
<main>
${body}
</main>
<footer>
  簡轉繁：${counts.s2tChars.toLocaleString('en-US')} 字 ＋ ${counts.s2tPhrases.toLocaleString('en-US')} 詞組，並套用常見字形（裡、麵、為），順便把日文新字體換成繁體（其中有 ${counts.japaneseConvertible} 個字有對應的繁體）；另有 ${counts.tcVocabPhrases} 筆繁體偏好（軟件→軟體），要勾「用語偏好」才會套用。
  繁轉簡：${counts.t2sChars.toLocaleString('en-US')} 字 ＋ ${counts.t2sPhrases} 詞組。
  檢查字表：簡體專有 ${counts.simplifiedOnly.toLocaleString('en-US')} 字、繁體專有 ${counts.traditionalOnly.toLocaleString('en-US')} 字、
  日文專有 ${counts.japaneseChars} 字 ＋ ${counts.japanesePhrases} 詞、粵語標記 ${counts.cantoneseChars} 字 ＋ ${counts.cantonesePhrases} 詞組。<br>
  本頁由 <code>chinese-script-policy</code> v${counts.version} 的 <code>scripts/build-web.js</code> 產生，
  轉換與檢查邏輯跟命令列工具共用同一份 <code>core.js</code>，結果一致（有測試在比對）。
</footer>

<script type="application/json" id="tables-simplifiedOnly">${tables.simplifiedOnly}</script>
<script type="application/json" id="tables-traditionalOnly">${tables.traditionalOnly}</script>
<script type="application/json" id="tables-japanese">${tables.japanese}</script>
<script type="application/json" id="tables-tcVocab">${tables.tcVocab}</script>
<script type="application/json" id="tables-scVocab">${tables.scVocab}</script>
<script type="application/json" id="tables-t2s">${tables.t2s}</script>
<script type="application/json" id="tables-s2t">${tables.s2t}</script>
<script type="application/json" id="tables-cantonese">${tables.cantonese}</script>

<script>
${coreSrc}
</script>

<script>
${uiScript}
</script>
</body>
</html>
`;

// ---------------------------------------------------------------- the page -----
// The body, CSS and UI live in web-page.js. There is deliberately ONE page: it
// converts AND checks, the conversion writes to its own result box, and the
// original text is never rewritten (see the note at the top of web-page.js).
const { pageBody, pageCss, pageUi } = require('./web-page.js');

// ------------------------------------------------------------------ write ------
fs.mkdirSync(OUT_DIR, { recursive: true });
const content = page('繁簡轉換與檢查', '離線．不上傳．單一檔案．原文不會被改動',
  pageBody, pageUi, pageCss);
const target = path.join(OUT_DIR, 'tradzh.html');
fs.writeFileSync(target, content, 'utf8');
console.log('wrote ' + target + '  (' + (Buffer.byteLength(content) / 1024).toFixed(0) + ' KB)');

// There used to be a second page (tradzh-inspect.html). Leaving a stale copy behind
// would be exactly the drift this repo keeps having to fix, so the build removes it.
const stale = path.join(OUT_DIR, 'tradzh-inspect.html');
if (fs.existsSync(stale)) {
  fs.rmSync(stale);
  console.log('removed stale ' + stale + '  (the converter and the checker are one page now)');
}

console.log('  inlined core.js: ' + coreSrc.length + ' bytes');
console.log('  inlined tables : ' + Object.values(tables).reduce((n, v) => n + v.length, 0) + ' chars');
console.log('  the page is a single file with no external dependencies');
