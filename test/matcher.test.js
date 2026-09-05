/* Matching is the risky half of the extension, so it is tested without
   a DOM: only pure {id,name,label} -> key resolution.
   Run: node test/matcher.test.js */
const M = require('../extension/matcher.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) pass++;
  else { fail++; console.log('FAIL ' + label + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want)); }
}
/* A word-boundary escape in a rule was once written as a literal backspace
   byte (0x08) instead of the two characters backslash-b. The regex then
   matched nothing, silently: ssnNA and taxIdNA stopped matching by id and
   survived only on their label fallback for weeks. Control characters have
   no business in this file, so fail loudly on any of them. */
const src = require('fs').readFileSync(__dirname + '/../extension/matcher.js', 'latin1');
const ctrl = [];
for (let i = 0; i < src.length; i++) {
  const c = src.charCodeAt(i);
  if (c < 32 && c !== 9 && c !== 10 && c !== 13) ctrl.push(c);
}
eq('matcher.js holds no control characters', ctrl.join(',') || 'none', 'none');

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
// CEAC is inconsistent about the _DTE infix: the visit block is
// PREV_US_VISIT_DTEDay, the visa date PREV_VISA_ISSUED_DTEDay. The live
// page reported all three parts of the second as unrecognised.
eq('visa issued _DTE day',   key('ddlPREV_VISA_ISSUED_DTEDay'), 'lastVisaIssued');
eq('visa issued _DTE month', key('ddlPREV_VISA_ISSUED_DTEMonth'), 'lastVisaIssued');
eq('visa issued _DTE year',  key('tbxPREV_VISA_ISSUED_DTEYear'), 'lastVisaIssued');
eq('visa issued no infix',   key('ddlPREV_VISA_ISSUEDDay'), 'lastVisaIssued');
eq('visa issued year part',
   M.matchKey({ id: P + 'tbxPREV_VISA_ISSUED_DTEYear', name: '', label: '' }, {}).part, 'year');

// "Do Not Know" beside the visa number is the same thing as "Does Not
// Apply": left unticked on purpose, so not a gap in the rules.
eq('do-not-know is not a gap',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbxPREV_VISA_FOIL_NUMBER_NA',
                      label: 'Do Not Know Visa Number Do Not Know' }), true);
