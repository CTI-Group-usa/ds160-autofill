/* Supporting-letter parsing, against the real extracted text.
   Run: node test/letter.test.js */
global.DS160 = require('../normalize.js');
const L = require('../letter.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + g + '\n  want ' + w); }
}

/* Verbatim from SL-DANIEL SELI TODINGAN.pdf. Note there are no line
   breaks: labels and values run straight into each other, which is what
   the parser has to cope with. */
const LETTER =
  '31st August 2026Our Reference: C1/D VTO WHOM IT MAY CONCERN – US EMBASSY / CONSULATE' +
  "Non-Immigrant Multiple Entry C1/D Seafarer’s VisaWe kindly ask you to issue a seafarer’s " +
  'C1/D multiple entry visa to the bearer of this document, asfollows:' +
  'Name DANIEL SELI TODINGAN' +
  'Date of Birth 9/16/1987' +
  'Nationality Indonesian' +
  'Passport No X5117416' +
  'Working in the Capacity of Demi Chef De Partie' +
  'Joining Cruise Ship Queen Elizabeth' +
  'Ship Identification Number 9477438' +
  'Date of Joining Ship 17th December 2026' +
  'US Port of Joining Miami' +
  'I can confirm that all cost associated with this seafarer’s travel to the ship will be covered by this' +
  'Company.I thank you for your assistance.Sharin MendoncaAssistant Manager';

const p = L.parse(LETTER);

eq('every label found', p.missing, []);
eq('parse ok', p.ok, true);

eq('name',        p.fields.letterName, 'DANIEL SELI TODINGAN');
eq('dob US order', p.fields.letterDob, '16-SEP-1987');   // 9/16/1987, not 9 Sept
eq('nationality', p.fields.letterNationality, 'INDONESIAN');
eq('passport',    p.fields.letterPassport, 'X5117416');
eq('capacity',    p.fields.jobTitleAboard, 'DEMI CHEF DE PARTIE');
eq('vessel',      p.fields.vesselName, 'QUEEN ELIZABETH');
eq('imo digits',  p.fields.vesselImo, '9477438');
eq('join date ordinal', p.fields.arrivalDate, '17-DEC-2026');
eq('port, body text stripped', p.fields.arrivalCity, 'MIAMI');

// -- only the real answers are handed on ------------------------------
eq('answers', L.answers(p), {
  vesselName: 'QUEEN ELIZABETH',
  vesselImo: '9477438',
  arrivalDate: '17-DEC-2026',
  arrivalCity: 'MIAMI',
  jobTitleAboard: 'DEMI CHEF DE PARTIE',
});

// -- cross-check against the intake row -------------------------------
const same = { fullName: 'DANIEL SELI TODINGAN', passportNumber: 'X5117416', dob: '16-SEP-1987' };
eq('matching row is clean', L.crossCheck(p, same), []);

const wrongPassport = Object.assign({}, same, { passportNumber: 'X5117999' });
eq('passport mismatch caught', L.crossCheck(p, wrongPassport).map(i => i.field), ['passportNumber']);

const wrongDob = Object.assign({}, same, { dob: '09-JUN-1987' });
eq('dob mismatch caught', L.crossCheck(p, wrongDob).map(i => i.field), ['dob']);

const wrongName = Object.assign({}, same, { fullName: 'DANIEL SELI TODINGA' });
eq('name mismatch caught', L.crossCheck(p, wrongName).map(i => i.field), ['fullName']);

// Punctuation and spacing differences are not mismatches.
eq('punctuation ignored',
   L.crossCheck(p, { fullName: 'Daniel  Seli-Todingan', passportNumber: 'x5117416', dob: '16-SEP-1987' }), []);

// A row with nothing to compare against raises nothing.
eq('empty row is not a mismatch', L.crossCheck(p, {}), []);

// -- a letter missing a field still yields the rest -------------------
const short = L.parse('Name BUDI SANTOSOPassport No C1234567Joining Cruise Ship OasisUS Port of Joining Tampa');
eq('partial: vessel', short.fields.vesselName, 'OASIS');
eq('partial: port',   short.fields.arrivalCity, 'TAMPA');
eq('partial: flagged', short.ok, false);
eq('partial: names what is missing',
   short.missing, ['Date of Birth', 'Nationality', 'Working in the Capacity of',
                   'Ship Identification Number', 'Date of Joining Ship']);

// -- garbage in, nothing out ------------------------------------------
const junk = L.parse('This is not a supporting letter at all.');
eq('junk finds nothing', junk.found, 0);
eq('junk yields no answers', L.answers(junk), {});

// -- the date fixes this letter forced --------------------------------
eq('ordinal date',     DS160.dateStr('17th December 2026'), '17-DEC-2026');
eq('month-first when day > 12', DS160.dateStr('9/16/1987'), '16-SEP-1987');
eq('day-first still default',   DS160.dateStr('05/03/1995'), '05-MAR-1995');
eq('day > 12 stays day-first',  DS160.dateStr('25/03/1995'), '25-MAR-1995');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
