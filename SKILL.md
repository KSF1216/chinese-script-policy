---
name: chinese-script-policy
description: "繁體中文的產出與檢查規範，兩條主軸二選一（繁體／簡體）＋兩條副軸過濾（粵語口語語體、日文專有字詞：日本新字體、和製漢字與日文詞）。當需要寫入任何中文檔案、產出中文回覆、或檢查檔案是否混入簡體字、粵語口語、日文字時使用。轉換分成三個可獨立執行的步驟（繁／簡、粵語口語轉書面語、日文新字體轉中文），完全離線，並附方向與順序陷阱。"
whenToUse: "寫入含有中文的檔案、產生中文內容、審查既有中文檔案的繁簡一致性、把簡體轉成繁體、把粵語口語轉成書面語、把日文新字體清掉、確認儲存的資料是標準書面語，或懷疑檔案混到日文漢字（日本新字體、和製漢字）時。"
---

# 繁體中文規範

## 核心政策（最重要）

**預設一律繁體中文。** 不主動轉換、不混用。

- 寫入檔案 → 繁體，**而且用標準書面語**（不要粵語口語：儲存的資料要讓所有中文讀者看得懂）
- 回覆內容 → 繁體
- 只有在使用者**明確要求簡體**時才產出簡體

## 寫入動作：這份規範最關鍵的部分

**壞字是在「寫入那一刻」進去的，所以檢查放在寫入之前。**

### 順序

1. **寫之前**：內容直接產出繁體。不要先寫簡體再想辦法轉。
2. **寫入前的最後確認**：`write` / `edit` 的內容在送出前，先掃過一次。
3. **寫入後複查**：跑 `tradzh` 確認落地內容乾淨。

### 檔案類型陷阱（Windows）

**同一個寫入動作，有些檔案類型連「非 ASCII」都不能帶。**

| 檔案類型 | 規則 | 為什麼 |
|---|---|---|
| `.ps1` | **純 ASCII**（或 UTF-8 加 BOM） | Windows PowerShell 5.1 用 ANSI（cp950）讀 `.ps1`；無 BOM 的 UTF-8 中文會變成語法錯誤，整支腳本無法解析。要中文就把文字放進 `.md`／`.json` 讓腳本讀，或用 base64 承載 |
| `.cmd`／`.bat` | **純 ASCII ＋ CRLF** | cmd.exe 同樣用 ANSI 讀；只有 LF 會在 `goto`／`set /p` 上出怪事（標籤跳錯、變數讀成空值） |

驗證（`.ps1` 回報 0 ＝ 通過）：

```powershell
$b = [IO.File]::ReadAllBytes('x.ps1')
($b | Where-Object { $_ -gt 127 }).Count                                # 0 = 純 ASCII
([regex]::Matches([Text.Encoding]::ASCII.GetString($b), "\r\n")).Count  # .cmd 要 > 0
```

**為什麼不是「寫完再轉」**：這是讀取端不懂 UTF-8，不是內容有問題——轉換救不了，只能從寫入端避開。

**為什麼不乾脆用 BOM**：加 BOM 的 `.ps1` 實測可以跑，但本套件的工具鏈一律「UTF-8 無 BOM」（寫檔用 `UTF8Encoding($false)`），BOM 會變成一條例外規則；而 BOM 會被工具無聲加減（同一份檔案有時能跑、有時不能），Node 讀到開頭多一個 `\uFEFF` 還會讓 `JSON.parse` 直接失敗。**純 ASCII 在所有 code page 下解讀都一致**，是唯一不隨機器改變的寫法。成因、實測數據與 `.cmd` 的 CRLF 細節見 `references/encoding.md`。

### 已有機械強制（hook）

`hooks.json` 提供 **PreToolUse** 攔截：內容含簡體專有字就**擋下寫入**，
並把理由回給模型，強制改成繁體後重試。

**為什麼是 PreToolUse 而不是 PostToolUse？**
因為 DSH 的 hook bridge **不會把寫入工具的結果內容放進 PostToolUse 的 payload**，
所以 post-hook **看不到被寫入的內容**，只能在 pre 攔。

