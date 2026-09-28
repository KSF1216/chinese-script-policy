# 接進 harness：三種寫入把關裝法的細節（從 README 搬過來）

> 決策與訊息都來自同一個 scripts/lib.js 的 guardInspect／guardMessage，
> 差別只在「怎麼接上 harness」。完整設定、hooks.json 內容與替代做法在這裡。

## 寫入檢查：三種安裝方式

寫入前的檢查是**同一個決策**（`scripts/lib.js` 的 `guardInspect`：同一組軸、同樣的例外、同樣的訊息），
只是接進 harness 的方式不同：

| 裝法 | 適合誰 | 開關與設定 |
|---|---|---|
| **DSH 外掛（建議）** | DSH | 側邊欄 **Plugins 頁**（`plugins.item` slot）的「中文用字規範」設定卡：啟用、**腳本三選一**（要求繁體／要求簡體／不檢查）、語體與日文開關、擋下／只警告、Windows 腳本檔類型，**存檔立刻生效**（不必重啟——那些欄位是 volatile，改動寫進執行中的設定參考物件，外掛不會重新掛載） |
| **Claude Code／其他 harness** | Claude Code，或支援同一 hook 協定的 harness | 用本套件的 `hooks.json`（`PreToolUse` ＋ matcher `write\|edit`） |
| **不支援 hook 的環境** | 其他任何環境 | 寫完自己跑 `node scripts\tradzh.js <檔案>` 複查，並把規範寫進系統提示 |

### DSH：裝成外掛（一個指令）

```powershell
dsh plugin --profile web add C:\path\to\chinese-script-policy
```

這會做兩件事：把本套件加成 profile 的相依（`link:`），並把 `chinese-script-policy`
加進 `dsh.profile.bundles`。外掛列由**本套件自己的** `cordis.patch.yml` 帶進來，
那一列同時負責：

- 用 `ctx.skills.register()` 註冊技能（不必把目錄複製到 `$DSH_HOME/skills/`）；
- **自己**攔 `tools/pre-execute` 做寫入檢查——不必再掛任何 hook 橋接器，
  profile 也不會多出別人的列。

那一列的 `id: chinese-script-policy` 在 0.1.7 是**設定 namespace 本身**：GUI 的設定卡就是拿這個 id
去問宿主「這條 entry 的表單在哪」（`ctx.configForms.get('chinese-script-policy')`），所以**這個 id 不能省**
——row 沒寫 `id` 的話 loader 會給一個隨機值，表單永遠定位不到。

**裝一次只影響一個 profile。** 每個 profile 有自己的 `dsh.profile.bundles`，
所以 `web` 與 `headless` 要**各裝一次**（只換 `--profile`）：

```powershell
dsh plugin --profile headless add C:\path\to\chinese-script-policy
```

**`headless`（無頭：跑一個任務、印出結果就結束）沒有 GUI**，所以設定卡在那裡沒有意義，
開關改寫在那個 profile 自己的 `cordis.patch.yml`（下一節有三層的完整對照）。守衛本身照常運作，
因為它跑的是同一條 `tools/pre-execute`；2026-09 實測：headless 下寫入含簡體字的內容被擋下、
檔案未被建立。無頭也用不到瀏覽器那半（`lib/client.js`）——`package.json` 的 `dsh.client`
已宣告 `platform: "web"`，而無頭的殼完全不碰 client 模組。

**想確認「真的裝起來了」**，除了看 GUI，還有一條不必開瀏覽器的端到端檢查（`dev/dsh-boot-check.mjs` 是出貨檔案之一）：

```powershell
node dev\dsh-boot-check.mjs            # npm run test:boot 是它的別名
```

它起一個**丟棄式** DSH（自己的 `$DSH_HOME` 與 port，完全不碰你的 `~/.dsh`），依序驗三件事：
宿主啟動時**沒有任何 entry pending／failed**、`settings/describe` **真的服務我們的 namespace**、
以及頁面載入的 client bundle **整包可執行、而且我們的模組有註冊自己**。
`--keep` 保留暫存目錄，`--url http://127.0.0.1:3099 --home <暫存 home>` 則接上一個已經在跑的實例。

