/* Plain-node smoke tests. Run: node test/normalize.test.js */
const D = require('../normalize.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want)); }
}
function has(label, list, field, frag) {
  const hit = list.some(x => x.field === field && x.msg.indexOf(frag) >= 0);
  if (hit) pass++; else { fail++; console.log('FAIL ' + label + ' (no ' + field + ' containing "' + frag + '")'); }
}
function none(label, list, field) {
  const hit = list.some(x => x.field === field);
  if (!hit) pass++; else { fail++; console.log('FAIL ' + label + ' (unexpected ' + field + ')'); }
}

// -- date parsing ----------------------------------------------------
eq('iso date',        D.dateStr('1995-03-05'), '05-MAR-1995');
eq('day-first slash', D.dateStr('25/03/1995'), '25-MAR-1995');
eq('named month',     D.dateStr('5 January 1990'), '05-JAN-1990');
eq('us style',        D.dateStr('Jan 5, 1990'), '05-JAN-1990');
eq('excel serial',    D.dateStr('34763'), '05-MAR-1995');
eq('empty date',      D.dateStr(''), '');
eq('ambiguous flag',  D.parseDate('05/03/1995').ambiguous, true);
eq('unambiguous',     !!D.parseDate('25/03/1995').ambiguous, false);

// -- phones ----------------------------------------------------------
eq('phone 08',   D.normPhone('0812-3456-7890'), '+6281234567890');
eq('phone 62',   D.normPhone('62 812 3456 7890'), '+6281234567890');
eq('phone bare', D.normPhone('81234567890'), '+6281234567890');

// -- names -----------------------------------------------------------
eq('mononym surname', D.splitName('Sukarno').surname, 'SUKARNO');
eq('mononym given',   D.splitName('Sukarno').given, 'FNU');
eq('multi surname',   D.splitName('Budi Santoso').surname, 'SANTOSO');
eq('multi given',     D.splitName('I Wayan Putu Astra').given, 'I WAYAN PUTU');
/* "FNU" is the DS-160 placeholder for a name that does not exist, and it
   arrives in already-processed intake data. Kept as a token it became the
   surname: the live Family page filled Surnames FNU / Given Names SUROSO
   from a father's name of "SUROSO FNU". */
eq('trailing FNU surname',  D.splitName('SUROSO FNU').surname, 'SUROSO');
eq('trailing FNU given',    D.splitName('SUROSO FNU').given, 'FNU');
eq('trailing FNU mononym',  D.splitName('SUROSO FNU').mononym, true);
eq('leading FNU surname',   D.splitName('FNU SUROSO').surname, 'SUROSO');
eq('FNU among real names',  D.splitName('FNU Budi Santoso').surname, 'SANTOSO');
eq('FNU among real given',  D.splitName('FNU Budi Santoso').given, 'BUDI');
// Nothing but the placeholder: no name to recover, so leave it alone.
eq('FNU alone',             D.splitName('FNU').surname, 'FNU');

// -- yes/no ----------------------------------------------------------
eq('yn ya',    D.yn('Ya'), 'YES');
eq('yn tidak', D.yn('Tidak'), 'NO');
eq('yn blank', D.yn(''), '');

// -- a clean record --------------------------------------------------
const good = {
  'Name': 'Budi Santoso', 'Gender': 'Male', 'Marital Status': 'Single',
  'Date of Birth': '25/03/1995', 'Place of Birth': 'Denpasar', 'Nationality': 'Indonesia',
  'KTP Number': '5103 0212 3456 7890', 'Address': 'Jl. Raya Kuta 12, Badung',
  'Phone Number': '081234567890', 'Email Address': 'Budi@Example.com',
  'Passport Number': 'C1234567', 'Passport Issued Date': '2024-02-10',
  'Passport Expired Date': '2029-02-09', "Father's Name": 'Santoso',
  "Mother's Name": 'Wayan Sari', "Current Workplace's Name": 'PT Bahari',
  'Current Employment Position': 'Waiter', 'Appointment Date': '2026-10-01',
  'Cruise Line': 'Royal Caribbean',
};
const gr = D.toRecord(good);
const gv = D.validate(gr, { today: '2026-08-31' });
eq('good: no errors', gv.errors.length, 0);
eq('good: dob',       gr.dob, '25-MAR-1995');
eq('good: ktp',       gr.nationalId, '5103021234567890');
eq('good: email',     gr.email, 'budi@example.com');
has('good: name-split warning', gv.warnings, 'surname', 'guess');

