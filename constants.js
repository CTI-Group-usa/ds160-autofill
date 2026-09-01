/* ------------------------------------------------------------------
 * Constant answers
 *
 * DS-160 asks questions the intake form never does. For Indonesian
 * seafarers most of them have the same answer every time, but they are
 * still answers on a visa application - so they live here, in the open,
 * where the agent can see and change each one, rather than buried in
 * the filler.
 *
 * Nothing here overwrites a value that came from the seafarer.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const STORE = 'ds160.constants';

  const CONSTANTS = [
    { key: 'otherNamesUsed', kind: 'yesno', page: 'Personal 1',
      label: 'Have you ever used other names?',
      def: 'NO', why: 'Set to Yes for anyone with a maiden, religious or alias name in their file.' },
    { key: 'telecode', kind: 'yesno', page: 'Personal 1',
      label: 'Do you have a telecode that represents your name?',
      def: 'NO', why: 'Telecodes are 4-digit codes used for Chinese and some other Asian names.' },
    { key: 'otherNationality', kind: 'yesno', page: 'Personal 2',
      label: 'Do you hold any nationality other than the one above?',
      def: 'NO', why: 'Yes only for dual nationals.' },
    { key: 'otherCountryPermRes', kind: 'yesno', page: 'Personal 2',
      label: 'Are you a permanent resident of another country?',
      def: 'NO', why: 'Yes if the seafarer holds PR somewhere other than Indonesia.' },
    { key: 'ssnNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Social Security Number - tick "Does Not Apply"',
      def: 'YES', why: 'Seafarers who have never worked in the U.S. have no SSN.' },
    { key: 'taxIdNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Taxpayer ID Number - tick "Does Not Apply"',
      def: 'YES', why: 'Only applies to someone who has filed U.S. tax returns.' },
    { key: 'mailingSameAsHome', kind: 'yesno', page: 'Address and Phone',
      label: 'Is your mailing address the same as your home address?',
      def: 'YES', why: 'The intake form collects only one address.' },
    { key: 'homeCountry', kind: 'text', page: 'Address and Phone',
      label: 'Home address - country/region', def: 'INDONESIA',
      why: 'Every seafarer CTI files for is resident in Indonesia. The intake form ' +
           'has one free-text address column and no country field.' },
    { key: 'secondaryPhoneNA', kind: 'checkbox', page: 'Address and Phone',
      label: 'Secondary Phone Number - tick "Does Not Apply"',
      def: 'YES', why: 'The intake form collects one number. Untick it and fill the box ' +
                       'if a seafarer gives a second.' },
    { key: 'workPhoneNA', kind: 'checkbox', page: 'Address and Phone',
      label: 'Work Phone Number - tick "Does Not Apply"',
      def: 'YES', why: 'Their work phone is the ship. Untick it if a shoreside number applies.' },
    { key: 'otherPhones5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Have you used any other phone numbers in the last five years?',
      def: 'NO', why: 'A Yes makes CEAC ask for each number. Check it for anyone who has ' +
                      'changed number recently - it is a sworn answer.' },
    { key: 'otherEmails5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Have you used any other email addresses in the last five years?',
      def: 'NO', why: 'A Yes makes CEAC ask for each address. Same caution as the phone ' +
                      'question above.' },
    { key: 'passportType', kind: 'text', page: 'Passport',
      label: 'Passport/Travel Document Type', def: 'REGULAR',
      why: 'An ordinary Indonesian passport. Change it for an official, diplomatic or ' +
           'emergency travel document.' },
    { key: 'passportIssuedCountry', kind: 'text', page: 'Passport',
      label: 'Country/Authority that issued the passport', def: 'INDONESIA',
      why: 'Imigrasi issues every passport CTI files with.' },
    { key: 'passportIssuedInCountry', kind: 'text', page: 'Passport',
      label: 'Country/Region where the passport was issued', def: 'INDONESIA',
      why: 'Separate CEAC question from the issuing authority above. Change it if a ' +
           'seafarer was issued a passport at a consulate abroad.' },

    { key: 'otherWebsites5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Do you wish to provide information about your presence on any other ' +
             'websites or applications?',
      def: 'NO', why: 'This is the optional question after the listed social media ' +
                      'platform, which is filled from the intake form.' },
    /* The U.S. contact and the paying company are the same on every
       application CTI files - they describe the cruise line, not the
       seafarer. Values below are Carnival UK, taken from a filed
       application; change them here for a different principal. */
    { key: 'travelCompanions', kind: 'yesno', page: 'Travel Companions',
      label: 'Are there other persons traveling with you?',
      def: 'NO', why: 'Crew join individually.' },

    { key: 'lengthOfStay', kind: 'text', page: 'Travel',
      label: 'Intended Length of Stay - number', def: '8',
      why: 'The contract length. Change it per contract if it differs.' },
    { key: 'lengthOfStayUnit', kind: 'text', page: 'Travel',
      label: 'Intended Length of Stay - unit', def: 'MONTH(S)' },
    { key: 'stayAddr1', kind: 'text', page: 'Travel',
      label: 'Where you will stay - street address (line 1)', def: '6600 NW 16TH ST',
      why: 'Same address as the U.S. contact.' },
    { key: 'stayAddr2', kind: 'text', page: 'Travel',
      label: 'Where you will stay - street address (line 2)', def: 'SUITE 8' },
    { key: 'stayCity', kind: 'text', page: 'Travel',
      label: 'Where you will stay - city', def: 'PLANTATION' },
    { key: 'stayState', kind: 'text', page: 'Travel',
      label: 'Where you will stay - state', def: 'FLORIDA' },
    { key: 'stayZip', kind: 'text', page: 'Travel',
      label: 'Where you will stay - ZIP code', def: '33313' },

    { key: 'tripPayer', kind: 'text', page: 'Travel',
      label: 'Person/Entity Paying for Your Trip', def: 'COMPANY/ORGANIZATION',
      why: 'Must read exactly as the CEAC dropdown option.' },
    { key: 'payerCompany', kind: 'text', page: 'Travel',
      label: 'Company/Organization Paying', def: 'CARNIVAL UK' },
    { key: 'payerPhone', kind: 'text', page: 'Travel',
      label: 'Paying company - telephone', def: '19545685888' },
    { key: 'payerRelationship', kind: 'text', page: 'Travel',
      label: 'Paying company - relationship to you', def: 'EMPLOYER' },
    { key: 'payerAddr1', kind: 'text', page: 'Travel',
      label: 'Paying company - street address', def: 'CARNIVAL HOUSE, 100 HARBOUR PARADE' },
    { key: 'payerAddr2', kind: 'text', page: 'Travel',
      label: 'Paying company - street address (line 2)', def: '',
      why: 'Carnival UK needs only one line; fill it for a principal that needs two.' },
    { key: 'payerCity', kind: 'text', page: 'Travel',
      label: 'Paying company - city', def: 'SOUTHAMPTON' },
    { key: 'payerState', kind: 'text', page: 'Travel',
      label: 'Paying company - state/province', def: 'HAMPSHIRE' },
    { key: 'payerZip', kind: 'text', page: 'Travel',
      label: 'Paying company - postal code', def: 'SO15 1ST' },
    { key: 'payerCountry', kind: 'text', page: 'Travel',
      label: 'Paying company - country/region', def: 'UNITED KINGDOM' },

    { key: 'usPocSurname', kind: 'text', page: 'U.S. Contact',
      label: 'Contact person - surnames', def: 'XAVIER' },
    { key: 'usPocGiven', kind: 'text', page: 'U.S. Contact',
      label: 'Contact person - given names', def: 'MARCOS' },
    /* NOT the text "DO NOT KNOW" in the Organization Name box. The printed
       DS-160 renders those words BECAUSE the checkbox beside the box is
       ticked - reading them off a filed sample and typing them back in was
       the wrong inference, corrected by the user on 2026-09-01. Ticking the
       box is also what disables the text box in CEAC. */
    { key: 'usPocOrgNA', kind: 'checkbox', page: 'U.S. Contact',
      label: 'Organization Name - tick "Do Not Know"',
      def: 'YES', why: 'CTI files against a named contact person, not an organisation. ' +
                       'Untick it and fill the box if the organisation is known.' },
    { key: 'usPocRelationship', kind: 'text', page: 'U.S. Contact',
      label: 'Relationship to you', def: 'BUSINESS ASSOCIATE' },
    { key: 'usPocAddr1', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - street address', def: '6600 NW 16TH ST' },
    { key: 'usPocAddr2', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - street address (line 2)', def: 'SUITE 8' },
    { key: 'usPocCity', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - city', def: 'PLANTATION' },
    { key: 'usPocState', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - state', def: 'FLORIDA' },
    { key: 'usPocZip', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - ZIP code', def: '33313' },
    { key: 'usPocPhone', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - phone', def: '019545695900' },
    { key: 'usPocEmail', kind: 'text', page: 'U.S. Contact',
      label: 'U.S. contact - email', def: 'marcos@carnivaluk.com' },

    /* The manning agency block on the Crew Visa page. This is CTI Indonesia's
       OWN office - it describes the agency, not the seafarer, so it is the
       same on every application. It is also where "CTI INDONESIA" and the
       Hang Tuah address belong: they were landing in Present Employer because
       the intake sheet keeps them in its "Current Workplace" columns. */
    { key: 'usedAgency', kind: 'yesno', page: 'Crew Visa',
      label: 'Did you acquire your position using a recruiting/manning/crewing agency?',
      def: 'YES', why: 'CTI is that agency. A No here hides the whole block below.' },
    { key: 'agencyName', kind: 'text', page: 'Crew Visa',
      label: 'Agency Name', def: 'CTI INDONESIA' },
    { key: 'agencyContactSurname', kind: 'text', page: 'Crew Visa',
      label: 'Agency contact - surnames', def: 'OKTAVIANIA',
      why: 'Separate boxes in CEAC, so the name is stored split rather than guessed at.' },
    { key: 'agencyContactGiven', kind: 'text', page: 'Crew Visa',
      label: 'Agency contact - given names', def: 'DORKAS' },
    { key: 'agencyAddr1', kind: 'text', page: 'Crew Visa',
      label: 'Agency - street address', def: 'JL. HANG TUAH NO.14B, RENON' },
    { key: 'agencyCity', kind: 'text', page: 'Crew Visa',
      label: 'Agency - city', def: 'DENPASAR' },
    { key: 'agencyState', kind: 'text', page: 'Crew Visa',
      label: 'Agency - state/province', def: 'BALI' },
    { key: 'agencyPostal', kind: 'text', page: 'Crew Visa',
      label: 'Agency - postal zone/ZIP code', def: '80239' },
    { key: 'agencyCountry', kind: 'text', page: 'Crew Visa',
      label: 'Agency - country/region', def: 'INDONESIA' },
    { key: 'agencyPhone', kind: 'text', page: 'Crew Visa',
      label: 'Agency - telephone number', def: '085333735407',
      why: 'Left exactly as CEAC shows it, not normalised to +62.' },

    /* No constant for the employer or school country. It was set to INDONESIA
       on 2026-09-01 and removed hours later: a row whose employer is Carnival
       UK filled INDONESIA against an address in Southampton, Hampshire. The
       employer is Indonesian for most applicants and foreign for some, so
       there is no constant to have - the agent picks it. */
    /* The SCHOOL is always in Indonesia - unlike the employer, which can be
       Carnival UK in Southampton. That is why `employerCountry` is not a
       constant and this one is. */
    { key: 'eduCountry', kind: 'text', page: 'Work / Education',
      label: 'Educational institution - country/region', def: 'INDONESIA',
      why: 'Every seafarer CTI files studied in Indonesia. Change it for anyone who ' +
           'attended a school abroad.' },

    /* "Were you previously employed?" is column AZ, not a constant. This one
       has no column: CEAC's own help says answer Yes if you ever attended a
       high school or its equivalent, for any length of time, so it is Yes for
       every seafarer CTI files - they all have at least an SMA or SMK, and the
       sheet carries a highest-level-of-education column for all of them. */
    { key: 'attendedEducation', kind: 'yesno', page: 'Work / Education',
      label: 'Have you attended any educational institutions at a secondary level or above?',
      def: 'YES', why: 'Answering No would hide the education block, and CEAC counts any ' +
                       'secondary school. Change it only for an applicant with no ' +
                       'secondary schooling at all.' },
    { key: 'monthlyIncomeNA', kind: 'checkbox', page: 'Work / Education',
      label: 'Monthly Income in Local Currency - tick "Does Not Apply"',
      def: 'YES', why: 'The intake form does not collect a salary, and the question is ' +
                       'only asked "if employed". Untick it and fill the box for a ' +
                       'seafarer who does report one.' },

    { key: 'fatherInUs', kind: 'yesno', page: 'Family',
      label: 'Is your father in the U.S.?',
      def: 'NO', why: 'Parents of CTI seafarers live in Indonesia. A Yes here makes CEAC ask ' +
                      'for his status, so check it for anyone whose father actually is in the U.S.' },
    { key: 'motherInUs', kind: 'yesno', page: 'Family',
      label: 'Is your mother in the U.S.?',
      def: 'NO', why: 'Same as the father question above.' },
    { key: 'immediateRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any immediate relatives in the U.S.?',
      def: 'NO', why: 'Spouse, child, parent or sibling living in the U.S. Check this per applicant.' },
    { key: 'otherRelativesUS', kind: 'yesno', page: 'Family',
      label: 'Do you have any other relatives in the U.S.?',
      def: 'NO', why: 'Check this per applicant.' },

    /* No constant for the previous visit's Length of Stay. It looked like one
       - crew transits are same-day - but the user corrected it on 2026-09-01:
       it is the seafarer's own answer and comes from the intake form. See
       `prevStayUnit` / `prevStayLength` in normalize.js. */

    { key: 'sameCountryResidence', kind: 'yesno', page: 'Previous U.S. Travel',
      label: 'Applying in the same country/location the previous visa was issued, ' +
             'and it is your place of principal residence?',
      def: 'YES', why: 'CTI files in Jakarta for seafarers resident in Indonesia, which is ' +
                       'where the previous visa was issued. Change it for anyone applying ' +
                       'from a third country.' },
    /* No constant for "Have you been ten-printed?" - it follows from whether
       he has held a U.S. visa before, so it is derived in normalize.js. */
    { key: 'immigrantPetition', kind: 'yesno', page: 'Previous U.S. Travel',
      label: 'Has anyone ever filed an immigrant petition on your behalf with USCIS?',
      def: 'NO', why: 'Yes if a relative or employer has ever filed an I-130 or I-140 for ' +
                      'them. Check it per applicant - it is a sworn answer and a Yes here ' +
                      'changes how the application is read.' },

    /* Not a single control - a sweep across five pages. It has no matcher
       rule; content.js reads it straight off the record. It lives here so
       it sits alongside every other answer the agent is making on the
       applicant's behalf, and can be switched off in one click. */
    { key: 'securityAllNo', kind: 'toggle', page: 'Security and Background', field: false,
      label: 'Security and Background - answer "No" to every question',
      def: 'YES',
      why: 'These are sworn answers. Every question answered this way is outlined on the ' +
           'page and listed in the extension report - read them before clicking Next, and ' +
           'change any that are not true for this applicant.' },
  ];

  const BY_KEY = CONSTANTS.reduce((m, c) => (m[c.key] = c, m), {});

  function saved() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; }
    catch (e) { return {}; }
  }

  /* Effective answer for every constant: the agent's setting if there
     is one, otherwise the default. '' means "leave it to the agent". */
  function values() {
    const s = saved(), out = {};
    for (const c of CONSTANTS) out[c.key] = (c.key in s) ? s[c.key] : c.def;
    return out;
  }

  function set(key, value) {
    if (!BY_KEY[key]) return;
    const s = saved();
    s[key] = value;
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function reset() {
    try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
  }

  /* Merge onto a record without ever clobbering the seafarer's own data. */
  function apply(rec) {
    const v = values(), out = Object.assign({}, rec);
    for (const c of CONSTANTS) {
      if (!v[c.key]) continue;
      if (out[c.key] === undefined || out[c.key] === '') out[c.key] = v[c.key];
    }
    return out;
  }

  /* Which ones are actually in play, for showing on the worksheet. */
  function active() {
    const v = values();
    return CONSTANTS.filter(c => v[c.key]).map(c => ({ ...c, value: v[c.key] }));
  }

  const api = { CONSTANTS, BY_KEY, values, set, reset, apply, active, STORE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Const = api;
})(typeof self !== 'undefined' ? self : this);
