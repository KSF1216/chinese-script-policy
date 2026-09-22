---
id: verification-chinese-script-policy
status: active
acceptance: |
  npm test
  npm run test:tarball
  node tools\cards.mjs
facts: |
  `npm test`                          ->  10 個子命令全綠（8 支 selftest ＋ `test:repo` 的三條字表掃描 ＋ `test:cards`、當輪實測）
  `npm run test:tarball`              ->  PASS: the tarball a user receives passes the suite and ships no maintainer file
                                          ok the tarball holds no maintainer-only file (61 files, 1344 KB) ／ ok npm test passes inside the unpacked tarball
  `node tools\cards.mjs`              ->  cards: 4 card(s), 0 problem(s)
  `node scripts\api-selftest.mjs`     ->  PASS: every documented web-application entry point exists and both recipes agree (81 checks)
  `node scripts\web-selftest.mjs`     ->  PASS: the page converts exactly like the CLI, its UI works, conversions leave the original text alone, and the committed copy is not stale (170 checks)
  `node scripts\tradzh.js --dir .`    ->  RESULT: clean - no Simplified-only glyphs (2637 glyphs checked)
updated: 2026-09-22
---

# 驗證立場：chinese-script-policy 現在「驗到哪裡」是站著的說法

> 這一張不是逐輪紀錄（紀錄在下面指的檔案裡），而是**今天站在哪裡**：哪些面有指令釘住、哪些沒有。
> 內容變了改這裡，不要另開一張。

## 紀錄檔在哪

- 驗證紀錄 → `VERIFICATION.md`（每輪做了什麼、量到什麼、踩到什麼；含「未涵蓋」那一節）。
- 交接卡的歷史（做完的、作廢的）在 `CARD/done/`、`CARD/dropped/`；那些**不載入、不檢查**。
- 發布立場與版本事實是另一張：`CARD/active/PUBLISHING-chinese-script-policy.md`（它管「交到誰手上」）。

## 現在有機械在釘的面

| 面 | 用什麼釘 | 規模（當輪） |
|---|---|---|
| 轉換本體（繁→簡、簡→繁、語體、日文新字體三條軸） | `scripts/selftest.js` | 對固定案例逐條比對，全綠 |
| 字碼頁（cp950／GBK 來回） | `scripts/codepage-selftest.mjs` | 全綠 |
| CLI 契約（參數、輸出形狀、離開碼） | `scripts/cli-selftest.mjs` | 全綠 |
| 寫入前 hook（**只有 `exit 2` 會擋**） | `scripts/hook-selftest.mjs` | 全綠 |
| DSH 外掛（client half 自我註冊、settings 卡、寫入守衛） | `scripts/plugin-selftest.mjs` | 41 ＋ 34 ＋ 4 checks |
| 公開檔案不得出現機器特定路徑／專案名／模型名 | `scripts/api-selftest.mjs` | 80 checks（needle 來自未版控的 `.ship-deny.txt`） |
| 代理那條線（`examples/llm-proxy`） | `scripts/proxy-selftest.mjs` | 30 checks |
| 離線頁與 CLI 的轉換結果一致、頁面不陳舊 | `scripts/web-selftest.mjs` | 170 checks |
| 字表掃描（簡體殘留／粵語口語／日文專有字詞） | `npm run test:repo` | 2637 個簡體字；17 ＋ 30 ＋ 15 ＋ 3 條粵語；367 ＋ 123 條日文 |
| 交接卡（引用存在、狀態合法、孤兒卡、卡種齊全） | `node tools\cards.mjs` | 4 張活卡、0 問題 |
| **使用者真的收到的那一份**（tarball 解開再跑一次整套） | `npm run test:tarball` | 61 檔、1344 KB |

## 未涵蓋（沒在驗的，別假裝有）

- **`npm publish` 沒有被任何人跑過**：`package.json` 已是 `1.3.1`（2026-09-22 備好、頁尾也重建了），
  但 registry 上仍是 **1.2.0**——`1.3.0` 從未發布、永久不用。這不是測試能補的（它是人的動作），
  卡在 `CARD/blocked/NEXT-release-1.3.1.md`。
- **四個露出點不會同時更新**（本機／GitHub／Pages／npm）：測試只看得到本機那一份，
  「改了出貨檔案、別的地方還是舊的」在測試裡**沒有症狀**。
- **語意品質不在驗證範圍**：字表掃描只說「沒有簡體殘留、沒有粵語口語、沒有日文專有字詞」，
  **不能**說「這段繁體中文讀起來對」。轉換的自然度與用語偏好是否合用，只有人能判。
- **`third_party/` 的內容沒有獨立驗證**：只有授權檔與 `THIRD-PARTY-NOTICES.md` 的存在被檢查，
  上游改版不會有任何燈亮。
- **`.board/` 是外掛寫的本機產物**：掃描**刻意跳過**它（它天生含絕對路徑），所以它裡面有什麼這套驗證不背書；
  `test:tarball` 另外明文禁止它出貨（`MUST_NOT_SHIP_DIRS`）。
- **兩台機器沒有同步測試**：另一台的安裝與版本沒有機械在比對。

## 邊界

- 這一張是**立場**（現在的實況），不是逐輪的紀錄——逐輪的紀錄在 `VERIFICATION.md`。
- 裡面的數字是**當輪實測**；要主張「現在還成立」就重跑那一條指令。
- 補這一張的經過（2026-09-22）：它原本是產生器留下的**沒填過的骨架**（`TODO:` 佔位），
  被 `kind-coverage` 與佔位字檢查擋下之後才填成上面這一版。
