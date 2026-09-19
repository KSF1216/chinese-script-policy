// An output guard for a local LLM server: a zero-dependency proxy that sits in front of
// llama.cpp's llama-server (or anything else that speaks the OpenAI HTTP API) and fixes
// the script of what the model writes BACK, on the way to the front end.
//
//   node examples/llm-proxy/llm-guard-proxy.mjs
//     -> http://127.0.0.1:8081   (upstream http://127.0.0.1:8080)
//
//   node examples/llm-proxy/llm-guard-proxy.mjs --port 8081 --upstream http://127.0.0.1:8080
//
// Why this exists, and why it is not a llama-server plugin: llama-server has NO plugin,
// hook or middleware mechanism (checked against build 10964: its --help has no such flag,
// and sampler extensions are still an upstream discussion, not a feature). Its only
// near-mechanical knobs are `--logit-bias` (per-token probability, needs 2,637 token ids,
// cannot express a phrase rule, and lowers probability instead of forbidding) and
// `--grammar` (GBNF, impractical for free prose and blind to phrase-level rules). So the
// mechanical layer has to live OUTSIDE the server - which is what this file is.
//
// The decision function is the SAME one the CLI, the write hook and the DSH plugin use
// (lib.guardInspect + lib.toTraditional / lib.toSimplified), so a front end served through
// this proxy cannot drift away from the rule the rest of the toolchain enforces.
//
// Design decisions worth knowing before editing:
//
//   * NON-STREAMING ON PURPOSE. A `stream: true` body is rewritten to `false` (and
//     `stream_options` dropped) before it reaches the upstream, and the rewritten request
//     is noted in the log. Filtering an SSE stream means holding back a carry-over buffer
//     as long as the longest phrase-table key, because a chunk boundary can fall inside a
//     word - correct, but a lot more moving parts. Non-streaming costs the front end its
//     token-by-token display and buys a guarantee; that trade was made deliberately.
//
//   * THE WHOLE ORIGIN IS PROXIED, not just /v1. llama-server's built-in web UI talks to
//     its own origin with relative URLs, so pointing a browser at this proxy is all it
//     takes for that UI to go through the filter - no setting to change. Only JSON
//     responses from generation endpoints are ever rewritten; HTML, CSS, images,
//     /v1/models, /props, /health and error payloads pass through byte for byte.
//
//   * A RESPONSE THAT CARRIES `tool_calls` IS NEVER REWRITTEN. An agent's tool call is
//     JSON that must survive intact; a script filter has no business touching it. For the
//     same reason this proxy is meant for plain chat front ends (a browser UI, SillyTavern)
//     and NOT for an agent harness, which already has the write-time guard.
//
//   * `accept-encoding` is stripped from the upstream request, so the upstream answers
//     identity and there is nothing to gunzip before filtering. Defensively, a filtered
//     response also drops `content-encoding`.
//
//   * server.requestTimeout is disabled. A 32k-context answer on a local GPU can easily
//     outlive Node's 5-minute default, and the default would kill the connection in the
//     middle of a sentence.
//
//   * Conversion is the unambiguous subset only: phrase tables plus glyph correction.
//     The wording-preference table is opt-in (--wording) and Japanese shinjitai are NEVER
//     converted (- a quoted Japanese sentence has to survive). What is left after
//     conversion is reported as a residual instead, because "the tool converts" and "the
//     tool guarantees" are different claims.

import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// The documented way is the package specifier; the fallback keeps this runnable straight
// from a clone, where the package is not installed by name.
function loadPolicy() {
  try { return require('chinese-script-policy/lib'); }
  catch { return require(path.join(HERE, '..', '..', 'scripts', 'lib.js')); }
}

/** Endpoints whose JSON response carries model-written text. */
const GENERATION_PATHS = new Set([
  '/v1/chat/completions', '/chat/completions',
  '/v1/completions', '/completions',
  '/v1/completion', '/completion',
]);

/** Fields that hold model-written text, in either response shape. */
const TEXT_FIELDS = ['content', 'reasoning_content', 'text'];

/** Refuse absurd uploads rather than buffering forever. */
const MAX_BODY = 64 * 1024 * 1024;

const AXES = { script: true, register: true, japanese: true };

