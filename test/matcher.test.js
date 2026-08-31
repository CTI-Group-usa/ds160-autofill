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