### 0.1.7 的 API 形狀：兩半各改了什麼

舊的設定 API 在 0.1.7 **被整個移除、沒有相容層**（全安裝 grep：`settingsScope` 0 命中、
`installSection` 0 命中），所以這一節對照的是「哪一種寫法在哪一版活著」：

| 位置 | 舊（0.1.6） | 新（0.1.7） |
|---|---|---|
| 宿主半側宣告設定 | `ctx.settings.installSection(ctx, ns, schema, config, {…})` ＋ 手寫 descriptor（`toJSON()`／`type`／`dict`） | `export const Config = z.object({…})`（`@deepseek-ai/schemastery`），**六個欄位全部 `.volatile()`** |
| 要不要自動生成表單 | 由 `installSection` 決定 | `ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)))`——「我自己有頁面，不要幫我生成表單」。它在**選用的** `ctx.inject` 子情境裡，所以沒有 `settings` 服務時外掛照常跑；**`settings` 絕不可以寫進模組層 `inject`**（服務缺席時整個外掛被 park） |
| 讀值 | 區塊物件 | `config.<欄位>.get()`，**每次要用時才讀**（見下面 volatile 那段） |
| 瀏覽器半側的服務 | `ctx.settingsScope.bind({ namespace })` | `ctx.configForms.get(<profile entry id>)` |
| 表單的位址 | keyed slot `settings.plugin.item` | list slot `plugins.item`（`id`／`order`／`label`），並用 `ctx.configForms.whileServed([namespace], …)` 包住——宿主沒服務這個 namespace 時，**整張卡不會註冊** |
| 註冊的元件 | 不收 props | 收 `props.view`：`'summary'` 回**一行字**（卡片折疊時那行），`'page'` 回**整張表單** |
| 寫入 | 逐欄位 `set()`／`unset()` | **一次原子** `mutate(ops, revision)`；卡片用 `subscribe()` 跟著已接受的值重畫 |
| client 的 `inject` | `['slots', 'locale', 'settingsScope']` | `['slots', 'locale', 'configForms']`——**寫錯一個名字不是只少一張卡**：瀏覽器的啟動稽核對任何非 active 的模組直接 throw（`web boot: N entries did not activate`），**整個 GUI 起不來**。守衛無聲失效是宿主那一半，兩邊要分開查 |

### 為什麼 linked 安裝一定要宣告 peerDependencies

本套件的宿主半側（`index.mjs`）要 `import z from '@deepseek-ai/schemastery'` 才宣告得出 `Config`
（0.1.7 的設定表單就是從那個 schema 投影出來的），而 `dsh plugin --profile <名> add <本目錄>`
裝的是 **`link:` 相依**：Node 用 realpath 解析 bare import，連結過去的目錄與它的上層都**沒有**
`node_modules`。DSH 的 linked-root peer-aware ancestor lookup **只認宣告在 `package.json` 的 peer 名**
（而且那個名字要在它的 runtime table 裡），所以
`"peerDependencies": { "@deepseek-ai/schemastery": "~3.18.4" }` 是**必要條件，不是禮貌**——
少了它，宿主半側載入失敗、那一列進不了 active，**寫入守衛無聲死掉**（技能也一起不見）。
版本准入只比對 `@deepseek-ai/dsh` 與 `@deepseek-ai/dsh-*`，所以宣告 schemastery 不會被拒絕。

### 設定的三個層級：哪一層是全域、哪一層不是

「這個專案存哪一種寫法」（`script`）是守衛自己的設定，但它跟**放行規則**不在同一層。
0.1.7 的設定表單**以 profile entry id 當 namespace**，寫入落在那個 profile 的 patch 檔，
所以**每一層的範圍都跟 0.1.6 不同**：

| 層 | 誰寫的 | 範圍 | 內容 |
|---|---|---|---|
| **基底層**（bundle 那一列的 `config`） | 本套件自己的 `cordis.patch.yml`（隨套件出貨） | **每個 profile 一份**（每個 profile 各載入一次這個組合包） | 六個開關的預設值 |
| **profile 層**（設定卡） | GUI 按「儲存」→ `$DSH_HOME/profiles/<名>/cordis.patch.yml` 裡 `chinese-script-policy` 那一列 | **每個 profile 一份**（`web` 與 `headless` 各存各的） | 蓋掉基底層的值 |
| **放行層** | 工作區根目錄的 `.tradzhignore`、`cantonese-allow.json` | **每個工作區一份** | 哪些檔案／行跳過檢查 |

