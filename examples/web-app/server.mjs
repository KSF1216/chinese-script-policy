// A minimal web application that enforces the script policy at its API boundary.
// Zero dependencies: Node's own http + chinese-script-policy/lib.
//
//   node examples/web-app/server.mjs          -> http://127.0.0.1:8787
//
// The port comes from PORT, or 8787. Careful: a harness may already export PORT for its own
// server (the DSH web GUI uses 3080), and then this demo tries to bind that port and dies
// with EADDRINUSE - measured 2026-09. Pass PORT explicitly when the environment sets one.
//   curl -s localhost:8787/api/check   -d '{"text":"<simplified text>"}'
//   curl -s localhost:8787/api/convert -d '{"text":"<text>","to":"traditional"}'
//   curl -s localhost:8787/api/convert -d '{"text":"<text>","to":"traditional","wording":true}'
//
// Why this shape:
//   * it calls the SAME guard the DSH write hook calls (lib.guardInspect ->
//     lib.guardMessage), so a web app cannot drift away from the agent-side rule;
//     the app decides what to do with the verdict (here: reject with 422)
//   * conversion is a separate, explicit step the caller asks for - never silent
//   * the axes are switchable per request, exactly like the settings card

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// The documented way is the package specifier. The fallback keeps this example
// runnable straight from a clone, where the package is not installed by name.
function loadPolicy() {
  try { return require('chinese-script-policy/lib'); }
  catch { return require(path.join(HERE, '..', '..', 'scripts', 'lib.js')); }
}
const policy = loadPolicy();

const PORT = Number(process.env.PORT || 8787);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

// POST /api/check   {"text": "...", "axes": {...}, "scriptTarget": "traditional"}
// -> 200 { clean: true }  |  422 { clean: false, reason, hits }
async function check(req, res) {
  const { text = '', axes, scriptTarget } = JSON.parse(await readBody(req) || '{}');
  const verdict = policy.guardInspect(text, { axes, scriptTarget });
  if (!verdict) return send(res, 200, { clean: true });
  // 422 because the caller's content is not acceptable as-is; `reason` is the same
  // message the write hook shows a model, arrows and all.
  send(res, 422, {
    clean: false,
    reason: verdict.reason,
    hits: {
      script: verdict.scriptHits.length,
      register: verdict.registerHits.length,
      japanese: verdict.japaneseHits.length,
    },
  });
}

// POST /api/convert {"text": "...", "to": "traditional" | "simplified" | "written",
//                    "wording": true}
// One wording switch, exactly like the CLI's --wording: the library picks the table from
// the direction (簡->繁 uses 繁體偏好, 繁->簡 uses 簡體偏好), so a caller cannot pair the
// wrong wording with a direction - or ask for both at once.
async function convert(req, res) {
  const { text = '', to = 'traditional', wording = false } = JSON.parse(await readBody(req) || '{}');
  let out;
  if (to === 'traditional') out = policy.toTraditional(text, true, true, wording, false);
  else if (to === 'simplified') out = policy.toSimplified(text, true, false, wording);
  else if (to === 'written') out = policy.toWritten(text);
  else return send(res, 400, { error: 'to must be traditional | simplified | written' });
  send(res, 200, { to, text: out });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, readFileSync(path.join(HERE, 'index.html')), 'text/html; charset=utf-8');
    }
    if (req.method === 'POST' && url.pathname === '/api/check') return await check(req, res);
    if (req.method === 'POST' && url.pathname === '/api/convert') return await convert(req, res);
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('web-app demo on http://127.0.0.1:' + PORT + '  (policy from ' + require.resolve(path.join(HERE, '..', '..', 'scripts', 'lib.js')) + ')');
});
