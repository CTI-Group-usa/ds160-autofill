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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
