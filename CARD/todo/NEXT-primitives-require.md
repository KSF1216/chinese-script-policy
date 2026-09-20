---
id: next-primitives-require
status: todo
acceptance: |
  node tools\docs.mjs
  npx --no-install dsh --profile web --port 3099 --no-open   # 然後 node board-plugin 的 live 檢查（見卡內）
updated: 2026-09-20
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
