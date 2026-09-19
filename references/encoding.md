# 編碼：Windows 與 PowerShell 的陷阱

> 這是 `SKILL.md` 的細節補充。日常不需要讀，**遇到亂碼、BOM 或編碼問題**時才看。

## 寫入中文檔案的通則

- **一律 UTF-8 無 BOM**
- 讀取時**明確指定 UTF-8**，不要依賴系統預設

```powershell
# 錯誤：PowerShell 5.1 的 Get-Content 預設是 ANSI，中文會變亂碼
$t = Get-Content $f -Raw

# 正確
$t = Get-Content $f -Raw -Encoding UTF8
# 或
$t = [System.IO.File]::ReadAllText($f, [System.Text.UTF8Encoding]::new($false))
```

```javascript
// Node：明確 UTF-8
const t = fs.readFileSync(f, 'utf8');
fs.writeFileSync(out, t, 'utf8');
```

## PowerShell 的編碼預設可以改，但有陷阱

實測（Windows PowerShell 5.1）：

| 設定 | 效果 |
|---|---|
| 未設定 | `Get-Content` 讀中文**變亂碼** |
| `$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'` | ✅ 修正，**且函式內也繼承** |
| `Set-Content -Encoding UTF8` | ⚠️ **會加 BOM**，讀回反而錯 |

要讓 PowerShell 本體預設正確，把這段放進 `$PROFILE`：

