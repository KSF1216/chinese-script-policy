---
id: next-write-rules
status: done
acceptance: |
  npm test
  npm run audit
  node scripts/tradzh.js SKILL.md references/encoding.md README.md
updated: 2026-09-19
verified_at: 2026-09-20T03:21Z
---

# 下一件事：把「Windows 檔案類型寫入陷阱」搬進 `SKILL.md` 的寫入區

> 交接卡，寫給在 `chinese-script-policy` 工作區開的 session（2026-09-19 建立）。
> 這個 repo 是**已發佈的 npm 套件**，所以改動要跑自己的 `npm test`／`npm run audit`；
> 發佈那一步由使用者自己跑（見文末）。
>
> **姊妹規則**：跨 agent 交接文件的紀律在技能 `handoff-discipline`（`~/.dsh/skills/handoff-discipline`）。
> 姊妹卡：`NEXT-agents-md-pointer.md`（把交接紀律的指標行補進全域記憶）。
>
> **交棒狀態（2026-09-19，由建立這張卡的 session 補記）**：
> ① 這張卡原本**沒有被任何索引檔列到**。索引現在放 `PUBLISHING.md` §5——**不要改放 `README.md`**：那是 npm 的對外門面（在 `package.json` 的 `files` 白名單裡），而卡片不會出貨，列進去等於讓 npm 讀者看到指向未出貨檔案的連結。
> ② **這個 repo 當時沒有接檢查器**（沒有 `tools\docs.mjs`）。直接跑 `docs-check.mjs` 約有 30 個 FAIL，**幾乎全是假陽性**（上游 OpenCC 原始檔名如 `TWPhrases.txt` 是授權標示、必須保留原樣；其餘是跨專案證據）。本卡的驗收指令與檢查器無關，不受影響。
> **2026-09-20 更新（已接線）**：現在有了——`tools\docs.mjs` 已建立，並串進 `npm test` 的 `test:docs`。
> 接線時把先前那批 FAIL 逐條查證過，共 **34 條，全部是假陽性**：在正確設定（`index` 指到 `PUBLISHING.md` ＋ 一份明列的例外名單）下是 **34 → 0**。
> 接線方式、例外名單與「tarball 環境要優雅跳過」的理由**只寫在 `PUBLISHING.md` §5**，這裡不重述。

---

## 一、為什麼要做（背景，含實際踩到的證據）

| 規則 | 現在寫在哪 | 問題 |
|---|---|---|
| `.ps1` 一律純 ASCII | **已經有**：`references/encoding.md` 的 `## .ps1 一律純 ASCII`（成因、實例、以及 `scripts/audit-glyph-list.ps1` 是 0 個非 ASCII 的證據） | 它在**選讀**層：`SKILL.md` 的「需要細節時再讀」把這份文件歸類成「遇到**亂碼、BOM 或編碼問題**時才看」→ **寫新的 `.ps1` 之前不會知道有這條** |
| `.cmd`／`.bat` 純 ASCII ＋ CRLF | **完全沒有**：目前只在各專案自己的 `verify` 裡實作（例：某專案的 `tools\verify.mjs` 會檢查它的 `.cmd` 非 ASCII 數為 0、且是 CRLF） | 同一條規則散在各專案，沒有單一來源 |

**實際踩到**：2026-09-19 在另一個專案用編輯器寫了一支含中文的 `.ps1` 測試腳本 → PowerShell 5.1 用 ANSI 讀 → `Unexpected token`，整支腳本無法解析。當時**不是**去讀 `encoding.md` 的時機（我遇到的是語法錯誤，不是亂碼）。

**所以這是分類問題**：這兩條的性質是**寫入規則**（跟「寫入檔案用繁體」同一類），不是排錯知識。而 `SKILL.md` 有一節叫 `## 寫入動作：這份規範最關鍵的部分`——那才是它的家。

---

## 二、要改什麼（精確）

### 2.1 `SKILL.md`：插入一個新小節

位置：`## 寫入動作：這份規範最關鍵的部分` 底下，`### 順序` 之後、`### 已有機械強制（hook）` 之前。