| 事件 | 時機 | 能否拿到寫入內容 | 能否阻止 |
|---|---|---|---|
| `PreToolUse` | 工具執行**前** | ✅ 可以（`tool_input`） | ✅ exit 2 擋下 |
| `PostToolUse` | 工具執行**後** | ❌ 拿不到 | 只能事後回報 |

### Hook 行為（已實測）

| 情境 | 行為 |
|---|---|
| 內容是乾淨繁體 | 放行 |
| 內容含簡體專有字 | **擋下（exit 2）**，stderr 成為模型看到的理由 |
| 內容含**粵語口語標記**（嘅、咗、點解、而家…） | **擋下（exit 2）**，要求改寫成書面語 |
| 內容含**日文專有字詞**（竜、発、図、予定…） | **擋下（exit 2）**，stderr 直接給對照（`竜 -> 龍`） |  <!-- check-ok -->
| 目標是非文字檔（`.png`、`.zip`、`.exe`） | 不檢查，放行 |
| 目標列在 `.tradzhignore` | 整個檔案跳過所有檢查 |
| 目標列在 `cantonese-allow.json` | **只跳過語體軸**，繁體／簡體／日文照抓 |
| `edit` 的 `new_string` | 同樣攔截 |
| 行內有 `check-ok` / `simplified-example` 標記 | 跳過 |
| payload 是壞的 JSON | **放行**（自己出錯不可中斷使用者的回合） |

> **hook 是「壞掉就放行」的設計**，所以它故障時完全無聲。`scripts/hook-selftest.mjs`
> （`npm run test:hook`）用真的子行程與真的管線測它，這是唯一會發現它壞掉的東西。
> 手動測時建議走檔案重導向（PowerShell 管線會重新編碼，非 ASCII 會在途中被吃掉）：
> `cmd /c "node scripts\pre-write-check.js < payload.json"`。

**怎麼掛上 hook**（依 harness 不同，`hooks.json` 本身是 Claude Code 的協定格式）：

| Harness | 做法 |
|---|---|
| **DSH** | 裝成外掛：`dsh plugin --profile <名> add <本套件目錄>`（**每個 profile 各裝一次**，裝一次只影響那一個）。守衛、技能註冊與 GUI 開關都在那一列裡——**不需要**再掛 hook 橋接器 |
| **Claude Code 等相容 harness** | `hooks.json` 直接可用（`PreToolUse` ＋ matcher `write\|edit` ＋ exit 2），放到專案的 `.claude/hooks.json` |
| **不支援 hook 的 harness** | 沒有機械強制力 → 改成「寫完自己跑 `node scripts/tradzh.js <檔案>` 複查」，並把本規範寫進該 harness 的系統提示或 `AGENTS.md` |

## 工具：`tradzh`（單一實作，讀／檢查／寫入／轉換）

**只有一套邏輯、一個進入點。** 歷史教訓：曾經同時有 Node 與 PowerShell 兩份實作
（外加 PowerShell 包裝層），結果行為飄移，而且為了讓它們一致，反覆踩到
`-like` 不支援 `**`、`-Dir` 被當成 `-Path` 縮寫、參數轉發失敗等問題。
**包裝層曾被證明「沒有消除任何依賴，只增加 bug」**——它本身還是呼叫 Node。
所以現在只留 Node CLI。

