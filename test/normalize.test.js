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
/* DIGITS ONLY, NO LEADING +. CEAC's own message is the rule: "must be 5-15
   digits, with no spaces or hyphens (-)". It refused +628195201137810 on a
   live page - fifteen digits, in range, rejected for the plus alone. */
eq('phone 08',   D.normPhone('0812-3456-7890'), '6281234567890');
eq('phone 62',   D.normPhone('62 812 3456 7890'), '6281234567890');
eq('phone bare', D.normPhone('81234567890'), '6281234567890');
eq('a + is dropped, not kept', D.normPhone('+62 812 3456 7890'), '6281234567890');
eq('no phone value ever starts with +',
   /^\+/.test(D.normPhone('+62 812 3456 7890')), false);

// -- Full Name in Native Alphabet ------------------------------------
/* A filed application shows the Latin full name here, not a ticked "Does Not
   Apply". It is built from the SPLIT, not the raw cell: some intake rows write
   the name with a comma - "I PUTU JULI, FRINDAYANA" - and passing that through
   put the comma on a live form. A name has no punctuation in it. */
eq('a comma in the intake name never reaches the form',
   D.toRecord({ 'Name': 'I PUTU JULI, FRINDAYANA' }).nativeName, 'I PUTU JULI FRINDAYANA');
eq('an ordinary name is unchanged',
   D.toRecord({ 'Name': 'Aldi Maulana Rizky' }).nativeName, 'ALDI MAULANA RIZKY');
eq('runs of whitespace collapse',
   D.toRecord({ 'Name': 'Yahdia  Syahrul   Dharmawan' }).nativeName,
   'YAHDIA SYAHRUL DHARMAWAN');
/* A mononym is the single name alone - never the FNU placeholder alongside it. */
eq('a mononym is the name by itself',
   D.toRecord({ 'Name': 'Sukarno' }).nativeName, 'SUKARNO');
eq('an already-processed FNU mononym too',
   D.toRecord({ 'Name': 'SUROSO FNU' }).nativeName, 'SUROSO');
