/* Constant answers must never overwrite the seafarer's own data, and
   must disappear entirely when the agent switches one off.
   Run: node test/constants.test.js */

// localStorage stand-in so the module can run under node.
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const C = require('../constants.js');
/* ONE PACK AT A TIME. The engine has no default class - it throws instead -
   so a test has to say which one it means, exactly like index.html does. */
require('../constants-c1d.js');
require('../constants-j1.js');
C.use('c1d');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

// -- defaults ---------------------------------------------------------
const v = C.values();
eq('ssn default', v.ssnNA, 'YES');
eq('telecode default',        v.telecode, 'NO');
eq('mailing default',         v.mailingSameAsHome, 'YES');
// payerAddr2 is deliberately blank: Carnival UK needs one address line,
// and inventing a second would put words on a visa application.
eq('only the deliberately blank one is blank',
   Object.keys(v).filter(k => !v[k]), ['payerAddr2']);
eq('security sweep on by default', v.securityAllNo, 'YES');
eq('security sweep has no control', C.BY_KEY.securityAllNo.field, false);

// -- merging ----------------------------------------------------------
const merged = C.apply({ surname: 'DHARMAWAN', otherNamesUsed: '' });
eq('fills a blank',            merged.otherNamesUsed, 'NO');
eq('leaves seafarer data',     merged.surname, 'DHARMAWAN');
eq('adds the checkbox answer', merged.taxIdNA, 'YES');

// The native-alphabet box is FILLED with the Latin name, per the filed
// sample - it is no longer a "Does Not Apply" tick.
eq('no native-alphabet constant', 'nativeAlphabetNA' in v, false);

const kept = C.apply({ otherNamesUsed: 'YES', immediateRelativesUS: 'YES' });
eq('never overwrites a set value',   kept.otherNamesUsed, 'YES');
eq('never overwrites a set value 2', kept.immediateRelativesUS, 'YES');

// -- the agent turning one off ----------------------------------------
C.set('telecode', '');
eq('switched off is blank',      C.values().telecode, '');
eq('switched off is not merged', 'telecode' in C.apply({}), false);
eq('switched off is not listed', C.active().some(c => c.key === 'telecode'), false);
eq('others still listed',        C.active().some(c => c.key === 'otherNamesUsed'), true);

// -- agent overriding a default ---------------------------------------
C.set('mailingSameAsHome', 'NO');
eq('override persists', C.values().mailingSameAsHome, 'NO');
eq('override applied',  C.apply({}).mailingSameAsHome, 'NO');

// -- reset ------------------------------------------------------------
C.reset();
eq('reset restores telecode', C.values().telecode, 'NO');
eq('reset restores mailing',  C.values().mailingSameAsHome, 'YES');

// -- unknown keys are ignored -----------------------------------------
C.set('notAThing', 'YES');
eq('unknown key ignored', 'notAThing' in C.values(), false);

// -- every constant has a matcher rule --------------------------------
const M = require('../extension/matcher.js');
const ruleKeys = new Set(M.RULES.map(r => r.key));
const missing = C.CONSTANTS.filter(c => c.field !== false && !ruleKeys.has(c.key))
                           .map(c => c.key);
eq('all constants are fillable', missing, []);

// -- and each one resolves from its real question text ----------------
const P = 'ctl00_SiteContentPlaceHolder_FormView1_';
const byLabel = (label, id) => (M.matchKey({ id: P + (id || 'unknownControl'), name: '', label }, {}) || {}).key;
eq('other names by label',
   byLabel('Q: Have you ever used other names (i.e., maiden, religious, professional, alias, etc.)? A: Yes No'),
   'otherNamesUsed');
eq('telecode by label',
   byLabel('Q: Do you have a telecode that represents your name? A: Yes No'), 'telecode');

// The native-alphabet name is written into the text box; its adjacent
// "Does Not Apply" tick is deliberately left to nobody.
eq('native name box takes the name',
   byLabel('Full Name in Native Alphabet', 'tbxAPP_FULL_NAME_NATIVE'), 'nativeName');
eq('its Does Not Apply box matches nothing',
   byLabel('Does Not Apply/Technology Not Available', 'cbexAPP_FULL_NAME_NATIVE_NA'), undefined);

