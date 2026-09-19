---
id: next-file-type-guard
status: done
acceptance: |
  node scripts/plugin-selftest.mjs
  node scripts/api-selftest.mjs
  npm test
  npm run audit
updated: 2026-09-19
---

# Windows 腳本檔類型的寫入守衛（`.ps1` 純 ASCII、`.cmd` 純 ASCII ＋ CRLF）

> **這張卡是 `NEXT-write-rules.md` §6「可選（另開一張卡）」的實作卡**——那張卡的「規則搬進
> `SKILL.md`」在 2026-09-19 完成，§6 的機械強制則由這張卡接手並在同一天做完。
> 卡的索引在 `PUBLISHING.md` §5（卡片不出貨，所以不列進 `README.md`）。

## 一、這條規則跟其他軸有什麼不同

其他軸看的是**內容裡的中文**（簡體專有字、粵語口語、日文專有字詞）；這一條看的是
**寫入的檔案類型**。成因與實測在 `references/encoding.md`，規則本身在 `SKILL.md` 的
〈檔案類型陷阱（Windows）〉。實測結論只有一格真的會壞：

| 目標 | 條件 | Windows PowerShell 5.1／cmd.exe 的結果 |
|---|---|---|
| `.ps1`／`.psm1` | 內容含非 ASCII | **壞掉**（`The string is missing the terminator`）——因為寫入工具一律寫「UTF-8 無 BOM」 |
| `.cmd`／`.bat` | 內容含非 ASCII | 通常仍能跑，換一台機器變亂碼 |
| `.cmd`／`.bat` | 只有 LF、沒有 CRLF | 通常仍能跑，`goto`／`set /p` 會出怪事 |
| 任何 | 純 ASCII | 永遠不觸發 |

## 二、實作位置（改動要同步的地方）

| 檔案 | 內容 |
|---|---|
| `scripts/lib.js` | `fileTypeTrap(filePath, content)`：唯一的判準，回 `{reason, severity}`；`severity` 是「天生嚴重度」（`.ps1` ＝ `block`，batch 的兩種 ＝ `warn`） |
| `index.mjs` | 設定 `fileTypes`（`off`／`warn`／`block`，預設 `warn`）＋ `inspectFileType()` ＋ `tools/pre-execute` 監聽器（**先問檔案類型，再問中文**） |
| `cordis.patch.yml` | 那列外掛的 `config` 加了 `fileTypes: warn`（基底層） |
| `lib/client.js` | 設定卡的三選一（`NAMESPACE + '-fileTypes'`）、兩個語系的標籤、以及折疊標題行的那一段 |
| `scripts/plugin-selftest.mjs` | `inspectFileType` 的行為案例 ＋ 掛在真的 waterfall 上的三個案例（預設放行並警告、`block` 時 `.ps1` 擋下、`read` 不觸發） |
| `scripts/api-selftest.mjs` | repo 自己的位元組規則（見下） |

## 三、刻意設計（改動時不要弄丟）

1. **預設 `warn`**：作用域是別人的機器、別人的檔案；預設擋會讓沒聽過這個套件的人一頭霧水。
2. **`block` 也只擋真的會壞的 `.ps1`**：`.cmd`／`.bat` 永遠只警告（實測它們仍能執行）。
3. **只看寫入，不掃描既有檔案**：判斷的是「即將寫入的內容」，別人已有的 UTF-16／帶 BOM 腳本不受影響。
4. **fail-open**：判斷函式丟錯就放行（與其他守衛同一個原則）。
5. **純 ASCII 與非腳本類型永不觸發**，所以最常見的情況沒有誤報。

## 四、repo 自己的位元組守門（`npm test` 的一部分）

`scripts/api-selftest.mjs` 會走一遍 repo（跳過 `node_modules`、`.git`）並讀**原始位元組**：

- 每個 `.ps1` 必須**純 ASCII**；
- 每個 `.cmd`／`.bat` 必須**純 ASCII 且含 CRLF**（沒有孤立 LF）。

**它第一次跑就抓到真的違規**：`scripts/build-codepage.ps1` 的註解裡有 15 個非 ASCII 位元組
（五個常見繁體字），而所有既有檢查都只看中文字軸。已改成 Unicode 碼位（純 ASCII），
並由 `scripts/codepage-selftest.mjs` 驗證那五個字真的不在 cp20936 裡。

故意弄壞的證明（2026-09-19 實測，三種都紅、還原後綠）：

| 弄壞什麼 | 結果 |
|---|---|
| 真的 `.ps1` 塞一個非 ASCII 位元組 | `FAIL every .ps1 in the repo is pure ASCII` |
| 真的 `.cmd` 用純 LF | `FAIL every .cmd/.bat in the repo is pure ASCII with CRLF` |
| 真的 `.cmd` 塞非 ASCII | 同上（同一條檢查的兩個條件都測過） |

## 五、還沒做（要做的話先讀這一節）

| 缺口 | 為什麼還沒做 | 要動什麼 |
|---|---|---|
| **`hooks.json`（Claude Code 格式）沒有這條** | 那條路是 `pre-write-check.js`，只跑 `guardInspect`；hook 的環境**沒有 `$DSH_HOME`**，讀不到設定檔 | 若要一致，得讓 hook 用固定值（例如永遠 `warn`）或接受環境變數 |
| **CLI 沒有 `--file-types`** | 目前只有 DSH 外掛的設定卡能開關 | `scripts/tradzh.js` 加一個檢查模式（`--file-types <路徑>`），重用 `lib.fileTypeTrap` |
| **沒有通知（只擋／只警告）以外的行為** | 卡片的原則是「判準要窄」，先求不誤報 | — |

## 六、驗收

```powershell
node scripts/plugin-selftest.mjs     # 外掛：判準、waterfall、設定卡
node scripts/api-selftest.mjs        # 打包契約、出貨檔掃描、repo 自己的位元組規則
npm test                             # 九支 selftest ＋ test:repo（三軸檢查這份 repo 自己）
npm run audit                        # 字表稽核（ASCII-only 的 .ps1）
```
