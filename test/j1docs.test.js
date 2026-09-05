/* The three J1 attachments. Run: node test/j1docs.test.js

   THE TEXT BELOW IS WRITTEN OUT HERE rather than committed as a fixture,
   because the only documents available are real people's and THIS REPO IS
   PUBLIC. The labels are what matter and they are the government's own, so
   they are quoted exactly - including the awkward parts: the two spaces in
   "To  (mm-dd-yyyy)", and the way the DS-7002's two-column layout interleaves
   labels with values in reading order. */
'use strict';
global.DS160 = require('../normalize.js');
const P = require('../j1docs.js');
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

/* ---- the DS-7002, copied from a real one --------------------------
   Reading order across the form's two columns, which is why a value runs
   straight into the NEXT LABEL rather than to the end of a line:
   "Host Organization Name: The Westin Richmond Employer ID Number: 205500685" */
const DS7002 = [
  'U.S. Department of State *OMB APPROVAL NO. 1405-0170 Training/Internship Placement Plan',
  'Exchange Visitor (surname/primary, given name)',
  'Putra, I Gede Angga Krisna Mahadi SEVIS ID: N0036102391',
  'Email Address: anggakrisnamahadi09@gmail.com Program Sponsor: ASSE Aspire, Inc.',
  'Category: INTERN Program Number: P-3-06123',
  'Occupational Category: Hospitality and Tourism Training/Internship Dates: 09/16/2024 - 09/16/2025',
  /* NO SPACE AFTER "of", ON PURPOSE. The form wraps this label across two
     lines and pdftext.js joins its text runs with no separator, so the real
     extraction reads "Current Field ofStudy/Profession:". Typing the space in
     is what hid the bug: the label stopped matching and the value before it
     ran on. Do not "tidy" these two lines. */
  'Additional Participant DetailsCurrent Field ofStudy/Profession:',
  'Culinary Arts Type of Degree or Certificate: Diploma 3',
  'Experience in Field: null years Date Awarded or Expected: 10/17/2024',
  'Host Organization Phases: 6',
  'Host Organization Name: The Westin Richmond Employer ID Number: 205500685',
  "Address: 6631 W BROAD ST, RICHMOND, VA 23230 Worker's Comp Policy: Yes, Virginia",
  'Annual Revenue: $10 - $25 Million Exchange Visitor Hours per week: 32',
  'Website URL: https://www.marriott.com/en-us/hotels/ricwi- the-westin-richmond/overview/',
  'Stipend: Yes, 17.00 per Hour',
  /* Likewise: "per HourMain ProgramSupervisor/POC:" with no spaces, and the
     job title glued to the email. This is verbatim what the real PDF gives. */
  'Main ProgramSupervisor/POC:Jackson, SheraeHuman Resources',
  'Managersherae.jackson@westinrichmond.com Phone: 804-205-5207',
  'Non-Monetary Compensation Value: Certifications',
].join(' ');

/* ---- the DS-2019, from the blank sample of the form --------------- */
const DS2019 = [
  'EXPIRES: 12/31/2024 CERTIFICATE OF ELIGIBILITY FOR EXCHANGE VISITOR STATUS',
  '(J-NONIMMIGRANT) ESTIMATED BURDEN TIME: 45 min N00375XXXXX J-1',
  'Participating Program Official Description: INTERN',
  '3. Form Covers Period: From (mm-dd-yyyy): 05-25-2026',
  'To  (mm-dd-yyyy): 05-24-2027 4. Exchange Visitor Category: INTERN',
  '5. During the period covered by this form, the total estimated financial',
  'support (in U.S. $) is to be provided to the exchange visitor by:',
  '6. RESPONSIBLE OFFICER OR ALTERNATE RESPONSIBLE OFFICER ATTESTATION:',
  'PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO',
].join(' ');

// -- the parser identifies the document itself -----------------------
/* Three links in three columns is a mistake waiting to happen, and feeding a
   DS-7002 to the DS-2019 profile would be a silent half-parse. */
eq('a DS-7002 is recognised', P.parse(DS7002).doc, 'ds7002');
eq('a DS-2019 is recognised', P.parse(DS2019).doc, 'ds2019');
eq('a SEVIS receipt is recognised',
   P.parse('I-901 Fee Payment Confirmation SEVIS ID: N0036102391').doc, 'sevis');
