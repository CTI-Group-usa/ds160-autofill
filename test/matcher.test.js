/* Matching is the risky half of the extension, so it is tested without
   a DOM: only pure {id,name,label} -> key resolution.
   Run: node test/matcher.test.js */
const M = require('../extension/matcher.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want)); }
}
const P = 'ctl00_SiteContentPlaceHolder_FormView1_';
const key = (id, label) => (M.matchKey({ id: P + id, name: '', label: label || '' }, {}) || {}).key || null;

// -- id-driven matches ----------------------------------------------
eq('surname',      key('tbxAPP_SURNAME'), 'surname');
eq('given names',  key('tbxAPP_GIVEN_NAME'), 'givenNames');
eq('gender',       key('ddlAPP_GENDER'), 'gender');
eq('dob day',      key('ddlDOBDay'), 'dob');
eq('dob year',     key('tbxDOBYear'), 'dob');
eq('passport no',  key('tbxPPT_NUM'), 'passportNumber');
eq('ppt expiry',   key('ddlPPT_EXPIREMonth'), 'passportExpiry');
eq('father given', key('tbxFATHER_GIVEN_NAME'), 'fatherName');
eq('spouse dob',   key('ddlSPOUSE_DOBDay'), 'spouseDob');
eq('email',        key('tbxAPP_EMAIL_ADDR'), 'email');
eq('job title',    key('tbxJobTitle'), 'jobTitle');

// -- label fallback when the id is unknown ---------------------------
eq('label marital', key('ddlSomethingNew', 'Marital Status'), 'maritalStatus');
eq('label lost',    key('rblUnknown', 'Have you ever lost or stolen a passport?'), 'visaLostStolen');
eq('label junk',    key('tbxWhatever', 'Totally unrelated caption'), null);

// -- safety ----------------------------------------------------------
eq('captcha blocked',  key('tbxCodeTextBox'), null);
eq('sec answer blocked', key('txtAnswer'), null);
eq('sign blocked',     key('btnSignAndSubmit'), null);
eq('appid blocked',    key('lblBarcode_ApplicationID'), null);
eq('forbidden flag',   M.isForbidden('ctl00_captchaImage'), true);

// -- a rule only applies to the kind of control it describes ---------
// Regression: on Personal 2 the "Are you a permanent resident of a
// country/region other than your country/region of origin (nationality)
// indicated above?" radio matched the nationality TEXT rule on wording,
// so the filler wrote "INDONESIA" into a Yes/No group and did nothing.
const PERM_Q = 'Q: Are you a permanent resident of a country/region other than your ' +
               'country/region of origin (nationality) indicated above? A: Yes No';
eq('permanent-resident radio',
   (M.matchKey({ id: 'ctl00_x_rblPermResOther_1', name: '', label: PERM_Q,
                 type: 'radio', tag: 'input' }, {}) || {}).key,
   'otherCountryPermRes');
eq('nationality select still matches',
   (M.matchKey({ id: P + 'ddlAPP_POB_CNTRY', name: '',
                 label: 'Country/Region of Origin (Nationality)', tag: 'select' }, {}) || {}).key,
   'nationality');
eq('text rule never claims a radio',
   M.matchKey({ id: 'ctl00_x_rbl', name: '', label: 'Marital Status',
                type: 'radio', tag: 'input' }, {}),
   null);
eq('yesno rule never claims a text box',
   M.matchKey({ id: P + 'tbxOTHER_NAMES_IND', name: '', label: 'Have you ever used other names?',
                type: 'text', tag: 'input' }, {}),
   null);
eq('checkbox rule never claims a text box',
   M.matchKey({ id: P + 'tbxAPP_SSN_NA', name: '', label: 'U.S. Social Security Number',
                type: 'text', tag: 'input' }, {}),
   null);

