# 第三方元件與授權

這個 skill 的**程式碼**是 MIT（見 `LICENSE`）。但 `scripts/` 底下有幾份**資料表是
OpenCC 的衍生資料**，那部分不是 MIT，必須照 OpenCC 的授權處理。

## OpenCC

| 項目 | 內容 |
|---|---|
| 專案 | Open Chinese Convert (OpenCC) |
| 網址 | https://github.com/BYVoid/OpenCC |
| 授權 | Apache License 2.0 |
| 授權全文 | [`third_party/OpenCC-LICENSE.txt`](third_party/OpenCC-LICENSE.txt) |
| 版權 | Copyright (c) 2010-2024 Carbo Kuo and contributors |

### 用到的來源檔

| OpenCC 檔案 | 用途 |
|---|---|
| `data/dictionary/STCharacters.txt` | 簡→繁單字對照（4,012 字） |
| `data/dictionary/STPhrases.txt` | 簡→繁詞組對照（49,257 筆，其中 21 筆是本專案自己補的，見下） |
| `data/dictionary/TSCharacters.txt` | 繁→簡單字對照（4,148 字） |
| `data/dictionary/TSPhrases.txt` | 繁→簡詞組對照（480 筆） |
| `data/dictionary/TWVariants.txt` | 字形校正（41 筆，**釘在** `scripts/glyph-preferences.json`，不隨上游變動） |
| `data/dictionary/TWPhrases.txt` | 繁體偏好（818 筆）：`軟件`→`軟體`、`硬盤`→`硬碟`… |
| `data/dictionary/TWPhrasesRev.txt` | 反向用語偏好（810 筆）：`軟體`→`軟件`…（繁→簡的 `--wording`） |
| `data/dictionary/CJK_Compatibility_Ideographs.txt` | 相容表意文字 → 標準字（1,002 筆），正規化用 |
| `data/dictionary/TWVariantsPhrases.txt` | 詞組級字形校正（12 筆） |
| `data/dictionary/JPShinjitaiCharacters.txt` | 日本新字體→舊字體對照（403 筆，用於日文副軸） |

### 衍生檔案（本專案對來源做了修改，依 Apache-2.0 第 4 條標示）

| 本專案檔案 | 從哪些來源檔衍生 | 做了什麼 |
|---|---|---|
| `scripts/simplified-to-traditional.json` | STCharacters + STPhrases + TWVariants | 轉成 JSON（含 `$format` 標頭與 `$localEdits` 修正清單）；詞組表保留全部（含 identity 條目，它們是必要的阻擋項）；TWVariants 另外存成獨立校正表 |
| `scripts/traditional-to-simplified.json` | TSCharacters + TSPhrases | 轉成 JSON；只留第一個候選字 |
| `scripts/tc-vocabulary.json` | TWPhrases + TWVariantsPhrases | 轉成 JSON；檔名與格式都是本專案的（OpenCC 的名字 `TWPhrases.txt` 只出現在建置腳本裡） |
| `scripts/sc-vocabulary.json` | **TWPhrasesRev** | 轉成 JSON。反向用語偏好層（繁體偏好用語 → 簡體偏好用語），繁→簡時用，`--wording` 開啟 |
| `scripts/cjk-compatibility.json` | **CJK_Compatibility_Ideographs** | 轉成 JSON（1,002 筆）。相容表意文字 → 標準字，兩個轉換方向都會套用（正規化，不是轉換步驟） |
| `scripts/simplified-only.json` | STCharacters 的鍵 | **大幅修改**：只留「簡體有、繁體沒有」的字；排除 203 個對應到自己的字、8 個本身是繁體的字、2 個異體字偏好（如 `群→羣`），並在 Big5 稽核後**人工剔除 21 個標準繁體字**（峰 床 痴 秘 灶 粽 肴 虱 霉 等）。**這份清單已經不是 OpenCC 的資料，是經過審核的衍生成果。** |
| `scripts/traditional-only.json` | TSCharacters 的鍵 | 轉成 JSON |
| `scripts/japanese-only.json` | JPShinjitaiCharacters | **大幅修改**：403 筆只留 346 筆。**用 cp950 稽核後剔除 57 個字**（万 与 並 予 伝 体 余 併 偽 党 凜 即 台 唇 岳 峰 庄 床 弁 御 恒 慎 才 晃 概 槙 欠 為 煙 瓶 痴 痺 真 研 秘 稜 粧 粽 糸 緒 缶 群 翻 舖 芸 萌 虫 蚕 衛 褒 触 証 豊 連 郎 鎮 餅），因為 Big5 收得下就代表繁體中文真的會用到、標出來會是假警報。另外把每個字的**第一個非自身候選**存成 `map`，供 `--to-traditional` 使用。**這份清單已經不是 OpenCC 的資料，是經過審核的衍生成果。** | <!-- check-ok -->
| `scripts/japanese-only.json` 的 `phrases`（日文詞） | JPShinjitaiPhrases | **大幅修改**：235 筆只留 **123 筆**。剔除兩類：① 71 筆的字元層早就抓到（key 含 `発`、`弁`、`触` 這種字）② 41 筆**中文也在用**，逐筆查教育部辭書後排除（`交差`、`連合`、`暴露`、`放棄`、`連結`、`意向`…；理由逐條寫在 `build-jp.js` 的 `PHRASE_EXCLUDE`）。**只做偵測，不參與任何轉換**（OpenCC 原本是給 `jp2t`「日文→繁體」用的，方向不同）。**這份清單已經不是 OpenCC 的資料，是經過審核的衍生成果。** |
| `scripts/japanese-only.json` 的和製漢字部分 | 日文維基 `和製漢字`（見下） | 表格的**第一欄**共 28 個候選，用 cp950 ＋ GB2312 稽核後留 **21 個**（剔除 腺 俣 搾 鱈 萩 粁 瓩）。只放進 `chars`（偵測），不放進 `map`（沒有繁體可轉） | <!-- check-ok -->
| `scripts/glyph-audit-baseline.json` | 上述字表 | 只存 code point，記錄已審核保留的 35 個 Big5 收錄字 |

