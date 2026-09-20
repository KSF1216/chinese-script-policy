---
id: next-primitives-require
status: done
acceptance: |
  node tools\docs.mjs
  node scripts\plugin-selftest.mjs
updated: 2026-09-20
verified_at: 2026-09-20T13:30Z
---

# 那個選擇性的 `dsh-client-ui-primitives` require：確認它活著，不然就拿掉

## 症狀

`lib/client.js` 有一段**選擇性**的 require，拿折疊箭頭圖示：

```js
try { IconChevronDownOutline14 = require('@deepseek-ai/dsh-client-ui-primitives').IconChevronDownOutline14 }
catch { /* fall back to the text glyph */ }
```

它**不會壞**（有 fallback，缺了就用文字 `▾`），但它**讀起來像在用，其實可能從來沒有生效**。

## 現有的證據（2026-09-20 另一個 session 實測，指向「它是死的」）

| 觀察 | 怎麼量的 |
|---|---|
| `node_modules\@deepseek-ai\` **沒有 `dsh-client-ui-primitives` 這個目錄** | 直接列目錄 |
| 宿主送給瀏覽器的 **54 個 client 模組清單裡也沒有它** | 對一個跑起來的實例取 `/`，抓出 `/plugins/??<清單>&rev=…`，逐項找 |
| 但**其他套件的 `dsh.client.inject` 到處引用這個名字**（40+ 個） | 掃 `node_modules\@deepseek-ai\*\package.json`，所以它是「虛擬模組名」那一類 |

⚠️ **不確定的是最後一哩**：外掛 factory 裡的 `require` 走的是**宿主的模組註冊表**，不是 Node 的解析，
所以一個「沒有目錄、但在註冊表裡」的名字**可能仍然解析得到**。上面三條證據**不足以定案**。

## 要做的事（兩條路選一條，並留下證據）

1. **確認它活著**：在瀏覽器 F12 → Console 裡，於那張設定卡載入後執行
   `require` 拿不到（factory 作用域不公開），所以實務做法是**暫時把 try/catch 的 fallback 拿掉**，
   看卡片上的箭頭是圖示還是「壞掉」——**並且把看到的結果寫回這張卡**。
2. **確認它是死的 → 直接刪掉那段 require 與 `IconChevronDownOutline14` 的所有分支**，
   一律用文字 `▾`（現在的行為本來就是這樣）。**刪掉是零風險的**：那條路徑從未生效過。

**建議走 2。** 理由：它是一段**永遠走 fallback 的裝飾**，而這種「看起來有、其實沒有」的東西，
正是這套紀律要消滅的形狀；留著只會讓下一個讀者以為圖示已經接上。

## 界線

- 這是**外掛那層**的事，與中文轉換本體無關。
- 若走 2，`dsh.client.inject` 不要動（它列的是真的套件名，與這段 require 無關）。

---

## 結果（2026-09-20 21:2x HKT 實測）：**它活著 → 走選項 1，不刪**

**「`node_modules` 沒有這個目錄」是誤導**：它是**虛擬模組**——由 **web frontend 的 bundle** 提供，
跟 `react` 完全一樣（`react` 在 profiles 的 `node_modules` 裡也沒有目錄，卻顯然可用）。

| 證據 | 怎麼量的 |
|---|---|
| 前端 bundle 把這個 id 放進**內建模組註冊表**：`{react: ec, "@deepseek-ai/dsh-client-store": Hc, "@deepseek-ai/dsh-client-ui-slots": Ac, "@deepseek-ai/dsh-client-ui-primitives": Zg, "@deepseek-ai/dsh-client-ui-dockkit": Ey}` | 在 `node_modules\@deepseek-ai\dsh-web-frontend\dist\assets\index-*.js` 找到 `by()` 的回傳值 |
| 同一個 bundle 裡**定義了那個具名匯出**：`IconChevronDownOutline14: y3`（與 `IconCheckOutline14`、`IconChevronLeftOutline14`… 同一張表） | 同上，該字串出現 1 次 |
| DSH 自己的 **8+ 個 client half**（locale／chat／conversation／jobs／model-selection／deliverables／open-in-app…）用**一模一樣的寫法**要同一個圖示 | 掃 checkout 的 `node_modules\@deepseek-ai\*\lib\client.js` |

→ `require` 會成功、`IconChevronDownOutline14` 會是函式、卡片上的箭頭是**圖示**（不是 `▾`）。
**try/catch 留著是對的**：那是給「宿主沒有這個內建模組」的退路，不是死碼。

### 這一張真正的產物：兩條路都釘住

「看起來有、其實沒有」要消滅，但消滅的方式是**證明它真的有**，不是刪掉它。
`scripts/plugin-selftest.mjs` 的假 React 現在可以假裝宿主提供了 primitives，並斷言：

| 案例 | 斷言 |
|---|---|
| 沒有 primitives 模組 | 標題列畫**文字** `▾`（不是圖示元件） |
| 有 primitives 模組 | 標題列畫**那個圖示元件** |

**故意弄壞驗證過**：把 `lib/client.js` 的 `IconChevronDownOutline14 ?` 改成 `null ?` → 紅
（`when the host provides the UI primitives module the header must render its chevron icon`）；還原後綠。
（順帶記下一個真實行為：圖示存在**模組層變數**裡，所以一旦某次 render 看到模組，之後都走圖示——
測試因此把「沒有模組」那條放在前面。）