/* AND AN UNKNOWN DOCUMENT IS REFUSED, not guessed at. A CEAC print-out is the
   realistic wrong file: it is full of the same words. */
const junk = P.parse('Consular Electronic Application Center - Print Application ' +
                     'Purpose of Trip to the U.S. (1): EXCHANGE VISITOR (J)');
eq('anything else is refused', junk.doc, null);
ok('and says so', /does not look like/.test(junk.error || ''));
ok('and is not ok', !junk.ok);
eq('nothing in, nothing out', P.parse('').doc, null);

// -- the DS-7002: every field, from the real document ----------------
const a = P.parse(DS7002);
ok('the DS-7002 parses completely', a.ok);
eq('and nothing is missing', a.missing.join(','), '');
/* BOTH IDENTIFIERS ARE LABELLED HERE, which is what makes this the better
   source than the DS-2019 for either of them - and why the stationery trap
   cannot recur on this document. */
eq('SEVIS ID',        a.fields.sevisId, 'N0036102391');
eq('programme number', a.fields.programNumber, 'P-3-06123');
eq('the name',        a.fields.docName, 'Putra, I Gede Angga Krisna Mahadi');
eq('the applicant email', a.fields.docEmail, 'anggakrisnamahadi09@gmail.com');
eq('the sponsor',     a.fields.sponsor, 'ASSE Aspire, Inc.');
eq('the host organisation', a.fields.hostOrgName, 'The Westin Richmond');
eq('its address',     a.fields.hostOrgAddress, '6631 W BROAD ST, RICHMOND, VA 23230');
eq('its EIN',         a.fields.hostEin, '205500685');
eq('hours per week',  a.fields.hoursPerWeek, '32');
eq('the stipend',     a.fields.stipend, 'Yes, 17.00 per Hour');
eq('the field of study', a.fields.fieldOfStudy, 'Culinary Arts');
eq('the degree',      a.fields.degree, 'Diploma 3');

/* THE LONGEST LABEL WINS AT ANY POSITION. `Category` is a substring of
   `Occupational Category`, so a naive scan gives the occupation's value to the
   category and leaves the occupation reading " Category: Hospitality...". */
eq('the category is the category', a.fields.category, 'INTERN');
eq('and the occupation is its own', a.fields.occupation, 'Hospitality and Tourism');

/* THE RUN STAYS WHOLE. An earlier version pulled the email out with a pattern
   and got "Managersherae.jackson@westinrichmond.com" - the job title glued to
   the front. That boundary cannot be found: an email local part is letters,
   "Manager" is letters, and nothing in the text says where one ends. A
   wrong-looking address on screen is worse than none. */
ok('the supervisor block is kept whole',
   /Jackson/.test(a.fields.supervisor) && /westinrichmond/.test(a.fields.supervisor));
eq('and no email is invented from it', a.fields.supervisorEmail, undefined);
/* And the label matched at all, which it did not when the space was assumed. */
ok('the supervisor label matched despite the missing spaces', !!a.fields.supervisor);
eq('so the stipend before it did not run on', a.fields.stipend, 'Yes, 17.00 per Hour');
eq('and the field of study was found too', a.fields.fieldOfStudy, 'Culinary Arts');
/* CEAC's phone boxes take digits only - its own error message is the rule -
   and the form writes 804-205-5207. */
eq('the phone is digits only', a.fields.supervisorPhone, '8042055207');

/* The period comes as one range, month-first like every date on these forms. */
eq('the training dates split', a.fields.programFrom, '16-SEP-2024');
eq('and the end',              a.fields.programTo,   '16-SEP-2025');
eq('arrival follows From',     a.fields.arrivalDate,   '16-SEP-2024');
eq('departure follows To',     a.fields.departureDate, '16-SEP-2025');

/* ORDER INDEPENDENCE. Which label comes next depends on whose software
   generated the PDF, so the value runs to the next label found ANYWHERE, not
   to the next one in a fixed list. letter.js scans in a fixed order, which is
   right for a one-column letter and wrong here. */
const swapped = P.parse(DS7002
  .replace('Host Organization Name: The Westin Richmond Employer ID Number: 205500685',
           'Employer ID Number: 205500685 Host Organization Name: The Westin Richmond'));
eq('the host name survives a swap', swapped.fields.hostOrgName, 'The Westin Richmond');
eq('and the EIN too',              swapped.fields.hostEin, '205500685');

