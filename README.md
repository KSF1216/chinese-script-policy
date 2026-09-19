# chinese-script-policy

**不綁定 harness 的中文用字規範**：確保產出與寫入的中文用字符合**你指定的規範**（預設要求繁體），
並提供**完全離線**的轉換。
同一份可以當 **DSH 技能**、**Agent Skill**（Claude Code 等）、**npm 套件**、**命令列工具**或
**網頁應用裡的函式庫**——沒有「DSH 版」與「通用版」兩份，所以不會有版本漂移。

**檢查是「兩條主軸二選一 ＋ 兩條副軸過濾」**：

- **主軸（二選一，一次只用一邊）**：**要求繁體**就抓**簡體專有字（2,637 字）**；
  **要求簡體**就抓**繁體專有字（3,083 字）**。指定目標，工具就抓「不屬於該目標」的字。
- **副軸（各自獨立開關，負責過濾）**：**粵語口語**（語體）與**日文專有字詞**
  （367 個新字體與和製漢字 ＋ 123 個日文詞）。日文那條抓的是「**看起來像中文、其實是日文**」的字
  ——它既不是繁體也不是簡體，所以簡體字表看不到它；兩條副軸都跟主軸選哪一邊無關。  <!-- check-ok -->

**轉換有三個可以獨立執行的步驟**：繁↔簡、粵語口語 → 書面語（只轉一定不是書面語的）、
日文新字體 → 中文。三步都只在你指定時才跑。

**還有一層選用的「用語偏好」**（`--wording`／網頁一個勾選框，**預設關**）：轉換時要不要
**跟著目標字體的當地用語**——簡→繁用**繁體偏好**（`軟件` → `軟體`、`硬盤` → `硬碟`）；
繁→簡用**簡體偏好**（`軟體` → `软件`、`網路` → `网络`）。  <!-- simplified-example -->
**用哪一張表由方向決定**，所以不會配錯；不開就是純字形轉換（`軟件` 本身也是正確的繁體）。

**執行期零依賴**：字表已編譯成內建 JSON 並進版控，所以不需要 OpenCC，也拉不到任何 `dependencies`。
但「零依賴」不等於「只能裸用」——**差別只在「什麼時候用」與「要不要先安裝」**：

| 什麼時候用 | 怎麼用 | 要先安裝嗎 |
|---|---|---|
| 只想轉一份文件，或那台機器沒有 Node／不想開終端機 | 下載 [`dist/tradzh.html`](dist/tradzh.html) **雙擊**（單檔、離線） | **不用** |
| 已經有這個目錄（clone 下來，或已裝成技能） | 直接 `node scripts/tradzh.js …` | **不用** |
| 要當常駐 CLI，或寫進腳本／CI | `npx chinese-script-policy …`，或 `npm i -g chinese-script-policy`（bin：`tradzh`、`chinese-script`） | 選用 |
| **DSH：要寫入把關 ＋ GUI 開關 ＋ 技能註冊** | `dsh plugin --profile web add chinese-script-policy` | **要** |
| Claude Code／其他 harness 要技能或 hook | clone 進該 harness 的技能目錄，或取用 `hooks.json` | clone 即可 |
| **網頁應用系統**（後端檢查／轉換，或前端即時檢查） | 後端 `chinese-script-policy/lib`；前端 `dist/tradzh.html` 或打包 `core` | 後端要，前端不用 |

也就是說：**只有「要常駐整合」的兩條路得先安裝**（DSH 外掛、網頁後端匯入函式庫）；
單檔網頁、直接跑 repo 裡的檔案都不必安裝，`npx` 那條會自己抓下來。

> 這是給需要準確分辨繁中、簡中、廣東話口語及日文漢字的專案用的工具，不是主張哪種字體才正確。

## 預設值一覽

**檢查**——「腳本軸」是**一條軸、兩個方向**（指定目標，工具就抓不屬於該目標的字），
**一次只用一邊**；再加上粵語與日文兩條各自獨立的軸：

