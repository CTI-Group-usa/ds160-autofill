/* ------------------------------------------------------------------
 * Minimal PDF text extraction - no dependencies.
 *
 * Enough to read a C1/D supporting letter, not a general PDF library.
 * The approach is deliberately blunt: inflate every stream in the file,
 * keep the ones that look like page content (mostly printable, with BT
 * and Tf in them), and pull out the strings that are operands of the
 * text-showing operators. That skips xref tables, object streams and
 * the page tree entirely - none of which we need for a one-page letter.
 *
 * Strings that are not text operands (a /Lang (en-US) in a marked
 * content dictionary, say) are dropped because the operator that
 * follows them is not Tj/TJ.
 *
 * Output has no line breaks, exactly like the letter text letter.js is
 * written against: glyphs are positioned individually, so words run
 * together across what looks like a line on the page.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;

  async function inflate(bytes) {
    if (isNode) {
      const zlib = require('zlib');
      try { return new Uint8Array(zlib.inflateSync(Buffer.from(bytes))); }
      catch (e) { return new Uint8Array(zlib.inflateRawSync(Buffer.from(bytes))); }
    }
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    for (const fmt of ['deflate', 'deflate-raw']) {
      try {
        const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt));
        return new Uint8Array(await new Response(s).arrayBuffer());
      } catch (e) { /* try the other framing */ }
    }
    throw new Error('inflate failed');
  }

  const latin1 = bytes => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return s;
  };

  function indexOfAscii(bytes, needle, from) {
    const n = [];
    for (let i = 0; i < needle.length; i++) n.push(needle.charCodeAt(i));
    outer: for (let i = from; i <= bytes.length - n.length; i++) {
      for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
      return i;
    }
    return -1;
  }

  /* Every "stream ... endstream" span, inflated where possible. */
  async function inflateStreams(buffer) {
    const bytes = new Uint8Array(buffer);
    const out = [];
    let i = 0;
    while (true) {
      const at = indexOfAscii(bytes, 'stream', i);
      if (at < 0) break;
      let s = at + 6;
      if (bytes[s] === 13) s++;
      if (bytes[s] === 10) s++;
      let end = indexOfAscii(bytes, 'endstream', s);
      if (end < 0) break;
      const stop = end;
      /* The EOL before "endstream" is not part of the stream data, and
         Chrome's DecompressionStream errors on trailing bytes where
         node's zlib quietly ignores them. */
      while (end > s && (bytes[end - 1] === 10 || bytes[end - 1] === 13 || bytes[end - 1] === 32)) end--;
      try { out.push(latin1(await inflate(bytes.subarray(s, end)))); }
      catch (e) { /* an image, or not deflated - not our business */ }
      i = stop + 9;
    }
    return out;
  }

  function looksLikeContent(text) {
    if (!/\bBT\b/.test(text) || !/\bTf\b/.test(text)) return false;
    const printable = (text.match(/[\x20-\x7e\n\r\t]/g) || []).length;
    return printable / Math.max(1, text.length) > 0.85;
  }

  const OCTAL = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };

  /* A PDF literal string: parentheses nest, and a backslash escapes the
     next character or introduces an octal code. */
  function readLiteral(s, i) {
    let depth = 1, out = '';
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') {
        const n = s[i + 1];
        if (n >= '0' && n <= '7') {
          let oct = '';
          let j = i + 1;
          while (oct.length < 3 && s[j] >= '0' && s[j] <= '7') oct += s[j++];
          out += String.fromCharCode(parseInt(oct, 8));
          i = j;
          continue;
        }
        out += (OCTAL[n] !== undefined ? OCTAL[n] : n);
        i += 2;
        continue;
      }
      if (c === '(') { depth++; out += c; i++; continue; }
      if (c === ')') { depth--; if (!depth) return { value: out, next: i + 1 }; out += c; i++; continue; }
      out += c;
      i++;
    }
    return { value: out, next: i };
  }

  function readHex(s, i) {
    let hex = '';
    while (i < s.length && s[i] !== '>') { if (/[0-9A-Fa-f]/.test(s[i])) hex += s[i]; i++; }
    let out = '';
    for (let j = 0; j + 1 < hex.length; j += 2) out += String.fromCharCode(parseInt(hex.substr(j, 2), 16));
    return { value: out, next: i + 1 };
  }

  const SHOW = { Tj: 1, TJ: 1, "'": 1, '"': 1 };

  /* A Type0 font addressed with Identity encoding puts glyph ids in the
     string, and without that font's ToUnicode map they are meaningless
     control bytes. The letters use such a font for the body paragraph.
     Emitting the bytes anyway would corrupt the value that precedes
     them, so an unreadable run is dropped rather than guessed at. */
  function readable(s) {
    if (!s) return false;
    if (s.indexOf('\0') >= 0) return false;   // a NUL means glyph ids, not text
    let bad = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) bad++;
    }
    return bad / s.length <= 0.2;
  }

  /* Strings are collected as they are read and only kept when the
     operator that follows them actually draws text. */
  function textFromContent(s) {
    let out = '', pending = [], i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '(') { const r = readLiteral(s, i + 1); pending.push(r.value); i = r.next; continue; }
      if (c === '<' && s[i + 1] !== '<') { const r = readHex(s, i + 1); pending.push(r.value); i = r.next; continue; }
      if (/[A-Za-z'"*]/.test(c)) {
        let op = '';
        while (i < s.length && /[A-Za-z'"*0-9]/.test(s[i])) op += s[i++];
        if (SHOW[op]) out += pending.filter(readable).join('');
        pending = [];
        continue;
      }
      i++;
    }
    return out;
  }

  async function extract(buffer) {
    const streams = await inflateStreams(buffer);
    const content = streams.filter(looksLikeContent);
    return content.map(textFromContent).join('');
  }

  const api = { extract, inflateStreams, looksLikeContent, textFromContent, readLiteral, readHex, readable };
  if (isNode) module.exports = api;
  root.PDFText = api;
})(typeof self !== 'undefined' ? self : this);
