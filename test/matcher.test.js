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

// -- Passport ---------------------------------------------------------
// The live page reported ten controls unrecognised; six were the same _DTE
// infix that hid PREV_VISA_ISSUED, so only the Year boxes were being filled
// and the page showed a bare 2023 / 2033.
eq('passport type',        key('ddlPPT_TYPE'), 'passportType');
eq('issuing authority',    key('ddlPPT_ISSUED_CNTRY'), 'passportIssuedCountry');
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
