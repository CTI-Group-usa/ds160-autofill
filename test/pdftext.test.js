/* PDF text extraction, and the whole chain from a real letter PDF to
   DS-160 answers. Run: node test/pdftext.test.js

   The PDF itself is not in the repo (it holds a real seafarer's data).
   Point LETTER_PDF at one to run the end-to-end part; the unit tests
   below run either way. */
const fs = require('fs');
const path = require('path');
const P = require('../pdftext.js');
global.DS160 = require('../normalize.js');
const L = require('../letter.js');

let pass = 0, fail = 0, skipped = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

// -- literal strings ---------------------------------------------------
eq('plain',        P.readLiteral('hello)', 0).value, 'hello');
eq('escaped paren', P.readLiteral('a\\)b)', 0).value, 'a)b');
eq('nested parens', P.readLiteral('a(b)c)', 0).value, 'a(b)c');
eq('backslash',    P.readLiteral('a\\\\b)', 0).value, 'a\\b');
eq('octal',        P.readLiteral('\\101\\102)', 0).value, 'AB');
eq('newline escape', P.readLiteral('a\\nb)', 0).value, 'a\nb');

// -- hex strings -------------------------------------------------------
eq('hex', P.readHex('48656C6C6F>', 0).value, 'Hello');
eq('hex with spaces', P.readHex('48 65 6C>', 0).value, 'Hel');

// -- only text operands survive ---------------------------------------
// /Lang (en-US) is a dictionary value, not text: the operator after it
// is BDC, so it must be dropped.
const stream =
  '/Span <</MCID 0/Lang (en-US)>> BDC q\n' +
  'BT\n/F1 9.96 Tf\n1 0 0 1 372.07 786 Tm\n[(Name )] TJ\nET\nQ\n' +
  'BT\n/F2 11.04 Tf\n[(DANIEL)-250( SELI)] TJ\nET\n' +
  'BT\n(TODINGAN) Tj\nET\n';
eq('drops dictionary strings', P.textFromContent(stream), 'Name DANIEL SELITODINGAN');

eq('content stream recognised', P.looksLikeContent(stream), true);
eq('font binary rejected', P.looksLikeContent('\x00\x01\x02glyf\x00\x00BT Tf'), false);
eq('plain prose rejected', P.looksLikeContent('just some words'), false);

// -- the real letter, end to end --------------------------------------
const LETTER_PDF = process.env.LETTER_PDF ||
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'SL-DANIEL SELI TODINGAN.pdf');

(async () => {
  if (!fs.existsSync(LETTER_PDF)) {
    skipped = 1;
    console.log('\nSKIPPED end-to-end: no PDF at ' + LETTER_PDF);
  } else {
    const buf = fs.readFileSync(LETTER_PDF);
    const text = await P.extract(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const parsed = L.parse(text);

    eq('every label found in the real PDF', parsed.missing, []);
    eq('answers from the real PDF', L.answers(parsed), {
      vesselName: 'QUEEN ELIZABETH',
      vesselImo: '9477438',
      arrivalDate: '17-DEC-2026',
      arrivalCity: 'MIAMI',
      jobTitleAboard: 'DEMI CHEF DE PARTIE',
    });
    eq('name read from the real PDF', parsed.fields.letterName, 'DANIEL SELI TODINGAN');
    eq('passport read from the real PDF', parsed.fields.letterPassport, 'X5117416');
    eq('dob read from the real PDF', parsed.fields.letterDob, '16-SEP-1987');
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', end-to-end skipped' : ''));
  process.exit(fail ? 1 : 0);
})();