### 本專案自己補的 21 筆修正（MIT，**不是** OpenCC 的資料）

`simplified-to-traditional.json` 的詞組表裡有 **21 筆是本專案自己寫的**，與 OpenCC 資料的界線
寫在**檔案自己的 `$localEdits` 標頭**裡（重建時由 `build-s2t.js` 自動列出）：

| 修正（4 筆） | OpenCC 原本 | 依據 |
|---|---|---|
| `方便面` → `方便麵` | 無條目 | `泡面`／`速食面` 都有條目，就這個沒有 |
| `几率` → `機率` | `幾率` | 教育部辭典作「機率」 |
| `红曲` → `紅麴` | `紅曲` | `麴` 才是發酵字（同一張表的 `酒曲`→`酒麴` 就是對的） | <!-- simplified-example -->
| `罗嗦` → `囉嗦` | `羅嗦` | `羅嗦` 是錯字形 | <!-- simplified-example -->

另外 **17 筆是阻擋項**（值就等於「原本管線會產出的字」），功能是避免短詞在長詞裡誤觸——
加了 `方便面`→`方便麵` 之後，需要 `方便面试`→`方便面試`、`方便面交`→`方便面交` 這類條目， <!-- simplified-example -->
否則「不**方便面**試」會被吃成「不方便**麵**試」。**這 21 筆以 MIT 授權**（同本專案程式碼），
可以單獨抽出使用。

### 人工審核的兩份字集（`audit-glyph-list.ps1` 的產物）

這份清單原本寫在 `audit-glyph-list.ps1` 的註解裡，但**那支腳本必須是純 ASCII**
（PowerShell 5.1 會用 ANSI 讀 `.ps1`，中文會變成語法錯誤——這是實測踩過的坑），
所以字例搬到這裡：

**剔除的 21 個標準繁體字**（Big5 收錄、且繁體真的在用，不該被當成簡體）：

> 凄 岭 峰 并 庄 床 恒 昵 栖 沄 灶 瓮 痴 秘 粽 羡 肴 蒏 蔂 虱 霉

**保留的 35 個 Big5 收錄字**（cp950 只是把它們當罕見異體字，實際上它們是簡體標準字）：<!-- simplified-example -->

