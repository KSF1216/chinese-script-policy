// ---------------------------------------------------------------------------
// DO NOT RUN. Historical one-off, kept as a record of how the 用語偏好 fixtures
// were authored in 2026-09. It still writes the OLD keys (twVocab) and the OLD
// flag name, so re-running it would clobber the current selftest-cases.json.
// ---------------------------------------------------------------------------// Add the UI fixture for the regional vocabulary option, plus the selftest fixtures
// for the conversion layer itself.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// Resolved from this file so the record works in any clone (no absolute local path).
const F = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'selftest-cases.json');
const j = JSON.parse(fs.readFileSync(F, 'utf8'));

// Web page: [simplified input, output WITH 臺灣用語 on]
j.ui.convert.twVocab = ['软件和硬盘都坏了，网络要更新', '軟體和硬碟都壞了，網路要更新'];

// CLI conversion layer: [input, without --tw-vocab, with --tw-vocab]
j.twVocab = [
  ['软件', '軟件', '軟體'],
  ['硬盘', '硬盤', '硬碟'],
  ['鼠标', '鼠標', '滑鼠'],
  ['内存', '內存', '記憶體'],
  ['屏幕', '屏幕', '螢幕'],
  ['信息', '信息', '資訊'],
  ['网络', '網絡', '網路'],
  ['激光', '激光', '雷射'],
  ['服务器', '服務器', '伺服器'],
  ['数据库', '數據庫', '資料庫'],
  ['打印机', '打印機', '印表機'],
  // Guards: these must NOT change even with the option on. 地鐵/幼兒園 are the same
  // word on both sides of the strait, and OpenCC's table simply does not cover them;
  // the point of pinning them is that turning the option on must not start mangling
  // text that was already right.
  ['地铁', '地鐵', '地鐵'],
  ['幼儿园', '幼兒園', '幼兒園'],
  ['面对', '面對', '面對'],
  ['面条', '麵條', '麵條'],
];

fs.writeFileSync(F, JSON.stringify(j, null, 2) + '\n', 'utf8');
console.log('twVocab fixtures:', j.twVocab.length, '| ui fixture:', JSON.stringify(j.ui.convert.twVocab));
