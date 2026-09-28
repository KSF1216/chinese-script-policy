---
id: next-dsh-0-1-7-port
status: done
acceptance: |
  node scripts\plugin-selftest.mjs
  npm test
  npm run test:boot
  npm run test:tarball
updated: 2026-09-28
verified_at: 2026-09-27T23:59Z
---

# DSH 0.1.7 移植：設定卡從 `settingsScope` 搬到 `configForms`，宿主半側改用 volatile `Config`

## 為什麼（使用者回報的故障）

使用者 2026-09-28 把 DSH 更新到 **0.1.7-rc.2** 之後啟動 DSH，看到：

```
chinese-script-policy: pending (waiting for service: settingsScope)
```

然後**整個 Web GUI 起不來**，只能把外掛從 `web` profile 移除才恢復。

### 根因（兩層，而且嚴重程度不同）

| 層 | 判定 | 後果 |
|---|---|---|
| **宿主** | 模組層 `inject` 有服務沒有 impl → 整個 entry 被 park（`apply()` 完全不執行） | 啟動稽核只印 **warning**（`chinese-script-policy` 不在必要清單裡）→ DSH 照樣啟動，但**寫入守衛無聲失效** |
| **瀏覽器** | 同上，但 client 的啟動稽核對任何非 active 的模組**直接 throw**（`web boot: N entries did not activate`） | **整個 GUI 載入失敗**——這才是使用者看到的「啟動有問題」 |

舊 API 在 0.1.7 **被完全移除**（全安裝 grep：`settingsScope` 0 命中、`installSection` 0 命中）：

| 舊（0.1.6） | 新（0.1.7） |
|---|---|
| `ctx.settings.installSection(ctx, ns, schema, config, { setSource, onChange })` | 匯出 `Config`（schemastery，每個欄位 `.volatile()`）；值用 `config.<field>.get()` |
| client `ctx.settingsScope.bind({ namespace })` | `ctx.configForms.get(entryId)`（**entryId ＝ profile entry id ＝ settings namespace**） |
| slot `settings.plugin.item`（keyed） | slot `plugins.item`（list：`id`／`order`／`label`），並用 `ctx.configForms.whileServed([ns], …)` 包住 |
| 設定存 `~/.dsh/settings.yaml` | 存 **active profile 的 `cordis.patch.yml`**；`settings.yaml` 已被一次性匯入改名為 `settings.yaml.imported` |

## 做了什麼

| 檔案 | 改動 |
|---|---|
| `index.mjs` | `import z from '@deepseek-ai/schemastery'`；`export const Config = z.object({…六個欄位全部 .volatile()…})`（`script` 的 union 保留舊版布林拼法，否則舊 profile patch 會在啟動時驗證失敗、守衛整條死掉）；刪掉 `SECTION_FIELDS` 與手寫 descriptor；`apply` 移除 `installSection`，改成 `ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))`；守衛**每次要用時才 `.get()`** |
| `lib/client.js` | `inject` → `['slots','locale','configForms']`；`ctx.configForms.get('chinese-script-policy')`＋`subscribe` 讓卡片跟著已接受的值重畫；儲存改成**一次原子 `mutate(ops, revision)`**（只送有改的欄位）；註冊進 `plugins.item`（`id`／`order:100`／`label`）並用 `whileServed` 包住；元件改吃 `props.view`（`summary` 回一行字、`page` 回表單） |
| `package.json` | 加 **`peerDependencies: { "@deepseek-ai/schemastery": "~3.18.4" }`**——linked 安裝（`dsh plugin add <本目錄>`）靠 DSH 的 linked-root peer-aware ancestor lookup 解析 harness 自己的 schemastery，**不宣告就是宿主半側載入失敗**；`dsh.client.inject` 的 `dsh-client-ui-slots` → `dsh-client-ui-plugin-manager`（`plugins.item` 的宣告者）；版號 → `1.4.0`；新增 `test:boot` |
| `scripts/plugin-selftest.mjs` | 舊 API 的假 ctx 全部換掉；**新增兩條守門**：①client `inject` 的每個名字都必須在**釘住的 0.1.7 client 服務清單**裡（這條就是這次故障的守門）②volatile 契約（`Config` 六欄都 volatile、`toJSON()` 可序列化、schema 預設值＝`resolveSection` 預設值、舊布林仍可驗證、未宣告的值要被拒）；另加「開卡片→改設定→按儲存」的實際驅動，斷言**一次 mutate、帶讀到的 revision、只帶改動的欄位**。測試用 `module.registerHooks` 把 `@deepseek-ai/schemastery` 導到 harness 的那一份（＝DSH 自己做的事） |
| `dev/dsh-boot-check.mjs` | **新增**：起一個丟棄式 DSH（自己的 `$DSH_HOME` 與 port，完全不碰使用者的 `~/.dsh`），驗三件事——宿主啟動沒有任何 entry pending／failed、`settings/describe` 真的服務我們的 namespace、頁面載入的 client bundle 整包可執行且我們的模組有註冊 |
| `.gitignore` | `.tmp/`（探針與暫存 DSH home 的落腳處；裡面有絕對路徑） |

