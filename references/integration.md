# 接進 harness：三種寫入把關裝法的細節（從 README 搬過來）

> 決策與訊息都來自同一個 scripts/lib.js 的 guardInspect／guardMessage，
> 差別只在「怎麼接上 harness」。完整設定、hooks.json 內容與替代做法在這裡。

## 寫入檢查：三種安裝方式

寫入前的檢查是**同一個決策**（`scripts/lib.js` 的 `guardInspect`：同一組軸、同樣的例外、同樣的訊息），
只是接進 harness 的方式不同：

| 裝法 | 適合誰 | 開關與設定 |
|---|---|---|
| **DSH 外掛（建議）** | DSH | GUI 的「外掛 → Plugin configuration → 中文用字規範」設定卡：啟用、**腳本三選一**（要求繁體／要求簡體／不檢查）、語體與日文開關、擋下／只警告，**存檔立刻生效**（不必重啟） |
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

**裝一次只影響一個 profile。** 每個 profile 有自己的 `dsh.profile.bundles`，
所以 `web` 與 `headless` 要**各裝一次**（只換 `--profile`）：

```powershell
dsh plugin --profile headless add C:\path\to\chinese-script-policy
```

**`headless`（無頭：跑一個任務、印出結果就結束）沒有 GUI**，所以設定卡在那裡沒有意義，
開關改用上面那段 row `config`（或 `$DSH_HOME/settings.yaml`）。守衛本身照常運作，
因為它跑的是同一條 `tools/pre-execute`；2026-09 實測：headless 下寫入含簡體字的內容被擋下、
檔案未被建立。無頭也用不到瀏覽器那半（`lib/client.js`）——`package.json` 的 `dsh.client`
已宣告 `platform: "web"`，而無頭的殼完全不碰 client 模組。

> **⚠️ 設定卡寫的是全域的 user layer。** 它落在 `$DSH_HOME/settings.yaml` 的
> `chinese-script-policy:` 區塊，**不分 profile**——在 GUI 把腳本軸切成「要求簡體」，
> headless 也會跟著變。要讓兩個 profile 用**不同**主軸，就別設那個區塊，
> 改成在各 profile 的 `cordis.patch.yml` 覆寫那一列的 `config`（user layer 會蓋掉它）。
> 這也是為什麼「這個專案存哪一種寫法」目前是**全機器一份**，而不是每個工作區一份
> ——三層的完整對照見下一節。

### 設定的三個層級：哪一層是全域、哪一層不是

「這個專案存哪一種寫法」（`script`）是守衛自己的設定，但它跟**放行規則**不在同一層。
這一點實際讓人誤判過：把軸切成「要求簡體」之後，整個 repo 的繁體寫入都被擋，
看起來像守衛方向反了——其實是**設定與專案不符**，而且那一層是全機器共用的。

| 層 | 誰寫的 | 範圍 | 內容 |
|---|---|---|---|
| **基底層**（row `config`） | 本套件的 `cordis.patch.yml` | **每個 profile 一份** | 五個開關的預設值 |
| **使用者層**（設定卡） | GUI 按「儲存」→ `$DSH_HOME/settings.yaml` 的 `chinese-script-policy:` | **全機器一份**（不分 profile、不分工作區） | 蓋掉基底層的值 |
| **放行層** | 工作區根目錄的 `.tradzhignore`、`cantonese-allow.json` | **每個工作區一份** | 哪些檔案／行跳過檢查 |

**為什麼軸是全機器一份**：DSH 這一版只有一個 settings 提供者
（`@deepseek-ai/dsh-settings-file`，把所有 namespace 收在同一份 `settings.yaml`），
沒有工作區維度的設定 namespace——`--dump-config` 裡 `settings` 就只有那一列，
`dsh-workspace` 那一族管的是工作區／檔案／cwd，不是設定。所以**任何外掛的設定卡都是全機器一份**，
不只是這個守衛；守衛的 `ctx.settingsScope.bind({ namespace })` 也只有 namespace 一個維度。

**守衛已經有「每個工作區一份」的機制**（就是上表的放行層，讀的是**執行時 cwd**），
只是目前只用在「放行」。要讓「軸」也每工作區一份，得讓守衛在**每次攔截時**讀工作區裡的一個
設定檔（讀不到就回退到設定卡的值），並在卡片上說明「這個工作區被覆寫」——那是功能變更，
**尚未實作**。

列的 `config` 是開關的**基底層**，設定卡寫的是**使用者層**，預設值在 `index.mjs`
（`resolveSection`）：

```yaml
- id: chinese-script-policy
  name: chinese-script-policy
  config:
    enabled: true            # 整個寫入檢查的總開關
    mode: block              # block（擋下）或 warn（只警告，仍然寫入）
    script: traditional      # 這個專案存哪一種寫法：traditional / simplified / off
    register: true           # 粵語口語（語體）
    japanese: true           # 日文專有字詞
```

`script` 是**三選一**而不是勾選框，因為「哪一種寫法才是對的」取決於專案：

| 值 | 行為 |
|---|---|
| `traditional`（預設） | 抓到**簡體專有字**就處理，訊息請模型改回繁體 |
| `simplified` | 抓到**繁體專有字**就處理，訊息請模型改成簡體；日文新字體的對照也會給**簡體**寫法（`発 -> 发`）<!-- check-ok --> |
| `off` | 不檢查腳本軸，只查語體與日文 |

（舊版的設定檔把這裡存成布林：`true` ＝ `traditional`、`false` ＝ `off`，讀進來仍然照原意運作。）

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
| 設定卡 | 「外掛 → Plugin configuration」看得到「中文用字規範」，改了立刻生效（client bundle 是每次請求即時產生的，**只要重新整理頁面**） | 看不到 → 檢查宿主 `describe()` 有沒有列出這個 namespace（schema 少了 `toJSON()` 會讓整頁的卡都消失） |
| 用 `hooks.json` 時 session 裡的 `hook/invoked` / `hook/result` | `"decision":"deny","exitCode":2` | `"decision":"pass","exitCode":1`，`stderrSummary` 是 `Cannot find module …` |

放行規則：該行有 `check-ok` 或 `simplified-example` 標記就跳過；
`.tradzhignore` 列出的路徑（locale 檔、字表本身、`node_modules` 等）一律跳過。
`.tradzhignore` 讀的是**執行時 cwd**（＝session 工作區），所以每個工作區要各放一份。

> **檢查是「自己壞掉就放行」的設計**（絕不能因為工具出錯而中斷使用者的回合），
> 所以它故障時是**無聲的**。兩層測試就是在防這個：`npm run test:hook` 用真的子行程
> 與真的管線跑 hook，而且**分成兩層**——一層直接跑腳本（行為對不對），另一層把
> `hooks.json` 的指令用真的 shell ＋ 空環境跑一次（**指令到底起不起得來**）；
> `npm run test:plugin` 則把外掛的決策跑在**真的 cordis waterfall** 上，
> 並把設定卡的瀏覽器端程式用替身 React 評估、渲染一次，確認它真的會產生卡片。

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

