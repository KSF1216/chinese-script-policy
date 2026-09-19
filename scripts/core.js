// Pure logic for the chinese-script-policy tools: text in, text out.
//
// This file has ZERO Node dependencies - no fs, no path, no process. Tables are
// INJECTED via createCore(), so exactly the same algorithm runs in:
//   - Node (require('./core.js')) - the CLI, the write hook, the tests
//   - a browser (<script src="core.js"> -> window.TradzhCore) - see build-web.js
// That is the whole point: one implementation, several front ends. A second copy
// of this algorithm in the web page would drift, and drift is the bug this repo
// keeps having to fix.
//
// The IO half (reading the JSON tables, walking directories, encoding detection)
// stays in lib.js, which wires the two together.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TradzhCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // --------------------------------------------------------------- scanning ---
  // A line carrying one of these markers - or preceded by one - is skipped.
  // Documentation about Simplified Chinese / Cantonese has to be able to quote it.
  const SKIP_MARKERS = ['check-ok', 'simplified-example', 'no-check'];

  // Shared by every scan so the three axes can never disagree about which lines
  // are exempt.
  function lineSkipped(lines, i) {
    return SKIP_MARKERS.some((m) => lines[i].includes(m)) ||
           (i > 0 && SKIP_MARKERS.some((m) => lines[i - 1].includes(m)));
  }

  function summarize(hits) {
    const chars = new Set();
    for (const h of hits) for (const c of h.chars || []) chars.add(c);
    return { lines: hits.length, chars: [...chars] };
  }

  // Total occurrences across every axis a hit can carry. Callers must use this
  // instead of h.chars.length, or register hits (which have no glyphs of their
  // own) would count as zero.
  function hitOccurrences(hits) {
    let n = 0;
    for (const h of hits) n += (h.chars ? h.chars.length : 0) + (h.phrases ? h.phrases.length : 0);
    return n;
  }

  // Minimal glob to regex: ** crosses separators, * within a segment, ? one char.
  function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
      const c = glob[i];
      if (c === '*') {
        if (glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
        else re += '[^/\\\\]*';
      } else if (c === '?') re += '.';
      else if ('\\^$.|+()[]{}'.includes(c)) re += '\\' + c;
      else if (c === '/') re += '[/\\\\]';
      else re += c;
    }
    return new RegExp('^' + re + '$', 'i');
  }

  // Marker-aware scan against an arbitrary glyph set.
  function scanTextWith(set, text) {
    const hits = [];
    const lines = String(text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lineSkipped(lines, i)) continue;
      const chars = [];
      for (const ch of lines[i]) if (set.has(ch)) chars.push(ch);
      if (chars.length) {
        hits.push({ line: i + 1, chars: [...new Set(chars)], text: lines[i].trim().slice(0, 100) });
      }
    }
    return hits;
  }

  // --------------------------------------------------------------- encoding ---
  // Windows PowerShell 5.1 reads files as ANSI by default and Set-Content
  // -Encoding UTF8 writes a BOM; both caused real corruption here. So encoding is
  // always decided from the bytes, never from a shell or editor default.
  // TextDecoder exists in browsers too, so the web page reads Big5/GB18030 files
  // with this same function instead of its own copy.
  //
  // Detection used to be "the first of utf-8 / big5 / gb18030 that decodes without
  // throwing". GB18030 accepts almost any byte pair, so the answer was often a
  // confident wrong one. Measured on this machine (2026-09), with real files
  // written through the matching code page:
  //
  //   jp-sjis.txt (cp932)  -> "GB18030", 33 hanzi, 0 kana   <- reads as pure hanzi
  //   the same bytes       -> Shift-JIS, 70% kana           <- the truth was there
  //   kr-euckr.txt (cp949) -> "BIG5", 89% hanzi + 11% PUA   <- only PUA caught it
  //   de-acc-cp1252.txt    -> "BIG5", half hanzi, half PUA  <- garbage, exit 0
  //   fr-acc-cp1252.txt    -> undecodable (silently skipped, exit 0)
  //   tc-big5.txt          -> "BIG5", correct
  //
  // Two conclusions shaped the code below:
  //   1. "Does it look like Chinese?" cannot work - mojibake of any CJK language
  //      is hanzi. The usable signal is POSITIVE identification of a neighbour
  //      language, which those same bytes usually still carry.
  //   2. Half-width katakana (U+FF61-U+FF9F) must NOT count as kana: every Big5
  //      file decodes to 78% half-width katakana under Shift-JIS. Full-width kana
  //      stays at 0% for real Chinese, so it is the clean discriminator.
  function scriptMix(text) {
    const m = { all: 0, ascii: 0, nonAscii: 0, han: 0, kana: 0, halfKana: 0, hangul: 0, pua: 0, latin: 0, cyr: 0 };
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0);
      m.all++;
      if (cp < 0x80) { m.ascii++; continue; }
      m.nonAscii++;
      if ((cp >= 0x3040 && cp <= 0x30FF) || (cp >= 0x31F0 && cp <= 0x31FF)) m.kana++;
      else if (cp >= 0xFF61 && cp <= 0xFF9F) m.halfKana++;
      else if ((cp >= 0xAC00 && cp <= 0xD7A3) || (cp >= 0x1100 && cp <= 0x11FF) ||
               (cp >= 0x3130 && cp <= 0x318F)) m.hangul++;
      else if ((cp >= 0x3400 && cp <= 0x9FFF) || (cp >= 0xF900 && cp <= 0xFAFF)) m.han++;
      else if (cp >= 0xE000 && cp <= 0xF8FF) m.pua++;
      else if (cp >= 0x00C0 && cp <= 0x024F) m.latin++;
      else if (cp >= 0x0400 && cp <= 0x04FF) m.cyr++;
    }
    return m;
  }

  // A language claim needs enough evidence and a DOMINANT share of that language's
  // own script. Dominance, not mere presence, is the point: a genuine GB18030
  // Simplified file decoded as EUC-KR comes out 46% hangul mixed with 43% hanzi, and
  // a 20% threshold happily called that Korean - a false positive worse than the bug
  // it was fixing, because it labels a Chinese file foreign and skips it. Real
  // Korean scores 100%, real Japanese 70% kana.
  const OTHER_MIN_NONASCII = 8;

  // Japanese allows a mixed decode (kana plus the kanji that belong with it); Korean
  // does not - a Korean text has no hanzi to speak of.
  const OTHER_RULES = [
    { enc: 'shift_jis', ok: (m) => m.kana / m.nonAscii >= 0.3 && (m.kana + m.han) / m.nonAscii >= 0.8,
      label: 'Japanese (Shift-JIS, not Chinese)' },
    { enc: 'euc-kr', ok: (m) => m.hangul / m.nonAscii >= 0.8,
      label: 'Korean (EUC-KR, not Chinese)' },
  ];

  function decodeWith(buf, enc) {
    try { return new TextDecoder(enc, { fatal: true }).decode(buf); } catch { return null; }
  }

  // Score one Chinese-charset candidate: how many of its hanzi are characters the
  // caller's tables know, minus private-use characters (which are never real text).
  // `known` is optional; without it every hanzi counts, which is the weaker fallback.
  function chineseScore(text, known) {
    let han = 0;
    let knownHan = 0;
    let pua = 0;
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0);
      if (cp >= 0xE000 && cp <= 0xF8FF) { pua++; continue; }
      if (!((cp >= 0x3400 && cp <= 0x9FFF) || (cp >= 0xF900 && cp <= 0xFAFF))) continue;
      han++;
      if (!known || known.has(ch)) knownHan++;
    }
    return { han, known: knownHan, pua, score: knownHan - pua, knownOfHan: han ? knownHan / han : 1 };
  }

  // Encoding names whose bytes cannot be turned into checkable text. 'not-chinese'
  // is a definite answer ("this is Japanese"), 'undecodable' is the absence of one.
  const NO_TEXT = { binary: 1, undecodable: 1, 'not-chinese': 1 };

  // `known` is an optional Set of hanzi the caller's tables know (see
  // createCore().knownHanzi() in lib.js). Without it the Chinese tiebreak falls back
  // to counting hanzi only, which is weaker - pass it when the tables are loaded.
  function detectEncoding(buf, known) {
    // BOMs and NUL bytes are facts, not guesses.
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      return { enc: 'utf-8-bom', offset: 3, label: 'UTF-8 with BOM' };
    }
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
      return { enc: 'utf-16le', offset: 2, label: 'UTF-16 LE' };
    }
    if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
      return { enc: 'utf-16be', offset: 2, label: 'UTF-16 BE' };
    }
    const head = buf.subarray(0, Math.min(8192, buf.length));
    if (head.includes(0)) return { enc: 'binary', offset: 0, label: 'binary' };
    if (decodeWith(buf, 'utf-8') !== null) {
      return { enc: 'utf-8', offset: 0, label: 'UTF-8 (no BOM)' };
    }
    // Neighbour languages first: GB18030 would happily claim these same bytes.
    for (const o of OTHER_RULES) {
      const text = decodeWith(buf, o.enc);
      if (text === null) continue;
      const m = scriptMix(text);
      if (m.nonAscii >= OTHER_MIN_NONASCII && o.ok(m)) {
        return { enc: 'not-chinese', offset: 0, label: o.label };
      }
    }
    // Single-byte Western/Cyrillic: mostly ASCII with a few accented letters. A
    // real Big5/GB18030 file is almost entirely non-ASCII, so this cannot catch
    // one. The label names the family, not the language - telling windows-1251
    // from koi8-r, or cp1252 from latin-1, needs frequency data this repo has none
    // of, and claiming one would be another confident guess.
    for (const enc of ['windows-1251', 'iso-8859-1']) {
      const text = decodeWith(buf, enc);
      if (text === null) continue;
      const m = scriptMix(text);
      if (m.nonAscii >= 3 && m.all >= OTHER_MIN_NONASCII &&
          m.ascii / m.all >= 0.7 && (m.latin + m.cyr) / m.nonAscii >= 0.5) {
        return { enc: 'not-chinese', offset: 0, label: 'Western/Cyrillic single-byte (not Chinese)' };
      }
    }
    // Chinese legacy: Big5 or GB18030. Both can decode the same bytes into hanzi, so
    // "first one that does not throw" (the old behaviour) mangled every Simplified
    // GB file. The tiebreaker is how many of the decoded hanzi this project's own
    // curated tables know - measured on 2026-09:
    //
    //   tc-big5.txt   big5: 25/25 known, 0 PUA  |  gb18030:  8 known, 9 PUA  -> Big5
    //   sc-gb18030    big5: 13 known,   1 PUA   |  gb18030: 25/25 known       -> GB18030
    //   hk-cp950.txt  big5:  4 known,   0 PUA   |  gb18030:  1 known, 6 PUA  -> Big5
    //   jp-sjis.txt   big5: throws              |  gb18030:  5 of 33 known   -> rejected
    //
    // Counting hanzi instead of known hanzi does not work: the GB file scores 86% as
    // Big5 and 89% as GB18030, a coin flip. Counting known hanzi separates them 54%
    // against 100%.
    const scored = [];
    for (const cand of ['big5', 'gb18030']) {
      const text = decodeWith(buf, cand);
      if (text === null) continue;
      const s = chineseScore(text, known);
      if (s.knownOfHan >= 0.3 && s.score > 0) scored.push({ enc: cand, score: s.score });
    }
    if (scored.length) {
      scored.sort((a, b) => b.score - a.score);
      // A near-tie means the bytes genuinely support both readings. Saying so is
      // better than a coin flip that silently mangles one of them.
      if (scored.length > 1 && scored[0].score - scored[1].score <= 2) {
        return {
          enc: 'undecodable', offset: 0,
          label: 'ambiguous: ' + scored[0].enc.toUpperCase() + ' and ' + scored[1].enc.toUpperCase() +
            ' both fit - convert it to UTF-8 to be sure',
        };
      }
      return { enc: scored[0].enc, offset: 0, label: scored[0].enc.toUpperCase() + ' (legacy)' };
    }
    // Nothing fits. Saying so is the whole point: the callers count this as a
    // failure instead of skipping the file in silence.
    return { enc: 'undecodable', offset: 0, label: 'undecodable (no known encoding)' };
  }

  // ------------------------------------------------------------ PUA warning ---
  // Private-use area characters. They are the tell-tale sign of a Big5 / HKSCS
  // file decoded through a PUA mapping: cp950 and Node's big5 decoder both turn
  // HKSCS characters into U+E000-U+F8FF instead of proper hanzi. The text then
  // looks fine to every other check - PUA characters are in none of our tables -
  // while those characters are actually lost. Silence is the dangerous outcome,
  // so the tool says it out loud (see puaChars / scanTextPua).
  function isPua(cp) {
    return (cp >= 0xE000 && cp <= 0xF8FF) ||
           (cp >= 0xF0000 && cp <= 0xFFFFD) ||
           (cp >= 0x100000 && cp <= 0x10FFFD);
  }

  function puaChars(text) {
    const out = [];
    for (const ch of String(text)) {
      if (isPua(ch.codePointAt(0)) && out.indexOf(ch) < 0) out.push(ch);
    }
    return out;
  }

  // Same hit shape as the other scans, so callers can report it the same way.
  function scanTextPua(text) {
    const hits = [];
    const lines = String(text).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lineSkipped(lines, i)) continue;
      const chars = [];
      for (const ch of lines[i]) if (isPua(ch.codePointAt(0))) chars.push(ch);
      if (chars.length) {
        hits.push({ line: i + 1, chars: [...new Set(chars)], text: lines[i].trim().slice(0, 100) });
      }
    }
    return hits;
  }

  // Bytes -> text, using detectEncoding. Returns text: null when the bytes cannot
  // become checkable text (binary, undecodable, or identified as another language).
  function decodeText(buf, known) {
    const det = detectEncoding(buf, known);
    if (NO_TEXT[det.enc]) return { text: null, ...det };
    const text = new TextDecoder(det.enc === 'utf-8-bom' ? 'utf-8' : det.enc)
      .decode(buf.subarray(det.offset));
    return { text, ...det };
  }

  // ------------------------------------------------------------- the factory ---
  // tables = {
  //   simplifiedOnly:   string[] | Set   (glyphs that exist only in Simplified)
  //   traditionalOnly:  string[] | Set   (glyphs that exist only in Traditional)
  //   japanese:         { chars, map, phrases } Japanese shinjitai + their Traditional forms  // check-ok
  //                     (phrases are detection-only: Japanese-only WORDS like 予定 丁寧)
  //   t2s:              { char, phrase }            Traditional -> Simplified
  //   s2t:              { maxLen, char, phrase, tc } Simplified -> Traditional
  //   tcVocab:          { maxLen, phrase }  REGIONAL VOCABULARY (軟件 -> 軟體), opt-in
  //   scVocab:          { maxLen, phrase }  the reverse wording layer (軟體 -> 軟件), opt-in
  //   compat:           { map }             compatibility ideographs -> canonical forms
  //   cantonese:        { chars, phrases }          register markers
  // }
  function createCore(tables = {}) {
    const asSet = (v) => (v instanceof Set ? v : new Set(v || []));
    const simplifiedOnly = asSet(tables.simplifiedOnly);
    const traditionalOnly = asSet(tables.traditionalOnly);
    const japanese = tables.japanese || {};
    const japaneseChars = asSet(japanese.chars);
    const japaneseMap = japanese.map || {};
    // Japanese-only WORDS (予定 予約 丁寧 世論). Detection only, on purpose: see build-jp.js  // check-ok
    // - a wrong conversion corrupts text, a wrong detection only blocks a write.
    const japanesePhrases = japanese.phrases || [];
    const cantonese = tables.cantonese || {};
    const cantoneseChars = asSet(cantonese.chars);
    const cantonesePhrases = cantonese.phrases || [];
    // The convertible subset of the register axis: Cantonese strings that cannot occur
    // in written Chinese at all (see cantonese-only.json's convert_rule). Kept apart
    // from the detection lists on purpose - detection may be generous, conversion may not.
    const cantoneseConvertChars = cantonese.convertChars || {};
    const cantoneseConvertPhrases = cantonese.convertPhrases || {};
    // Phrases made only of ordinary characters (點解, 屋企, 邊度) also occur across word
    // boundaries in written Chinese - 早點解決, 房屋企業, 旁邊度過 - so on their own they are
    // not evidence of anything. They are reported only when the SAME line carries a marker
    // that cannot be written Chinese (a Cantonese-only glyph, a self-sufficient phrase, or
    // a word-order pattern). Measured 2026-09 without this rule:
    // 「房屋企業在旁邊度過，早點解決問題。」 produced three Cantonese hits, and the write
    // hook would have blocked a perfectly ordinary sentence.
    const cantoneseWeakPhrases = cantonese.weakPhrases || [];
    // Word-order patterns: the markers no word list can see (你行先 -> 你先走,  // check-ok
    // 我食緊飯 -> 我正在吃飯, 畀本書我 -> 給我一本書). Each carries a lookahead for the  // check-ok
    // written-Chinese compounds that begin the same way (演講先生, 實行先進, 零食緊缺),  // check-ok
    // because a false alarm here blocks a write. Heuristic by design; see cantonese.md.
    const cantonesePatterns = (cantonese.patterns || []).map((p) => new RegExp(p.re, 'g'));
    let cantoneseConvertMaxLen = 2;
    for (const k of Object.keys(cantoneseConvertPhrases)) {
      const n = [...k].length;
      if (n > cantoneseConvertMaxLen) cantoneseConvertMaxLen = n;
    }
    const t2s = tables.t2s || { char: {}, phrase: {} };
    const s2t = tables.s2t || { maxLen: 2, char: {}, phrase: {}, tc: {} };
    const tcVocab = tables.tcVocab || { maxLen: 2, phrase: {} };
    // The reverse wording layer (tc wording -> sc wording), used only by
    // --to-simplified --wording.
    const scVocab = tables.scVocab || { maxLen: 2, phrase: {} };
    // Compatibility ideographs (U+F900-FAFF ...) -> canonical characters. A map, not a
    // step: normalisation is applied by both conversion directions.
    const compat = (tables.compat && tables.compat.map) || {};

    // One character at a time substitution, shared by the glyph-preference pass and
    // the Japanese pass so both are literally the same operation.
    function mapChars(text, table) {
      let out = '';
      for (const ch of String(text)) out += (table[ch] !== undefined) ? table[ch] : ch;
      return out;
    }

    // Longest-match phrase substitution over already-converted text: the same greedy
    // loop the script pass uses, pulled out because the regional vocabulary layer is a
    // separate step that runs on the output of the first one.
    function mapPhrases(text, table, maxLen) {
      const src = [...String(text)];
      let out = '';
      let i = 0;
      while (i < src.length) {
        let hit = false;
        for (let len = Math.min(maxLen, src.length - i); len >= 2; len--) {
          const v = table[src.slice(i, i + len).join('')];
          if (v !== undefined) { out += v; i += len; hit = true; break; }
        }
        if (hit) continue;
        out += src[i];
        i++;
      }
      return out;
    }

    // ---------------------------------------------------- compatibility ideographs ---
    // U+F900-FAFF (and a few others) are DUPLICATE encodings of ordinary characters that
    // arrive from round-tripping Big5 / JIS / KS X 1001 text. They look identical on
    // screen and are a different code point, so nothing downstream can tell - search,
    // dedup and comparison fail silently. Normalisation, applied by both directions.
    function normalizeCompatibility(text) { return mapChars(text, compat); }
    function compatChars(text) {
      return [...new Set([...String(text)].filter((ch) => compat[ch] !== undefined))];
    }
    function scanTextCompat(text) {
      const hits = [];
      const lines = String(text).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lineSkipped(lines, i)) continue;
        const chars = compatChars(lines[i]);
        if (chars.length) hits.push({ line: i + 1, chars, text: lines[i].trim().slice(0, 100) });
      }
      return hits;
    }

    function glyphSet() { return simplifiedOnly; }
    function traditionalOnlyGlyphs() { return traditionalOnly; }
    function japaneseOnlyGlyphs() { return japaneseChars; }
    function japaneseTables() { return { chars: japaneseChars, phrases: japanesePhrases }; }
    function t2sTables() { return t2s; }
    function s2tTables() { return s2t; }
    function cantoneseTables() {
      return {
        chars: cantoneseChars,
        phrases: cantonesePhrases,
        weakPhrases: cantoneseWeakPhrases,
        patterns: cantonesePatterns.length,
        convertChars: cantoneseConvertChars,
        convertPhrases: cantoneseConvertPhrases,
      };
    }

    // ------------------------------------------------------------ named steps ---
    // Each axis is one pure function so a caller can run them as separate passes (the
    // CLI exposes them one flag at a time) instead of one welded-together conversion.
    // Ordering is the caller's business, and there is one correct order: Japanese
    // first, then the register, then the script - because 竜 has no entry in the  // check-ok
    // Traditional->Simplified tables, so 竜 -> 龍 -> 龙 only works in that order.  // check-ok

    // Japanese shinjitai -> their Traditional forms (竜 -> 龍). Separate from the script  // check-ok
    // conversion because quoting Japanese in a Chinese document is legitimate: whether
    // to rewrite it is the caller's decision, not a side effect of converting scripts.
    function stripJapanese(text) { return mapChars(text, japaneseMap); }

    // Longest phrase match, else a single-character substitution: the same matching rule
    // as the script pass, pulled out so the project has ONE rule rather than two that
    // drift apart.
    function mapWithFallback(text, phraseTable, charTable, maxLen) {
      const src = [...String(text)];
      let out = '';
      let i = 0;
      while (i < src.length) {
        let hit = false;
        for (let len = Math.min(maxLen, src.length - i); len >= 2; len--) {
          const v = phraseTable[src.slice(i, i + len).join('')];
          if (v !== undefined) { out += v; i += len; hit = true; break; }
        }
        if (hit) continue;
        const ch = src[i];
        out += (charTable[ch] !== undefined) ? charTable[ch] : ch;
        i++;
      }
      return out;
    }

    // Cantonese -> written Chinese, PARTIAL by design: only strings that cannot occur in
    // written Chinese at all (嘅 -> 的, 唔該 -> 謝謝). 屋企/邊度/得閒/點解 look just as  // check-ok
    // Cantonese but are made of ordinary characters that occur across word boundaries  // check-ok
    // (房屋企業, 旁邊度過, 取得閒置, 早點解決), so converting them would corrupt real  // check-ok
    // text; they stay detection-only. A partial conversion must never look complete,
    // which is why the CLI reports what it could not convert.
    function toWritten(text) {
      return mapWithFallback(text, cantoneseConvertPhrases, cantoneseConvertChars, cantoneseConvertMaxLen);
    }

    // Every hanzi this project's own tables mention, in either direction. Used as a
    // frequency proxy when telling a real Chinese decoding from a wrong one: the
    // tables are curated common characters (11,129 of them), so a correct decode of
    // real text scores ~100% and a decode with the wrong charset scores ~55%
    // (measured - see detectEncoding). Built on first use, ~10 ms, cached.
    let knownCache = null;
    function knownHanzi() {
      if (knownCache) return knownCache;
      const set = new Set();
      const add = (s) => { for (const ch of String(s)) set.add(ch); };
      for (const table of [t2s, s2t]) {
        for (const k of Object.keys(table.char || {})) add(k);
        for (const v of Object.values(table.char || {})) add(v);
        for (const k of Object.keys(table.phrase || {})) add(k);
        for (const v of Object.values(table.phrase || {})) add(v);
      }
      for (const ch of cantoneseChars) add(ch);
      for (const p of cantonesePhrases) add(typeof p === 'string' ? p : (p && p.phrase) || '');
      knownCache = set;
      return set;
    }

    // Simplified-only glyphs: flag them when the text claims to be Traditional.
    function scanText(text) {
      const hits = [];
      const lines = String(text).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lineSkipped(lines, i)) continue;
        const chars = [];
        for (const ch of lines[i]) if (simplifiedOnly.has(ch)) chars.push(ch);
        if (chars.length) {
          hits.push({ line: i + 1, chars: [...new Set(chars)], text: lines[i].trim().slice(0, 100) });
        }
      }
      return hits;
    }

    // Three layers, because any one alone is wrong:  // check-ok
    //   - `chars`     Cantonese-only characters (嘅 咗 佢 哋 嘢 ...)  // check-ok
    //   - `phrases`   wording built from standard characters, but unambiguously Cantonese  // check-ok
    //                 (唔該 有冇 嗰個 乜嘢); the only place a shared glyph may appear  // check-ok
    //   - `weakPhrases` + `patterns`  wording that a Chinese writer also produces  // check-ok
    //                 (點解/屋企/邊度), and word order (行先/緊/畀…我). The weak phrases  // check-ok
    //                 need corroboration on the same line; see the note where they are read.
    function scanTextCantonese(text) {
      const hits = [];
      const lines = String(text).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lineSkipped(lines, i)) continue;
        const line = lines[i];
        const foundChars = [...new Set([...line].filter((ch) => cantoneseChars.has(ch)))];
        const foundPhrases = [...new Set(cantonesePhrases.filter((p) => line.includes(p)))];
        const foundPatterns = [];
        for (const re of cantonesePatterns) {
          const m = line.match(re);
          if (m) for (const hit of m) if (!foundPatterns.includes(hit)) foundPatterns.push(hit);
        }
        const strong = foundChars.length || foundPhrases.length || foundPatterns.length;
        const weak = strong ? [...new Set(cantoneseWeakPhrases.filter((p) => line.includes(p)))] : [];
        const phrases = [...new Set([...foundPhrases, ...weak, ...foundPatterns])];
        if (foundChars.length || phrases.length) {
          hits.push({ line: i + 1, chars: foundChars, phrases, text: line.trim().slice(0, 100) });
        }
      }
      return hits;
    }

    // Fourth axis: glyphs that are Japanese in modern use and are not valid
    // Traditional Chinese (竜 発 図 円 駅 亜 仏 猫 姉 値). A shinjitai is neither  // check-ok
    // Simplified nor Traditional, so the Simplified-only table cannot see it: of
    // OpenCC's 403 shinjitai entries, 112 were already caught by the Simplified table,
    // 48 by the conversion tables, and the other 243 were invisible to this tool.
    // Glyphs that cp950 can represent are deliberately absent from the table (峰, 群,
    // 床, 才 ... would be false alarms) - see build-jp.js.
    //
    // The phrase layer is the same axis one level up: 予定 予約 丁寧 世論 are Japanese  // check-ok
    // WORDS whose characters are all valid Traditional Chinese, so no character table
    // can see them. Unlike the Cantonese axis, an unfiltered Japanese phrase table
    // would flag real Chinese (交差, 暴露, 放棄), so it ships as a curated subset -
    // see PHRASE_EXCLUDE in build-jp.js. It is detection only: --to-traditional is not
    // allowed near it.
    function scanTextJapanese(text) {
      const hits = [];
      const lines = String(text).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lineSkipped(lines, i)) continue;
        const chars = [];
        for (const ch of lines[i]) if (japaneseChars.has(ch)) chars.push(ch);
        const foundChars = [...new Set(chars)];
        const foundPhrases = [...new Set(japanesePhrases.filter((p) => lines[i].includes(p)))];
        if (foundChars.length || foundPhrases.length) {
          hits.push({ line: i + 1, chars: foundChars, phrases: foundPhrases, text: lines[i].trim().slice(0, 100) });
        }
      }
      return hits;
    }

    // Scan against a chosen axis. variant 'traditional' (default) flags
    // Simplified-only glyphs, 'simplified' flags Traditional-only glyphs,
    // 'written' flags Cantonese colloquial markers, and 'japanese' flags Japanese
    // shinjitai (glyphs that are Japanese in modern use and not valid Traditional).
    function scanTextVariant(text, variant) {
      if (variant === 'simplified') return scanTextWith(traditionalOnly, text);
      if (variant === 'written') return scanTextCantonese(text);
      if (variant === 'japanese') return scanTextJapanese(text);
      return scanText(text);
    }

    // Traditional -> Simplified. Character level first; the phrase table only has
    // 480 entries because this direction mostly merges many-to-one, so ambiguity
    // is far lower than the Simplified -> Traditional direction.
    //
    // The window comes from the table (maxLen). It used to be a hard-coded 10 here,
    // which is exactly the kind of number that silently stops matching the day a
    // longer entry is generated; 10 stays as the fallback for tables loaded from
    // somewhere else.
    //
    // The Japanese pass runs FIRST here, not last, and only when asked for: a shinjitai
    // has no entry in the Traditional->Simplified tables (竜 is not a Traditional  // check-ok
    // character), so without this step --to-simplified emits 竜/発/図 unchanged - a  // check-ok
    // Simplified file with Japanese glyphs in it, silently. Going through the Traditional
    // form is what makes the chain work: 竜 -> 龍 -> 龙. Kokuji cannot be fixed  // check-ok
    // either way (畑 has no Chinese ancestor), which is why the axis only flags them.
    function toSimplified(text, usePhrases = true, useJapanese = false, useWording = false) {
      const { maxLen = 10, char, phrase } = t2s;
      let prepared = normalizeCompatibility(String(text));
      // The reverse wording layer maps tc wording to sc wording on the
      // Traditional side, so it runs before the script pass: 軟體 -> 軟件 -> 软件.  // check-ok
      if (useWording) prepared = mapPhrases(prepared, scVocab.phrase, scVocab.maxLen);
      const s = useJapanese ? stripJapanese(prepared) : prepared;
      let out = '';
      let i = 0;
      while (i < s.length) {
        let hit = false;
        if (usePhrases) {
          for (let len = Math.min(maxLen, s.length - i); len >= 2; len--) {
            const v = phrase[s.substr(i, len)];
            if (v) { out += v; i += len; hit = true; break; }
          }
        }
        if (hit) continue;
        const ch = s[i];
        out += (char[ch] !== undefined) ? char[ch] : ch;
        i++;
      }
      return out;
    }

    // Simplified -> Traditional, offline. This is the direction that needs care:
    // one Simplified glyph can map to several Traditional ones (干 -> 乾/幹/干),
    // so the character table alone gets roughly half of common words wrong. The
    // 49,257-entry phrase table is what makes it usable. Identity entries in that
    // table are load-bearing: they block a shorter wrong phrase from firing
    // inside a longer correct one (干涉 must not become 幹涉), so never prune them.
    //
    // useTc applies OpenCC's TWVariants as a final pass, so the output uses the common
    // glyph forms (裡 not 裏, 麵 not 麪).
    //
    // useJapanese applies the shinjitai -> Traditional pass (竜 -> 龍). It is OFF by  // check-ok
    // default even though it is a strict improvement for stored Chinese: a document may
    // legitimately quote Japanese, and rewriting a quotation is not something a
    // converter should decide on its own. The detector still flags them either way.
    //
    // useWording applies the WORDING layer for the Traditional direction (OpenCC's s2twp
  // second step). One switch for both directions: which table this is depends on which
  // function you called, not on a separate parameter.
    // 軟件 -> 軟體, 硬盤 -> 硬碟, 網絡 -> 網路. It is OFF by default and that is a policy
    // decision, not an oversight: 軟件 is perfectly correct Traditional Chinese (Hong Kong
    // writes it), so applying it means choosing a region's wording. It runs BEFORE the
    // glyph pass, matching the order of OpenCC's own chain.
    //
    // The Japanese pass runs last and unconditionally: a shinjitai that reached a
    // Chinese document (pasted text, an IME slip, a model that saw Japanese) has a
    // Traditional form, and 竜 -> 龍 is unambiguous. It cannot touch real Traditional  // check-ok
    // text, because the table contains only characters that are NOT representable in
    // Big5 - see build-jp.js.
    function toTraditional(text, usePhrases = true, useTc = true, useWording = false, useJapanese = false) {
      const { maxLen, char, phrase, tc } = s2t;
      const src = [...normalizeCompatibility(text)];
      let out = '';
      let i = 0;
      while (i < src.length) {
        let hit = false;
        if (usePhrases) {
          for (let len = Math.min(maxLen, src.length - i); len >= 2; len--) {
            const v = phrase[src.slice(i, i + len).join('')];
            if (v !== undefined) { out += v; i += len; hit = true; break; }
          }
        }
        if (hit) continue;
        const ch = src[i];
        out += (char[ch] !== undefined) ? char[ch] : ch;
        i++;
      }
      if (useWording) out = mapPhrases(out, tcVocab.phrase, tcVocab.maxLen);
      out = useTc ? mapChars(out, tc) : out;
      // useJapanese is OFF by default: see stripJapanese above. Detection is unchanged.
      return useJapanese ? stripJapanese(out) : out;
    }

    return {
      glyphSet, traditionalOnlyGlyphs, japaneseOnlyGlyphs, japaneseTables, t2sTables, s2tTables, cantoneseTables, knownHanzi,
      toWritten, stripJapanese, normalizeCompatibility, compatChars, scanTextCompat,
      tcVocabTables: () => tcVocab,
      scanText, scanTextWith, scanTextCantonese, scanTextJapanese, scanTextVariant,
      toSimplified, toTraditional,
      summarize, hitOccurrences, lineSkipped, SKIP_MARKERS,
    };
  }

  return {
    createCore, globToRegExp, scanTextWith, summarize, hitOccurrences, lineSkipped,
    detectEncoding, decodeText, scriptMix, chineseScore, puaChars, scanTextPua, isPua, SKIP_MARKERS,
  };
});