// -- the DS-2019 -----------------------------------------------------
const b = P.parse(DS2019);
eq('the programme starts', b.fields.programFrom, '25-MAY-2026');
eq('and ends',             b.fields.programTo,   '24-MAY-2027');
ok('which is all it is required to give', b.ok);
/* Two spaces after "To" on the real form; norm() collapses them, and the
   pattern must not depend on exactly one. */
ok('the double space did not break it', !!b.fields.programTo);

/* MONTH FIRST, AND THE LABEL IS WHAT SAYS SO. 05-25-2026 happens to be
   unambiguous because 25 cannot be a month; 05-12-2026 is not, and parseDate's
   default is day-first - the Indonesian convention - so without the hint it
   would read as 5 December instead of 12 May. */
const amb = P.parse('Form Covers Period: From (mm-dd-yyyy): 05-12-2026 To (mm-dd-yyyy): 04-11-2027');
eq('an ambiguous start reads month-first', amb.fields.programFrom, '12-MAY-2026');
eq('and so does the end',                  amb.fields.programTo,   '11-APR-2027');

/* GOVERNMENT FORMS NUMBER THEIR ITEMS, and that is a cut point even where no
   label is listed. This profile has one label, so its category ran on into the
   whole of item 5 until a 200-character fallback stopped it mid-word. */
eq('the category stops at the next item', b.fields.category, 'INTERN');

// -- THE FORM'S OWN STATIONERY IS SHAPED LIKE A PROGRAMME NUMBER -----
/* Found by the first live run. Every DS-2019 carries the pre-printed 212(e)
   line "PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO" - ECFMG's number,
   there whoever the participant is. It was the ONLY P-n-nnnnn in the blank
   sample, which was the clue and not the reassurance it was taken for, and a
   real applicant's form returned it too against a sheet saying P-4-44043. The
   cross-check then reported a mismatch on EVERY form, which is how an operator
   learns to ignore a warning. */
eq('the stationery is not read as a programme number', b.fields.programNumber, undefined);
eq('so no false mismatch against the sheet',
   P.crossCheck(b, { programNumber: 'P-4-44043' }).length, 0);
/* ONLY THE NUMBER GOES, NOT THE SENTENCE. The first attempt stripped up to the
   next full stop, and that block runs on for two more clauses without one, so
   it swallowed whatever followed. */
const withReal = P.parse(DS2019 + ' Program Number: P-4-44043');
eq('a real one after it still comes through', withReal.fields.programNumber, 'P-4-44043');
eq('and the dates are untouched', withReal.fields.programFrom, '25-MAY-2026');
eq('and the SEVIS id too',        withReal.fields.sevisId, 'N00375XXXXX');

// -- cross-checks against the sheet ----------------------------------
/* Columns CH and CI were typed in FROM these documents, and BZ-CC describe the
   same host organisation the DS-7002 does. A disagreement means one of them is
   wrong on a sworn application, and nothing else here would notice. */
eq('agreeing values raise nothing',
   P.crossCheck(a, { sevisId: 'N0036102391', programNumber: 'P-3-06123',
                     usPocEmail: 'sherae.jackson@westinrichmond.com' }).length, 0);
const bad = P.crossCheck(a, { sevisId: 'N0099999999' });
eq('a different SEVIS id is caught', bad.length, 1);
ok('with both values quoted',
   /N0036102391/.test(bad[0].msg) && /N0099999999/.test(bad[0].msg));
ok('and the document named', /DS-7002/.test(bad[0].msg));
eq('a different programme number is caught',
   P.crossCheck(a, { programNumber: 'P-3-99999' }).length, 1);
/* BY CONTAINMENT, because the supervisor's email cannot be cut out of the run
   it arrives in. Asking whether column CC's address appears inside that run is
   exact in both directions. */
eq('a contact that is not in the block is caught',
   P.crossCheck(a, { usPocEmail: 'someone@else.com' }).length, 1);
eq('and one that is, is not',
   P.crossCheck(a, { usPocEmail: 'sherae.jackson@westinrichmond.com' }).length, 0);

/* THE NAME IS COMPARED AS SORTED WORDS. These forms write "Putra, I Gede
   Angga Krisna Mahadi" and the sheet writes the same name with its own comma
   placement - word order is not the disagreement worth reporting. Sorted
   CHARACTERS was the first attempt and makes any two anagrams equal. */
eq('the same name in another order is not a mismatch',
   P.crossCheck(a, { fullName: 'I GEDE ANGGA KRISNA MAHADI PUTRA' }).length, 0);