## 證據

### 端對端（`node dev/dsh-boot-check.mjs`，2026-09-28）

```
ok   the instance listened on 3099
ok   no entry was parked or failed at boot
ok   the page lists our client module (65 modules in total)
ok   fetched and ran 68 bundle(s), 22404114 bytes, 130 module registration(s)
ok   every bundle evaluated and our module instantiated
ok   our module registered: inject=["slots","locale","configForms"]
ok   settings/describe -> 19 namespace(s)
ok   the host serves chinese-script-policy
ok   the write landed in the profile patch (…/profiles/web/cordis.patch.yml)
ok   the written value reads back (mode=warn, revision 1)
ok   a stale-revision write is refused
PASS
```

`settings/describe` 回傳的我們那一節是 `"autoGenerate":false`（`configure({auto:false})` policy 生效）＋六個欄位的 schema。

**第 4 項是實際寫入**：用**卡片同一條 RPC**（`settings/mutate`，帶 `ns`／`ops`／`expectedRevision`）改一個欄位，
再從兩個地方讀回來——API 的 `settings/describe`（`mode=warn`、revision 1）與**磁碟上的
`profiles/web/cordis.patch.yml`**（真的長出一列 `- id: chinese-script-policy` 帶六個值）。
也順便證明 **revision 柵欄有效**：拿寫入前的舊 revision 再送一次會被拒。檢查完會把值還原。

### 故意弄壞（三次，全部先備份、事後 SHA-256 比對一致）

| 弄壞什麼 | 結果 |
|---|---|
| 宿主 `inject` 加一個沒有 impl 的服務 | **紅**：`the host reported inactive entries` ＋ namespace 不再被服務（**守衛無聲死亡**的形狀） |
| 拿掉 `export const Config` | **紅**：宿主啟動乾淨，但 `the host does not serve the chinese-script-policy namespace`（設定卡永遠不會出現） |
| client `inject` 改回 `settingsScope`（原故障） | **紅**：`the browser half injects a service this DSH client does not provide (the whole GUI would fail to boot): ["settingsScope"]` |

三次還原後檔案 SHA-256 與弄壞前相同（`index.mjs` = `5D6B2383…`、`lib/client.js` = `2DC9EE3C…`）。

### 測試（當輪實測）

`node scripts/plugin-selftest.mjs` → 守衛 **43/43**、設定卡 **44/44**、settings schema **14/14**｜
`npm test` → **exit 0**（`test:plugin`／`api` 81 項／proxy 30／web 170／`test:repo`／`test:cards` 全過）｜
`npm run build:web` ＋ `node scripts/web-selftest.mjs` → 170 項全過（離線頁的頁尾版本號已跟著 1.4.0 重建）｜
`npm run test:tarball` → PASS（64 檔）｜`npm run audit` → `RESULT: clean`。

### 又抓到一次「checkout 會過、使用者拿到的那份不會」

第一次跑 `npm run test:tarball` 是**紅的**：`FAIL every script npm may run is shipped
(18 entry point(s)) <- dev/dsh-boot-check.mjs`——`package.json` 新增的 `test:boot` 指到一個
**不在 `files` 白名單裡**的檔案，所以裝了這個套件的人跑 `npm run test:boot` 會 `MODULE_NOT_FOUND`。
修法是把那一支**加進白名單**（它只依賴 Node 內建模組，自足）。
不是新守門抓到的，是**既有**那條「每個 npm 會跑的入口都要出貨」抓到的——它一直都在，只是這次才踩到。

## 已知限制（沒解決、要留著）

- **`plugins.item` 的 `props.form` 沒有用**：官方四個頁面都無視它、自己 `configForms.get(ns)`，所以本卡照做。型別上它是 optional，依賴它會在某些組合下拿到 `undefined`。
- **其他 client 模組的 instantiation 不判紅**：`dev/dsh-boot-check.mjs` 只用 stub 的 `require` 實例化**我們自己的**模組。用 stub 實例化別人會產生假失敗（實測 6 個官方模組會死在 `react.memo is not a function`，那是 stub 的錯不是模組的錯），把別人的假失敗算進來就是一個沒人信的守門。
- **`project-discipline-board` 有同一個病**（`exports.inject` 仍寫 `settingsScope`、宿主半側仍用 `settings.installSection`）。它屬於 `AIPMSkills` 那個工作區，**沒有**在這張卡裡動。
- **`compatibility.json`／版本准入沒有用到**：本套件不對 `@deepseek-ai/dsh-*` 宣告 peerDependencies，所以不會觸發新版 DSH 的版本拒絕；`schemastery` 不在比對範圍內（實測）。
