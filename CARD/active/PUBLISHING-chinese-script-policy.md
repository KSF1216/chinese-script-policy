---
id: publishing-chinese-script-policy
status: active
acceptance: |
  node tools\cards.mjs
  npm test
  npm run test:tarball
  npm run audit
  npm pack --dry-run
facts: |
  `npm view chinese-script-policy version` -> 1.2.0（2026-09-20 21:0x HKT 實測；packument 的 versions 只有 1.2.0、time 也沒有 1.3.0）
  `git tag -l` -> v1.0.0, v1.2.0（最新 tag 是 v1.2.0；本地 package.json 已是 1.3.0＝**未發布**）
  `curl -s https://ksf1216.github.io/chinese-script-policy/dist/tradzh.html` -> 頁尾 v1.3.0（Pages 跟 repo，不跟 npm：**兩個出口現在不同版**）
  `(Get-Item "$env:USERPROFILE\.dsh\skills\chinese-script-policy").LinkType` -> Junction（本機 DSH 直接吃工作區，不是安裝副本；`web` 與 `headless` 的 `link:` 都指到它）
  `node tools\cards.mjs board` -> project／publishing／verification 三張 active ＋ 1 張 blocked（發布卡）
updated: 2026-09-22
---

# 發布立場：chinese-script-policy 出到哪裡、現在「已發布」是什麼意思

## 這一張放什麼、不放什麼

**只放機檢得動的兩樣**：**驗收指令**（`acceptance`）與**事實欄**（`facts`）。
流程、2FA 的三段式互動、四個露出點、`description` 長度上限那些**散文**在 `PUBLISHING.md`——
那裡是完整的立場，這一張**不重述**（重述就會有兩份會各自漂）。

## 路由

| 出口 | 內容 | 重新載入方式 |
|---|---|---|
| **npm**（主要） | 套件本體：plugin／skill／CLI／資料表 | 安裝即生效；**文件類改動只有重發才會更新** |
| **GitHub** | repo ＋ topics（上限 20）；About 是另一個 350 上限 | push 後立刻（含 `raw`） |
| **GitHub Pages** | 離線網頁 `dist/tradzh.html` | push 後約 20～40 秒自動重建 |
| **本機 DSH** | `~/.dsh/skills/chinese-script-policy` 是指向本 repo 的 **junction**；`web` 與 `headless` 兩個 profile 都用 `link:` 指向它，並列在 `dsh.profile.bundles` | 宿主那半（`index.mjs`）要**重啟 profile**；瀏覽器那半（`lib/client.js`）每次請求即時產生，**重新整理頁面**就有 |

**怎麼發**（版號、`npm publish` 的三段式、快取、發布後要更新的東西）寫在 `PUBLISHING.md` §4 的一頁式 runbook。

## 為什麼這一張**必填** `facts`

2026-09-20 的事故：一張 front matter 完整、`blocked_by` 也寫了、索引列到了、
`docs-check` 印 **0 problem** 的發布卡，前提是「**1.3.0 已發布**」——
而 registry 上 `dist-tags.latest` 是 **1.2.0**，**1.3.0 從來沒有發布過**。
**形狀全綠，事實全錯。**

所以：**要發版、或要說「已經發了」之前，先把上面那條查詢重跑一次並更新它的輸出**——
不要憑印象改這個欄位。`facts` 沒有反引號指令會被檢查器擋下（那是宣稱，不是事實）。

## 邊界

- **`npm publish` 那一步必須由使用者在自己的終端機跑**：非 TTY 環境會立刻 `EOTP` 失敗，
  而且印出來的網址會被遮蔽成 `***`。agent 只能把前置備好（版號 → 重建產物 → `npm test` →
  `npm run audit` → `npm pack --dry-run`）並把查詢與輸出寫回這一張的 `facts`。
- 文件類小修**攢一攢再一次發**：本機／GitHub／Pages／npm 四個露出點不會同時更新。