eq('a genuinely different name is',
   P.crossCheck(a, { fullName: 'I MADE SOMEONE ELSE' }).length, 1);

/* A redacted sample reads N00375XXXXX. That is a blanked-out id, not a
   contradiction, and reporting it would train the operator to ignore this
   check - exactly as the stationery bug did. */
eq('a redacted id is not a mismatch',
   P.crossCheck(b, { sevisId: 'N0037491619' }).length, 0);

/* A programme that ends on or before it starts is a misread, not a fact. */
const rev = P.crossCheck(
  P.parse('Form Covers Period: From (mm-dd-yyyy): 05-25-2027 To (mm-dd-yyyy): 05-24-2026'), {});
eq('a reversed period is caught', rev.length, 1);
ok('and says so plainly', /ends on or before it starts/.test(rev[0].msg));

// -- two documents describing one placement --------------------------
/* The DS-2019's "Form Covers Period" and the DS-7002's "Training/Internship
   Dates" are the same placement, and the DS-160 swears to one arrival and one
   departure. If they differ, filling either is choosing a document to believe.
   Comparing them is only possible because all three are read in one pass. */
const clash = P.compareDocs(a, b);
ok('a period that differs between the two is caught', clash.length >= 2);
ok('and both documents are named',
   /DS-7002/.test(clash[0].msg) && /DS-2019/.test(clash[0].msg));
eq('documents that agree raise nothing', P.compareDocs(a, a).length, 0);
/* A redacted value must not be read as a disagreement here either. */
eq('a redacted id is skipped in the comparison',
   P.compareDocs(b, P.parse(DS2019.replace('N00375XXXXX', 'N0036102391')))
    .filter(x => x.field === 'sevisId').length, 0);

// -- what actually reaches the form ----------------------------------
/* The sponsor, the stipend, the hours, the field of study are read so the
   operator can see them and so the cross-checks have something to compare -
   not because any DS-160 box asks for them. */
/* The U.S. contact joined them: CEAC wants an organisation name and two name
   boxes, the sheet has one cell for the person and NO column for the
   organisation, so this form is the only source for it. `usPocOrg` comes from
   `Host Organization Name` on the revision that parses and from Section 4's
   `Phase Site Name` on the other. */
eq('the answers that reach the form',
   Object.keys(P.answers(a)).sort().join(','),
   'arrivalDate,departureDate,usPocOrg');
/* Under its OWN name, not the parser's - `hostOrgName` is what the document
   calls it and `usPocOrg` is what the DS-160 box is. Everything else stays
   read-but-not-filled. */
eq('the host organisation is named for its box', P.answers(a).usPocOrg,
   'The Westin Richmond');
eq("not under the parser's own key", P.answers(a).hostOrgName, undefined);
eq('nor the SEVIS id', P.answers(a).sevisId, undefined);

// -- the SEVIS receipt is honest about being unconfirmed -------------
/* No receipt has been seen: the I-901 email that was available is only the
   notification and carries a payment confirmation number, not the SEVIS id.
   The labels are the standard field names, and the profile SAYS SO, so the
   report can tell the operator. Do not add a pattern fallback here until a
   real receipt has been read - that is the shortcut that produced the
   P-3-04510 bug. */
const receipt = P.parse('I-901 Fee Payment Confirmation SEVIS ID: N0036102391 ' +
                        'Name: Putra, I Gede Angga Krisna Mahadi Date of Birth: 03/14/2001');
eq('the receipt is identified', receipt.doc, 'sevis');
ok('and flagged as unconfirmed', receipt.unconfirmed);
eq('its SEVIS id',   receipt.fields.sevisId, 'N0036102391');
eq('its date of birth reads month-first', receipt.fields.docDob, '14-MAR-2001');
ok('the other two profiles are not flagged', !a.unconfirmed && !b.unconfirmed);

// -- a value that is absurdly long is not that value ----------------
/* One of the DS-7002s in circulation is an INTERACTIVE pdf whose field values
   live in AcroForm objects rather than on the page, so the extracted text is
   the form's printed boilerplate with every label sitting next to nothing. The
   parser identified it correctly and then handed back a programme number of
   2,700 characters of capitalised attestation text - a wrong value, not a
   visible gap, which is the worst outcome this project produces. */