> **⚠️ 這一節跟 1.3.x 的說明相反，值得說清楚。** 舊版（DSH 0.1.6）的設定卡寫的是
> `$DSH_HOME/settings.yaml` 的 `chinese-script-policy:` 區塊，那是**全機器一份**。0.1.7 把那份文件
> **一次性匯入**後改名成 `settings.yaml.imported`（每個 section 寫進**同名 entry** 的 profile patch；
> 被執行中的組合拒絕的 section 只留在改名後那一份裡），從此設定住在 **profile 的 patch**。
> 所以升級之後：**在 GUI 改開關只影響你正在跑的那個 profile**，`headless` 不會被連帶改掉——
> 反過來說，**要讓兩個 profile 一致就得各改一次**。

**守衛已經有「每個工作區一份」的機制**，就是上表的放行層（讀的是**執行時 cwd**），只是目前只用在「放行」。
要讓「軸」也每工作區一份，得讓守衛在**每次攔截時**讀工作區裡的一個設定檔（讀不到就回退到 profile patch 的值），
並在卡片上說明「這個工作區被覆寫」——那是功能變更，**尚未實作**。

**值存在 profile patch，為什麼改了不必重啟**：`Config` 的六個欄位全部 `.volatile()`，
loader 收到變更時**不重跑 `apply()`**，而是把新值寫進**同一批參考物件**再發
`loader/volatile-update`。這正是守衛**每次要用時才** `config.<欄位>.get()` 的原因：
若在 `apply()` 期間把值快取起來，開關就被凍結在啟動那一刻（改了看起來有生效、其實沒有）。
瀏覽器那半也是同一個模型：卡片用 `ctx.configForms.get(entryId)` 拿到的表單會 `subscribe()`，
並用**一次原子** `mutate(ops, revision)` 把改動過的欄位送出去（帶上讀到的 revision，
所以別人同時改過會被拒絕，而不是半套寫入）。

列的 `config` 是開關的**基底層**，預設值同時宣告在 `index.mjs` 的 `Config`（schema 預設）
與 `resolveSection`（純函式，給測試與只拿得到原始 YAML 的呼叫者用），兩邊由 `test:plugin` 釘住一致：

```yaml
# 這一段就是本套件出貨的 cordis.patch.yml（基底層）；設定卡改的值不是寫回這裡，
# 而是寫進 profile 自己的 cordis.patch.yml（$DSH_HOME/profiles/<名>/cordis.patch.yml）。
- id: chinese-script-policy
  name: chinese-script-policy
  config:
    enabled: true            # 整個寫入檢查的總開關
    mode: block              # block（擋下）或 warn（只警告，仍然寫入）
    script: traditional      # 這個專案存哪一種寫法：traditional / simplified / off
    register: true           # 粵語口語（語體）
    japanese: true           # 日文專有字詞
    fileTypes: warn          # Windows 腳本檔類型（.ps1／.cmd）：off / warn / block
```

`fileTypes` 是**另一種規則**：上面幾條看的是「內容裡的中文」，這一條看的是**檔案類型**——
`.ps1` 寫入含非 ASCII 的內容會是語法錯誤，`.cmd`／`.bat` 則有 ANSI 與 LF 的坑
（規則本身在 `SKILL.md` 的〈檔案類型陷阱〉，成因與實測在 `references/encoding.md`）。
它**預設只警告**：作用域是別人的檔案，預設擋會讓沒聽過這個套件的人一頭霧水；
`block` 也只對真的會壞的 `.ps1` 生效，`.cmd`／`.bat` 永遠只警告。細節見下節。

`script` 是**三選一**而不是勾選框，因為「哪一種寫法才是對的」取決於專案：

