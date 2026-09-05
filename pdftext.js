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

  /* AN INTERACTIVE PDF'S VALUES ARE NOT ON THE PAGE, AND THIS SAYS WHETHER
     THEY ARE REACHABLE AT ALL.

     Every DS-7002 seen so far has failed the same way: the page text is the
     blank form's printed labels, because each value is drawn inside a Form
     XObject whose placement lives in the page stream. Pairing those needs the
     object graph, which this file deliberately does not build.

     But there is a SECOND shape, and it is cheap: a form that was filled in
     and never flattened keeps each value in its AcroForm field, next to the
     field's own NAME - `/T (Phase Site Name) ... /V (Kalahari Resort)`. A name
     beside a value is a label beside a value, which is the one thing this
     project can always work with.

     So this does not try to fill anything. It answers the question that
     decides whether a reader is worth writing at all: are there named fields
     carrying values, and what are they called? The report prints the answer
     when a document gives nothing, exactly as the popup's "Not recognised"
     list is how every real CEAC id got here. Guessing has never once worked;
     asking the file has. */
  /* THE VALUE OF A FILLED FIELD IS OFTEN NOT `/V` - IT IS DRAWN.
     A widget annotation looks like this, and a blank template carries neither:

       42 0 obj <</FT/Tx/Rect[...]/Subtype/Widget/T(ProgramNumber)/Type/Annot>>

     Fill it in and the writer adds `/V (P-4-44043)` - or, very often, ONLY an
     appearance stream: `/AP<</N 91 0 R>>`, object 91 being a little content
     stream that draws the text. Acrobat writes both; several other writers
     write only the appearance, and a form flattened on save keeps only that.

     Reading `/V` alone therefore reports "no field carries a value" for a form
     that is visibly full - which is exactly what a live report said, and it
     nearly became the conclusion "this must be a blank copy". The count was
     measuring the reader, not the file.

     `/AP /N` is an object REFERENCE, and streams cannot live inside object
     streams - so the widget may be compressed but the appearance it points at
     is always in the plain bytes. That is the whole pairing: name and value in
     one dictionary, no page tree, no coordinates, no guess about position. It
     is a completely different problem from placing an XObject on a page, which
     is the one this file still refuses. */
  async function appearanceText(bytes, plain, objNum) {
    const re = new RegExp('(?:^|[^0-9])' + objNum + '\\s+0\\s+obj\\b');
    const m = re.exec(plain);
    if (!m) return '';
    const from = m.index + m[0].length;
    const sAt = plain.indexOf('stream', from);
    if (sAt < 0 || sAt - from > 800) return '';   // not a stream object
    let a = sAt + 6;
    if (plain.charCodeAt(a) === 13) a++;
    if (plain.charCodeAt(a) === 10) a++;
    let b = plain.indexOf('endstream', a);
    if (b < 0) return '';
    while (b > a && /[\r\n ]/.test(plain[b - 1])) b--;
    let body;
    try { body = latin1(await inflate(bytes.subarray(a, b))); }
    catch (e) { body = plain.slice(a, b); }        // an uncompressed appearance
    return textFromContent(body).replace(/\s+/g, ' ').trim();
  }

  async function formFields(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let hay = '';
    for (let i = 0; i < bytes.length; i++) hay += String.fromCharCode(bytes[i]);

    /* OBJECT STREAMS HOLD MOST OBJECTS IN A MODERN PDF, so the plain bytes
       alone find nothing - the first version of this scanned only those and
       reported zero named fields on a file that has 79 of them. `inflateStreams`
       is async, which is the other half of why: awaiting it was missed and a
       Promise has no `.length`. */
    try {
      const parts = await inflateStreams(bytes);
      if (parts && parts.length) hay += '\n' + parts.join('\n');
    } catch (e) { /* a stream that will not inflate tells us nothing here */ }

    /* EVERY NAME AND EVERY VALUE FIRST, THEN PAIR THEM BY DISTANCE.
       The first version took a fixed window either side of each `/T` and used
       the first `/V` in it. A window wide enough to hold one dictionary is
       wider than the gap between two, so every field picked up the PREVIOUS
       object's value - on a file with 79 of them, all 79 would have been
       wrong. Its own test caught it, which is the only reason this is not in
       the repository.

       `/T` and `/V` sit in the same dictionary in either order and PDFs pack
       objects tight, so the honest rule is: each value belongs to the nearest
       name that has not already claimed one. No nesting to track, no window to
       tune, and it is right whichever order the writer used. */
    const grab = (tag) => {
      const found = [], re = new RegExp('/' + tag + '\\s*(\\(|<)', 'g');
      let m;
      while ((m = re.exec(hay))) {
        const r = m[1] === '(' ? readLiteral(hay, re.lastIndex) : readHex(hay, re.lastIndex);
        if (r) found.push({ at: m.index, text: String(r.value || '').trim() });
        if (found.length >= 2000) break;
      }
      return found;
    };
    const names = grab('T'), values = grab('V');

    const taken = new Array(names.length).fill(null);
    for (const v of values) {
      let best = -1, dist = Infinity;
      for (let i = 0; i < names.length; i++) {
        if (taken[i] !== null) continue;
        const d = Math.abs(names[i].at - v.at);
        if (d < dist) { dist = d; best = i; }
      }
      if (best >= 0) taken[best] = v.text;
    }

    /* WHERE THERE IS NO `/V`, THE APPEARANCE IS THE VALUE. `/AP<</N M 0 R>>`
       sits in the same dictionary as the name, so it is looked for between
       this name and the next - the same bound the pairing above uses, and the
       reason a fixed window was wrong. */
    const plain = latin1(bytes);
    for (let i = 0; i < names.length; i++) {
      if (taken[i]) continue;
      const upto = i + 1 < names.length ? names[i + 1].at : names[i].at + 1200;
      const near = hay.slice(names[i].at, Math.min(upto, names[i].at + 1200));
      const ap = /\/AP\s*<<[^>]*?\/N\s+(\d+)\s+0\s+R/.exec(near);
      if (!ap) continue;
      const drawn = await appearanceText(bytes, plain, ap[1]);
      if (drawn) taken[i] = drawn;
    }

    const out = [], seen = {};
    for (let i = 0; i < names.length; i++) {
      if (!names[i].text) continue;
      const value = taken[i] === null ? '' : taken[i];
      const key = names[i].text + '\u0000' + value;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({ name: names[i].text, value: value });
      if (out.length >= 300) break;
    }
    return out;
  }

  /* THE FIELD NAMES ARE LABELS, SO THE PAIRS CAN BE READ AS A DOCUMENT.
     Measured on the real interactive DS-7002: 79 named fields, called
     `Organization Name`, `Phase Site Name`, `City`, `State`, `ZIP Code`,
     `ProgramNumber`, `Training Start Date`. Those are the printed labels, so
     laying them out as `label value label value` lets the existing profile
     read them with no new mapping and no guess about position - which is the
     whole reason the XObject route was refused.

     THE SECTION 2 MARKERS ARE PUT BACK because that is where those cells are
     on the form, and `scope` reads the short labels - City, State, ZIP Code -
     there and nowhere else. Without them the scoped pass never fires and those
     four are dropped.

     Nothing is emitted for a field with no value: a blank form must stay
     blank, not arrive as a run of labels for the parser to mistake for
     values. */
  const HOST_BLOCK = ['Organization Name', 'Suite', 'City', 'State', 'ZIP Code',
                      'Website URL', 'Employer ID Number', 'Address1', 'Address2'];
  function formText(fields) {
    const filled = (fields || []).filter(f => f && f.name && f.value);
    if (!filled.length) return '';
    const host = [], rest = [];
    for (const f of filled) {
      (HOST_BLOCK.indexOf(f.name) >= 0 ? host : rest).push(f.name + ' ' + f.value);
    }
    let out = rest.join(' ');
    if (host.length) {
      out += ' SECTION 2: HOST ORGANIZATION INFORMATION ' + host.join(' ') +
             ' SECTION 3: CERTIFICATIONS';
    }
    return out.trim();
  }

  const api = { extract, inflateStreams, looksLikeContent, textFromContent, readLiteral, readHex, readable,
                formFields, formText };
  if (isNode) module.exports = api;
  root.PDFText = api;
})(typeof self !== 'undefined' ? self : this);