// -- ONE PACK AT A TIME, NEVER MERGED --------------------------------
/* This is the whole reason the packs are separate files rather than a
   conditional: each carries a block that describes the wrong principal
   entirely - the vessel owner, the manning agency, the cruise line's U.S.
   contact - and those must not cross.

   The SSN, tax ID and monthly salary used to be on this list too, and are no
   longer, because the fix moved: normalize.js derives 'NO' for whichever of
   those columns the sheet fills, apply() will not tick over a value already
   set, and BOTH packs now carry the same default tick. So the two classes give
   the same answer to the same question and a leak can no longer tick a box
   over a number the sheet holds. That is asserted below, with the pack
   deliberately set to the WRONG class. */
C.use('j1');
const j1rec = C.apply({ fullName: 'I KETUT JULIANA' });
eq('a J1 record is stamped j1', j1rec._class, 'j1');
eq('no vessel owner leaks in', j1rec.vesselOwnerCompany, undefined);
eq('no manning agency leaks in', j1rec.agencyName, undefined);
eq("no cruise line's U.S. contact leaks in", j1rec.usPocSurname, undefined);
/* Both packs tick these when the sheet says nothing - that IS the common
   answer, and 15 of the 69 J1 rows hold 0.00 IDR. */
eq('J1 ticks the SSN box by default', j1rec.ssnNA, 'YES');
eq('and the tax ID box', j1rec.taxIdNA, 'YES');
eq('and the monthly income box', j1rec.monthlyIncomeNA, 'YES');
eq('no ENGLISH language constant leaks in', j1rec.languageSpoken, undefined);
eq('and no Do-Not-Know on the organisation name', j1rec.usPocOrgNA, undefined);

/* THE LEAK THAT USED TO MATTER, TESTED WITH THE WRONG PACK ON PURPOSE.
   A J1 row filed while the C1/D pack is active still keeps its salary and its
   SSN, and both Does Not Apply boxes stay clear - because the record asserted
   'NO' before any pack was consulted. Ticking one of these over a number the
   participant gave is a wrong sworn answer that nothing else would catch: a
   ticked box is not a gap and appears in no report. */
const N = require('../normalize.js');
C.use('c1d');
const wrongPack = C.apply(N.toRecord({
  'Name': 'I Ketut, Juliana',
  'Monthly Salary': '3600000.00 IDR',
  'U.S. Social Security Number (if any)': '123456789',
}));
eq('the salary survives the wrong pack', wrongPack.monthlyIncome, '3600000');
eq('and its tick stays clear', wrongPack.monthlyIncomeNA, 'NO');
eq('the SSN survives too', wrongPack.ssn, '123456789');
eq('and its tick stays clear', wrongPack.ssnNA, 'NO');
C.use('j1');

/* The purpose is a class answer, and each pack owns its own. trip.js used to
   carry the C1/D values, which app.js applied FIRST - and apply() never
   overwrites - so a J1 record could not be corrected by its own pack. */
eq('J1 purpose', j1rec.purposeOfTrip, 'EXCHANGE VISITOR (J)');
eq('J1 specify', j1rec.specifyPurpose, 'EXCHANGE VISITOR (J1)');
eq('J1 has specific travel plans, unlike C1/D', j1rec.specificTravelPlans, 'YES');
eq('and the payer is a person, a different DS-160 branch', j1rec.tripPayer, 'OTHER PERSON');

C.use('c1d');
const c1drec = C.apply({ fullName: 'BUDI SANTOSO' });
eq('a C1/D record is stamped c1d', c1drec._class, 'c1d');
eq('nothing from the exchange-visitor page leaks the other way',
   c1drec.intendToStudy, undefined);
eq('nor the CTI additional contact', c1drec.addPoc1Name, undefined);
eq('C1/D purpose is unchanged', c1drec.purposeOfTrip, 'ALIEN IN TRANSIT (C)');
eq('and it still answers No to specific travel plans', c1drec.specificTravelPlans, 'NO');

/* Overrides are per class, so switching does not carry one class's choices
   into the other. */
eq('the store key names the class', C.STORE, 'ds160.constants.c1d');
C.use('j1');
eq('and changes with it', C.STORE, 'ds160.constants.j1');
C.use('c1d');

/* There is no default class ON PURPOSE - a silent fallback to C1/D is exactly
   the failure this split prevents. */
let threw = false;
try { C.use('b1b2'); } catch (e) { threw = true; }
eq('an unregistered class is refused, not ignored', threw, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