| 值 | 行為 |
|---|---|
| `traditional`（預設） | 抓到**簡體專有字**就處理，訊息請模型改回繁體 |
| `simplified` | 抓到**繁體專有字**就處理，訊息請模型改成簡體；日文新字體的對照也會給**簡體**寫法（`発 -> 发`）<!-- check-ok --> |
| `off` | 不檢查腳本軸，只查語體與日文 |

（舊版 1.0～1.1 把這裡存成布林：`true` ＝ `traditional`、`false` ＝ `off`。那個 profile patch 現在可能
還躺在 `$DSH_HOME/profiles/<名>/cordis.patch.yml` 裡，所以 `Config` 的 `script` union **刻意保留這兩種
布林拼法**——schema 若直接拒收，那一列會在啟動時驗證失敗，等於整條守衛無聲消失。）

### 檔案類型陷阱：`.ps1`／`.cmd` 的寫入（`fileTypes`）

這一條**不是中文軸**：上面幾條看的是「內容裡的中文」，它看的是**寫入的檔案類型**。
判準很窄，只有兩格會成立：

| 目標 | 什麼時候成立 | 天生嚴重度 |
|---|---|---|
| `.ps1`／`.psm1` | 內容含**任何非 ASCII 字元** | **擋下**（真的會壞：寫入工具一律寫「UTF-8 無 BOM」，而 PowerShell 5.1 用 ANSI 讀 `.ps1`） |
| `.cmd`／`.bat` | 內容含非 ASCII 字元 | 只警告（實測仍能跑，只是換一台機器會亂碼） |
| `.cmd`／`.bat` | **只有 LF、沒有 CRLF** | 只警告（`goto` 會跳錯標籤、`set /p` 讀成空值） |

`fileTypes` 三選一：`off`（不檢查）／`warn`（**預設**，一律只警告）／`block`
（照上表的「天生嚴重度」——所以 `block` 只會讓 `.ps1` 真的被擋，`.cmd` 永遠只警告）。

三個刻意設計：

1. **預設 `warn`**：這條規則的作用域是**別人的機器、別人的檔案**，預設擋會讓沒聽過這個套件的人一頭霧水。
2. **只看寫入，不掃描既有檔案**：它判斷的是「即將寫入的內容」，不是磁碟上已有的檔案——
   別人既有的 UTF-16 或帶 BOM 的腳本不會被碰。
3. **fail-open**：與其他守衛同一個原則——判斷函式丟錯就放行，`fileTypeTrap` 對空路徑、
   非字串內容一律回 `undefined`。

**純 ASCII 的腳本永遠不會觸發**（最常見的情況沒有誤報）。反向案例的情況值得講清楚：
「UTF-16 或帶 BOM 的 `.ps1` 能跑」是真的（實測見 `references/encoding.md`），但那是**既有檔案**的性質；
這個守衛看到的是**解碼後的字串**，而寫入工具一律寫「UTF-8 無 BOM」，所以「含非 ASCII 就要擋」
在**寫入**這一刻是正確的判準（在掃描既有檔案時才會變成誤報機器——這正是它不掃既有檔案的原因之一）。
`scripts/plugin-selftest.mjs` 因而改釘**行為**：純 ASCII 放行、`.md`／`read` 不觸發、
`.cmd` 的 `block` 仍只警告、CRLF 放行而純 LF 觸發。

> **目前只有 DSH 外掛有這個開關**：`hooks.json`（Claude Code 格式）那條路只跑
> `guardInspect`，不含檔案類型規則。要一致就得在 `pre-write-check.js` 也接上，
> 但那裡沒有設定檔可讀（hook 的環境沒有 `$DSH_HOME`，見上），所以先留在外掛。

### Claude Code／其他 harness：用 `hooks.json`

`hooks.json` 是**Claude Code 的 hook 協定格式**（`PreToolUse` ＋ matcher `write|edit` ＋ exit 2），
接進支援這個協定的 harness 即可。指令寫成
`node "${CLAUDE_PLUGIN_ROOT}/scripts/pre-write-check.js"`，所以那個代換要對得上
（Claude Code 把它當 plugin 安裝時會自己代換 `${CLAUDE_PLUGIN_ROOT}`）。

