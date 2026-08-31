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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
