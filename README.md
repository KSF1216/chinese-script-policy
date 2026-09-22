# chinese-script-policy

Enforce the Chinese script you asked for — Traditional by default — on the Chinese you produce and store, and convert it fully offline.

[GitHub](https://github.com/KSF1216/chinese-script-policy) · [中文說明](https://github.com/KSF1216/chinese-script-policy/blob/main/README.zh.md) · [Offline page](https://ksf1216.github.io/chinese-script-policy/dist/tradzh.html) · [npm](https://www.npmjs.com/package/chinese-script-policy) · [CLI reference](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cli.md)

One body of code, harness-neutral: the same repository is a **DSH bundle**, an **Agent Skill** (Claude Code and compatible harnesses), an **npm package**, a **command-line tool**, and a **library for web applications**. There is no separate "DSH build" and "generic build", so the two cannot drift apart.

The check is **one script axis with two directions — use one at a time — plus two independent filter axes**:

- **Script axis (two directions, pick one)**: ask for **Traditional** and it reports **Simplified-only glyphs (2,637)**; ask for **Simplified** and it reports **Traditional-only glyphs (3,083)**. You name the target, and the tool reports what does not belong to it.
- **Filter axes (each its own switch)**: **Cantonese colloquial register**, and **Japanese-only characters and words** (367 shinjitai and kokuji, plus 123 Japanese words). The Japanese axis catches text that **looks Chinese but is Japanese** — neither Traditional nor Simplified, so a Simplified-only table never sees it. Neither filter axis depends on which direction the script axis uses.  <!-- check-ok -->

**Conversion has three independently runnable steps**: Traditional ↔ Simplified, Cantonese colloquial → written Chinese (only the parts that can never be written Chinese), and Japanese shinjitai → Chinese. All three run only when you ask for them.

**An optional wording layer** (`--wording`, one checkbox on the web page, **off by default**) decides whether a conversion also follows the target script's local vocabulary: Simplified → Traditional uses the **Traditional preference table** (`軟件` → `軟體`, `硬盤` → `硬碟`); Traditional → Simplified uses the **Simplified preference table** (`軟體` → `软件`, `網路` → `网络`).  <!-- simplified-example --> **The direction picks the table**, so the two cannot be mixed up. With the switch off you get pure glyph conversion (`軟件` is correct Traditional on its own).

**Zero runtime dependencies**: the tables are compiled into checked-in JSON, so nothing pulls OpenCC in and `dependencies` stays empty. But "zero dependencies" does not mean "bare only" — the difference is **when you use it** and **whether anything has to be installed first**:

| When you want it | How | Install first? |
|---|---|---|
| Convert one document, or the machine has no Node and you would rather not open a terminal | Download [`dist/tradzh.html`](dist/tradzh.html) and **double-click** it (single file, offline) | **No** |
| You already have this directory (cloned, or installed as a skill) | `node scripts/tradzh.js …` directly | **No** |
| A permanent CLI, or use inside scripts and CI | `npx chinese-script-policy …`, or `npm i -g chinese-script-policy` (bins: `tradzh`, `chinese-script`) | Optional |
| **DSH: write guard + GUI switches + skill registration** | `dsh plugin --profile web add chinese-script-policy` | **Yes** |
| Claude Code / another harness, for the skill or the hook | Clone into that harness's skills directory, or take `hooks.json` | Clone only |
| **A web application** (server-side check or convert, or checking live in the browser) | Server: `chinese-script-policy/lib`; browser: `dist/tradzh.html` or bundle `core` | Server yes, browser no |

In other words, **only the two "keep it running" paths need an install** (the DSH plugin, and importing the library server-side). The single-file page and running the repo's own scripts need nothing, and `npx` fetches the package itself.

> This is a tool for projects that must tell Traditional Chinese, Simplified Chinese, Cantonese colloquial writing and Japanese kanji apart. It does not claim that any one script is the correct one.

## Highlights

- Report what does not belong to the script you asked for — on the command line, in the browser, or before a file is ever written
- Two independent filters on top: Cantonese colloquial register, and Japanese-only characters and words
- Convert Traditional ↔ Simplified, Cantonese → written Chinese, and Japanese shinjitai → Chinese, each step on its own
- One single-file offline page: no Node, no network, nothing uploaded, the original text never modified
- Zero runtime dependencies — the tables are checked-in JSON, so results do not change with the machine
- One implementation behind the CLI, the write hook, the DSH plugin and the web page, so they cannot disagree
- Reads UTF-8, BOM, UTF-16, Big5 and GB18030 by itself, and refuses to guess silently when it cannot tell
- Guards a local LLM's answers through a proxy, using that same decision function

## Defaults

**Checking** — the script axis is **one axis with two directions** (you name the target; the tool reports what does not belong to it) and **only one direction is ever on**, next to two independent axes for Cantonese and Japanese:

| Front end | Script axis (pick one) | Cantonese / register axis | Japanese axis |
|---|---|---|---|
| **Offline page** | Two checkboxes: **Traditional (report Simplified glyphs) ✅ on by default** / **Simplified (report Traditional glyphs) ⬜ off by default** | ✅ on | ✅ on |
| **CLI** | `--variant traditional` (default, reports Simplified glyphs) / `--variant simplified` (reports Traditional glyphs) | needs `--written` | needs `--japanese` |
| **Write hook** (Claude Code format) | **fixed to "ask for Traditional"** (blocks Simplified glyphs) — it has no Simplified side | ✅ | ✅ |
| **DSH plugin** (GUI settings card) | **one of three**: ask for Traditional (default) / ask for Simplified / do not check | each can be turned off | each can be turned off |

**⚠️ Never turn both directions on**: feeding **Traditional** text (`後面的軟件很乾淨`) to the "ask for Simplified" side reports 3 glyphs (U+5F8C U+8EDF U+6DE8) — with both on, **every Chinese document is blocked**.

That is to say: **the CLI checks only the Traditional direction of the script axis by default**, and Cantonese and Japanese have to be asked for; **the web page turns on the Traditional direction plus Cantonese plus Japanese** (the Simplified direction stays off); **the hook fixes the script axis to "ask for Traditional" and applies both filters with it**; and **the DSH plugin lets you pick one of the three on the settings card**.

**Conversion** — the direction, and every step that can change meaning, are yours to ask for; **only the two steps that leave the text itself unchanged are automatic**:

| Step | Flag (CLI) | Other front ends | Default | Why |
|---|---|---|---|---|
| Script, Traditional ↔ Simplified | `--to-traditional` / `--to-simplified` | Web: two buttons; library: `toTraditional` / `toSimplified` | **you pick a direction** | The two directions produce completely different text; there is no sensible default |
| Register, Cantonese → written Chinese | `--to-written` | Web: one button; library: `toWritten` | **off** | Register is style; only the parts that can never appear in written Chinese are converted, and the rest is left to a model |
| Japanese, shinjitai → Chinese | `--convert-japanese` | Web: a "strip Japanese" checkbox; library: `stripJapanese` | **off** | A document may quote Japanese on purpose; a quotation should not be edited behind your back |
| **Wording preference** (local vocabulary) | `--wording` | Web: a "wording preference" checkbox; library: the 4th argument of `toTraditional` / `toSimplified` | **off** | `軟件` and `軟體` are both correct Chinese; swapping the word is a preference, not a correction. **The direction picks the table** (Simplified → Traditional uses the Traditional preference table, Traditional → Simplified the Simplified one), so they cannot be mixed up |
| Glyph preference (`裏面` → `裡面`) | (no CLI flag) | automatic on all three (`useTc` is on by default) | **always automatic** | Two common ways to write the same character, collapsed to the common one; nothing about the meaning changes. To turn it off, call `toTraditional(text, true, false)` |
| Compatibility ideograph normalization | (no flag) | automatic on all three | **always automatic** | The text itself is unchanged, only the code point is standardized; there is nothing to ask about |

## Install

### Three shortest paths

```powershell
# 1) Install nothing: download dist/tradzh.html and double-click it. Offline, no Node, no network.
# 2) Command line, nothing kept around (npx fetches it)
npx chinese-script-policy --dir .
npx chinese-script-policy --text "<paste a Simplified string>" --to-traditional
# 3) DSH: one command installs the plugin (write guard + skill registration + GUI switches)
dsh plugin --profile web add chinese-script-policy
```

### DSH

**As a local skill (simplest)** — put the directory under `$DSH_HOME/skills/`, and the directory name must be `chinese-script-policy`:

```powershell
git clone https://github.com/KSF1216/chinese-script-policy.git "$env:USERPROFILE\.dsh\skills\chinese-script-policy"
```

A new session sees it (DSH watches the directory live; no restart needed).

**As a DSH bundle** — one plugin line, whose plugin registers `SKILL.md` into the skill registry with `ctx.skills.register(...)` (what DSH calls embedded skills), so **nothing has to be copied into `~/.dsh/skills`**:

```powershell
dsh plugin --profile web add chinese-script-policy            # published on npm
dsh plugin --profile web add github:KSF1216/chinese-script-policy
dsh plugin --profile web add ./chinese-script-policy-1.2.0.tgz
```

> Installing straight from GitHub makes pnpm ask for an `allowBuilds` entry in that profile's `pnpm-workspace.yaml` (which amounts to allowing this package's code to run at install time). Use npm or the tarball if you would rather not be asked.

