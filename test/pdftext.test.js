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

  /* -- A FILLED INTERACTIVE PDF KEEPS ITS VALUES IN NAMED FIELDS -----
     Every DS-7002 read so far has come back as a run of blank labels, because
     its values are drawn inside Form XObjects whose placement lives in the
     page stream - a pairing this file deliberately does not build.

     There is a second shape and it is cheap. A form filled in and never
     flattened keeps each value in its AcroForm field, beside the field's own
     NAME. Measured on the real interactive DS-7002: 79 named fields, called
     `Organization Name`, `Phase Site Name`, `City`, `State`, `ZIP Code`,
     `ProgramNumber`. Those ARE the printed labels, so the existing j1docs
     profile reads them with no new mapping and no guess about position. */
  const acro = '1 0 obj << /T (Phase Site Name) /V (Kalahari Resort - Sandusky OH) >> endobj ' +
               '2 0 obj << /V (44870) /T (ZIP Code) >> endobj ' +
               '3 0 obj << /T (Suite) >> endobj';
  const got = await P.formFields(new TextEncoder().encode(acro));
  const by = {};
  for (const f of got) by[f.name] = f.value;
  eq('the field name is read', by['Phase Site Name'], 'Kalahari Resort - Sandusky OH');
  /* `/V` BEFORE `/T` IS THE SAME DICTIONARY - they sit in either order, so the
     window looks both ways. */
  eq('and in either order',   by['ZIP Code'], '44870');
  eq('a field with no value', by['Suite'], '');

  /* THE VALUE OF A FILLED FIELD IS OFTEN NOT `/V` - IT IS DRAWN.
     Acrobat writes both `/V` and an appearance stream; several other writers,
     and any form flattened on save, write ONLY the appearance:
     `/AP<</N 9 0 R>>`, object 9 being a little content stream that draws the
     text. Reading `/V` alone reports "no field carries a value" for a form
     that is visibly full - which a live report said, and it nearly became the
     conclusion "this must be a blank copy". The count was measuring the
     reader, not the file.

     Streams cannot live inside object streams, so the widget may be compressed
     while the appearance it points at is always in the plain bytes. Name and
     value in one dictionary: no page tree, no coordinates, no guess about
     position - a different problem entirely from placing an XObject, which
     this file still refuses. */
  const drawn = '1 0 obj <</Subtype/Widget/T(Phase Site Name)/AP<</N 9 0 R>>/Type/Annot>> endobj\n' +
                '9 0 obj <</Length 60>>\nstream\nBT /Arial 8 Tf 1 0 0 1 1 3.5 Tm ' +
                '(Kalahari Resort - Sandusky OH) Tj ET\nendstream\nendobj\n' +
                '2 0 obj <</Subtype/Widget/T(ZIP Code)/V (44870)/Type/Annot>> endobj\n' +
                '3 0 obj <</Subtype/Widget/T(Suite)/Type/Annot>> endobj';
  const drawnGot = await P.formFields(new TextEncoder().encode(drawn));
  const drawnBy = {};
  for (const f of drawnGot) drawnBy[f.name] = f.value;
  eq('an appearance-only value is read', drawnBy['Phase Site Name'],
     'Kalahari Resort - Sandusky OH');
  eq('a /V value still wins where there is one', drawnBy['ZIP Code'], '44870');
  eq('and a field with neither stays empty', drawnBy['Suite'], '');

  /* NOTHING IS EMITTED FOR AN EMPTY FIELD. A blank form must stay blank, not
     arrive as a run of labels for the parser to mistake for values - which is
     the failure this whole path exists to avoid. */
  eq('a blank form contributes nothing',
     P.formText([{ name: 'City', value: '' }, { name: 'State', value: '' }]), '');

  /* THE SECTION 2 MARKERS ARE PUT BACK, because that is where those cells sit
     on the form and `scope` in j1docs reads the short labels - City, State,
     ZIP Code - there and nowhere else. Without them the scoped pass never
     fires and all four are dropped. */
  const laid = P.formText([{ name: 'Phase Site Name', value: 'Kalahari' },
                           { name: 'City', value: 'Sandusky' }]);
  eq('the host cells are bracketed by their section',
     /SECTION 2: HOST ORGANIZATION INFORMATION City Sandusky SECTION 3/.test(laid), true);
  eq('and everything else stays outside it',
     /^Phase Site Name Kalahari SECTION 2/.test(laid), true);

  console.log('\n' + pass + ' passed, ' + fail + ' failed' + (skipped ? ', end-to-end skipped' : ''));
  process.exit(fail ? 1 : 0);
})();
