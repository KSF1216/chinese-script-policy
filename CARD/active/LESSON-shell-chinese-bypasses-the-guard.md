---
id: lesson-shell-chinese-bypasses-the-guard
status: active
section: F
evidence: |
  `git tag -a v1.3.1 9b653eb -m "1.3.1：Windows 脚本档类型的写入守卫 + 英文 README（含 README.zh.md）"`  # simplified-example
  -> tag 物件 `e3c37cd` 帶著**簡體**推上 origin（`git ls-remote --tags origin` 就在那裡），
     而 `npm test`（含 `test:repo` 的三軸）與寫入 hook **都沒有任何反應**——它們看不到 shell 的參數。
  修法（同一輪實測）：`git tag -d v1.3.1` ＋ `git push origin :refs/tags/v1.3.1` ＋
  `git tag -a v1.3.1 9b653eb -F <UTF-8 檔>` ＋ `git push origin v1.3.1`
  -> 新 tag 物件 `f435f319…`，`git cat-file tag v1.3.1` 的註解是正確繁體。
  同類的高風險入口（中文只活在命令列參數裡）：`git commit -m`、`git tag -m`、`npm version`，
  以及任何 `-m`／`-Body`／`-Message` 參數。
new_rule_candidate: agent 不要在任何 shell 命令列裡直接打中文——一律先寫成 UTF-8（無 BOM）檔案，再用 `-F`／`-File` 承載，或走 write／edit 工具（那條路有 hook 在擋）。
updated: 2026-09-26
---

# 教訓：命令列裡的中文沒有守門（兩層防線都只掛在工具呼叫上）

## 症狀

**一段簡體中文被推上遠端，而所有檢查都是綠的**——包括這一包自己的三軸字表掃描。

## 根因

這一包的機械防線有兩層，而兩層都掛在**工具呼叫**上：DSH 外掛的 `tools/pre-execute`
與 Claude Code 格式的 `PreToolUse`，兩者都只看 `write`／`edit` 的**參數**。

`git commit -m "…"`、`git tag -m "…"` 這種「中文只活在 shell 命令列」的寫入，
**不經過任何一層**。而 `test:repo`／`npm run check` 掃的是**工作區的檔案內容**；
那段中文最後落在 **git 物件**（tag annotation／commit message）裡，不是檔案——
所以「掃描全綠」與「推出去的是簡體」可以同時成立。

## 規則

1. **命令列裡不要直接打中文。** 要寫中文訊息（commit、tag、任何 `-m`／`-Body`）就先寫成
   **UTF-8 無 BOM** 的檔案，再 `git commit -F <檔>`／`git tag -a <tag> -F <檔>`。
   （`-F` 順便解掉另一半：PowerShell 5.1 把非 ASCII 參數以 ANSI／cp950 傳給原生程式。）
2. **推出去之後，修法是把那個物件換掉**：tag 可以刪了重打（本輪就是這樣）；
   commit message 只能改寫歷史（`--amend`／rebase／force push）——**代價高一個數量級**，
   所以「打之前先檢查」比「事後補救」便宜得多。
3. **這一條沒有機械保證**（誠實記在這裡）：agent 真的把中文打進命令列時，沒有任何東西會擋。
   可以機械化的是「**事後掃描 commit／tag 訊息**」（`git log --format=%B`／`git tag -n` 逐條掃
   簡體專有字），這一條**還沒做**——要做就得先問值不值得（每個 repo 的歷史都要掃一輪）。

## 界線

- 這張卡是**紀錄**（`active`）：它回答「這裡發生過什麼」，不假裝已經被擋住。
- **寫入把關仍然是有效的**，只是它的守備範圍是「工具寫入的內容」——
  這一條補的是它的**邊界**，不是說它沒用。
