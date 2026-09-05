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
/* NAME (2), and the key says so. The J1 pack carries Name (1) as constants -
   CTI Indonesia - so the sheet's contact is the second of CEAC's two blocks. */
eq('and a second contact', j1.addPoc2Name, 'ARTANA, I WAYAN ARTA');
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
/* THE EDUCATION-LEVEL COLUMN MAKES THIS A C1/D ROW, and it has to be here or
   the record takes the J1 path - where the present-employer block is the
   COLLEGE and the workplace moves into the repeater above it. That branch is
   the user's arrangement of 2026-09-05; this block is the C1/D one, and the
   discriminator is the header's presence, exactly as `_asksEducationLevel`
   reads it. */
const present = D.toRecord({ 'Name': 'X',
  'Please select your highest level of education': 'High School / Vocational School',
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
/* THE "TOO SMALL FOR A WAGE" WARNING IS WITHDRAWN, with the derivation below.
   It was worth having while the amount was going to be typed onto a sworn
   form. The box is ticked on both classes now and no amount is filled at all,
   so it warned about a value that reaches nothing - the comma warning in
   another costume. Column AY is still read and still shown in the worksheet. */
none('no warning about an amount that reaches nothing', D.validate(D.toRecord({
  'Name': 'A, B', 'Monthly Salary': '2.00 IDR' })).warnings, 'monthlyIncome');
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
/* THE SALARY IS NO LONGER ONE OF THEM. The user's decision, 2026-09-05:
   "same like c1d, make salary konstan does not apply". It used to be derived -
   an amount in column AY set 'NO' and the number was typed - which followed
   the sheet but not how CTI files these. The filed J1 sample framed the
   participant as a STUDENT with DOES NOT APPLY against the salary, and that
   disagreement was recorded as needing the user's word rather than an
   inference.

   Both packs simply tick now, so the key is left alone here whatever column AY
   holds - and the pack-leak protection this derivation used to provide is not
   needed for it any more, because both classes give the same answer. */
const withPay = D.toRecord({ 'Name': 'A, B', 'Monthly Salary': '3600000.00 IDR' });
eq('an amount no longer blocks the tick', withPay.monthlyIncomeNA, undefined);
eq('and the amount is still read',        withPay.monthlyIncome, '3600000');
const noPay = D.toRecord({ 'Name': 'A, B', 'Monthly Salary': '0.00 IDR' });
eq('nor does an empty one', noPay.monthlyIncomeNA, undefined);
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


/* -- the programme number: the sheet drops CEAC's hyphens ------------
   Column CI writes it two ways - 30 rows as P-3-05133 and 18 as P305133. The
   compressed form maps onto the hyphenated one unambiguously: P, one category
   digit, five digits. */
const prog = v => D.toRecord({ 'Name': 'A, B', 'Program Number': v }).programNumber;
eq('hyphens restored',        prog('P305133'),   'P-3-05133');
eq('another one',             prog('P313279'),   'P-3-13279');
eq('already correct',         prog('P-3-05133'), 'P-3-05133');
/* PASSED THROUGH, NOT DROPPED. Seven rows hold things a pattern cannot repair.
   Returning '' would leave the box empty with the sheet's value nowhere in
   sight; filled and flagged lets the operator see the cell, and CEAC rejects a
   malformed number itself. */
eq('an unrepairable value survives', prog('PL52-449'), 'PL52-449');
eq('and keeps its own spacing',      prog('J 1 PROGRAM'), 'J 1 PROGRAM');
has('and is flagged', D.validate(D.toRecord({
  'Name': 'A, B', 'Program Number': 'PL52-449' })).warnings, 'programNumber', 'P-n-nnnnn');
none('a good one is not flagged', D.validate(D.toRecord({
  'Name': 'A, B', 'Program Number': 'P305133' })).warnings, 'programNumber');
/* One row holds the SEVIS id as a float; xlsx.js expands it, and what comes
   out is not an N-number, so it is filled and flagged rather than dropped. */
has('an odd SEVIS id is flagged', D.validate(D.toRecord({
  'Name': 'A, B', 'SEVIS ID': '37889931' })).warnings, 'sevisId', 'N plus ten digits');
none('a good one is not', D.validate(D.toRecord({
  'Name': 'A, B', 'SEVIS ID': 'N0037491619' })).warnings, 'sevisId');

/* -- a point of contact who is the applicant is not a contact --------
   Two of the 69 rows hold the applicant's own name in column CD. On the filed
   sample that row is exactly the one, and whoever filed it substituted the host
   school's contact instead of using the cell. */
has('the self-reference is named', D.validate(D.toRecord({
  'Name': 'I Ketut, Juliana',
  'Additional point of contact': 'I Ketut, Juliana' })).warnings, 'addPoc2Name', 'the applicant themselves');
none('a real contact is not', D.validate(D.toRecord({
  'Name': 'I Ketut, Juliana',
  'Additional point of contact': 'Arta, Artana' })).warnings, 'addPoc2Name');


/* -- the comma is the sheet's separator, not part of the name --------
   This warning counted it as a character in the name, and on the live export
   it fired on 516 of 832 rows - 62% - with the comma the ONLY offender in
   every single one. Not one row held a genuinely odd character. A warning
   that is wrong every time it appears is worse than none: it was 62% of the
   amber "N to check" count on the applicant list, and it teaches the operator
   that the amber count is noise.

   splitName() already treats the comma as a separator, and a name has no
   punctuation in it - the same reasoning that keeps the comma out of
   rec.nativeName. */
const mrz = n => D.validate(D.toRecord({ 'Name': n, 'Passport Number': 'X1' }))
                   .warnings.filter(x => x.field === 'fullName').length;
eq('the separator alone does not warn',  mrz('PUTU YUDA, PRATAMA'), 0);
eq('nor in a longer name',               mrz('I Komang Satria, Pranata'), 0);
eq('nor a mononym',                      mrz('Suroso'), 0);
/* AND IT STILL CATCHES WHAT IT IS FOR. A title and a digit are exactly the
   things that must not reach the MRZ boxes. */
eq('a title still warns',                mrz('MR. BUDI SANTOSO'), 1);
eq('a digit still warns',                mrz('BUDI 2 SANTOSO'), 1);
/* Hyphens and apostrophes are IN the MRZ, so they never warned and must not
   start now. */
eq('a hyphenated name is fine',          mrz("ANNE-MARIE O'BRIEN"), 0);


/* -- the two templates feed the education block differently ----------
   CEAC's education block is a REPEATER - Name of Institution, Address, Course
   of Study, Attendance From/To, then "Add Another".

   C1/D ASKS which one to fill: column BI, "Please select your highest level of
   education", picks between two candidate blocks. That is the user's rule and
   it stands.

   THE J1 TEMPLATE DOES NOT ASK. Checked against the template supplied on
   2026-09-04: it has no such column, and BI there is *Previous Workplace
   Country*. It carries THREE blocks - junior high, senior high/vocational,
   college/university - and the filed sample lists them ALL, chronologically:

     Name of Institution (1): SMP NEGERI 11 DENPASAR  Course: JUNIOR HIGH SCHOOL
     Name of Institution (2): SMK NEGERI 3 DENPASAR   Course: KULINER

   So on J1 the blocks are a list, not a choice. */
const j1edu = D.toRecord({
  'Name': 'Putu Yuda, Pratama',
  'Name of Junior High School': 'Smp Negeri 2 Seririt',
  'Year of Junior High School Entry': '15-Jul-2019',
  'Name of Senior High School/Vocational School': 'Smk Negeri 1 Seririt',
  'Course of Study in Senior High School/Vocational School': 'Perhotelan',
  'Name of College/University': 'Overseas Training Center',
});
eq('the J1 template does not ask for a level', j1edu._asksEducationLevel, false);
/* CHRONOLOGICAL, matching the order the filed application used. */
eq('so the first school is the earliest', j1edu.eduName, 'SMP NEGERI 2 SERIRIT');
eq('and the source says which block', j1edu._eduSource, 'junior high school');
/* THE COURSE OF STUDY IS TAKEN FROM THE FILED APPLICATION, not invented: the
   template has no course column for junior high, and "JUNIOR HIGH SCHOOL" is
   what was typed there. */
eq('the junior-high course comes from the filed convention',
   j1edu.eduCourse, 'JUNIOR HIGH SCHOOL');
/* THE REST ARE HANDED BACK, NOT FILLED. Each "Add Another" is a postback and
   the WAF has blocked this agent three times over bursts of them - the same
   arrangement languageSpoken and firstCountryVisited already use. */
eq('the one other is listed', j1edu._eduMore.length, 1);
/* THE MESSAGE IS AN INSTRUCTION WITH A PROMISE, not a chore. It used to say
   "add these by hand", which stopped being true when the filler learned to
   fill repeater rows: press Add Another, press Fill, done. Still a warning
   rather than silence, because a page showing one school out of three looks
   finished and Next is right there. */
has('and validate names them', D.validate(j1edu).notes, 'eduName', 'Add Another');
has('and promises the filler does it', D.validate(j1edu).notes, 'eduName', 'puts them in order');
none('it no longer says to type them by hand',
     D.validate(j1edu).notes.filter(w => /by hand/.test(w.msg)), 'eduName');
/* AND IT IS NOT AMBER. The user's objection: this is the arrangement we chose,
   it is true on every J1 row, and there is nothing to decide. */
none('nor is it a warning any more', D.validate(j1edu).warnings, 'eduName');

/* THE STRUCTURED LIST IS WHAT THE REPEATER READS, in order, one row each -
   and on J1 it is TWO schools, not three. The college is not on this page at
   all: it is the Present Employer or School, with the workplaces moved into
   the previous-employer repeater above it. The user's arrangement of
   2026-09-05, and the same STUDENT framing that ticked the salary box. */
eq('the list carries the two schools', j1edu._eduList.length, 2);
eq('in chronological order',
   j1edu._eduList.map(b => b.name).join(' | '),
   'SMP NEGERI 2 SERIRIT | SMK NEGERI 1 SERIRIT');
eq('each with its own course',
   j1edu._eduList.map(b => b.course).join(' | '),
   'JUNIOR HIGH SCHOOL | PERHOTELAN');
/* AND THE COLLEGE IS THE PRESENT SCHOOL. Both halves are asserted together
   because they are one move: taking the college out of the education list
   without putting it in the employer block would simply lose it. */
eq('the college fills Present Employer or School',
   j1edu.employerName, 'OVERSEAS TRAINING CENTER');
has('quoting the schools', D.validate(j1edu).notes, 'eduName', 'SMK NEGERI 1 SERIRIT');

/* THE C1/D PATH IS UNCHANGED: BI names one block, the others are not filled,
   and nothing is handed back. */
const c1dedu = D.toRecord({
  'Name': 'Budi, Santoso',
  'Please select your highest level of education': 'SMK',
  'Name of high school/vocational school': 'SMK NEGERI 3',
  'Name of College/University': 'UNIVERSITAS UDAYANA',
});
eq('the C1/D template does ask', c1dedu._asksEducationLevel, true);
eq('and BI picks the block', c1dedu.eduName, 'SMK NEGERI 3');
eq('the other block is not filled', c1dedu._eduMore.length, 0);
none('and nothing is handed back', D.validate(c1dedu).warnings, 'eduName');
/* ON C1/D THE LIST HOLDS EXACTLY ONE. Column BI names the block to fill and
   the user's rule is that the others are not filled - so pressing Add Another
   there leaves the new row alone, which is the honest answer: nothing in the
   sheet says to swear to a second institution. */
eq('C1/D has one entry only', c1dedu._eduList.length, 1);
eq('and it is the chosen block', c1dedu._eduList[0].name, 'SMK NEGERI 3');

/* BI PRESENT BUT UNREADABLE, with both candidates named, is still not ours to
   guess - and the message now names the HEADER. It said "column BI", which on
   a J1 row points at Previous Workplace Country: a message aimed at the wrong
   data is worse than a vague one. */
const ambig = D.toRecord({
  'Name': 'Budi, Santoso',
  'Please select your highest level of education': '',
  'Name of high school/vocational school': 'SMK NEGERI 3',
  'Name of College/University': 'UNIVERSITAS UDAYANA',
});
eq('nothing is chosen', ambig.eduName, '');
has('and it asks by hand', D.validate(ambig).warnings, 'eduName', 'choose the institution by hand');
has('naming the header', D.validate(ambig).warnings, 'eduName', 'highest level of education');
none('never a column letter, which differs between templates',
     D.validate(ambig).warnings.filter(w => /column BI/.test(w.msg)), 'eduName');

/* A J1 row with no school at all gets the plain answer, not a question about a
   column its template does not have. */
const noschool = D.toRecord({ 'Name': 'P, Y', 'Name of Junior High School': '' });
has('no school named is said plainly', D.validate(noschool).warnings, 'eduName',
    'secondary level or above');


/* -- notes: neither an error nor a doubt ----------------------------
   Errors block filing. Warnings are doubts a human must resolve before
   swearing to them. Some things are neither: they are how a page works, they
   are true on every single row, and nothing is wrong.

   Those were going in the amber list and inflating the "N to check" chip. Same
   failure as the comma warning fixed earlier today, in a milder form: a line
   that appears on 69 of 69 rows and never needs a decision teaches the
   operator that the amber count is noise. */
const withNote = D.toRecord({
  'Name': 'Putu Yuda, Pratama',
  'Name of Junior High School': 'Smp Negeri 2 Seririt',
  'Name of Senior High School/Vocational School': 'Smk Negeri 1 Seririt',
  'Name of College/University': 'OTC Bali Singaraja',
});
const vn = D.validate(withNote);
/* This file has eq()/has()/none() but no ok(). */
eq('validate returns notes', Array.isArray(vn.notes), true);
eq('the repeater arrangement is a note', vn.notes.filter(n => n.field === 'eduName').length, 1);
none('and not a warning any more', vn.warnings, 'eduName');
has('it still says what to press', vn.notes, 'eduName', 'Add Another');
has('and that the filler does the rest', vn.notes, 'eduName', 'puts them in order');

/* A NOTE MUST NOT CHANGE `ok`. That is what the amber chip and the "only rows
   with errors" filter are computed from, and a note is not a problem. */
const clean = D.toRecord({ 'Name': 'A, B' });
eq('notes do not affect ok', D.validate(withNote).ok, D.validate(withNote).errors.length === 0);

/* -- and the consumer side of the same contract ---------------------
   app.js is browser-only (an IIFE, no exports), so these are text assertions -
   the arrangement auth.test.js and extension-auth.test.js already use. They
   live here because a category is only worth having if its consumer honours
   it, and the two rot together. */
const fs2 = require('fs');
const path2 = require('path');
const appjs = fs2.readFileSync(path2.join(__dirname, '..', 'app.js'), 'utf8')
                 .split('\r\n').join('\n');
const ok2 = (label, cond) => eq(label, !!cond, true);

ok2('the amber chip counts warnings, not notes',
    /const e = p\.val\.errors\.length, w = p\.val\.warnings\.length;/.test(appjs) &&
    !/p\.val\.notes\.length/.test(appjs));
ok2('notes render in their own calm class', /class="issue n"/.test(appjs));
/* Last in the list, because they are the least urgent thing in it. */
ok2('and after the warnings',
    appjs.indexOf("list('Filled'") < 0 ||
    appjs.indexOf('class="issue w"') < appjs.indexOf('class="issue n"'));
/* NOT flagged in the table below: a note is not a doubt about the value in
   that row, and outlining it amber would say the opposite. */
ok2('a note does not amber-flag its own row',
    !/notes\.forEach\(n => \{ if \(!flagged/.test(appjs));
/* "Nothing to fix" still shows when only notes are present - that is the
   whole point of the category. */
ok2('notes are not counted as something to fix',
    /if \(!val\.errors\.length && !val\.warnings\.length\) h \+= '<div class="clear">/.test(appjs));

const css2 = fs2.readFileSync(path2.join(__dirname, '..', 'style.css'), 'utf8');
ok2('the note style is the quietest of the three',
    /\.issue\.n\{background:transparent;color:var\(--muted\)/.test(css2));


/* -- who is paying, in CEAC's own words -----------------------------
   Its dropdown is a closed set and column AA is plain English. A live Fill
   report is what found it, quoting the page back:

     payerRelationship - no matching option on this page
     wanted FATHER
     page offers: - SELECT ONE - | CHILD | PARENT | SPOUSE | OTHER RELATIVE | FRIEND | OTHER

   Not one value in the export is an option. Father 35, Mother 20, Uncle 6,
   Brother 4, Sister 2, Aunt 1, Cousin 1 - all 69 rows, every one leaving a
   required dropdown unset. */
const rel = v => D.toRecord({ 'Relationship to you': v }).payerRelationship;
eq('Father is a parent',  rel('Father'), 'PARENT');
eq('and Mother',          rel('Mother'), 'PARENT');
eq('Uncle is other',      rel('Uncle'), 'OTHER RELATIVE');
eq('Brother too',         rel('Brother'), 'OTHER RELATIVE');
eq('Sister',              rel('Sister'), 'OTHER RELATIVE');
eq('Aunt',                rel('Aunt'), 'OTHER RELATIVE');
eq('Cousin',              rel('Cousin'), 'OTHER RELATIVE');
/* The intake form is filled in by the applicant and nothing stops them
   writing Indonesian. */
eq('Ibu',                 rel('Ibu'), 'PARENT');
eq('Kakak',               rel('Kakak'), 'OTHER RELATIVE');
eq('Teman',               rel('Teman'), 'FRIEND');
eq('Suami',               rel('Suami'), 'SPOUSE');
/* C1/D's OWN CONSTANT MUST SURVIVE. Its payer is the cruise line and the
   relationship is EMPLOYER, which is not in the person branch's option list -
   so the mapping must not rewrite it. It never runs on a C1/D row (no column
   AA there), and passing it through is the belt to that brace. */
eq('EMPLOYER is left alone', rel('Employer'), 'EMPLOYER');
/* ANYTHING UNPLACED IS PASSED THROUGH, not blanked. On a closed dropdown an
   unmapped word fails either way - but it fails as "no matching option,
   wanted X, page offers ...", which is how this became visible. Returning ''
   would report "no value in record", which is not true. */
eq('an unknown word survives', rel('Godparent'), 'GODPARENT');
has('and validate names it', D.validate(D.toRecord({
  'Name': 'A, B', 'Relationship to you': 'Godparent' })).warnings,
  'payerRelationship', "not one of CEAC");
none('a mapped one is not flagged', D.validate(D.toRecord({
  'Name': 'A, B', 'Relationship to you': 'Father' })).warnings, 'payerRelationship');

/* -- the payer boxes take one set of keys ----------------------------
   CEAC shows one name box, one phone and one email whichever branch of "who is
   paying" was answered, so the matcher has one key each. C1/D fills them from
   constants - the payer is the cruise line - and J1's payer is a PERSON, in
   columns X, Y and Z.

   The live report caught the mismatch: `payerPhone - no value in record` on a
   row whose column Y holds a number, because normalize named it
   `payerPersonPhone` and the matcher looked for `payerPhone`. A value sitting
   in the sheet, landing nowhere, with the report naming a cause that was not
   true. */
const payer = D.toRecord({
  'Name': 'A, B',
  'Name of the person paying for your trip': 'I Made, Wijana',
  'Phone number of the person paying for your trip': '8.5935221510E10',
  'Email address of the person paying for your trip': 'cimut@gmail.com',
});
eq('the person fills the name box',  payer.payerCompany, 'I MADE, WIJANA');
eq('and the phone box',              payer.payerPhone, '85935221510');
eq('and the email box',              payer.payerEmail, 'cimut@gmail.com');
/* Only the positive case is asserted, so a sheet without those columns leaves
   the keys alone and each pack's own constants still fill them - no branch on
   `_class`, exactly as with the SSN. */
const noPayer = D.toRecord({ 'Name': 'A, B' });
eq('no column, no assertion', noPayer.payerCompany, undefined);
eq('nor the phone',           noPayer.payerPhone, undefined);
eq('nor the email',           noPayer.payerEmail, undefined);

/* -- the J1 travel page's fields are not collected ------------------
   Named so the report says "the intake form does not collect this" instead of
   the red re-send banner, which no re-send could ever clear. Reported only
   when EMPTY, so C1/D's five stay-address constants keep it quiet there. */
const gaps = D.MISSING_FROM_INTAKE.map(x => x[0]);
for (const k of ['arrivalCity', 'departureCity', 'arrivalFlight', 'departureFlight',
                 'travelLocation', 'stayAddr1', 'stayAddr2', 'stayCity', 'stayState', 'stayZip'])
  eq(k + ' is named as not collected', gaps.indexOf(k) >= 0, true);


/* -- column X is ONE name and CEAC wants TWO ------------------------
   The second live J1 Travel report showed both payer name boxes holding
   PRATAMA / PUTU YUDA - the applicant himself - while column X read
   `Ketut Purna Yasa`. The matcher side of that is guarded; this is the source
   side, which had no key for either box at all. */
const payerName = D.toRecord({
  'Name': 'Putu Yuda, Pratama',
  'Name of the person paying for your trip': 'Ketut Purna Yasa',
});
eq('the payer surname',      payerName.payerSurname, 'YASA');
eq('the payer given names',  payerName.payerGivenNames, 'KETUT PURNA');
/* THE APPLICANT'S OWN NAME IS UNTOUCHED BY IT - that is the whole bug. */
eq('the applicant keeps his surname', payerName.surname, 'PRATAMA');
eq('and his given names',            payerName.givenNames, 'PUTU YUDA');
/* Kept for the single-box COMPANY/ORGANIZATION branch. */
eq('the whole name is still available', payerName.payerCompany, 'KETUT PURNA YASA');
has('the split is named as a guess', D.validate(payerName).warnings,
    'payerSurname', 'split as a guess');

/* A mononym payer types the placeholder, because there is no "Do Not Know"
   checkbox beside this box - the relatives' arrangement does not apply. */
const payerMono = D.toRecord({ 'Name': 'A, B',
  'Name of the person paying for your trip': 'Suroso' });
eq('a single-named payer', payerMono.payerSurname, 'SUROSO');
eq('and its placeholder',  payerMono.payerGivenNames, 'FNU');
has('named too', D.validate(payerMono).warnings, 'payerSurname', 'single name');

/* NO COLUMN, NO ASSERTION - so C1/D's own payer constants still fill the box. */
const noPayerName = D.toRecord({ 'Name': 'A, B' });
eq('nothing is invented', noPayerName.payerSurname, undefined);
eq('nor a given name',    noPayerName.payerGivenNames, undefined);
none('and nothing is warned about', D.validate(noPayerName).warnings, 'payerSurname');


/* -- the host organisation's address answers two blocks --------------
   The user's rule, 2026-09-04: the stay address is ALWAYS the host company's,
   and the arrival and departure cities are the city it is in. On J1 the host
   organisation is also the U.S. point of contact, so one free-text cell feeds
   both - and it was reaching NEITHER, because the sheet names it
   `usPocAddress` while the matcher has `usPocAddr1`/`usPocAddr2` and
   `stayAddr1`..`stayZip`. Third time that exact shape has turned up, after
   `payerPersonPhone` and `payerPersonName`. */
const host = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': '6631 W BROAD ST, RICHMOND, VA 23230' });
eq('the stay street',   host.stayAddr1, '6631 W BROAD ST');
eq('the stay city',     host.stayCity, 'RICHMOND');
/* THE FULL STATE NAME, not the code. CEAC's State is a dropdown of full names
   and setSelect's prefix fallback would answer `MI` with MICHIGAN or
   MINNESOTA, whichever came first - guessing between two options on a visa
   form. */
eq('the stay state',    host.stayState, 'VIRGINIA');
eq('the stay ZIP',      host.stayZip, '23230');
eq('the contact street', host.usPocAddr1, '6631 W BROAD ST');
eq('the contact city',   host.usPocCity, 'RICHMOND');
eq('the contact state',  host.usPocState, 'VIRGINIA');
/* NOT arrivalCity / departureCity. Those are trip fields and `trip.apply()`
   never overwrites a value the record already holds, so writing them here
   would beat the operator's own entry for that applicant. trip.js reads
   `hostCity` as a fallback instead - asserted in trip.test.js. */
eq('the host city is published for trip.js', host.hostCity, 'RICHMOND');
none('and the note is not a warning', D.validate(host).warnings, 'stayCity');
has('the derivation says what it read', D.validate(host).notes,
    'stayCity', 'come from the host organisation');

/* THE REAL CELLS ARE NOT ONE SHAPE, and a live row is what proved it. The
   first version was a single regex demanding `, CITY, XX 12345`. It matched
   the DS-7002's spelling and refused the sheet's:

     7000 KALAHARI DR, SANDUSKY, OHIO, 44870

   - state spelled out IN FULL, ZIP behind its own comma. So the whole string
   went into Street Line 1, no city was ever produced, and the Arrival City and
   Departure City boxes stayed empty on a live page. The reader walks the comma
   parts backwards now. */
const kalahari = D.usPlace('7000 KALAHARI DR, SANDUSKY, OHIO, 44870');
eq('the live shape - street',  kalahari.street, '7000 KALAHARI DR');
eq('the live shape - city',    kalahari.city, 'SANDUSKY');
eq('the live shape - state',   kalahari.state, 'OHIO');
eq('the live shape - ZIP',     kalahari.zip, '44870');
/* And the DS-7002's spelling still reads - a code, and the ZIP behind a space
   rather than a comma. */
eq('a code and a space',
   D.usPlace('6631 W BROAD ST, RICHMOND, VA 23230').state, 'VIRGINIA');
/* A COMMA IN THE STREET SURVIVES, because only the tail is consumed. */
eq('a street with a comma',
   D.usPlace('SUITE 900, 1234 MAIN ST, RESTON, VIRGINIA, 20190').street,
   'SUITE 900, 1234 MAIN ST');
eq('and its ZIP+4', D.usPlace('1 A St, Reston, VA 20190-1234').zip, '20190');

/* HOW TIGHT THE GATE HAS TO BE DEPENDS ON HOW THE STATE IS WRITTEN.
   A full name is unambiguous and needs no ZIP. A two-letter code does, because
   `ID` is Idaho and also the code Indonesia is written with - IN/India,
   MO/Macao, MD/Moldova, MT/Malta and NE/Niger set the same trap, and a probe
   on the first version read `JL RAYA KUTA NO 12, KUTA, ID` as Kuta, IDAHO. */
eq('a full name needs no ZIP', D.usPlace('SANDUSKY, OHIO').state, 'OHIO');
eq('a bare code is refused',   D.usPlace('1 A St, Reston, VA'), null);
eq('so an Indonesian address is refused',
   D.usPlace('JL RAYA KUTA NO 12, KUTA, ID'), null);
eq('and a country name is not a state',
   D.usPlace('JL RAYA KUTA NO 12, KUTA, INDONESIA'), null);
eq('nor is a bare name', D.usPlace('The Westin Richmond'), null);
/* IDAHO STAYS IN THE TABLE - a host company can be in Sun Valley. What is
   refused is the bare code, not the state. */
eq('Idaho is still a state',
   D.usPlace('100 Main St, Sun Valley, ID 83353').state, 'IDAHO');

/* The whole derivation, from the live cell. */
const kal = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': '7000 KALAHARI DR, SANDUSKY, OHIO, 44870' });
eq('the stay street from the live cell', kal.stayAddr1, '7000 KALAHARI DR');
eq('the stay city',  kal.stayCity, 'SANDUSKY');
eq('the stay state', kal.stayState, 'OHIO');
eq('the stay ZIP',   kal.stayZip, '44870');
eq('and the city trip.js falls back to', kal.hostCity, 'SANDUSKY');

/* REFUSING IS THE SAFE DIRECTION - an empty box is a visible gap, a filled one
   is a sworn answer nobody rechecks - so the refusal is named, with the value
   quoted rather than a column letter. */
const badHost = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': 'The Westin Richmond' });
eq('the street still fills', badHost.stayAddr1, 'The Westin Richmond');
/* '' rather than undefined: toRecord seeds every key it knows, and
   DS160Const.apply() reads '' as unset - so C1/D's stay constants still
   fill the block. */
eq('but no city is invented', badHost.stayCity, '');
has('and it says so', D.validate(badHost).warnings, 'stayCity',
    'does not end in a US city, state and ZIP');
none('with no note claiming it read one', D.validate(badHost).notes, 'stayCity');

/* NO COLUMN, NO ASSERTION, so C1/D's five stay constants - the cruise line's
   address - still fill the block and the panel switch stays live. */
const noHost = D.toRecord({ 'Name': 'A, B' });
eq('nothing is invented', noHost.stayAddr1, '');
eq('nor the city',        noHost.stayCity, '');
none('and nothing is said', D.validate(noHost).warnings, 'stayCity');

/* CEAC'S TWO STREET BOXES TAKE 40 CHARACTERS EACH. addressHalf() in matcher.js
   reads that maxlength off the box, which is the right way round, but it
   spreads ONE key over two controls; these are two separate keys because C1/D
   supplies two distinct constant lines. Breaking on a space keeps a word
   whole - the alternative is the browser clipping the tail silently, which is
   how the employer address lost text before anyone noticed. */
eq('a short address needs no second line', D.twoLines('6631 W BROAD ST')[1], '');
const longAddr = D.twoLines('1234 SOME VERY LONG STREET NAME AVENUE SUITE 900 BUILDING C');
eq('line 1 fits the box', longAddr[0].length <= 40, true);
eq('and breaks on a space', longAddr[0], '1234 SOME VERY LONG STREET NAME AVENUE');
eq('the tail is kept',     longAddr[1], 'SUITE 900 BUILDING C');
const wrapped = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': '1234 SOME VERY LONG STREET NAME AVENUE SUITE 900 BUILDING C, RESTON, VA 20190' });
eq('a long host street wraps', wrapped.stayAddr2, 'SUITE 900 BUILDING C');
eq('on both blocks',           wrapped.usPocAddr2, 'SUITE 900 BUILDING C');


/* -- the U.S. contact is one cell and two boxes ---------------------
   `Point of contact` holds a person; CEAC has Surnames and Given Names. The
   sheet's cell was landing NOWHERE - the FOURTH time that shape has turned up,
   after `payerPersonPhone`, `payerPersonName` and `usPocAddress`, and the live
   report said `usPocSurname - no value in record` on a row whose cell is
   filled.

   Published under `hostPoc*` rather than written onto `usPocSurname`, because
   those are trip fields now: the DS-7002 names the supervisor too, and the
   operator has to be able to correct either. trip.js reads these LAST. */
const poc = D.toRecord({ 'Name': 'A, B', 'Point of contact': 'Hannah Berkey' });
eq('the contact surname',    poc.hostPocSurname, 'BERKEY');
eq('and the given names',    poc.hostPocGiven, 'HANNAH');
eq('written for trip.js, not straight onto the box',
   poc.usPocSurname, undefined);
has('the split is named as a guess', D.validate(poc).warnings,
    'usPocSurname', 'split as a guess');
/* NO COLUMN, NO ASSERTION - so C1/D's cruise-line constants still fill the
   boxes and the panel switch stays live. */
const noPoc = D.toRecord({ 'Name': 'A, B' });
eq('nothing is invented', noPoc.hostPocSurname, undefined);
none('and nothing is warned about', D.validate(noPoc).warnings, 'usPocSurname');


/* -- two lines the report was asking to be re-sent for ---------------
   Both are "no value in record" cases that no re-send could ever fix, which is
   the string popup.js reads as "stale record, send it again".

   THE SECOND STREET LINE. CEAC marks it *Optional* and `7000 Kalahari Dr` fits
   the first box with room to spare, so the second is empty ON PURPOSE - but
   only when the address was actually read. With no host address at all these
   are honestly missing, and MISSING_FROM_INTAKE says so instead. */
const oneLine = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': '7000 KALAHARI DR, SANDUSKY, OHIO, 44870' });
eq('a short street leaves both line 2s blank on purpose',
   oneLine._blankOnPurpose.filter(k => /Addr2$/.test(k)).sort().join(','),
   'stayAddr2,usPocAddr2');
const twoLine = D.toRecord({ 'Name': 'A, B',
  'Point of contact address': '1234 SOME VERY LONG STREET NAME AVENUE SUITE 900 BUILDING C, RESTON, VA 20190' });
eq('a long one fills line 2 instead', twoLine.usPocAddr2, 'SUITE 900 BUILDING C');
eq('and claims nothing is deliberate',
   twoLine._blankOnPurpose.filter(k => /Addr2$/.test(k)).length, 0);
eq('no address at all, nothing deliberate either',
   D.toRecord({ 'Name': 'A, B' })._blankOnPurpose.filter(k => /Addr2$/.test(k)).length, 0);

/* THE ORGANISATION NAME HAS NO COLUMN ANYWHERE. The four `Point of contact`
   columns name the person, the address, the phone and the email - not the
   organisation. It can only come from the DS-7002 or be typed once in Trip
   details, so the report must say that rather than ask for a re-send. */
eq('the organisation name is named as not collected',
   D.MISSING_FROM_INTAKE.map(x => x[0]).indexOf('usPocOrg') >= 0, true);


/* -- a box that must stay CLEAR is an answer, not an absence ---------
   A relative with one name gets Surnames plus a ticked "Do Not Know" beside
   Given Names. A relative with two names must have that box left clear - and
   `''` made the report say `fatherGivenNA - no value in record`, the string
   popup.js reads as "stale record, send it again". No re-send can change a
   name that has two words in it, so the banner would have nagged for ever.

   'NO' is the `ssnNA` device: it blocks any default and setCheckbox leaves the
   box unticked. */
const twoNames = D.toRecord({ 'Name': 'A, B',
  "Father's Name": 'Suroso Hadi', "Mother's Name": 'Ni Ketut Rangi' });
eq('a two-word father leaves the box clear', twoNames.fatherGivenNA, 'NO');
eq('and the mother the same',                twoNames.motherGivenNA, 'NO');
const oneName = D.toRecord({ 'Name': 'A, B', "Father's Name": 'Suroso' });
eq('a mononym still ticks it', oneName.fatherGivenNA, 'YES');
/* ONLY ASSERTED WHEN THERE IS A NAME. With no parent named nobody has decided
   anything, so the key is left alone. */
eq('no father named, no answer invented', D.toRecord({ 'Name': 'A, B' }).fatherGivenNA, undefined);


/* -- J1 PUTS THE COLLEGE ON THE PRESENT-EMPLOYER BLOCK ---------------
   The user's arrangement, 2026-09-05, and the same STUDENT framing that ticked
   the salary box an hour earlier:

     Present Employer or School   <- college / university
     Were you previously employed? YES
       row 1                      <- CURRENT workplace
       row 2 (Add Another)        <- PREVIOUS workplace
     Attended an institution?      YES
       row 1                      <- junior high school
       row 2 (Add Another)        <- senior high / vocational

   It is what the filed J1 sample did, which this repo recorded as one case
   rather than a rule because the two readings put different answers in the
   same boxes. The word is given, so it is the rule. */
const j1work = D.toRecord({ 'Name': 'A, B',
  "Current Workplace's Name": 'GRAND HYATT BALI',
  "Current Workplace's Address": 'JL RAYA NUSA DUA',
  "Current Workplace's Phone Number": '0361771234',
  'Current Employment Position': 'DAILY WORKER',
  'Start Date at Current Workplace': '01 Feb 2024',
  'Previous Work Place Name': 'HOTEL SANUR',
  'Previous Workplace Working Position': 'WAITER',
  'Previous Workplace Country': 'INDONESIA',
  'Name of College/University': 'OTC BALI SINGARAJA',
  'Address of College/University': 'JL OTC',
  'Year of College/University Entry': '28 Aug 2023' });
eq('the college is the present school',   j1work.employerName, 'OTC BALI SINGARAJA');
eq('with its own address',                j1work.employerAddress, 'JL OTC');
eq('and its entry year as the start',     j1work.employerStart, '28-AUG-2023');
/* THE WORKPLACE PHONE MUST NOT FOLLOW. Leaving it would put an employer's
   number against a school, which is a filled field and therefore invisible. */
eq('and no phone carried over from the job', j1work.employerPhone, '');
/* OLDEST FIRST, the same direction the education block walks: the operator
   presses Add Another and moves forwards in time. */
eq('two employer rows, previous first',
   j1work._prevEmplList.map(w => w.name).join(' | '), 'HOTEL SANUR | GRAND HYATT BALI');
eq('each with its own position',
   j1work._prevEmplList.map(w => w.jobTitle).join(' | '), 'WAITER | DAILY WORKER');
/* THE FLAT KEYS NEED NO WRITE-BACK NOW. Row 1 is the previous workplace on
   both classes, which is what those columns already hold - so the copy that
   used to force them became a no-op and was deleted. It had been overwriting
   `prevSupervisor` with the current row's empty one, which is a real name
   quietly lost. */
eq('the flat keys are row 1 already', j1work.prevEmployerName, 'HOTEL SANUR');
/* THE GATE IS YES BECAUSE ROW 1 IS A REAL JOB - the sheet's own "were you
   previously employed?" no longer decides it, since row 1 is the job held
   today. */
eq('and the gate is answered', j1work.prevEmployed, 'YES');

/* C1/D IS UNTOUCHED, and that is the half worth guarding: the present employer
   stays the job, and the repeater holds the one previous workplace it always
   did. The discriminator is the education-level header's presence. */
const c1dwork = D.toRecord({ 'Name': 'A, B',
  'Please select your highest level of education': 'SMK',
  "Current Workplace's Name": 'CARNIVAL UK',
  "Current Workplace's Phone Number": '02380655000',
  'Previous Work Place Name': 'PT SAMUDERA BAHARI',
  'Name of College/University': 'UDAYANA UNIVERSITY' });
eq('C1/D keeps the job in the present block', c1dwork.employerName, 'CARNIVAL UK');
eq('and its phone',                          c1dwork.employerPhone, '02380655000');
eq('and one previous row only',
   c1dwork._prevEmplList.map(w => w.name).join(' | '), 'PT SAMUDERA BAHARI');

/* -- THE ADDITIONAL POINT OF CONTACT LIST ----------------------------
   `finalise()` is the one list-builder that runs AFTER the constants pack,
   because row 1 is a constant and row 2 is the sheet's. constants.test.js
   drives it with a real pack; here the two constants are handed in directly,
   so what is under test is the wrapping and the two name boxes rather than
   the pack.

   ROW 1 IS NOT SPLIT AND ROW 2 IS. The filed print-out renders CTI's contact
   `OKTAVIANIA, DORKAS` - CEAC's own "Surnames, Given Names" - so splitting it
   would swear DORKAS as the surname; the sheet's column is given-first like
   every other name column, so splitName() is right there. */
const pocRec = D.finalise(Object.assign(
  D.toRecord({ 'Name': 'A, B',
               'Additional point of contact': 'Kadek, Widiada',
               'Additional point of contact address':
                 'JL RAYA PUPUTAN RENON NO 142 BLOK C, DENPASAR SELATAN, BALI' }),
  { addPoc1Surname: 'OKTAVIANIA', addPoc1Given: 'DORKAS',
    addPoc1Addr1: 'JL. HANG TUAH NO.14B, RENON' }));
eq('two rows, CTI first',
   pocRec._addPocList.map(r => r.surname + '/' + r.given).join(' | '),
   'OKTAVIANIA/DORKAS | WIDIADA/KADEK');
/* CEAC's street boxes cap at 40 characters and the browser clips the tail in
   silence, so a long address is wrapped across the two on a space. */
eq('a long address wraps onto line 2',
   pocRec._addPocList[1].addr1 + ' | ' + pocRec._addPocList[1].addr2,
   'JL RAYA PUPUTAN RENON NO 142 BLOK C, | DENPASAR SELATAN, BALI');
eq('a short one does not',
   pocRec._addPocList[0].addr1 + ' | ' + pocRec._addPocList[0].addr2,
   'JL. HANG TUAH NO.14B, RENON | ');
/* AND THE EMPTY LINE 2 IS NOT A GAP. CEAC marks it *Optional*; it is empty
   because the address fitted. Reported as "no value in record" it would raise
   the red re-send banner, and no re-send can lengthen an address. */
eq('so line 2 is left blank on purpose',
   pocRec._blankOnPurpose.includes('addPocAddr2'), true);
/* ROW 2 HAS FOUR COLUMNS, NOT EIGHT, so its city / state / postal / country
   are named in MISSING_FROM_INTAKE rather than nagged about. */
const missKeys = D.MISSING_FROM_INTAKE.map(m => m[0]);
eq('the four uncollected contact fields are named',
   ['addPocCity', 'addPocState', 'addPocPostal', 'addPocCountry']
     .filter(k => !missKeys.includes(k)).join(',') || 'all present', 'all present');
/* An empty CD cell gives one row and publishes no second one, so an
   `Add Another` pressed after it is left alone by beyondList(). */
eq('no sheet contact, one row',
   D.finalise(Object.assign(D.toRecord({ 'Name': 'A, B' }),
     { addPoc1Surname: 'OKTAVIANIA' }))._addPocList.length, 1);
/* NEITHER HALF PRESENT PUBLISHES NOTHING AT ALL - which is C1/D, where this
   page does not exist. */
eq('and no contacts at all, no list',
   D.finalise(D.toRecord({ 'Name': 'A, B' }))._addPocList, undefined);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