const runaway = P.parse('Training/Internship Placement Plan ' +
  'Program Number: SIGNATURE OF RESPONSIBLE OFFICER OR ALTERNATE RESPONSIBLE ' +
  'OFFICER 1. I HAVE REVIEWED, UNDERSTAND, AND WILL ENSURE THAT THE SUPERVISOR ' +
  'FOLLOWS THIS TRAINING/INTERNSHIP PLACEMENT PLAN REGARDING THE TRAINEE');
eq('it is still recognised as a DS-7002', runaway.doc, 'ds7002');
eq('but the boilerplate is not a programme number', runaway.fields.programNumber, undefined);
ok('and it is reported missing', runaway.missing.indexOf('programNumber') >= 0);
/* THE HINT IS THE USEFUL PART. The operator has no way to know that printing
   the PDF flat puts the values back on the page. */
ok('and the hint says where the values really are',
   /inside a form container/.test(runaway.hint || ''));
ok('a good document carries no hint', !a.hint && !b.hint);

/* THE TWO IDENTIFIERS MUST MATCH THE SHAPE THEIR ISSUER PRINTS. Not a guess:
   CEAC itself requires P-n-nnnnn. The SHEET side stays tolerant and merely
   warns (see normalize.js) because a person typed that, and a person's typo is
   worth showing - a document's own field is not. */
eq('a mis-shaped programme number is dropped', P.sane('programNumber', 'PL52-449'), '');
eq('a good one is kept',                       P.sane('programNumber', 'P-3-06123'), 'P-3-06123');
eq('a mis-shaped SEVIS id is dropped',         P.sane('sevisId', '37889931'), '');
eq('a good one is kept',                       P.sane('sevisId', 'N0036102391'), 'N0036102391');
/* A REDACTED SAMPLE STILL PASSES. N00375XXXXX is a blanked-out id, and the
   cross-check already knows not to treat it as a contradiction. */
eq('a redacted id survives the shape check',   P.sane('sevisId', 'N00375XXXXX'), 'N00375XXXXX');
/* Everything else is bounded by length rather than shape - long enough for the
   longest real value on the form, short enough that a runaway cannot pass. */
eq('a plausible host name is kept', P.sane('hostOrgName', 'The Westin Richmond'), 'The Westin Richmond');
eq('a 500-character one is not',    P.sane('hostOrgName', 'x'.repeat(500)), '');

// -- what the first live run found ----------------------------------
/* Three defects, all of them a check speaking about data it should not have
   been looking at - the third time in one day. */

/* AN INTERACTIVE DS-7002's page text is only the BLANK FORM'S PRINTED LABELS,
   so `Main Program Supervisor/POC` matched and took the NEXT LABEL as its
   value: "at Host Organization TitleEmail". crossCheck then reported that the
   sheet's real contact address did not appear in it - a mismatch against
   nothing, on a document already reported empty. */
const blankForm = P.parse(
  'Training/Internship Placement Plan Program Sponsor Program Number ' +
  'The Exchange Visitor is: Main Program Supervisor/POC at Host Organization ' +
  'Title Email Phone Fax Please list the names and titles of those');
eq('it is still recognised', blankForm.doc, 'ds7002');
ok('and reported empty', !!blankForm.hint);
/* The longer Section 4 label claims it now, so the junk lands in
   `supervisorName` instead - but junk it remains: `Title Email`, the two
   labels that follow. */
ok('it did pick up label text as a value',
   /Title/.test(blankForm.fields.supervisorName || blankForm.fields.supervisor || ''));
/* AND THAT IS WHY `answers()` REFUSES A HINTED DOCUMENT. Split, `Title Email`
   becomes Surname "Email" / Given "Title" - two capitalised words that no
   shape check can reject, heading for the U.S. Contact page. The dates were
   safe only because `parseDate` refuses words; the moment a document supplied
   a NAME, luck ran out. */
eq('and answers nothing at all', Object.keys(P.answers(blankForm)).length, 0);
/* THE GATE. A document that gave up none of its required fields cannot be
   cross-checked, and trying is worse than not. */
eq('so nothing is cross-checked against it',
   P.crossCheck(blankForm, { usPocEmail: 'hberkey@kalahariresorts.com',
                             sevisId: 'N0036102391',
                             programNumber: 'P-3-06123' }).length, 0);
/* A document that DID read is still cross-checked, or the gate has gone too
   far. */
eq('a readable one is still checked',
   P.crossCheck(a, { programNumber: 'P-3-99999' }).length, 1);

