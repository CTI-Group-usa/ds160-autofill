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