````markdown
### 檔案類型陷阱（Windows）

**同一個寫入動作，有些檔案類型連「非 ASCII」都不能帶。**

| 檔案類型 | 規則 | 為什麼 |
|---|---|---|
| `.ps1` | **純 ASCII** | Windows PowerShell 5.1 用 ANSI（cp950）讀 `.ps1`；中文會變成語法錯誤（實測：參數名被誤認、中文註解讓整個腳本無法解析）。要中文就用 base64 承載，或把中文放進 `.md`／`.json`，腳本只留英文註解 |
| `.cmd`／`.bat` | **純 ASCII ＋ CRLF** | cmd.exe 同樣用 ANSI 讀；純 LF 會在 `goto`／`set /p` 上出怪事（標籤跳錯、變數讀成空值） |

驗證（回報 0 = 通過）：

```powershell
$b = [IO.File]::ReadAllBytes('x.ps1')
($b | Where-Object { $_ -gt 127 }).Count                                  # 0 = 純 ASCII
([regex]::Matches([Text.Encoding]::ASCII.GetString($b), "\r\n")).Count    # .cmd 要 > 0
```

**為什麼不是「寫完再轉」**：這是**讀取端**不懂 UTF-8，不是內容有問題——轉換救不了，只能從寫入端避開。
````

**規則的精確講法**（實測，2026-09-19）：`.ps1` 要嘛**純 ASCII**，要嘛 **UTF-8 加 BOM**。三份同內容的腳本在 Windows PowerShell 5.1 下的結果：

| 檔案 | 前 6 bytes | 結果 |
|---|---|---|
| UTF-8 **無 BOM** | `23 20 E9 80 99 E6` | ❌ exit 1：`The string is missing the terminator: '.'`（錯誤訊息本身也是亂碼） |
| UTF-8 **＋ BOM** | `EF BB BF 23 20 E9` | ✅ exit 0，中文正常輸出 |
| 純 ASCII | `23 20 41 53 43 49` | ✅ exit 0 |

**既然 BOM 可行，為什麼選 ASCII？** 這正是外部讀者會問的問題，建議在 `SKILL.md` 用一兩句回答：

1. 本套件的工具鏈一律「UTF-8 **無 BOM**」（`references/encoding.md`；寫檔用 `UTF8Encoding($false)`）→ `.ps1` 要 BOM 就是一條**例外規則**，而例外規則會忘。
2. BOM 會被工具**無聲加／去**（`Set-Content -Encoding UTF8` 會加；某些編輯器或複製路徑會去）→ 同一份檔案「有時能跑、有時不能跑」。
3. BOM 會**傳染給其他消費者**：Node 讀進來開頭多一個 `\uFEFF`，`JSON.parse` 直接失敗（本套件自己的 `references/encoding.md` 就記過這個）。
4. PowerShell 5.1 與 7 的**預設不同**（7 預設就是 UTF-8 無 BOM）→ 純 ASCII 在兩者行為一致。
5. 這是**發給別人用的套件**：別人的 ANSI 可能是 cp1252／cp932／cp936，同一份檔案在每台機器壞法不同；**純 ASCII 是唯一在所有 code page 下解讀一致的內容**。
6. 成本近乎零：ASCII 本來就是 UTF-8 的子集，而這支腳本幾乎全英文（中文放 JSON 與 `.md`）。

（上面用四引號圍籬只是為了讓這一節能內嵌在本卡裡；實作時直接寫正常的 ``` 圍籬。）

### 2.2 `references/encoding.md`：那一節開頭加一行回指

在 `## .ps1 一律純 ASCII` 標題底下加：

> 本節是 `SKILL.md`〈檔案類型陷阱〉的**細節與實測**；**規則本身只寫在 SKILL.md**，這裡只補成因、實例與量測。

（`.cmd` 的 CRLF 也建議在這裡補幾句成因，例如為什麼 `goto` 會跳錯。）

### 2.3 `SKILL.md` 尾巴的「需要細節時再讀」表

