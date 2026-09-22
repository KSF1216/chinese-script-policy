---
id: next-release-1.3.1
status: blocked
blocked_by: 使用者——**決定已做成（選項 B）**，只剩最後那一步：`npm publish` 必須由你在自己的終端機跑（非 TTY 環境會立刻 EOTP 失敗，而且印出來的網址會被遮蔽成 ***）
updated: 2026-09-22
blocked_since: 2026-09-20T09:43Z
acceptance: |
  npm test
  npm run test:tarball
  npm run audit
  npm pack --dry-run
---

# 發布 1.3.1（`package.json` 已是 1.3.1、已備好；**1.3.0 從未發布，永久不用**）

> 檔名與 `id` 是歷史留下來的（2026-09-20 建立時假設 1.3.0 已發布）。
> 保留檔名是為了不讓 `tools/cards.config.mjs`、`PUBLISHING.md` 與 `breaktest` 的引用失效；
> **立場以下面這一節為準**。

## 決定（2026-09-22 由使用者做成）：**選項 B**

使用者問「做 1.3.1？」→ 走 B。理由與代價寫在下面，**代價是單向的**：`1.3.0` 這個版號永久保留不用。

## 事實（2026-09-22 實測）

| 項目 | 值 | 怎麼知道的 |
|---|---|---|
| npm `dist-tags.latest` | **1.2.0** | `GET https://registry.npmjs.org/chinese-script-policy/latest` → `version: 1.2.0` |
| registry 上的版本 | **只有 1.2.0** | packument 的 `versions` 只有 `1.2.0`；`time` 只有 `1.0.0`／`1.1.0`／`1.1.1`／`1.2.0`（unpublish 過的版本仍會留在 `time`，所以「1.3.0 發過又刪掉」不成立） |
| 本機 `package.json` | **1.3.1**（已 bump、`dist/tradzh.html` 頁尾也是 v1.3.1） | 2026-09-22 由本 repo 的 session 備好 |
| git tag／Release | 最新的只有 `v1.2.0` | `git tag -l`、GitHub releases API |

## 兩個選項（B 已選）

| 選項 | 做什麼 | 狀態 |
|---|---|---|
| A：直接發 1.3.0 | 不改版號就發 | **未採用**（`1.3.0` 因此永久保留不用） |
| **B：bump 成 1.3.1 再發** | `npm version 1.3.1` ＋ 重建 `dist/tradzh.html` | **已選並已做完**（版號、頁尾、發布說明都跟著改） |

**出貨內容＝從 1.2.0 之後的全部改動**，所以**發布說明用 `PUBLISHING.md` §6 的 1.3.1 段**
（那一整段就是「1.2.0 → 現在」的差異），不要只寫某一項。

## 發布前（agent 已經做完的）

```powershell
npm test             # 十支子命令：八支 selftest ＋ test:repo（三軸掃自己）＋ test:cards（卡片守門）
npm run test:tarball # 打包 → 解開 → 在裡面再跑一次 npm test（發布才會出貨的那份）
npm run audit        # 字表稽核
npm pack --dry-run   # 61 檔（多了 cantonese-allow.json 與 tools/cards.mjs）
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
