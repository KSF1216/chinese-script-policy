---
id: next-release-1.3.1
status: blocked
blocked_by: 使用者——(1) 決定要發哪一個版號（見下面兩個選項：直接發已備好的 1.3.0，或先 bump 成 1.3.1 一起發）；(2) 最後那一步 npm publish 必須由你在自己的終端機跑（非 TTY 環境會立刻 EOTP 失敗，而且印出來的網址會被遮蔽成 ***）
updated: 2026-09-20
blocked_since: 2026-09-20T09:43Z
acceptance: |
  npm test
  npm run test:tarball
  npm run audit
  npm pack --dry-run
---

# 發布下一個版本（`package.json` 已經是 1.3.0，但 **1.3.0 從未發布**）

> 檔名與 `id` 是歷史留下來的（2026-09-20 由另一個 session 建立，當時假設 1.3.0 已經發布）。
> 保留檔名是為了不讓 `tools/docs.config.mjs`、`PUBLISHING.md` 與 `breaktest` 的引用失效；
> **立場以下面這一節為準**（2026-09-20 更正）。

## 事實（2026-09-20 12:5x 香港時間實測）

| 項目 | 值 | 怎麼知道的 |
|---|---|---|
| npm `dist-tags.latest` | **1.2.0** | `GET https://registry.npmjs.org/chinese-script-policy/latest` → `version: 1.2.0` |
| registry 上的版本 | **只有 1.2.0** | packument 的 `versions` 只有 `1.2.0`；`time` 只有 `1.0.0`／`1.1.0`／`1.1.1`／`1.2.0`（unpublish 過的版本仍會留在 `time`，所以「1.3.0 發過又刪掉」不成立） |
| 本機 `package.json` | **1.3.0**（已 bump、`dist/tradzh.html` 頁尾也是 v1.3.0） | 2026-09-19 備好，`npm publish` 一直沒有跑 |
| git tag／Release | 最新的只有 `v1.2.0` | `git tag -l`、GitHub releases API |

**所以「下一個版本」不是 1.3.1 這個 patch——1.3.0 整包（檔案類型守衛那個功能版）都還沒出去。**

## 兩個選項（選一個，不要兩個都做）

| 選項 | 做什麼 | 適合 |
|---|---|---|
| **A：直接發 1.3.0** | 什麼都不用改版號，跑完驗收就 `npm publish`。守門類的改動（`test:docs`、`test:tarball`、`tools/docs.mjs` 納入出貨）一起坐這班車 | 想趕快把功能版送出去 |
| **B：先 bump 成 1.3.1 再發** | `npm version patch`（1.3.0 → 1.3.1）＋ 重建 `dist/tradzh.html`，然後 `npm publish` | 想把「1.3.0 沒發過」這件事留成紀錄；代價是 1.3.0 這個版號從此不用 |

**兩個選項的出貨內容一樣**：從 1.2.0 之後的所有改動（檔案類型守衛、`--console-hazard` 之後的 `fileTypes` 開關、文件、`test:api` 的新守門、`test:tarball`）。
所以**發布說明用 §6 的 1.3.0 段**（那一整段就是「1.2.0 → 現在」的差異），不要只寫 `test:docs`。

## 發布前（agent 已經做完的）

```powershell
npm test             # 九支 selftest ＋ test:repo（三軸掃自己）＋ test:docs（交接文件守門）
npm run test:tarball # 打包 → 解開 → 在裡面再跑一次 npm test（發布才會出貨的那份）
npm run audit        # 字表稽核
npm pack --dry-run   # 61 檔（2026-09-20 起，多了 cantonese-allow.json 與 tools/docs.mjs）
```

版號 bump（選項 B）屬於發布動作，等決定再一起做。

## 為什麼是 `blocked`

兩件事都在使用者手上：**發哪個版號**，以及**最後那一步只能由人跑**（`npm publish` 在非 TTY 環境會直接失敗，連要轉貼的網址都被遮蔽）。
所以這張卡不是 `todo`——它不是「等人去做」，是「等一個決定」。

## 發布後要檢查的四個露出點

改了出貨檔案，四個地方**不會同時更新**：

| 露出點 | 時差 |
|---|---|
| 本機 | 立刻 |
| GitHub repo（含 `raw.githubusercontent.com`） | push 後立刻 |
| GitHub Pages | 約 20～40 秒 |
| **npm** | **只跟 tarball**——不重發就一直是舊版 |

另外：發布後立刻查 registry 若得到 404，那是 CDN 快取，別急著重發（會撞 `EPUBLISHCONFLICT`）。
發布後補 tag 與 GitHub Release（body 取 `PUBLISHING.md` §6 對應那段）。