eq('a real checkbox still counts',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbxSomething', label: 'I agree' }), false);
// Not on the _NA suffix: SSN and Tax ID end that way and we tick those.
eq('_NA suffix alone is not enough',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbexAPP_TAX_ID_NA', label: 'Taxpayer ID' }), false);
eq('tooltip language forbidden', M.isForbidden('ctl00_ddlLanguage'), true);

// -- the rest of Previous U.S. Travel ---------------------------------
const radio = (id, label) =>
  (M.matchKey({ id: P + id, name: '', label, type: 'radio', tag: 'input' }, {}) || {}).key;
eq('same country + residence',
   radio('rblPREV_VISA_SAME_CNTRY_IND',
     'Are you applying in the same country or location where the visa above was issued, ' +
     'and is this country or location your place of principal of residence?'),
   'sameCountryResidence');
eq('same country by label alone',
   radio('rblUnknownSameCountry',
     'Are you applying in the same country or location where the visa above was issued?'),
   'sameCountryResidence');
eq('ten-printed', radio('rblPREV_VISA_TEN_PRINT_IND', 'Have you been ten-printed?'), 'tenPrinted');
eq('ten-printed by label', radio('rblUnknownTenPrint', 'Have you been ten printed?'), 'tenPrinted');
const REFUSED = 'Have you ever been refused a U.S. Visa, or been refused admission to the ' +
                'United States, or withdrawn your application for admission at the port of entry?';
eq('visa refused', radio('rblPREV_VISA_REFUSED_IND', REFUSED), 'visaRefused');
eq('visa refused by label', radio('rblUnknownRefused', REFUSED), 'visaRefused');
eq('immigrant petition',
   radio('rblIV_PETITION_IND',
     'Has anyone ever filed an immigrant petition on your behalf with the United States ' +
     'Citizenship and Immigration Services?'),
   'immigrantPetition');
// Refusal and cancellation are separate questions on the same page.
eq('cancellation is still its own',
   radio('rblPREV_VISA_CANCELLED_IND', 'Has your U.S. Visa ever been cancelled or revoked?'),
   'visaRevoked');
// "Have you ever been..." opens three questions here; only one is beenInUs.
eq('refused is not beenInUs', radio('rblUnknownX', REFUSED), 'visaRefused');

// CEAC abbreviates LICENSE to LIC, and renders a typographic apostrophe.
// The live page left this blank with a required-field marker.
const DL = 'Do you or did you ever hold a U.S. Driver’s License?';
eq('driver licence abbreviated id', radio('rblPREV_US_DRIVER_LIC_IND', DL), 'usDriverLicense');
eq('driver licence spelled-out id', radio('rblUS_DRIVER_LICENSE_IND', DL), 'usDriverLicense');
eq('driver licence by curly-apostrophe label', radio('rblUnknownDL', DL), 'usDriverLicense');
eq('driver licence by ascii-apostrophe label',
   radio('rblUnknownDL2', "Do you or did you ever hold a U.S. Driver's License?"), 'usDriverLicense');

// -- four blocks, one bare "Country/Region" label ---------------------
/* Home address, passport issue, manning agency and present employer all show
   a dropdown labelled exactly "Country/Region". Every rule is pinned to its
   own block, and a bare one outside any block must stay unclaimed. */
const cr = (section, id) =>
  (M.matchKey({ id: P + (id || 'ddlUnknown'), name: '', label: 'Country/Region',
                section, tag: 'select' }, {}) || {}).key;
const empBlk = 'Present Employer or School Name Present employer or school address: ' +
               'Street Address City State/Province Postal Zone/ZIP Code Phone Number Country/Region';
eq('employer country by id',    cr(empBlk, 'ddlEmpSchCountry'), 'employerCountry');
eq('employer country by label', cr(empBlk), 'employerCountry');
eq('home country',    cr('Home Address Street Address City State/Province', 'ddlAPP_ADDR_CNTRY'),
   'homeCountry');
eq('passport issue country',
   cr('Where was the Passport/Travel Document Issued? City State/Province Country/Region',
      'ddlPPT_ISSUED_IN_CNTRY'), 'passportIssuedInCountry');
eq('agency country',
   cr('recruiting/manning/crewing agency Agency Name City State/Province Country/Region'),
   'agencyCountry');
/* A fifth block with the same bare label. The SCHOOL is always in Indonesia,
   unlike the employer, so this one is a constant and employerCountry is not. */
const eduBlk = 'Provide the following information on the educational institution(s) you ' +
               'have attended. Name of Institution Street Address City State/Province ' +
               'Postal Zone Country/Region Course of Study Date of Attendance From';
const eduHead = 'Provide the following information on the educational institution(s) you have attended.';
eq('education country by id',    cr(eduBlk, 'ddlSchoolCountry'), 'eduCountry');
eq('education country by label',  cr(eduBlk), 'eduCountry');
/* employerCountry's guard includes "school", for "Present employer or school
   address" - so it needs an explicit `not` to stay out of this block. */
eq('employer country never reaches the education block',
   cr(eduBlk, 'ddlEmpSchCountry'), 'eduCountry');
eq('and still claims its own block', cr(empBlk, 'ddlEmpSchCountry'), 'employerCountry');
eq('no block, no claim', cr(''), undefined);
/* The live failure, twice over. `must` is tested against id + name + label +
   section TOGETHER, so "school" in employerCountry's guard was satisfied by
   the education block's own id, ddlSchoolCountry - and that rule has no
   constant behind it, so the box was claimed and left blank. Its guard is
   `/employer/i` alone now.
   And `must` gates a rule's id path as well as its label path, so an empty
   section disabled the School* id match too. eduCountry is two rules: ids
   with no guard, label with one. */
eq('School id with an EMPTY section', cr('', 'ddlSchoolCountry'), 'eduCountry');
eq('School id with the heading only', cr(eduHead, 'ddlSchoolCountry'), 'eduCountry');
eq('education heading, unknown id',   cr(eduHead, 'ddlUnknown'), 'eduCountry');
eq('the employer rule still needs its own block',
   cr(eduHead, 'ddlEmpSchCountry') === 'employerCountry' ? 'LEAKED' : 'clear', 'clear');

/* Column AW was landing nowhere: the live label is a bare "Phone Number" and
   the rule wanted "telephone number ... employer". A bare "Phone Number" also
   labels the U.S. contact box, so the rule is pinned to its block. */
const pocBlk2 = 'U.S. Point of Contact Address Relationship to You Street Address ' +
                'City State Phone Number Email Address';
const ph = (id, label, section) =>
  (M.matchKey({ id: P + id, name: '', label, section, type: 'text',
                tag: 'input' }, {}) || {}).key;
eq('employer phone by id',    ph('tbxWorkEducTel', 'Phone Number', empBlk), 'employerPhone');
eq('employer phone by label', ph('tbxUnknown', 'Phone Number', empBlk), 'employerPhone');
eq('the U.S. contact phone is still its own',
   ph('tbxUS_POC_HOME_TEL', 'Phone Number', pocBlk2), 'usPocPhone');
eq('a bare Phone Number outside any block stays unclaimed',
   ph('tbxUnknown', 'Phone Number', ''), undefined);
eq('the primary phone is untouched',
   ph('tbxAPP_HOME_TEL', 'Primary Phone Number', 'Phone Primary Phone Number'), 'phone');

/* Monthly Income is left empty and its "Does Not Apply" ticked - no salary
   column in the sheet, and CEAC only asks "if employed". Three other
   Does-Not-Apply boxes sit on this same page, and State and Postal hold real
   values, so ticking the wrong one would wipe an address. */
const dna2 = (id, label, section) =>
  (M.matchKey({ id: P + id, name: '', label, section, type: 'checkbox',
                tag: 'input' }, {}) || {}).key;
eq('monthly income Does Not Apply',
   dna2('cbexCURR_MONTHLY_SALARY_NA',
        'Does Not Apply Monthly Income in Local Currency (if employed)'), 'monthlyIncomeNA');
eq('the income box itself still matches',
   (M.matchKey({ id: P + 'tbxCURR_MONTHLY_SALARY', name: '',
                 label: 'Monthly Income in Local Currency (if employed)',
                 type: 'text', tag: 'input' }, {}) || {}).key, 'monthlyIncome');
eq('income text rule stays off the _NA id',
   (M.matchKey({ id: P + 'tbxCURR_MONTHLY_SALARY_NA', name: '',
                 label: 'Monthly Income in Local Currency',
                 type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('employer state Does Not Apply stays unclaimed',
   dna2('cbexEmpSchStateNA', 'Does Not Apply State/Province',
        'Present employer or school address: City State/Province'), undefined);
eq('employer postal Does Not Apply stays unclaimed',
   dna2('cbexEmpSchPostalNA', 'Does Not Apply Postal Zone/ZIP Code',
        'Present employer or school address: Postal Zone/ZIP Code'), undefined);

// -- Additional Work/Education/Training -------------------------------
/* All seven ids came from a live Fill report, so none of these is a guess.
   Six are constants; countriesVisited is derived from intake column M. */
const addl = (id, label, type) =>
  (M.matchKey({ id: P + id, name: '', label: label || 'Yes',
                type: type || 'radio', tag: 'input' }, {}) || {}).key;
eq('clan or tribe',        addl('rblCLAN_TRIBE_IND_0'), 'clanTribe');
eq('countries visited',    addl('rblCOUNTRIES_VISITED_IND_0'), 'countriesVisited');
eq('organization',         addl('rblORGANIZATION_IND_0'), 'belongedOrganization');
eq('specialized skills',   addl('rblSPECIALIZED_SKILLS_IND_0'), 'specializedSkills');
eq('military service',     addl('rblMILITARY_SERVICE_IND_0'), 'militaryService');
eq('insurgent org',        addl('rblINSURGENT_ORG_IND_0'), 'insurgentOrg');
/* Only the FIRST row of the languages repeater. More rows need "Add Another",
   a postback each, and a burst of those is what got the agent blocked once. */
eq('first language row',
   addl('dtlLANGUAGES_ctl00_tbxLANGUAGE_NAME', 'Language Name', 'text'), 'languageSpoken');
// The organization question must not reach the U.S. contact organisation boxes.
const pocOrgBlk = 'U.S. Point of Contact Organization Name Do Not Know Relationship to You';
eq('the U.S. contact org box is still its own',
   (M.matchKey({ id: P + 'tbxUS_POC_ORGANIZATION', name: '', label: 'Organization Name',
                 section: pocOrgBlk, type: 'text', tag: 'input' }, {}) || {}).key, 'usPocOrg');
eq('and its Do Not Know box too',
   (M.matchKey({ id: P + 'cbexUS_POC_ORGANIZATION_NA', name: '', label: 'Do Not Know',
                 section: pocOrgBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key, 'usPocOrgNA');

// -- Family Information: Spouse ---------------------------------------
/* THE SPOUSE'S DATE OF BIRTH USES THE APPLICANT'S OWN CONTROL IDS - ddlDOBDay,
   ddlDOBMonth, tbxDOBYear, byte for byte what Personal 1 uses. On the live page
   those three carry NO label and NO block text either, so nothing inside the
   block says whose birthday it is. The applicant's `dob` rule stood aside
   correctly (not: /SPOUSE/i) and then nothing claimed them at all.

   What separates them is the PAGE: content.js appends the heading and the
   ?node= value to every section, so "Family Information: Spouse" is in context
   even where the block is silent. */
const spouseBlk = "Spouse's Full Name Spouse's Surnames Spouse's Given Names " +
                  "Spouse's Date of Birth Family Information: Spouse";
const spousePobBlk = 'Family Information: Spouse';   // the POB div has no reachable text
const sp = (id, label, section, type) =>
  (M.matchKey({ id: P + id, name: '', label, section: section || spouseBlk,
                type: type || 'text', tag: type === 'select' ? 'select' : 'input' }, {}) || {}).key;
eq('spouse surname', sp('tbxSpouseSurname', "Spouse's Surnames"), 'spouseName');
eq('spouse given names', sp('tbxSpouseGivenName', "Spouse's Given Names"), 'spouseName');
eq('the spouse DOB day, on the applicant own id', sp('ddlDOBDay', ''), 'spouseDob');
eq('the spouse DOB month, no label at all', sp('ddlDOBMonth', ''), 'spouseDob');
eq('the spouse DOB year, no label at all', sp('tbxDOBYear', ''), 'spouseDob');
eq('the year part is a year',
   M.matchKey({ id: P + 'tbxDOBYear', name: '', label: '', section: spouseBlk }, {}).part, 'year');
eq('spouse nationality by id', sp('ddlSpouseNationality', "Spouse's Country/Region of Origin (Nationality)"),
   'spouseNationality');
/* The applicant's own `nationality` rule claimed that box on the live page and
   reported `nationality -> INDONESIA`. Both are Indonesian almost always, which
   is why it looked fine - a foreign spouse would have been sworn to the wrong
   nationality. */
eq('the applicant nationality does not claim the spouse box',
   sp('ddlUnknownNatl', "Spouse's Country/Region of Origin (Nationality)"), 'spouseNationality');
/* The Place of Birth block is a bare <div> whose text blockLabel() does not
   reach - it came back with NO SECTION on the live page. So these ids carry no
   `must`, which would have gated the id path too. */
eq('spouse POB city by id alone, no section',
   sp('tbxSpousePOBCity', 'City', spousePobBlk), 'spousePob');
eq('spouse POB country by id alone, no section',
   sp('ddlSpousePOBCountry', 'Country/Region', spousePobBlk, 'select'), 'spousePobCountry');
eq('the POB city Do-Not-Know box is not the city',
   sp('cbexSPOUSE_POB_CITY_NA', 'Do Not Know', spousePobBlk, 'checkbox') === 'spousePob'
     ? 'LEAKED' : 'clear', 'clear');
eq('spouse address type', sp('ddlSpouseAddressType', "Spouse's Address", spouseBlk, 'select'),
   'spouseAddressType');

/* CROSS-PAGE: nothing above may reach back onto Personal 1, where the SAME ids
   carry the applicant's own answers. This is the assertion the browser fixture
   cannot make, because CEAC never puts both on one page. */
const p1 = 'Personal Information 1 Date of Birth and Place of Birth PersonalInfo1';
eq('Personal 1 DOB is still the applicant',
   (M.matchKey({ id: P + 'ddlDOBDay', name: '', label: 'Date of Birth', section: p1,
                 type: 'text', tag: 'select' }, {}) || {}).key, 'dob');
eq('Personal 1 nationality is still the applicant',
   (M.matchKey({ id: P + 'ddlAPP_NATL', name: '',
                 label: 'Country/Region of Origin (Nationality)', section: p1,
                 type: 'text', tag: 'select' }, {}) || {}).key, 'nationality');
eq('a bare City on Personal 1 is not the spouse POB',
   (M.matchKey({ id: P + 'tbxAPP_POB_CITY', name: '', label: 'City', section: p1,
                 type: 'text', tag: 'input' }, {}) || {}).key === 'spousePob'
     ? 'LEAKED' : 'clear', 'clear');

// -- Sign and Submit --------------------------------------------------
/* Three answers on this page and nothing else. The ids carry no FormView1
   segment - two are ctl00_SiteContentPlaceHolder_* directly - so the rules
   match bare fragments. */
const signBlk = 'Sign and Submit E-Signature I certify under penalty of perjury';
const sign = (id, label, type) =>
  (M.matchKey({ id: 'ctl00_SiteContentPlaceHolder_' + id, name: '', label,
                section: signBlk, type: type || 'text', tag: 'input' }, {}) || {}).key;
eq('the FGM/C certification by id',
   sign('chkbxFGMC', 'I certify that I have viewed and read the U.S. Government Fact Sheet ' +
                     'on Female Genital Mutilation or Cutting (FGM/C).', 'checkbox'),
   'fgmcFactSheet');
eq('the FGM/C certification by label alone',
   sign('chkbxUnknown', 'I certify that I have viewed and read the U.S. Government Fact ' +
                        'Sheet on Female Genital Mutilation or Cutting (FGM/C).', 'checkbox'),
   'fgmcFactSheet');
eq('did anyone assist you, by id',
   sign('FormView3_rblPREP_IND_0', 'Yes', 'radio'), 'preparerAssisted');
eq('did anyone assist you, by label',
   sign('rblUnknown_0', 'Yes Did anyone assist you in filling out this application?', 'radio'),
   'preparerAssisted');
/* The e-signature box wants the passport number again, and its id has no
   underscore - PPTNumTbx, not PPT_NUM. */
eq('the e-signature passport box by id', sign('PPTNumTbx', ''), 'passportNumber');
eq('the e-signature passport box by label',
   sign('tbxUnknown9', 'Enter your Passport/Travel Document Number:'), 'passportNumber');
/* What must stay untouched. Pressing Sign and Submit is the applicant's act,
   and the CAPTCHA is never automated - see the hard rules in CLAUDE.md. */
eq('the CAPTCHA is forbidden',
   M.isForbidden('ctl00_SiteContentPlaceHolder_ucLocation_IdentifyCaptcha1_CodeTextBox'), true);
eq('the Sign and Submit button is forbidden',
   M.isForbidden('ctl00_SiteContentPlaceHolder_btnSignAndSubmit'), true);
eq('no rule claims the CAPTCHA box',
   sign('ucLocation_IdentifyCaptcha1_CodeTextBox', 'Enter the code as shown:'), undefined);

// -- Crew Visa: the vessel block --------------------------------------
/* NEVER name a sibling field in a `not` guard. vesselName used to carry
   `not: /IDENT|IMO|NUMBER/i` to stay off the IMO box - but `not` is tested
   against the SECTION too, and this block's text contains "Seagoing
   Ship/Vessel Identification Number". The rule excluded itself on every real
   page, silently. The ids separate the two on their own. */
const vesselBlk = 'Crew Visa Information Specific job title aboard aircraft or vessel ' +
                  'Name of company that owns the aircraft or vessel Company Telephone Number ' +
                  'Are you serving aboard a seagoing ship or vessel? Seagoing Ship/Vessel Name ' +
                  'Seagoing Ship/Vessel Identification Number';
const vessel = (id, label, type) =>
  (M.matchKey({ id: P + id, name: '', label, section: vesselBlk,
                type: type || 'text', tag: 'input' }, {}) || {}).key;
eq('vessel name by id',    vessel('tbxSEAGOING_VESSEL_NAME', 'Seagoing Ship/Vessel Name'), 'vesselName');
eq('vessel name by label', vessel('tbxUnknown', 'Seagoing Ship/Vessel Name'), 'vesselName');
eq('vessel IMO by id',     vessel('tbxSEAGOING_VESSEL_IDENT',
                                  'Seagoing Ship/Vessel Identification Number'), 'vesselImo');
eq('vessel IMO by label',  vessel('tbxUnknown2', 'Vessel Identification Number'), 'vesselImo');
eq('job title aboard',     vessel('tbxCREW_JOB_TITLE',
                                  'Specific job title aboard aircraft or vessel'), 'jobTitleAboard');
/* The live id here starts `tbxJobTitle`, which the SHEET's own jobTitle rule
   (column AY, the present employer's position) also matches - and the id pass
   runs before any label, so it won and wrote COMMIS where the supporting
   letter says COMMIS DE CUISINE. Only the word "aboard" separates them. */
eq('the sheet position does not claim the crew box',
   vessel('tbxJobTitle', 'Specific job title aboard aircraft or vessel'), 'jobTitleAboard');
eq('the crew box by label with an unknown id',
   vessel('tbxAnything', 'Specific job title aboard aircraft or vessel'), 'jobTitleAboard');
/* ...and the sheet's position still fills its own box on Work/Education. */
eq('the present employer job title is unaffected',
   (M.matchKey({ id: P + 'tbxJobTitle', name: '', label: 'Job Title',
                 section: 'Present Employer or School Information Job Title',
                 type: 'text', tag: 'input' }, {}) || {}).key, 'jobTitle');
/* Both gates came back unrecognised from the live page; these are the real
   ids, and neither resembles what was guessed (rblSEAGOING_VESSEL_IND,
   rblAGENCY_IND). A radio's derived label is often just "Yes", so the id has
   to carry it. */
eq('serving aboard a vessel',
   vessel('rblSEAGOING_VESSEL_IND_0', 'Yes Are you serving aboard a seagoing ship or vessel?',
          'radio'), 'servingAboardVessel');
eq('serving aboard a vessel, live id, label just "Yes"',
   vessel('rblVesselWorkQuestion_0', 'Yes', 'radio'), 'servingAboardVessel');
eq('acquired the position through an agency, live id',
   vessel('rblPositionThroughAgency_0', 'Yes', 'radio'), 'usedAgency');
/* Four companies appear on this form and this is none of the other three: not
   the manning agency, not the payer, not the seafarer's own employer. */
eq('the vessel owner company',
   vessel('tbxVESSEL_OWNER_NAME',
          'Name of company that owns the aircraft or vessel you will be working on'),
   'vesselOwnerCompany');
eq('the owner company by label alone',
   vessel('tbxUnknown3', 'Name of company that owns the aircraft or vessel you will be working on'),
   'vesselOwnerCompany');
eq('vessel name stays off the owner box',
   vessel('tbxVESSEL_OWNER_NAME', 'Name of company that owns the vessel') === 'vesselName'
     ? 'LEAKED' : 'clear', 'clear');
eq('company telephone number', vessel('tbxUnknown4', 'Company Telephone Number'),
   'vesselOwnerPhone');
/* The owner's two boxes SHARE A PREFIX - VESSEL_OWNER_NAME and
   VESSEL_OWNER_TEL - so the company rule claimed the phone box by id and wrote
   "CARNIVAL UK" into it, found in the browser on 2026-09-01. A `not` guard
   cannot fix that either: the block text says "Company Telephone Number", so
   `not: /TEL|PHONE/i` would exclude the company box as well. The company id
   carries a negative LOOKAHEAD, which only ever looks at the id. */
eq('the owner phone by id, not the company name',
   vessel('tbxVESSEL_OWNER_TEL', 'Company Telephone Number'), 'vesselOwnerPhone');
eq('the owner phone by id with no label at all',
   vessel('tbxVESSEL_OWNER_TEL', ''), 'vesselOwnerPhone');
eq('the owner company still matches its own id',
   vessel('tbxVESSEL_OWNER_NAME', ''), 'vesselOwnerCompany');
// The payer phone on the Travel page is a bare "Telephone Number" - unaffected.
eq('the payer phone is still its own',
   (M.matchKey({ id: P + 'tbxPayerPhone', name: '', label: 'Telephone Number',
                 section: 'Person/Entity Paying for Your Trip Telephone Number',
                 type: 'text', tag: 'input' }, {}) || {}).key, 'payerPhone');

// -- Crew Visa: the manning agency block ------------------------------
/* CTI Indonesia is the AGENCY, not the employer. Every box here shares its
   label with four other blocks - City, State/Province, Street Address,
   Telephone Number, Surnames, Given Names - so all of them are scoped by
   `must: /agency/i`. Ids are guesses until a live report lands; the labels
   carry them meanwhile. */
const agencyBlk = 'Did you acquire your position using a recruiting/manning/crewing agency? ' +
                  'Agency Name Contact Name Street Address City State/Province ' +
                  'Postal Zone/ZIP Code Country/Region Telephone Number';
const inAgency = (label, id, type) =>
  (M.matchKey({ id: P + (id || 'tbxUnknown'), name: '', label, section: agencyBlk,
                type: type || 'text', tag: type === 'radio' ? 'input' : 'input' }, {}) || {}).key;
eq('used an agency',   inAgency('Yes Did you acquire your position using a recruiting/manning/crewing agency?',
                               'rblAgencyIND_0', 'radio'), 'usedAgency');
eq('agency name',      inAgency('Agency Name', 'tbxAgencyName'), 'agencyName');
eq('agency street',    inAgency('Street Address'), 'agencyAddr1');
eq('agency city',      inAgency('City'), 'agencyCity');
eq('agency state',     inAgency('State/Province'), 'agencyState');
eq('agency postal',    inAgency('Postal Zone/ZIP Code'), 'agencyPostal');
eq('agency country',   inAgency('Country/Region'), 'agencyCountry');
eq('agency phone',     inAgency('Telephone Number'), 'agencyPhone');
eq('agency contact surname', inAgency('Surnames'), 'agencyContactSurname');
eq('agency contact given',   inAgency('Given Names'), 'agencyContactGiven');
/* The same labels outside the agency block must NOT reach these rules -
   the seafarer's home city and the U.S. stay city are the two that would
   hurt most. */
const outside = (label, section, id) =>
  (M.matchKey({ id: P + (id || 'tbxUnknown'), name: '', label, section,
                type: 'text', tag: 'input' }, {}) || {}).key;
eq('home city is not the agency city',
   outside('City', 'Home Address Street Address City State/Province', 'tbxAPP_ADDR_CITY'), 'homeCity');
eq('a bare City outside any block stays unclaimed', outside('City', ''), undefined);
eq('the U.S. stay city is still its own',
   outside('City', 'Address Where You Will Stay in the U.S. City State ZIP Code'), 'stayCity');
eq('the agency phone rule stays off the primary phone',
   outside('Telephone Number', 'Phone Primary Phone Number Secondary Phone Number'), undefined);

// -- Family: the parents' controls are PascalCase plurals -------------
// The live page reported all six DOB parts unrecognised while the names
// filled on their labels: the ids are ddlFathersDOBDay, not FATHER_DOBDay.
eq('father DOB day',    key('ddlFathersDOBDay'), 'fatherDob');
eq('father DOB month',  key('ddlFathersDOBMonth'), 'fatherDob');
eq('father DOB year',   key('tbxFathersDOBYear'), 'fatherDob');
eq('mother DOB day',    key('ddlMothersDOBDay'), 'motherDob');
eq('mother DOB year',   key('tbxMothersDOBYear'), 'motherDob');
eq('father DOB underscore form still works', key('ddlFATHER_DOBDay'), 'fatherDob');
eq('father DOB year part',
   M.matchKey({ id: P + 'tbxFathersDOBYear', name: '', label: '' }, {}).part, 'year');
// GivenName has no underscore in this spelling either.
eq('mother given name',  key('tbxMothersGivenName'), 'motherName');
eq('mother surname',     key('tbxMothersSurname'), 'motherName');
eq('father underscore name form still works', key('tbxFATHER_GIVEN_NAME'), 'fatherName');
eq('name half from the plural id', M.nameHalf('tbxMothersSurname', 'WAYAN SARI DEWI'), 'DEWI');
// The applicant's own DOB must keep standing clear of the parents' boxes -
// its rule is only excluded from theirs by the FATHER|MOTHER guard.
eq('applicant DOB unaffected', key('ddlDOBDay'), 'dob');
eq('parents DOB never claimed by the applicant rule',
   key('ddlFathersDOBDay') === 'dob' ? 'LEAKED' : 'clear', 'clear');
// Both radios arrive with no question text - the label was just "Yes".
eq('father in the US', radio('rblFATHER_LIVE_IN_US_IND_0', 'Yes'), 'fatherInUs');
eq('mother in the US', radio('rblMOTHER_LIVE_IN_US_IND_1', 'Yes'), 'motherInUs');
eq('father in the US by label',
   radio('rblUnknownFatherUS', 'Yes Is your father in the U.S.?'), 'fatherInUs');

// -- U.S. Contact: Organization Name is a TICK, not a typed value -----
// A filed DS-160 prints "DO NOT KNOW" in that box because the checkbox is
// ticked. Typing the words in leaves the box unticked.
const pocBlk = 'U.S. Point of Contact Organization Name Do Not Know Relationship to You';
eq('org name text box',
   (M.matchKey({ id: P + 'tbxUS_POC_ORGANIZATION', name: '', label: 'Organization Name',
                 section: pocBlk, type: 'text', tag: 'input' }, {}) || {}).key, 'usPocOrg');
eq('org name Do Not Know box',
   (M.matchKey({ id: P + 'cbexUS_POC_ORGANIZATION_NA', name: '', label: 'Do Not Know',
                 section: pocBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key, 'usPocOrgNA');
/* There are TWO "Do Not Know" boxes in this block, and CEAC titles the block
   "Contact Person or Organization in the United States" - so the word
   "Organization" sits in the context of both. A label rule guarded on that
   word ticked the contact person's box as well, greying out the Surnames and
   Given Names that do get filled. The organisation box is matched on its id
   alone; the person's box must stay unclaimed. */
const pocPersonBlk = 'Contact Person or Organization in the United States Contact Person ' +
                     'Surnames Given Names Do Not Know Organization Name Do Not Know';
eq('person Do Not Know stays unclaimed',
   (M.matchKey({ id: P + 'cbexUS_POC_NAME_NA', name: '', label: 'Do Not Know',
                 section: pocPersonBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   undefined);
eq('organisation box still claimed inside the same block',
   (M.matchKey({ id: P + 'cbexUS_POC_ORGANIZATION_NA', name: '', label: 'Do Not Know',
                 section: pocPersonBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   'usPocOrgNA');
/* Matching on the id alone then missed the live control, which came back
   unticked. The box is invisible in the report - isDoesNotApply() silences
   every "Do Not Know" - so the id could not be read off it either. Accept the
   short spelling too, and see report.deliberate for the reporting half. */
eq('organisation box, short id spelling',
   (M.matchKey({ id: P + 'cbexUS_POC_ORG_NA', name: '', label: 'Do Not Know',
                 section: pocPersonBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   'usPocOrgNA');
eq('person box unaffected by the wider pattern',
   (M.matchKey({ id: P + 'cbexUS_POC_NAME_NA', name: '', label: 'Do Not Know',
                 section: pocPersonBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   undefined);
eq('the person box is a deliberate blank, not a gap',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbexUS_POC_NAME_NA',
                      label: 'Do Not Know' }), true);
eq('contact surnames still fill',
   (M.matchKey({ id: P + 'tbxUS_POC_SURNAME', name: '', label: 'Surnames of contact',
                 section: pocPersonBlk, type: 'text', tag: 'input' }, {}) || {}).key,
   'usPocSurname');

// The text rule must not claim the checkbox's id, and the checkbox rule must
// not wander onto the other "Do Not Know" box on the Passport pages.
eq('text rule stays off the _NA id',
   (M.matchKey({ id: P + 'tbxUS_POC_ORGANIZATION_NA', name: '', label: 'Organization Name',
                 section: pocBlk, type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('visa-number Do Not Know is not the org box',
   (M.matchKey({ id: P + 'cbxPREV_VISA_FOIL_NUMBER_NA', name: '',
                 label: 'Do Not Know Visa Number', section: 'Last visa issued Visa Number',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, undefined);

// -- Passport ---------------------------------------------------------
// The live page reported ten controls unrecognised; six were the same _DTE
// infix that hid PREV_VISA_ISSUED, so only the Year boxes were being filled
// and the page showed a bare 2023 / 2033.
eq('passport type',        key('ddlPPT_TYPE'), 'passportType');
eq('issuing authority',    key('ddlPPT_ISSUED_CNTRY'), 'passportIssuedCountry');
/* "Passport Book Number" satisfies /passport.*number/ too, so passportNumber
   copied E3291557 into it on a live page - a document number sworn to that
   does not exist. An Indonesian passport has no book number: the box stays
   empty and the tick beside it goes on. */
const bookBlk = 'Passport Passport/Travel Document Number Passport Book Number Does Not Apply';
eq('the passport number stays out of the book box',
   (M.matchKey({ id: P + 'tbxPPT_BOOK_NUM', name: '', label: 'Passport Book Number',
                 section: bookBlk, type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('...and by label alone with an unknown id',
   (M.matchKey({ id: P + 'tbxAnything', name: '', label: 'Passport Book Number',
                 section: bookBlk, type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('the book box is left blank on purpose, not reported as a gap',
   M.isLeftBlank({ id: P + 'tbxPPT_BOOK_NUM', name: '', label: 'Passport Book Number',
                   type: 'text' }), true);
eq('the passport number box itself is not',
   M.isLeftBlank({ id: P + 'tbxPPT_NUM', name: '',
                   label: 'Passport/Travel Document Number', type: 'text' }), false);
eq('the book number Does Not Apply is ticked',
   (M.matchKey({ id: P + 'cbexPPT_BOOK_NUM_NA', name: '', label: 'Does Not Apply',
                 section: bookBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   'passportBookNumberNA');
eq('...and by label alone with an unknown id',
   (M.matchKey({ id: P + 'cbexUnknown', name: '', label: 'Does Not Apply',
                 section: bookBlk, type: 'checkbox', tag: 'input' }, {}) || {}).key,
   'passportBookNumberNA');
/* The other four "Does Not Apply" boxes on this form hold real values beside
   them - ticking one of those wipes an answer that is right. */
eq('the monthly income box is still its own',
   (M.matchKey({ id: P + 'cbexMonthlySalary_NA', name: '', label: 'Does Not Apply',
                 section: 'Monthly Income in Local Currency (if employed) Does Not Apply',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, 'monthlyIncomeNA');
eq('a Postal Zone Does Not Apply stays unclaimed',
   (M.matchKey({ id: P + 'cbexAPP_POSTAL_CD_NA', name: '', label: 'Does Not Apply',
                 section: 'Home Address Postal Zone/ZIP Code Does Not Apply',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, undefined);
/* PASS THE SECTION. `key('tbxPPT_NUM')` with no section passed while the live
   page left the box unfilled: the first fix used `not: /book/i`, and this
   block's text contains "Passport Book Number", so the rule excluded itself.
   A guard can only be tested by a context that actually contains the words. */
eq('the passport number still fills its own box',
   (M.matchKey({ id: P + 'tbxPPT_NUM', name: '',
                 label: 'Passport/Travel Document Number', section: bookBlk,
                 type: 'text', tag: 'input' }, {}) || {}).key, 'passportNumber');
eq('...and by label alone, in the same block as the book number',
   (M.matchKey({ id: P + 'tbxAnything2', name: '',
                 label: 'Passport/Travel Document Number', section: bookBlk,
                 type: 'text', tag: 'input' }, {}) || {}).key, 'passportNumber');
eq('city where issued',    key('tbxPPT_ISSUED_IN_CITY'), 'passportIssuePlace');
eq('state where issued',   key('tbxPPT_ISSUED_IN_STATE'), 'passportIssuedState');
eq('issuance day',         key('ddlPPT_ISSUED_DTEDay'), 'passportIssued');
eq('issuance month',       key('ddlPPT_ISSUED_DTEMonth'), 'passportIssued');
eq('issuance year',        key('tbxPPT_ISSUED_DTEYear'), 'passportIssued');
eq('issuance no infix',    key('ddlPPT_ISSUEDDay'), 'passportIssued');
eq('expiry day',           key('ddlPPT_EXPIRE_DTEDay'), 'passportExpiry');
eq('expiry year part',
   M.matchKey({ id: P + 'tbxPPT_EXPIRE_DTEYear', name: '', label: '' }, {}).part, 'year');
// The two country dropdowns on this page are different questions, and
// neither may take the home address country.
const pptBlk = 'Passport/Travel Document Information City where Issued State/Province ' +
               'Country/Region Issuance Date';
const inPpt = (label, id) =>
  (M.matchKey({ id: P + (id || 'ddlUnknown'), name: '', label, section: pptBlk,
                tag: 'select' }, {}) || {}).key;
eq('country where issued, by id',    inPpt('Country/Region', 'ddlPPT_ISSUED_IN_CNTRY'),
   'passportIssuedInCountry');
eq('country where issued, by label', inPpt('Country/Region'), 'passportIssuedInCountry');
eq('home country is not this one',
   (M.matchKey({ id: P + 'ddlAPP_ADDR_CNTRY', name: '', label: 'Country/Region',
                 section: 'Home Address Street Address City', tag: 'select' }, {}) || {}).key,
   'homeCountry');
// "No Expiration" is the same kind of box as "Does Not Apply": we have an
// expiry date, so it is left unticked on purpose and is not a gap.
eq('no-expiration is not a gap',
   M.isDoesNotApply({ type: 'checkbox', id: P + 'cbxPPT_EXPIRE_NA',
                      label: 'No Expiration Expiration Date 01 02 03' }), true);
eq('expiry rule does not claim the checkbox',
   (M.matchKey({ id: P + 'cbxPPT_EXPIRE_NA', name: '', label: 'No Expiration',
                 type: 'checkbox', tag: 'input' }, {}) || {}).key, undefined);
// Column V asks about the visa AND the passport, so it answers both. The
// passport control is LOST_PPT_IND and arrives with no question text.
eq('lost passport by id',
   (M.matchKey({ id: P + 'rblLOST_PPT_IND_0', name: '', label: 'Yes',
                 type: 'radio', tag: 'input' }, {}) || {}).key, 'visaLostStolen');
eq('lost visa still matches',
   (M.matchKey({ id: P + 'rblPREV_VISA_LOST_IND_0', name: '',
                 label: 'Yes Have you ever lost a visa or had one stolen?',
                 type: 'radio', tag: 'input' }, {}) || {}).key, 'visaLostStolen');

// -- Address and Phone ------------------------------------------------
const homeBlk = 'Home Address Street Address (Line 1) City State/Province Postal Zone Country/Region';
const inHome = (label, id) =>
  (M.matchKey({ id: P + (id || 'ddlUnknown'), name: '', label, section: homeBlk,
                tag: 'select' }, {}) || {}).key;
eq('home country by id',    inHome('Country/Region', 'ddlAPP_ADDR_CNTRY'), 'homeCountry');
eq('home country by label', inHome('Country/Region'), 'homeCountry');
// Bare, outside the block: must stay unclaimed - it could be the U.S. stay
// country or the paying company's.
eq('country with no block',
   (M.matchKey({ id: P + 'ddlUnknown', name: '', label: 'Country/Region', tag: 'select' }, {}) || {}).key,
   undefined);
eq('nationality still wins on Personal 2',
   (M.matchKey({ id: P + 'ddlAPP_POB_CNTRY', name: '',
                 label: 'Country/Region of Origin (Nationality)', tag: 'select' }, {}) || {}).key,
   'nationality');
// No source on the sheet, but named so the gap reads as the sheet's, not
// the matcher's. Id only - see the rule.
// One street string, two boxes with a length limit. Line 1 breaks on a word.
const STREET = 'DUSUN 2 RT 14 RW 04 BANGLARANGAN AMPELGADING';   // 43 chars
eq('line 1 takes what fits',
   M.addressHalf(P + 'tbxAPP_ADDR_LN1', STREET, 40), 'DUSUN 2 RT 14 RW 04 BANGLARANGAN');
eq('line 2 takes the rest',
   M.addressHalf(P + 'tbxAPP_ADDR_LN2', STREET, 40), 'AMPELGADING');
eq('halves rejoin',
   M.addressHalf(P + 'tbxAPP_ADDR_LN1', STREET, 40) + ' ' +
   M.addressHalf(P + 'tbxAPP_ADDR_LN2', STREET, 40), STREET);
eq('short address: all in line 1',
   M.addressHalf(P + 'tbxAPP_ADDR_LN1', 'JL MERDEKA 5', 40), 'JL MERDEKA 5');
eq('short address: line 2 empty',
   M.addressHalf(P + 'tbxAPP_ADDR_LN2', 'JL MERDEKA 5', 40), '');
eq('one very long word is cut at the cap',
   M.addressHalf(P + 'tbxAPP_ADDR_LN1', 'A'.repeat(50), 40), 'A'.repeat(40));
eq('no cap given falls back to 40',
   M.addressHalf(P + 'tbxAPP_ADDR_LN2', STREET, 0), 'AMPELGADING');
eq('line 2 detected by label wording', M.addressHalf('someBox_Line2', STREET, 40), 'AMPELGADING');
// Both lines map to the same record field.
eq('line 1 maps to homeAddress', key('tbxAPP_ADDR_LN1', 'Street Address (Line 1)'), 'homeAddress');
eq('line 2 maps to homeAddress', key('tbxAPP_ADDR_LN2', 'Street Address (Line 2) *Optional'), 'homeAddress');

eq('home city by id',   key('tbxAPP_ADDR_CITY'), 'homeCity');
eq('home state by id',  key('tbxAPP_ADDR_STATE'), 'homeState');
eq('home postal by id', key('tbxAPP_ADDR_POSTAL'), 'homePostal');

eq('mailing same, no underscores in the id',
   (M.matchKey({ id: P + 'rblMailingAddrSame_0', name: '',
                 label: 'Yes Is your Mailing Address the same as your Home Address?',
                 type: 'radio', tag: 'input' }, {}) || {}).key, 'mailingSameAsHome');

// "Does Not Apply" is identical on four boxes on this page. Ticking the
// wrong one wipes a State or Postal value that is correct.
const dna = (id, section) =>
  (M.matchKey({ id: P + id, name: '', label: 'Does Not Apply', section,
                type: 'checkbox', tag: 'input' }, {}) || {}).key;
eq('secondary phone DNA', dna('cbexAPP_MOBILE_TEL_NA', 'Phone Secondary Phone Number Does Not Apply'),
   'secondaryPhoneNA');
eq('work phone DNA', dna('cbexAPP_BUS_TEL_NA', 'Phone Work Phone Number Does Not Apply'),
   'workPhoneNA');
eq('state DNA claims nothing', dna('cbexAPP_ADDR_STATE_NA', homeBlk), undefined);
eq('postal DNA claims nothing', dna('cbexAPP_ADDR_POSTAL_NA', homeBlk), undefined);

const other = (id, label) =>
  (M.matchKey({ id: P + id, name: '', label, type: 'radio', tag: 'input' }, {}) || {}).key;
eq('other phones 5y',
   other('rblAddPhone_0', 'Yes Have you used any other phone numbers in the last five years?'),
   'otherPhones5y');
eq('other emails 5y',
   other('rblAddEmail_0', 'Yes Have you used any other email addresses in the last five years?'),
   'otherEmails5y');
eq('other websites 5y',
   other('rblAddSocial_0', 'Yes Do you wish to provide information about your presence on any ' +
         'other websites or applications you have used within the last five years?'),
   'otherWebsites5y');
/* The live page gives these three no question text at all - the label came
   back as just "Yes" - so the id has to carry them on its own. And no \b
   after the name: the ids end in _0 / _1 and an underscore is a word
   character, so \b never matches there. That is why the first attempt at
   these rules still came back "Not recognised". */
eq('other phones by id alone',   other('rblAddPhone_0', 'Yes'), 'otherPhones5y');
eq('other phones, No button',    other('rblAddPhone_1', 'Yes'), 'otherPhones5y');
eq('other emails by id alone',   other('rblAddEmail_0', 'Yes'), 'otherEmails5y');
eq('other websites by id alone', other('rblAddSocial_0', 'Yes'), 'otherWebsites5y');

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
/* "FNU" is the DS-160 placeholder, never a name. It reached the live Family
   page as a token and became the surname: Surnames FNU / Given Names SUROSO
   from an intake value of "SUROSO FNU". */
eq('half FNU token surname', M.nameHalf('tbxFathersSurname', 'SUROSO FNU'), 'SUROSO');
eq('half FNU token given',   M.nameHalf('tbxFathersGivenName', 'SUROSO FNU'), 'FNU');
eq('half FNU leading',       M.nameHalf('tbxFathersSurname', 'FNU SUROSO'), 'SUROSO');
eq('half FNU alone',         M.nameHalf('tbxFathersSurname', 'FNU'), 'FNU');
/* A relative with one name is Surnames + a ticked "Do Not Know", not the
   literal FNU - CEAC prints those letters because the box is ticked. The
   applicant's own Given Names on Personal 1 has no such box, so it keeps FNU. */
eq('parent mononym surname',
   M.nameHalf('tbxFathersSurname', 'Suroso', { blankGiven: true }), 'SUROSO');
eq('parent mononym given left empty',
   M.nameHalf('tbxFathersGivenName', 'Suroso', { blankGiven: true }), '');
eq('parent mononym given empty from a trailing FNU',
   M.nameHalf('tbxFathersGivenName', 'SUROSO FNU', { blankGiven: true }), '');
eq('parent with two names is untouched',
   M.nameHalf('tbxMothersGivenName', 'Endang Aris Tantini', { blankGiven: true }), 'ENDANG ARIS');
eq('applicant given names keep FNU',
   M.nameHalf('tbxAPP_GIVEN_NAME', 'Sukarno'), 'FNU');
eq('only the parents opt in', M.MONONYM_NA_KEYS.join(','), 'fatherName,motherName');
// The tick boxes themselves. The live ids are not known yet, so both
// plausible CEAC spellings are accepted.
const dnk = id =>
  (M.matchKey({ id: P + id, name: '', label: 'Do Not Know',
                type: 'checkbox', tag: 'input' }, {}) || {}).key;
eq('father given Do Not Know, Unknown suffix', dnk('cbxFathersGivenNameUnknown'), 'fatherGivenNA');
eq('father given Do Not Know, _NA suffix',     dnk('cbexFATHER_GIVEN_NAME_NA'), 'fatherGivenNA');
eq('mother given Do Not Know',                 dnk('cbxMothersGivenNameUnknown'), 'motherGivenNA');
// The SURNAME box is never ticked - we always have that half.
eq('father surname Do Not Know stays unclaimed', dnk('cbxFathersSurnameUnknown'), undefined);
/* "Surnames" and "Given Names" label the relatives' boxes too, and the
   applicant's rules sit first in the list. The id pass saves it today, but a
   renamed CEAC control would let the label pass write the SEAFARER's own name
   into his father's box - so both rules carry the relative guard. */
eq('applicant given names stay off a relative box',
   (M.matchKey({ id: P + 'tbxFathersSomethingNew', name: '', label: 'Given Names',
                 type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('applicant surname stays off a relative box',
   (M.matchKey({ id: P + 'tbxSpouseSomethingNew', name: '', label: 'Surnames',
                 type: 'text', tag: 'input' }, {}) || {}).key, undefined);
eq('the applicant own boxes still match by label',
   (M.matchKey({ id: P + 'tbxUnknownApplicantBox', name: '', label: 'Given Names',
                 type: 'text', tag: 'input' }, {}) || {}).key, 'givenNames');

// -- Previous Work / Education: the repeater prefix ---------------------
/* THE ONLY DISCRIMINATOR IS `dtlPrevEmpl`. CEAC renders this page as two
   ASP.NET DataLists and reuses the PRESENT employer's field names inside them,
   so the live start-date box is `dtlPrevEmpl_ctl00_ddlEmpDateFromDay` - which
   `employerStart`'s own /EmpDateFrom(Day|Month|Year)/ matches perfectly.

   On a live Fill (2026-09-02, the first `previously employed = YES` row anyone
   had filed) that wrote the PRESENT employer's start date, column AX, into the
   PREVIOUS employer's box, where column BF belongs. Filled, plausible and
   wrong on a sworn form - the worst class of bug this file can produce, and
   invisible in the report because a filled field is not a gap.

   The To date had no rule at all: the old pattern wanted `PrevEmplDateTo`,
   which does not exist, so it came back unrecognised. */
const prevEmplBlk = 'Previous Work/Education/Training Information Previous Employer ' +
                    'Employer Name Employment Date From Employment Date To';
const pe = (id, label, type) =>
  (M.matchKey({ id: P + 'dtlPrevEmpl_ctl00_' + id, name: '', label,
                section: prevEmplBlk, type: type || 'text',
                tag: /^ddl/.test(id) ? 'select' : 'input' }, {}) || {}).key;

eq('the previous employer start date is prevStart, NOT employerStart',
   pe('ddlEmpDateFromDay', ''), 'prevStart');
eq('...month too', pe('ddlEmpDateFromMonth', ''), 'prevStart');
eq('...and year', pe('tbxEmpDateFromYear', ''), 'prevStart');
eq('the end date now matches at all', pe('ddlEmpDateToDay', ''), 'prevEnd');
eq('...month too', pe('ddlEmpDateToMonth', ''), 'prevEnd');
eq('...and year', pe('tbxEmpDateToYear', ''), 'prevEnd');
/* And the PRESENT page must keep its own date - the guard is a `not` on a
   different block, not on a neighbour, so it may not cost employerStart its
   own box. */
eq('the present employer keeps its start date',
   (M.matchKey({ id: P + 'ddlEmpDateFromDay', name: '', label: 'Start Date',
                 section: 'Present Work/Education/Training Information ' +
                          'Present Employer or School Address Start Date',
                 type: 'text', tag: 'select' }, {}) || {}).key, 'employerStart');

/* employerCountry sat BEFORE prevCountry in the table and its `must: /employer/i`
   is satisfied by "Previous Employer", so in the label pass it claimed the
   previous employer's Country/Region and left it blank - it has no constant
   behind it. That is why the live report read `employerCountry - no value in
   record` on a page where that field does not exist, while column BH went
   unused. */
eq('the previous employer country is prevCountry',
   pe('ddlEmployerCountry', 'Country/Region', 'text'), 'prevCountry');
eq('...and by label alone, which is where it went wrong',
   pe('ddlUnknownCountry', 'Country/Region', 'text'), 'prevCountry');

/* The live city box is `tbEmployerCity` with no ADDR in it, which the old
   /PrevEmpl.*Addr.*City/ missed. State and postal DO carry ADDR - and each
   sits beside an `_NA` twin sharing its whole prefix, the vessel-owner trap
   again, so both need the lookahead. Ticking one of those would wipe an
   address the agent typed by hand. */
eq('previous employer city', pe('tbEmployerCity', 'City'), 'prevEmployerCity');
eq('previous employer state', pe('tbxPREV_EMPL_ADDR_STATE', 'State/Province'), 'prevEmployerState');
eq('previous employer postal', pe('tbxPREV_EMPL_ADDR_POSTAL_CD', 'Postal Zone/ZIP Code'),
   'prevEmployerPostal');
eq('the state _NA twin is not the state box',
   pe('cbxPREV_EMPL_ADDR_STATE_NA', 'Does Not Apply', 'checkbox') === 'prevEmployerState'
     ? 'LEAKED' : 'clear', 'clear');
eq('the postal _NA twin is not the postal box',
   pe('cbxPREV_EMPL_ADDR_POSTAL_CD_NA', 'Does Not Apply', 'checkbox') === 'prevEmployerPostal'
     ? 'LEAKED' : 'clear', 'clear');
eq('briefly describe your duties', pe('tbDescribeDuties', 'Briefly describe your duties:'),
   'prevDuties');
/* The supervisor boxes carry no "Prev" in the field name, so the old
   /PrevSupervisor/ never matched and only the label was holding them. */
eq('supervisor surname', pe('tbxSupervisorSurname', 'Surnames'), 'prevSupervisor');
eq('the supervisor _NA twin is not the name box',
   pe('cbxSupervisorSurname_NA', 'Do Not Know', 'checkbox') === 'prevSupervisor'
     ? 'LEAKED' : 'clear', 'clear');

// -- and the education repeater, same shape ---------------------------
const prevEducBlk = 'Previous Work/Education/Training Information ' +
                    'Educational Institution Name of Institution Date of Attendance';
const ed = (id, label, type) =>
  (M.matchKey({ id: P + 'dtlPrevEduc_ctl00_' + id, name: '', label,
                section: prevEducBlk, type: type || 'text',
                tag: /^ddl/.test(id) ? 'select' : 'input' }, {}) || {}).key;
eq('school city', ed('tbxSchoolCity', 'City'), 'eduCity');
eq('school state', ed('tbxEDUC_INST_ADDR_STATE', 'State/Province'), 'eduState');
eq('school postal', ed('tbxEDUC_INST_POSTAL_CD', 'Postal Zone/ZIP Code'), 'eduPostal');
eq('the school state _NA twin is not the state box',
   ed('cbxEDUC_INST_ADDR_STATE_NA', 'Does Not Apply', 'checkbox') === 'eduState'
     ? 'LEAKED' : 'clear', 'clear');
eq('the school postal _NA twin is not the postal box',
   ed('cbxEDUC_INST_POSTAL_CD_NA', 'Does Not Apply', 'checkbox') === 'eduPostal'
     ? 'LEAKED' : 'clear', 'clear');

console.log('  (previous-work repeater covered)');


/* -- a greyed-out box is quiet only WHILE its tick is on -------------
   The SSN is three boxes and the tax ID one, no rule can fill them yet, and a
   C1/D application ticks Does Not Apply beside both - so every Fill on
   Personal 2 was listing all four as "Not recognised", which is the noise that
   buries a real gap.

   Silencing them with a static list would be worse: a J1 row with an SSN needs
   them filled, and the unrecognised list is exactly how their real ids get
   read off the page. So it is keyed on the record's own NA answer. */
eq('the SSN box is quiet while the tick is on',
   M.isLeftBlank({ id: P + 'tbxAPP_SSN1', name: '', label: '', type: 'text' },
                 { ssnNA: 'YES' }), true);
eq('and the tax ID box too',
   M.isLeftBlank({ id: P + 'tbxAPP_TAX_ID', name: '', label: '', type: 'text' },
                 { taxIdNA: 'YES' }), true);
eq('but LOUD the moment the sheet has a number',
   M.isLeftBlank({ id: P + 'tbxAPP_SSN1', name: '', label: '', type: 'text' },
                 { ssnNA: 'NO', ssn: '123456789' }), false);
eq('and loud with no record at all, so a stale caller cannot silence it',
   M.isLeftBlank({ id: P + 'tbxAPP_SSN1', name: '', label: '', type: 'text' }), false);
/* One tick must not silence the other field. */
eq('the SSN tick says nothing about the tax ID box',
   M.isLeftBlank({ id: P + 'tbxAPP_TAX_ID', name: '', label: '', type: 'text' },
                 { ssnNA: 'YES' }), false);
/* The passport book number stays on the STATIC list - it is blank on every
   application CTI files, whatever the record says. */
eq('the static list still works with no record',
   M.isLeftBlank({ id: P + 'tbxPPT_BOOK_NUM', name: '', label: 'Passport Book Number',
                   type: 'text' }), true);


/* -- the J1 Student / Exchange Visitor page --------------------------
   Three rules, matched on the LABEL alone, because no live J1 Fill report
   exists yet and no id has been guessed. These labels appear nowhere else on
   the form, so no `must` guard is wanted - an unnecessary guard is what killed
   eduCountry and both spousePob rules, since `must` gates the id path too. */
/* `key()` above passes no section, and every guard here is judged on one - the
   same blind spot that let `not: /book/i` break passportNumber while the node
   test stayed green. So this block uses its own helper. */
const keyIn = (id, label, section) =>
  (M.matchKey({ id: P + id, name: '', label: label || '', section: section || '',
                type: 'text', tag: 'input' }, {}) || {}).key || null;
const SEX = 'Student/Exchange Visitor Information';
eq('SEVIS ID',       keyIn('tbxWhatever', 'SEVIS ID', SEX), 'sevisId');
eq('Program Number', keyIn('tbxWhatever', 'Program Number', SEX), 'programNumber');

/* -- and the block it must NOT touch ---------------------------------
   CEAC takes TWO additional points of contact there, and every sub-label is
   shared between them AND with the applicant's own boxes: Surnames, Given
   Names, Street Address, City, State/Province, Postal Zone/ZIP Code,
   Country/Region, Telephone Number, Email Address.

   Before the guard, `homeAddress` and `email` claimed four boxes across the two
   contact blocks - the applicant's own address and email written into a
   stranger's contact details. Filled, plausible, wrong, and invisible, because
   a filled field is not a gap. `surname` stood aside only because the fixture's
   invented id contains `AddPoc`, which the old guard's `POC` matched: luck, not
   protection.

   TWO INDEPENDENT GUARDS, because either can be out of reach. `exchange` comes
   from pageTag() and is reachable however the block is nested; `point of
   contact` comes from the block heading, which blockLabel() only reaches when
   there is no <legend> to prefer. Both are asserted, because the browser
   fixture exercises only the first. */
const POC = 'Name (1) Surnames Given Names Street Address City State/Province ' +
            'Postal Zone/ZIP Code Country/Region Telephone Number Email Address ' +
            'Student/Exchange Visitor Information';
const POC_NO_LEGEND = 'Additional Point of Contact Information Surnames Given Names ' +
                      'Street Address City Telephone Number Email Address';
eq('the home address stays out (page tag)',   keyIn('tbxAddr1', 'Street Address', POC), null);
eq('and out with no legend to read',          keyIn('tbxAddr1', 'Street Address', POC_NO_LEGEND), null);
eq('the email stays out (page tag)',          keyIn('tbxEmail', 'Email Address', POC), null);
eq('and out with no legend to read',          keyIn('tbxEmail', 'Email Address', POC_NO_LEGEND), null);
eq('the surname stays out (page tag)',        keyIn('tbxSurname', 'Surnames', POC), null);
eq('and out with no legend to read',          keyIn('tbxSurname', 'Surnames', POC_NO_LEGEND), null);
eq('given names too',                         keyIn('tbxGivenName', 'Given Names', POC), null);

/* AND THE GUARD MUST NOT COST THE REAL MATCH. These four are the pages where
   those rules do their actual work, and the cross-fixture sweep
   (test/sweep-fixtures.html) confirms the same in a browser. */
eq('the home address still matches its own block',
   keyIn('tbxAPP_ADDR_LN1', 'Street Address', 'Home Address'), 'homeAddress');
eq('the email still matches',
   keyIn('tbxAPP_EMAIL_ADDR', 'Email Address', 'Email Address Information'), 'email');
eq('the surname still matches',
   keyIn('tbxAPP_SURNAME', 'Surnames', 'Personal Information 1'), 'surname');
eq('given names still match',
   keyIn('tbxAPP_GIVEN_NAME', 'Given Names', 'Personal Information 1'), 'givenNames');
/* The U.S. contact's own email keeps its box - it wins in the id pass, which
   runs first, and that is all that ever protected it. */
eq("the US contact's email is still its own",
   keyIn('tbxUS_POC_EMAIL_ADDR', 'Email Address', 'Contact Person in the United States'), 'usPocEmail');


/* -- which visa class a page belongs to ------------------------------
   The popup can show which pack a record came from, but a label alone is
   decoration. The failure worth catching is a record of one class being
   filled into the other class's application, and that is invisible today: a
   C1/D record on a J1 form puts the cruise line's U.S. contact and the
   manning agency into boxes that accept them happily, and a filled field
   appears in no report.

   So the page's class is inferred from the keys that actually matched on it -
   no URL and no page heading guessed. */
eq('a vessel key is C1/D only', M.classOfKey('vesselName'), 'c1d');
eq('the manning agency too',    M.classOfKey('agencyName'), 'c1d');
eq('SEVIS is J1 only',          M.classOfKey('sevisId'), 'j1');
eq('and the programme number',  M.classOfKey('programNumber'), 'j1');
/* MOST OF THE FORM BELONGS TO NO CLASS, and must not be labelled - Personal,
   Passport, Family, Address, Security and Sign are identical for every visa
   class. That is the whole reason this is one app with two packs. */
eq('a shared field belongs to neither', M.classOfKey('surname'), null);
eq('nor the passport',                  M.classOfKey('passportNumber'), null);
eq('nor the home address',              M.classOfKey('homeAddress'), null);
/* THE TWO SETS MUST NOT OVERLAP. An overlapping key would make a page report
   both classes at once, which content.js treats as a contradiction and
   answers with silence - so the guard would quietly stop guarding. */
const overlap = M.CLASS_ONLY.c1d.filter(k => M.CLASS_ONLY.j1.indexOf(k) >= 0);
eq('the class sets are disjoint', overlap.join(',') || 'none', 'none');
/* And every key named must be a key some rule actually produces, or the
   inference is looking for something that can never match. */
const ruleKeys = new Set(M.RULES.map(r => r.key));
const unknown = [].concat(M.CLASS_ONLY.c1d, M.CLASS_ONLY.j1).filter(k => !ruleKeys.has(k));
eq('every class-only key has a rule', unknown.join(',') || 'none', 'none');


/* -- controls that repeat, and the list behind them ------------------
   CEAC renders its education block as an ASP.NET DataList: one visible row
   plus an "Add Another" button. The J1 template names THREE schools for all 69
   of its rows, so filling only the first meant retyping two schools whose
   details are already in the sheet.

   The pacing is the operator's own click - they press Add Another, which IS
   the postback, and the next Fill press fills the row that appeared. Nothing
   here adds traffic to CEAC. */
eq('the school name reads its row',   M.REPEATED.eduName.list, '_eduList');
eq('and knows which field',           M.REPEATED.eduName.field, 'name');
eq('the address too',                 M.REPEATED.eduAddress.field, 'address');
eq('the course',                      M.REPEATED.eduCourse.field, 'course');
eq('and both dates',
   M.REPEATED.eduFrom.field + '/' + M.REPEATED.eduTo.field, 'from/to');
/* THE PLACES-TO-VISIT REPEATER IS A ONE-ENTRY LIST, and that is the point.
   It is filled with the host organisation's city, and there is only ever one
   of those - so row 1 gets it and any row the operator opens with Add Another
   is left alone. A plain key would hand the same city to every row: a
   duplicate on a sworn form, produced by a button they pressed to add
   somewhere ELSE. */
eq('the places repeater reads its row', M.REPEATED.travelLocation.list, '_travelList');
eq('and knows which field',             M.REPEATED.travelLocation.field, 'location');

/* Every repeated key must name a field the list actually carries, or the row
   silently fills with undefined.

   THE EXPECTED FIELDS ARE READ OFF normalize.js, not typed here. The first
   version of this guard hard-coded the education list's five field names, so
   the day a SECOND list arrived it failed on a correct change and said
   nothing about why. A guard that has to be edited every time the thing it
   guards grows is a guard that will be edited to shut it up. */
const N = require('../normalize.js');
const listRec = N.toRecord({
  'Name': 'A, B',
  'Name of Junior High School': 'SMP NEGERI 2 SERIRIT',
  'Junior High School Address': 'JL RAYA SERIRIT',
  /* The employer repeater takes two rows on J1 - the current workplace, then
     the previous one - so both have to be present or its list is empty and
     this guard cannot see the fields it is checking. */
  "Current Workplace's Name": 'GRAND HYATT BALI',
  'Previous Work Place Name': 'HOTEL SANUR',
  'Point of contact address': '7000 KALAHARI DR, SANDUSKY, OHIO, 44870',
});
const stray = [];
for (const k in M.REPEATED) {
  const r = M.REPEATED[k], row = (listRec[r.list] || [])[0];
  if (!row) { stray.push(k + ': normalize publishes no ' + r.list); continue; }
  if (!(r.field in row)) stray.push(k + ': ' + r.list + ' has no ' + r.field);
}
eq('no repeated key names a field the list lacks', stray.join('; ') || 'none', 'none');
/* And it must be a key some rule can produce, or nothing ever reaches it. */
const ruleKeys2 = new Set(M.RULES.map(r => r.key));
const strayKey = Object.keys(M.REPEATED).filter(k => !ruleKeys2.has(k));
eq('every repeated key has a rule', strayKey.join(',') || 'none', 'none');
/* THE ROW-INDEX-FREE RULES ARE THE WHOLE REASON THIS EXISTS. `eduName` matches
   `SchoolName` with no row number in it, so on a page with three rows it
   matches all three - and before REPEATED it wrote the same school into every
   one of them. */
eq('the rule matches any row', key('dtlPrevEduc_ctl00_tbxSchoolName'), 'eduName');
eq('including the second',     key('dtlPrevEduc_ctl01_tbxSchoolName'), 'eduName');
eq('and the third',            key('dtlPrevEduc_ctl02_tbxSchoolName'), 'eduName');


/* -- the J1 Travel page, from its first live Fill --------------------
   Five controls came back in "Not recognised" and every id below is the real
   one, read off that report rather than guessed. */
eq('the payer email',  key('tbxPAYER_EMAIL_ADDR'), 'payerEmail');
eq('the payer address question', key('rblPayerAddrSameAsInd_0'), 'payerAddressSameAsHome');
/* `tbxArriveFlight`, not `ARRIVAL_FLIGHT` - the guessed spelling never matched
   and both flight boxes sat unrecognised. */
eq('the arrival flight',   key('tbxArriveFlight'), 'arrivalFlight');
eq('the departure flight', key('tbxDepartFlight'), 'departureFlight');
eq('the places to visit',  key('dtlTravelLoc_ctl00_tbxSPECTRAVEL_LOCATION'), 'travelLocation');
/* The old spellings stay accepted: they cost nothing and another CEAC page may
   yet use them. */
eq('the old arrival spelling still works', key('tbxARRIVAL_FLIGHT'), 'arrivalFlight');

/* THE PAYER'S EMAIL IS MATCHED ON ITS ID ALONE. "Email Address" also labels
   the applicant's own box, the U.S. contact's and both additional points of
   contact, so a label rule here would be one renamed control away from putting
   the wrong address in. */
eq("the applicant's own email box is still its own", key('tbxAPP_EMAIL_ADDR'), 'email');


/* -- THE PAYER'S NAME IS TWO BOXES, AND THEY WERE THE APPLICANT'S ----
   On the OTHER PERSON branch CEAC asks for "Surnames of Person Paying for
   Trip" and "Given Names of Person Paying for Trip". `/^surnames/i` and
   `/^given names/i` match both of them, and a live report showed PRATAMA /
   PUTU YUDA - the applicant's own name - sworn as the person paying, listed
   as "already correct".

   The real ids are unknown, and this is why: the boxes never reached a "Not
   recognised" list, because a rule was claiming them. So both rules here are
   label-only and the ids below are opaque on purpose. */
const payBlk = 'Person/Entity Paying for Your Trip Provide the following ' +
               'information Surnames of Person Paying for Trip Given Names of ' +
               'Person Paying for Trip Telephone Number Email Address ' +
               'Relationship to You';
eq('the payer surname box',
   ph('tbxCtl0041', 'Surnames of Person Paying for Trip', payBlk), 'payerSurname');
eq('the payer given names box',
   ph('tbxCtl0042', 'Given Names of Person Paying for Trip', payBlk), 'payerGivenNames');
/* THE GUARD, which is the half that stops a wrong sworn answer. `paying` is
   in the label itself, so it holds even where blockLabel() reaches nothing. */
eq('the applicant surname rule stands aside',
   ph('tbxCtl0041', 'Surnames of Person Paying for Trip', ''), 'payerSurname');
eq('and the given names rule',
   ph('tbxCtl0042', 'Given Names of Person Paying for Trip', ''), 'payerGivenNames');
/* AND IT MUST NOT COST THE APPLICANT HIS OWN BOXES. Personal 1 says nothing
   about paying, so the guard is out of reach there. */
eq('Personal 1 surnames still fill',
   ph('tbxAPP_SURNAME', 'Surnames', 'Personal Information 1 Name'), 'surname');
eq('and given names', ph('tbxAPP_GIVEN_NAME', 'Given Names',
   'Personal Information 1 Name'), 'givenNames');
/* The single Name box is the COMPANY/ORGANIZATION branch - C1/D's payer is
   the cruise line - and the lookahead is the sibling-prefix rule: if the two
   boxes above turn out to be `tbxPayerNameSurname`, a bare `/tbxPayerName/i`
   would put the whole name in the surname box. */
eq('the company name box is still its own',
   ph('tbxPayerName', '', payBlk), 'payerCompany');
eq('but it cannot reach a surname box',
   ph('tbxPayerNameSurname', 'Surnames of Person Paying for Trip', payBlk), 'payerSurname');
/* The applicant's own email box also carries `paying` now. Its id rule wins
   today, so this asserts the label path the id rule is a backstop for. */
eq('the payer email box is not the applicant\'s',
   ph('tbxCtl0043', 'Email Address', payBlk), undefined);


/* -- A GUARD HELD UP BY STRING TRUNCATION ---------------------------
   `purposeOfTrip` carried `not: /Specify|OTHER/i`, and "Specify" is the label
   of the dropdown NEXT TO it in the same block - so the rule excluded itself,
   the mistake this suite already pins for `vesselName` and `passportNumber`.

   It appeared to work only because CEAC's option list - twenty-odd purposes -
   pushed that word past blockLabel()'s 240-character cut. The moment option
   text stopped being swept into the section, "Specify" fitted inside the
   window and a live J1 report came back with
   `dlPrincipalAppTravel_ctl00_ddlPurposeOfTrip` unrecognised.

   So the section here holds the sibling's label deliberately. That is what a
   real page gives it. */
const purpBlk = 'Purpose of Trip to the U.S. Purpose of Trip to the U.S. Specify';
eq('the purpose dropdown, with its neighbour in the section',
   ph('dlPrincipalAppTravel_ctl00_ddlPurposeOfTrip', 'Purpose of Trip to the U.S.',
      purpBlk), 'purposeOfTrip');
eq('and with no section at all',
   ph('ddlPurposeOfTrip', 'Purpose of Trip to the U.S.', ''), 'purposeOfTrip');
/* Nothing is needed in the guard's place: neither id fragment reaches the
   Specify box, and its own anchored label claims it. */
eq('Specify is still its own', ph('ddlOtherPurpose', 'Specify', purpBlk), 'specifyPurpose');
eq('and the purpose label cannot claim it',
   ph('tbxOpaque', 'Specify', purpBlk), 'specifyPurpose');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
