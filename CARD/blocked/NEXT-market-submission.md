---
id: next-market-submission
status: blocked
blocked_by: 使用者——投稿要動你的 GitHub 帳號（fork ＋ PR），而 `awesome-dsh-plugin` 的 CI 也要求 repo 至少 1 天舊（那條早就滿足）；決定「要不要投」與「用哪個帳號跑」都在你
updated: 2026-09-26
blocked_since: 2026-09-27T01:51Z
acceptance: |
  node tools\cards.mjs
  powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.dsh\dsh-market-submit.ps1" -DryRun
---

# 社群目錄投稿（`awesome-dsh-plugin`）

## 現況（2026-09-26 實測）

| 查什麼 | 結果 |
|---|---|
| 目錄檔 `data/plugins/KSF1216__chinese-script-policy.yml`（`main`） | **404**（還沒被收錄） |
| `awesome-dsh-plugin` 的 PR 清單（`state=all`，最近 20 筆） | **沒有任何一筆來自 `KSF1216`** → 沒有開過 PR，或已經被關掉 |
| 投稿腳本 | `~/.dsh/dsh-market-submit.ps1` 還在；`-DryRun` 可以完全離線跑完（會印出 entry 與 PR body） |
| 收錄條件 | repo ≥ 1 天（早就滿足）、分類 `skill`、`dsh-plugin` topic —— 詳見 `PUBLISHING.md` §7 |

## 為什麼是 `blocked`

投稿會在你的 GitHub 帳號底下 **fork ＋ 開 PR**，所以那一步只能由你（或你授權的憑證）跑；
agent 這邊能做的都做完了（entry 內容、PR body、乾跑驗證）。**不是「等人去做」，是「等一個決定」。**

## 要做的事

1. `-DryRun` 看一次 entry 與 PR body（不用連網、不會動任何東西）。
2. 真的投稿：拿掉 `-DryRun` 跑同一支腳本（它會 fork、寫檔、開 PR）。
3. 收尾（`installDocs` 那一課）：PR 開完把連結貼回這張卡，並更新 `PUBLISHING.md` §7 的狀態列。

## 界線

- **不要代改 `awesome-dsh-plugin` 的 `README.md`**：那份是生成的，改它會被 CI 退。
- 投稿內容要跟**已發布的版本**一致：現在 registry 是 **1.3.1**，所以 entry 若提到功能，
  要以 1.3.1 為準（不要寫「即將發布」）。
