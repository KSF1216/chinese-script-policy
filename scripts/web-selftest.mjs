// Drift + smoke guard for the generated offline pages.
//
// Phase 1 (drift): run the conversion logic FROM each generated page - its inlined
// tables and inlined core - against the same fixtures the CLI uses, and require
// identical results. The whole point of generating the pages from core.js is that
// there is only one implementation; this is what makes that claim checkable.
//
// Phase 2 (smoke): the pages are evaluated in a vm with a minimal fake DOM, then
// the UI is actually driven - set a value, "click" the button, look at what the
// page produced. No browser is available here, and shipping a page that throws on
// load would be worse than shipping none, so the UI is exercised for real.
//
// The sandbox deliberately provides no module/require/process/__dirname, so the
// UMD wrapper takes its browser branch, exactly as a browser would.
//
// Exit 0 when every page agrees with the CLI and its UI works; 1 otherwise.
// Skips (exit 0) when the pages have not been built yet.
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const fixtures = JSON.parse(readFileSync(join(here, 'selftest-cases.json'), 'utf8'))
const TABLE_IDS = ['simplifiedOnly', 'traditionalOnly', 'japanese', 'tcVocab', 'scVocab', 't2s', 's2t', 'cantonese']

const pages = [
  {
    file: 'dist/tradzh.html',
    label: '轉換＋檢查',
    ids: ['input', 'output', 'status', 'summary', 'report', 'enc', 'verdict',
      'in-count', 'out-count', 'copy', 'clear', 'send', 'open', 'file', 'opt-wording', 'opt-jp',
      'ax-trad', 'ax-simp', 'ax-written', 'ax-jp', 'to-simplified', 'to-traditional', 'to-written'],
    drive: drivePage,
  },
]

const problems = []
let checked = 0

// ---------------------------------------------------------------- fake DOM -----
function makeDom(ids) {
  const els = {}
  for (const id of ids) {
    els[id] = {
      id, value: '', textContent: '', innerHTML: '', checked: false, className: '', style: {},
      kids: [], handlers: {},
      addEventListener(type, fn) { this.handlers[type] = fn },
      appendChild(child) { this.kids.push(child) },
      select() {}, focus() {},
    }
  }
  const document = {
    getElementById: (id) => els[id] || null,
    createElement: () => ({ className: '', innerHTML: '', style: {}, kids: [] }),
    addEventListener: () => {},
    execCommand: () => true,
  }
  return { document, els }
}

function runPage(html, ids, dom) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  const coreBlock = scripts.find((s) => s.includes('createCore'))
  const uiBlock = scripts.find((s) => s.includes('addEventListener'))
  if (!coreBlock || !uiBlock) throw new Error('page is missing its core or UI script')

  const sandbox = {
    console, JSON, Math, Set, Map, Promise, Symbol, RegExp, Date, TextDecoder, Uint8Array,
    String, Number, Boolean, Object, Array, Error, TypeError, RangeError,
    document: dom.document,
    // Synchronous timers: the page debounces live checking, and here "later" can
    // just mean "now".
    setTimeout: (fn) => { fn(); return 0 },
    clearTimeout: () => {},
    FileReader: function () { this.readAsArrayBuffer = () => {} },
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  vm.createContext(sandbox)
  vm.runInContext(coreBlock, sandbox, { filename: 'core.js (inlined)' })
  vm.runInContext(uiBlock, sandbox, { filename: 'ui.js (inlined)' })
  return sandbox
}

