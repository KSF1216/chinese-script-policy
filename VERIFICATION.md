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

**還沒做**：`npm publish`（`CARD/blocked/NEXT-release-1.3.1.md`，等使用者決定發 1.3.0 或 1.3.1）。
本 repo 目前沒有 `OPEN-` 卡。
