// ESM half of core.js.
//
// core.js is UMD on purpose: the same file is `require()`d by the CLI, the write hook
// and the tests, and loaded by a bare <script> tag in dist/tradzh.html (it sets
// window.TradzhCore). Node cannot statically see named exports through that wrapper,
// so `import { createCore } from 'chinese-script-policy/core'` used to fail with
// "Named export 'createCore' not found" - a confusing dead end for a web app.
//
// This file is the missing half: the same object, re-exported with names. Node picks
// it via the "import" condition in package.json's exports; CJS callers keep getting
// core.js itself, so nothing about the UMD path changes.
//
// ⚠️ The list below is pinned by scripts/api-selftest.mjs: it imports this file and
// asserts the named exports are EXACTLY the keys of core.js. Add a name here when you
// add one there, or the test fails.

import core from './core.js';

export default core;
export const {
  createCore,
  globToRegExp,
  scanTextWith,
  summarize,
  hitOccurrences,
  lineSkipped,
  detectEncoding,
  decodeText,
  scriptMix,
  chineseScore,
  puaChars,
  scanTextPua,
  isPua,
  SKIP_MARKERS,
} = core;