// -- a broken record -------------------------------------------------
const bad = {
  'Name': 'Ahmad Fauzi 2', 'Gender': 'Male', 'Marital Status': 'Married',
  'Date of Birth': '05/03/1995', 'Place of Birth': 'Surabaya', 'Nationality': 'Indonesia',
  'KTP Number': '12345', 'Address': 'Jl. Melati 3', 'Phone Number': '12',
  'Email Address': 'not-an-email', 'Passport Number': 'X 12', 'Passport Issued Date': '2020-01-01',
  'Passport Expired Date': '2026-11-01', "Father's Name": 'Fauzi', "Mother's Name": '',
  "Current Workplace's Name": '', 'Current Employment Position': '',
  'Appointment Date': '2026-10-01', 'Were you previously employed?': 'Yes',
  'Previous Work Place Name': '', 'Cruise Line': '',
  'Has your U.S. Visa / passport ever been lost or stolen?': 'Ya',
  'Explain Details of Loss/Theft': '',
};
const br = D.toRecord(bad);
const bv = D.validate(br, { today: '2026-08-31' });
has('bad: passport 6-month', bv.errors, 'passportExpiry', '6-month');
has('bad: email',            bv.errors, 'email', 'not valid');
has('bad: mother missing',   bv.errors, 'motherName', 'empty');
has('bad: employer missing', bv.errors, 'employerName', 'empty');
has('bad: spouse missing',   bv.errors, 'spouseName', 'required');
has('bad: prev employer',    bv.errors, 'prevEmployerName', 'previously employed');
has('bad: lost details',     bv.errors, 'lostDetails', 'no explanation');
has('bad: ktp length',       bv.warnings, 'nationalId', '16 digits');
has('bad: phone',            bv.warnings, 'phone', 'Indonesian');
has('bad: ambiguous dob',    bv.warnings, 'dob', 'Ambiguous');
has('bad: mrz chars',        bv.warnings, 'fullName', 'MRZ');

// -- employer falls back to the cruise line ---------------------------
const fb = D.toRecord({ 'Name': 'Sukarno', 'Cruise Line': 'Carnival', "Current Workplace's Name": '' });
eq('employer fallback', fb.employerName, 'CARNIVAL');
none('employer fallback: no error', D.validate(fb, { today: '2026-08-31' }).errors.filter(e => e.field === 'employerName'), 'employerName');

// -- "Have you ever been in the U.S.?" comes from the arrival date ------
// It is not column O. A seafarer can hold a C1/D and never have entered.
const been = D.toRecord({ 'Name': 'Sukarno', 'When did you arrive in the US?': '12/06/2024' });
eq('been in US: date given',  been.beenInUs, 'YES');
eq('been in US: date kept',   been.lastUsArrival, '12-JUN-2024');

// The address stays one string - the user arranges City / State / Postal by
// hand. Column Z goes to Street Address untouched.
const oneAddr = D.toRecord({ 'Name': 'Sukarno',
  'Address': 'DUSUN 2 RT 14 RW 04 BANGLARANGAN AMPELGADING, PEMALANG' });
eq('address kept whole', oneAddr.homeAddress,
   'DUSUN 2 RT 14 RW 04 BANGLARANGAN AMPELGADING, PEMALANG');
eq('city not derived',   oneAddr.homeCity, '');
eq('state not derived',  oneAddr.homeState, '');
eq('postal not derived', oneAddr.homePostal, '');

// Ten-printing follows from having held a U.S. visa before.
eq('ten-printed with a prior visa',
   D.toRecord({ 'Name': 'Sukarno', 'Have you ever been issued U.S. Visa?': 'Yes' }).tenPrinted, 'YES');
eq('ten-printed without one',
   D.toRecord({ 'Name': 'Sukarno', 'Have you ever been issued U.S. Visa?': 'No' }).tenPrinted, 'NO');
eq('ten-printed when unanswered',
   D.toRecord({ 'Name': 'Sukarno' }).tenPrinted, 'NO');