> **One install affects one profile.** `web` and `headless` each have their own `dsh.profile.bundles`, so run it **once per shell** you want guarded (change `--profile`).
> **`headless` has no GUI**, so a settings card there is meaningless — use the `config` row of `cordis.patch.yml` or `settings.yaml` instead; the guard itself works the same (the same `tools/pre-execute`).
> ⚠️ The settings card writes the **global** user layer (the `chinese-script-policy:` block in `$DSH_HOME/settings.yaml`, **not per profile**), so flipping a switch in the GUI changes **every profile at once**.

### Other harnesses and the command line

`SKILL.md` is the generic Agent Skills format (YAML frontmatter plus Markdown), so any harness can read it directly:

```powershell
git clone https://github.com/KSF1216/chinese-script-policy.git "$env:USERPROFILE\.claude\skills\chinese-script-policy"
git clone https://github.com/KSF1216/chinese-script-policy.git ./skills/chinese-script-policy
```

It also works as a command-line tool on its own (bins: `tradzh`, `chinese-script`):

```powershell
node scripts\tradzh.js --dir .                                  # check a whole directory tree
node scripts\tradzh.js --fix --to-traditional --write out.txt < in.txt
node scripts\tradzh.js --text "后面的软件很干净" --to-traditional  # convert a string directly # simplified-example
node scripts\tradzh.js --japanese --dir .                       # check for Japanese-only characters
node scripts\tradzh.js --encoding FILE.md                       # report the encoding
```

