# 執行時編碼風險（console / stdout 的 codepage）

> 這是**另一條軸**：不屬於「要求繁體／要求簡體」的主軸，也不屬於粵語／日文副軸。
> 2026-09-18 由一次本機工作區的 session 實測後記錄，**同日實作完成**
> （`tradzh --console-hazard`，見文末「實作」一節）。
> 日常不需要讀；要動這一軸時整份讀完再動手。

## 一句話

**「沒有簡體字」不等於「安全」。** 檔案內容是正確的繁體，程式照樣可以在執行時崩潰——
只要它把某個**目標 codepage 編不出來的字元**印到 stdout。

## 實際案例（真實崩潰，不是假想）

ComfyUI 外掛 `Comfyui_Minimax_h3_latent_Upscaler` 的節點在 `load_model()` 裡印了這一行：

```python
print(f"[MinimaxH3] 缺少键: {missing[:5]}... (可能由于 attn 强制关闭)")   <!-- simplified-example -->
```

它含**簡體字**（U+952E），而 Windows 主控台是 **cp950（Big5）** → 編不出來 →
`UnicodeEncodeError: 'cp950' codec can't encode character '\u952e'` → 節點崩潰 → 整個工作流失敗。

**症狀極具誤導性**：ComfyUI 看起來還在跑、GPU 也有佔用，但**永遠不完成**——
因為連把 traceback 寫進日誌的動作本身都炸掉。第一版判斷因此誤成「顯存不足在搬頁」，
後來從伺服器日誌的原始 traceback 才推翻。

## 為什麼現有字表防不到：兩條軸的量化差距

以 .NET `Encoding.GetEncoding(950, ExceptionFallback, ExceptionFallback)` 實測
cp950 的涵蓋範圍，再與本專案字表交叉比對：

| 區段 | 總字數 | cp950 編不出來 |
|---|---|---|
| CJK 統一漢字（4E00–9FFF） | 20,992 | 7,924 |
| **CJK 擴充A（3400–4DBF）** | 6,592 | **6,592（全部）** |
| CJK 相容表意（F900–FAFF） | 512 | 510 |
| 標點／假名（3000–30FF） | 256 | 228 |
| 全形符號（FF00–FFEF） | 240 | 148 |
| **合計** | | **15,402** |

| 交叉比對 | 數量 |
|---|---|
| cp950 編不出來、**本專案字表抓得到**（簡體／繁體／日文三張表加起來） | 2,916 |
| ★ cp950 編不出來、**本專案抓不到（盲區）** | **12,486** |
| 反向：簡體字表 2,637 個字裡，cp950 **其實編得出來**的 | 35 |

盲區例子：`丂 丄 丅 丆 丒 丗 丨 丩 丬 乀 丿`

**關鍵**：`丨`、`丿`、`丶` 這些是**繁體文本真的會用到**的字（人名、書法、筆畫描述），
但 cp950 編不出來。所以這**不是「再補幾個簡體字」能解決的**。

**連中文都不是的反例**：`✅`（U+2705）也編不出來。同一個外掛的 3D 節點有

```python
print("[MinimaxH3-3D] ✅ Model offloaded to CPU. VRAM released.")
```

——**就算外掛寫的是繁體，光一個 emoji 也會讓它崩潰。**

## 建議做法：三層，只有第 2 層屬於本專案

### 第 1 層｜根治（環境層，不屬於字表政策）

讓 stdout 不再是 cp950：

- Python：`PYTHONUTF8=1` 與 `PYTHONIOENCODING=utf-8`
- `chcp 65001`
- PowerShell：`[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)`

做了這層，**任何字元都不可能再造成這個問題，完全不需要字表**。
（實務上就是這樣修的：在啟動腳本前面加 `set PYTHONUTF8=1`，或另開一個先把環境變數設好、
再去呼叫主程式的 `.cmd`。）

### 第 2 層｜本專案可以加的新軸：「輸出編碼風險」 ← **已實作**（`--console-hazard`）

- **輸入**：程式碼檔案／目錄 ＋ **目標 codepage**（本機預設 950）
- **找**：**會輸出到 console 的字串**裡有沒有該 codepage 編不出的字元
- **必須綁定「輸出匯」**：`print(`、`logging.`、`logger.`、`log.`、`raise` 的訊息、`echo`
  - 理由：同樣的簡體字放在**註解或變數名裡完全無害**。不綁定會製造大量假警報，
    這跟當年「共用字必須從簡體表剔除」是同一個教訓