| 前端 | 腳本軸（二選一） | 粵語／書面語軸 | 日文軸 |
|---|---|---|---|
| **離線網頁** | 兩個勾選框：**繁體（抓簡體字）✅ 預設開** ／ **簡體（抓繁體字）⬜ 預設關** | ✅ 預設開 | ✅ 預設開 |
| **CLI** | `--variant traditional`（預設，抓簡體字）／ `--variant simplified`（抓繁體字） | 要 `--written` | 要 `--japanese` |
| **寫入 hook**（Claude Code 格式） | **固定「要求繁體」**（擋簡體字）——它沒有簡體那一側 | ✅ | ✅ |
| **DSH 外掛**（GUI 設定卡） | **三選一**：要求繁體（預設）／要求簡體／不檢查 | 可個別關 | 可個別關 |

**⚠️ 兩個方向不可以同時開**：實測把**繁體**文字（`後面的軟件很乾淨`）餵給「要求簡體」那一側，
會中 3 個字（U+5F8C U+8EDF U+6DE8）——兩邊都開等於**每一份中文文件都會被擋**。

也就是說：**CLI 預設只檢查腳本軸的「要求繁體」那一側**，粵語與日文都要自己指定；
**網頁預設開的是「腳本軸的繁體側 ＋ 粵語 ＋ 日文」**（簡體側預設關）；
**hook 把主軸固定在「要求繁體」，並連同兩條副軸一起把關**；**DSH 外掛可以在設定卡上把腳本軸三選一**。

**轉換**——方向與語意變更都要你自己指定；**只有「文字沒變、只是換碼位或字形」的兩件事是自動的**：

| 步驟 | 旗標（CLI） | 其他前端也有嗎 | 預設 | 為什麼 |
|---|---|---|---|---|
| 腳本 繁↔簡 | `--to-traditional` / `--to-simplified` | 網頁：兩顆按鈕；函式庫：`toTraditional`／`toSimplified` | **要選方向** | 兩個方向結果完全不同，沒有合理的預設 |
| 語體 粵語→書面語 | `--to-written` | 網頁：一顆按鈕；函式庫：`toWritten` | **關** | 語體是風格；只有「不可能出現在書面中文」的部分才自動轉，其餘留給模型 |
| 日文 新字體→中文 | `--convert-japanese` | 網頁：勾選框「清日文」；函式庫：`stripJapanese` | **關** | 文件可能故意引用日文，引文不該被悄悄改掉 |
| **用語偏好**（當地用語） | `--wording` | 網頁：勾選框「用語偏好」；函式庫：`toTraditional`／`toSimplified` 的第 4 參數 | **關** | `軟件`／`軟體` 都是正確的中文，換詞是偏好不是修正。**用哪一張表由方向決定**（簡→繁用繁體偏好表、繁→簡用簡體偏好表），所以不會配錯 |
| 字形偏好（`裏面`→`裡面`） | （CLI 沒有旗標） | 三邊都自動（`toTraditional` 的 `useTc` 預設開） | **一律自動** | 同一個字的兩種常見寫法，收斂到常見的那個，沒有語意變更。要關得從程式呼叫 `toTraditional(text, true, false)` |
| 相容表意文字正規化 | （沒有旗標） | 三邊都自動 | **一律自動** | 文字本身沒變、只是換成標準碼位，沒有什麼好問的 |

## 安裝與整合

### 三條最短路徑（先做這個就夠）

```powershell
# 1) 不想裝任何東西：下載 dist/tradzh.html 雙擊。離線、不需要 Node、不需要網路。
# 2) 命令列，用完即丟（npx 會自己抓下來）
npx chinese-script-policy --dir .
npx chinese-script-policy --text "<貼上簡體字串>" --to-traditional
# 3) DSH：一個指令裝好外掛（寫入守衛 ＋ 技能註冊 ＋ GUI 開關）
dsh plugin --profile web add chinese-script-policy
```

### DSH 使用者

**當本機技能（最簡單）**——目錄放到 `$DSH_HOME/skills/` 底下，目錄名必須是 `chinese-script-policy`：

```powershell
git clone https://github.com/KSF1216/chinese-script-policy.git "$env:USERPROFILE\.dsh\skills\chinese-script-policy"
```

新的 session 就會看到它（DSH 即時監看，不用重啟）。

**當 DSH 組合包**——插入一個外掛行，該外掛用 `ctx.skills.register(...)` 把 `SKILL.md`
註冊進技能註冊表（DSH 官方稱 embedded skills），所以**不必把檔案複製到 `~/.dsh/skills`**：

```powershell
dsh plugin --profile web add chinese-script-policy            # 已發布到 npm
dsh plugin --profile web add github:KSF1216/chinese-script-policy
dsh plugin --profile web add ./chinese-script-policy-1.2.0.tgz
```