| 檔案 | 角色 |
|---|---|
| `scripts/lib.js` | **核心**：字表、掃描、轉換、忽略規則、編碼偵測、UTF-8 寫入 |
| `scripts/tradzh.js` | **唯一 CLI**（進入點） |
| `scripts/pre-write-check.js` | hook 適配器，**共用同一份 `lib.js`** |
| `scripts/build-s2t.js` | 由 OpenCC 字典重新產生三個轉換表（`simplified-to-traditional.json`、`traditional-to-simplified.json`、`tc-vocabulary.json`）；**重建不會蓋掉本專案自己補的條目** |
| `scripts/build-jp.js` | 由 OpenCC 字典重新產生 `japanese-only.json`（日文副軸） |
| `scripts/selftest.js` | 轉換／語體／編碼／日文的回歸測試（改字表後必跑） |
| `scripts/hook-selftest.mjs` | 用真子行程測寫入 hook（它壞掉是無聲的） |
| `scripts/web-selftest.mjs` | 產生出來的網頁與 CLI 比對，並實際驅動 UI |
| `scripts/audit-glyph-list.ps1` | 用 Big5／GBK 字集稽核字表，抓假警報（守門員，exit 1 = 有新嫌疑字） |

全部共用核心，所以**不可能互相不一致**。

### 用法

```bash
node scripts/tradzh.js <檔案>                       # 檢查檔案（預設繁體）
node scripts/tradzh.js --dir .                      # 遞迴檢查目錄
node scripts/tradzh.js --text "字串"                 # 檢查字串
node scripts/tradzh.js --encoding FILE.md           # 報告檔案編碼
node scripts/tradzh.js --read FILE.md               # 正確解碼後輸出內容
node scripts/tradzh.js --write out.md < in.md       # 檢查後寫入
node scripts/tradzh.js --fix --write out.md < in.md # 轉換後寫入
```

常用旗標：`--quiet`（只看結束碼）、`--force`、`--json`

**讀舊檔要注意**：非 UTF-8 的檔案（Big5／GB18030）**先轉成 UTF-8 再用**。
`tradzh` 會自己說它讀到什麼，而且**說不出來時會讓檢查失敗**：

| 讀到的東西 | 工具的反應 |
|---|---|
| UTF-8／BOM／UTF-16 | 正常讀取 |
| Big5 或 GB18030 | 正常讀取，並用專案自己的字表判斷哪一個才對（同一段位元組兩者都解得開） |
| 日文（Shift-JIS）、韓文（EUC-KR）、西歐／西里爾單一位元組 | `NOTE ... (not Chinese)`，**不當成中文檢查** |
| 解出私有使用區字元（U+E000–U+F8FF） | **警告，而且檢查 exit 1**——那代表 HKSCS 被對到 PUA、那些字其實已經掉了 |
| 完全認不出來 | **警告，而且檢查 exit 1**——「沒檢查到」不可以長得像「檢查過了、很乾淨」 |

私有使用區與無法判定的細節、以及為什麼判斷方法不是「像不像中文」，見 `references/encoding.md`。

### 變體模式（兩條主軸與兩條副軸都支援）

檢查是**對稱的**：指定目標字體，工具就抓「不屬於該字體」的字。

| 旗標 | 目標 | 抓什麼 |
|---|---|---|
| （預設）`--variant traditional` | 繁體 | 簡體專有字（2,637 字） |
| `--variant simplified` / `--simplified` | 簡體 | **繁體專有字（3,083 字）** |
| `--variant written` / `--written` | **標準書面語** | **粵語口語標記**（17 字 ＋ 30 詞組 ＋ 15 個需同行佐證的弱詞組 ＋ 3 條語序樣式）。詞組是必要的：`點解`／`而家` 的單字都是標準字；弱詞組單獨出現不算證據，因為它們會跨詞出現在正常中文（早點**解**決、房**屋企**業） |
| `--variant japanese` / `--japanese` | **純繁體（不含日文形）** | **日文專有字 367 ＋ 日文詞 123**：新字體 `竜`、`発`、`図`、`円`、`駅` ＋ **和製漢字** `働`、`畑`、`辻`、`峠`、`凪` ＋ 日文詞 `予定`、`予約`、`丁寧`、`世論`（詞只偵測、不轉換） |  <!-- check-ok -->

**為什麼需要日文軸**：日本新字體**既不是繁體也不是簡體**，所以簡體字表看不到它
（實測：OpenCC 的 403 筆新字體裡，112 筆原本就會被簡體表抓到、48 筆會被轉換表處理，
**243 筆完全看不到**）。常見來源是貼上的日文、輸入法誤選、或看過日文資料後順手寫出。

