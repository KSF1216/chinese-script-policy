---
id: next-release-1.3.1
status: blocked
blocked_by: 使用者——(1) 決定要不要現在發（也可以再多攢幾項改動）；(2) 最後那一步 npm publish 必須由你在自己的終端機跑（非 TTY 環境會立刻 EOTP 失敗，而且印出來的網址會被遮蔽成 ***）
updated: 2026-09-20
acceptance: |
  npm test
  npm run audit
  npm pack --dry-run
---

# 發布 1.3.1（文件與守門類的 patch）

## 現況（2026-09-20）

`package.json` 目前是 **1.3.0**，版號**還沒動**——這張卡是等「要不要現在發」的決定。

這個版本裡會出貨的改動只有一項：`package.json` 多了一個 `test:docs` script（`tools\docs.mjs` 本身不在 `files` 白名單裡，不會出貨）。
所以這是**文件與開發守門類的 patch**，不是功能版。

## 發布前（agent 可以做）

```powershell
npm test          # 含 test:repo（用本套件的規範掃自己）與 test:docs（交接文件守門）
npm run audit     # 字表稽核
npm pack --dry-run
```

版號 bump 屬於發布動作，**等決定要發再一起做**（`npm version patch` 或手改）。

## 為什麼是 `blocked`

兩個都在使用者手上：**要不要現在發**，以及**最後那一步只能由人跑**（`npm publish` 在非 TTY 環境會直接失敗，
連要轉貼的網址都被遮蔽）。所以這張卡不是 `todo`——它不是「等人去做」，是「等一個決定」。

## 發布後要檢查的四個露出點

改了出貨檔案，四個地方**不會同時更新**：

| 露出點 | 時差 |
|---|---|
| 本機 | 立刻 |
| GitHub repo（含 `raw.githubusercontent.com`） | push 後立刻 |
| GitHub Pages | 約 20～40 秒 |
| **npm** | **只跟 tarball**——不重發就一直是舊版 |

另外：發布後立刻查 registry 若得到 404，那是 CDN 快取，別急著重發（會撞 `EPUBLISHCONFLICT`）。
