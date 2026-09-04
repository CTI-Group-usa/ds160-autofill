/* Trip details are per applicant. The thing that must never happen is
   one seafarer's itinerary leaking onto another's application.
   Run: node test/trip.test.js */

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
global.DS160 = require('../normalize.js');
const T = require('../trip.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

const budi = { passportNumber: 'C1234567', email: 'budi@example.com', fullName: 'BUDI SANTOSO' };
const ahmad = { passportNumber: 'X9876543', email: 'ahmad@example.com', fullName: 'AHMAD FAUZI' };
const noPassport = { passportNumber: '', email: 'siti@example.com', fullName: 'SITI' };

// -- identity ---------------------------------------------------------
eq('keyed on passport', T.idOf(budi), 'C1234567');
eq('falls back to email', T.idOf(noPassport), 'SITI@EXAMPLE.COM');
eq('no identity at all', T.idOf({}), '');

// -- defaults ---------------------------------------------------------
/* THE PURPOSE IS A VISA-CLASS ANSWER, so trip.js deliberately has no default
   for it any more - each constants pack supplies its own. It used to carry the
   C1/D values here, and that leaked: app.js applies trip details FIRST and
   constants second, and DS160Const.apply() never overwrites a value already
   set, so a J1 record was stamped ALIEN IN TRANSIT (C) by this file and the J1
   pack could not correct it. */
eq('purpose has no default here', T.values(budi).purposeOfTrip, '');
eq('nor does specify', T.values(budi).specifyPurpose, '');
eq('nor specific travel plans', T.values(budi).specificTravelPlans, '');
eq('arrival empty by default', T.values(budi).arrivalDate, '');

// -- one applicant does not affect another ----------------------------
T.set(budi, 'arrivalCity', 'MIAMI');
T.set(budi, 'vesselName', 'SYMPHONY OF THE SEAS');
eq('stored for budi', T.values(budi).arrivalCity, 'MIAMI');
eq('ahmad unaffected', T.values(ahmad).arrivalCity, '');
eq('ahmad vessel unaffected', T.values(ahmad).vesselName, '');

// -- dates are normalised on the way in -------------------------------
eq('day-first typed',  T.set(budi, 'arrivalDate', '15/10/2026'), '15-OCT-2026');
eq('iso typed',        T.set(budi, 'departureDate', '2027-04-20'), '20-APR-2027');
eq('already formatted', T.set(budi, 'arrivalDate', '15-OCT-2026'), '15-OCT-2026');
eq('unparseable kept as typed', T.set(budi, 'departureFlight', 'GA880'), 'GA880');

// -- merging never clobbers the seafarer's own data -------------------
const merged = T.apply(Object.assign({ vesselName: 'OASIS OF THE SEAS' }, budi));
eq('existing value wins', merged.vesselName, 'OASIS OF THE SEAS');
eq('blank gets filled', T.apply(budi).vesselName, 'SYMPHONY OF THE SEAS');
/* apply() does not set an empty field at all, so the key is absent rather
   than ''. Either satisfies DS160Const.apply(), which fills when the value is
   undefined OR '' - the point is only that this file leaves it for the class. */
eq('and apply() leaves it for the class to fill',
   T.apply(budi).purposeOfTrip, undefined);

// -- copy is explicit and one-way -------------------------------------
eq('copy reports success', T.copy(budi, ahmad), true);
eq('ahmad now has it', T.values(ahmad).arrivalCity, 'MIAMI');
T.set(ahmad, 'arrivalCity', 'PORT CANAVERAL');
eq('copies are independent', T.values(budi).arrivalCity, 'MIAMI');
eq('copy from an empty applicant does nothing',
   T.copy({ passportNumber: 'NOBODY' }, budi), false);
eq('budi survives that', T.values(budi).arrivalCity, 'MIAMI');

// -- clearing only clears one applicant -------------------------------
T.clear(budi);
eq('budi cleared', T.values(budi).arrivalCity, '');
eq('clearing leaves the purpose empty, as it always is here',
   T.values(budi).purposeOfTrip, '');
eq('ahmad untouched', T.values(ahmad).arrivalCity, 'PORT CANAVERAL');

// -- a record with no identity is not storable ------------------------
eq('anonymous set is a no-op', T.set({}, 'arrivalCity', 'MIAMI'), '');

// -- every trip field can actually be filled --------------------------
const M = require('../extension/matcher.js');
const ruleKeys = new Set(M.RULES.map(r => r.key));
eq('all trip fields are fillable',
   T.FIELDS.filter(f => !ruleKeys.has(f.key)).map(f => f.key), []);


/* -- the class's attachments, and one code path ---------------------
   app.js is browser-only (an IIFE, no exports), so these are text assertions
   on the file - the same arrangement test/auth.test.js and
   test/extension-auth.test.js use for the gate and the popup. They cannot
   prove the button works; they can prove the documents have not drifted into
   several copies of the same logic, which is the thing that rots.

   C1/D has one attachment carrying answers the sheet does not - the supporting
   letter (vessel, IMO, joining date, US port). J1 has THREE, in columns CN, CO
   and CP: the DS-7002, the DS-2019 and the SEVIS receipt. */
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')
              .split('\r\n').join('\n');
/* This file has eq() but no ok(). */
const ok = (label, cond) => eq(label, !!cond, true);

ok('app.js declares a document set per class', /const DOCS = \{[\s\S]{0,400}c1d:[\s\S]{0,2000}j1:/.test(app));
ok('C1/D reads the supporting letter', /key: 'supportingLetterUrl'/.test(app));
ok('J1 reads all three attachments',
   /key: 'ds7002Url'/.test(app) && /key: 'ds2019Url'/.test(app) &&
   /key: 'sevisReceiptUrl'/.test(app));
ok('and each class names its own parser',
   /parser: \(\) => DS160Letter/.test(app) && /parser: \(\) => DS160J1Docs/.test(app));

/* DS-7002 FIRST, AND THE ORDER IS LOAD-BEARING. It labels both the SEVIS id
   and the programme number, where the DS-2019 prints the SEVIS id with no
   label at all and carries a programme number in its own stationery. First
   value wins on merge, so the better source has to be read first. */
ok('the DS-7002 is listed before the DS-2019',
   app.indexOf("key: 'ds7002Url'") < app.indexOf("key: 'ds2019Url'"));
ok('first value wins on merge', /if \(!\(k in answers\)\) \{ answers\[k\] = a\[k\]/.test(app));

/* THE TAB CHOOSES, NOT THE RECORD. index.html says the tab is the authority
   for which class is in play, and the trip block belongs to whichever tab is
   open - so a J1 applicant is never offered the C1/D letter reader, and a
   C1/D one is never asked for a DS-2019 that does not exist. */
ok('the active class picks the document set', /DOCS\[DS160Const\.activeClass\(\)\]/.test(app));

/* ONE PARSE PATH, not one per document. The parser differs by class, the
   wording differs, nothing else does - and within J1 the SAME parser handles
   all three, identifying the document from its own title. */
ok('the parse path goes through the descriptor',
   /doc\.parser\(\)\.parse\(/.test(app) && /P\.answers\(u\.parsed\)/.test(app) &&
   /P\.crossCheck\(pr, rec\)/.test(app));
ok('nothing calls DS160Letter directly any more',
   (app.match(/DS160Letter/g) || []).length === 1);

/* READ IN ONE PASS, and not only to save clicks: the DS-2019's period and the
   DS-7002's training dates describe the same placement, and comparing them is
   only possible if both are in hand at once. */
ok('the documents are compared against each other', /P\.compareDocs\(readable\[i\]/.test(app));

/* ONE BAD ATTACHMENT MUST NOT DISCARD THE GOOD ONES. fetchOne resolves on
   failure rather than rejecting, and the failure is carried into the report. */
ok('a failed fetch resolves rather than rejects',
   /resolve\(\{ error:/.test(app) && !/reject\(/.test(app));
/* On its own line now, with the document's name - it used to be swept into
   the CHECK list at the end, where a fetch failure read like a data problem. */
ok('and its error reaches the report',
   /lines\.push\(name \+ ': ' \+ f\.error\)/.test(app));

/* THE DESCRIPTOR IS CAPTURED ONCE, before the first fetch. Three reads at up
   to 20s each is a long time to hold a tab still, and switching class mid-run
   would change what activeDoc() returns - so the replies would be parsed by
   the other class's parser and reported in the other document's words. */
const fetchFn = app.slice(app.indexOf('async function fetchDocs()'));
const fetchBody = fetchFn.slice(0, fetchFn.indexOf('applyParsed(doc, out)'));
ok('fetchDocs captures the document set first',
   /async function fetchDocs\(\) \{\s*const doc = activeDoc\(\);/.test(fetchFn));
ok('and never re-reads it while fetching',
   !/activeDoc\(\)/.test(fetchBody.slice(fetchBody.indexOf('const doc = activeDoc();') + 24)));

/* Both handlers are guarded: with no class in play letterBox() renders
   nothing, and addEventListener on null throws before the rest of the detail
   view gets wired. */
ok('the fetch button is guarded',  /if \(\$\('letterFetch'\)\)/.test(app));
ok('the paste button too',         /if \(\$\('letterParse'\)\)/.test(app));

/* A row missing one attachment is normal - and it is named rather than
   treated as a failure, so the operator knows which one to go and find. */
ok('missing links are named, not fatal', /not in this row: /.test(app));

/* -- the report says what each document did -------------------------
   The first live run opened "2 field(s) read from DS-7002" on a pass where the
   DS-7002 gave NOTHING and both dates came from the DS-2019: the total,
   attached to the first name in the list. A count against the wrong document
   is a plain false statement, and this report is the whole of what the
   operator sees. */
ok('each answer records which document supplied it',
   /from\[k\] = u\.parsed\.name/.test(app));
ok('and the line names only what that document gave',
   /const gave = Object\.keys\(answers\)\.filter\(k => from\[k\] === pr\.name\)/.test(app));
ok('the total is stated on its own, not against a name',
   /nAnswers \+ ' field\(s\) filled\. '/.test(app));

/* ONE LINE PER DOCUMENT. The old shape said the same thing about a failed
   document three times - once in "not in it", once as its unconfirmed note,
   once as its hint - and left the successful one unmentioned. */
ok('a failed fetch is named on its own line', /lines\.push\(name \+ ': ' \+ f\.error\)/.test(app));
ok('an unrecognised document says so', /not a DS-7002, DS-2019 or SEVIS receipt/.test(app));
ok('and the unconfirmed note stands down when the hint has said it',
   /pr\.unconfirmed && !gave\.length && !pr\.hint/.test(app));

/* One full stop, not two: a hint already ends in one, so joining with '. '
   produced "...read that instead.. DS-2019:". */
ok('lines are punctuated once', /\/\[\.\!\?\]\$\/\.test\(l\)/.test(app));

/* RED ONLY WHEN THE PASS ACTUALLY FAILED: nothing reached the form, or
   something disagrees. A document that gave nothing is NOT by itself a
   failure, and treating it as one put a red banner on 67 of the 69 J1 rows.
   Measured: every row carrying a DS-7002 carries a DS-2019 too - 0 rows where
   the DS-7002 is the only itinerary source - so an unreadable one costs a
   cross-check, not an answer.

   This is the comma warning again: a red line that is always there and never
   actionable teaches the operator to stop reading. */
ok('a missing cross-check is not a failure',
   /const todo = unique\.length \|\| !nAnswers \|\| list\.some\(f => f && f\.error\)/.test(app));
ok('and the report says so once, at the end',
   /are cross-checks - nothing is missing from the form/.test(app));

/* A document that gave up nothing is not cross-checked HERE either - j1docs.js
   gates it too, and this is the belt to those braces. */
ok('no cross-check against an empty document', /if \(!pr\.hint\) for \(const i of P\.crossCheck/.test(app));

/* NOT VERIFIED IN A BROWSER, and it cannot be from here: the worksheet is
   behind the Microsoft sign-in. Pressing the button on a real J1 row is a
   human check - and it is the same one that settles whether pdftext.js can
   read a DS-7002 or a SEVIS receipt at all. */


/* -- A GATE THIS FILE NO LONGER OWNS --------------------------------
   `specificTravelPlans` moved to the constants packs on 2026-09-02 - C1/D
   answers NO and J1 answers YES - and its default here was emptied. But
   `visible()` kept reading it from HERE, where it is now always '', so every
   `showWhen` field was hidden on BOTH classes.

   On C1/D that looked correct, because the answer really is NO and those
   fields really should be hidden. On J1 the answer is YES, and it silently hid
   the whole itinerary: a live report read `departureDate - no value in record`
   while the DS-2019 had supplied it, `arrivalCity` and `departureCity` the
   same, and the trip block did not even offer the boxes to type into. FOUR of
   the fifteen skipped lines, one cause.

   The gates are DERIVED from the table, never listed by hand, so adding a
   `showWhen` cannot forget to register one. */
ok('the gate keys come from the table itself',
   /const GATE_KEYS = FIELDS\.filter\(f => f\.showWhen\)/.test(
     require('fs').readFileSync(require('path').join(__dirname, '..', 'trip.js'), 'utf8')));

const gateRec = { passportNumber: 'GATE1' };
T.set(gateRec, 'arrivalDate', '25-MAY-2026');
T.set(gateRec, 'departureDate', '24-MAY-2027');
T.set(gateRec, 'arrivalCity', 'RIDGEDALE');

/* THE RECORD IS ONE SOURCE OF THE GATE, and the one that matters for apply():
   constants have not been applied yet when trip.apply() runs, so on the real
   path the pack answers - which needs constants.js loaded. Here the record
   carries it, which exercises the same branch without that dependency. */
const openGate = T.apply(Object.assign({ specificTravelPlans: 'YES' }, gateRec));
eq('the itinerary reaches the record', openGate.departureDate, '24-MAY-2027');
eq('and the arrival city',             openGate.arrivalCity, 'RIDGEDALE');
eq('the arrival date always did',      openGate.arrivalDate, '25-MAY-2026');

/* SHUT, AND CORRECTLY SO. C1/D answers NO, CEAC never asks for an itinerary,
   and `apply()` must not send a value for a question that is not on the page. */
const shutGate = T.apply(Object.assign({ specificTravelPlans: 'NO' }, gateRec));
eq('a closed gate keeps the departure out', shutGate.departureDate, undefined);
eq('and the arrival city',                  shutGate.arrivalCity, undefined);
eq('but the arrival date is asked either way', shutGate.arrivalDate, '25-MAY-2026');

/* AN OPERATOR'S OWN ANSWER BEATS EVERYTHING. If they set the gate for this
   applicant in the trip block, that is the answer - a per-applicant entry must
   never lose to a constant. */
T.set(gateRec, 'specificTravelPlans', 'YES');
eq('their own entry opens it', T.apply(Object.assign({}, gateRec)).departureDate, '24-MAY-2027');

/* values() MUST NOT THROW without constants.js. trip.js is loaded on its own
   here and in the extension, and a gate lookup that threw would take the whole
   record with it. */
ok('no pack in play is survivable', !!T.values({ passportNumber: 'GATE1' }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
