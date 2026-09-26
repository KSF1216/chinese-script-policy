---
id: next-release-1.3.1
status: done
updated: 2026-09-26
verified_at: 2026-09-26T03:19Z
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
npm pack --dry-run   # 62 檔（多了 cantonese-allow.json 與 tools/cards.mjs；2026-09-22 再加 README.zh.md）
```

版號 bump（選項 B）屬於發布動作，等決定再一起做。

**2026-09-22 追加（同一版）**：`README.md` 改寫成**英文為主**（ds-harness-remote 那種節奏：
標題 → 一行說明 → 連結列 → Highlights → 安裝 → 各節），原本的中文原文搬成 **`README.zh.md`**，
兩邊開頭互相連結。發布說明已補在 `PUBLISHING.md` §6 的 1.3.1「文件」段；
`npm pack --dry-run` 因此 **61 → 62 檔**（npm 本來就會自動帶上根目錄的 `README*`）。

## 完成（2026-09-26）：已發布 **1.3.1**

**發布由使用者在自己的終端機完成**（agent 這邊必然 `EOTP`，證據留在下一節）。發布後逐項查證：

| 查證 | 值 | 怎麼知道的 |
|---|---|---|
| registry `dist-tags.latest` | **1.3.1** | `npm view chinese-script-policy version` |
| 已發布 tarball 的 `gitHead` | `9b653eb` | `npm view chinese-script-policy@1.3.1 gitHead` |
| 已發布 tarball 檔案數 | **62** | `npm view …@1.3.1 dist.fileCount`；`npm pack chinese-script-policy@1.3.1 --dry-run --json` |
| tarball 裡的兩份 README | **`README.md` 與 `README.zh.md` 都在** | 同上（逐檔列出） |
| git tag | `v1.3.1` → `9b653eb`（annotated、已推） | `git ls-remote --tags origin` |
| GitHub Release | **尚未建立**（這台沒有 `gh`，API 要 token） | body 已抽成檔案：`%TEMP%\chinese-script-policy-1.3.1-release.md`（＝`PUBLISHING.md` §6 的 1.3.1 段，9,249 bytes） |

**⚠️ 一個新事實（不記住的話，下一次會把成功誤判成失敗）**：npm 發布**成功**的長相是
`PUT 401` → 三段式驗證（`GET /-/v1/done` 每 0.2 秒輪詢，`202` ＝ 還沒按）→ 按下安全金鑰後 `GET … done` 回 **`200`**
→ CLI 印 **`Your package is being processed and may take a few minutes to become available`** → `PUT **202**`（不是 201）
→ **`exit 0` / `info ok`**。而**在那之後的幾分鐘內**，registry 查 `latest` 還是舊版、連 `…/1.3.1` 都回 **404**——
**那不是失敗，不要重發**（會撞 `EPUBLISHCONFLICT`）。本次實測：**03:16:08Z** 發布，**03:16:52Z** 與 **03:17:49Z** 查都還是
`1.2.0`／404，約 **03:19Z** 才變成 `1.3.1`。

### 保留：agent 這邊為什麼做不到（2026-09-26 實測）

| 查了什麼 | 得到什麼 |
|---|---|
| `npm whoami` | **`ksf1216`，exit 0**——token 是活的（不是 E401；2FA 只缺 OTP 那一步） |
| agent 跑 `npm publish` | **`EOTP`、exit 1**；tarball 有建起來，但驗證網址與 `authId` 都被遮蔽成 `***` → **沒有可轉貼給人按的東西** |

（兩次建的 tarball shasum 相同：`c2f2022e4618b7f0f05a275f5659e86c24b56496`——agent 那次建的與真正發布的是同一份。）

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
