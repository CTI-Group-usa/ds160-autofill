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
/* `ok` is false on the blank sample, and correctly so: its only P-n-nnnnn is
   the form's stationery, which is stripped, so the programme number really is
   absent. Both DATES are what matter here. */
ok('both dates present', !!r.fields.programFrom && !!r.fields.programTo);
eq('and only the programme number is missing', r.missing.join(','), 'programNumber');

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
/* Found by PATTERN, because in the sample the SEVIS id arrives with no label
   at all. See the stationery block near the end of this file for what that
   choice cost on the programme number. */
eq('SEVIS id',       r.fields.sevisId,       'N00375XXXXX');
eq('category',       r.fields.category,      'INTERN');

// -- the cross-check against the sheet -------------------------------
/* Columns CH and CI are typed in by hand FROM this document, so a
   disagreement means one of them is wrong on a sworn application - and
   nothing else in this project would notice. */
const real = P.parse(SAMPLE.replace('N00375XXXXX', 'N0037491619') +
                     ' Program Number: P-4-44043');
eq('agreeing values raise nothing',
   P.crossCheck(real, { sevisId: 'N0037491619', programNumber: 'P-4-44043' }).length, 0);
const bad = P.crossCheck(real, { sevisId: 'N0099999999', programNumber: 'P-4-44043' });
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

/* NOW PROVEN (2026-09-04): pdftext.js CAN read a real DS-2019. The programme
   period came out of a live form on the first attempt, which is more than the
   CEAC print-out managed - that returned zero characters.

   STILL OPEN from that same run: the SEVIS id was NOT found on the real form,
   though it is found in the blank sample above. That needs the extracted text
   of a real one in front of us; guessing a second pattern is how the
   stationery bug happened. Until then it is reported missing. */


/* -- THE FORM'S OWN STATIONERY IS SHAPED LIKE A PROGRAMME NUMBER -----
   Found by the first live run, and the comment in ds2019.js used to claim the
   opposite. Every DS-2019 carries the pre-printed 212(e) endorsement

     PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO ...

   and P-3-04510 is ECFMG's number, there whoever the participant is. It was
   the ONLY P-n-nnnnn in the blank sample - the clue, not the reassurance it
   was taken for - and a real applicant's form returned it too, against a
   sheet that said P-4-44043. So the cross-check reported a mismatch on EVERY
   form, which is how an operator learns to ignore a warning. */
const boiler = P.parse(SAMPLE);
eq('the stationery is not read as a programme number', boiler.fields.programNumber, undefined);
ok('it is reported missing instead', boiler.missing.indexOf('programNumber') >= 0);
/* AND WITH NO VALUE THERE, THE CROSS-CHECK STANDS DOWN BY ITSELF. That is the
   whole point: a visible gap beats a confident wrong answer. */
eq('no false mismatch against the sheet',
   P.crossCheck(boiler, { programNumber: 'P-4-44043' }).length, 0);

/* A REAL programme number still has to come through. Only the one sentence is
   stripped, not every P-n-nnnnn on the page. */
const withReal = P.parse(SAMPLE + ' Program Number: P-4-44043');
eq('a real one is still found', withReal.fields.programNumber, 'P-4-44043');
eq('and agrees with the sheet',
   P.crossCheck(withReal, { programNumber: 'P-4-44043' }).length, 0);
eq('and disagrees when it should',
   P.crossCheck(withReal, { programNumber: 'P-3-05133' }).length, 1);
/* The strip must not eat the dates or the SEVIS id sitting near it. */
eq('the dates survive the strip', withReal.fields.programFrom, '25-MAY-2026');
eq('the SEVIS id too',            withReal.fields.sevisId, 'N00375XXXXX');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