// ------------------------------------------------------------ page drivers ----
// The text these drive with comes from selftest-cases.json (`ui` section), not from
// literals here: that file is ignored by the checker, so this .mjs file stays free
// of Simplified and Cantonese sample text.
function drivePage(els, ui) {
  // --- checking the original ---------------------------------------------------
  els.input.value = ui.inspect.text
  // The fake DOM does not read the `checked` attribute from the markup, so the
  // default-on axes are set here; that the MARKUP ships them checked is asserted
  // separately in the per-page loop below.
  els['ax-trad'].checked = true
  els['ax-written'].checked = true
  els['ax-jp'].checked = true
  els.input.handlers.input()

  const cards = els.summary.kids.map((k) => k.innerHTML).join('\n')
  if (!cards.includes('繁體軸')) problems.push('沒有繁體軸的摘要卡')
  if (!cards.includes('書面語')) problems.push('沒有書面語軸的摘要卡')
  if (!cards.includes('日文軸')) problems.push('沒有日文軸的摘要卡')
  if (!/處/.test(cards)) problems.push('摘要卡沒有顯示處數')
  if (!els.report.innerHTML.includes('<mark class="trad">')) problems.push('報告沒有標示出簡體字')
  if (!els.report.innerHTML.includes('<mark class="written">')) problems.push('報告沒有標示出粵語標記')
  if (!els.report.innerHTML.includes('<mark class="jp">')) problems.push('報告沒有標示出日文專有字')
  if (!/\d/.test(els.status.textContent)) problems.push('狀態列沒有數字')
  checked += 4

  // Turning an axis off has to actually stop it. The summary element accumulates
  // cards in this fake DOM (innerHTML = '' does not clear kids), so it is emptied
  // by hand before the second check.
  els.summary.kids.length = 0
  els['ax-jp'].checked = false
  els['ax-jp'].handlers.change()
  const cardsOff = els.summary.kids.map((k) => k.innerHTML).join('\n')
  if (cardsOff.includes('日文軸')) problems.push('取消勾選日文軸後仍在檢查')
  if (els.report.innerHTML.includes('<mark class="jp">')) problems.push('取消勾選後報告還標示日文專有字')
  checked += 2

  // The script axis is one axis with two directions: picking one side must clear the
  // other. Requiring both would flag every Chinese document (a Traditional text breaks
  // the Simplified side and vice versa), so "both ticked" has to be unreachable.
  els['ax-jp'].checked = true
  els['ax-simp'].checked = true
  els['ax-simp'].handlers.change()
  if (els['ax-trad'].checked) problems.push('勾了「簡體（抓繁體字）」卻沒取消「繁體（抓簡體字）」：兩個方向互斥失效')
  els['ax-trad'].checked = true
  els['ax-trad'].handlers.change()
  if (els['ax-simp'].checked) problems.push('勾了「繁體（抓簡體字）」卻沒取消「簡體（抓繁體字）」：兩個方向互斥失效')
  checked += 2
  // Both off must stay reachable: that is "do not check this axis at all".
  els['ax-trad'].checked = false
  els['ax-trad'].handlers.change()
  if (els['ax-simp'].checked) problems.push('兩側都關掉竟然會把另一側打開')
  checked += 1
  // Restore the default (require Traditional) for the conversions below, and empty the
  // accumulating summary again.
  els['ax-trad'].checked = true
  els['ax-trad'].handlers.change()
  els.summary.kids.length = 0

  // --- converting writes to the RESULT box, and must not touch the original ----
  const original = els.input.value
  els['to-traditional'].handlers.click()
  if (els.output.value !== ui.inspect.afterToTraditional) {
    problems.push('簡轉繁的結果不符 - 「' + els.output.value.replace(/\n/g, '\\n') + '」')
  }
  // This is the regression guard for the whole reason the page was rebuilt: the
  // user's original text is the valuable part and a conversion must not eat it.
  if (els.input.value !== original) {
    problems.push('轉換改動了原文欄（' + original.replace(/\n/g, '\\n') + ' -> ' + els.input.value.replace(/\n/g, '\\n') + '）')
  }
  if (!els.status.textContent.includes('簡→繁')) problems.push('狀態列沒有顯示轉換方向')
  if (!els.status.textContent.includes('原文未改動')) problems.push('狀態列沒有說明原文未改動')
  if (!els.verdict.className.includes('ok')) {
    problems.push('轉換後的結果沒有通過檢查（verdict=' + els.verdict.className + '）')
  }
  if (!els['out-count'].textContent.includes('字')) problems.push('結果欄沒有字數')
  checked += 4

  // The Japanese step is opt-in, and this is the guard: the fixture contains a shinjitai
  // and the default conversion must leave it alone, because a document may quote Japanese
  // on purpose. Turning 清日文 on has to produce exactly the other fixture value.
  if (els.output.value === ui.inspect.afterToTraditionalJapanese) {
    problems.push('預設不該動到日文新字體（引用的日文原文被改掉了）')
  }
  els['opt-jp'].checked = true
  els['opt-jp'].handlers.change()
  if (els.output.value !== ui.inspect.afterToTraditionalJapanese) {
    problems.push('勾了清日文後結果不符 - 「' + els.output.value.replace(/\n/g, '\\n') + '」')
  }
  checked += 2
  els['opt-jp'].checked = false
  els['opt-jp'].handlers.change()

  // The result can be edited by hand and the verdict follows it.
  els.output.value = els.output.value + '\n' + ui.inspect.text.split('\n')[0]
  els.output.handlers.input()
  if (!els.verdict.className.includes('bad')) {
    problems.push('手動編輯結果後，殘留的簡體字沒有被抓到（verdict=' + els.verdict.className + '）')
  }
  checked += 1

  // --- 結果送回原文 is the one explicit path that may replace the original ------
  const result = els.output.value
  els.send.handlers.click()
  if (els.input.value !== result) problems.push('結果送回原文沒有把結果放進原文欄')
  checked += 1

  // --- the other direction -----------------------------------------------------
  const [t2sIn, t2sOut] = ui.convert.toSimplified
  els.input.value = t2sIn
  els.input.handlers.input()
  els['to-simplified'].handlers.click()
  if (els.output.value !== t2sOut) {
    problems.push('繁轉簡的結果不符 - 「' + els.output.value + '」')
  }
  if (els.input.value !== t2sIn) problems.push('繁轉簡改動了原文欄')
  if (!els.status.textContent.includes('繁→簡')) problems.push('狀態列沒有顯示繁→簡')
  checked += 3

  // --- the wording preference: ONE switch, TWO directions -----------------------
  // Not two preferences but one: "also use the target script's local wording". The table
  // is chosen by the direction pressed (簡->繁 uses 繁體偏好 wording, 繁->簡 uses 簡體偏好
  // wording), so the two can never be paired wrongly. Off at first, because both wordings
  // are correct Chinese - the page must never switch them on its own. 清日文 is off for the
  // same kind of reason: quoting Japanese on purpose is legitimate.
  if (els['opt-wording'].checked) problems.push('用語偏好選項預設應該是關的')
  if (els['opt-jp'].checked) problems.push('清日文選項預設應該是關的')
  els.input.value = ui.convert.tcVocab[0]
  els.input.handlers.input()
  els['to-traditional'].handlers.click()
  if (els.output.value === ui.convert.tcVocab[1]) {
    problems.push('沒有勾用語偏好時，簡→繁不該已經是繁體偏好用語（' + els.output.value + '）')
  }
  checked += 1
  els['opt-wording'].checked = true
  els['opt-wording'].handlers.change()
  els['to-traditional'].handlers.click()
  if (els.output.value !== ui.convert.tcVocab[1]) {
    problems.push('勾了用語偏好的簡→繁結果不符（應套用繁體偏好）- 「' + els.output.value + '」')
  }
  if (!els.status.textContent.includes('繁體偏好')) problems.push('狀態列沒有說明簡→繁套用了繁體偏好')
  if (els.input.value !== ui.convert.tcVocab[0]) problems.push('套用用語偏好時改動了原文欄')
  checked += 3
  // The same ONE switch, other direction: it has to pick the other table by itself.
  els.input.value = ui.convert.scVocab[0]
  els.input.handlers.input()
  els['to-simplified'].handlers.click()
  if (els.output.value !== ui.convert.scVocab[1]) {
    problems.push('同一個開關在繁→簡應該自動改套用簡體偏好 - 「' + els.output.value + '」')
  }
  if (!els.status.textContent.includes('簡體偏好')) problems.push('狀態列沒有說明繁→簡套用了簡體偏好')
  checked += 2
  els['opt-wording'].checked = false
  els['opt-wording'].handlers.change()
  els['to-simplified'].handlers.click()
  if (els.output.value !== ui.convert.scVocab[2]) {
    problems.push('關掉用語偏好後，繁→簡應該回到純字形轉換 - 「' + els.output.value + '」')
  }
  checked += 1

  // --- the register step (轉書面語) --------------------------------------------
  // Partial by design: it must convert the impossible-in-written-Chinese markers and
  // must NOT touch 屋企 (which occurs inside 房屋企業), and the verdict has to say the  // check-ok
  // result is unfinished rather than call it clean.
  els.input.value = ui.convert.written[0]
  els.input.handlers.input()
  els['to-written'].handlers.click()
  if (els.output.value !== ui.convert.written[1]) {
    problems.push('轉書面語結果不符 - 「' + els.output.value + '」')
  }
  if (els.input.value !== ui.convert.written[0]) problems.push('轉書面語時改動了原文欄')
  if (!els.verdict.className.includes('ok')) problems.push('轉書面語後沒有給出通過的判定')
  checked += 3

  els.input.value = ui.convert.writtenLeftover[0]
  els.input.handlers.input()
  els['to-written'].handlers.click()
  if (els.output.value !== ui.convert.writtenLeftover[1]) {
    problems.push('轉書面語不該動到書面語也有的字 - 「' + els.output.value + '」')
  }
  if (!els.verdict.className.includes('bad')) {
    problems.push('轉書面語留下轉不到的部分時，判定應該說它還沒完成（verdict=' + els.verdict.className + '）')
  }
  if (!els.verdict.innerHTML.includes('粵語口語標記')) problems.push('判定沒有說明剩下的是粵語標記')
  checked += 3
}