eq('no native name ever holds punctuation',
   /[^A-Z' -]/.test(D.toRecord({ 'Name': 'I PUTU JULI, FRINDAYANA' }).nativeName), false);

// -- headers are matched loosely, and a key may have several spellings
/* The lookup used to be exact and case-sensitive, so `Start date at current
   workplace` and `Start Date at Current Workplace` were different columns as
   far as it was concerned - the same field, silently lost. Nobody edits a Zoho
   form thinking about capitals. */
const startedOn = h => { const r = { Name: 'X' }; r[h] = '28 Aug 2015'; return D.toRecord(r); };
eq('the C1/D spelling still works',
   startedOn('Start Date at Current Workplace').employerStart, '28-AUG-2015');
eq('the J1 casing works too',
   startedOn('Start date at current workplace').employerStart, '28-AUG-2015');
eq('and so does odd spacing', startedOn('START  DATE  AT  CURRENT  WORKPLACE').employerStart,
   '28-AUG-2015');

/* ALIASES MUST NOT CLOBBER. toRecord() used to assign in MAP order, so an
   alias the row does NOT have would overwrite a good value with ''. It now
   takes the first NON-EMPTY candidate per key, which is the only order-
   independent answer. */
eq('the C1/D wording fills jobTitle',
   D.toRecord({ Name: 'X', 'Current Employment Position': 'WAITER' }).jobTitle, 'WAITER');
eq('the J1 wording fills the same key',
   D.toRecord({ Name: 'X', 'Current employment job title': 'INTERN' }).jobTitle, 'INTERN');
eq('a J1 row is not blanked by the absent C1/D alias',
   D.toRecord({ Name: 'X', 'Current employment job title': 'INTERN',
                'Previous workplace working job title': 'WAITER' }).prevJobTitle, 'WAITER');
/* An empty cell must not win over a filled alias either, whichever order they
   appear in the row. */
eq('an empty alias loses to a filled one',
   D.toRecord({ Name: 'X', 'Current Employment Position': '',
                'Current employment job title': 'INTERN' }).jobTitle, 'INTERN');

// -- the J1-only fields ----------------------------------------------
const j1 = D.toRecord({ Name: 'I Ketut Juliana',
  'SEVIS ID': 'N0037491619', 'Program Number': 'P-3-05133',
  'National Identification Number (KTP)': '5102021411060001',
  'Name of the person paying for your trip': 'Wijana, I Made',
  'Phone number of the person paying for your trip': '0859-3522-1510',
  'Relationship to you': 'Parent',
  'Point of contact': 'Ingle, Mariah',
  'Additional point of contact': 'Artana, I Wayan Arta',
  'Provide a list of languages you speak': 'Indonesian, English' });
eq('SEVIS ID', j1.sevisId, 'N0037491619');
eq('Program Number', j1.programNumber, 'P-3-05133');
eq('national ID (KTP)', j1.nationalId, '5102021411060001');
eq('the payer is a person', j1.payerPersonName, 'WIJANA, I MADE');
/* Digits only, like every other phone - CEAC refuses punctuation. */
eq('the payer phone is digits only', j1.payerPersonPhone, '085935221510');
eq('relationship to the payer', j1.payerRelationship, 'PARENT');
eq('the US contact comes from the sheet on J1', j1.usPocName, 'INGLE, MARIAH');
eq('and a second contact', j1.addPocName, 'ARTANA, I WAYAN ARTA');
eq('languages are collected, not constant', j1.languages, 'INDONESIAN, ENGLISH');

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

// -- Present Employer or School comes from columns AU-AY ---------------
/* A conditional source keyed on column AZ was built and reverted the same
   day: AU holds whatever that seafarer's employer or school actually is, so
   there is nothing to branch on. CTI Indonesia appearing in this box for one
   applicant was that row's own AU value, not a mapping error - the agency
   block on the Crew Visa page is separate. */
const present = D.toRecord({ 'Name': 'X',
  "Current Workplace's Name": 'INSTITUTE TOURISM OF SAHID',
  "Current Workplace's Address": 'JL KEMIRI RAYA NO 22 PD CABE UDIK',
  "Current Workplace's Phone Number": '0217402329',
  'Start Date at Current Workplace': '28 Aug 2015',
  'Current Employment Position': 'Student',
  // These must NOT be consulted for this block any more.
  'Were you previously employed?': 'Yes',
  'Previous Work Place Name': 'PT SAMUDERA BAHARI',
  'Name of College/University': 'UDAYANA UNIVERSITY' });
eq('AU: employer or school name', present.employerName, 'INSTITUTE TOURISM OF SAHID');
eq('AV: address',                 present.employerAddress, 'JL KEMIRI RAYA NO 22 PD CABE UDIK');
/* Third-party numbers are left as the sheet has them. normPhone is
   Indonesia-specific, and an employer is not always Indonesian: Carnival UK's
   02380655000 came out as +622380655000, a number that does not exist. An
   Indonesian landline starts with 0 too (0361, 021), so a prefix cannot tell
   them apart, and CEAC takes the local format. */
eq('AW: phone as written',        present.employerPhone, '0217402329');
eq('a UK employer number is untouched',
   D.toRecord({ 'Name': 'X', "Current Workplace's Phone Number": '02380655000' })
     .employerPhone, '02380655000');
/* The + goes from third-party numbers too - CEAC refuses it in every phone
   box, not only the applicant's. The digits are otherwise left alone. */
eq('an international prefix loses its +',
   D.toRecord({ 'Name': 'X', 'Previous Workplace Phone Number': '+44 23 8065 5000' })
     .prevEmployerPhone, '442380655000');
// The applicant's own number is always Indonesian, so it is still normalised.
eq('the applicant own number is still normalised',
   D.toRecord({ 'Name': 'X', 'Phone Number': '081542474324' }).phone, '6281542474324');
/* CEAC refuses anything outside 5-15 digits when Next is pressed, so it is an
   error here rather than a warning. */
eq('a phone number over 15 digits is an error',
   D.validate(D.toRecord({ 'Name': 'X', 'Phone Number': '0812345678901234567' }))
    .errors.some(e => e.field === 'phone' && /accepts 5 to 15/.test(e.msg)), true);
eq('a plausible number raises no phone error',
   D.validate(D.toRecord({ 'Name': 'X', 'Phone Number': '081542474324' }))
    .errors.some(e => e.field === 'phone'), false);
eq('AX: start date',              present.employerStart, '28-AUG-2015');
eq('AY: position',                present.jobTitle, 'STUDENT');
eq('BA is not consulted here',
   present.employerName === 'PT SAMUDERA BAHARI' ? 'BRANCHED' : 'clear', 'clear');
eq('BO is not consulted here',
   present.employerName === 'UDAYANA UNIVERSITY' ? 'BRANCHED' : 'clear', 'clear');
none('a complete block is quiet',
     D.validate(present, { today: '2026-08-31' }).warnings, 'employerStart');

// CEAC requires both, so an empty AV or AX has to be visible.
const bare = D.toRecord({ 'Name': 'X', "Current Workplace's Name": 'SOMEWHERE' });
has('empty start date reported', D.validate(bare, { today: '2026-08-31' }).warnings,
    'employerStart', 'column AX');
has('empty address reported',    D.validate(bare, { today: '2026-08-31' }).warnings,
    'employerAddress', 'column AV');

/* The four education columns are headed "Year of ..." but hold full dates -
   the user confirmed there are no year-only values. All four are parsed, not
   passed through raw, because CEAC's attendance dates are split dropdowns. */
const edu = D.toRecord({ 'Name': 'X',
  'Year of High School/Vocational School Entry': '16 Jul 2012',
  'Year of High School High School Graduation': '22 Aug 2015',
  'Year of College/University Entry': '28 Aug 2015',
  'Year of High School/University Graduation': '06 Apr 2019' });
eq('hsFrom parsed',  edu.hsFrom, '16-JUL-2012');
eq('hsTo parsed',    edu.hsTo,   '22-AUG-2015');
eq('uniFrom parsed', edu.uniFrom, '28-AUG-2015');
eq('uniTo parsed',   edu.uniTo,   '06-APR-2019');
eq('uniFrom slash format',
   D.toRecord({ 'Name': 'X', 'Year of College/University Entry': '15/08/2019' }).uniFrom,
   '15-AUG-2019');
/* strictDate refuses a bare year in every one of them: feeding "2019" to the
   parser produced 01-JAN-2019, a day and month nobody stated, on a sworn
   form. Empty is the honest answer. */
eq('hsFrom year-only refused',
   D.toRecord({ 'Name': 'X', 'Year of High School/Vocational School Entry': '2012' }).hsFrom, '');
eq('uniFrom year-only refused',
   D.toRecord({ 'Name': 'X', 'Year of College/University Entry': '2019' }).uniFrom, '');
eq('uniTo year-only refused',
   D.toRecord({ 'Name': 'X', 'Year of High School/University Graduation': '2019' }).uniTo, '');
eq('empty cell stays empty',
   D.toRecord({ 'Name': 'X', 'Year of College/University Entry': '' }).uniFrom, '');

// -- column M: countries visited in the last five years -----------------
/* The user's rule: the literal "NONE" means No; anything else means Yes with
   the FIRST country filling the one visible row. An earlier pass answered Yes
   for any non-empty cell, which made "NONE" a Yes and then left the country
   list CEAC demands empty. */
const visited = v => D.toRecord({ 'Name': 'X',
  "Countries I've Been to in the Last 5 Years": v });
eq('M = NONE means No',      visited('NONE').countriesVisited, 'NO');
eq('M = none, any case',     visited('none').countriesVisited, 'NO');
eq('M = Nil',                visited('Nil').countriesVisited, 'NO');
eq('M empty',                visited('').countriesVisited, 'NO');
eq('NONE fills no country',  visited('NONE').firstCountryVisited, '');
eq('one country: Yes',       visited('Singapore').countriesVisited, 'YES');
eq('one country: filled',    visited('Singapore').firstCountryVisited, 'SINGAPORE');
// More than one: take the first, hand the rest back.
eq('comma list, first',      visited('Singapore, Malaysia, Hong Kong').firstCountryVisited, 'SINGAPORE');
eq('comma list, rest',       visited('Singapore, Malaysia, Hong Kong')._otherCountriesVisited,
   'Malaysia, Hong Kong');
eq('"and" separator',        visited('Singapore and Malaysia').firstCountryVisited, 'SINGAPORE');
eq('semicolon separator',    visited('SINGAPORE; THAILAND')._otherCountriesVisited, 'THAILAND');
has('the rest are handed back',
    D.validate(visited('Singapore, Malaysia'), { today: '2026-09-01' }).warnings,
    'countries5y', 'Add these by hand: Malaysia');
none('a single country is quiet',
     D.validate(visited('Singapore'), { today: '2026-09-01' }).warnings, 'countries5y');
none('NONE is quiet',
     D.validate(visited('NONE'), { today: '2026-09-01' }).warnings, 'countries5y');

// -- Previous Work / Education ------------------------------------------
/* Column AZ answers "Were you previously employed?" and gates the employer
   block (BA-BH). Column BI picks which of the TWO candidate education blocks
   fills CEAC's single Name-of-Institution set:
     High School / Vocational -> BJ-BN,  College / University -> BO-BS.
   The branching is NOT keyed on AZ - that mistake was made and corrected. */
const EDU = { 'Name': 'X',
  'Name of high school/vocational school': 'SMK PELAYARAN',
  'Address of high school/vocational school': 'JL LAUT 1, SEMARANG',
  'Course of Study in High School/Vocational School': 'NAUTIKA',
  'Year of High School/Vocational School Entry': '16 Jul 2012',
  'Year of High School High School Graduation': '22 Aug 2015',
  'Name of College/University': 'UDAYANA UNIVERSITY',
  'Address of College/University': 'JL KAMPUS, JIMBARAN',
  'Course of Study in College/University': 'TOURISM',
  'Year of College/University Entry': '28 Aug 2015',
  'Year of High School/University Graduation': '06 Apr 2019' };
const atLevel = lvl => D.toRecord(Object.assign({}, EDU,
  { 'Please select your highest level of education': lvl }));

const hs = atLevel('High School/Vocational School');
eq('BI high school: name',   hs.eduName, 'SMK PELAYARAN');
eq('BI high school: address', hs.eduAddress, 'JL LAUT 1, SEMARANG');
eq('BI high school: course', hs.eduCourse, 'NAUTIKA');
eq('BI high school: from',   hs.eduFrom, '16-JUL-2012');
eq('BI high school: to',     hs.eduTo, '22-AUG-2015');

const uni = atLevel('College/University');
eq('BI university: name',    uni.eduName, 'UDAYANA UNIVERSITY');
eq('BI university: course',  uni.eduCourse, 'TOURISM');
eq('BI university: from',    uni.eduFrom, '28-AUG-2015');
eq('BI university: to',      uni.eduTo, '06-APR-2019');
// Loose wording in BI still lands on the right block.
eq('BI "SMK"',         atLevel('SMK').eduName, 'SMK PELAYARAN');
eq('BI "Diploma III"', atLevel('Diploma III').eduName, 'UDAYANA UNIVERSITY');
eq('BI "Sarjana"',     atLevel('Sarjana (S1)').eduName, 'UDAYANA UNIVERSITY');

/* BI unreadable and BOTH blocks hold a name: choosing one is not ours to do. */
const ambiguous = atLevel('Kursus Singkat');
eq('BI unreadable, both filled: nothing chosen', ambiguous.eduName, '');
has('BI unreadable is reported', D.validate(ambiguous, { today: '2026-08-31' }).warnings,
    'eduName', 'choose the institution by hand');
// One block only: no ambiguity, so use it even when BI is unreadable.
eq('BI unreadable, only university',
   D.toRecord({ 'Name': 'X', 'Please select your highest level of education': '???',
                'Name of College/University': 'UDAYANA' }).eduName, 'UDAYANA');
eq('BI unreadable, only high school',
   D.toRecord({ 'Name': 'X', 'Please select your highest level of education': '???',
                'Name of high school/vocational school': 'SMK 1' }).eduName, 'SMK 1');

// AZ still only gates the employer block, and reaches column BH.
const prev = D.toRecord({ 'Name': 'X', 'Were you previously employed?': 'Yes',
  'Previous Work Place Name': 'PT SAMUDERA BAHARI',
  'Previous Workplace Country': 'Indonesia' });
eq('AZ answers the employed question', prev.prevEmployed, 'YES');
eq('BH: previous workplace country',   prev.prevCountry, 'INDONESIA');
eq('AZ does not steer the education block', atLevel('College/University').eduName,
   'UDAYANA UNIVERSITY');

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

/* COLUMN Q "IN DAYS" IS A SAME-DAY TRANSIT - the user's rule, 2026-09-02.
   "In Days" is the shortest period their intake form offers, and left as
   DAY(S) the page could not be completed: the dropdown was set, the number box
   beside it stayed blank, and the report only said `prevStayLength - no value
   in record` with nothing to fill it from. */
const inDays = QR('In Days', '');
eq('Q "In Days" with no count is LESS THAN 24 HOURS', inDays.prevStayUnit, 'LESS THAN 24 HOURS');
eq('and the count stays empty, which CEAC greys out anyway', inDays.prevStayLength, '');
/* AND THE REPORT MUST NOT CALL THAT A GAP. "no value in record" is the exact
   string popup.js reads as "this record is stale, send it again", and
   re-sending can never fill a box CEAC greys out - the banner would nag for
   ever. `_blankOnPurpose` routes it to "left blank on purpose" instead. */
eq('the empty count is declared deliberate',
   (inDays._blankOnPurpose || []).indexOf('prevStayLength') >= 0, true);
eq('a real length is not declared deliberate',
   (QR('In Months', '8')._blankOnPurpose || []).indexOf('prevStayLength') >= 0, false);
eq('lower case too', QR('in days', '').prevStayUnit, 'LESS THAN 24 HOURS');
eq('and without the "in"', QR('Days', '').prevStayUnit, 'LESS THAN 24 HOURS');
has('the interpretation is named, not silent',
    D.validate(inDays, { today: '2026-08-31' }).warnings, 'prevStayUnit',
    'filled as LESS THAN 24 HOURS');

/* But a STATED length is not rewritten. "In Days" plus a 5 is five days, and
   turning that into "less than 24 hours" would swear to something the sheet
   contradicts - so that branch keeps DAY(S), and says so. */
const fiveDays = QR('In Days', '5');
eq('a stated count keeps DAY(S)', fiveDays.prevStayUnit, 'DAY(S)');
eq('and keeps the number', fiveDays.prevStayLength, '5');
has('and the difference is named too',
    D.validate(fiveDays, { today: '2026-08-31' }).warnings, 'prevStayUnit',
    'not LESS THAN 24 HOURS');

/* The other periods are untouched by all of this. */
eq('months unaffected', QR('In Months', '8').prevStayUnit, 'MONTH(S)');
eq('weeks unaffected',  QR('In Weeks', '2').prevStayUnit, 'WEEK(S)');
eq('years unaffected',  QR('In Years', '1').prevStayUnit, 'YEAR(S)');

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


/* -- Excel serials below 1954 ---------------------------------------
   The serial floor was 20000, which is 1954-10-03, so EVERY earlier date
   fell through to `new Date(s)` and came back as a YEAR: a father born on
   serial 18628 was recorded as 01-JAN-18628. That then failed splitDate()
   on its five-digit year, so the extension reported "no value in record"
   while column AJ held the date all along - filled in the sheet, absent
   from the form, and nothing anywhere said so.

   The floor is about digit count, not magnitude: a bare year is four
   digits, and 10000 is where five begin (1927-05-18). */
eq('serial below the old floor', D.dateStr('18628'), '31-DEC-1950');
eq('serial at the new floor',    D.dateStr('10000'), '18-MAY-1927');
eq('serial above the old floor still works', D.dateStr('26838'), '23-JUN-1973');
/* A four-digit number is a year, not a serial - and a bare year is not a
   date. 01-JAN-1995 would be a day and month nobody stated on a sworn form,
   which is the reason strictDate exists for the "Year of ..." columns. */
eq('four digits is not a serial', D.dateStr('9999'), '');
eq('a bare year is not a date',   D.dateStr('1995'), '');
eq('above the upper bound',       D.dateStr('65000'), '');

/* -- a rejected cell is not an empty cell ---------------------------
   Both are '' by the time they are record fields, so toRecord keeps the
   difference and validate() quotes the cell. Without this the only trace of
   an unreadable date is an empty CEAC dropdown. */
const parentsOk = D.toRecord({
  'Name': 'Prayayi, Prama',
  "Father's Name": 'Machrip, Fnu',
  "Father's Date of Birth": '18628',
  "Mother's Date of Birth": '26838',
});
eq("father's serial DOB reaches the record", parentsOk.fatherDob, '31-DEC-1950');
eq("mother's too", parentsOk.motherDob, '23-JUN-1973');
eq('nothing unreadable in a good row', parentsOk._unreadable.length, 0);

const parentsBad = D.toRecord({
  'Name': 'Prayayi, Prama',
  "Father's Date of Birth": 'lupa',
});
eq('a refused date is recorded', parentsBad._unreadable.length, 1);
eq('with the key', parentsBad._unreadable[0].key, 'fatherDob');
eq('and the cell as written', parentsBad._unreadable[0].raw, 'lupa');
has('validate names it', D.validate(parentsBad).errors, 'fatherDob', 'could not be read as a date');
has('and quotes the cell', D.validate(parentsBad).errors, 'fatherDob', '"lupa"');

/* DATES ONLY. Every other transform has a legitimate reason to return ''
   for a non-empty cell, and validate() already reports those in their own
   words - stayUnit() on wording it cannot place is the clearest case.
   Listing them here would double up. */
const looseStay = D.toRecord({
  'Name': 'Prayayi, Prama',
  'Period Type of Stay in the US': 'sebentar saja',
});
eq('a non-date transform is not called unreadable',
   looseStay._unreadable.filter(u => u.key === 'stayUnit').length, 0);


/* -- monthly salary: a currency string becomes a number --------------
   Every one of the 69 rows in the J1 export reads "4200000.00 IDR", and
   CEAC's Monthly Income in Local Currency box takes digits - the currency is
   implied by the question. Separators are the trap: this export writes
   4200000.00 while Indonesian writes 4.200.000,00, and "." means opposite
   things in the two. A trailing one-or-two-digit group is a fraction and goes;
   three digits is a thousands group and stays. */
eq('currency suffix stripped',   D.toRecord({ 'Monthly Salary': '4200000.00 IDR' }).monthlyIncome, '4200000');
eq('indonesian separators',      D.toRecord({ 'Monthly Salary': '4.200.000,00' }).monthlyIncome, '4200000');
eq('anglo separators',           D.toRecord({ 'Monthly Salary': '4,200,000.00' }).monthlyIncome, '4200000');
eq('no fraction at all',         D.toRecord({ 'Monthly Salary': '35000000 IDR' }).monthlyIncome, '35000000');
eq('a currency prefix',          D.toRecord({ 'Monthly Salary': 'Rp 3.500.000' }).monthlyIncome, '3500000');
eq('words are not an amount',    D.toRecord({ 'Monthly Salary': 'n/a' }).monthlyIncome, '');
/* ZERO IS NOT AN AMOUNT. Fifteen of the 69 rows hold 0.00 IDR, which is the
   sheet saying there is no salary - the same answer as an empty cell. Passing
   '0' through would type a zero income onto a sworn form instead of ticking
   the box CEAC provides for exactly this. */
eq('zero is no salary',          D.toRecord({ 'Monthly Salary': '0.00 IDR' }).monthlyIncome, '');
has('a wage too small to be one', D.validate(D.toRecord({
  'Name': 'A, B', 'Monthly Salary': '2.00 IDR' })).warnings, 'monthlyIncome', 'too small for a monthly wage');
none('a real wage is not flagged', D.validate(D.toRecord({
  'Name': 'A, B', 'Monthly Salary': '3600000.00 IDR' })).warnings, 'monthlyIncome');

/* -- SSN / tax ID / salary are DERIVED, with no idea of the visa class
   The C1/D sheet has no columns for these three so every application ticks
   Does Not Apply; the J1 sheet collects all three. The answer follows from
   whether the cell holds an amount, which is the same question in both
   classes - so there is no branch on `_class`, and none is wanted.

   ONLY THE POSITIVE CASE IS ASSERTED. An empty cell leaves the key alone so
   each pack's constant still ticks it and the panel switch stays live; a value
   sets 'NO', because apply() treats '' as unset and would tick over it. */
const withPay = D.toRecord({ 'Name': 'A, B', 'Monthly Salary': '3600000.00 IDR' });
eq('a real salary blocks the tick', withPay.monthlyIncomeNA, 'NO');
const noPay = D.toRecord({ 'Name': 'A, B', 'Monthly Salary': '0.00 IDR' });
eq('no salary leaves the tick to the pack', noPay.monthlyIncomeNA, undefined);
const withIds = D.toRecord({
  'Name': 'A, B',
  'U.S. Social Security Number (if any)': '123456789',
  'U.S. Taxpayer ID Number (if any)': '99-1234567',
});
eq('an SSN blocks its tick',    withIds.ssnNA, 'NO');
eq('a tax ID blocks its tick',  withIds.taxIdNA, 'NO');
const noIds = D.toRecord({ 'Name': 'A, B' });
eq('no SSN column, no assertion',    noIds.ssnNA, undefined);
eq('no tax ID column, no assertion', noIds.taxIdNA, undefined);
/* No rule can fill the SSN boxes yet - CEAC splits it in three and no live J1
   Fill has named their ids. The gap is visible on the page (the tick is clear)
   and the worksheet says why, which beats guessing an id. */
has('an unfillable SSN is named', D.validate(withIds).warnings, 'ssn', 'not known yet');
has('and the tax ID too',        D.validate(withIds).warnings, 'taxId', 'not known yet');

/* -- a parent cannot be born after their child ----------------------
   One row in the J1 export gives the mother 2026-05-15 against an applicant
   born 2006-11-14. It parses cleanly, so nothing else catches it: it would go
   onto a sworn form and be read at the counter. */
const juliana = D.toRecord({
  'Name': 'I Ketut, Juliana', 'Date of Birth': '39035',
  "Father's Date of Birth": '25569', "Mother's Date of Birth": '46157',
});
eq('the applicant parses', juliana.dob, '14-NOV-2006');
eq('the mother parses too, which is the problem', juliana.motherDob, '15-MAY-2026');
has('the impossible parent is named', D.validate(juliana).warnings, 'motherDob', 'not before the applicant');
none('a plausible father is not', D.validate(juliana).warnings, 'fatherDob');


/* -- the CSV path needs the same guard as the xlsx path -------------
   The real fix is in xlsx.js -> expandExp(), at the reader. But the worksheet
   also takes CSV and pasted TSV, and Excel writes the same cell as
   "6.2895410887918E+13" there - note the '+', which xlsx does not write. A fix
   that covers only the route anyone tests is the worst kind. */
eq('xlsx form',  D.toRecord({ 'Name': 'A, B', 'Phone Number': '6.281215303279E12' }).phone,  '6281215303279');
eq('csv form',   D.toRecord({ 'Name': 'A, B', 'Phone Number': '6.281215303279E+12' }).phone, '6281215303279');
eq('and a plain cell still normalises to 62',
   D.toRecord({ 'Name': 'A, B', 'Phone Number': '081241811889' }).phone, '6281241811889');
/* The exponent used to become phone digits: 628121530327912, fifteen digits,
   which CEAC accepts on length and which is not anyone's number. */
none('no length error on an expanded number',
     D.validate(D.toRecord({ 'Name': 'A, B', 'Phone Number': '6.281215303279E12' })).errors, 'phone');
/* Third-party numbers take the same route through phoneAsWritten. */
eq("the employer's phone",
   D.toRecord({ 'Name': 'A, B', "Current Workplace's Phone Number": '3.612092288E9' }).employerPhone,
   '3612092288');
/* ID numbers are numbers too - 79 rows of the C1/D export hold the last visa
   number this way, and 11 hold the KTP. */
eq('the last visa number',
   D.toRecord({ 'Name': 'A, B', 'Last Visa Number': '2.008259981006E12' }).lastVisaNumber, '2008259981006');
eq('the KTP',
   D.toRecord({ 'Name': 'A, B', 'KTP Number': '5.1040355020001E13' }).nationalId, '51040355020001');
/* A DATE SERIAL MUST NOT GO THROUGH IT. deExp only fires on an exponent, so
   this is really an assertion that the two never meet. */
eq('a serial date is still a date',
   D.toRecord({ 'Name': 'A, B', 'Date of Birth': '39035' }).dob, '14-NOV-2006');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