```powershell
$PSDefaultParameterValues['Get-Content:Encoding'] = 'UTF8'
$PSDefaultParameterValues['Set-Content:Encoding'] = 'UTF8'
$PSDefaultParameterValues['Out-File:Encoding']    = 'UTF8'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

**但本 skill 不依賴這個設定**——因為它可能在別的機器、別的 shell、
或 AI 的工具環境裡不存在。**工具自己控制編碼，才是可靠的做法**
（`lib.js` 從位元組判斷編碼，`--write` 先寫暫存檔再更名）。

## `tradzh --encoding` / `--read`

不確定一個檔案是什麼編碼時：

```bash
node scripts/tradzh.js --encoding FILE.md   # 報告編碼（UTF-8 / BOM / UTF-16 / Big5 / GB18030 / 不是中文 / 認不出來）
node scripts/tradzh.js --read FILE.md       # 用偵測到的編碼解出來，輸出正確的內容
```

## 判斷方法：為什麼不是「看像不像中文」（2026-09 重寫）

舊版是「用 fatal 解碼器依序試 utf-8 → big5 → gb18030，第一個不報錯的就採用」。
**GB18030 幾乎任何位元組對都吃得下**，所以答案經常是錯的，而且錯得很有自信。
用真實檔案（各自用對應的 codepage 寫出來）實測：

| 檔案 | 舊版判定 | 舊版讀出來 | 檢查結束碼 |
|---|---|---|---|
| 繁體 UTF-8 | UTF-8 | 正確 | 0 |
| 繁體 Big5 | BIG5 | 正確 | 0 |
| **日文 Shift-JIS** | **GB18030** | 亂碼，但**33 個字全是漢字** | **0（沉默）** |
| **韓文 EUC-KR** | **BIG5** | 亂碼（25 漢字 ＋ 3 個 PUA） | 1（只是剛好被 PUA 警告救到） |
| **德文 cp1252（有重音）** | **BIG5** | 一半漢字一半 PUA | **0（沉默）** |
| 法文 cp1252（有重音） | undecodable | 讀不出來 | **0（沉默跳過）** |
| 俄文 cp1251／koi8-r | undecodable | 讀不出來 | **0（沉默跳過）** |
| **簡體 GB18030** | **BIG5** | 亂碼 | 0 |

兩個關鍵發現，決定了現在的作法：

1. **「像不像中文」沒有用**：日文檔用 GB18030 解出來是 **100% 漢字**，比真中文還「像」。
   可用的訊號是**正面認出鄰居語言**——同樣的位元組用 Shift-JIS 解，**70% 是假名**；
   韓文檔用 EUC-KR 解是 **100% 諺文**。
2. **半形片假名不可以算假名**：任何 Big5 檔用 Shift-JIS 解都會得到 **78% 半形片假名**
   （U+FF61–U+FF9F），但**全形假名是 0%**。所以判準只算全形假名，而且要求**壓倒性多數**
   （諺文 ≥ 80%、假名 ≥ 30% 且假名＋漢字 ≥ 80%）。

> **踩過的坑（同一個 turn 內）**：一開始把門檻設成「20% 就歸類」，結果
> **一份真正的簡體 GB18030 檔被判成韓文**（GBK 的位元組對剛好也是合法的 EUC-KR 序列，
> 解出來是 46% 諺文 ＋ 43% 漢字），工具於是拒絕檢查一份正常的中文檔。
> **假警報比原本的 bug 更糟**，所以門檻改成「壓倒性多數」，而且有測試釘住。

### Big5 與 GB18030 怎麼分：用專案自己的字表當「常用字」清單

兩者可以解開同一段位元組，字數比例分不出來（同一份 GB 檔：當 Big5 是 86%、當 GB18030 是 89%，
根本是丟硬幣）。**改用「解出來的字有多少是本專案字表認得的」**就分得很開：

| 檔案 | 當 Big5 解 | 當 GB18030 解 | 判定 |
|---|---|---|---|
| 繁體 Big5 | **25/25 認得，0 PUA** | 8 認得，9 PUA | Big5 |
| 簡體 GB18030 | 13 認得，1 PUA | **25/25 認得** | GB18030 |
| 粵語 cp950 | **4 認得** | 1 認得，6 PUA | Big5 |
| 日文 Shift-JIS | 解不開 | 33 個字只有 **5 個認得（15%）** | 不是中文 |

字表就是 4,012 ＋ 4,148 ＋ 49,257 詞組 ＋ 粵語表聯集出來的 **11,129 個常用字**
（`core.js` 的 `knownHanzi()`）。分數 = 認得的字 − PUA 字數；兩個候選分數太接近時
**回報「ambiguous」而不是丟硬幣**。

### 認不出來就不猜

- **西歐／西里爾單一位元組**：辨識條件是「ASCII 佔比 ≥ 70% 且非 ASCII 幾乎都是有重音字母」。
  **只說「不是中文」與「單一位元組西歐／西里爾」，不指名語言**——真要分辨 cp1251 與 koi8-r
  （或 cp1252 與 latin-1）需要詞頻資料。
- **俄文偵測刻意不做**：實測 **windows-1251 對一份真正的 GB18030 中文檔給出 87.5% 西里爾**，
  對真 Big5 給 64%。用單一位元組編碼的字母比例去認語言，會把所有中文檔都認成俄文。
  所以俄文檔的結果就是「認不出來」→ **警告、exit 1**，這比給錯答案好。

## `.ps1` 一律純 ASCII

**PowerShell 5.1 用 ANSI 讀 `.ps1`**，所以腳本裡直接寫中文會變成語法錯誤
（實際踩過：檔名 `-Dir` 被誤認、中文註解讓整個腳本無法解析）。
需要中文時用 base64 承載，或把中文放到 `.md` 裡，腳本只留英文註解。

`scripts/audit-glyph-list.ps1` 就是照這個規則寫的：**0 個非 ASCII 位元組**，
字例全部放在 `THIRD-PARTY-NOTICES.md` 與 `references/glyph-table.md`。

## Big5／HKSCS 與 UTF-8：實測結論

**沒有字「不在 UTF-8 內」**——Big5、香港增補字集（HKSCS）、GB2312、GBK、GB18030 的字
都已經有 Unicode 碼位，所以 UTF-8 一定存得下（含私有使用區與 BMP 外的字）。
會出問題的是下面兩件事，而它們常被誤認成「UTF-8 沒有這個字」：

| 現象 | 實測數據 |
|---|---|
| **HKSCS 被對到 PUA** | cp950 可編碼 19,808 個 BMP 字元，但 HKSCS 那批對到**私有使用區（U+E000–U+F8FF）**。`嘅`(U+5605)、`咗`、`喺`、`嗰`、`哋`、`啲`、`嘢`、`嚟` **在 cp950 全部不可編碼**；Node／ICU 的 `TextDecoder('big5')` 也把 HKSCS 解成 PUA（19,710 個可解字中 6,217 個是 PUA、只有 13,070 個是正常漢字） |
| **BMP 外（Unicode Extension B）** | `𠮶` U+20BB6、`𡃁` U+210C1、`𨋢` U+282E2 這類罕見粵字，UTF-8 要 4 bytes、UTF-16 要代理對；舊字型或舊工具會顯示成 □。**不是 UTF-8 存不下，是接收端不認** |

覆蓋量（BMP 可編碼字元數，實測）：GB2312-80 **7,581** ／ cp950 **19,808** ／
cp936（GBK）**24,038** ／ GB18030 **63,456**（≈全部 BMP）。

> 有趣的是 **GBK 反而收得下粵字**（`嘅`、`咗`、`喺` 在 cp936 都可編碼），Big5 不行——
> 這是因為 HKSCS 選了 PUA 路線。所以同一份粵語文件，存成 GBK 比存成 Big5 更不容易壞。

對這個工具的意思：

- 三份偵測表（簡體專有、繁體專有、粵語）**全在 BMP 內、零 PUA**，所以偵測不會產生私有區字元
- 兩份轉換表含 BMP 外的字（簡→繁 1,506 個、繁→簡 874 個），所以**轉換是 Unicode 完整的**
- **讀檔時 UTF-8 永遠安全**；Big5／HKSCS 舊檔先轉成 UTF-8 再放進來會省事很多。
  （`TextDecoder('big5')` 還原不了粵字——它會給你一堆 U+EExx 的私有區字）
- **工具會自己喊**：`tradzh` 只要解出私有使用區字元就會警告，而且**檢查會因此失敗（exit 1）**。
  這是刻意的——PUA 字元不在任何字表內，所以其他檢查一律「乾淨」，沉默才是危險的結果。
  要放行就標 `check-ok` 或把檔案列進 `.tradzhignore`
- `audit-glyph-list.ps1` 用 cp950 判定「Big5 收不收」，而 cp950 已含 HKSCS 的 PUA 對應，
  所以它說「不在 Big5」的字，是真的連 HKSCS 都沒有

## 相容表意文字（U+F900–FAFF 等）：看不見的重複編碼（2026-09 新增）

跟 PUA 同一類「**看不出來**」的坑，但性質相反：PUA 是**字不見了**，相容表意文字是**同一個字有第二個碼位**。

| | 例 | 後果 |
|---|---|---|
| 正規字 | `豈` U+8C48 | 正常 |
| 相容字 | `豈` U+F900 | 長得一模一樣，碼位不同 |

來源是 Big5／JIS／KS X 1001 年代的往返轉換。**搜尋、去重、比對都會無聲失敗**——
兩份文件看起來一樣，程式說不一樣。

處理方式：

* **轉換時正規化**：`--to-traditional` 與 `--to-simplified` **都會**先套這一層
  （1,002 筆，`scripts/cjk-compatibility.json`）。這是**正規化**不是轉換步驟——
  文字本身沒變，只是換成標準碼位，所以沒有開關。
* **檢查時警告並計入**：跟 PUA 一樣印 `WARN`，而且**計入 exit code**
  （「沒檢查到不可以長得像檢查過了」）。寫入時只警告、不拒絕。
* 資料表在 `.tradzhignore` 裡（表的**鍵**就是那些相容字，不然每次檢查都會報 1,002 筆）。

## 測試資料怎麼來的（可重現）

`selftest-cases.json` 的 `encoding` 段放的是**十六進位位元組**，不是文字——Node 沒有
Big5／GB18030／Shift-JIS 的**編碼器**，沒辦法在測試裡即時做出那些位元組。產生方式：

```powershell
$enc = [System.Text.Encoding]::GetEncoding(950)   # 932=Shift-JIS 949=EUC-KR 54936=GB18030 1251=cp1251
[System.IO.File]::WriteAllBytes('tc-big5.txt', $enc.GetBytes('後面軟體很乾淨…'))
node -e "console.log(require('fs').readFileSync('tc-big5.txt').toString('hex'))"
```

用 cp950 寫粵語字會**靜默換成 `?`**（實測 `嘅`、`嘢`、`喺`、`嗰` 四個字變成四個問號）——
那是**產生檔案時**就掉的，不是解碼掉的，測試裡有把這件事一起釘住。

## 延伸：另一條軸——執行時編碼風險（已實作：`tradzh --console-hazard`）

上面講的都是**讀寫檔案**。但**檔案內容正確**不代表**執行時安全**：程式把某個
codepage 編不出來的字元印到 stdout，會直接讓那個行程崩潰（`UnicodeEncodeError`），
而且症狀是「看起來還在跑、永遠不完成」。

實測 cp950 編不出來的字有 **15,402 個**，其中 **12,486 個不在本專案的字表裡**
（連 `丨`、`丿` 這種繁體會用到的字都在盲區；`✅` 這種 emoji 也一樣）。

完整分析、三層做法（環境根治／新的掃描軸／pre-flight 守門）、實作重點與設計決定：
**`console-encoding-hazard.md`**。