// ------------------------------------------------------------------- run -------
for (const page of pages) {
  const htmlPath = join(root, page.file)
  if (!existsSync(htmlPath)) {
    console.log('SKIP: ' + page.file + ' not built yet (run: npm run build:web)')
    continue
  }
  const html = readFileSync(htmlPath, 'utf8')
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
  console.log('\n' + page.label + '  (' + page.file + ', ' + kb + ' KB)')

  for (const id of page.ids) {
    if (!html.includes('id="' + id + '"')) problems.push(page.file + ' is missing #' + id)
  }

  // Which axes are on by default is part of the UI contract, and it lives in the
  // markup - the fake DOM cannot see it, so it is checked as text.
  for (const id of ['ax-trad', 'ax-written', 'ax-jp']) {
    if (!new RegExp('id="' + id + '"[^>]*checked').test(html)) {
      problems.push(page.file + ': #' + id + ' should be checked by default')
    }
  }
  for (const id of ['ax-simp', 'opt-wording']) {
    if (new RegExp('id="' + id + '"[^>]*checked').test(html)) {
      problems.push(page.file + ': #' + id + ' should start unchecked')
    }
  }
  checked += 1

  // Reading order is a requirement, not a detail: the original text comes first, its
  // verdict sits directly below it, and both stay above the buttons. Asserted on the
  // generated markup so moving a block back is a test failure, not something only a
  // human would notice.
  const order = ['ax-trad', 'enc', 'input', 'summary', 'report', 'to-simplified', 'output']
  const at = order.map((id) => ({ id, i: html.indexOf('id="' + id + '"') }))
  for (let k = 1; k < at.length; k++) {
    if (at[k].i < 0) continue
    if (at[k].i < at[k - 1].i) {
      problems.push(page.file + ': #' + at[k].id + ' must come after #' + at[k - 1].id)
    }
  }
  checked += 1

  const dom = makeDom([...page.ids, ...TABLE_IDS.map((t) => 'tables-' + t)])
  for (const t of TABLE_IDS) {
    const m = new RegExp('<script type="application/json" id="tables-' + t + '">([\\s\\S]*?)</script>').exec(html)
    if (!m) { problems.push(page.file + ' is missing inlined table ' + t); continue }
    dom.els['tables-' + t].textContent = m[1]
  }

  let sandbox
  try {
    sandbox = runPage(html, page.ids, dom)
  } catch (e) {
    problems.push(page.file + ': UI threw on load - ' + e.message)
    continue
  }
  if (!sandbox.TradzhCore || typeof sandbox.TradzhCore.createCore !== 'function') {
    problems.push(page.file + ': did not expose TradzhCore (UMD global branch)')
    continue
  }

  // Same fixtures the CLI uses.
  const core = sandbox.TradzhCore.createCore({
    simplifiedOnly: JSON.parse(dom.els['tables-simplifiedOnly'].textContent),
    traditionalOnly: JSON.parse(dom.els['tables-traditionalOnly'].textContent),
    japanese: JSON.parse(dom.els['tables-japanese'].textContent),
    tcVocab: JSON.parse(dom.els['tables-tcVocab'].textContent),
    scVocab: JSON.parse(dom.els['tables-scVocab'].textContent),
    t2s: JSON.parse(dom.els['tables-t2s'].textContent),
    s2t: JSON.parse(dom.els['tables-s2t'].textContent),
    cantonese: JSON.parse(dom.els['tables-cantonese'].textContent),
  })
  let wrong = 0
  for (const [input, expected] of fixtures.s2t) {
    checked++
    if (core.toTraditional(input) !== expected) { wrong++; problems.push(page.file + ' 簡→繁 ' + input) }
  }
  for (const [input, expected] of fixtures.t2s) {
    checked++
    if (core.toSimplified(input) !== expected) { wrong++; problems.push(page.file + ' 繁→簡 ' + input) }
  }
  for (const [text, want] of fixtures.written) {
    checked++
    const hit = core.scanTextCantonese(text).length > 0
    if (hit !== (want === 'flag')) { wrong++; problems.push(page.file + ' 語體 ' + text) }
  }
  // The Japanese axis has two layers now (glyphs AND words), and the page must see both -
  // the word layer is invisible to any character table, so it is the one worth asserting.
  for (const [text, want] of fixtures.japanese) {
    checked++
    const hit = core.scanTextJapanese(text).length > 0
    if (hit !== (want === 'flag')) { wrong++; problems.push(page.file + ' 日文 ' + text) }
  }
  // Register conversion is partial; the page must produce exactly what the CLI does.
  for (const [input, expected] of fixtures.writtenConvert) {
    checked++
    if (core.toWritten(input) !== expected) { wrong++; problems.push(page.file + ' 轉書面語 ' + input) }
  }
  console.log('  fixtures: ' + checked + ' 例，' + (wrong ? wrong + ' 例不一致' : '全部與 CLI 一致'))

  try {
    page.drive(dom.els, fixtures.ui)
    console.log('  UI      : 驅動成功（按鈕、摘要、標示都正常）')
  } catch (e) {
    problems.push(page.file + ': UI drive threw - ' + e.message)
  }
}

