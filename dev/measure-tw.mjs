// Measure the vocabulary layer's real behaviour, including the cases I earlier called
// "defects", so the documentation states facts rather than guesses.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'scripts', 'tradzh.js');
const tw = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'tc-vocabulary.json'), 'utf8')).phrase;

function conv(text, vocab) {
  const args = [CLI, '--to-traditional', '--text', text];
  if (vocab) args.splice(1, 0, '--wording');
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' });
  return out.split('\n')[0].replace('CONVERTED: ', '');
}

const CASES = ['方便面', '软件', '硬盘', '鼠标', '内存', '信息', '屏幕', '视频', '出租车',
  '网络', '激光', '服务器', '数据库', '打印机', '公交车', '幼儿园', '地铁', '土豆', '酸奶', '自行车'];
console.log('簡體        預設          加 --wording');
let same = 0, changed = 0;
for (const c of CASES) {
  const a = conv(c, false);
  const b = conv(c, true);
  if (a === b) same++; else changed++;
  console.log('  ' + c.padEnd(10) + a.padEnd(14) + b + (a === b ? '' : '   ← 變了'));
}
console.log('\n不同: ' + changed + ' / 相同: ' + same + ' / 共 ' + CASES.length);

// Is the 方便面 defect fixed? Its Traditional key would be 方便麵.
console.log('\n相關詞組查表:');
for (const k of ['方便麵', '泡麵', '速食麵', '硬盤', '軟件', '鼠標']) {
  console.log('  ' + k + ' -> ' + (tw[k] || '(表裡沒有)'));
}