- **建議介面**（與現有 CLI 對稱）：

  ```bash
  node scripts/tradzh.js --console-hazard --codepage 950 --dir ./someproject
  node scripts/tradzh.js --console-hazard --codepage 950 file.py
  ```

- **輸出**：檔案:行號、字元、碼位、以及「該 codepage 編不出來」，並**計入 exit code**
- **價值**：把問題從「執行時崩潰」提前到「**安裝／執行前就發現**」

### 第 3 層｜守門（可選，偏運維）

啟動器／pre-flight 檢查 `PYTHONUTF8` 與 console codepage，不符就警告或自動設定。
成本最低，但只保護自己那台機器。

## 實作重點（別重踩的坑）

1. **Node 沒有 cp950 編碼器**（`Buffer` 只有 utf8／latin1／utf16le…）。
   解法與 `build-s2t.js` 同一套路：**用 .NET 產一次「codepage 涵蓋表」存成 JSON**，
   執行時零依賴、完全離線。
   ```powershell
   $enc = [System.Text.Encoding]::GetEncoding(950, [System.Text.EncoderFallback]::ExceptionFallback, [System.Text.DecoderFallback]::ExceptionFallback)
   ```
   ⚠️ **一定要給 `ExceptionFallback`**：.NET 的預設是**替換成 `?`**、不丟例外，
   少了它會得到「全部都編得出來」的**假通過**。
2. **不要用「整份檔案有沒有非 ASCII」當判斷**：那會把註解、變數名、UI 字串全部算進來。
3. **表要能被重建**，而且要在 `.tradzhignore` 放行表檔本身（表的鍵就是那些字，
   不然每次檢查都會報一大串）。
4. **多 codepage 可擴充**：950（Big5）、936（GBK）、**20936（嚴格 GB2312-80）**、932（Shift-JIS）、
   1252（西歐）、54936（GB18030）、65001（UTF-8＝永遠安全）。介面留 `--codepage`，預設 950。
   ⚠️ **命名陷阱**：Windows 把 **936** 叫 `gb2312`，但 936 其實是 **GBK**（連繁體常用字都編得出來，
   實測 23,942 字）；真正嚴格的 GB2312-80 是 **20936**（實測 7,485 字），它編不出 `體 軟 淨 麵 裡`
   ——也就是說，同一條軸在 GB2312 環境下會**反過來抓繁體**。

## 驗收樣本（可重現）

一個剛裝好的 ComfyUI 是現成的活體樣本。掃
`ComfyUI\custom_nodes` 與 `ComfyUI\comfy_extras` 底下所有 `.py`，找「輸出匯裡有
cp950 編不出的字元」的行。

**2026-09-18 實測結果：3 個檔案、11 行。** 已知必中的三個位置（實作完拿這些驗收）：

| 檔案 | 行 | 內容 |
|---|---|---|
| `minimax_h3_latent_upscaler_2d.py` | 387 | `缺少键`（就是崩潰的那一行） <!-- simplified-example --> |
| `minimax_h3_latent_upscaler_3d.py` | 603 | `✅ Model offloaded to CPU`（emoji） |
| `minimax_h3_latent_upscaler_2d.py` | 427 | `raise ValueError("请将模型文件放入 …")` <!-- simplified-example --> |

**故意弄壞的驗證**（本專案慣例）：先確認它掃出這 3 個檔／11 行，再手動把其中一行改成
純 ASCII，確認它不再回報那一行，然後還原並比對 hash。

## 實作（2026-09-18 完成）

