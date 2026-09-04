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
ok('first value wins on merge', /if \(!\(k in answers\)\) answers\[k\] = a\[k\]/.test(app));

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
   /P\.crossCheck\(u\.parsed, rec\)/.test(app));
ok('nothing calls DS160Letter directly any more',
   (app.match(/DS160Letter/g) || []).length === 1);

/* READ IN ONE PASS, and not only to save clicks: the DS-2019's period and the
   DS-7002's training dates describe the same placement, and comparing them is
   only possible if both are in hand at once. */
ok('the documents are compared against each other', /P\.compareDocs\(usable\[i\]/.test(app));

/* ONE BAD ATTACHMENT MUST NOT DISCARD THE GOOD ONES. fetchOne resolves on
   failure rather than rejecting, and the failure is carried into the report. */
ok('a failed fetch resolves rather than rejects',
   /resolve\(\{ error:/.test(app) && !/reject\(/.test(app));
ok('and its error reaches the report',
   /problems\.push\(f\.name \+ ': ' \+ f\.error\)/.test(app));

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

/* NOT VERIFIED IN A BROWSER, and it cannot be from here: the worksheet is
   behind the Microsoft sign-in. Pressing the button on a real J1 row is a
   human check - and it is the same one that settles whether pdftext.js can
   read a DS-7002 or a SEVIS receipt at all. */

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
