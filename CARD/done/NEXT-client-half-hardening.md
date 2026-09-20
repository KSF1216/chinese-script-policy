---
id: next-client-half-hardening
status: done
acceptance: |
  node tools\docs.mjs
  node scripts\plugin-selftest.mjs
  npm test
  npm run test:tarball
updated: 2026-09-20
verified_at: 2026-09-20T13:34Z
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

---

## 結果（2026-09-20 21:4x HKT）：兩層都實作，而且**兩層都證明會紅**

### 做了什麼（`lib/client.js`）

| 層 | 實作 | 失敗時的行為 |
|---|---|---|
| **`apply()` 包 try/catch** | 原內容搬進 `mount(ctx)`，`apply()` 只負責 `try { mount(ctx) } catch { report(...) }` | **只少一張卡**，不會把錯誤往上傳（別的外掛的實測：一整棵樹載入失敗）；訊息走 `ctx.logger.warn` ＋ `console.error` |
| **card 的 error boundary** | `class CardBoundary extends React.Component`（React 沒有 hook 版）＋ `static getDerivedStateFromError` ＋ `componentDidCatch`；`ctx.slots.register(..., () => React.createElement(CardBoundary, null, React.createElement(Card)))` | 卡片**原位**畫出「這張設定卡載入失敗」＋底層錯誤訊息，**不是留白**（留白跟「這個外掛沒有這一頁」長得一樣） |
| **第一層不可拋** | 註冊的那個函式只呼叫 `React.createElement`，讀服務的每一行都在 `mount` 裡（被 try/catch 包住） | boundary 一定接得到 render 期的錯誤（實測過另一支外掛的錯誤發生在 wrapper 之外，boundary 完全接不到） |

字典各加兩個鍵（`crashTitle`／`crashDetail`，zh＋en；`test:plugin` 本來就要求兩邊鍵集合相同）。

### 測試（`scripts/plugin-selftest.mjs`：設定卡 27 → **34** 項）

這一張原本假設「本專案沒有測外掛那一半的測試」——**其實有**（`plugin-selftest` 早就用
`new Function('window','console',code)` 把 `lib/client.js` 當文字評估、抓
`window.__ModuleLoader__.load` 的註冊）。真正缺的是**失敗模式**的覆蓋，所以補的是這個：

| 新能力 | 內容 |
|---|---|
| 迷你 renderer | 假 `createElement` 只會組出惰性節點，所以**函式／類別元件與 boundary 都不會被執行**。新增 `render()`：叫用函式元件、實例化類別元件，並照 React 的順序在擲錯時先 `getDerivedStateFromError`、再 `componentDidCatch`。另外補 `React.Component`（boundary 需要）與「children 併進 props」的還原（真 React 就是這樣，不還原元件會拿到 `props = null`） |
| `apply()` 不逃逸 | 餵一個 `locale.bind` 會丟錯的 ctx → 斷言**沒有例外逸出**，而且**有出聲**（`reported` 收集 logger／console 兩條路） |
| boundary 有畫面 | 餵一個 `getSnapshot` 會丟錯的 settings 來源 → 斷言畫出 `crashTitle`、且**印出底層訊息**、且有寫進 log |

### 故意弄壞（兩層各自證明）

| 弄壞什麼 | 結果 |
|---|---|
| 拿掉 boundary（`register(..., Card)` 直接註冊卡片） | **紅**：`FAIL: browser half error: settings store unavailable`——錯誤直接逸出，正是「留白」的前身 |
| 讓 `apply()` 的 catch 重拋 | **紅**：`apply() must not let a broken host service escape …: locale service missing` |

兩次都先複製位元組副本再改，還原後 `lib/client.js` 的 SHA-256 與弄壞前相同（`E40FE91B58F30A03…`）。

### 驗收（當輪實測）

`node tools\docs.mjs` → 0 problem｜`node scripts\plugin-selftest.mjs` → 41／34／4 全過（stderr 0 行，
因為測試把預期的日誌收進 `reported` 再斷言）｜`npm test` → exit 0｜`npm run test:tarball` → exit 0。
