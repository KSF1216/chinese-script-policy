# chinese-script-policy：驗證紀錄（開發資料）

> 這一份記的是「**被實際驗到什麼程度**」，不是使用說明。
> 看板上的 `VERIFICATION-*` 卡放的是**立場**（現在驗到哪、哪一塊沒驗），這一份是**逐輪的證據**。
> **立場是唯一來源**：要改「現在驗到哪」改卡片；這一輪的量測細節才寫這裡。

## 每一輪這樣記

| 欄位 | 說明 |
|---|---|
| 做了什麼 | 一兩句，讓下一輪不必從 diff 反推 |
| 實測數字 | 例如 `23/23`、`6 秒`、`56.2 MB`。**數字是那一輪的快照**，不是「目前」 |
| 故意弄壞 | 改壞 → 確認測試會紅 → 還原。證明那些數字是**檢查**，不是**宣稱** |
| 修掉的問題與教訓 | 換機或重裝時不必再踩一次 |
| 還沒做 | 每一項都指向一張卡（`NEXT-`／`OPEN-`），這份文件才不會變成第二份待辦清單 |

## 未涵蓋（為什麼有些面沒有機械在釘）

立場與完整清單在 `CARD/active/VERIFICATION-chinese-script-policy.md`；這裡只補「為什麼驗不了」：

- **`npm publish` 是人的動作**：測試再怎麼跑都不會證明它發生過。要主張「發出去了」只能**查 registry**
  （那條查詢與輸出寫在 `CARD/active/PUBLISHING-chinese-script-policy.md` 的 `facts`）。
- **四個露出點（本機／GitHub／Pages／npm）不同步**：自動測試只看得到本機那一份；
  「別的地方還是舊的」在測試裡沒有任何症狀。
- **語意品質**：字表掃描只證明「沒有簡體殘留／沒有粵語口語／沒有日文專有字詞」，
  不證明「這段繁體讀起來對」。轉換自然度與用語偏好合用與否只有人能判。
- **`third_party/` 的上游**：只有授權檔與 `THIRD-PARTY-NOTICES.md` 的存在被檢查，上游改版不會有燈亮。
- **兩台機器**（本機與另一台 ROG Ally X）沒有同步測試。
- **`.board/` 的內容**：看板外掛寫的本機產物，**天生含絕對路徑**，所以出貨掃描刻意跳過它。
  補救是兩條機械：`.gitignore` 必須列它（`test:api` 會驗這件事），`test:tarball` 明文禁止它出貨。

## 第一輪（2026-09-22）：接手 `docs*` → `cards*` 更名後的全面複核

**做了什麼**：另一個 session 把交接守門更名（舊名 docs 系列 → 現在的 cards 系列；
`HANDOFF_DOCS_CHECK` → `HANDOFF_CARDS_CHECK`，舊名只在 wrapper 的相容分支裡留著）並補上 `VERIFICATION-*` 卡種；
本 round 由**本 repo 的 session** 複核那份未提交的遷移，跑完整套，並補上三個複核時找到的洞（見下）。

**實測數字（2026-09-22 13:2x HKT，全部當輪實跑）**：

| 指令 | 結果 |
|---|---|
| `npm test` | 10 個子命令全綠（8 支 selftest ＋ `test:repo` ＋ `test:cards`） |
| `npm run test:tarball` | PASS；`61 files, 1344 KB`，解開後 `npm test` 也 0 |
| `node tools\cards.mjs` | `4 card(s), 0 problem(s)`（84 note、5 個 pattern 沒載到會印出來） |
| `node scripts\api-selftest.mjs` | 81 checks（本輪 +1：掃描跳過的目錄必須 gitignore） |
| `node scripts\plugin-selftest.mjs` | 41 ＋ 34 ＋ 4 checks |
| `node scripts\proxy-selftest.mjs` | 30 checks |
| `node scripts\web-selftest.mjs` | 170 checks（頁面與 CLI 一致、committed `dist` 不陳舊） |
| `npm run test:repo` | 2637 個簡體字；粵語 17＋30＋15＋3；日文 367＋123 |
| `npm run audit` | `RESULT: clean` |

**故意弄壞（每一條都確認會紅，然後還原並比對位元組／SHA-256）**：

| 弄壞什麼 | 結果 |
|---|---|
| `.gitignore` 拿掉 `.board/` | `FAIL everything the leak scan skips is also gitignored` |
| `PUBLISHING.md` 的 fallback 標題改名 | `FAIL … no install doc carries the fallback section` |
| `package.json` 的 `files` 加入 `CARD` | `FAIL maintainer-only file(s) in the tarball: CARD/…`（逐一列出七張卡） |
| `lib/client.js` 的 `IconChevronDownOutline14 ?` 改成 `null ?` | `FAIL when the host provides the UI primitives module …` |
| 拿掉卡片的 error boundary | `FAIL: browser half error: settings store unavailable` |
| 讓 `apply()` 的 catch 重拋 | `FAIL apply() must not let a broken host service escape` |

**修掉的問題與教訓**：

1. **`.board/` 沒被 git 忽略**（`git check-ignore` exit 1、`?? .board/`），而它含 14 條絕對路徑，
   **而且出貨掃描刻意跳過它** → 一次 `git add -A` 就會把 `C:\…` 推進公開 repo，掃描不會有任何反應。
   教訓：**「掃描跳過」與「git 忽略」必須成對**；現在 `test:api` 會驗這件事。
2. **`VERIFICATION.md` 是沒填過的骨架**（`TODO:` 佔位），而卡片把它當成「逐輪的證據」指向它——
   這就是這一節存在的理由。它也不在任何索引裡，所以順手補進 `PUBLISHING.md` §5。