> **⚠️ 不要在 hook 指令裡用 shell 變數**（`$DSH_HOME`、`%USERPROFILE%` 都一樣）。
> hook 的環境沒有定義它們 → 展開成空字串 → node 找不到檔案而 **exit 1** →
> 但只有 **exit 2** 會擋，於是寫入照樣通過：**裝了，卻無聲失效**。
> 這是實際踩到的（2026-09），`scripts/hook-selftest.mjs` 現在會用真的 shell ＋
> 空環境跑一次指令來防它。

> **為什麼 DSH 不再走這條路**：hook 是**另一個行程**，指令、環境、路徑任何一環錯了都會
> 無聲失效（上面那個坑就是）；外掛的守衛跑在同一個 process 裡，讀的是同一份 `lib.js`，
> 還有 GUI 可以開關。DSH 就用外掛。

怎麼確認「真的有在跑」（只知道掛上去是不夠的）：

| 看哪裡 | 正常 | 壞掉 |
|---|---|---|
| 寫入含簡體字的檔案 | 被擋下，訊息 `BLOCKED by chinese-script-policy…` | 檔案直接寫成功 |
| 外掛那一列 | `dsh --profile web --dump-config` 看得到 `id: chinese-script-policy` | 只剩 bundle 清單裡的名字，沒有列 |
| 宿主啟動輸出 | 沒有這一列的訊息 | `chinese-script-policy: pending (waiting for service: …)` 或 `did not activate`／`startup failed` → **那一列的 `apply()` 完全沒跑**，守衛與技能都沒掛上，而且**沒有紅字**（這條 entry 不在必要清單裡，啟動照樣成功） |
| 設定卡 | **Plugins 頁**看得到「中文用字規範」，改了立刻生效（client bundle 是每次請求即時產生的，**只要重新整理頁面**） | 看不到 → 該 namespace 沒被服務：`Config` 沒匯出、六個欄位有一個不是 `.volatile()`，或那一列沒有 `id`（namespace ＝ entry id）。`node dev\dsh-boot-check.mjs` 會直接指名是哪一種 |
| 整個 GUI | 頁面正常載入 | **整頁起不來**（`web boot: N entries did not activate`）→ 幾乎都是 client 半側的 `inject` 寫了一個這個版本的 client 沒有的服務（0.1.7 就是 `settingsScope` 被移除那次）；`npm run test:plugin` 會把它釘在清單上 |
| 用 `hooks.json` 時 session 裡的 `hook/invoked` / `hook/result` | `"decision":"deny","exitCode":2` | `"decision":"pass","exitCode":1`，`stderrSummary` 是 `Cannot find module …` |

放行規則：該行有 `check-ok` 或 `simplified-example` 標記就跳過；
`.tradzhignore` 列出的路徑（locale 檔、字表本身、`node_modules` 等）一律跳過。
`.tradzhignore` 讀的是**執行時 cwd**（＝session 工作區），所以每個工作區要各放一份。

> **檢查是「自己壞掉就放行」的設計**（絕不能因為工具出錯而中斷使用者的回合），
> 所以它故障時是**無聲的**。三層測試就是在防這個：`npm run test:hook` 用真的子行程
> 與真的管線跑 hook，而且**分成兩層**——一層直接跑腳本（行為對不對），另一層把
> `hooks.json` 的指令用真的 shell ＋ 空環境跑一次（**指令到底起不起得來**）；
> `npm run test:plugin` 把外掛的決策跑在**真的 cordis waterfall** 上、驗 `Config` 的 volatile 契約、
> 用替身 React 真的驅動一次設定卡（開卡→改值→儲存，斷言**一次 `mutate`、帶讀到的 revision、
> 只送改動的欄位**），並釘住 client `inject` 的每個名字都在這個版本的 client 服務清單裡
> （那一條就是 0.1.7 那次「整個 GUI 起不來」的守門）；
> **`npm run test:boot`（`dev/dsh-boot-check.mjs`）** 則是真的起一個丟棄式 DSH 做端到端驗證——
> 形狀對了不等於掛得上去，宿主啟動、`settings/describe`、client bundle 三件事要真的量過。