The complete feature × command × explanation table (including `--wording`, `--to-written`, `--convert-japanese` and their defaults) is in [`references/cli.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cli.md).

### Web applications

**Any online system can use it, because all you need is somewhere JS runs**: the browser itself, or a Node process.

| Your system | Which files | How it goes in |
|---|---|---|
| Front end, **download and run**, no build step | `dist/tradzh.html` (engine and all nine tables inlined) | Double-click it, or `<iframe src="tradzh.html">`. **No Node needed** |
| Front end **inside your own app** (check as you type) | `scripts/core.js` plus `scripts/*.json` | `import { createCore } from 'chinese-script-policy/core'` and inject the tables yourself (there is no fs) |
| Server on **Node** (Express / Next / Nuxt / Workers) | `scripts/lib.js` (reads its own tables) | `import { scanText, toTraditional, guardInspect } from 'chinese-script-policy/lib'` |
| Server **not on JS** (PHP / Python / Java) | `scripts/tradzh.js` | Call it as a subprocess, or hand the work to the browser page |
| **Do not use** | `index.mjs` (the DSH plugin), `lib/client.js` (the DSH settings card) | The latter touches `window` on import and throws `window is not defined` under Node |

```js
// server: check and convert (ESM and CJS both work)
import { guardInspect, toTraditional } from 'chinese-script-policy/lib';
const verdict = guardInspect(userText);       // exactly the same decision as the DSH write hook
if (verdict) return res.status(422).json({ reason: verdict.reason });
const stored = toTraditional(userText);       // conversion is a SEPARATE step; nothing is silently rewritten

// front end / Edge (no fs): the same engine, tables injected by you
import { createCore } from 'chinese-script-policy/core';
import simplifiedOnly from 'chinese-script-policy/tables/simplified-only' with { type: 'json' };
const core = createCore({ simplifiedOnly /* …the other eight */ });
```

> ⚠️ An ESM JSON import **must** carry `with { type: 'json' }`, or Node throws `ERR_IMPORT_ATTRIBUTE_MISSING` (CJS `require()` does not need it). ⚠️ `core`'s named exports come from the `scripts/core.mjs` shim (the UMD wrapper hides them from Node's static analysis), and `test:api` asserts that the shim exports **exactly** the keys of `core.js`.

**A working demo is included**: `examples/web-app/` is a zero-dependency Node HTTP server plus one front-end page, with `guardInspect` wired to the API boundary. Measured against the package as installed from npm:

| Request | Response |
|---|---|
| `GET /` | `200` |
| `POST /api/check` with Simplified text | **`422`** plus the raw `reason` (`BLOCKED … U+8F6F U+51C0`) |
| `POST /api/check` with Traditional text | `200` `{"clean":true}` |
| `POST /api/convert` `to=traditional` | `200` `{"text":"後面的軟件很乾淨"}` |

### Write-time guard (three ways to install it)

The pre-write check is **one decision** (`guardInspect` / `guardMessage` in `scripts/lib.js`); the ways to install it differ only in **how it is attached to the harness**:

| Installation | Who it is for | Switches and configuration |
|---|---|---|
| **DSH plugin** (recommended) | DSH | The GUI settings card: enabled, one of three script choices, the register and Japanese switches, block versus warn, **Windows script file types** (`.ps1` / `.cmd`, below) — **applied the moment you save**. The card is **global** (one change affects every profile); **each profile needs its own install**, and `headless` has no GUI, so its switches go in YAML |
| **Claude Code / other harnesses** | Any harness speaking the same hook protocol | Use this package's `hooks.json` (`PreToolUse` with matcher `write\|edit`) |
| **Environments without hooks** | Everything else | Re-check yourself after writing with `node scripts\tradzh.js <file>`, and put the policy in the system prompt |

Besides Chinese characters, **Windows script file types** carry two more write rules: `.ps1` must be **pure ASCII**, and `.cmd` / `.bat` must be **pure ASCII with CRLF** — because PowerShell 5.1 and cmd.exe both read scripts as ANSI, and UTF-8 Chinese without a BOM turns a `.ps1` into a syntax error. The rule is in `SKILL.md` under "file-type traps"; the cause and the measurements are in `references/encoding.md`. The **DSH plugin warns only** by default for these writes; the settings card can change that to "block" or "off" — but "block" only ever applies to a `.ps1` that would really break, while `.cmd` / `.bat` (which usually still run) always warn.

The details (the full `hooks.json`, why `pluginRoot` must be given, and four things you can achieve without editing the tables) are in [`references/integration.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/integration.md).