3. **`installDocs` 沒接**：更名這種「裝完了」的動作，義務是「更新安裝文檔 ＋ 寫出 fallback」，
   而漏掉**沒有任何症狀**。補上 `tools\cards.config.mjs` 的 `installDocs` 之後，那兩件事變成紅燈。

**還沒做**：`npm publish`（`CARD/blocked/NEXT-release-1.3.1.md`；**決定已做成＝選項 B**，
1.3.1 已備好，只剩使用者在自己的終端機按下 publish）。本 repo 目前沒有 `OPEN-` 卡。

## 第二輪（2026-09-22）：備妥 1.3.1

**做了什麼**：使用者決定走「選項 B」（`1.3.0` 從未發布 → 改由 `1.3.1` 承載）。
bump 版號 → 重建 `dist/tradzh.html` → §6 發布說明改寫成 1.3.1（內容涵蓋 1.2.0 之後的全部改動）
→ 更新 PUBLISHING 卡的 `facts`、發布卡的決定與事實 → 重跑全套。

**實測數字**：`package.json` `1.3.1`、`dist/tradzh.html` 頁尾 `v1.3.1`；
`npm test` → 10 個子命令全綠（`test:web` 逐位元組比對重建後的頁面）；`npm run test:tarball` → PASS；
`node tools\cards.mjs` → 4 卡 0 問題；`npm run audit` → clean。

**故意弄壞**：這一輪沒有新增守門，所以只重跑了既有的破壞測試（`node tools\cards.mjs breaktest` → exit 0）。

**還沒做**：`npm publish`（人的動作）；發布後要 `git tag v1.3.1` ＋ GitHub Release（body 取 §6）
＋ 更新 PUBLISHING 卡的 `facts`（registry 查詢與輸出）＋ 把發布卡 `stamp`／`sync-folders` 移到 `done`。

## 第三輪（2026-09-26）：README 改英文為主、發布 1.3.1、結案

**做了什麼**：① `README.md` 改寫成**英文**（採 ds-harness-remote 的節奏，章節與原中文版一對一），
原本的中文原文搬成 `README.zh.md`、兩邊開頭互連，`cantonese-allow.json` 跟著放行新檔；
② 使用者在自己的終端機發布 **1.3.1**，本輪查證 registry 之後把發布卡結案
（`stamp` ＋ `sync-folders` → `CARD/done/`）；③ 結案讓 `breaktest` 的錨點失效，改指站著的 `PUBLISHING-*` 卡。

**實測數字（2026-09-26，全部當輪實跑）**：

| 查證 | 結果 |
|---|---|
| `npm view chinese-script-policy dist-tags.latest gitHead` | `latest = 1.3.1`、`gitHead = 9b653eb…`（發布時間 03:16:08Z） |
| `npm pack chinese-script-policy@1.3.1 --dry-run --json` | **62 檔**；`README.md` 與 `README.zh.md` **兩份都在**線上 tarball 裡 |
| `git ls-remote --tags origin` | `v1.3.1` → `9b653eb`（annotated、已推） |
| `npm test` | 10 個子命令全綠（`test:repo` 三軸、`test:api` 81 checks、`test:cards` 3 卡 0 問題） |
| `npm run test:tarball` | PASS；`62 files, 1356 KB`，解開後 `npm test` 也是 0 |
| `npm run audit` | `RESULT: clean`（Big5 可編的 35 字全在審核名單裡） |
| `node tools\cards.mjs breaktest` | 5 個案例全部 caught，還原後 exit 0（附三支檔案的 SHA-256） |

**故意弄壞**：`breaktest` 換錨點之後重跑一次，`missing reference`／`illegal status`／
`dependency on a missing card`／`orphan card`／`blocked card without blocked_by` 五條都確認會紅。

**修掉的問題與教訓**：

1. **發布成功被誤判成失敗——同一個坑第二次**。03:16:08Z 發布（log：`PUT 202` ＋ `exit 0` ＋ `info ok`），
   03:16:52Z 與 03:17:49Z 查 `latest` 還是 `1.2.0`、`GET /<pkg>/1.3.1` 回 **404**，約 **03:19Z** 才跳版；
   而 `PUBLISHING.md` §4 早就寫過這件事。本輪把實測時間補進去（「約一分鐘」→「約 1～3 分鐘」），
   判準改成**先看 log 的 `PUT 202` ＋ `info ok`，再等 registry**。
2. **整份 README 換語言時，被釘住的東西要一起搬**：`test:api` 逐檔要求 `README.md` 出現
   `2,637`／`3,083`／`367`／`123`，`test:repo` 的三軸會掃裡面的示範字例（簡體要
   `simplified-example`、日文要 `check-ok`）——英文版照樣要帶，漏了當場紅。
3. **`breaktest` 的錨點不可以綁在會結案的卡上**：發布卡一進 `CARD/done/`（歷史不載入），
   五個案例就同時失去意義。已改指站著的 `PUBLISHING-*`，並把「blocked 少了 `blocked_by`」
   改成「把活卡的 `status` 翻成 `blocked`」。
4. **命令列裡的中文繞過寫入守門**：我下 `git tag -a … -m` 時把註解打成了**簡體**（原文與實測在教訓卡裡），
   推到遠端才發現（tag 物件 `e3c37cd`），刪掉重打（改走 `-F <UTF-8 檔>`）才修好
   → `CARD/active/LESSON-shell-chinese-bypasses-the-guard.md`。

**還沒做**：**1.3.1 的 GitHub Release 還沒建**（這台沒有 `gh`、GitHub API 要 token；
發布說明已抽成檔案給人貼）。本 repo 沒有 `OPEN-` 卡。
