/* The DS-2019 parser. Run: node test/ds2019.test.js

   The text below is written out here rather than committed as a fixture: the
   only DS-2019 available is a third party's sample form and THIS REPO IS
   PUBLIC. The labels are what matter and they are the government's own - item
   3 "Form Covers Period", item 4 "Exchange Visitor Category" - so they are
   quoted exactly, in the order and spacing the real form produced, including
   the two spaces in "To  (mm-dd-yyyy)".

   If a real form is present locally the last block runs against it too. */
'use strict';
global.DS160 = require('../normalize.js');
const P = require('../ds2019.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want));
}
function ok(label, cond) { eq(label, !!cond, true); }

/* Reproduced from the blank sample of the form. The extracted text runs
   together with no line breaks, the same as the C1/D supporting letter, which
   is why nothing here splits on newlines. */
const SAMPLE = [
  'EXPIRES: 12/31/2024 CERTIFICATE OF ELIGIBILITY FOR EXCHANGE VISITOR STATUS',
  '(J-NONIMMIGRANT) ESTIMATED BURDEN TIME: 45 min *See Page 2 N00375XXXXX J-1',
  '1636 Meridian Ave Participating Program Official Description: INTERN',
  'Purpose of this form:  Begin new program; accompanied by number (0) of',
  'immediate family members. 3. Form Covers Period: From (mm-dd-yyyy): 05-25-2026',
  'To  (mm-dd-yyyy): 05-24-2027 4. Exchange Visitor Category: INTERN',
  '5. During the period covered by this form, the total estimated financial',
  'support (in U.S. $) is to be provided to the exchange visitor by:',
  '6. RESPONSIBLE OFFICER OR ALTERNATE RESPONSIBLE OFFICER ATTESTATION:',
  'PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO',
].join(' ');

// -- the programme period --------------------------------------------
const r = P.parse(SAMPLE);
/* MONTH FIRST, and the label is what says so. 05-25-2026 happens to be
   unambiguous because 25 cannot be a month, but 05-12-2026 is not - and
   parseDate's default is day-first, the Indonesian convention, so without the
   hint that date would come out as 5 December instead of 12 May. */
eq('programme starts', r.fields.programFrom, '25-MAY-2026');
eq('programme ends',   r.fields.programTo,   '24-MAY-2027');
ok('nothing missing', r.ok);

/* THE ONE THAT WOULD HAVE BEEN WRONG SILENTLY. Both halves under 13, so only
   the "(mm-dd-yyyy)" in the label can resolve it. */
const amb = P.parse('3. Form Covers Period: From (mm-dd-yyyy): 05-12-2026 To (mm-dd-yyyy): 04-11-2027');
eq('an ambiguous start reads month-first', amb.fields.programFrom, '12-MAY-2026');
eq('and so does the end',                  amb.fields.programTo,   '11-APR-2027');

/* Two spaces after "To" in the real form; norm() collapses them, and the
   pattern must not depend on exactly one. */
ok('the double space did not break the To date', !!r.fields.programTo);

// -- the itinerary answers -------------------------------------------
/* J1 answers "specific travel plans" YES, so CEAC demands arrival and
   departure dates, and the J1 sheet has NO column for either. The DS-2019
   period is the only source they could come from. */
eq('arrival comes from From',   r.fields.arrivalDate,   '25-MAY-2026');
eq('departure comes from To',   r.fields.departureDate, '24-MAY-2027');
const a = P.answers(r);
eq('only two answers reach the form', Object.keys(a).sort().join(','), 'arrivalDate,departureDate');
/* The category and the raw programme dates are for the operator to read. No
   DS-160 box takes them, so answers() must not offer them. */
eq('the category is read but not offered', a.category, undefined);
eq('and neither is programFrom',           a.programFrom, undefined);

// -- the formatted identifiers ---------------------------------------
/* Found by PATTERN, not by label: they are shaped like nothing else on the
   page, and in the sample the SEVIS id arrives with no label at all. */
eq('SEVIS id',       r.fields.sevisId,       'N00375XXXXX');
eq('programme number', r.fields.programNumber, 'P-3-04510');
eq('category',       r.fields.category,      'INTERN');

// -- the cross-check against the sheet -------------------------------
/* Columns CH and CI are typed in by hand FROM this document, so a
   disagreement means one of them is wrong on a sworn application - and
   nothing else in this project would notice. */
const real = P.parse(SAMPLE.replace('N00375XXXXX', 'N0037491619'));
eq('agreeing values raise nothing',
   P.crossCheck(real, { sevisId: 'N0037491619', programNumber: 'P-3-04510' }).length, 0);
const bad = P.crossCheck(real, { sevisId: 'N0099999999', programNumber: 'P-3-04510' });
eq('a different SEVIS id is caught', bad.length, 1);
ok('and both values are quoted',
   /N0037491619/.test(bad[0].msg) && /N0099999999/.test(bad[0].msg));
eq('a different programme number is caught',
   P.crossCheck(real, { programNumber: 'P-3-99999' }).length, 1);
/* A REDACTED SAMPLE MUST NOT REPORT A MISMATCH. N00375XXXXX is a blanked-out
   id, not a contradiction, and reporting it would train the operator to
   ignore this check. */
eq('the redacted sample is not a mismatch',
   P.crossCheck(r, { sevisId: 'N0037491619' }).length, 0);

/* A programme that ends before it starts is a misread, not a fact. */
const backwards = P.parse(
  '3. Form Covers Period: From (mm-dd-yyyy): 05-25-2027 To (mm-dd-yyyy): 05-24-2026');
const rev = P.crossCheck(backwards, {});
eq('a reversed period is caught', rev.length, 1);
ok('and says so plainly', /ends on or before it starts/.test(rev[0].msg));

// -- nothing in, nothing out -----------------------------------------
const empty = P.parse('');
eq('empty text finds nothing', empty.found, 0);
ok('and is not ok', !empty.ok);
eq('every date field is reported missing',
   empty.missing.filter(k => /^program(From|To)$/.test(k)).length, 2);
/* Fed the WRONG document - a DS-160 print-out, say - it must come back empty
   rather than half-parsed. */
const wrongDoc = P.parse('Purpose of Trip to the U.S. (1): EXCHANGE VISITOR (J) ' +
                         'Date of Arrival in U.S.: 24 NOVEMBER 2026');
eq('a DS-160 print-out yields no programme dates', wrongDoc.fields.programFrom, undefined);
ok('and is not ok', !wrongDoc.ok);

// -- against a real form, if one is on this machine ------------------
/* Same arrangement as pdftext.test.js. The samples are gitignored, so this
   block is skipped in CI and on any other machine. */
const dir = path.join(os.homedir(), 'Downloads');
let realFile = null;
try {
  realFile = (fs.readdirSync(dir).find(f => /DS-?2019.*\.(txt)$/i.test(f)) || null);
} catch (e) { /* no Downloads directory */ }
if (realFile) {
  const text = fs.readFileSync(path.join(dir, realFile), 'utf8');
  const live = P.parse(text);
  ok('a real DS-2019 yields a programme period: ' + realFile,
     !!live.fields.programFrom && !!live.fields.programTo);
  console.log('  (read ' + realFile + ': ' + JSON.stringify(live.fields) + ')');
} else {
  console.log('  (no local DS-2019 text found - the label tests above still ran)');
}

/* NOT PROVEN, AND THE COMMENT IN ds2019.js SAYS SO: that pdftext.js can
   extract anything from a real DS-2019 PDF. It returned zero characters from
   the CEAC print-out. `parse` takes text; where the text comes from is the
   caller's problem, exactly as with letter.js. */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