> 与 优 体 儿 吨 听 圣 复 宁 异 忏 怀 怜 惊 扑 扰 晒 机 构 气 泞 洁 洒 洼 炖 痒 离 篱 网 肮 茧 虮 蚕 触 赶 <!-- simplified-example -->

兩份的完整 code point 清單在 `scripts/glyph-audit-baseline.json` 與 `scripts/simplified-only.json`。

### `scripts/cantonese-only.json` **不是** OpenCC 的資料

粵語語體標記表是**本專案自行整理的原創資料**（MIT，同本專案程式碼），不是 OpenCC 的衍生作品，
因為 OpenCC 完全不做粵語口語（它的 `s2hk`／`t2hk` 只處理香港**用字變體**，不會把「嘅」變成「的」）。

這份檔案現在有兩份清單，都是本專案原創：`chars`＋`phrases`（偵測，寧可多抓）與
`convertChars`＋`convertPhrases`（轉換，12 字＋17 詞，只收「在書面中文裡不可能出現」的字串）。
挑選原則寫在檔案本身（`convert_rule` 與 `triage` 欄位）：共用的字（係、唔、睇、幾、邊、傾…）**只能進詞組表**，
純由標準字組成的詞（`屋企`、`點解`、`得閒`）**只偵測、不轉換**，因為它們會跨詞出現在正常中文
（房**屋企**業、早點**解**決）。改動這份表之後要跑 `node scripts/selftest.js`——裡面
**10 個語體偵測案例 ＋ 54 個轉換檢查**，「乾淨／不該動」的那些就是防過度偵測與防誤改的護欄。

### 重新產生資料表

`scripts/build-s2t.js` 會重新下載（或讀取本機快取的）OpenCC 字典並重建**五個**檔案：
`simplified-to-traditional.json`、`traditional-to-simplified.json`、`tc-vocabulary.json`、
`sc-vocabulary.json`、`cjk-compatibility.json`。
**重建不會蓋掉本專案自己補的條目**（專案檔案優先，且會列進 `$localEdits` 標頭，輸出也會印出來）。
`scripts/build-jp.js` 用同一份快取重建 `japanese-only.json`
（來源檔 `JPShinjitaiCharacters.txt`，預設讀 `%TEMP%\opencc-check`）。重新產生之後建議跑：

```powershell
node scripts\selftest.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\audit-glyph-list.ps1
node scripts\tradzh.js --japanese --dir .
```

第二個指令會檢查「新的字表是否又把標準繁體字當成簡體字」；
第三個檢查這份 repo 自己有沒有混到日文專有字（文件引用字例時用 `check-ok` 標記放行）。

## 日文維基百科（和製漢字清單）  <!-- check-ok -->

| 項目 | 內容 |
|---|---|
| 條目 | `和製漢字`（日文維基百科） |
| 網址 | https://ja.wikipedia.org/wiki/和製漢字 |
| 取用版本 | **revid 109822326**（2026-06-06） |
| 授權 | CC BY-SA 4.0（維基百科的內容授權） |
| 用到的部分 | 只有「和製漢字の例」表格**每一列的第一欄**（28 個候選字） |

**怎麼處理授權**：清單裡的東西是**個別漢字字元本身**，屬於事實性資料（單一文字不是著作）；
本專案沒有複製任何句子、說明或編輯體例，挑選與收錄的結果（21 字）也由**本專案自己的
cp950／GB2312 稽核**決定，不是照抄維基的取捨。為求透明，來源與版本仍然完整標示在這裡。
`build-jp.js` 裡的 `KOKUJI` 常數就是這份清單，並附上同樣的來源資訊。

## 其他

- `scripts/lib.js` 的編碼偵測使用 Node.js 內建的 `TextDecoder`（`big5`、`gb18030`）。
- `scripts/audit-glyph-list.ps1` 使用 Windows 內建的 cp950／cp936 編碼器，沒有外部依賴。
- 除此之外**沒有任何第三方執行期依賴**：不需要安裝 OpenCC，`package.json` 的 `dependencies` 是空的
  ——不必為了執行而下載任何第三方套件。（要把它當 npm 套件安裝當然可以，
  例如 `npm i -g chinese-script-policy` 或 DSH 的 `dsh plugin add`；那件事跟依賴無關。）