> 從 GitHub 直接安裝時，pnpm 會要求你在該 profile 的 `pnpm-workspace.yaml` 加 `allowBuilds`
> （等於允許安裝時執行本套件的程式碼）。不想被要求就用 npm 或 tarball 安裝。

> **裝一次只影響一個 profile。** `web`、`headless` 各有自己的 `dsh.profile.bundles`，
> 要在哪個殼把關就在那裡**各跑一次**（把 `--profile` 換掉即可）。
> **`headless` 沒有 GUI**，設定卡在那裡沒有意義——開關改用 `cordis.patch.yml` 的 row
> `config` 或 `settings.yaml`，守衛本身照常運作（同一條 `tools/pre-execute`）。
> ⚠️ 設定卡寫的是**全域** user layer（`$DSH_HOME/settings.yaml` 的
> `chinese-script-policy:` 區塊，**不分 profile**），在 GUI 改開關會**同時改變所有 profile**。

### 其他 harness 與命令列

`SKILL.md` 是通用的 Agent Skills 格式（YAML frontmatter ＋ Markdown），所以任何 harness 都能直接吃：

```powershell
git clone https://github.com/KSF1216/chinese-script-policy.git "$env:USERPROFILE\.claude\skills\chinese-script-policy"
git clone https://github.com/KSF1216/chinese-script-policy.git ./skills/chinese-script-policy
```

只當命令列工具也可以（bin：`tradzh`、`chinese-script`）：

```powershell
node scripts\tradzh.js --dir .                                  # 檢查整棵目錄樹
node scripts\tradzh.js --fix --to-traditional --write out.txt < in.txt
node scripts\tradzh.js --text "后面的软件很干净" --to-traditional  # 直接轉字串 # simplified-example
node scripts\tradzh.js --japanese --dir .                       # 檢查有沒有混到日文專有字
node scripts\tradzh.js --encoding FILE.md                       # 看編碼
```

完整的功能 × 指令 × 說明表（含 `--wording`、`--to-written`、`--convert-japanese`
與各自的預設值）在 [`references/cli.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cli.md)。

### 網頁應用系統

**任何線上系統都能用，因為你只要有一個地方能跑 JS**：瀏覽器本身，或一個 Node 程序。

| 你的系統 | 用哪些檔案 | 怎麼進去 |
|---|---|---|
| 前端要**下載即用**、不想建置 | `dist/tradzh.html`（引擎與九份字表全內嵌） | 雙擊，或 `<iframe src="tradzh.html">`。**不需要 Node** |
| 前端要**併進自家 app**（打字即時檢查） | `scripts/core.js` ＋ `scripts/*.json` | `import { createCore } from 'chinese-script-policy/core'`，字表自己注入（沒有 fs） |
| 後端是 **Node**（Express／Next／Nuxt／Workers） | `scripts/lib.js`（自帶讀表） | `import { scanText, toTraditional, guardInspect } from 'chinese-script-policy/lib'` |
| 後端**不是 JS**（PHP／Python／Java） | `scripts/tradzh.js` | 呼叫子行程；或把工作丟給瀏覽器那份 HTML |
| **不要用** | `index.mjs`（DSH 外掛）、`lib/client.js`（DSH 設定卡） | 後者匯入時就碰 `window`，在 Node 會 `window is not defined` |

```js
// 後端：檢查與轉換（ESM／CJS 都可以）
import { guardInspect, toTraditional } from 'chinese-script-policy/lib';
const verdict = guardInspect(userText);       // 與 DSH 寫入 hook 完全同一個判斷
if (verdict) return res.status(422).json({ reason: verdict.reason });
const stored = toTraditional(userText);       // 轉換是「另外一步」，不會偷偷改掉內容

// 前端／Edge（沒有 fs）：同一顆引擎，字表自己注入
import { createCore } from 'chinese-script-policy/core';
import simplifiedOnly from 'chinese-script-policy/tables/simplified-only' with { type: 'json' };
const core = createCore({ simplifiedOnly /* …其餘八份 */ });
```

> ⚠️ ESM 匯入 JSON **一定要寫 `with { type: 'json' }`**，否則 Node 丟 `ERR_IMPORT_ATTRIBUTE_MISSING`
> （CJS 的 `require()` 不用）。⚠️ `core` 的具名匯出是靠 `scripts/core.mjs` 墊片提供的
> （UMD 包裝讓 Node 靜態分析不到），`test:api` 會斷言墊片**剛好**匯出 `core.js` 的每個鍵。

**現成的示範可以直接跑**：`examples/web-app/` 是一個零依賴的 Node HTTP 服務 ＋ 一頁前端，
把 `guardInspect` 接在 API 邊界。實測（從 npm 裝下來的套件）：

| 請求 | 回應 |
|---|---|
| `GET /` | `200` |
| `POST /api/check` 送簡體 | **`422`** ＋ `reason` 原文（`BLOCKED … U+8F6F U+51C0`） |
| `POST /api/check` 送繁體 | `200` `{"clean":true}` |
| `POST /api/convert` `to=traditional` | `200` `{"text":"後面的軟件很乾淨"}` |

### 寫入把關（三種裝法）

寫入前的檢查是**同一個決策**（`scripts/lib.js` 的 `guardInspect`／`guardMessage`），
差別只在「怎麼接上 harness」：

| 裝法 | 適合誰 | 開關與設定 |
|---|---|---|
| **DSH 外掛**（建議） | DSH | GUI 的設定卡：啟用、腳本三選一、語體與日文開關、擋下／只警告，**存檔立刻生效**。設定卡是**全域**的（改一次所有 profile 一起變）；**每個 profile 要各裝一次**，`headless` 沒有 GUI → 開關走 YAML |
| **Claude Code／其他 harness** | 支援同一 hook 協定的 harness | 用本套件的 `hooks.json`（`PreToolUse` ＋ matcher `write\|edit`） |
| **不支援 hook 的環境** | 其他任何環境 | 寫完自己跑 `node scripts\tradzh.js <檔案>` 複查，並把規範寫進系統提示 |

細節（hooks.json 全文、`pluginRoot` 為什麼一定要給、不改表也能達成的四件事）
見 [`references/integration.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/integration.md)。

