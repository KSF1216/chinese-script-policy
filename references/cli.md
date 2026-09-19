# 功能與指令全表（從 README 搬過來）

> README 只留最短路徑；完整的功能 × 指令 × 說明在這裡。

## 它做什麼

| 功能 | 指令 | 說明 |
|---|---|---|
| **檢查** | `node scripts/tradzh.js <檔案>` | 掃出「簡體專有字」（2,637 字表），也支援 `--simplified` 反向檢查 |
| **語體檢查** | `node scripts/tradzh.js --written <檔案>` | 掃出**粵語口語標記**（嘅、咗、點解、而家…），確保儲存的資料是標準書面語 |
| **日文檢查** | `node scripts/tradzh.js --japanese <檔案>` | 掃出**日文專有字詞**：**367 字**（新字體 `竜`、`発`、`図`、`円`、`駅` ＋ 和製漢字 `働`、`畑`、`辻`）＋ **123 個日文詞**（`予定`、`予約`、`丁寧`、`世論`）。新字體既不是繁體也不是簡體，簡體表看不到它；日文詞更麻煩——每個字都是合法繁體，只有「詞」是日文，所以字元表也看不到 |  <!-- check-ok -->
| **輸出編碼風險** | `node scripts/tradzh.js --console-hazard --dir .`（`--codepage 950`；已建 **950／936／932／1252／20936**，`54936`／`65001` 永遠安全） | **第三條軸**，不屬於「要求繁體／要求簡體」的主軸：找**會印到 console 的行**裡有沒有**目標 codepage 編不出來**的字元。Windows 主控台是 cp950，實測 **15,402** 個碼位印不出來（CJK 擴充A 全部、`丨 丿 丶`、所有 emoji）——檔案可以是**正確繁體卻在執行時崩潰**。只綁 `print`／`echo`／`logging`／`logger`／`log`／`console`／`raise`，所以註解或變數名裡的字**不會**回報。**是啟發式判斷，不是保證**；細節與實測見 [`console-encoding-hazard.md`](console-encoding-hazard.md) |
| **轉換** | `node scripts/tradzh.js --fix --to-traditional --write out.txt < in.txt` | 簡→繁（4,012 字＋**49,257 詞組**＋字形校正）、繁→簡（4,148 字＋480 詞組） |
| **分步轉換** | `--to-traditional`／`--to-simplified`／`--to-written`／`--convert-japanese` | **每個軸各自一步**，要哪一步就下哪個旗標。順序是 **清日文 → 轉書面語 → 繁／簡**（`竜` 要先變繁體才能變簡體），所以可以跑兩～三次、中間用「結果送回原文」接到下一步 |  <!-- check-ok -->
| **轉書面語**（選用） | `node scripts/tradzh.js --to-written --write out.txt < in.txt` | 只轉**一定不是書面語**的粵語（`嘅`→`的`、`咗`→`了`、`唔該`→`謝謝`、`冇`→`沒有`）；`屋企`、`點解`、`邊度` 那些**不轉**，因為它們會在正常中文裡跨詞出現（房**屋企**業、早點**解**決），**改寫交給模型**。轉完會列出轉不到的部分。**預設關**：語體是風格，要不要換由你決定 |
| **清日文**（選用） | `node scripts/tradzh.js --convert-japanese --write out.txt < in.txt` | 日文新字體→中文（`竜`→`龍`）。**預設關**：文件可能故意引用日文，引文不該被悄悄改掉 |  <!-- check-ok -->
| **用語偏好**（選用） | `node scripts/tradzh.js --wording --to-traditional --text "软件"`<br>`node scripts/tradzh.js --wording --to-simplified --text "軟體"` | 加上目標字體的當地用語，**用哪一張表由方向決定**：簡→繁用繁體偏好（`軟件`→`軟體`、`硬盤`→`硬碟`、`鼠標`→`滑鼠`、`網絡`→`網路`，830 筆）、繁→簡用簡體偏好（`軟體`→`软件`、`網路`→`网络`、`計程車`→`出租车`，810 筆）。**預設關**：兩邊都是正確的中文，換詞是偏好不是修正 | <!-- simplified-example -->
| **相容字正規化** | （自動，兩個方向都做） | 相容表意文字（`豈` U+F900 這種同字不同碼位的重複編碼）→ 標準碼位。檢查時會 `WARN` 並計入 exit code |
| **寫入把關** | 選用的 PreToolUse hook | 內容含簡體、**粵語口語**或**日文專有字**就**擋掉寫入**（exit 2），模型必須先改對 |
| **離線網頁版** | `npm run build:web` | 產生**單一 HTML 檔**：上面原文、中間兩顆按鈕（繁轉簡／簡轉繁）、下面結果，**轉換不會改動原文**；雙擊即用，不需要 LLM／Node／網路 |
| **字表稽核** | `powershell -File scripts/audit-glyph-list.ps1` | 用 Big5／GBK 字集抓出「被誤列成簡體」的標準繁體字（**維護字表用，且只能在 Windows 跑**——它需要 Windows 內建的 cp950／cp936 編碼器；日常使用不需要它） |

