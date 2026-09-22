// tools/cards.config.mjs - 這個 repo 的守門慣例（唯一手寫的檔案）
//
// `tools\cards.mjs` 是**產生**的（第二支入口已併入 `cards.mjs breaktest`）：
//   node "$env:USERPROFILE\.dsh\skills\project-discipline\scripts\cards-init.mjs" --root "<本專案>"
// 改了產生出來的那兩支，下一次重新產生就會被蓋掉。
export const config = {
  // **狀態由資料夾表達**，所以 `CARD/*/` 涵蓋五格；平的 pattern 刻意不撈子目錄，
  // 所以搬到一半會紅，不會靜默地什麼都沒載到。
  //
  // 九個卡種全部列出：這個 repo 現在**有專案卡**（＝宣告採用），而宣告採用就等於
  // 宣告整套詞彙——缺哪一種，`kind-coverage` 會指名。載不到東西的 pattern 會印出來，不是 FAIL。
  // `publishing` 是 2026-09-20 技能新增的卡種（專案層級的發布立場），本 repo 也用它。
  // `verification` 是同一批新增的第二張（2026-09-22 補上：這張卡早就存在，
  // 但 pattern 漏了它，於是「有專案卡卻沒有驗證立場」這條規則一直紅著——漏一個 glob
  // 就是漏一整套檢查，這正是 `kind-coverage` 存在的理由）。
  cards: [
    'CARD/*/NEXT-*.md', 'CARD/*/OPEN-*.md', 'CARD/*/DECISION-*.md',
    'CARD/*/PROJECT-*.md', 'CARD/*/LESSON-*.md', 'CARD/*/REQ-*.md', 'CARD/*/TEST-*.md',
    'CARD/*/PUBLISHING-*.md', 'CARD/*/VERIFICATION-*.md',
  ],
  // 索引是 PUBLISHING.md，不是 README.md：README 是 npm 的對外門面（在 files 白名單裡），
  // 而卡片不會出貨——用預設的 README.md 會把每張卡判成 orphan，那不能靠改 README 解決。
  index: 'PUBLISHING.md',
  // 歷史（done／dropped）不載入：front matter 已凍結、引用會腐化，檢查只會製造噪音。
  // **用 status 排除，不是用路徑**——status 才是唯一來源。排除幾張會印在摘要行，不靜默。
  ignoreStatuses: ['done', 'dropped'],
  // 資料夾是 status 的**視圖**。搬檔由 `node tools\cards.mjs sync-folders` 做，人不手搬。
  folderForStatus: {
    todo: 'CARD/todo',
    doing: 'CARD/doing',
    blocked: 'CARD/blocked',
    active: 'CARD/active',
    done: 'CARD/done',
    dropped: 'CARD/dropped',
  },
  // 除了歷史之外沒有「規範／產物」的混雜問題：所有 .md 都必須每一條引用成立。
  // 歷史的引用天生會腐化——排除它，但**每一筆豁免都印成 note**，不靜默。
  skipFiles: [
    'CARD/done/**',
    'CARD/dropped/**',
  ],
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
    'cards-check.mjs',
    'cards-selftest.mjs',
    // ⚠️ tools/cards.mjs 不列在這裡（2026-09-20 移除）：它**就在本 repo**，而且已經出貨。
    // 列成例外等於「引用它不檢查」——引用一個不存在的路徑時不會有人發現。留著 tools/verify.mjs
    // 是因為那支真的住在別的工作區（那些行是跨專案證據）。
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
  // 安裝文檔的兩半（2026-09-22 補）：**誰接上了、怎麼移除、失效時怎麼辦**。
  // 漏掉這一步沒有任何症狀（少一列就是不在那裡），所以把它變成紅燈。
  // 只驗**形狀**：文檔存在、有指名這個套件、fallback 那一節還在；句子真假仍由人負責。
  installDocs: {
    files: ['PUBLISHING.md', 'README.md'],
    projects: ['chinese-script-policy'],
    fallbackHeading: '卡守門的移除與 fallback',
  },
}

// `node tools\cards.mjs breaktest`：證明這個 repo 的守門真的會紅。
// 刻意**不**掛進 npm test——它會改動文件（然後還原），是手動的重新校準工具。
export const breaktest = {
  cases: [
    {
      // ⚠️ 錨點必須是**活卡**：歷史（done／dropped）不載入，所以指到歷史的案例
      // 永遠不可能被 caught（它會回報「card is history」而不是靜默通過）。
      // 搬家後只剩這張活卡，所以案例都指向它——它哪天結案，這些案例會紅，那時換卡。
      name: 'missing reference',
      file: 'NEXT-release-1.3.1.md',
      pattern: /^# .*$/m,
      add: '\n\n備註：細節見 `tools\\does-not-exist.mjs`。\n',
    },
    { name: 'illegal status', file: 'NEXT-release-1.3.1.md', pattern: /^status: [a-z]+$/m, new: 'status: wip' },
    { name: 'dependency on a missing card', file: 'NEXT-release-1.3.1.md', pattern: /^status: .*$/m, add: '\ndepends_on: no-such-card' },
    // `all: true`：索引裡可能合法地提到同一個名字不只一次，只拿掉第一處會讓卡片
    // 仍然「被提到」，案例就會因為錯的理由而通過。
    { name: 'orphan card (index lost it)', file: 'PUBLISHING.md', old: 'NEXT-release-1.3.1.md', new: 'NEXT-release-1.3.1', all: true },
    // `blocked` 是 2026-09-20 新增的狀態：它必須指名「被什麼擋住」，否則只是一句
    // 讓人無法接手的宣告。拿掉 blocked_by 就必須紅燈。
    { name: 'blocked card without blocked_by', file: 'NEXT-release-1.3.1.md', pattern: /^blocked_by: .*$/m, new: '' },
  ],
  // 被動過檔案的 SHA-256：讓「我還原了」是位元組層級的說法
  hashFiles: ['NEXT-file-type-guard.md', 'NEXT-release-1.3.1.md', 'PUBLISHING.md'],
}