### Output guard: local LLM answers (a proxy)

The write guard covers **files**; when the bad characters are **written by a model** (the common case with a local model), they have to be stopped somewhere else. llama-server **has no plugin mechanism** (measured on build 10964: no plugin, hook or middleware in `--help`), and its two sampling-layer knobs cannot replace a rule: `--logit-bias` only **lowers** the probability of particular tokens (it would need the token ids of 2,637 characters, BPE merges characters into multi-character tokens, and it cannot express a phrase), and `--grammar` (GBNF) is impractical for free prose. So the mechanical layer goes **outside** the server:

```powershell
npm run llm-guard-proxy                             # an alias, from this repo's directory
node examples\llm-proxy\llm-guard-proxy.mjs         # equivalent; package installs use this path
```

> That npm script is only an alias for the line below it; to pass arguments use `npm run llm-guard-proxy -- --port 8090` (only what follows `--` is forwarded). It is **deliberately not called `proxy`**: `npm run proxy` reads like it touches npm's own HTTP proxy settings, and this package has **two** guards (the write one and the output one), so `proxy` would not say which layer.

| Front end | What to do |
|---|---|
| SillyTavern / any OpenAI-compatible front end | Point the API base at `http://127.0.0.1:8081/v1` |
| llama-server's built-in page | Open `http://127.0.0.1:8081/` (the proxy covers the **whole origin**, so that UI works as-is) |
| An agent harness | ⚠️ **Do not point it here** — a response carrying `tool_calls` is never rewritten, and a proxy does not belong in the path of tool calls |

It is **non-streaming** (a request carrying `stream:true` is rewritten to `false` before it reaches the upstream), it uses the **same** `guardInspect`, a clean response passes through **byte for byte**, only the generation endpoints' JSON is read, and anything left that could not be converted is written to the log. Measured (2026-09, a local 27B model): asked directly it answered `用干净的语言。`; through the proxy that becomes `用乾淨的語言。`. <!-- simplified-example -->