function usage() {
  return [
    'llm-guard-proxy - fix the Chinese script of a local LLM\'s answers on the way out',
    '',
    'usage: node examples/llm-proxy/llm-guard-proxy.mjs [options]',
    '',
    '  --port N          port to listen on (default 8081)',
    '  --upstream URL    server to proxy (default http://127.0.0.1:8080)',
    '  --script MODE     traditional (default) | simplified | off',
    '  --wording         also apply the wording-preference table (default off)',
    '  --quiet           log the start-up line only, not every request',
    '  --help            this text',
    '',
    'Point a chat front end at http://127.0.0.1:<port>/v1 instead of the server\'s own',
    'address. The built-in llama-server web UI works through the proxy too: open the proxy',
    'port in a browser. Do NOT point an agent harness here - see the header of this file.',
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    port: 8081,
    upstream: 'http://127.0.0.1:8080',
    script: 'traditional',
    wording: false,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(arg + ' needs a value');
      return value;
    };
    if (arg === '--help' || arg === '-h') return { help: true };
    else if (arg === '--port') options.port = Number(next());
    else if (arg === '--upstream') options.upstream = next();
    else if (arg === '--script') options.script = next();
    else if (arg === '--wording') options.wording = true;
    else if (arg === '--quiet') options.quiet = true;
    else throw new Error('unknown option: ' + arg);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('--port must be 1..65535');
  }
  if (!['traditional', 'simplified', 'off'].includes(options.script)) {
    throw new Error('--script must be traditional | simplified | off');
  }
  let upstreamUrl;
  try { upstreamUrl = new URL(options.upstream); }
  catch { throw new Error('--upstream must be an absolute URL'); }
  if (!/^https?:$/.test(upstreamUrl.protocol)) throw new Error('--upstream must be http or https');
  return { ...options, upstreamUrl, help: false };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('request body larger than ' + MAX_BODY + ' bytes'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isJsonType(headers) {
  return String((headers && headers['content-type']) || '').includes('application/json');
}

/**
 * Rewrite the text fields of one generation response in place.
 * @returns {{changed: number, skipped: number, residual: string[]}}
 */
function convertResponse(obj, settings, policy) {
  const result = { changed: 0, skipped: 0, residual: [] };
  const holders = [];
  if (Array.isArray(obj && obj.choices)) {
    for (const choice of obj.choices) {
      // /v1/completions puts the text on the choice itself; chat puts it on the message.
      const holder = choice && choice.message ? choice.message : choice;
      if (!holder || typeof holder !== 'object') continue;
      if (Array.isArray(holder.tool_calls) && holder.tool_calls.length) { result.skipped++; continue; }
      holders.push(holder);
    }
  } else if (obj && typeof obj === 'object') {
    // llama.cpp's NATIVE /completion has NO `choices` array - the text is a top-level
    // `content` field. The first version of this file only ever looked inside `choices`,
    // so it filtered nothing at all on /completion and reported "unchanged"; only a live
    // llama-server shows that shape. `prompt` is the CALLER's own text echoed back, which
    // is why it is deliberately not in TEXT_FIELDS.
    holders.push(obj);
  }
  for (const holder of holders) {
    for (const field of TEXT_FIELDS) {
      const before = holder[field];
      if (typeof before !== 'string' || !before) continue;
      const after = convertText(before, settings, policy);
      if (after !== before) {
        holder[field] = after;
        result.changed++;
      }
      // The acceptance check runs on the FINAL text either way, because "nothing to
      // convert" is not the same as "clean": a kokuji has no Chinese ancestor, so the
      // tables cannot touch it, and it has to be REPORTED rather than passed off as an
      // unchanged answer. (Found by scripts/proxy-selftest.mjs: the first version only
      // checked text it had just rewritten, so an unconvertible answer read as clean.)
      const verdict = policy.guardInspect(after, { axes: AXES, scriptTarget: settings.script });
      if (verdict) result.residual.push(String(verdict.reason || '').split('\n')[0]);
    }
  }
  return result;
}

function convertText(text, settings, policy) {
  if (settings.script === 'off') return text;
  if (settings.script === 'simplified') return policy.toSimplified(text, true, false, settings.wording);
  // useJapanese is off on purpose: a quoted Japanese sentence must survive untouched.
  return policy.toTraditional(text, true, true, settings.wording, false);
}

/**
 * Start the proxy.
 * @param {object} options - parsed options (see parseArgs).
 * @returns {Promise<{server: import('node:http').Server, port: number, stats: object, close: () => Promise<void>}>}
 */
export async function startProxy(options = {}) {
  const policy = options.policy || loadPolicy();
  const quiet = Boolean(options.quiet);
  const log = options.log || ((line) => console.log(line));
  // The CLI hands over a parsed URL; a programmatic caller may pass either form. Port 0
  // (an ephemeral port) is legal here even though --port refuses it, so the selftest can
  // run several proxies without picking ports by hand.
  const upstreamUrl = options.upstreamUrl instanceof URL
    ? options.upstreamUrl
    : new URL(String(options.upstreamUrl || options.upstream || 'http://127.0.0.1:8080'));
  const settings = { script: options.script || 'traditional', wording: Boolean(options.wording) };
  const stats = {
    requests: 0, downgraded: 0, converted: 0, unchanged: 0,
    skippedToolCalls: 0, residuals: 0, filtered: 0, passthrough: 0, upstreamErrors: 0,
  };
  const transport = upstreamUrl.protocol === 'https:' ? https : http;

  const server = http.createServer((req, res) => {
    stats.requests++;
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
    const generation = GENERATION_PATHS.has(pathname.toLowerCase());

    readBody(req).then((rawBody) => {
      let body = rawBody;
      let downgraded = false;
      if (rawBody.length && isJsonType(req.headers)) {
        try {
          const parsed = JSON.parse(rawBody.toString('utf8'));
          if (parsed && typeof parsed === 'object' && parsed.stream === true) {
            parsed.stream = false;
            delete parsed.stream_options;
            body = Buffer.from(JSON.stringify(parsed));
            downgraded = true;
            stats.downgraded++;
          }
        } catch { /* not JSON after all: forward the bytes untouched */ }
      }

      const headers = { ...req.headers };
      // Only a response we have to READ needs identity encoding. Everything else - and
      // that includes the built-in web UI's pre-compressed assets - is passed through
      // untouched, so the caller's accept-encoding must survive: llama-server's UI
      // answers 415 "gzip is not supported by this browser" without it, which is exactly
      // what stripping the header unconditionally did on the first live run.
      if (generation) delete headers['accept-encoding'];
      delete headers['transfer-encoding'];
      delete headers['content-length'];
      headers.host = upstreamUrl.host;
      if (body.length) headers['content-length'] = String(body.length);

      const upstreamReq = transport.request({
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === 'https:' ? 443 : 80),
        path: req.url,
        method: req.method,
        headers,
      }, (upstreamRes) => {
        const filterThis = generation && isJsonType(upstreamRes.headers);
        if (!filterThis) {
          stats.passthrough++;
          res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
          upstreamRes.pipe(res);
          return;
        }
        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let out = raw;
          let summary = 'unchanged';
          try {
            const obj = JSON.parse(raw);
            // An error payload is not model text; never rewrite it.
            if (obj && obj.error) {
              summary = 'error payload (passed through)';
            } else if (obj && typeof obj === 'object') {
              // BOTH shapes have to reach convertResponse: OpenAI (`choices`) and
              // llama.cpp's native /completion (the text at the top level). Gating this
              // call on `obj.choices` was the second half of the same bug - the function
              // understood the native shape while the call site never let it see one.
              const result = convertResponse(obj, settings, policy);
              if (result.skipped) stats.skippedToolCalls += result.skipped;
              if (result.residual.length) stats.residuals += result.residual.length;
              if (result.changed) {
                out = JSON.stringify(obj);
                stats.converted += result.changed;
                stats.filtered++;
                summary = 'converted ' + result.changed + ' field(s)';
              } else {
                stats.unchanged++;
                summary = result.skipped ? 'tool_calls: left untouched' : 'unchanged';
              }
              if (result.residual.length) summary += '  residual: ' + result.residual.join(' | ');
            }
          } catch (e) {
            out = raw; // a response we cannot parse must travel unchanged
            summary = 'unparsable (' + String(e && e.message || e) + '): passed through';
          }
          if (!quiet) {
            log('[guard] ' + pathname + (downgraded ? ' (stream -> false)' : '') + '  ' + summary);
          }
          const outHeaders = { ...upstreamRes.headers };
          delete outHeaders['content-encoding'];
          delete outHeaders['content-length'];
          outHeaders['content-length'] = String(Buffer.byteLength(out));
          res.writeHead(upstreamRes.statusCode, outHeaders);
          res.end(out);
        });
      });

      upstreamReq.on('error', (e) => {
        stats.upstreamErrors++;
        const message = 'llm-guard-proxy: upstream ' + upstreamUrl.origin + ' failed: ' +
          String(e && e.message || e);
        log('[guard] ' + message);
        if (res.headersSent) { res.destroy(); return; }
        const payload = JSON.stringify({ error: { message, type: 'proxy_error' } });
        res.writeHead(502, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': String(Buffer.byteLength(payload)),
        });
        res.end(payload);
      });

      if (body.length) upstreamReq.end(body);
      else upstreamReq.end();
    }).catch((e) => {
      const message = 'llm-guard-proxy: ' + String(e && e.message || e);
      if (res.headersSent) { res.destroy(); return; }
      const payload = JSON.stringify({ error: { message, type: 'proxy_error' } });
      res.writeHead(400, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': String(Buffer.byteLength(payload)),
      });
      res.end(payload);
    });
  });

  // A long local generation must not be cut off by Node's default request timeout.
  server.requestTimeout = 0;
  server.headersTimeout = 120000;

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host || '127.0.0.1', resolve);
  });

  const port = server.address().port;
  const close = () => new Promise((resolve) => server.close(() => resolve()));
  return { server, port, stats, close, policy };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error('llm-guard-proxy: ' + String(e && e.message || e));
    console.error('try --help');
    process.exit(2);
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const proxy = await startProxy(options);
  console.log('llm-guard-proxy on http://127.0.0.1:' + proxy.port +
    '  -> ' + options.upstreamUrl.origin +
    '  [script=' + options.script + (options.wording ? ' +wording' : '') + ', non-streaming]');
  console.log('point a chat front end at http://127.0.0.1:' + proxy.port + '/v1' +
    '  (the built-in web UI works too: open http://127.0.0.1:' + proxy.port + '/)');
  const stop = () => {
    console.log('\nllm-guard-proxy: stopping (' + proxy.stats.converted + ' field(s) converted, ' +
      proxy.stats.residuals + ' residual(s) reported)');
    proxy.close().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// Only start when run as a program; importing this file must not bind a port.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('llm-guard-proxy: ' + String(e && e.message || e));
    process.exit(1);
  });
}
