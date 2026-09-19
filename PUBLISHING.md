# 發布流程（維護者用）

> 這份**只給維護者看，不會被打包進 npm**（`package.json` 的 `files` 是白名單，
> 沒有列它）。使用者要看的是 [`README.md`](README.md)。

## 0. 這個 repo 的身分

**一棵目錄，四種身分**，所以不會有版本漂移：

| 身分 | 靠什麼成立 |
|---|---|
| DSH 技能目錄 | `SKILL.md`（放到 `$DSH_HOME/skills/<name>/`） |
| npm 套件 | `package.json` 的 `name` / `version` |
| DSH 組合包（bundle） | `package.json` 的 `dsh.bundle` → `cordis.patch.yml` |
| git repo | 目錄本身就是（`.git`） |

**發布物只有一個：npm 套件 `chinese-script-policy`。** DSH 不看名字、只看
`dsh.bundle`，所以同一個套件同時是「DSH 組合包」與「通用技能」。

## 1. 發布前檢查（每次都要跑，別跳）

```powershell
cd "$env:USERPROFILE\.dsh\skills\chinese-script-policy"
npm test                # 三個檢查指令的回歸 + hook + 用真實註冊表列出並載入技能 + 網頁比對 + 代理的 HTTP 邊界
npm run audit           # Big5／GBK 字表稽核（抓「標準繁體字被當成簡體」）
npm run check           # repo 自己也要是乾淨繁體
npm run check:written   # repo 自己也不含粵語口語標記（靠 cantonese-allow.json 放行文件）
npm run check:japanese  # repo 自己也不含日文專有字（引用字例的行標 check-ok）
npm run build:web       # 重新產生離線網頁版（改了字表就要跑）
npm pack --dry-run      # 看打包清單與大小，確認沒多沒少
```

| 指令 | 防的是什麼 |
|---|---|
| `npm test` | 轉換選錯字、粵語／日文偵測過度或不足、**hook 壞掉（它壞掉是無聲的）**、外掛註冊欄位漏掉（`source` 就是這樣抓到的）、**CLI 旗標接線**（`test:cli` 跑文件上的每一個配方）、網頁與 CLI 不同步、**代理的輸出邊界**（非串流、`tool_calls` 不動、原生 `/completion` 形狀、乾淨回應逐位元組不變）、**repo 自己的腳本檔位元組規則**（`.ps1` 純 ASCII；`.cmd`／`.bat` 純 ASCII ＋ CRLF）、**最後還會跑 `test:repo`**：三軸檢查這份 repo 自己 |
| `npm run audit` | 字表重新產生後又把 `峰 床 痴 秘 灶 粽` 之類的標準繁體字當成簡體 |
| `npm run check` | 文件或程式碼裡混進簡體（刻意的示範要標 `simplified-example`） |
| `npm run check:written` | 文件或程式碼裡混進粵語口語（刻意的示範列在 `cantonese-allow.json`） |
| `npm run check:japanese` | 文件或程式碼裡混進日文專有字（引用字例的行標 `check-ok`） |
| `npm run build:web` | 網頁版跟 CLI 不同步（改了字表卻忘了重新產生 `dist/tradzh.html`） |
| `npm pack --dry-run` | 少包檔案（使用者裝了不能用）、多包檔案（隱私或肥檔） |

七個都過才發布。

> **打包清單有兩處容易漏**（`package.json` 的 `files` 是白名單，沒列到就不會出貨）：
> - **`lib/client.js`**：DSH 的設定卡（瀏覽器端）。漏了它，外掛本身照樣能擋寫入，
>   但 GUI 的「Plugin configuration」永遠不會出現那張卡，而且**不會有任何錯誤訊息**。
>   它同時是 `exports["./client"]` 的目標，`dsh.client` 那段也在 `package.json`。
> - **`dist/tradzh.html`**：離線網頁版（曾經漏掉，等於沒有人能下載現成的一份）。

> **`test:repo` 是 2026-09 補上的洞**：`npm test` 以前**不含**那三項 repo 自我檢查，所以文件／程式碼
> 引用簡體或日文字例卻忘了標 `check-ok` 時，**沒有任何測試會發現**——實際上就這樣壞了一陣子
> （重跑才抓到 26 個沒標記的簡體字例）。現在三軸檢查跟著 `npm test` 一起跑；`audit` 仍要獨立跑，
> 因為它需要 Windows 內建的 cp950／cp936 編碼器。

> `npm test` 現在包含 `test:web`：它會從**產生出來的 `dist/tradzh.html`** 裡抽出字表與核心，
> 跟 CLI 用同一組測試資料比對。所以順序是「先 `build:web`，再 `npm test`」；
> 沒建置過會自動跳過（exit 0），不會誤報失敗。

> **`npm test` 現在也看「位元組」，不只看「字」**（2026-09-19 補）：三軸檢查問的是「中文對不對」，
> 但 `.ps1` 的問題是**檔案類型**——PowerShell 5.1 用 ANSI 讀它，非 ASCII 的內容會讓整支腳本壞掉。
> 所以 `api-selftest` 現在會走一遍 repo（`node_modules` 與 `.git` 除外），檢查
> **每個 `.ps1` 是純 ASCII**、**每個 `.cmd`／`.bat` 是純 ASCII ＋ CRLF**（讀原始位元組，不是讀文字——
> 讀成文字就看不出差別了）。同一條規則也寫在 `SKILL.md` 的〈檔案類型陷阱〉，成因在 `references/encoding.md`。
>
> **它第一次跑就抓到真的違規**：`scripts/build-codepage.ps1` 的註解裡有 15 個非 ASCII 位元組
> （五個常見繁體字），而**所有既有的檢查都只看中文字軸，所以沒有東西會發現**——
> 而寫出那行的正是剛把這條規則寫進文件的 session。現在那行改成 Unicode 碼位（ASCII），
> 並由 `scripts/codepage-selftest.mjs` 驗證那五個字真的不在 cp20936 裡。
> 教訓很具體：**規則寫進文件不等於有人遵守**，機械檢查要對準「會壞掉的那個維度」（這裡是位元組與檔案類型）。

> **驗收要在「乾淨的 clone」上跑一次**（2026-09-19 實測）：`git clone` 到暫存目錄再跑 `npm test`，
> 能抓到「只有作者本機才會過」的問題（`.gitattributes` 的換行、忘了 commit 的產物）。
> **⚠️ 但目錄名要保留 `chinese-script-policy`**：`.tradzhignore` 為了不誤放行使用者的 `dev/`，
> 用的是 `**/chinese-script-policy/dev/**`（帶專案名的路徑），所以 clone 成 `csp-clone` 之類的名字時
> `test:repo` 會回報 `dev/gaps.mjs` 有 129 個簡體字——那是**路徑名稱**造成的，不是內容壞了。

**改了字表要重建**：`node scripts/build-s2t.js`（一次重建**三個**轉換表：簡→繁、繁→簡、繁體偏好；
來源放 `%TEMP%\opencc-check`）或 `node scripts/build-jp.js`（日文軸）。重建後**重跑 `npm test`
與 `npm run audit`**。重建**不會蓋掉本專案自己補的條目**（專案檔案優先，而且會列進檔案的
`$localEdits` 標頭並印在輸出裡），所以「改好的表被下一次重建抹掉」這個坑已經不存在。

**⚠️ 筆數有寫死在文件與程式裡，改完要一起更新**（這些數字不會自動同步，改了表很容易漏）：

