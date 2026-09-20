#!/usr/bin/env node
// Publish-time check: does the PACKED package still work?
//
// How this was found (2026-09-20): `npm test` inside an unpacked tarball had been broken and
// nothing noticed, for two independent reasons that are BOTH invisible in a checkout, because
// a checkout has every file:
//
//   * `scripts/tradzh.js --written --dir .` (part of test:repo) failed on the Cantonese axis -
//     the allow list `cantonese-allow.json` was not in `files`;
//   * `scripts/api-selftest.mjs` crashed with ENOENT on `PUBLISHING.md`, which is deliberately
//     NOT shipped (it is maintainer-only), so a check that reads it cannot run from a tarball.
//
// So the strongest available check is the consumer's own: pack, extract, run the suite there.
// A checkout passing `npm test` proves nothing about what a user actually receives.
//
// Not part of `npm test` (it packs and unpacks, ~15 s): run it before publishing, next to
// `npm run audit`. See PUBLISHING.md section 1 and section 4.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

// Files that must never reach a user: maintainer notes, private name lists, hand-off cards and
// the guard's own hand-written config. `files` is a whitelist, so this is a second opinion -
// the kind that catches a future `"tools"` (whole directory) entry sweeping them in.
const MUST_NOT_SHIP = ['.ship-deny.txt', 'PUBLISHING.md', 'tools/docs.config.mjs'];
const CARD_PREFIX = 'NEXT-';

let failures = 0;
const fail = (message) => { failures++; console.log('  FAIL ' + message); };
const ok = (message) => console.log('  ok   ' + message);

// `npm` is npm.cmd on Windows, so go through the CLI js that npm itself told us about.
const npmCli = process.env.npm_execpath;
if (!npmCli || !existsSync(npmCli)) {
  console.error('  SKIP the tarball check must be started through npm (npm run test:tarball)');
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'csp-tarball-'));
try {
  const packed = spawnSync(process.execPath, [npmCli, 'pack', '--silent', '--pack-destination', work], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (packed.status !== 0) {
    fail('npm pack failed: ' + (packed.stderr || '').trim().split('\n').slice(-3).join(' | '));
    throw new Error('pack');
  }
  const tgz = readdirSync(work).find((name) => name.endsWith('.tgz'));
  if (!tgz) {
    fail('npm pack produced no .tgz');
    throw new Error('pack');
  }
  const size = statSync(join(work, tgz)).size;

  const untar = spawnSync('tar', ['-xzf', join(work, tgz), '-C', work], { encoding: 'utf8' });
  if (untar.status !== 0) {
    fail('tar failed: ' + (untar.stderr || '').trim().split('\n').slice(-3).join(' | '));
    throw new Error('untar');
  }
  const pkg = join(work, 'package');
  if (!existsSync(join(pkg, 'package.json'))) {
    fail('the tarball has no package/package.json');
    throw new Error('untar');
  }

  // Every file in the archive, relative to package/.
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else files.push(abs.slice(pkg.length + 1).replace(/\\/g, '/'));
    }
  })(pkg);

  const leaked = files.filter((rel) =>
    MUST_NOT_SHIP.includes(rel) || rel.split('/').some((part) => part.startsWith(CARD_PREFIX)));
  ok('the tarball holds no maintainer-only file (' + files.length + ' files, ' +
    Math.round(size / 1024) + ' KB)');
  if (leaked.length) fail('maintainer-only file(s) in the tarball: ' + leaked.join(', '));

  // The guard is shipped WITHOUT its config on purpose: the wrapper then prints "skipped" and
  // exits 0, so a consumer's suite keeps working. Both halves are asserted here - the file is
  // present (otherwise `node tools/docs.mjs` is MODULE_NOT_FOUND) and the config is not.
  if (!files.includes('tools/docs.mjs')) fail('tools/docs.mjs is missing: test:docs would be MODULE_NOT_FOUND');
  if (files.includes('tools/docs.config.mjs')) fail('tools/docs.config.mjs shipped: the guard would run without its docs');

  // The real test: run the packaged suite the way a consumer would.
  const suite = spawnSync(process.execPath, [npmCli, 'test'], { cwd: pkg, encoding: 'utf8' });
  const tail = (suite.stdout || '').trim().split('\n').slice(-4).join(' | ');
  if (suite.status === 0) {
    ok('npm test passes inside the unpacked tarball');
  } else {
    fail('npm test failed inside the unpacked tarball (exit ' + suite.status + '): ' + tail);
  }
} catch (error) {
  if (!failures) fail(String(error && error.message ? error.message : error));
} finally {
  // The temp dir is the only thing this script creates; leave nothing behind.
  try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
}

console.log(failures
  ? '\nFAIL: the packed package is not the package we tested (' + failures + ' problem(s))'
  : '\nPASS: the tarball a user receives passes the suite and ships no maintainer file');
process.exit(failures ? 1 : 0);
