#!/usr/bin/env node
// PreToolUse hook: refuse a file write whose content contains Simplified-only
// glyphs, Cantonese colloquial markers, or Japanese-only kanji and words, so the
// model must fix it BEFORE the bytes land on disk.
//
// This file is a thin adapter. The decision - which axes, which exemptions, what
// the model is told - lives in lib.guardInspect, the same function the DSH
// plugin's own guard uses (index.mjs). Two implementations would drift, and a
// write would then be blocked by one front end while the other allowed it.
//
// Why PreToolUse and not PostToolUse: the DSH hook bridge does not put a write
// tool's result payload into PostToolUse, so a post-hook cannot see what was
// written. PreToolUse receives the tool input, which does contain the content.
//
// Wiring: see ../hooks.json (matcher "write|edit"). Exit 2 blocks the call and
// stderr becomes the reason the model sees. Any other failure exits 0 so a
// broken hook can never block a turn.
let lib;
try {
  lib = require('./lib.js');
} catch {
  process.exit(0); // list or lib unavailable: stay out of the way
}

// Field names a tool input may use for the text being written and for its path.
// Checked in both the payload root and tool_input, so a harness rename does not
// silently disable the guard.
const CONTENT_FIELDS = ['content', 'new_string', 'newText', 'new_str', 'text', 'value'];
const PATH_FIELDS = ['file_path', 'path', 'file'];

// Which extensions count as prose lives in lib.js (isTextFile), NOT here: a local
// copy of that list is exactly how the hook and the CLI would drift apart.

function readStdin() {
  return new Promise((resolve) => {
    let d = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => resolve(d));
    setTimeout(() => resolve(d), 5000);
  });
}

function pickField(obj, names) {
  if (!obj || typeof obj !== 'object') return null;
  for (const n of names) {
    if (typeof obj[n] === 'string' && obj[n].length) return { name: n, value: obj[n] };
  }
  return null;
}

(async () => {
  let payload;
  try {
    const raw = await readStdin();
    if (!raw.trim()) process.exit(0);
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // unparseable input: never block on our own failure
  }

  const toolInput = payload.tool_input || payload.toolInput || {};
  const pathHit = pickField(toolInput, PATH_FIELDS) || pickField(payload, PATH_FIELDS);
  const contentHit = pickField(toolInput, CONTENT_FIELDS) || pickField(payload, CONTENT_FIELDS);
  if (!contentHit) process.exit(0);

  let found;
  try {
    found = lib.guardInspect(contentHit.value, { target: pathHit ? pathHit.value : '' });
  } catch {
    process.exit(0); // a crashing hook must not break the turn
  }
  if (!found) process.exit(0);

  process.stderr.write(found.reason);
  process.exit(2);
})();