> 2026-09 README 瘦身（24,654 → 11,142 字元）之後，**多數細節搬到 `references/`**，
> 這張表也跟著更新了。**判斷原則**：`scripts/*.js` 與 `references/*.md` 是權威，
> `README.md` 只留四軸的招牌數字（`2,637`、`367`／`123`）。

| 數字 | 出現的地方 |
|---|---|
| `49,257`（簡→繁詞組） | `SKILL.md`、`references/conversion.md`（×2）、`references/encoding.md`、`references/cli.md`、`references/data-files.md`、`scripts/core.js`、`scripts/selftest.js`、`scripts/tradzh.js` |
| `11,129`（`knownHanzi` 聯集字數） | `references/encoding.md`、`scripts/core.js` |
| `830`（繁體偏好） | `SKILL.md`、`references/conversion.md`、`references/cli.md`、`references/data-files.md` |
| `810`（反向用語偏好）、`1,002`（相容字） | `SKILL.md`、`references/conversion.md`、`references/encoding.md`、`references/cli.md`、`references/data-files.md`、`THIRD-PARTY-NOTICES.md` |
| `17 字＋30 詞＋15 弱＋3 樣式`（粵語偵測） | `SKILL.md`、`references/cantonese.md`、`references/data-files.md`、`THIRD-PARTY-NOTICES.md` |
| `367`／`123`（日文專有字／詞） | `README.md`、`SKILL.md`、`references/japanese.md`、`references/cli.md`、`references/data-files.md` |
| `12 字＋17 詞`（可轉粵語） | `SKILL.md`、`references/cantonese.md`、`references/conversion.md`、`references/cli.md`、`references/data-files.md`、`THIRD-PARTY-NOTICES.md` |
| `2,637`（簡體專有字） | `README.md`、`SKILL.md`、`references/cli.md`、`references/data-files.md`、`references/glyph-table.md`、`references/japanese.md` |
| `10`／`54`／`127`（語體偵測／轉換檢查／網頁 fixtures 總數） | `references/cantonese.md`、`references/japanese.md` |
| `66,884`／`66,769`／`99.83%`／原創 `115`（**資料來源比例**） | **不要手改**——跑 `npm run stats` 重算（它會逐表列出，並用「chars 減去 map 鍵」量出和製漢字 21 字）。引用處：`README.md` 的「OpenCC 給了什麼」那節 |

網頁頁尾的數字是**從表算出來的**（`build-web.js`），所以只有 `dist/tradzh.html` 需要重建。

**`dist/tradzh.html` 是唯一進版控的產生物**，因為它是「下載即用」的那個檔案。
所以改完字表、跑完 `npm run build:web` 之後，**要把它一起 commit**——
忘了 commit 的話 `npm test` 的 freshness 檢查會失敗（它會重建一次並逐位元組比對），
所以不會無聲出貨一份舊頁面。

## 1b. GitHub Pages，以及為什麼有 `.nojekyll`

**Jekyll 是什麼**：GitHub Pages 預設會先跑一個叫 **Jekyll** 的靜態網站產生器，再把結果當網站提供。
它會做幾件事：