/* THE HINT'S REASON DEPENDS ON WHICH DOCUMENT IT IS. Blaming the PDF format is
   right where the labels are known good; for the SEVIS receipt, whose labels
   have never been checked against a real one, the likely fault is OURS - and
   "print it flat" would send the operator to do something useless. */
const emptyReceipt = P.parse('I-901 Fee Payment Confirmation for your records');
ok('the receipt blames the labels', /labels have never been checked/.test(emptyReceipt.hint || ''));
ok('and not the file format', !/interactive PDF/.test(emptyReceipt.hint || ''));
/* THE WORDING WAS FACTUALLY WRONG and it matters, because it told the operator
   where to look: it said the values "sit in form fields". They do not - they
   are ordinary page text drawn inside a Form XObject per field. Checked on the
   file: the LABELS come out at real page coordinates (Trainee/Intern Name at
   x 39.6, y 698) and the VALUES at local ones (Widiantara at x 1.0, y 3.5),
   because an XObject's placement lives in the page stream, not in the XObject.

   It also framed printing as an instruction. It is not: 0 of the 69 rows need
   the DS-7002 for anything that reaches the form. */
ok('the DS-7002 hint says where the values really are',
   /inside a form container/.test(blankForm.hint || ''));
ok('and offers printing rather than demanding it',
   /if you want this document as a cross-check/.test(blankForm.hint || ''));
ok('it no longer claims they sit in form fields',
   !/sit in form fields/.test(blankForm.hint || ''));

// -- END TO END, against a real PDF if one is on this machine -------
/* THIS IS THE BLOCK THAT EARNS ITS KEEP. Everything above runs on text typed
   into this file, and typed text has spaces in it - which is exactly what hid
   the whitespace bug: the real extraction reads "Main ProgramSupervisor/POC:"
   and the label stopped matching, so the stipend before it swallowed the whole
   supervisor block. Only the real PDF showed that.

   So this runs the PRODUCTION path - pdftext.js over the actual bytes - not a
   convenient stand-in. The documents are gitignored (they are real people's,
   and this repo is public), so it is skipped in CI and on any other machine.

   Set J1_DOC=<path> to point it at one, or drop a DS-7002 / DS-2019 PDF in
   ~/Downloads. */

/* -- SECTION 2 LABELS ITS OWN CITY, STATE AND ZIP -------------------
   The user pointed at the form: the host organisation block is a table of
   named cells, so nothing has to be read out of the tail of an address
   string - which matters, because the sheet's column has to be and its shape
   varies.

   THE TEXT BELOW IS GLUED THE WAY THE FORM ARRIVES. pdftext.js joins runs with
   no separator, so a label the form wraps loses its space and the values sit
   flush against the labels before them - `Organization NameKalahari Resort
   Sandusky OH`. Hand-typing the spaces in is what hid the supervisor bug once
   already, so do not tidy this. */
const hostSection =
  'U.S. Department of State Training/Internship Placement Plan (DS-7002) ' +
  'SEVIS ID N0036102391 Program Number P-3-06123 ' +
  'Training/Internship Dates 09/16/2024 - 09/16/2025 ' +
  'SECTION 2: HOST ORGANIZATION INFORMATION Organization NameKalahari Resort Sandusky OH' +
  'Phase Site Address7000 Kalahari Dr. Suite CitySandusky StateOH ZIP Code44870 ' +
  'Website URLhttps://www.kalahariresorts.com/ohio Employer ID Number (EIN)710927750 ' +
  'Exchange Visitor Hours Per Week32 ' +
  'SECTION 3: CERTIFICATIONS I agree that if I receive information regarding a ' +
  'serious problem that could be expected to bring the Department of State into ' +
  'notoriety or disrepute I will notify the sponsor';
const host = P.parse(hostSection).fields;
eq('the host city',   host.hostCity, 'Sandusky');
eq('the host state',  host.hostState, 'OH');
eq('the host ZIP',    host.hostZip, '44870');
eq('the host street', host.hostStreet, '7000 Kalahari Dr.');

/* AND THE TWO CITIES FOLLOW FROM IT - the user's rule, derived here the same
   way the dates are derived from the programme period. Both are trip fields,
   so applyParsed stores them as this applicant's own entry and they stay
   editable; a participant may fly into somewhere else. */
