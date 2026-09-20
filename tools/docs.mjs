// tools/docs.mjs - 交接文件的守門（這個 repo 自己的慣例檔）
//
// 薄薄一層：規則住在共用技能（handoff-discipline）裡，這裡只宣告本 repo 的慣例——
// 哪些檔案是任務卡、由哪個檔案索引它們、以及哪些被引用的檔案真的住在專案外
// （上游 OpenCC 的原始檔名與授權標示、跨專案證據、npm 事後產生的 shim）。
//
//   node tools\docs.mjs            檢查（有問題時非零結束）
//   node tools\docs.mjs board      印出每一張任務卡與狀態
//   node tools\docs.mjs --json     機器可讀的結果
//
// 為什麼要有這支：這個套件的程式有 9 支 selftest 守著，交接文件則一項檢查都沒有。
// 完整案例研究在 AIPMSkills 工作區的 `ai-handoff.md`。
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// tools\ 不在 package.json 的 files 白名單裡，所以這一支不會出貨。
// 從 tarball 安裝的人跑 npm test 時，PUBLISHING.md 與 NEXT-*.md 都不存在，
// 這裡要安靜跳過而不是假裝失敗：守門是維護者的事，不是使用者的事。
// 這個判斷必須在載入檢查器之前——使用者不會有這個技能，不該因此讓他的 npm test 壞掉。
if (!existsSync(join(root, 'PUBLISHING.md'))) {
  console.log('docs: 跳過（守門供開發使用；PUBLISHING.md 與卡片都不會出貨）')
  process.exit(0)
}

const loadChecker = () => {
  const candidates = [
    process.env.HANDOFF_DOCS_CHECK,
    join(homedir(), '.dsh', 'skills', 'handoff-discipline', 'scripts', 'docs-check.mjs'),
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) {
    console.error('docs: 找不到 handoff-discipline 技能。')
    console.error('  請把它掛進 ~/.dsh/skills/handoff-discipline，或設定')
    console.error('  HANDOFF_DOCS_CHECK=<docs-check.mjs 的路徑>')
    process.exit(2)
  }
  return found
}

const checkerPath = loadChecker()
const { checkProject, renderBoard } = await import(pathToFileURL(checkerPath).href)

const config = {
  root,
  cards: 'NEXT-*.md',
  // 索引是 PUBLISHING.md，不是 README.md：README 是 npm 的對外門面（在 files 白名單裡），
  // 而卡片不會出貨——用預設的 README.md 會把每張卡判成 orphan，那不能靠改 README 解決。
  index: 'PUBLISHING.md',
  // 真的住在專案外、或被刻意保留原樣的檔名。比對方式是 `includes`，所以寫主檔名就夠。
  // 沒有列在這裡的一律會被檢查——這正是重點：把一個名字加進這份清單是一次刻意、
  // 可審查的動作，而不是讓檢查靜默放行。
  foreignFiles: [
    // 上游 OpenCC 的原始檔名：授權標示與出處，必須保留原樣（改了就是不誠實）
    'TWPhrases.txt',
    'TWPhrasesRev.txt',
    'TWVariants.txt',
    'TWVariantsPhrases.txt',
    'JPShinjitaiCharacters.txt',
    'data/dictionary/',
    // 姊妹卡與其他專案的工具（跨專案證據）
    'NEXT-agents-md-pointer.md',
    'minimax_h3_latent_upscaler',
    // 這套交接紀律自己的工具，住在技能裡而不是本 repo
    'docs-check.mjs',
    'tools/docs.mjs',
    'tools\\docs.mjs',
    'tools/verify.mjs',
    'tools\\verify.mjs',
    // 外部 repo 與網站的檔案
    'plugins.json',
    'contributing.md',
    // npm 安裝後由 npm 產生的啟動 shim，不是本專案的實作
    'tradzh.cmd',
    // 舊檔名的歷史對照（改名紀錄要留著，不能因為檔案已改名就刪掉記載）
    'tw-vocabulary.json',
    'cn-vocabulary.json',
    // harness 的通用慣例檔名：本 repo 沒有這個檔，文件是在講「別的 harness 可以寫進 AGENTS.md」
    'AGENTS.md',
  ],
  // 這份卡片集將要建立、或由工具寫到使用者指定位置的產物
  plannedFiles: [],
}

const mode = process.argv[2] === 'board' ? 'board' : 'check'

if (mode === 'board') {
  console.log(renderBoard(config))
  process.exit(0)
}

const result = checkProject(config)
const verbose = process.argv.includes('--verbose')

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ok: result.ok, problems: result.problems, skipped: result.skipped }, null, 2))
} else {
  // note 只是告知（名字對但路徑錯、計畫產物、跑圖產物、被豁免的行）。綠燈時印出
  // 數十條只會把訊號埋掉，所以只有在要求時、或真的有 FAIL 時才印。
  if (verbose || result.problems.length) {
    for (const s of result.skipped) console.log('note  ' + s.file + (s.line ? ':' + s.line : '') + '  ' + s.note)
  }
  for (const p of result.problems) {
    console.log('FAIL  ' + p.file + (p.line ? ':' + p.line : '') + '  ' + p.message + (p.hint ? '  (' + p.hint + ')' : ''))
  }
  console.log('docs: ' + result.cards.length + ' card(s), ' + result.problems.length + ' problem(s)'
    + (result.skipped.length ? ', ' + result.skipped.length + ' note(s)' + (verbose || result.problems.length ? '' : ' (--verbose to list)') : ''))
}
process.exit(result.ok ? 0 : 1)