**刻意不收的字才是重點**：`峰`、`群`、`床`、`才`、`予`、`岳`、`連`、`衛`… 這 **57 個字**
OpenCC 也列為新字體，但 **Big5（cp950）收得下**，也就是繁體中文可能真的用到 →
**一律排除**。不排除的話「玉山主**峰**」「**群**眾」「起**床**」會被判成日文
（就是修過一次的峰／床／痴假警報）。細節與重建方式見 `references/japanese.md`。

**和製漢字（日本自造字）收了常用的 21 個**：`働`、`畑`、`辻`、`峠`、`凪`、`枠`、`込`、`榊`…  <!-- check-ok -->
來源是日文維基 `和製漢字`（revid 109822326），28 個候選用同一套 cp950／GB2312 稽核後留 21 個
（`腺`、`俣`、`搾`、`鱈`、`萩`、`粁`、`瓩` 剔除——它們 Big5 或 GB2312 收得下）。  <!-- check-ok -->
**和製漢字只偵測、不能轉**：它們沒有中文祖先，所以 `map` 裡沒有它們，`--to-traditional` 修不了，  <!-- check-ok -->
必須由模型改寫整個詞（`畑` → `田地`）。**而且這只是常用子集**，和製漢字總數各方說法 1500〜2600。  <!-- check-ok -->

**這條軸不是「判斷整份文件是不是日文」**：那是編碼層的事（日文檔用 Shift-JIS 解出 70% 假名，
見 `references/encoding.md`）。這條軸問的是「這份中文檔裡有沒有混到日文字」。
**國訓**（`鮎`、`沖` 這種字形是中文、意思只有日文有的字）字表永遠抓不到。  <!-- check-ok -->

**預設值不一樣，別混用**：腳本軸是**一條軸、兩個方向**（指定目標 → 抓「不屬於該目標」的字），
所以「繁體」與「簡體」**永遠只會用其中一邊，不會兩邊都用**。
**CLI 的檢查預設只有「要求繁體」**（`--variant traditional`），要檢查粵語或日文要自己加
`--written`／`--japanese`；**網頁預設開「要求繁體 ＋ 書面語 ＋ 日文」**（「要求簡體」預設關）；
**寫入 hook 把主軸固定在「要求繁體」，並連同兩條副軸一起把關**；**DSH 外掛可在設定卡把腳本軸三選一**
（要求繁體／要求簡體／不檢查）——但設定卡是**全機器一份**（存進 `$DSH_HOME/settings.yaml`，
不分 profile、也不分工作區），不是每個專案一份。
⚠️ **兩個方向同時開沒有意義**：實測把繁體文字餵給「要求簡體」那一側會中 3 個字
（U+5F8C U+8EDF U+6DE8），兩邊都開等於每一份中文文件都會被擋。

**轉換是相反的邏輯：沒有任何一步會自動幫你決定。** 腳本方向要自己選（`--to-traditional`／
`--to-simplified`），語體（`--to-written`）、日文（`--convert-japanese`）、用語偏好
（`--wording`）**都預設關**，各自有理由（見下表）；只有**相容表意文字正規化**
是自動的，因為那只是把重複編碼換成標準碼位，文字本身沒變。  <!-- check-ok -->
沒有 `--to-japanese`（那等於發明日文，工具刻意報錯）。

**語體軸：詞彙可轉，語法不轉。** `--to-written` 只轉「**在書面中文裡不可能出現**」的那些（`嘅`→`的`、`咗`→`了`、`唔該`→`謝謝`）；`屋企`、`點解`、`邊度` 那些**每個字都是標準字**的詞不轉（它們會跨詞出現在正常中文：房**屋企**業、早點**解**決），語序與句式（`你行先 → 你先走`、`畀本書我 → 給我一本書`）更不行。**轉完會列出轉不到的部分，改寫由模型做，工具負責驗收**（細節見 `references/cantonese.md`）。