### 輸出把關：本機 LLM 的答案（代理）

寫入把關管的是**檔案**；但如果壞字是**模型自己寫出來的**（本機模型最常見），要擋在另一個地方。
llama-server **沒有外掛機制**（實測 build 10964：`--help` 裡沒有 plugin／hook／middleware），
它只有兩個取樣層旋鈕，都不足以取代規則：`--logit-bias` 只是**降低**特定 token 的機率
（要 2,637 個字的 token id、BPE 會把字併進多字 token、而且表達不了詞組），
`--grammar`（GBNF）對自由散文不實用。所以機械層要放在伺服器**外面**：

```powershell
npm run llm-guard-proxy                             # 在這個 repo 目錄下的別名
node examples\llm-proxy\llm-guard-proxy.mjs         # 等價；裝成套件的人用這個路徑
```

> 那個 npm script 只是別名，內容就是下面那行；要傳參數得用 `npm run llm-guard-proxy -- --port 8090`
> （`--` 之後才會轉給它）。名字**刻意不叫 `proxy`**：`npm run proxy` 讀起來像在動 npm 自己的
> HTTP proxy 設定，而且這個套件有**兩個**守衛（寫入的、輸出的），`proxy` 沒說是哪一層。

| 前端 | 做什麼 |
|---|---|
| 酒館／任何 OpenAI 相容前端 | API 位址改成 `http://127.0.0.1:8081/v1` |
| llama-server 內建網頁 | 開 `http://127.0.0.1:8081/`（代理**整個 origin**，所以那個 UI 照用） |
| agent harness | ⚠️ **不要指過來**——帶 `tool_calls` 的回應絕不改寫，代理也不該待在工具呼叫的路徑上 |

它**非串流**（請求帶 `stream:true` 會在上游前改寫成 `false`），用的是**同一份** `guardInspect`；
乾淨的回應**逐位元組**通過，只有生成端點的 JSON 會被讀取，轉不動的殘留會寫進 log。
實測（2026-09，本機 27B 模型）：直連得到 `用干净的语言。`，經過代理變成 `用乾淨的語言。`。<!-- simplified-example -->

## 為什麼需要這個

**起因是知識管理。** 同一份中文資料會從不同地方進來：自己打的繁體、複製來的簡體、
模型生成的（有時還混著日文漢字）。它們**看起來一樣，字串卻不一樣**——去重、檢索、
引用於是把它們當成兩筆。三種來源各自造成一種不一致：

