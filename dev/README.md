# dev/：開發用探針（不隨套件出貨）

這裡的東西**不是套件的一部分**——`package.json` 的 `files` 白名單沒有收 `dev`，
所以它不會進 npm tarball。留著是為了讓文件裡的數字**可重現**，而不是只能相信文字。

| 檔案 | 做什麼 | 怎麼跑 |
|---|---|---|
| `gaps.mjs` | 拿 196 組「簡體詞 → 正確繁體詞」去問 CLI，只列出**現在的表還會答錯**的那幾組——那些就是本地修正表的來源 | `node dev/gaps.mjs` |
| `measure-tw.mjs` | 量用語偏好層的實際行為：`--wording` 開與不開的差別，以及哪些詞**刻意不換**（同一個詞或語意差異） | `node dev/measure-tw.mjs` |
| `legacy/mktwfix.mjs` | **歷史檔，不要跑。** 2026-09 用它把用語偏好 fixture 寫進 `scripts/selftest-cases.json`；它寫的還是舊鍵名，重跑會蓋掉現在的 fixture，只留作當時怎麼寫的紀錄 | — |

兩支探針都**以自己所在的 repo 解析路徑**（`dev/` 的上一層），所以任何 clone 都能直接跑。

**為什麼這裡的檔案沒被 `npm test` 的三軸檢查擋下**：這些探針的測資**本身就是簡體**
（跟 `scripts/selftest-cases.json` 同性質），所以 `.tradzhignore` 針對
`**/chinese-script-policy/dev/**` 放行——刻意綁專案自己的目錄名，
而不是 `**/dev/**`，因為那份設定會**隨工具出貨**，不能讓使用者的 `dev/` 被靜默跳過。
