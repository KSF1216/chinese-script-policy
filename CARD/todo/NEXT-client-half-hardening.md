---
id: next-client-half-hardening
status: todo
acceptance: |
  node tools\docs.mjs
  npm test
updated: 2026-09-20
---

# 瀏覽器那半的兩層防護：`apply()` 包 try/catch、卡片加 error boundary

## 為什麼（同一天在**另一個 DSH 外掛**上實測到的兩個失敗模式）

| 失敗模式 | 實測結果 |
|---|---|
| **`apply()` 拋錯** | 一個外掛的 `apply` 拋出時，錯誤會往外傳；嚴重的情況是**整棵外掛樹載入失敗、伺服器起不來**（那次是 `package.json` 少了 `exports["./client"]`，錯誤訊息指著 `dsh-client-modules`，完全沒提真正缺的欄位） |
| **render 拋錯** | 宿主**自己有**包一層（Console 會出現 `slot entry crashed in '<座位名>'`），所以**只壞那一塊**、整個 app 還在。但那一塊會**留白**，看不出原因 |

本專案的 `lib/client.js` 目前：`apply()` **沒有** try/catch；那張設定卡**沒有** error boundary。
**沒有任何證據顯示它在漏**（它一直正常運作），所以這一張是**加固**，不是修 bug。

## 要做的事

1. **`apply` 包 try/catch**（兩個地方在讀宿主服務：`ctx.effects`／`ctx.settingsScope.bind`／`ctx.slots.inject`）。
   拋錯時：**只少一張卡，不要少一棵樹**，而且要用可以看見的方式說出來（`ctx.logger.warn` 或 console）。
2. **加一個 error boundary** 包住那張卡片（class component ＋ `static getDerivedStateFromError`），
   把錯誤訊息**印在卡片位置上**——留白是最糟的失敗形狀，因為它跟「這個外掛沒有這一頁」長得一樣。
3. ⚠️ **boundary 只保護它包住的東西**：註冊時的第一層 wrapper（在 `ctx.slots.register` 之前跑的那個函式）
   要**自己不可能拋**——把讀服務的每一行都包起來。這一點是實測來的：另一個外掛的錯誤就發生在
   **wrapper 之外**，於是 boundary 完全接不到。

## 反向案例（順手一起做，成本很低）

`bundle-check` 那種「不必開瀏覽器」的驗證很值得抄：把 `lib/client.js` 當**文字**評估
（假的 `window.__ModuleLoader__`）、跑 factory、用 stub 的 React **驅動那張卡**、斷言它畫出了什麼。
本專案已經有 8 支自我測試，但**都在測邏輯**；這一支會補上「**外掛那一半真的跑得起來**」這個空白。

## 界線

- **不要順手改行為**：這一張只加防護網，輸出的字與選項都不動（那是另一張卡的事）。
- 改完跑 `npm test`（含 `test:docs`）與 `npm run test:tarball`。