- **來源不同 → 字串不同**：`軟體` 與 `软件` 在字串相等性上是兩個東西，去重與引用跟著錯。<!-- simplified-example -->
- **模型會混**：本機模型（Qwen3.8）實測，長文守住了「一律用繁體」的指令，仍漏出 `听`、`灵 长`（2/2 次）。<!-- simplified-example -->
- **還有第三、第四種**：日文新字體（`竜` `発` `図`）與**相容表意文字**——同一個字有兩個碼位，肉眼完全分不出來。<!-- check-ok -->

所以這裡把「用哪一種寫法」變成**可檢查、可轉換、可設定**的一件事，而不是靠人記得：
儲存層用單一寫法（繁體）＋ 正規化；需要 ASCII 鍵的地方用 slug 或 UUID，
**內容仍然存原文**（中文資料英文化會丟掉專有名詞與原文檢索）。

至於為什麼不能只靠 AI 的自己判斷——**AI 的繁簡判斷是模糊印象，不是查表**，所以會犯兩種錯：把繁簡同形字
（您、什麼、可以、我）誤判成簡體；以及簡→繁時選錯候選字（`头发` → `頭发`）。<!-- simplified-example -->

更陰險的是**字表本身的陷阱**，這個專案踩過兩次並修好：

- **異體字偏好**：OpenCC 認為 `群` 的繁體是 `羣`，但《教育部國語辭典》的標準字形是「群」
- **Big5 也收錄的標準繁體字**：`峰 床 痴 秘 灶 粽 肴 虱 霉` 被誤列成簡體字，
  導致「起床」「秘密」「玉山主峰」全部被判成簡體

同一個教訓第三次出現是在**日文軸**：OpenCC 的 403 筆新字體裡有 57 筆（`峰 群 床 才 予 岳 連 衛`…）
其實是合法繁體字，已全部排除——否則「玉山主峰」會被改判成日文。
`selftest.js` 有一個案例直接把那 57 個字串成一行，要求它必須乾淨。

## OpenCC 給了什麼、這個專案自己做了什麼

**先把關係講清楚**，因為那正好決定了這包值得用的理由：