// The refusal question is answered from column X, which asks about
// cancellation - one cell, two sworn answers, so a Yes is flagged.
const revoked = D.toRecord({ 'Name': 'Sukarno',
  'Has your U.S. Visa / passport ever been cancelled or revoked?': 'Yes',
  'Explain Cancellation/Revocation Details': 'Foil damaged' });
eq('refusal mirrors column X', revoked.visaRefused, 'YES');
has('refusal from the wrong question', D.validate(revoked, { today: '2026-08-31' }).warnings,
    'visaRefused', 'confirm he was actually');
none('no refusal warning when column X is No',
     D.validate(D.toRecord({ 'Name': 'Sukarno',
       'Has your U.S. Visa / passport ever been cancelled or revoked?': 'No' }),
       { today: '2026-08-31' }).warnings, 'visaRefused');

const notBeen = D.toRecord({ 'Name': 'Sukarno', 'Have you ever been issued U.S. Visa?': 'Yes' });
eq('been in US: no date',     notBeen.beenInUs, 'NO');
eq('been in US: visa is separate', notBeen.priorUsVisa, 'YES');
has('visa but never entered', D.validate(notBeen, { today: '2026-08-31' }).warnings,
    'lastUsArrival', 'never entered');

// -- Length of Stay comes from the intake form, not a constant ---------
// CEAC's period dropdown is a closed set, so loose answers must land on
// one of its options exactly or the select stays on -SELECT ONE-.
eq('unit months',   D.stayUnit('3 months'), 'MONTH(S)');
eq('unit already',  D.stayUnit('MONTH(S)'), 'MONTH(S)');
eq('unit days',     D.stayUnit('day'), 'DAY(S)');
eq('unit weeks id', D.stayUnit('2 minggu'), 'WEEK(S)');
eq('unit years',    D.stayUnit('1 tahun'), 'YEAR(S)');
eq('unit 24h',      D.stayUnit('less than 24 hours'), 'LESS THAN 24 HOURS');
eq('unit 24h id',   D.stayUnit('kurang dari 24 jam'), 'LESS THAN 24 HOURS');
eq('unit 24h short',D.stayUnit('<24 hrs'), 'LESS THAN 24 HOURS');
eq('unit junk',     D.stayUnit('a while'), '');
eq('unit empty',    D.stayUnit(''), '');

// The headers say what they mean: column Q is the CEAC period, column R is
// the number beside it.
const arrived = { 'Name': 'Sukarno', 'When did you arrive in the US?': '12/06/2024' };
const QR = (q, r) => D.toRecord(Object.assign({}, arrived,
  { 'Period Type of Stay in the US': q, 'How long did you stay in the US?': r }));

const m3 = QR('MONTH(S)', '3');
eq('period from Q', m3.prevStayUnit, 'MONTH(S)');
eq('count from R',  m3.prevStayLength, '3');
none('complete stay is quiet', D.validate(m3, { today: '2026-08-31' }).warnings, 'prevStayUnit');
eq('loose period from Q', QR('months', '3').prevStayUnit, 'MONTH(S)');

// CEAC greys the number box out for a same-day transit, so the count goes.
const transit = QR('LESS THAN 24 HOURS', '1');
eq('transit unit',     transit.prevStayUnit, 'LESS THAN 24 HOURS');
eq('transit no count', transit.prevStayLength, '');
none('transit is quiet', D.validate(transit, { today: '2026-08-31' }).warnings, 'prevStayUnit');
eq('transit in Indonesian', QR('kurang dari 24 jam', '').prevStayUnit, 'LESS THAN 24 HOURS');

// A period typed into R instead of Q would leave a required CEAC field
// blank, so it is named rather than silently used.
const inR = QR('', 'MONTH(S)');
eq('R is not the period source', inR.prevStayUnit, '');
has('period in the wrong column', D.validate(inR, { today: '2026-08-31' }).warnings,
    'prevStayUnit', 'column R instead');

has('unrecognised period', D.validate(QR('a while', '3'), { today: '2026-08-31' }).warnings,
    'prevStayUnit', 'does not match a CEAC option');
has('arrived but no stay', D.validate(D.toRecord(arrived), { today: '2026-08-31' }).warnings,
    'prevStayUnit', 'no length of stay');
has('period without number', D.validate(QR('MONTH(S)', ''), { today: '2026-08-31' }).warnings,
    'prevStayLength', 'needs both');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
