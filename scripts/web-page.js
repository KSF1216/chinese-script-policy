// The offline page's body, CSS and UI script, kept out of build-web.js so the
// build plumbing (tables, counts, inlining) and the page itself can be read
// separately.
//
// ONE page, and one rule that shapes all of it: **the original text is never
// modified.** Both conversion buttons write to a separate result textarea. The only
// code path that assigns to #input is the explicit 「結果送回原文」 button (and
// loading a file, which lands in the result box if the original box is not empty).
// An earlier version replaced the textarea content on every conversion, which threw
// away whatever the user had pasted - and the original text is the valuable part.
//
// The UI is plain ES5 in a template literal because it is inlined into the page
// verbatim. Escapes are doubled on purpose (\\r?\\n) so the emitted page contains
// the intended /\r?\n/.
// ⚠️ EVERYTHING from `const pageBody` to the end of this file lives INSIDE a template
// literal. So: NO backticks anywhere below - not even inside a comment - and no ${...}
// unless you actually mean an interpolation. A stray backtick in a comment ends the
// string early and the error points at a helpful-looking line far away.
// (Measured 2026-09: a comment containing `change` broke the build.)
const pageBody = `
  <div class="axes">
    <label><input type="checkbox" id="ax-trad" checked> 繁體（抓簡體字）</label>
    <label><input type="checkbox" id="ax-simp"> 簡體（抓繁體字）</label>
    <label><input type="checkbox" id="ax-written" checked> 書面語（抓粵語口語）</label>
    <label><input type="checkbox" id="ax-jp" checked> 日文（抓日文專有字、詞）</label>
    <span id="enc"></span>
  </div>

  <!-- Order matters here, and it is the user's: the original text comes first, the
       verdict on it sits right below, and both stay above the buttons. Reading top to
       bottom is "the text" -> "what is wrong with it" -> "convert" -> "the result". -->
  <section class="box">
    <div class="boxhead">
      <label for="input">原文</label>
      <span class="hint">貼上文字，或按「開啟檔案」／把 .txt、.md 拖進來（UTF-8／BOM／Big5／GB18030 都能讀）</span>
      <span id="in-count" class="count"></span>
    </div>
    <textarea id="input" spellcheck="false" placeholder="在這裡貼上繁體或簡體文字…"></textarea>
  </section>

  <section class="box">
    <div class="boxhead">
      <label>原文的檢查結果</label>
      <span class="hint">跟著原文即時更新；勾選上面要檢查的軸</span>
    </div>
    <div id="summary" class="summary"></div>
    <div id="report" class="report"></div>
  </section>

  <div class="bar">
    <button id="to-simplified" type="button" class="primary">繁轉簡</button>
    <button id="to-traditional" type="button" class="primary">簡轉繁</button>
    <button id="to-written" type="button" title="只轉一定不是書面語的粵語（嘅→的、唔該→謝謝、冇→沒有）；轉不到的會列在下面">轉書面語</button> <!-- check-ok -->
    <label class="opt" title="轉換時也套用目標字體的當地用語。用哪一張表由方向決定：簡轉繁用繁體偏好用語（軟件→軟體、硬盤→硬碟、網絡→網路），繁轉簡用簡體偏好用語（軟體→软件、硬碟→硬盘、網路→网络）"><!-- check-ok -->
      <input type="checkbox" id="opt-wording"> 用語偏好
    </label>
    <label class="opt" title="轉換時順便把日文新字體換成中文（竜→龍）。預設關：引用日文原文時不該被悄悄改動"> <!-- check-ok -->
      <input type="checkbox" id="opt-jp"> 清日文
    </label>
    <button id="open" type="button">開啟檔案</button>
    <button id="copy" type="button">複製結果</button>
    <button id="send" type="button" title="把結果放回原文欄，方便接著再轉一次">結果送回原文</button>
    <button id="clear" type="button">全部清空</button>
    <input type="file" id="file" hidden>
    <span id="status" role="status" aria-live="polite"></span>
  </div>

  <section class="box">
    <div class="boxhead">
      <label for="output">結果</label>
      <span class="hint">原文不會被改動；每一步可以分開跑（清日文 → 轉書面語 → 繁／簡）</span>
      <span id="out-count" class="count"></span>
    </div>
    <textarea id="output" spellcheck="false" placeholder="按「繁轉簡」、「簡轉繁」或「轉書面語」，結果會顯示在這裡；上面的原文保持不變。"></textarea>
    <div id="verdict" class="verdict"></div>
  </section>`;