**轉換用的字表幾乎全部來自 [OpenCC](https://github.com/BYVoid/OpenCC)**——實測
**66,884 筆資料裡有 66,769 筆（99.83%）**是 OpenCC 十多年累積的策展成果（Apache-2.0）；
以筆數計，詞組表佔了其中絕大多數。**這個數字是算出來的，不是手寫的**：`npm run stats`
會把每一張表各算幾筆列出來，原創的部分也逐項列出。

**原創的 115 筆**（不是 OpenCC 的資料）分兩塊：**粵語語體軸 94 筆**
（17 字＋30 詞組＋15 弱詞組＋3 語序樣式 ＋ 12 可轉字＋17 可轉詞）與
**和製漢字 21 字**——後者來自日文維基，因為 **OpenCC 完全沒有和製漢字**
（`働` `畑` `辻` `峠` `凪` 這種日本自造字，中文從來沒有過；見 `references/japanese.md`）。  <!-- check-ok -->

**但 OpenCC 是一支轉換器，而這包有五層不是它給的：**

| # | 這一層 | 為什麼 OpenCC 沒有、或不能取代 |
|---|---|---|
| 1 | **偵測（兩主軸＋兩副軸）** | OpenCC 是「輸入 → 輸出」的轉換器，**沒有「這份文件有沒有用錯字」這種模式**。那些掃描、逐行標示、放行標記、統計全部是這裡寫的 |
| 2 | **稽核：讓偵測不會亂報** | 天真做法是「拿 OpenCC 的字表當偵測清單」——那會把 `峰 床 痴 秘 灶 粽 肴 虱 霉` 判成簡體字（「起床」「秘密」「玉山主峰」全部中彈），也會把 `峰 群 床 才` 判成日文。這裡用 **cp950／GB2312 逐字稽核 ＋ 人工審核名單**把假警報壓掉，並用測試釘住 |
| 3 | **粵語語體軸** | OpenCC **完全不做粵語口語**（它的 `s2hk`／`t2hk` 只處理香港的**用字變體**，不會把「嘅」變成「的」）。這 17 字 ＋ 45 詞組是**本專案原創資料** |
| 4 | **編碼層** | Big5 與 GB18030 二選一時，用「解出來的字有多少是本專案字表認得的」來判斷（**正確 100%、錯誤 54%**）；HKSCS 掉成私有使用區會**大聲警告並讓檢查失敗**；日文／韓文檔是**正面辨識**出來並說「不是中文檔」，而不是硬讀成亂碼。OpenCC 不管編碼 |
| 5 | **與 agent 的整合** | 寫入**前**的 PreToolUse 把關（`hooks.json`，Claude Code 格式也能用）、DSH 技能與組合包、**單檔離線 HTML**、一整套測試（含「**hook 壞掉是無聲的**，所以必須有測試」那一套）。OpenCC 沒有這些 |
| 6 | **用語偏好層** | OpenCC 把它放在 `s2twp` 這條**設定**裡（要編譯、要安裝才能用）。這裡把那 830 筆編成內建表，做成一個**選項**（`--wording` ／網頁勾選），所以不裝 OpenCC 也拿得到繁體偏好；而且**不裝也一樣、裝了也一樣**——輸出不隨機器改變（詳見 [`references/conversion.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/conversion.md)） |

**還有一個關鍵差別：執行期零依賴。** `dependencies: {}`——字表已編譯成內建 JSON 並進版控，
所以就算 OpenCC 明天消失、或那台機器沒有網路、沒有 Node（改用離線 HTML），工具照樣運作。
OpenCC 只在**重新產生字表**時需要（而且原始檔 URL 與重建指令都寫在文件裡）。
授權與衍生標示見 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

## 設計原則

- **只有一套實作**：`scripts/lib.js` 是唯一核心，CLI（`tradzh.js`）、hook
  （`pre-write-check.js`，給 Claude Code 等）與 DSH 外掛的守衛（`index.mjs`）
  都呼叫**同一個** `guardInspect`，所以三者不可能給出不同答案
  （連「擋下來要講什麼」都是同一個 `guardMessage`）。
  曾經同時存在 Node 與 PowerShell 兩份實作，結果行為飄移、浪費很多時間。
- **不靠印象、靠字表**：所有判斷都對照經過驗證的字表，不外推。
- **編碼自己決定**：讀檔一律從位元組判斷編碼（UTF-8／BOM／UTF-16／Big5／GB18030），
  寫檔一律 UTF-8 無 BOM，先寫暫存檔再更名。不吃 shell 或編輯器的預設值。
- **猜不到就說猜不到**：認得出是日文（Shift-JIS）、韓文（EUC-KR）或西歐／西里爾單一位元組
  編碼時，工具會直接說「不是中文檔」；完全認不出來的檔案會被**警告並讓檢查失敗**，
  而不是安靜跳過——「沒檢查到」不可以長得像「檢查過了、很乾淨」。

## 授權

- 程式碼：**MIT**，見 [`LICENSE`](LICENSE)。
- `scripts/` 底下的**資料表是 OpenCC 的衍生資料**（Apache-2.0），
  來源、修改內容與重新產生方式見 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。

## 深入文件

README 只留最短路徑；其餘按需閱讀（都是出貨檔案，也在同一個 repo 裡）：

| 想知道什麼 | 去哪裡 |
|---|---|
| 完整功能 × 指令 × 說明、離線網頁版的建置與線上版 | [`references/cli.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cli.md)、[`references/offline-page.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/offline-page.md) |
| 怎麼接進 harness（hook、DSH 外掛、替代做法） | [`references/integration.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/integration.md) |
| 轉換表怎麼來、用語偏好用語、本地修正為什麼不會被重建蓋掉 | [`references/conversion.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/conversion.md) |
| 字表稽核史（為什麼 `峰 床 痴 秘 灶 粽` 不能列進簡體表） | [`references/glyph-table.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/glyph-table.md) |
| 編碼（UTF-8／Big5／HKSCS／PUA）與偵測重寫 | [`references/encoding.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/encoding.md) |
| 粵語語體軸（四層偵測、弱詞組規則） | [`references/cantonese.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cantonese.md) |
| 日文軸（新字體、和製漢字、日文詞） | [`references/japanese.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/japanese.md) |
| 每一份資料檔存什麼 | [`references/data-files.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/data-files.md) |
| 維護者：重建字表、跑測試、發布流程 | [`PUBLISHING.md`](PUBLISHING.md) |