eq('the arrival city',   host.arrivalCity, 'Sandusky');
eq('the departure city', host.departureCity, 'Sandusky');
eq('and they are answers the form takes',
   P.ANSWER_KEYS.indexOf('arrivalCity') >= 0 && P.ANSWER_KEYS.indexOf('departureCity') >= 0,
   true);

/* THE SCOPE IS THE WHOLE POINT, and two measurements are why it exists.
   `State` on its own matched the letterhead first - "U.S. Department of
   State" - and with that declared as a cut point it matched the sponsor's
   attestation instead: "bring the Department of State into notoriety or
   disrepute". Both are in the string above, AFTER the host section, and
   neither may win. */
eq('the letterhead does not become the state', host.hostState.length <= 2, true);
/* Outside the section these keys are not read at all: the whole-document pass
   has them deleted before the scoped pass runs, so a match from anywhere else
   cannot survive. A document with no Section 2 heading yields none of them -
   which is the flattened DS-7002 in circulation, and its single-line
   `Address` stays its source. */
const noSection = P.parse(
  'Training/Internship Placement Plan U.S. Department of State ' +
  'SEVIS ID N0036102391 Program Number P-3-06123 ' +
  'Training/Internship Dates 09/16/2024 - 09/16/2025 ' +
  'City Nowhere State Nowhere ZIP Code 00000 ' +
  'Host Organization Name The Westin Richmond Address 6631 W BROAD ST, RICHMOND, VA 23230').fields;
eq('no section, no city',   noSection.hostCity, undefined);
eq('no section, no state',  noSection.hostState, undefined);
eq('no section, no ZIP',    noSection.hostZip, undefined);
eq('and no cities derived', noSection.arrivalCity, undefined);
eq('the single-line address still reads',
   noSection.hostOrgAddress, '6631 W BROAD ST, RICHMOND, VA 23230');

const PDFText = require('../pdftext.js');
const dir = path.join(os.homedir(), 'Downloads');
let files = [];
if (process.env.J1_DOC) files = [process.env.J1_DOC];
else {
  try {
    files = fs.readdirSync(dir)
      .filter(f => /(DS-?2019|DS-?7002|SEVIS|I-?901).*\.pdf$/i.test(f))
      .map(f => path.join(dir, f));
  } catch (e) { /* no Downloads directory */ }
}

function summary() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

if (!files.length) {
  console.log('  (no local J1 PDF found - the label tests above still ran)');
  summary();
} else {
  (async () => {
    for (const f of files) {
      let text = '';
      try {
        text = String(await PDFText.extract(new Uint8Array(fs.readFileSync(f))));
      } catch (e) {
        console.log('  (' + path.basename(f) + ': pdftext threw - ' + e.message + ')');
        continue;
      }
      const name = path.basename(f);
      /* pdftext.js returned ZERO characters from the CEAC print-out, so this
         is a real question and not a formality. */
      ok('pdftext read ' + name, text.length > 0);
      if (!text.length) continue;
      const live = P.parse(text);
      ok('and it was identified: ' + name, !!live.doc);
      if (!live.doc) continue;
      /* EITHER EVERYTHING REQUIRED IS THERE, OR THE PARSER EXPLAINS WHY NOT.
         Both outcomes are correct and the difference is the document, not the
         code: a flattened DS-7002 gives up every field, while an INTERACTIVE
         one keeps its values in AcroForm objects the page text cannot reach -
         and for that one the right answer is the hint telling the operator to
         print it flat. What is NOT acceptable is a confident wrong value,
         which is what happened before the length bounds went in: a programme
         number of 2,700 characters of attestation boilerplate. */
      ok(name + ' (' + live.doc + ') is complete, or says why not',
         !live.missing.length || !!live.hint);
      if (live.hint) console.log('  (' + name + ' -> hint: ' + live.hint + ')');
      /* And in either case, nothing absurd got through. */
      for (const k in live.fields)
        ok(name + ': ' + k + ' is a plausible length', String(live.fields[k]).length <= 200);
      console.log('  (' + name + ' -> ' + live.doc + ': ' + JSON.stringify(live.fields) + ')');
    }
    summary();
  })();
}

/* PROVEN 2026-09-04: pdftext.js reads both a real DS-2019 and a real DS-7002 -
   44,390 characters out of the latter, and every required field with it. STILL
   OPEN: a real SEVIS receipt has not been seen, so that profile's labels are
   the standard field names and nothing more; and the SEVIS id does not extract
   from a real DS-2019, which is why the DS-7002 is read first. */