const pageCss = `
  .axes { display:flex; gap:16px; align-items:center; flex-wrap:wrap; font-size:14px; }
  .axes label { display:flex; gap:6px; align-items:center; cursor:pointer; }
  .opt { display:flex; gap:6px; align-items:center; font-size:14px; cursor:pointer; padding:6px 10px;
         border:1px dashed var(--line); border-radius:8px; }
  .opt:hover { border-color:var(--accent); }
  #enc { margin-left:auto; font-size:12px; opacity:.7; }
  .box { border:1px solid var(--line); border-radius:10px; background:var(--panel); padding:10px 12px; }
  .boxhead { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
  .boxhead label { font-size:14px; font-weight:600; }
  .hint { font-size:12px; opacity:.6; }
  .count { font-size:12px; opacity:.65; margin-left:auto; font-variant-numeric:tabular-nums; }
  button.primary { border-color:var(--accent); color:var(--accent); font-weight:600; }
  .verdict { font-size:13px; margin-top:6px; line-height:1.6; }
  .verdict.ok { color:#2e7d32; }
  .verdict.bad { color:var(--red); }
  .summary { display:flex; gap:10px; flex-wrap:wrap; }
  .card { flex:1 1 220px; border:1px solid var(--line); border-radius:8px; background:var(--bg); padding:10px 12px; }
  .card b { font-size:13px; font-weight:600; }
  .card .n { font-size:22px; font-weight:700; line-height:1.2; }
  .card .marks { font-size:13px; opacity:.85; word-break:break-all; margin-top:4px; }
  .card.ok .n { color:#2e7d32; }
  .card.bad .n { color:var(--red); }
  .report { margin-top:10px; border:1px solid var(--line); border-radius:8px; background:var(--bg); padding:4px 0; }
  .hit { display:flex; gap:10px; padding:7px 12px; border-bottom:1px solid var(--line); font-size:14px; line-height:1.7; }
  .hit:last-child { border-bottom:none; }
  .hit .ln { flex:0 0 46px; text-align:right; opacity:.5; font-family:ui-monospace,Consolas,monospace; font-size:12px; padding-top:3px; }
  .hit .tx { flex:1 1 auto; word-break:break-word; }
  .hit .ax { flex:0 0 auto; font-size:12px; opacity:.75; padding-top:3px; }
  mark.trad { background:rgba(192,57,43,.22); color:inherit; border-radius:3px; }
  mark.simp { background:rgba(43,108,176,.22); color:inherit; border-radius:3px; }
  mark.written { background:rgba(160,100,0,.25); color:inherit; border-radius:3px; }
  mark.jp { background:rgba(106,61,154,.25); color:inherit; border-radius:3px; }
  .empty { padding:14px 12px; font-size:14px; opacity:.75; }
  .skipnote { padding:8px 12px; font-size:12px; opacity:.65; border-top:1px solid var(--line); }
`;

