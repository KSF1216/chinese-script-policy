// tools/docs.config.mjs - 這個 repo 的守門慣例（唯一手寫的檔案）
//
// `tools\docs.mjs` 與 `tools\docs-breaktest.mjs` 是**產生**的：
//   node "$env:USERPROFILE\.dsh\skills\handoff-discipline\scripts\docs-init.mjs" --root "<本專案>"
// 改了產生出來的那兩支，下一次重新產生就會被蓋掉。
export const config = {
  // 這個 repo 目前只有 NEXT 一種卡。要多開 OPEN-（問題卡）或 DECISION-（決策卡）
  // 就把它列成陣列：cards: ['NEXT-*.md', 'OPEN-*.md', 'DECISION-*.md']。
  cards: ['NEXT-*.md'],
  // 索引是 PUBLISHING.md，不是 README.md：README 是 npm 的對外門面（在 files 白名單裡），
  // 而卡片不會出貨——用預設的 README.md 會把每張卡判成 orphan，那不能靠改 README 解決。
  index: 'PUBLISHING.md',
  // 這個 repo 沒有「規範／產物」的混雜問題：所有 .md 都必須每一條引用成立。
  skipFiles: [],
  // 真的住在專案外、或被刻意保留原樣的檔名。比對方式是 `includes`，寫主檔名就夠。
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
    'docs-selftest.mjs',
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

// `node tools\docs-breaktest.mjs`：證明這個 repo 的守門真的會紅。
// 刻意**不**掛進 npm test——它會改動文件（然後還原），是手動的重新校準工具。
export const breaktest = {
  cases: [
    {
      name: 'missing reference',
      file: 'NEXT-file-type-guard.md',
      old: '## 一、',
      add: '\n備註：細節見 `tools\\does-not-exist.mjs`。\n',
    },
    { name: 'illegal status', file: 'NEXT-file-type-guard.md', pattern: /^status: [a-z]+$/m, new: 'status: wip' },
    {
      name: 'dependency on a missing card',
      file: 'NEXT-file-type-guard.md',
      pattern: /^id: next-file-type-guard$/m,
      new: 'id: next-file-type-guard\ndepends_on: no-such-card',
    },
    // `all: true`：索引裡可能合法地提到同一個名字不只一次，只拿掉第一處會讓卡片
    // 仍然「被提到」，案例就會因為錯的理由而通過。
    { name: 'orphan card (index lost it)', file: 'PUBLISHING.md', old: 'NEXT-file-type-guard.md', new: 'NEXT-file-type-guard', all: true },
    // `blocked` 是 2026-09-20 新增的狀態：它必須指名「被什麼擋住」，否則只是一句
    // 讓人無法接手的宣告。拿掉 blocked_by 就必須紅燈。
    { name: 'blocked card without blocked_by', file: 'NEXT-release-1.3.1.md', pattern: /^blocked_by: .*$/m, new: '' },
  ],
  // 被動過檔案的 SHA-256：讓「我還原了」是位元組層級的說法
  hashFiles: ['NEXT-file-type-guard.md', 'NEXT-release-1.3.1.md', 'PUBLISHING.md'],
}
