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
eq('purpose default', T.values(budi).purposeOfTrip, 'ALIEN IN TRANSIT (C)');
eq('specify default', T.values(budi).specifyPurpose, 'CREWMEMBER IN TRANSIT (C1/D)');
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
eq('default merged too', T.apply(budi).purposeOfTrip, 'ALIEN IN TRANSIT (C)');

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
eq('budi keeps defaults', T.values(budi).purposeOfTrip, 'ALIEN IN TRANSIT (C)');
eq('ahmad untouched', T.values(ahmad).arrivalCity, 'PORT CANAVERAL');

// -- a record with no identity is not storable ------------------------
eq('anonymous set is a no-op', T.set({}, 'arrivalCity', 'MIAMI'), '');

// -- every trip field can actually be filled --------------------------
const M = require('../extension/matcher.js');
const ruleKeys = new Set(M.RULES.map(r => r.key));
eq('all trip fields are fillable',
   T.FIELDS.filter(f => !ruleKeys.has(f.key)).map(f => f.key), []);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
