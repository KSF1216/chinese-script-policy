// tools/docs-breaktest.mjs - 證明交接文件的守門真的會在每一類錯誤上紅燈。
//
// 刻意**不**掛進 `npm test`：它會改動文件（然後還原），是手動的重新校準工具。
// 改過 `tools\docs.mjs` 或卡片慣例之後就跑它——**一個從來沒紅過的守門，跟沒有守門無法區分**。
//
//   node tools\docs-breaktest.mjs
//
// 每個案例會製造一個破壞、跑 `tools\docs.mjs`、報告 exit code、還原原始位元組，
// 最後印出被動過檔案的 SHA-256——「我還原了」要是位元組層級的說法，不是一種希望。
// 另外三個探針測反方向：人真的會寫的三種 front matter 形狀**不能讓 board 崩潰**。
//
// 用 Node 寫是刻意的：含中文的 `.ps1` 會被 PowerShell 5.1 當 ANSI 讀而壞掉（本工作區已記錄的陷阱）。
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = () => spawnSync(process.execPath, [join(ROOT, 'tools', 'docs.mjs')], { cwd: ROOT, stdio: 'inherit' }).status
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16)

// `pattern` 是給「文字本來就會變」的錨點用的（卡片的狀態會從 todo 變 done）；
// 把錨點寫成字面值，一旦漂掉就會**靜默 SKIP**，那比紅燈更糟。
const cases = [
  {
    name: 'missing reference',
    file: 'NEXT-file-type-guard.md',
    old: '## 一、',
    add: '\n備註：細節見 `tools\\does-not-exist.mjs`。\n',
  },
  { name: 'illegal status', file: 'NEXT-file-type-guard.md', pattern: /^status: [a-z]+$/m, new: 'status: wip' },
  {
    name: 'dependency on a missing card',
    file: 'NEXT-file-type-guard.md',
    pattern: /^id: next-file-type-guard$/m,
    new: 'id: next-file-type-guard\ndepends_on: no-such-card',
  },
  // `all: true`：索引裡可能合法地提到同一個名字不只一次，只拿掉第一處會讓卡片仍然
  // 「被提到」，案例就會因為錯的理由而通過。
  { name: 'orphan card (index lost it)', file: 'PUBLISHING.md', old: 'NEXT-file-type-guard.md', new: 'NEXT-file-type-guard', all: true },
  // `blocked` 是 2026-09-20 新增的狀態：它必須指名「被什麼擋住」，否則只是一句
  // 讓人無法接手的宣告。拿掉 blocked_by 就必須紅燈。
  { name: 'blocked card without blocked_by', file: 'NEXT-release-1.3.1.md', pattern: /^blocked_by: .*$/m, new: '' },
]

const rows = []
for (const c of cases) {
  const path = join(ROOT, c.file)
  const before = readFileSync(path)
  const text = before.toString('utf8')
  // 找不到錨點＝這個測試壞了，不是守門通過了，所以要說 SKIPPED 而不是 NOT CAUGHT。
  const anchor = c.pattern ? (text.match(c.pattern) || [])[0] : (text.includes(c.old) ? c.old : null)
  if (!anchor) { rows.push({ case: c.name, result: 'SKIPPED (anchor not found)' }); continue }
  const after = c.add ? text.replace(anchor, anchor + c.add)
    : c.all ? text.replaceAll(anchor, c.new)
      : text.replace(anchor, c.new)
  writeFileSync(path, after, 'utf8')
  const status = run()
  rows.push({ case: c.name, result: status !== 0 ? 'caught (exit ' + status + ')' : 'NOT CAUGHT' })
  writeFileSync(path, before)
}

// 這不是破壞，是穩健性：人真的會寫的三種 front matter 形狀不能讓 `board` 崩潰
// （那是大家隨手會跑的東西）。純量 `depends_on: some-card` 曾經讓 renderBoard 丟例外，
// 而 `depends_on: -` 曾被當成真的 id、然後在內文裡到處「找到」它。
const throwaway = join(ROOT, 'NEXT-shape-probe.md')
for (const [shape, front] of [
  ['bare dash (depends_on: -)', 'depends_on: -\nsupersedes: -'],
  ['scalar (depends_on: some-card)', 'depends_on: next-write-rules'],
  ['array (depends_on: [a, b])', 'depends_on: [next-write-rules, next-file-type-guard]'],
]) {
  writeFileSync(throwaway, '---\nid: next-shape-probe\nstatus: todo\n' + front + '\nupdated: 2026-09-20\n---\n\n# probe\n', 'utf8')
  // stdio: 'ignore'——Node 的 'pipe' 在這個沙箱是 EPERM（見 AIPMSkills 的 machine-facts.md）
  const status = spawnSync(process.execPath, [join(ROOT, 'tools', 'docs.mjs'), 'board'], { cwd: ROOT, stdio: 'ignore' }).status
  rows.push({ case: 'front matter ' + shape + ' does not crash board', result: status === 0 ? 'exit 0' : 'CRASHED (exit ' + status + ')' })
}
rmSync(throwaway, { force: true })

const clean = run()
rows.push({ case: 'restored -> all green', result: clean === 0 ? 'exit 0' : 'STILL FAILING (exit ' + clean + ')' })

console.log('')
let failed = 0
for (const r of rows) {
  const ok = r.result.includes('caught') || r.result === 'exit 0'
  if (!ok) failed++
  console.log((ok ? 'OK   ' : 'FAIL ') + r.case + '  ->  ' + r.result)
}
console.log('')
for (const f of ['NEXT-file-type-guard.md', 'NEXT-release-1.3.1.md', 'PUBLISHING.md']) console.log('sha256 ' + sha(join(ROOT, f)) + '  ' + f)
// 案例沒照宣稱的行為走就要非零結束。印 FAIL 卻 exit 0，正是這個工具存在的理由
// （ComfyUiWeb 2026-09-19 抓到過：破壞測試印了三個 FAIL 卻仍然 exit 0）。
if (failed) {
  console.log('')
  console.log('breaktest: ' + failed + ' case(s) FAILED - the guard did not do what this file claims')
  process.exit(1)
}