// The two Personal 2 boxes both read "Does Not Apply"; only the field
// name from the row above tells them apart.
eq('ssn does-not-apply',
   (M.matchKey({ id: P + 'cbexAPP_SSN_NA', name: '',
                 label: 'Does Not Apply U.S. Social Security Number',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, 'ssnNA');
eq('taxpayer does-not-apply',
   (M.matchKey({ id: P + 'cbexAPP_TAX_ID_NA', name: '',
                 label: 'Does Not Apply U.S. Taxpayer ID Number',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, 'taxIdNA');

// Length of stay is a number plus a unit dropdown sharing one label;
// only the control's tag tells them apart.
const LOS = 'Intended Length of Stay in U.S.';
eq('length of stay number',
   (M.matchKey({ id: P + 'tbxTRAVEL_LOS', name: '', label: LOS, type: 'text', tag: 'input' }, {}) || {}).key,
   'lengthOfStay');
eq('length of stay unit',
   (M.matchKey({ id: P + 'ddlTRAVEL_LOS_CD', name: '', label: LOS, tag: 'select' }, {}) || {}).key,
   'lengthOfStayUnit');

// -- Previous U.S. Travel is a different block asking the same things --
// Regression: one key answered both "Have you ever been in the U.S.?" and
// "Have you ever been issued a U.S. Visa?", and /LOS_CD/ claimed the
// previous-visit unit dropdown for the intended stay on this trip.
const PREV = 'dtlPREV_US_VISIT_ctl00_';
eq('been in the US radio',
   (M.matchKey({ id: P + 'rblPREV_US_TRAVEL_IND', name: '',
                 label: 'Have you ever been in the U.S.?',
                 type: 'radio', tag: 'input' }, {}) || {}).key, 'beenInUs');
eq('issued a US visa radio',
   (M.matchKey({ id: P + 'rblPREV_VISA_IND', name: '',
                 label: 'Have you ever been issued a U.S. Visa?',
                 type: 'radio', tag: 'input' }, {}) || {}).key, 'priorUsVisa');
eq('prev visit date arrived',
   (M.matchKey({ id: P + PREV + 'ddlPREV_US_VISIT_DTEDay', name: '',
                 label: 'Date Arrived', tag: 'select' }, {}) || {}).key, 'lastUsArrival');
eq('prev visit date part',
   M.matchKey({ id: P + PREV + 'tbxPREV_US_VISIT_DTEYear', name: '',
                label: 'Date Arrived', tag: 'input', type: 'text' }, {}).part, 'year');
eq('prev visit stay unit',
   (M.matchKey({ id: P + PREV + 'ddlPREV_US_VISIT_LOS_CD', name: '',
                 label: 'Length of Stay', tag: 'select' }, {}) || {}).key, 'prevStayUnit');
eq('prev visit stay number',
   (M.matchKey({ id: P + PREV + 'tbxPREV_US_VISIT_LOS', name: '',
                 label: 'Length of Stay', type: 'text', tag: 'input' }, {}) || {}).key, 'prevStayLength');
// The trip's intended stay must not leak into the previous-visit boxes.
eq('intended stay stays off the prev block',
   (M.matchKey({ id: P + PREV + 'ddlPREV_US_VISIT_LOS_CD', name: '',
                 label: LOS, tag: 'select' }, {}) || {}).key, 'prevStayUnit');
// ...and the Travel page must still resolve when the label is bare.
eq('travel page unit by id',
   (M.matchKey({ id: P + 'ddlUnknownLOSCD', name: '', label: LOS, tag: 'select' }, {}) || {}).key,
   'lengthOfStayUnit');

// -- "Street Address (Line 1)" appears in four different blocks -------
// Regression: the seafarer's Indonesian home address was written into
// "Address Where You Will Stay in the U.S." because the label alone is
// identical. Only the block heading separates them, and it may only
// restrict a match - never cause one.
const stayBlock = 'Address Where You Will Stay in the U.S. Street Address (Line 1) ' +
                  'Street Address (Line 2) Optional City State ZIP Code';
const homeBlock = 'Home Address Street Address (Line 1) City State Postal Zone';
const pocBlock  = 'U.S. Point of Contact Address Street Address (Line 1) City State';

const inBlock = (label, section, id) =>
  (M.matchKey({ id: P + (id || 'tbxUnknown'), name: '', label, section, type: 'text', tag: 'input' }, {}) || {}).key;

eq('stay line 1',  inBlock('Street Address (Line 1)', stayBlock), 'stayAddr1');
eq('stay line 2',  inBlock('Street Address (Line 2) Optional', stayBlock), 'stayAddr2');
eq('stay city',    inBlock('City', stayBlock), 'stayCity');
eq('stay zip',     inBlock('ZIP Code (if known)', stayBlock), 'stayZip');
eq('home line 1',  inBlock('Street Address (Line 1)', homeBlock), 'homeAddress');
eq('contact line 1', inBlock('Street Address (Line 1)', pocBlock), 'usPocAddr1');
eq('home address never lands in the stay block',
   inBlock('Street Address (Line 1)', stayBlock) === 'homeAddress', false);
eq('a city with no block is left alone', inBlock('City', ''), undefined);

// The paying-company block repeats City / State / Country/Region, which
// the U.S. contact block also uses. Six of these rules were id-only on
// guessed ids, so the whole block would have filled nothing in silence.
const payBlock = 'Person/Entity Paying for Your Trip Company/Organization Paying for the Trip ' +
                 'Telephone Number Relationship to You Street Address (Line 1) City State/Province ' +
                 'Postal Zone/ZIP Code Country/Region';
eq('payer company',   inBlock('Company/Organization Paying for the Trip', payBlock), 'payerCompany');
eq('payer telephone', inBlock('Telephone Number', payBlock), 'payerPhone');
eq('payer relation',  inBlock('Relationship to You', payBlock), 'payerRelationship');
eq('payer street',    inBlock('Street Address (Line 1)', payBlock), 'payerAddr1');
eq('payer city',      inBlock('City', payBlock), 'payerCity');
eq('payer state',     inBlock('State/Province', payBlock), 'payerState');
eq('payer zip',       inBlock('Postal Zone/ZIP Code', payBlock), 'payerZip');
eq('payer country',   inBlock('Country/Region', payBlock), 'payerCountry');
eq('a bare "City" outside any block stays unmatched', inBlock('City', ''), undefined);
eq('the contact block keeps its own city', inBlock('City', pocBlock), 'usPocCity');

// The real ids, read off a live page. Every guess before these missed,
// and the labels in this block come back empty, so the id is all there is.
const realPayer = (id) =>
  (M.matchKey({ id: P + id, name: '', label: '', section: payBlock,
                type: 'text', tag: id.indexOf('ddl') === 0 ? 'select' : 'input' }, {}) || {}).key;
eq('real payer phone',    realPayer('tbxPayerPhone'), 'payerPhone');
eq('real payer relation', realPayer('tbxCompanyRelation'), 'payerRelationship');
eq('real payer line 1',   realPayer('tbxPayerStreetAddress1'), 'payerAddr1');
eq('real payer line 2',   realPayer('tbxPayerStreetAddress2'), 'payerAddr2');
eq('real payer city',     realPayer('tbxPayerCity'), 'payerCity');
eq('real payer state',    realPayer('tbxPayerStateProvince'), 'payerState');
eq('real payer zip',      realPayer('tbxPayerPostalZIPCode'), 'payerZip');
eq('real payer country',  realPayer('ddlPayerCountry'), 'payerCountry');

// Its "Does Not Apply" boxes must stay unticked - we have real values -
// and are not a gap in understanding, so they are not reported as one.
eq('payer state DNA box claims nothing',
   M.matchKey({ id: P + 'cbxDNAPayerStateProvince', name: '',
                label: 'Does Not Apply', section: payBlock,
                type: 'checkbox', tag: 'input' }, {}), null);
eq('DNA box recognised as deliberate',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbxDNAPayerPostalZIPCode', label: 'Does Not Apply' }), true);
eq('an ordinary checkbox is not one',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbexAPP_SSN_NA', label: 'Social Security' }), false);

console.log('  (block pinning covered)');

// -- overrides beat everything --------------------------------------
eq('override wins',
  (M.matchKey({ id: 'weird_control_7', name: '', label: '' }, { weird_control_7: 'vesselName' }) || {}).key,
  'vesselName');

// -- date splitting ---------------------------------------------------
eq('date part day',   M.datePart('ddlDOBDay'), 'day');
eq('date part month', M.datePart('ddlPPT_EXPIREMonth'), 'month');
eq('date part year',  M.datePart('tbxDOBYear'), 'year');
eq('date part none',  M.datePart('tbxAPP_SURNAME'), null);
eq('split day',   M.splitDate('25-MAR-1995').day, '25');
eq('split month', M.splitDate('25-MAR-1995').month, 'MAR');
eq('split year',  M.splitDate('25-MAR-1995').year, '1995');
eq('split bad',   M.splitDate('1995-03-25'), null);

// -- one full name into two CEAC boxes -------------------------------
eq('half surname',  M.nameHalf('tbxFATHER_SURNAME', 'WAYAN SARI DEWI'), 'DEWI');
eq('half given',    M.nameHalf('tbxFATHER_GIVEN_NAME', 'WAYAN SARI DEWI'), 'WAYAN SARI');
eq('half mononym surname', M.nameHalf('tbxMOTHER_SURNAME', 'SUKARNI'), 'SUKARNI');
eq('half mononym given',   M.nameHalf('tbxMOTHER_GIVEN_NAME', 'SUKARNI'), 'FNU');
eq('half passthrough',     M.nameHalf('tbxJobTitle', 'WAITER'), 'WAITER');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