// --------------------------------------------------------------- freshness -----
// dist/tradzh.html is COMMITTED, because the whole promise of the offline page is
// "download the file, double-click it, no Node needed" - and a generated file that is
// not committed cannot be downloaded by anyone. A committed generated file can go
// stale, so a fresh build is compared byte for byte. The build is reproducible (no
// build date in the output - it prints the package version instead), which is what
// makes this comparison meaningful.
const freshDir = mkdtempSync(join(tmpdir(), 'tradzh-web-'))
let freshness = 'skipped'
try {
  const r = spawnSync(process.execPath, [join(here, 'build-web.js'), freshDir], { encoding: 'utf8' })
  if (r.status !== 0) {
    problems.push('build-web.js exited ' + r.status + ': ' + ((r.stderr || '').split('\n')[0] || 'no stderr'))
  } else {
    const fresh = readFileSync(join(freshDir, 'tradzh.html'))
    const committed = readFileSync(join(root, 'dist/tradzh.html'))
    if (fresh.equals(committed)) freshness = 'matches a fresh build'
    else {
      freshness = 'STALE'
      problems.push('dist/tradzh.html is out of date - run: npm run build:web and commit the result')
    }
  }
} catch (e) {
  problems.push('freshness check failed: ' + e.message)
} finally {
  rmSync(freshDir, { recursive: true, force: true })
}
console.log('\ncommitted page  (' + freshness + ')')
checked++

console.log('')
if (problems.length) {
  console.log('FAIL:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('PASS: the page converts exactly like the CLI, its UI works, conversions leave the original text alone, and the committed copy is not stale (' + checked + ' checks)')