| Jekyll 的行為 | 對我們的影響 |
|---|---|
| 處理 Liquid 樣板：檔案裡的 `{{ ... }}`／`{% ... %}` 會被**當成程式碼解讀** | 若某個檔案含這種字串，輕則內容被改掉、重則**整站建置失敗**（失敗時網站不會更新，只看到錯誤頁）。**本 repo 實測 0 處**，所以這條目前不會踩到 |
| 把 Markdown 轉成 HTML 頁面（README.md、SKILL.md、references/*.md） | 網站上會多出渲染過的頁面；根目錄若沒有 `index.html`，GitHub 會拿 `README.md` 當首頁 |
| **略過底線或點開頭的檔案／目錄**（`_posts/`、`_config.yml`） | 那些檔案不會出現在網站上 |
| 多一道建置步驟 | 建置有延遲、也可能因為各種原因失敗 |

**`.nojekyll`（空檔案）＝ 關掉上面全部**：repo 裡長什麼樣，網站就提供什麼，逐位元組相同。
對這個專案特別重要，因為**我們的測試保證的是「`dist/tradzh.html` 這個檔案的內容」**，
不想要中間有一層會改寫它的工具。

### 開 Pages 的步驟（一次性）

`Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save`，
等約一分鐘，`https://<帳號>.github.io/chinese-script-policy/` 就會由 `index.html`
自動轉到 `dist/tradzh.html`。

**這個設定不影響任何下載途徑**：`git clone`、`Code → Download ZIP`、單檔
`Download raw file`、`npm install` 全部照舊——Pages 只是在同一個 repo 上多開一層提供方式。
之後每次 `git push`（含 `dist/tradzh.html` 的更新）網站會跟著更新，不需要額外步驟。

## 2. ⚠️ 描述有四個地方，改了一處就要四處同步

**這是實際踩過的坑，而且踩過兩次**：加了日文軸（副軸）之後，程式、測試、`SKILL.md` 本文、
`references/` 與 README 功能表都更新了，**但對外描述還是舊的**——GitHub 的 About 甚至
還寫著早就移除的 `Traditional Chinese (Taiwan)`。第二次是 2026-09 把轉換改成三步之後，
描述又落後了一輪。所以發布前逐項確認：

| 描述在哪 | 誰會看到 | 有沒有跟上 |
|---|---|---|
| `SKILL.md` 的 frontmatter `description` / `whenToUse` | **模型**（技能目錄就只顯示這兩欄，載入時只注入本文） | ☐ |
| `package.json` 的 `description` / `keywords` | npm 搜尋、其他 harness | ☐ **255 字元上限（見下）** |
| `README.md` 開頭三行 | 第一次點進 repo 的人 | ☐ |
| **GitHub repo 的 About（description ＋ topics）** | 搜尋結果、分享連結的預覽 | ☐ |

`SKILL.md` 的 frontmatter 是**唯一來源**：`index.mjs` 會解析它來註冊技能，
所以只要改 frontmatter，技能目錄就會跟著變（不必改程式）。
**GitHub 的 About 沒有任何自動同步機制**，只能手動改（網頁右側 ⚙ 或 API），
所以它最容易漏——**它是唯一一個 `npm run check` 系列掃不到的地方**。

### GitHub About 的現成文字（2026-09，貼上即可）

**Description**（350 字上限，這份 342）：

```text
Harness-neutral Traditional Chinese enforcer and offline converter (skill / DSH bundle / CLI).
Checks one script axis one way at a time plus two filter axes: Cantonese colloquialisms and
Japanese-only kanji and words. Converts 繁↔簡, 粵語→書面語, 日文→中文, each opt-in, plus an
optional wording preference. Single-file offline HTML, no runtime deps.
```

**Topics**（20 個上限，剛好用滿。換過兩次：**09-18 用 `skill` 換掉 `charset`、用 `deepseek-harness` 換掉 `text-conversion`**
——`charset` 已被 `encoding-detection`／`big5`／`gb18030`／`hkscs` 涵蓋；再**用 `dsh-plugin` 換掉 `opencc`**
——`dsh-plugin` 是社群目錄收錄的**必要 topic**，而 `opencc` 在 npm 的 `keywords` 裡仍保留，npm 搜尋照樣找得到）：

```text
traditional-chinese  simplified-chinese  chinese  cantonese  japanese
kanji  shinjitai  kokuji  dsh-plugin  agent-skills
encoding-detection  big5  hkscs  gb18030  dsh
claude-code  cli  skill  deepseek-harness  offline
```

### ⚠️ npm 的描述**只留 255 字元**（2026-09-18 實測，別跟上面那份混用）

**上面的 342 字是給 GitHub About 的，不能拿去當 `package.json` 的 `description`。**
實測：1.1.0 發布後，registry 的 packument 與版本文件裡 `description` 長度都是 **255**，
而 tarball 裡的 `package.json` 是完整的 514 字——npm 頁面與搜尋結果因此**斷在一半**：

> `…plus two filt`（原文 514 字被切在第 255 個字元）

**規則**：npm 的 `description` 寫**純 ASCII、≤255 字元**（我們這次前半段剛好全是 ASCII 才停在
255；若含中文就無法確定它算字元還是位元組，所以直接避開）。要寫的內容：

```text
Harness-neutral Traditional Chinese enforcer and offline converter: agent skill, DSH bundle or CLI. Checks one script axis one way at a time plus Cantonese and Japanese-only kanji/word filters. Converts both directions; optional wording preference.
```

（248 字；`scripts/api-selftest.mjs` 有一條守門測試盯著「≤255 且純 ASCII」。）

**Website**：`https://ksf1216.github.io/chinese-script-policy/`（開 GitHub Pages 之後才會生效，
步驟見上一節；`index.html` 已經準備好轉向 `dist/tradzh.html`）。

### 這四處可以用 API 一次設完（2026-09 實測成功）

需要一顆有 **`repo`** scope 的 token（Git Credential Manager 存的那顆就夠——用
`git credential fill` 取即可；token 本身留在記憶體／`.npmrc`，別貼進終端機輸出或 commit）。三個端點：

| 要設什麼 | 呼叫 |
|---|---|
| description ＋ homepage | `PATCH /repos/{owner}/{repo}`，body `{"description":…,"homepage":…}` |
| topics（上限 20） | `PUT /repos/{owner}/{repo}/topics`，body `{"names":[…]}` |
| 開 Pages | `POST /repos/{owner}/{repo}/pages`，body `{"source":{"branch":"main","path":"/"}}` |

**⚠️ 兩個實測踩到的坑**：
1. **PowerShell 的 hashtable 不能直接丟給 `ConvertTo-Json` 的包裝函式**——`& $fn @{a=1}` 會被當成
   參數展開，結果 body 變成 `null`，GitHub 回 `Body should be a JSON object`。要嘛先把 JSON 字串
   算好，要嘛直接寫成字面 JSON。
2. **`"$var/topics"` 的變數展開會出事**（`Invalid URI: The hostname could not be parsed`）→ 用
   `($repo + '/topics')` 或 `${repo}/topics`。
3. Pages 建好之後**根目錄會先 404 幾十秒**（部署還在滾），`/dist/tradzh.html` 先通、`/` 後通；
   不要看到 404 就以為設定錯了。

## 3. 目前狀態（2026-09-19）

| 項目 | 狀態 |
|---|---|
| GitHub repo | **已發布** —— `https://github.com/KSF1216/chinese-script-policy`（public、branch `main`） |
| 歷史 | **2026-09-19 第二次刪掉重建，壓成單一 commit `25fcf31`（68 檔）**。原因：先前的 commit（`2e41eb7`／`a4bb684`／`ef61a98`）**內容與訊息裡有本機私人名稱**（私人專案資料夾名、本機微調模型名），而 force push／rebase 清不掉——實測舊 SHA 的 `raw` 仍回 200。驗收：舊 SHA 在 api 回 **422**、web／codeload／raw 全 **404**；Wayback 兩個端點都查無快照（`[]`，對照組 `example.com` 正常）。<br>（上一次：2026-09-18 壓成 `ae401bf`，tree 與刪除前相同 `0e4f5e25…`） |
| About／topics | 已設（description **339 字**、topics 20 個、Website 指向 Pages）；重建後由 API 設回 |
| GitHub Pages | **已上線**：`/`、`/dist/tradzh.html` 都回 200，且與本機 `dist/tradzh.html` 逐位元組相同 |
| npm | **registry 上只有 `1.2.0`**（2026-09-19 07:13Z，`latest`，58 檔，shasum `e571b2d5…`，1.4 MB / unpacked 3.6 MB）。`1.0.0`／`1.1.0`／`1.1.1` 都已 unpublish（都在 72 小時窗口內）；**三個版號永久保留、不會再用**——`time` 紀錄還在，`versions` 只剩 1.2.0，被刪版本的 tarball 實測 **404** |
| npm（待發布） | **`1.3.0` 已備好**（2026-09-19）：版號已 bump、`dist/tradzh.html` 已重建（頁尾印 `v1.3.0`）、`npm test`／`npm run audit`／`npm pack --dry-run` 全綠。`npm publish` **由使用者在自己的終端機跑**（非 TTY 會立刻 `EOTP`）；發布後才補 tag `v1.3.0` 與 GitHub Release（body 取 §6 的 1.3.0 段） |
| git tag／Release | **`v1.2.0`**（annotated tag，已推）＋ GitHub Release 已建（body 直接取自 §6 的 1.2.0 段）。⚠️ 舊的 `v1.0.0` tag 只存在本機——它指向重建前的 commit，不在新歷史裡，所以沒有推 |
| ⚠️ 教訓 | **不要把「不該外流的名字」寫進會出貨的檔案**——哪怕只是為了禁止它們。守門機制可以出貨，名單要留在不進版控的 `.ship-deny.txt`（見 §385）。片段拼接（`'local' + '-llm'`）擋得住自動掃描、擋不住人眼 |

### 舊版內容要真的消失，只能刪掉 repo 重建（`--force` 不夠）

**`git push --force` 不會讓舊 commit 消失**：GitHub 的 GC 沒有時間表，實測壓成單一 commit
之後，**舊 SHA 的 `raw`／`blob` 照樣取得**（內容還含被改掉的舊字句）。所以 2026-09-17
改成「**刪掉整個 repo 再重建**」：

1. `DELETE /repos/{owner}/{repo}`
2. `POST /user/repos`（body 帶 `name`／`description`／`homepage`／`private:false`）
3. `git push -u origin main`
4. `PUT /repos/{owner}/{repo}/topics`
5. `POST /repos/{owner}/{repo}/pages`

**驗收要看四個地方**（這次全過）：

| 路徑 | 結果 |
|---|---|
| `api.github.com/repos/…/commits/<舊 sha>` | **422**（每個舊 sha 都是） |
| `github.com/…/commit/<舊 sha>`、`/blob/…`、`/tree/…` | **404** |
| `codeload.github.com/…/tar.gz/<舊 sha>`、`/zip/<舊 sha>` | **404** |
| `raw.githubusercontent.com/…/<舊 sha>/README.md` | **404（但要等約五分鐘）** |

**⚠️ `raw` 是 CDN，刪除重建後還會多撐幾分鐘**：實測當下仍回 200，標頭是
`X-Cache: HIT`、`Source-Age: 289`（≈ Fastly 邊緣快取五分鐘），**同一時間** API 已經 422、
`github.com` 已經 404。**看到 200 不要急著判定「沒刪乾淨」，等快取過期再驗**；
對照組：隨便一個沒存在過的 sha 一直是 404，所以那個 200 是快取而不是真的還在。

順手確認 **Wayback 沒有舊版快照**（2026-09-17 查證完成，**兩種獨立方法都確認**）：

**方法一：CDX API**（`url=<前綴>*` 是「這個前綴底下**所有路徑**的快照總表」，所以 repo 首頁、
`blob` 頁、`commit` 頁全被涵蓋）：

| 查詢 | 結果 |
|---|---|
| `github.com/KSF1216/chinese-script-policy`（精確） | HTTP 200 → **`[]`** |
| `github.com/KSF1216/chinese-script-policy*`（前綴） | HTTP 200 → **`[]`**（兩個獨立時段各中一次） |
| `ksf1216.github.io/chinese-script-policy*` | HTTP 200 → **`[]`** |
| `raw.githubusercontent.com/KSF1216/chinese-script-policy*` | HTTP 200 → **`[]`** |
| **對照組 `example.com`** | HTTP 200 → **有真實快照**（2002 年起）← **證明查詢方式有效** |

**方法二：sparkline API**（另一條端點，回傳每年的快照數）——**這條的證據最直接**：

| 查詢 | 回應 |
|---|---|
| `github.com/KSF1216/chinese-script-policy` | `{"years":{},…,"message":"The Wayback Machine has not archived that URL."}` |
| `ksf1216.github.io/chinese-script-policy/` | 同上 |
| **對照組 `example.com`** | `{"years":{"2002":[…],"2003":[…],…}}` ← 有實際數字 |

**結論：Wayback 從來沒有存過這個 repo 或它的 Pages 站。** 而且這次是伺服器**明文這樣講的**
（`The Wayback Machine has not archived that URL.`），不是我們從空陣列自己推論；
對照組也證明兩條查詢路徑都問得到東西。

> ⚠️ **過程中的教訓（下次查 Wayback 一定要照做）**：Internet Archive 的 CDX 端點**極不穩定**，
> 同一輪查詢會**隨機**回 **503「Temporarily Offline」**（退避重試 8 次照樣撞上），
> `available` API 則常回 429。所以：
> **① 一定要帶重試　② 一定要看 HTTP 碼（503 ≠ 沒有快照）　③ 一定要跑對照組**
> ——不然 503 會被誤讀成「查無快照」，變成一個看起來很確定、其實沒查到的結論。

（`webcache.googleusercontent.com` 回 200 是假警報 —— Google 早已停掉快取服務，
那個回應只是搜尋頁的 JS 外殼，內容裡沒有舊版任何一個字。）

### npm 發布的卡點與解法（2026-09-17 已發布）

**當初的五步診斷**（留著是因為下次卡住時最快能對照）：

1. `npm whoami` → **`ksf1216`**（`.npmrc` 裡是 `npm login` 留下的 session token，正常）
2. 套件名可用（`GET /chinese-script-policy` → 404，表示沒被別人佔用）
3. `npm test` / `npm run audit` / `npm pack --dry-run` 全綠（43 檔、1.2 MB）
4. `npm publish` → **E403**：
   `Two-factor authentication or granular access token with bypass 2fa enabled is required`
5. `npm profile get` → **`two-factor auth: disabled`** ← 根因在這裡

**根因不是我們的設定寫錯，是 npm 現在「沒有 2FA 就不能發布」**（2026 查證的官方規定）：

- npm 官方文件明講：發布套件需要 **① 帳號啟用 2FA，或 ② 一顆勾了 Bypass 2FA 的
  granular access token**——兩者都沒有就會拿到 E403，訊息裡那句就是這條規定
- **bypass-2FA token 正在被淘汰**：2026-07-31 起不能用於帳號／組織／套件管理
  （建 token、加 maintainer、改 trusted publishing 都要互動 2FA）；官方目標 **2027-01**
  連「直接發布」都不行（發布只能**暫存**，等人工用 2FA 核准）
  → **長期正解是帳號開 2FA**，或改用 trusted publishing（OIDC）

兩種 2FA 模式（`npm profile enable-2fa [auth-and-writes|auth-only]`，**不指定時預設前者**）：

| 模式 | 發布時要不要再過一次 2FA | 適合誰 |
|---|---|---|
| `auth-and-writes`（官方預設，較安全） | **要**：`npm publish --otp=<6 位>`，或安全金鑰的瀏覽器／Windows Hello 挑戰 | 發布是偶發動作；session token 被偷也發布不了 |
| `auth-only` | **不用**（該模式的挑戰清單裡沒有 publish），但登入、改密碼、建 token 仍要 | 想在腳本／agent 裡直接發布 |

> `auth-only`「發布不用 OTP」是**依官方文件那張行為表推定的，本專案還沒實測過**。
> 另外要留意的取捨：`auth-only` 之下，`.npmrc` 裡的 token 被偷就能發布套件。

### ⚠️ 驗證器 App（TOTP）已經不能新設了（2026-09 查證）

**npm 現行的 2FA 只提供「安全金鑰」**（WebAuthn：Windows Hello、Touch ID／Face ID、
passkey、YubiKey）。**新帳號／新設定已經沒有「Authenticator App」可以選**：

- npm 官方文件的 2FA 內文（`about-two-factor-authentication`）只剩安全金鑰流程；
  `[totp]` 的連結定義還留在頁尾，但內文已經不再引用它
- 社群討論 [community#182325](https://github.com/orgs/community/discussions/182325)
  （2025-12-20 開、32 則留言、被標記為 Bug）的發文者**特地新註冊一個 npm 帳號實測**，
  整個 2FA 流程**唯一選項就是 Add Security Key**——「The choice to use an authenticator app
  was never offered.」；2026-09-03 最新一則留言還在抱怨
  「我的桌機沒有指紋辨識器，只好把 2FA 整個關掉，為什麼不能像以前一樣用 Google Authenticator？」
- **舊帳號若早年就設過 TOTP，那個區塊還會在** → 所以社群裡有人能報 6 位數字、有人完全沒這個選項
  （同一頁兩邊都有人回報，不是個別帳號的設定問題）

**對發布流程的實際影響**：**「請對方讀一組 6 位數字、由 agent 代發」這條路不成立**。
發布只剩 ① **安全金鑰**（要一次瀏覽器互動，Windows Hello 的 **PIN 就可以**，不必有指紋辨識器），
或 ② **bypass-2FA token**（可無互動，但 2027-01 起不能直接發布）。

其他實測踩到的坑：**只把 token 權限設成 "Authorization and writes" 而沒開帳號 2FA 是沒用的**，
錯誤訊息一模一樣。（帳號狀態一直是 `two-factor auth: disabled`，所以那不是 OTP 提示。）

**⭐ 有兩種 OTP，很容易搞混**：

| 哪一種 | 什麼時候出現 | 能不能拿來發布 |
|---|---|---|
| **登入用 email OTP** | 帳號**沒有** 2FA 時，登入會要求一組寄到 email 的驗證碼（官方文件：Receiving a one-time password over email） | **不行**，那是登入驗證 |
| **2FA 挑戰** | 帳號**有** 2FA 時，`npm publish` 要求 OTP 或安全金鑰 | 可以 |

使用者當初貼的那組 8 位數字很可能就是第一種——所以拿它去發布當然不會過。

**⭐ 啟用 2FA 會讓 `.npmrc` 裡的 token 失效**（2026-09-17 實測）：開 2FA 之前 `npm whoami`
還是 `ksf1216`，之後同一顆 token 變成 `E401 … your authentication token seems to be invalid`。
→ **開完 2FA 要重新 `npm login`**（而它本身就要過一次 2FA 挑戰）。

**⚠️ 恢復碼用掉會換來 72 小時的發布禁令**：官方文件明講，用恢復碼登入會觸發**暫時性的
72 小時安全凍結**，期間**不能發布套件、不能建 token、不能改帳號設定**。
所以安全金鑰要顧好，恢復碼是「救命用」不是「平常登入用」；另外建議在 npm 帳號設定裡
**連結 GitHub 帳號**，遺失 2FA 裝置時可以加速復原。

參考：npm Docs [About two-factor authentication](https://docs.npmjs.com/about-two-factor-authentication/)、
[npm-publish 的 `--otp`](https://docs.npmjs.com/cli/v11/commands/npm-publish)、
GitHub Changelog [2026-07-08](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/)、
[2026-07-31](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)。

### ⭐ 實際發布流程（2026-09-17 成功，安全金鑰版）

**`npm publish` 在有安全金鑰 2FA 時不是「打完指令就好」，是一個三段式的互動流程：**

```
1. http fetch PUT https://registry.npmjs.org/<pkg>   → 401   ← 先被擋，這是正常的
2. verbose web auth opening url pair                        ← npm 自動開瀏覽器，並在終端機印出網址
3. GET https://registry.npmjs.org/-/v1/done?authId=… → 202  ← 每 0.2 秒輪詢一次，等你去按
   （你按下 Use security key → Windows Hello 確認之後）
   GET …/-/v1/done?authId=…                          → 200  ← 挑戰通過
   verbose web auth done-check finished
   http fetch PUT https://registry.npmjs.org/<pkg>   → 200  ← 這次才真的上傳
   info ok
```

> ⚠️ **這個三段式流程只在「有 TTY」時才會發生**（2026-09-17 實測，同一支套件兩種結果）：
> 由 agent／背景程序啟動的 `npm publish`（**非 TTY**）**不會**走 web-auth 輪詢，而是
> `PUT → 401` 之後**立刻** `error code EOTP` 並 **exit 1**，而且**印出來的網址會被遮蔽成 `***`**
> （連轉貼給人按都沒有辦法）。分辨方法就是看 log：
> 有 `verbose web auth opening url pair` ＋ 一串 `GET /-/v1/done` ＝ 互動流程（在等你按）；
> 只有 `PUT 401` 後面直接 `EOTP` ＝ 非 TTY 版（已放棄）。
> **結論：發布那一步必須由使用者在自己的終端機跑。** agent 能（也應該）把前置全部做好——
> 版號、**重建產物**（頁尾印版本號，所以要先 `npm version` 再 `build:web`）、`npm test`、
> `npm run audit`、`npm pack --dry-run`、commit ＋ push main——然後請使用者按下去。
**⭐ 怎麼判斷「它在等你」而不是「它失敗了」**：看 `%LOCALAPPDATA%\npm-cache\_logs\` 最新那份
`*-debug-0.log`，再對照 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`：

| log 長相 | 意思 |
|---|---|
| `PUT … 401` ＋ `verbose web auth opening url pair` ＋ 一串 `GET /-/v1/done … 202` | **還活著，在等你按安全金鑰**（程序也還在） |
| `PUT … 401` 之後就結束、沒有 `done-check finished` | 挑戰逾時或被 `Ctrl+C` 打斷，**要重跑** |
| `PUT … 200` ＋ `verbose exit 0` ＋ `info ok` | **成功** |

**⭐ 發布後 registry 讀到 404 是 CDN 快取，不是失敗**：這次的實測是
`GET /chinese-script-policy` 仍回 **404**（因為發布前反覆查過，那個 404 被快取住），
但 `GET /chinese-script-policy/latest` 立刻回 **200**。**驗收請用 `/latest`**，
或等快取過期；不要因為 packument 還 404 就重發（會撞 `EPUBLISHCONFLICT`）。

**⭐ 1.2.0 的另一個發現：現在的 publish 是非同步的**（2026-09-19 實測）。按完安全金鑰之後
`PUT` 回的是 **202（受理、處理中）**，npm 自己印
`Your package is being processed and may take a few minutes to become available.`，
日誌結尾是 `verbose exit 0` ＋ `info ok`。**`dist-tags.latest` 約一分鐘後才從舊版跳到新版**：
這段時間 `npm view <pkg> version` 還是舊版、`npm view <pkg>@<新版>` 回 **E404**——
**那不是失敗，是還沒處理完**（我這次就在一分鐘內查而誤判成「發布沒成功」）。
判斷方式看日誌：`/-/v1/done` 出現 **200**（＝你按了金鑰）＋ 最後 `PUT 202` ＋ `info ok`
＝ 成功，去等、不要重跑。

**⭐ 連 tarball 的 URL 也會被快取住 404**（2026-09-19 實測）：發布**前**查過一次
`…/-/chinese-script-policy-1.2.0.tgz`（當時當然 404），發布後同一個 URL **還是 404**——
即使 `dist-tags.latest` 已經是 1.2.0、`npm view <pkg>@1.2.0 dist.shasum` 也拿得到。
**加一個查詢字串就繞過快取**：`…tgz?v=1` 立刻回 **200**（實測）。要驗「tarball 真的在」時用這招，
不要因為 404 就重發。

**⭐ 發布後的驗收清單（四項都做才算驗完）**：

1. `shasum` 與本機 `npm pack` 的產物一致（這次是 `237751f5277ba7546059f0a4438fa2faf2887887`）
   → 證明「線上的東西＝我們測試過的東西」
2. 解開線上 tarball 掃一遍：不得出現本機絕對路徑、token、私人專案或模型名這類不該外流的字串
   （**這一條現在有測試**：`npm test` 的 `api-selftest` 會照 `package.json` 的 `files` 白名單
   逐一掃。通用樣式隨套件出貨；**只在本機成立的名字放在 `.ship-deny.txt`（不進版控）**——
   把名字寫進會出貨的檔案裡，就是把它公開，哪怕只是「為了禁止它」）
3. **裝一份下來跑它自己的測試**：`npm i chinese-script-policy@1.0.0` →
   `node node_modules/chinese-script-policy/scripts/selftest.js` 要 exit 0
4. `bin` 可用（`node_modules\.bin\tradzh.cmd --help`）＋ 真的轉一次字

**⚠️ PowerShell 不支援 `<` 重導向**（`The '<' operator is reserved for future use.`）：
要餵 stdin 給 CLI 得繞一層 —— `cmd /c "node_modules\.bin\tradzh.cmd --fix --to-traditional --write out.txt < in.txt"`。

**⚠️ 用 `Get-Content -Raw` 讀 UTF-8 檔會顯示亂碼**（沒指定編碼時走 ANSI／cp950）：
**檔案是好的，是顯示壞的**。要確認內容用 `[System.IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)`。

發布完成後：`git tag -a v1.0.0` ＋ `git push origin v1.0.0`（這次 tag 打在 `deb428c`）。

### ⭐ 改了出貨檔案，四個露出點**不會同時**更新

改一份 README（或任何會出貨的檔案）之後，要清楚「哪些地方已經是新版」：

| 露出點 | 什麼時候更新 | 怎麼驗 |
|---|---|---|
| 本機檔案 | 立刻 | 讀檔 |
| GitHub repo（網頁、`raw.githubusercontent.com/…/main/…`） | `git push` 後立刻 | `curl …/main/README.md` |
| GitHub Pages（`/<file>`） | 推上去後**約 20～40 秒**重建 | 實測隔 20 秒再查就更新了 |
| **npm registry ／ npmjs.com 套件頁的 README** | **只跟著 tarball**——**不重發就一直是舊版** | packument 的 `readme` 欄位 |

**教訓**：像「README 那句話寫得不精確」這種小修，在 **npm 頁面上要發一個 patch 版本**
（`1.0.0` → `1.0.1`）才會反映。所以文件類的修正最好**攢一攢再一次發**，
不要為了一句話多按一次安全金鑰。

### ⚠️ 驗證遠端內容時：`Invoke-RestMethod` 會把 UTF-8 的 JSON 當 Latin-1 解

2026-09 實測踩到：用 `Invoke-RestMethod` 抓 registry packument，中文全變成
`ä¸ç¶å®` 這種亂碼，於是 `$readme.Contains('中文關鍵字')` **全部回 False**——
看起來像「檔案內容不對」，其實是**解碼不對**。更陰的是 **ASCII 字串照樣比對成功**
（`Qwen3.8` 為真），所以錯誤會偽裝成「只有中文那幾段不見了」。

正確做法：**先落地成檔案，再用明確編碼讀**。

```powershell
curl.exe -s -o "$env:TEMP\pkg.json" 'https://registry.npmjs.org/<pkg>'
$j = [System.IO.File]::ReadAllText("$env:TEMP\pkg.json", [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$j.readme.Contains('中文關鍵字')     # 這樣才可信
```

## 5. 開發（改字表、跑測試）

```powershell
npm test                                                         # 四個測試都跑（轉換＋hook＋外掛＋網頁）
node scripts\selftest.js                                         # 轉換／語體／編碼／日文回歸測試，要全綠
node scripts\hook-selftest.mjs                                   # 寫入 hook（它壞掉是無聲的）
node scripts\plugin-selftest.mjs                                 # 用「真的」技能註冊表驗證外掛入口
node scripts\web-selftest.mjs                                    # 網頁跟 CLI 的結果比對＋UI 驅動＋頁面是否過期
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\audit-glyph-list.ps1   # ← 只有這行要 Windows
node scripts\tradzh.js --dir .                                   # 這個 repo 自己也要是乾淨的
node scripts\tradzh.js --japanese --dir .                        # 連日文軸也要乾淨
```

**除了 `audit-glyph-list.ps1` 以外，上面每一項都是純 Node**，所以在 macOS／Linux 上也能跑
（`npm test`、三個檢查指令的自我檢查、`npm pack` 全部跨平台）。稽核腳本只有在**重新產生字表**時才需要，
那是維護者步驟，需要 Windows 的 cp950／cp936 編碼器。

改了字表或轉換表之後，**上面六個都要跑**（動到網頁再補一次 `npm run build:web`，
動到日文表再補一次 `npm run build:jp`）。

`hook-selftest.mjs` 用真的子行程、真的管線餵 payload 給 hook，並檢查 exit code——
因為 hook 的設計是「自己壞掉就放行」，它故障時沒有任何其他測試看得見。

> **手動測 hook 時建議走檔案＋`cmd.exe` 重導向**，不要用 PowerShell 管線：PowerShell 會重新編碼，
> 非 ASCII 內容在途中會被吃掉，看起來就像 hook 完全沒作用：
> `cmd /c "node scripts\pre-write-check.js < payload.json"`

`plugin-selftest.mjs` 會掛載真正的 `@deepseek-ai/dsh-skill` 註冊表，再掛上
`index.mjs`，然後**實際列出並載入**這個技能。這一項抓得到假 context 抓不到的錯——
例如 runtime 註冊少了 `source` 字串時，技能**會出現在目錄裡**，但模型真的載入時才丟錯。
沒安裝 DSH 的機器會自動跳過（exit 0），不會誤報失敗。

`audit-glyph-list.ps1` 平常 exit 0（安靜），只有在出現 baseline 沒審核過、
但 Big5 也收錄的字時才 exit 1，那時要人工判斷：真的會在繁體文本出現的就刪掉
（`-Drop "峰床痴"`），確定是簡體標準字的就 `-Update` 記進 baseline。

日文表用同一套紀律但寫在 `build-jp.js` 裡：**cp950 編得出來的字一律排除**
（57 個，`VALID_CHINESE_TOO`）。若 OpenCC 之後新增了新字體，而它同時是合法中文，
那個清單要手動補——這是刻意的，它是一份被審核過的名單，不是自動推導出來的。

### 待辦卡（`handoff-discipline` 格式，未出貨）

| 卡 | 內容 | 狀態 |
|---|---|---|
| `NEXT-write-rules.md` | 把「Windows 檔案類型寫入陷阱」搬進 `SKILL.md` 的寫入區 | **done**（2026-09-19） |
| `NEXT-file-type-guard.md` | 同一條規則的機械強制（外掛的 `fileTypes` 開關＋repo 自己的位元組守門） | **done**（2026-09-19） |

這張卡**不在** `package.json` 的 `files` 白名單裡（不會出貨），所以索引放在這裡而不是 `README.md`——那是對外門面。
若之後要接 `handoff-discipline` 的檢查器，專案 wrapper 的 `index` 要指到 `PUBLISHING.md`：
用預設的 `README.md` 會把卡片判成 `orphan-card`，而那**不能**靠改 `README.md` 解決。

> 這裡只列**這個 repo 自己的**卡。不屬於這個套件的工作項（例如全域記憶 `~/.dsh/AGENTS.md` 的指標行）
> 不要放進來——那會讓發版文件混進無關的工作項。**卡片要放在它所屬的工作區**，不是放在人剛好坐著的地方。

**要發布新版本時**（GitHub 推送、`npm publish`、版號規則、動到資料表的額外步驟、
發錯了怎麼補救）看 [`PUBLISHING.md`](PUBLISHING.md)——那份只給維護者，
刻意不列入 npm 打包清單。
## 6. 發布說明（貼進 GitHub Release 用）

### 1.3.0 — Windows 腳本檔類型的寫入守衛

```markdown
### 1.3.0 — Windows 腳本檔類型的寫入守衛

**新增**
- **設定卡的第四個開關：「Windows 腳本檔類型」**（`fileTypes`：`off`／`warn`／`block`，預設 `warn`）。
  這不是中文軸——上面幾條看「內容裡的中文」，它看**寫入的檔案類型**。判準刻意很窄：
  `.ps1`／`.psm1` 的內容含**任何非 ASCII** 就擋（真的會壞：寫入工具一律寫「UTF-8 無 BOM」，
  而 Windows PowerShell 5.1 用 ANSI 讀 `.ps1`，實測錯誤是 `The string is missing the terminator`）；
  `.cmd`／`.bat` 含非 ASCII 或**只有 LF 沒有 CRLF** 則只警告（實測仍能執行，只是換一台機器會亂碼、
  `goto` 會跳錯標籤）。**只看寫入、不掃描既有檔案**（別人既有的 UTF-16 或帶 BOM 腳本不受影響）、
  **fail-open**、純 ASCII 永不觸發；`block` 也只擋 `.ps1`，`.cmd` 永遠只警告。
- `SKILL.md` 新增〈檔案類型陷阱（Windows）〉：規則的**單一來源**（兩列表 ＋ 三行位元組驗證 ＋
  為什麼不是「寫完再轉」、為什麼不用 BOM）。`references/encoding.md` 補成因與實測：
  同一支腳本五種編碼的對照表（**只有「UTF-8 無 BOM」會壞**，連 PowerShell ISE 預設的 UTF-16 都能跑），
  以及 `.cmd` 的純 LF 為什麼讓 `goto` 與 `set /p` 出怪事。

**修正**
- `scripts/build-codepage.ps1` 的註解裡有 **15 個非 ASCII 位元組**（五個常見繁體字），
  等於這支腳本自己在違反它要示範的規則。改成 Unicode 碼位（純 ASCII），
  並由 `test:codepage` 驗證那五個字真的不在 cp20936 裡。

**測試**
- `test:api` 61 → 66 項：新增「**repo 自己的位元組規則**」——走一遍 repo（跳過 `node_modules`／`.git`），
  讀**原始位元組**確認每個 `.ps1` 是純 ASCII、每個 `.cmd`／`.bat` 是純 ASCII ＋ CRLF，
  並先證明兩個偵測器真的會紅（讀成文字就看不出差別，所以這條一定要在位元組層）。
  **它第一次跑就抓到真的違規**（就是上面那個 `build-codepage.ps1`）——不是合成的假案例。
- `test:plugin` 的設定卡 24 → 27 項：`inspectFileType` 的 14 個行為案例（純 ASCII 放行、
  `.md`／`read` 不觸發、`.cmd` 給 `block` 仍只警告、CRLF 放行而純 LF 觸發）、
  真的 cordis waterfall 上的 3 個掛載案例，以及設定卡的第四組單選與**折疊標題行**跟著 `fileTypes` 變。

**文件**
- `README.md` 的寫入把關段落補上這兩條檔案類型規則與預設值；
  `references/integration.md` 補 `fileTypes` 的設定、三個刻意設計，以及**兩個還沒做的缺口**
  （`hooks.json` 那條路沒有這條規則、CLI 沒有 `--file-types`）。
```

### 1.2.0 — 本機 LLM 的輸出把關、執行時編碼風險、出貨守門

```markdown
### 1.2.0 — 輸出把關、執行時編碼風險、出貨守門

**新增**
- **`examples/llm-proxy/llm-guard-proxy.mjs`：本機 LLM 的輸出守衛代理**（零依賴，
  npm script `llm-guard-proxy`）。llama-server 沒有外掛機制，`--logit-bias` 只是降低機率、
  表達不了詞組，`--grammar` 對散文不實用，所以機械層放在伺服器外面：代理整個 origin
  （內建網頁照用）、非串流、只讀生成端點的 JSON、**帶 `tool_calls` 的回應絕不改寫**
  （所以不要指給 agent harness），乾淨的回應逐位元組通過，轉不動的殘留在 log 裡回報。
  用的是同一份 `guardInspect`／`toTraditional`。
- **`--console-hazard`：第三條軸（執行時編碼風險）**。找「會印到 console 的行」裡
  **目標 codepage 編不出來**的字元，計入 exit code。檔案可以是正確繁體卻在執行時崩潰——
  實測案例是一個 ComfyUI 節點 print 含簡體字的訊息，Windows 主控台 cp950 丟
  `UnicodeEncodeError`，節點掛掉、連 traceback 都寫不進日誌（症狀看起來像「卡住」）。
  只綁 `print`／`echo`／`logging`／`logger`／`log`／`console`／`raise`（註解與變數名不算），
  並在輸出明說這是**啟發式**判斷。
  `--codepage` 內建 950／936／932／1252／20936；54936（GB18030）與 65001（UTF-8）
  編得下全部 Unicode，永不回報。⚠️ 命名陷阱：Windows 把 936 叫 `gb2312`，但它其實是 GBK
  （連繁體都編得出來）；嚴格 GB2312-80 是 20936，它反過來編不出 `體 軟 淨 麵 裡`。
- 設定卡的標題列改成**跟著設定變**（原本寫死「簡體專有字」，切到「要求簡體」時與同卡的
  單選標籤自相矛盾——折疊起來時那是唯一看得到的字）。

**修正**
- 出貨檔案不再含本機資訊：新增**出貨掃描守門**（在 `test:api` 內），照 `package.json` 的
  `files` 白名單逐一掃。通用樣式隨套件出貨；只在本機成立的名稱放在不進版控的
  `.ship-deny.txt`——**把名字寫進會出貨的檔案裡就是把它公開，哪怕只是為了禁止它**。

**測試**
- `test:codepage`（41 項）釘住 codepage 涵蓋表的量測數字；`test:proxy`（30 項）用真的
  upstream ＋ 真的監聽中的代理測邊界；`test:api` 58 → 61 項；`--console-hazard` 的 8 個
  CLI 案例進 `selftest-cases.json`。

**移除**
- `chinese-script-policy@1.1.0` 與 `1.1.1` 自 npm 移除（都在發布後 72 小時內，依官方政策可
  unpublish）；`1.0.0` 更早已移除。**三個版號永久保留給已下載過的安裝來源，不會再被使用。**
  移除的理由是「registry 上只留最新版」，**不是外洩**：兩份舊 tarball 都經掃描確認不含任何
  本機資訊（各 52 檔、沒有 `.ship-deny.txt`、私人名稱命中 0）。
  registry 上現在只有 `1.2.0`（`dist-tags.latest` 不變）。

**資料**
- `scripts/codepage-repertoire.json`（182 KB）由 `npm run build:codepage` 以 .NET 產生
  （Node 沒有這些編碼器）。encoder 與 decoder 的 fallback **必須**是 `ExceptionFallback`，
  否則 .NET 會把編不出來的字換成 `?`，得到「全部都編得出來」的假通過。
```

### 1.1.0 — 網頁應用入口、術語改名、文件重排

**新增**
- **網頁應用入口**：`exports` 開 `chinese-script-policy/lib`、`/core`、`/tables/*`，
  `core` 另加 `scripts/core.mjs` 的 ESM 墊片（UMD 包裝讓 Node 看不到具名匯出）。
  `examples/web-app/` 是可跑的示範服務（零依賴，把 `guardInspect` 接在 API 邊界）。
- `npm run stats`：資料來源比例（66,884 筆中 99.83% 來自 OpenCC、原創 115 筆）改由程式算出。
- `test:api`（57 項）釘住網頁應用的入口、兩條路線的一致性，以及**術語守門**（見下）。

**⚠️ 破壞性變更（1.0.0 → 1.1.0）**
- **用語偏好合併成「一個開關、兩張表」**：1.0.0 的 `--tw-vocab`／`--cn-vocab`
  （以及開發期間短暫用過的 `--tc-vocab`／`--sc-vocab`）**全部改成 `--wording`**。
  舊名字會**明確報錯**（exit 2）並提示新名稱，不會再被默默忽略；沒給方向時也會報錯。
  **用哪一張表由轉換方向決定**（簡→繁用繁體偏好表 830 筆、繁→簡用簡體偏好表 810 筆），
  所以不可能把表跟方向配錯，也不存在「兩個都勾」的狀態。網頁的勾選框同步合成一個「用語偏好」。
- 資料檔改名：`tw-vocabulary.json` → `tc-vocabulary.json`、
  `cn-vocabulary.json` → `sc-vocabulary.json`（只影響直接引用檔名的人）。

**文件**
- 軸向框架改成 **「兩條主軸二選一 ＋ 兩條副軸過濾」**（原本寫成「四條軸」，
  會讓人以為繁體軸與簡體軸可以同時開——那等於每份文件都被擋），
  **npm 套件描述也一起改**（那裡原本還寫 `Flags four axes`，是搜尋結果與 npm 頁面看得到的字）。
- **示範服務的轉換 API 改成同一個開關**：`{"to":"traditional","wording":true}`，不再有
  `tcVocab`／`scVocab` 兩個可同時送的舊旗標；示範頁也加了那一個勾選框。
- 新增**術語守門測試**（在 `test:api` 內）：文件不得再用「繁簡偏好」「兩岸詞彙」「臺灣用語」
  或 `cross-strait` 指稱這一層，README／SKILL.md 也不得再用「四條軸／三條軸」的講法
  ——這兩個講法各退回去過一次，所以改成測試而不是慣例。
- README 從 24,654 字元瘦到 11,058（-55%），深度內容進 `references/`。
- 離線網頁的兩個腳本方向勾選框改為**互斥**（勾一邊自動取消另一邊）。
```

### 1.1.1 — npm 的描述不再被截斷

```markdown
### 1.1.1 — 修正 npm 頁面的套件描述

**修正**
- `package.json` 的 `description` 縮到 **248 字元的純 ASCII**。npm 的 registry
  **只保留前 255 個字元**（實測：packument 與版本文件都是 255，tarball 裡是完整的 514），
  所以 1.1.0 在 npm 頁面與搜尋結果上的說明**斷在一半**（`…plus two filt`）。
- `PUBLISHING.md` 把兩個上限分開記：**npm 255 字元（純 ASCII）／GitHub About 350 字元**，
  兩份現成文字各自獨立，不再互相複製。
- `test:api` 新增守門：`description` 必須 ≤255 字元且純 ASCII。

**移除**
- `chinese-script-policy@1.0.0` 自 npm 移除（發布未滿 72 小時，依官方政策可 unpublish）。
  **版號 1.0.0 永久保留給已下載過的安裝來源，不會再被使用。**

其餘內容與 1.1.0 相同（1.1.0 沒有程式缺陷，只有這一行的顯示問題）。
```

---

## 7. 上架社群市集（`awesome-dsh-plugin` 目錄，2026-09-18 查證）

**DSH 本體沒有市集**——在 DSH checkout 裡搜過檔名、目錄與文件，`marketplace` 完全不存在。
市集是社群做的，但**共用同一份目錄**：

| 角色 | 專案 | 資料來源 |
|---|---|---|
| **目錄（唯一來源，投稿的目標）** | [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | 生成 `awesome-dsh-plugin.com/plugins.json`（實測 **3,727 筆**） |
| 市集 App（有 GUI，設定裡多一個分頁） | [`dsh-market`](https://github.com/dsh-market/dsh-market)（`dsh plugin --profile web add dshmarket`） | 開頁時即時抓上面那份 `plugins.json`（`DSHM_REGISTRY_URL` 可指向鏡像） |
| 另一個前端 | [`dsh-plugin-store`](https://github.com/sandbaseai/dsh-plugin-store) | `dshpluginleaderboard.com` 的目錄 |

### 投稿＝一個檔案（README 是生成的，不准手改；一個 PR 最多 3 條）

`data/plugins/<owner>__<repo>.yml`——我們的內容：

```yaml
url: https://github.com/KSF1216/chinese-script-policy
name: KSF1216/chinese-script-policy
category: skill
description:
  en: 'Chinese script policy for DSH: registers the skill, blocks (or warns on) a write whose content fails the configured script axis - Simplified-only glyphs when Traditional is required, Traditional-only when Simplified is - plus the Cantonese colloquial and Japanese-only filters, with every switch on a settings card.'
  zh: DSH 的中文用字規範：註冊技能，並在寫入前擋下不符所選主軸的內容（要求繁體抓簡體專有字、要求簡體抓繁體專有字，另有粵語口語與日文專有字詞兩條副軸），所有開關都在設定卡上。
```

* `en` 含 `: `（冒號加空格）→ **必須加引號**，否則 YAML 會讀成嵌套鍵（規則特別警告這點）。
* **不要手寫 `npm:` 欄位**：npm 對應會自動從 registry 採集，手寫會被驗證拒絕。
* 描述只寫**外掛真的做的事**——它不轉換（轉換是同一包的 CLI／網頁）。規則是拿描述去對程式碼，
  誇大是唯一會被退回的原因。

### 收錄條件 vs 我們的狀況（2026-09-18 量測）

| 條件 | 我們 |
|---|---|
| `package.json` 宣告 `dsh.bundle` | ✅ `{"bundle":{"patch":"./cordis.patch.yml"}}` |
| `cordis.patch.yml` 形狀 `- insert:` → `id`／`name` | ✅ |
| 真實可用的程式碼（非佔位／純 README） | ✅ |
| **repo 建立滿 1 天**（CI 自動檢查） | ⚠️ **repo 在 09-19 13:47（香港時間）第二次重建 → 09-20 13:47 起才合格**；`-DryRun` 實測會擋（`BLOCKED: … Retry after 2026-09-20 13:47`） |
| 積極維護 | ✅ |
| 加 `dsh-plugin` topic | ✅（09-18 加；用 `opencc` 換掉，因為 topics 上限 20 已滿） |
| 分類貼合 | ✅ `skill` |
| 描述如實、無行銷詞 | ✅ |

### ⚠️ 兩個容易踩的坑

1. **`engines.dsh` 刻意不宣告**：市集卡片會顯示相容性，沒宣告就標 `undeclared` 但**照樣列出**；
   而亂宣告會被**靜默排除**——規則點名：peer range 若沒有帶 prerelease 標籤的比對分支
   （例如 `>=0.0.1-rc.1 <0.2.0`），node-semver 不會放行 `0.1.0-rc.6`，使用者會撞 `ERESOLVE`。
   真要寫得寫成 `>=0.0.1-rc.1 <0.1.0 || >=0.1.0-rc.1 <0.2.0-0`。
2. **`tarball:` 的 `latest/download/` 陷阱**（我們不需要，已發 npm）：檔名帶版本號的話，
   提交當天有效、下次發版就 404。

**2026-09-19 15:41（香港時間）現況覆核**：
目錄的 `plugins.json`（3,644,042 字元、3,727+ 筆）**沒有** `chinese-script-policy`；
`data/plugins/KSF1216__chinese-script-policy.yml` 與 `.yaml` 兩條路徑都回 **404**
→ 確實還沒被收錄（目錄不會自動抓，只有 PR 這條路）。
目錄 repo 現況：**16,228 stars**、142 個 open PR、最後 push 09-19 04:12Z（活躍）。
`contributing.md`（22,146 字元）覆核後**與 09-18 量測一致**：一檔一外掛、`skill` 類別仍在、
「repo 至少 1 天」是 CI 自動檢查，格式仍是 `url`／`name`／`category`／（選用 `tarball`）／`description.{en,zh}`。

### 送 PR

腳本：`~/.dsh/dsh-market-submit.ps1`（`-DryRun` 只印不動作）。它會檢查 repo 年齡 → fork →
開 `add/chinese-script-policy` 分支 → 用 Contents API 寫入 yml → 開 PR。
**2026-09-20 13:47（香港時間）之後**才能送；更早送的話，CI 的 repo-age 檢查會直接擋下來
（腳本自己也會先擋：`-DryRun` 實測在 repo 只有 1.9 小時大時就回
`BLOCKED … Retry after 2026-09-20 13:47`，所以提前跑是 no-op，不會送出被退的 PR）。

