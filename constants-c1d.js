/* ------------------------------------------------------------------
 * Constant answers - C1/D (crewmember in transit)
 *
 * THIS PACK IS FOR C1/D ONLY, and that is not a formality. Several of
 * these answers are only defensible for a seafarer joining a ship: the
 * payer and U.S. contact blocks describe the cruise line rather than the
 * applicant, travelCompanions is NO because crew join individually, and
 * three "Does Not Apply" ticks assume the intake form never collects an
 * SSN, a tax ID or a salary - which the J1 form does.
 *
 * Applying this pack to a J1 application would tick those boxes over
 * numbers that exist in the sheet: a wrong answer on a sworn form. The
 * engine in constants.js therefore holds ONE pack at a time and never
 * merges them - see `use()`.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const C1D = [
    /* The visa class owns these three. They used to sit in trip.js with
       these same values, which leaked them onto every record regardless of
       class - see the note there. */
    { key: 'purposeOfTrip', kind: 'text', page: 'Travel',
      label: 'Purpose of Trip to the U.S.', def: 'ALIEN IN TRANSIT (C)',
      why: 'Must read exactly as the CEAC dropdown option.' },
    { key: 'specifyPurpose', kind: 'text', page: 'Travel',
      label: 'Specify', def: 'CREWMEMBER IN TRANSIT (C1/D)',
      why: 'The second dropdown, which appears once the purpose above is chosen.' },
    { key: 'specificTravelPlans', kind: 'yesno', page: 'Travel',
      label: 'Have you made specific travel plans?', def: 'NO',
      why: 'No is what the filed sample uses. CEAC then asks only for an intended date ' +
           'and a length of stay, and drops the flight and city questions entirely.' },
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
    { key: 'spouseAddressType', kind: 'text', page: 'Family - Spouse',
      label: "Spouse's Address", def: 'SAME AS HOME ADDRESS',
      why: 'The intake form collects one address and the spouse lives at it. Change it ' +
           'if the spouse lives elsewhere - CEAC then asks for that address in full.' },
    { key: 'fgmcFactSheet', kind: 'checkbox', page: 'Sign and Submit',
      label: 'Certify you have read the FGM/C Fact Sheet - tick',
      def: 'YES', why: 'CEAC will not accept the signature without it. The fact sheet is ' +
                       'linked on that page; read it before signing.' },
    { key: 'preparerAssisted', kind: 'yesno', page: 'Sign and Submit',
      label: 'Did anyone assist you in filling out this application?',
      def: 'NO', why: 'CTI prepares the form from the intake answers the seafarer gave, ' +
                      'which CEAC does not count as an assisting preparer. If someone ' +
                      'else genuinely filled it in for them, answer Yes and name them.' },
    { key: 'passportBookNumberNA', kind: 'checkbox', page: 'Passport',
      label: 'Passport Book Number - tick "Does Not Apply"',
      def: 'YES', why: 'An Indonesian passport has no separate book number, and the filed ' +
                       'sample reads DOES NOT APPLY. It is NOT the passport number - ' +
                       'copying that in there swears to a document number that does not exist.' },
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
      label: 'Where you will stay - street address (line 2)', def: 'SUITE 12' },
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
      label: 'U.S. contact - street address (line 2)', def: 'SUITE 12' },
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
    { key: 'servingAboardVessel', kind: 'yesno', page: 'Crew Visa',
      label: 'Are you serving aboard a seagoing ship or vessel?',
      def: 'YES', why: 'Every applicant CTI files this way is cruise-ship crew. A No hides ' +
                       'the vessel name and IMO fields below it.' },
    { key: 'vesselOwnerCompany', kind: 'text', page: 'Crew Visa',
      label: 'Company that owns the vessel', def: 'CARNIVAL UK',
      why: 'The owner of the ship, not the manning agency and not the seafarer. Change it ' +
           'for a different principal.' },
    { key: 'vesselOwnerPhone', kind: 'text', page: 'Crew Visa',
      label: 'Company Telephone Number', def: '19545685888',
      why: 'The + was dropped after CEAC refused a Primary Phone Number for carrying one: ' +
           '"must be 5-15 digits, with no spaces or hyphens". Same number as the payer ' +
           'block on the Travel page, which never had one.' },
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
    /* Additional Work/Education/Training. Six of the seven questions on that
       page are sworn answers with no column in the sheet, so they live here in
       the open. "Have you traveled to any countries in the last five years?"
       is NOT among them - it comes from column M. */
    { key: 'clanTribe', kind: 'yesno', page: 'Additional Work/Education',
      label: 'Do you belong to a clan or tribe?',
      def: 'NO', why: 'CEAC means a tribal affiliation, not an ethnic group. Change it for ' +
                      'an applicant who does belong to one - a Yes makes CEAC ask for the name.' },
    { key: 'languageSpoken', kind: 'text', page: 'Additional Work/Education',
      label: 'Languages You Speak - first entry', def: 'ENGLISH',
      why: 'Only the first row of the repeater is filled. Extra languages need the ' +
           '"Add Another" button, which is a postback each time - and a burst of those ' +
           'is what got the agent blocked out of CEAC once. Add them by hand.' },
    { key: 'belongedOrganization', kind: 'yesno', page: 'Additional Work/Education',
      label: 'Belonged to, contributed to, or worked for any professional, social or ' +
             'charitable organization?',
      def: 'NO', why: 'A Yes makes CEAC ask for each organisation. Check it per applicant.' },
    { key: 'specializedSkills', kind: 'yesno', page: 'Additional Work/Education',
      label: 'Any specialized skills or training - firearms, explosives, nuclear, ' +
             'biological or chemical?',
      def: 'NO', why: 'STCW safety and firefighting training is NOT what this asks about. ' +
                      'This is a sworn answer and a Yes is read closely - check it for ' +
                      'anyone with a military or security background.' },
    { key: 'militaryService', kind: 'yesno', page: 'Additional Work/Education',
      label: 'Have you ever served in the military?',
      def: 'NO', why: 'A Yes makes CEAC ask for the country, branch, rank and dates. Check ' +
                      'it per applicant - this is a sworn answer.' },
    { key: 'insurgentOrg', kind: 'yesno', page: 'Additional Work/Education',
      label: 'Ever served in or been involved with a paramilitary, vigilante, rebel, ' +
             'guerrilla or insurgent organization?',
      def: 'NO', why: 'A sworn answer with serious consequences if wrong either way. Read it ' +
                      'before clicking Next.' },

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

  const engine = (typeof module !== 'undefined' && module.exports)
    ? require('./constants.js')
    : root.DS160Const;
  engine.register('c1d', C1D);
  if (typeof module !== 'undefined' && module.exports) module.exports = C1D;
})(typeof self !== 'undefined' ? self : this);