const pageUi = `(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var readTable = function (id) { return JSON.parse($(id).textContent); };

  var core = TradzhCore.createCore({
    simplifiedOnly: readTable('tables-simplifiedOnly'),
    traditionalOnly: readTable('tables-traditionalOnly'),
    japanese: readTable('tables-japanese'),
    tcVocab: readTable('tables-tcVocab'),
    scVocab: readTable('tables-scVocab'),
    t2s: readTable('tables-t2s'),
    s2t: readTable('tables-s2t'),
    cantonese: readTable('tables-cantonese')
  });

  var input = $('input'), output = $('output'), status = $('status');
  var summary = $('summary'), report = $('report');
  var AXES = [
    { id: 'ax-trad',    name: '繁體',   cls: 'trad',    run: function (t) { return core.scanText(t); } },
    { id: 'ax-simp',    name: '簡體',   cls: 'simp',    run: function (t) { return core.scanTextVariant(t, 'simplified'); } },
    { id: 'ax-written', name: '書面語', cls: 'written', run: function (t) { return core.scanTextCantonese(t); } },
    { id: 'ax-jp',      name: '日文',   cls: 'jp',      run: function (t) { return core.scanTextJapanese(t); } }
  ];
  // Which axis decides whether a result is finished: 繁轉簡 must leave no
  // Traditional-only glyph behind, 簡轉繁 no Simplified-only one, and the register step
  // no Cantonese marker it could have converted.
  var RESULT_AXIS = {
    traditional: { run: function (t) { return core.scanText(t); }, bad: '簡體專有字' },
    simplified:  { run: function (t) { return core.scanTextVariant(t, 'simplified'); }, bad: '繁體專有字' },
    written:     { run: function (t) { return core.scanTextCantonese(t); }, bad: '粵語口語標記' }
  };
  var lastRun = null;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escRe(s) { return String(s).replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); }

  // Presentation only: the scan already told us WHICH marks are on this line, so
  // wrapping them is a rendering detail, not a second opinion about the text.
  function markLine(line, marks, cls) {
    if (!marks.length) return esc(line) || '&nbsp;';
    var sorted = marks.slice().sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp('(' + sorted.map(escRe).join('|') + ')', 'g');
    var parts = line.split(re);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      out += (i % 2) ? '<mark class="' + cls + '">' + esc(parts[i]) + '</mark>' : esc(parts[i]);
    }
    return out || '&nbsp;';
  }

  function size(text) {
    if (!text) return '0 字';
    var lines = text.split(/\\r?\\n/).length;
    return text.replace(/\\r?\\n/g, '').length + ' 字' + (lines > 1 ? '／' + lines + ' 行' : '');
  }

  function activeAxes() {
    var on = [];
    for (var i = 0; i < AXES.length; i++) if ($(AXES[i].id).checked) on.push(AXES[i]);
    return on;
  }

  function marksOf(hits) {
    var occurrences = 0, marks = [];
    for (var h = 0; h < hits.length; h++) {
      var list = (hits[h].chars || []).concat(hits[h].phrases || []);
      occurrences += list.length;
      for (var m = 0; m < list.length; m++) if (marks.indexOf(list[m]) < 0) marks.push(list[m]);
    }
    return { occurrences: occurrences, marks: marks };
  }

  // ---- the original text: checked live, never rewritten here -----------------
  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(check, 150); }

  function check() {
    var text = input.value;
    var active = activeAxes();
    $('in-count').textContent = size(text);
    summary.innerHTML = '';
    report.innerHTML = '';

    if (!text) {
      status.textContent = '';
      report.innerHTML = '<div class="empty">貼上文字或拖入檔案就會即時檢查。</div>';
      return;
    }

    var lines = text.split(/\\r?\\n/);
    var skipped = [];
    for (var i = 0; i < lines.length; i++) if (core.lineSkipped(lines, i)) skipped.push(i + 1);

    var total = 0, rows = '';
    for (var a = 0; a < active.length; a++) {
      var ax = active[a];
      var hits = ax.run(text);
      var got = marksOf(hits);
      total += got.occurrences;

      var card = document.createElement('div');
      card.className = 'card ' + (got.occurrences ? 'bad' : 'ok');
      card.innerHTML = '<b>' + ax.name + '軸</b><div class="n">' +
        (got.occurrences ? got.occurrences + ' 處／' + hits.length + ' 行' : '✓ 沒有問題') + '</div>' +
        (got.marks.length ? '<div class="marks">' + esc(got.marks.join(' ')) + '</div>' : '');
      summary.appendChild(card);

      for (var k = 0; k < hits.length; k++) {
        var hit = hits[k];
        var theseMarks = (hit.chars || []).concat(hit.phrases || []);
        rows += '<div class="hit"><div class="ln">' + hit.line + '</div>' +
          '<div class="tx">' + markLine(lines[hit.line - 1] || '', theseMarks, ax.cls) + '</div>' +
          '<div class="ax">' + ax.name + '：' + esc(theseMarks.join(' ')) + '</div></div>';
      }
    }

    report.innerHTML = rows || '<div class="empty">✓ 通過 ' + lines.length + ' 行、' + text.length + ' 字，沒有發現問題。</div>';
    if (skipped.length) {
      // The marker names are internal machinery; a user of this page has never heard of
      // them, so the note says what the marker MEANS instead of just naming it.
      report.innerHTML += '<div class="skipnote">已跳過第 ' + skipped.join('、') +
        ' 行（該行標了 check-ok：刻意保留原樣，不列入檢查）</div>';
    }

    status.textContent = total
      ? '原文共 ' + total + ' 處，分佈在 ' + (rows.match(/class="hit"/g) || []).length + ' 行'
      : '原文 ' + lines.length + ' 行、' + text.length + ' 字：全部通過';
  }

  // ---- the result box --------------------------------------------------------
  // The single place a conversion is allowed to write. Nothing here touches
  // #input; verify() answers the question that matters after converting - did
  // anything wrong survive?
  function verify() {
    var text = output.value;
    $('out-count').textContent = size(text);
    var verdict = $('verdict');
    if (!text) { verdict.className = 'verdict'; verdict.innerHTML = ''; return; }
    var axis = RESULT_AXIS[lastRun || 'traditional'];
    var got = marksOf(axis.run(text));
    if (!got.occurrences) {
      verdict.className = 'verdict ok';
      verdict.innerHTML = '✓ 結果沒有殘留的' + axis.bad;
    } else {
      verdict.className = 'verdict bad';
      verdict.innerHTML = '⚠ 結果仍有 ' + got.occurrences + ' 處' + axis.bad + '（' + got.marks.length +
        ' 種：' + esc(got.marks.join(' ')) + '）— 詞組表沒收錄時要自己確認';
    }
  }

  function convert(which) {
    var text = input.value;
    if (!text) { output.value = ''; lastRun = which; verify(); status.textContent = '請先在原文欄輸入文字'; return; }
    var wording = useWording();
    var japanese = useJapanese();
    // Each axis is its own step, and the page offers them one button at a time, so the
    // order is the user's: 清日文 -> 轉書面語 -> 繁/簡 (that is the only correct order,
    // because 竜 has no entry in the Traditional->Simplified tables: 竜 -> 龍 -> 龙).  // check-ok
    // Use 「結果送回原文」 between steps.
    var out;
    if (which === 'simplified') out = core.toSimplified(text, true, japanese, wording);
    else if (which === 'written') out = core.toWritten(text);
    else out = core.toTraditional(text, true, true, wording, japanese);
    output.value = out;
    lastRun = which;
    verify();
    var label = which === 'simplified' ? '繁→簡'
      : which === 'written' ? '轉書面語（只轉一定不是書面語的粵語）' : '簡→繁（含字形校正）';
    status.textContent = label +
      (wording && which !== 'written'
        ? '＋用語偏好（' + (which === 'simplified' ? '簡體偏好' : '繁體偏好') + '）' : '') +
      (which !== 'written' && japanese ? '＋清日文' : '') +
      '：' + text.length + ' 字 → ' + out.length + ' 字，原文未改動';
  }

  // --- the wording preference (用語偏好): ONE switch ---------------------------
  // Not two preferences but one: "also use the target script's local wording". WHICH table
  // that is comes from the direction you pressed (簡轉繁 uses 繁體偏好 wording, 繁轉簡 uses
  // 簡體偏好 wording), so the two can never be paired wrongly - and there is no impossible
  // state to guard against. Off by default and remembered, because both wordings are
  // correct Chinese: switching them is a preference, not a correction. localStorage can
  // throw on file:// in some browsers, hence the try/catch - losing the memory is fine,
  // breaking the page is not.
  function store(key, value) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function stored(key) {
    try { return (typeof localStorage !== 'undefined') ? localStorage.getItem(key) : null; } catch (e) { return null; }
  }
  function useWording() { return $('opt-wording').checked; }

  (function restoreWording() {
    if (stored('wording') === '1') $('opt-wording').checked = true;
  })();

  $('opt-wording').addEventListener('change', function () {
    store('wording', $('opt-wording').checked ? '1' : '0');
    // Re-run the last conversion so the switch has a visible effect instead of leaving a
    // result that no longer matches the setting.
    if (lastRun === 'traditional' || lastRun === 'simplified') convert(lastRun);
    else status.textContent = $('opt-wording').checked
      ? '用語偏好已開啟：簡轉繁會用繁體偏好用語，繁轉簡會用簡體偏好用語'
      : '用語偏好已關閉：只轉字形，不動用語';
  });

  $('to-simplified').addEventListener('click', function () { convert('simplified'); });
  $('to-traditional').addEventListener('click', function () { convert('traditional'); });
  $('to-written').addEventListener('click', function () { convert('written'); });

  // --- the 「清日文」 option ---------------------------------------------------
  // Off by default: a document may quote Japanese on purpose, and rewriting a quotation
  // is not something a converter should decide on its own. Remembered like 繁體偏好, so
  // a reload cannot silently flip a conversion step on.
  function useJapanese() { return $('opt-jp').checked; }
  (function restoreJapanese() {
    if (stored('japanese') === '1') $('opt-jp').checked = true;
  })();
  $('opt-jp').addEventListener('change', function () {
    store('japanese', this.checked ? '1' : '0');
    if (lastRun === 'traditional' || lastRun === 'simplified') convert(lastRun);
    else status.textContent = this.checked
      ? '清日文已開啟：轉換時會把日文新字體換成中文（引用的日文原文也會被改）'
      : '清日文已關閉：引用日文原文不會被改動';
  });
  output.addEventListener('input', verify);

  // Explicit only: this is the one button that may replace the original.
  $('send').addEventListener('click', function () {
    if (!output.value) { status.textContent = '結果是空的，沒有東西可以送回原文'; return; }
    input.value = output.value;
    check();
    verify();
    status.textContent = '已把結果送回原文（' + input.value.length + ' 字），原文已被這個動作取代';
  });

  // Selecting + execCommand is the fallback, not the first choice: it needs the
  // textarea to be visible and focused. clipboard.writeText can also REJECT (a
  // file:// page in a browser that does not treat it as secure), so the promise is
  // handled - reporting "已複製結果" after a failed copy would be a lie the user only
  // discovers when they paste the wrong thing.
  function legacyCopy() {
    output.select();
    try { document.execCommand('copy'); status.textContent = '已複製結果'; }
    catch (e) { status.textContent = '請按 Ctrl+C 複製'; }
  }

  $('copy').addEventListener('click', function () {
    if (!output.value) { status.textContent = '結果是空的，先按上面的轉換按鈕'; return; }
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      var p = navigator.clipboard.writeText(output.value);
      if (p && typeof p.then === 'function') {
        p.then(function () { status.textContent = '已複製結果'; }, legacyCopy);
        return;
      }
    }
    legacyCopy();
  });

  $('clear').addEventListener('click', function () {
    input.value = '';
    output.value = '';
    lastRun = null;
    $('enc').textContent = '';
    check();
    verify();
    input.focus();
  });

  // Ctrl/Cmd + Enter repeats the last direction - handy when pasting one paragraph
  // at a time. Nothing else is bound, so the page stays simple.
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && lastRun) {
      e.preventDefault();
      convert(lastRun);
    }
  });

  // ---- files -----------------------------------------------------------------
  // Decoding uses core.decodeText with the same tables the CLI uses, so a Big5 or
  // GB18030 file reads the same here as on the command line - including the
  // verdicts for other languages (Japanese, Korean, single-byte Latin/Cyrillic).
  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var res = TradzhCore.decodeText(new Uint8Array(reader.result), core.knownHanzi());
      if (res.text === null) {
        $('enc').textContent = file.name + '：' + res.label;
        status.textContent = '讀不到這個檔（' + res.label + '）';
        return;
      }
      // Dropping a file must not cost the user typed text: if the original box has
      // something in it, the file lands in the result box instead.
      var target = input.value ? output : input;
      target.value = res.text;
      $('enc').textContent = file.name + '：' + res.label;
      if (target === output) { lastRun = null; verify(); status.textContent = '原文已有內容，檔案改放到結果欄'; }
      else { check(); verify(); status.textContent = '已載入 ' + file.name; }
    };
    reader.readAsArrayBuffer(file);
  }

  $('open').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    if (this.files && this.files.length) loadFile(this.files[0]);
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      loadFile(e.dataTransfer.files[0]);
    }
  });

  input.addEventListener('input', schedule);
  // The script axis is ONE axis with TWO DIRECTIONS (require Traditional / require
  // Simplified), not two independent axes: requiring both would flag every Chinese
  // document, because a Traditional text violates the Simplified side and a Simplified
  // text violates the Traditional side. So picking one side clears the other; both off
  // means "do not check this axis at all".
  // One change handler per element on purpose (the test harness models a single
  // listener per event per element), and no "this" (the harness calls handlers as plain
  // functions).
  var SCRIPT_OTHER = { 'ax-trad': 'ax-simp', 'ax-simp': 'ax-trad' };
  function axisChanged(id) {
    if (SCRIPT_OTHER[id] && $(id).checked) $(SCRIPT_OTHER[id]).checked = false;
    check();
  }
  for (var j = 0; j < AXES.length; j++) {
    (function (id) { $(id).addEventListener('change', function () { axisChanged(id); }); })(AXES[j].id);
  }

  check();
  verify();
})();`;

module.exports = { pageBody, pageCss, pageUi };