## Why this exists

**It started with knowledge management.** The same Chinese material arrives from several places: Traditional you typed yourself, Simplified you pasted, and text a model generated (sometimes mixed with Japanese kanji). They **look identical and are different strings**, so deduplication, search and citation treat them as two records. Each source produces its own kind of inconsistency:

- **Different source → different string**: `軟體` and `软件` are two different things to string equality, so deduplication and citation go wrong with them. <!-- simplified-example -->
- **Models mix scripts**: a local model (Qwen3.8), measured, held "always Traditional" across a long answer and still leaked `听` and `灵 长` (2 runs out of 2). <!-- simplified-example -->
- **And there are a third and a fourth kind**: Japanese shinjitai (`竜` `発` `図`) and **compatibility ideographs** — one character with two code points, indistinguishable to the eye. <!-- check-ok -->

So "which way of writing it" becomes something **checkable, convertible and configurable** rather than something a person has to remember: store one script (Traditional) plus normalization; use a slug or a UUID where an ASCII key is needed, and **store the content as written** (romanizing Chinese data loses proper nouns and full-text search on the original).

And why not simply trust the AI's own judgement — **an AI's Traditional/Simplified judgement is a fuzzy impression, not a table lookup**, so it makes two kinds of mistake: it reads characters shared by both scripts (您, 什麼, 可以, 我) as Simplified, and going Simplified → Traditional it picks the wrong candidate (`头发` → `頭发`). <!-- simplified-example -->

Sneakier still are the **traps in the tables themselves**, which this project has hit and fixed twice:

- **Variant preference**: OpenCC holds that the Traditional form of `群` is `羣`, while the standard form in the Ministry of Education dictionary is `群`
- **Standard Traditional characters that Big5 also encodes**: `峰 床 痴 秘 灶 粽 肴 虱 霉` were wrongly listed as Simplified, so 「起床」「秘密」「玉山主峰」 were all reported as Simplified

The same lesson appeared a third time on the **Japanese axis**: of OpenCC's 403 shinjitai, 57 (`峰 群 床 才 予 岳 連 衛` …) are in fact legitimate Traditional characters, and all of them are excluded — otherwise 「玉山主峰」 would be reported as Japanese. `selftest.js` has a case that joins those 57 characters into a single line and requires it to stay clean.

## What OpenCC provides, and what this project adds

**The relationship first**, because it is exactly what makes this package worth using:

**Almost all conversion data comes from [OpenCC](https://github.com/BYVoid/OpenCC)** — measured, **66,769 of 66,884 entries (99.83%)** are OpenCC's curation of more than ten years (Apache-2.0), and by entry count the phrase tables are most of it. **That number is computed, not typed in**: `npm run stats` counts every table and lists the original part entry by entry.

The **115 original entries** (not OpenCC data) fall into two groups: **94 on the Cantonese register axis** (17 characters + 30 phrases + 15 weak phrases + 3 word-order patterns + 12 convertible characters + 17 convertible phrases) and **21 kokuji** — the latter from Japanese Wikipedia, because **OpenCC has no kokuji at all** (`働` `畑` `辻` `峠` `凪`, characters Japan coined and Chinese never had; see `references/japanese.md`).  <!-- check-ok -->

**But OpenCC is a converter, and six layers here are not its:**

| # | Layer | Why OpenCC does not have it, or cannot replace it |
|---|---|---|
| 1 | **Detection (two script directions + two filters)** | OpenCC converts input to output; it has **no "does this document use the wrong script" mode**. The scanning, the per-line reporting, the waivers and the counts are all written here |
| 2 | **Auditing, so that detection does not cry wolf** | The naive approach is to use OpenCC's tables as the detection list — which reports `峰 床 痴 秘 灶 粽 肴 虱 霉` as Simplified (「起床」「秘密」「玉山主峰」 all hit) and `峰 群 床 才` as Japanese. This project suppresses the false alarms with a **per-character cp950 / GB2312 audit plus a reviewed list**, and pins the result with tests |
| 3 | **The Cantonese register axis** | OpenCC **does not do Cantonese colloquial writing at all** (its `s2hk` / `t2hk` handle Hong Kong's **character variants**, not 「嘅」 → 「的」). These 17 characters and 45 phrases are **original data from this project** |
| 4 | **The encoding layer** | Choosing between Big5 and GB18030 is decided by "how many of the decoded characters does this project's own table recognize" (**correct 100%, wrong 54%**); characters falling into the Private Use Area through HKSCS produce a **loud warning and a failing check**; Japanese and Korean files are **positively identified** and reported as "not a Chinese file" instead of being forced into mojibake. OpenCC does not deal with encoding |
| 5 | **Integration with agents** | The PreToolUse guard that runs **before** a write (`hooks.json`, which also works in Claude Code format), the DSH skill and bundle, the **single-file offline HTML**, and a full test suite (including the rule that **a broken hook is silent, so it has to be tested**). OpenCC has none of this |
| 6 | **The wording preference layer** | OpenCC keeps it inside the `s2twp` **configuration** (which has to be compiled and installed). This project compiles those 830 entries into a built-in table and makes it an **option** (`--wording`, one checkbox on the page), so the Traditional preference is available without OpenCC — and **it is the same installed or not**: the output does not change with the machine (see [`references/conversion.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/conversion.md)) |

**One more key difference: zero runtime dependencies.** `dependencies: {}` — the tables are compiled into checked-in JSON, so even if OpenCC disappeared tomorrow, or the machine has neither network nor Node (use the offline HTML), the tool still runs. OpenCC is needed only to **regenerate the tables**, and the source URLs and rebuild commands are in the documentation. Licensing and derivation notices are in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## Design principles

- **One implementation only**: `scripts/lib.js` is the single core, and the CLI (`tradzh.js`), the hook (`pre-write-check.js`, for Claude Code and similar) and the DSH plugin's guard (`index.mjs`) all call the **same** `guardInspect`, so the three cannot disagree — even the "what to say when blocking" text is one `guardMessage`. There used to be a Node and a PowerShell implementation side by side; the behaviour drifted and cost a lot of time.
- **Tables, not impressions**: every decision is checked against a verified table, never extrapolated.
- **The encoding is decided here**: reading always determines the encoding from the bytes (UTF-8 / BOM / UTF-16 / Big5 / GB18030), and writing is always UTF-8 without a BOM, via a temporary file and a rename. It does not take the shell's or the editor's default.
- **When it cannot tell, it says so**: when a file is recognizable as Japanese (Shift-JIS), Korean (EUC-KR) or a Western / Cyrillic single-byte encoding, the tool says "not a Chinese file"; a file it cannot recognize at all is **warned about and fails the check** rather than quietly skipped — "never checked" must not look like "checked and clean".

## Documentation

The README keeps only the shortest paths; everything else is there when you need it (all shipped files, all in this repository):

| What you want | Where |
|---|---|
| The complete feature × command × explanation table, and building or hosting the offline page | [`references/cli.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cli.md), [`references/offline-page.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/offline-page.md) |
| How to attach it to a harness (hook, DSH plugin, alternatives) | [`references/integration.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/integration.md) |
| Where the conversion tables come from, how wording preference works, why local edits survive a rebuild | [`references/conversion.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/conversion.md) |
| The glyph-table audit history (why `峰 床 痴 秘 灶 粽` cannot be listed as Simplified) | [`references/glyph-table.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/glyph-table.md) |
| Encoding (UTF-8 / Big5 / HKSCS / PUA) and detection rewrites | [`references/encoding.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/encoding.md) |
| The Cantonese register axis (four detection layers, weak-phrase rules) | [`references/cantonese.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/cantonese.md) |
| The Japanese axis (shinjitai, kokuji, Japanese words) | [`references/japanese.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/japanese.md) |
| What each data file holds | [`references/data-files.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/references/data-files.md) |
| 中文說明 — the same document in Chinese | [`README.zh.md`](https://github.com/KSF1216/chinese-script-policy/blob/main/README.zh.md) |
| Maintainers: rebuilding the tables, running the tests, the release process | [`PUBLISHING.md`](PUBLISHING.md) |

## Project status

This is an independent project. It is not an official DeepSeek product, and it is not affiliated with the OpenCC maintainers; DeepSeek, OpenCC and related names and marks belong to their respective owners. Everything runs offline and nothing is uploaded anywhere.

## License

- Code: **MIT**, see [`LICENSE`](LICENSE).
- The **data tables under `scripts/` are derived from OpenCC** (Apache-2.0); their sources, the modifications, and how to regenerate them are in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
