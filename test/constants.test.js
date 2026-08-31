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

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

// -- defaults ---------------------------------------------------------
const v = C.values();
eq('native alphabet default', v.nativeAlphabetNA, 'YES');
eq('telecode default',        v.telecode, 'NO');
eq('mailing default',         v.mailingSameAsHome, 'YES');
eq('every constant answered', Object.values(v).every(Boolean), true);

// -- merging ----------------------------------------------------------
const merged = C.apply({ surname: 'DHARMAWAN', otherNamesUsed: '' });
eq('fills a blank',            merged.otherNamesUsed, 'NO');
eq('leaves seafarer data',     merged.surname, 'DHARMAWAN');
eq('adds the checkbox answer', merged.nativeAlphabetNA, 'YES');

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
const missing = C.CONSTANTS.filter(c => !ruleKeys.has(c.key)).map(c => c.key);
eq('all constants are fillable', missing, []);

// -- and each one resolves from its real question text ----------------
const P = 'ctl00_SiteContentPlaceHolder_FormView1_';
const byLabel = (label, id) => (M.matchKey({ id: P + (id || 'unknownControl'), name: '', label }, {}) || {}).key;
eq('native alphabet by label',
   byLabel('Does Not Apply/Technology Not Available'), 'nativeAlphabetNA');
eq('other names by label',
   byLabel('Q: Have you ever used other names (i.e., maiden, religious, professional, alias, etc.)? A: Yes No'),
   'otherNamesUsed');
eq('telecode by label',
   byLabel('Q: Do you have a telecode that represents your name? A: Yes No'), 'telecode');
eq('native name box is NOT the checkbox',
   byLabel('Full Name in Native Alphabet', 'tbxAPP_FULL_NAME_NATIVE'), undefined);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