`references/encoding.md` 那一列的說明，從「在 Windows／PowerShell 讀寫中文檔，遇到亂碼、BOM 或編碼問題」改成加上「**與檔案類型規則的細節**」。

### 2.4 `README.md`（npm 頁面看得到）

建議在講寫入守門的段落補一句：「另有兩條**檔案類型**規則：`.ps1` 純 ASCII、`.cmd` 純 ASCII＋CRLF（見 `SKILL.md` 的〈檔案類型陷阱〉）」。
**不改也可以**，但 npm 使用者只看得到 README。

---

## 三、判斷點（要自己決定，不要照抄）

1. **範圍**：`.cmd` 的 CRLF 跟「中文」無關，是純 Windows 寫入陷阱。本套件已經在管 console 編碼（`references/console-encoding-hazard.md`）與檔案編碼（`references/encoding.md`），收進來是一致的；**若判斷超出範圍，就只收 `.ps1` 那條**，`.cmd` 留給各專案 `verify`。
2. **對外措辭**：這是發給別人用的套件 → 規則文字**不得出現本機的絕對路徑**（例如 `C:` 開頭的使用者目錄、或某個磁碟機的根目錄），也不要綁特定 harness（DSH 只出現在既有表格裡）。寫「Windows PowerShell 5.1」，不要寫「這台機器」。
3. **token 成本**：`SKILL.md` 每次載入都吃 context → 新小節保持精簡（兩列表 ＋ 一段說明 ＋ 三行驗證），細節留在 `references/encoding.md`。
4. **單一來源**：規則只宣告一次（`SKILL.md`），`references/encoding.md` 只留成因與實測——否則就是「同一件事兩份文件各寫一次」，那正是本套件最容易腐化的地方。

---

## 四、驗收

```powershell
npm test                                                                 # 9 支 selftest ＋ test:repo
npm run audit                                                            # 字表稽核（ASCII-only 的 .ps1）
node scripts/tradzh.js SKILL.md references/encoding.md README.md          # 三份改過的檔案單獨複查
```

- `npm test` 的 `test:repo` 會**用本套件自己的規範檢查自己的檔案**，所以新增的中文必須是乾淨繁體（無簡體專有字、無日文專有字詞、無粵語口語）。
- 本卡新增的檔案**不會被發佈**（`package.json` 的 `files` 是白名單），所以不必列進 `files`；它也不需要在 `.tradzhignore` 裡（內容本來就是乾淨繁體）。

---

## 五、之後：發佈（**由使用者自己在終端機跑**）

`SKILL.md` 是出貨檔案（`files` 有它），所以改完要：

1. 版號 bump（文件類小修 → **patch**）
2. `npm test` → `npm run audit` → `npm pack --dry-run`
3. `npm publish`——**非 TTY 環境會立刻 `EOTP` 失敗、而且印出來的網址被遮蔽成 `***`**，所以這一步不能交給 agent
4. 記住「四個露出點不會同時更新」：本機立刻／GitHub 立刻／Pages 20～40 秒／**npm 只跟 tarball**（不重發就一直是舊版）

---

## 六、機械強制：已由 `NEXT-file-type-guard.md` 接手（2026-09-19 完成）

這一節原本只是「可選、要另開一張卡」的構想，現在已經實作完畢，**立場改寫在
`NEXT-file-type-guard.md`**（實作位置、刻意設計、repo 自己的位元組守門、故意弄壞的證明、
以及還沒做的三個缺口）。這一節不再重述那些內容——同一件事寫兩份就是這個 repo 最容易腐化的地方。

留在這裡的只有一條**歷史教訓**，它是這張卡存在的理由：規則是先寫進 `SKILL.md` 的，
而**寫出那條規則的同一個 session 隨即在 `scripts/build-codepage.ps1` 的註解裡留了 15 個
非 ASCII 位元組**，並且沒有任何檢查發現——因為當時所有檢查都只看中文字軸、沒有人看檔案類型與位元組。
現在由 `npm test` 的 `api-selftest` 釘住（詳見 `NEXT-file-type-guard.md` 第四節）。