## 輸出把關：本機 LLM 的答案（`examples/llm-proxy/llm-guard-proxy.mjs`）

前面幾種都在擋**寫入檔案**；這一種擋的是**模型寫出來的答案**。兩者互補、不能互相取代：
檔案把關看不到「模型在對話裡寫了簡體」，輸出把關也看不到「agent 用工具寫進硬碟的內容」。

**為什麼要放在伺服器外面**：llama.cpp 的 llama-server 沒有任何外掛、hook 或中介層機制
（實測 build 10964 的 `--help` 沒有相關旗標；sampler extension 在上游還只是討論）。它的取樣旋鈕都不夠用：

| 旋鈕 | 為什麼不夠 |
|---|---|
| `--logit-bias TOKEN_ID±BIAS` | 要 2,637 個簡體字的 **token id**；BPE 會把字併進多字 token；只**降低**機率而不是禁止；**詞組規則表達不了**（粵語口語 30 詞、日文 123 詞是「詞」不是「字」）；換模型／換量化就要重建整張表 |
| `--grammar`（GBNF） | 限制 token 序列可行，但自由散文會被綁死，而且表達不了跨字的詞組黑名單 |
| `--samplers`／`--sampler-seq` | 只能排列**既有** sampler，插不進自訂邏輯 |

```powershell
node examples\llm-proxy\llm-guard-proxy.mjs [--port 8081] [--upstream http://127.0.0.1:8080]
                                            [--script traditional|simplified|off] [--wording] [--quiet]
```

在 repo 目錄裡還有一個等價的別名（要傳參數記得 `--`）：

```powershell
npm run llm-guard-proxy -- --port 8090 --wording
```

它刻意**不叫 `proxy`**：`npm run proxy` 讀起來像在動 npm 自己的 HTTP proxy 設定，而且這個套件
有**兩個**守衛（寫入的、輸出的），`proxy` 一個字說不出是哪一層。名字跟檔名、`--help` 橫幅、
log 前綴一致，所以只有一個名字要記。

| 決定 | 值 | 理由 |
|---|---|---|
| 串流 | **關**：請求帶 `stream:true` 會在上游前被改寫成 `false`（`stream_options` 一併拿掉） | 過濾 SSE 要保留「詞表最長鍵長」的尾巴緩衝才不會從詞中間切斷；先換取保證 |
| 代理範圍 | **整個 origin**，不只 `/v1` | 內建網頁用相對路徑打自己的 origin，所以只要開代理埠，那個 UI 就自動走過濾器 |
| 哪些請求要讀 | **只有**生成端點的 `POST`（此時才拿掉 `accept-encoding`） | 其他一律逐位元組通過。**連 `accept-encoding` 都不能亂拿**——llama-server 的內建網頁沒有它會回 `415 gzip is not supported by this browser`（實測踩到） |
| `tool_calls` | **絕不改寫** | 那是 agent 的工具呼叫 JSON；所以這支代理**不要**指給 agent harness |
| 回音的 `prompt` | 不改 | llama.cpp 原生 `/completion` 會把呼叫者的 `prompt` 原樣回傳，那是**呼叫者的文字**，不是模型寫的 |
| 日文新字體 | 不轉換 | 引用的日文原句必須存活；只偵測、只回報 |

**兩個回應形狀都要懂**（只有真的跑過才會知道）：OpenAI 的 `/v1/chat/completions` 與
`/v1/completions` 把文字放在 `choices[].message.content`／`choices[].text`；但 llama.cpp **原生**的
`/completion` **沒有 `choices`**，文字在**頂層 `content`**。第一版只看 `choices`，於是對原生端點
完全沒作用，log 還印「unchanged」——**看起來像「檢查過了、很乾淨」**。現在兩個形狀都測。

驗證（`npm run test:proxy`，30 項）：真的起一個 upstream ＋ 真的起代理，涵蓋「乾淨的回應逐位元組不變」
「`tool_calls` 不動」「轉不動的殘留被回報」「上游**真的收到** `stream:false`」「內建網頁的 gzip 直通」
「原生 `/completion` 有轉、`prompt` 沒動」「`script:off` 不轉」「上游掛掉回 502」。