轉換方向（**兩邊都內建，不需要安裝 OpenCC**）：

| 旗標 | 動作 | 預設 | 資料量 |
|---|---|---|---|
| `--to-simplified` | 繁體 → 簡體 | 要選方向 | 字元表 4,148 ＋ 詞組 480 |
| `--to-written` | 粵語口語 → 書面語，**只轉一定不是書面語的**（`嘅`→`的`、`唔該`→`謝謝`、`冇`→`沒有`） | **關**（語體是風格，其餘留給模型） | 可轉 12 字＋17 詞；**轉不到的會列出** |
| `--convert-japanese` | 日文新字體 → 中文（`竜` → `龍`） | **關**（引用的日文原文不該被改） | 346 筆對照 |  <!-- check-ok -->
| `--to-traditional` | 簡體 → 繁體 | 要選方向 | 字元表 4,012 ＋ **詞組 49,257** ＋ 字形校正 41 |  <!-- check-ok -->
| `--wording`（**一個開關**，搭配 `--to-traditional` 或 `--to-simplified`） | 加上目標字體的當地用語，**用哪一張表由方向決定**：簡→繁用繁體偏好（`軟件` → `軟體`）、繁→簡用簡體偏好（`軟體` → `软件`、`網路` → `网络`） | **關**（兩邊都是正確中文） | 繁體偏好 830 筆／簡體偏好 810 筆（都離線內建） |  <!-- check-ok -->
| （無旗標）相容表意文字 | 重複編碼換成標準碼位 | **自動**（文字沒變） | 1,002 筆 |

`--fix` 只是「要轉換」的旗標，輸出位置一律由 `--write` 指定。

**用語偏好是選項，不是預設**：`軟件` 與 `軟體` **都是正確繁體**（前者港澳在用），所以換詞是**偏好**。
`--wording` 是**一個開關**，兩張表由方向自動挑（830 筆繁體偏好表 ＋ 810 筆簡體偏好表，都離線內建、不需要 OpenCC）：

```bash
node scripts/tradzh.js --wording --text "软件和硬盘" --to-traditional   # → 軟體和硬碟  # simplified-example
node scripts/tradzh.js --wording --text "軟體和硬碟" --to-simplified    # → 软件和硬盘
```

| 情況 | 預設 | 加 `--wording` |
|---|---|---|
| 用語偏好用語 | `软件` → `軟件` | `軟體`（硬碟、滑鼠、記憶體、資訊、螢幕、網路、計程車…） | <!-- simplified-example -->
| 兩種偏好同詞（`地鐵`、`幼兒園`） | 不變 | 不變（本來就一樣） |
| 語意差異（`土豆`＝馬鈴薯） | 不變 | 不變（不是用字問題） |

**工具不會探測你機器上有沒有裝 OpenCC**——以前會（裝了就優先用它的 `s2twp`），導致同一份輸入在
不同機器得到 `軟體`／`軟件` 兩種結果。現在用語偏好層是內建表、由旗標控制，任何機器結果一致。

**寫入時會依目標字體把關**：`--simplified` 模式寫入繁體內容會被拒絕。

```bash
# 繁體輸入 → 轉成簡體後寫入
node scripts/tradzh.js --fix --to-simplified --write out.md < in.md

# 簡體輸入 → 轉成繁體（含字形校正）後寫入
node scripts/tradzh.js --fix --to-traditional --write out.md < in.md

# 只想看轉換結果，不寫檔
node scripts/tradzh.js --to-traditional --text "后面的软件很干净"   # simplified-example

# 檢查一份簡體文件有沒有混到繁體
node scripts/tradzh.js --simplified --dir ./sc-docs
```

**`--write` 的行為**：先檢查，**內容含簡體就拒絕寫入**（exit 1），原檔不受影響。
要強制寫入用 `--force`；要放行特定行用 `check-ok` 標記。

