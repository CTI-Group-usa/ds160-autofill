/* Pure XML->grid half of the .xlsx reader. The unzip half needs the
   browser's DecompressionStream, so it is covered by the fixture check
   in the app instead. Run: node test/xlsx.test.js */
const X = require('../xlsx.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

// -- column references ------------------------------------------------
eq('col A',  X.colIndex('A1'), 0);
eq('col Z',  X.colIndex('Z9'), 25);
eq('col AA', X.colIndex('AA1'), 26);
eq('col CQ', X.colIndex('CQ200'), 94);   // the sheet's last column

// -- entities ---------------------------------------------------------
eq('entities', X.unesc('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41;'), 'a & b <c> "d" \'e\' A');

// -- shared strings ---------------------------------------------------
const sst = '<sst><si><t>Name</t></si><si><t>Budi</t></si>' +
            '<si><r><t>Passport </t></r><r><t>Number</t></r></si>' +
            '<si><t>a &amp; b</t></si></sst>';
eq('shared strings', X.sharedStrings(sst), ['Name', 'Budi', 'Passport Number', 'a & b']);
eq('no shared strings part', X.sharedStrings(undefined), []);

// -- sheet grid -------------------------------------------------------
const strings = ['Name', 'Budi', 'Passport Number', 'a & b'];
const sheet =
  '<worksheet><sheetData>' +
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>' +      // gap at B
  '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>34783</v></c>' +
    '<c r="C2" t="inlineStr"><is><t>C123</t></is></c></row>' +
  '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"/></row>' +                       // self-closing
  '</sheetData></worksheet>';
eq('grid', X.sheetToGrid(sheet, strings), [
  ['Name', '', 'Passport Number'],
  ['Budi', '34783', 'C123'],
  ['a & b', ''],
]);

// -- hyperlinks -------------------------------------------------------
// The Supporting Letter cell shows no text; the URL is the whole point.
// Exporters write it either as a rels-backed <hyperlink> or as a
// HYPERLINK() formula, so both have to be read.
const linkSheet =
  '<worksheet><sheetData>' +
  '<row r="2"><c r="U2" t="s"><v>0</v></c></row>' +
  '<row r="3"><c r="U3" t="s"><f>HYPERLINK("https://drive/two","letter")</f><v>0</v></c></row>' +
  '</sheetData><hyperlinks><hyperlink ref="U2" r:id="rIdL1"/></hyperlinks></worksheet>';
const linkRels =
  '<Relationships><Relationship Id="rIdL1" Target="https://drive/one" TargetMode="External"/></Relationships>';
eq('hyperlinks', X.hyperlinks(linkSheet, linkRels),
   { U2: 'https://drive/one', U3: 'https://drive/two' });
eq('no hyperlinks at all', X.hyperlinks('<worksheet></worksheet>', ''), {});
eq('hyperlink with an escaped target',
   X.hyperlinks('<hyperlinks><hyperlink ref="A1" r:id="r1"/></hyperlinks>',
                '<Relationship Id="r1" Target="https://d/a&amp;b"/>'),
   { A1: 'https://d/a&b' });

// -- workbook sheet list ----------------------------------------------
const wb = '<workbook><sheets>' +
  '<sheet name="Notes" sheetId="1" r:id="rId1"/>' +
  '<sheet name="VISA APPLICATIONS" sheetId="2" r:id="rId2"/>' +
  '</sheets></workbook>';
const rels = '<Relationships>' +
  '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/>' +
  '</Relationships>';
eq('sheet targets', X.sheetTargets(wb, rels), [
  { name: 'Notes', target: 'xl/worksheets/sheet1.xml' },
  { name: 'VISA APPLICATIONS', target: 'xl/worksheets/sheet2.xml' },
]);


/* -- a numeric cell written in exponential form ---------------------
   Zoho stores phone numbers and ID numbers as NUMBERS, and its xlsx writer
   serialises the large ones as "6.2895410887918E13" - a legal numeric cell.
   Left as that text, every digit-taking helper downstream reads the EXPONENT
   as part of the value: normPhone('6.281215303279E12') returned
   628121530327912, the real thirteen-digit number with the "12" on the end.

   690 rows of the C1/D export carry the applicant's own phone that way, and
   341 of a 400-row sample came out as something CEAC refuses. It is also the
   true cause of the "stray digit" phone that was diagnosed as a data-entry
   error on 2026-09-01.

   Expanded at the READER so one change covers every column - mapped,
   unmapped and future - rather than one transform at a time. */
eq('a phone number in E notation', X.expandExp('6.2895410887918E13'), '62895410887918');
eq('a shorter one',                X.expandExp('6.281215303279E12'),  '6281215303279');
eq('a US number',                  X.expandExp('4.173395067E9'),      '4173395067');
/* A DATE SERIAL MUST NOT BE TOUCHED. It never matches the pattern - there is
   no exponent - and if it did, every date in the sheet would move. */
eq('a date serial is untouched',   X.expandExp('45848'), '45848');
eq('a plain integer too',          X.expandExp('3600000'), '3600000');
eq('and text',                     X.expandExp('CARNIVAL UK'), 'CARNIVAL UK');
/* Only a NON-NEGATIVE exponent is expanded, so a genuine tiny fraction is
   left exactly as written rather than being rounded to zero. */
eq('a negative exponent is left alone', X.expandExp('1.5E-7'), '1.5E-7');
eq('a non-integer expands correctly',   X.expandExp('1.234E2'), '123.4');

/* THE NUMERIC BRANCH ONLY. A shared-string cell that happens to look
   exponential is text somebody typed, and rewriting it would be a guess. */
const expGrid = X.sheetToGrid(
  '<row r="1"><c r="A1"><v>6.281215303279E12</v></c>' +
  '<c r="B1" t="s"><v>0</v></c></row>', ['6.281215303279E12']);
eq('the numeric cell expanded', expGrid[0][0], '6281215303279');
eq('the string cell did not',   expGrid[0][1], '6.281215303279E12');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