| 元件 | 位置 | 說明 |
|---|---|---|
| 掃描 | `scripts/lib.js` 的 `consoleHazards()` | 逐行比對輸出匯，再看該行有沒有目標 codepage 編不出的字元；`check-ok` 一樣可以放行單行 |
| CLI | `tradzh --console-hazard [--codepage 950] [--dir . \| <file...>]` | 輸出「檔案:行號、字元 (U+XXXX)」並**計入 exit code**（有命中＝1），支援 `--json`／`--quiet`；`--text` 也可以（讓 `npm test` 能在沒有外部樣本的情況下蓋到它） |
| 表 | `scripts/codepage-repertoire.json`（177 KB） | 950／936／932／1252／**20936** 的**可編碼字集**；54936（GB18030）與 65001（UTF-8）記在 `coversAll`——它們編得下全部 Unicode，永遠不會回報 |
| 產生器 | `scripts/build-codepage.ps1`（`npm run build:codepage`） | .NET 產生、ASCII-only 腳本。**encoder 與 decoder 的 fallback 都必須是 `ExceptionFallback`** |
| 表測試 | `scripts/codepage-selftest.mjs`（`npm run test:codepage`） | 把量測數字釘住：五個區段的 7,924／6,592／510／228／148，以及「字表 2,637 個字中 35 個可編碼」。**專門用來擋「忘了 `ExceptionFallback` → 全部都編得出來」那種假通過** |
| CLI 案例 | `scripts/selftest-cases.json` 的 8 個新案例（`npm run test:cli`） | print 裡的簡體、只出現在註解（不回報）、emoji、繁體、UTF-8，以及三個錯誤用法（沒搭配的 `--codepage`、沒有表的 codepage、想用它轉換或寫入） |

**驗收（2026-09-18，用真的 ComfyUI 目錄重跑）**：

- 掃 `custom_nodes` → **3 個檔案、11 行、23 個字元**，與上面那張表完全一致；`comfy_extras` → clean。
- 三個已知位置全部命中：`2d.py:387`、`3d.py:603`（emoji）、`2d.py:427`。
- **故意弄壞**：樣本複製到暫存目錄後，把 `2d.py:387` **整行**改成純 ASCII → 那一行**不再回報**
  （該檔由 5 行／11 字元降為 4 行／7 字元，總計 11 行 → 10 行），而原始檔的雜湊前後一致，
  證明探針只動了複本，沒有動到那份第三方安裝。
  ⚠️ 只拿掉那一行的**一個字**是不夠的：同一行還有其他簡體字，它照樣會回報——這是對的行為。

## 設計決定（2026-09-18 定案）

1. **放哪裡** → **`tradzh` 的子模式**（`--console-hazard`），但**不與腳本軸混用**：自己的預設值
   （一個 codepage，不是字表）、自己的訊息、自己的 exit code 語意；主軸的 `--variant` 對它毫無意義。
   原本擔心的「混在一起會讓『要求繁體』的語意變模糊」就是靠這一點避免的。
2. **第 3 層（pre-flight 環境守衛）** → **沒做**。成本最低但只保護自己那台機器；
   實測那次是手動在啟動腳本補的。
   ⚠️ **但只有其中一個啟動器有補**：ComfyUI portable 的另外兩個啟動器（CPU 版與
   fp16-accumulation 版）都直接叫它內建的 `python.exe`，**沒有** `PYTHONUTF8`
   → 用那兩個啟動，同一個崩潰就復發。這是「只補一處」的典型漏洞。
3. **第三方外掛安裝前掃描器** → **沒做**。`--dir` 已經能掃任何目錄；要不要包成安裝前鉤子是使用者的選擇。
4. **誤判容忍度** → 只綁 `print` / `echo` / `logging` / `logger` / `log` / `console` / `raise`
   這七種輸出匯，而且**輸出與 `--help` 都明講這是啟發式判斷**（`HEURISTIC, not a proof`）。
   註解與變數名裡的字不列入，因為它們永遠到不了 console。

## 順手查到的另一件事（2026-09-18）

**crash 的關鍵不是「console 的 codepage」，而是 stdout 的編碼。** 同一台機器實測：

| stdout 接到 | Python 用的編碼 |
|---|---|
| 主控台（tty） | console codepage（`chcp` 的值） |
| **管線／檔案**（ComfyUI 就是這樣捕捉節點輸出） | **系統 locale 的編碼** |

所以「我的終端機已經是 65001」給了假的安全感：`chcp` 是 65001 時，被捕捉的 stdout 仍然是
**cp950**。實測（ComfyUI 內建的 Python 3.13）：`键`、`✅`、`丨` 三者都丟 `UnicodeEncodeError`；<!-- check-ok -->
加了 `PYTHONUTF8=1` 之後三者都正常。**`chcp 65001` 不能取代環境變數那一層。**