**`--write` 一律輸出 UTF-8 無 BOM**，而且是先寫暫存檔再更名——所以
**寫入編碼永遠由工具決定，不會被 shell 或編輯器的預設值影響**。

> 需要 Node.js（v20 以上）。**刻意不做 PowerShell 包裝層**：
> 那不會消除 Node 依賴，只會多一層會出錯的參數轉譯。

## 本機模型一直寫出簡體？（輸出把關）

提示層治不了這個：實測本機 27B 模型守得住「一律繁體」的指令，長文仍漏 `听`、`灵 长`。<!-- simplified-example -->
llama-server **沒有外掛機制**（`--logit-bias` 只是降低機率、表達不了詞組；`--grammar` 對散文不實用），
所以機械層要放在它**外面**：`examples/llm-proxy/llm-guard-proxy.mjs` 是零依賴代理
（repo 內也寫成 `npm run llm-guard-proxy`），
把前端指過去，回傳前用**同一份** `guardInspect`／`toTraditional` 修正。
它非串流、代理整個 origin（內建網頁照用）、**帶 `tool_calls` 的回應絕不改寫**
（所以不要把它指給 agent harness）；轉不動的殘留會寫進 log，不會假裝乾淨。

## 高風險歧義字（轉換後值得複查）

- **后 / 後**：皇后、皇后區 vs 後面、以後
- **发 / 發 / 髮**：出發、發言 vs 頭髮、理髮 <!-- simplified-example -->
- **干 / 乾 / 幹**：乾淨、乾杯 vs 幹部、干涉
- **只 / 隻**：只有、只是 vs 一隻貓
- **台 / 臺 / 颱**：舞台（`臺`）vs 颱風、台語
- **里 / 裡 / 裏**：裡面、這裡 vs 公里、里程
- **面 / 麵**：面對、方面 vs 麵條、麵包
- **了 / 瞭**：了解、明瞭

## 工作流程

1. 要寫入中文檔案 → **直接寫繁體**
2. 寫完 → 跑 `node scripts/tradzh.js <檔案>` 確認（`--dir .` 可遞迴整包）
3. 需要簡體 → `node scripts/tradzh.js --fix --to-simplified --write out.txt < in.txt`
4. 拿到簡體要轉繁體 → `node scripts/tradzh.js --fix --to-traditional --write out.txt < in.txt`
   （轉完仍要複查上面的高風險歧義字，詞組表不是萬能）
5. 發現檔案已有簡體 → 先問使用者要「轉成繁體」還是「保留原樣」
6. **懷疑混到日文** → `node scripts/tradzh.js --japanese <檔案>`（`--to-traditional` 會順手修掉）
7. 動過字表或轉換表 → 跑 `node scripts/selftest.js`，全綠才算改完
8. **重新產生字表** → 再跑 `scripts/audit-glyph-list.ps1`，exit 1 就把新出現的嫌疑字人工判斷一輪
   （日文表用 `node scripts/build-jp.js` 重建，它的「Big5 收得下就排除」已在腳本裡把關）

## 需要細節時再讀

上面的內容足夠應付日常；下面這些是**背景與維護知識**，有需要再讀，不必預先載入：

| 檔案 | 什麼時候讀 |
|---|---|
| `references/cantonese.md` | 要改粵語字表、要知道轉換到什麼程度、或要放行某些檔案 |
| `references/japanese.md` | 要改日文表、想知道 57 個字為什麼被排除、和製漢字為什麼只收 21 個 |  <!-- check-ok -->
| `references/glyph-table.md` | 要改字表、懷疑假警報，或想知道為什麼某些字不能在清單裡 |
| `references/conversion.md` | 想理解簡→繁為什麼容易錯、實測數據、什麼時候還需要 OpenCC |
| `references/encoding.md` | 在 Windows／PowerShell 讀寫中文檔，遇到亂碼、BOM 或編碼問題；以及〈檔案類型陷阱〉的實測數據與 `.cmd` 的 CRLF 成因 |
| `PUBLISHING.md` | 要發布新版本（維護者用） |
