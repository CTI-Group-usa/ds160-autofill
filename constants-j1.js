/* ------------------------------------------------------------------
 * Constant answers - J1 (exchange visitor)
 *
 * Built from ONE filed application (I KETUT JULIANA, printed 30 Jun 2026)
 * plus the 108-column J1 Visa Log. That is the same class of evidence the
 * C1/D pack started from, and it earned the same warning: a printed
 * DS-160 shows what was ANSWERED, not which control produced it.
 * "DOES NOT APPLY" on a print-out is a ticked box, not typed text - this
 * project has already been caught by that once, with usPocOrg.
 *
 * So the entries below that came from the print-out rather than from a
 * rule the user stated are marked in their `why`. Read them before the
 * first J1 application goes out.
 *
 * WHAT IS *NOT* HERE, AND WHY:
 *   - the Crew Visa block. It exists on the form only because the
 *     purpose is C1/D; CEAC never shows it to an exchange visitor.
 *   - the `ssnNA` / `taxIdNA` / `monthlyIncomeNA` PROBLEM, which is solved
 *     elsewhere. Those three are here, ticked by default, but normalize.js
 *     derives 'NO' for whichever column the sheet fills (K, L, AY) and
 *     apply() will not tick over it. So the two packs now give the same
 *     answer to the same question and a leak between them can no longer
 *     hide a number the sheet holds - which was the whole reason for
 *     keeping them separate.
 *   - `languageSpoken`. Column BX collects it.
 *   - the stay address and the U.S. contact. Both are the host employer,
 *     so they are per-applicant, not per-programme.
 *   - `lengthOfStay`. With specific travel plans = YES, CEAC asks for
 *     arrival and departure dates instead of a length.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const J1 = [
    /* ---- identical to C1/D: these are not visa-class questions ------ */
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
      def: 'NO', why: 'Yes if the participant holds PR somewhere other than Indonesia.' },
    /* THE DEFAULT ANSWER, NOT A BLANKET ONE. normalize.js derives 'NO' for
       whichever of these the sheet actually fills - columns K, L and AY - and
       apply() will not tick over a value that is already set, so the number
       the participant gave reaches the form and this box stays clear. What is
       left is the common case: all 69 rows of the export have K and L empty,
       and 15 of them hold 0.00 IDR in AY.

       Carrying them here rather than omitting them is what makes the two packs
       AGREE on these three questions, so leaking one pack onto the other class
       can no longer tick a box over a number. That was the original argument
       for keeping the packs apart; the derivation removes it at the source. */
    { key: 'ssnNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Social Security Number - tick "Does Not Apply"',
      def: 'YES', why: 'Column K collects it "if any" and is empty for every row in the ' +
                       'export - a first-time exchange visitor has never had a U.S. SSN. ' +
                       'Filled automatically, and this box left clear, when K has one.' },
    { key: 'taxIdNA', kind: 'checkbox', page: 'Personal 2',
      label: 'U.S. Taxpayer ID Number - tick "Does Not Apply"',
      def: 'YES', why: 'Column L, same arrangement as the SSN. Only applies to someone who ' +
                       'has filed U.S. tax returns.' },
    { key: 'monthlyIncomeNA', kind: 'checkbox', page: 'Work / Education',
      label: 'Monthly Income in Local Currency - tick "Does Not Apply"',
      def: 'YES', why: 'Column AY, and CEAC only asks it "if employed". A real amount is ' +
                       'filled from the sheet and this box left clear; 0.00 IDR is the ' +
                       'sheet saying there is no salary, which is this tick.' },
    { key: 'mailingSameAsHome', kind: 'yesno', page: 'Address and Phone',
      label: 'Is your mailing address the same as your home address?',
      def: 'YES', why: 'The intake form collects one address.' },
    { key: 'homeCountry', kind: 'text', page: 'Address and Phone',
      label: 'Home address - country/region', def: 'INDONESIA',
      why: 'Every participant CTI files for is resident in Indonesia, and the intake form ' +
           'has one free-text address column with no country field.' },
    { key: 'secondaryPhoneNA', kind: 'checkbox', page: 'Address and Phone',
      label: 'Secondary Phone Number - tick "Does Not Apply"',
      def: 'YES', why: 'The intake form collects one number. The filed sample reads DOES NOT ' +
                       'APPLY here. Untick it and fill the box if a participant gives a second.' },
    { key: 'workPhoneNA', kind: 'checkbox', page: 'Address and Phone',
      label: 'Work Phone Number - tick "Does Not Apply"',
      def: 'YES', why: 'The APPLICANT\'S own work phone. The filed sample reads DOES NOT APPLY. ' +
                       'Not to be confused with the employer\'s phone in the Present Employer ' +
                       'block, which is a different box and does get filled.' },
    { key: 'otherPhones5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Have you used any other phone numbers in the last five years?',
      def: 'NO', why: 'A Yes makes CEAC ask for each number. Check it for anyone who has ' +
                      'changed number recently - it is a sworn answer.' },
    { key: 'otherEmails5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Have you used any other email addresses in the last five years?',
      def: 'NO', why: 'A Yes makes CEAC ask for each address.' },
    { key: 'otherWebsites5y', kind: 'yesno', page: 'Address and Phone',
      label: 'Do you wish to provide information about your presence on any other ' +
             'websites or applications?',
      def: 'NO', why: 'The optional question after the social media platform, which is ' +
                      'filled from columns P and Q.' },
    { key: 'passportType', kind: 'text', page: 'Passport',
      label: 'Passport/Travel Document Type', def: 'REGULAR',
      why: 'An ordinary Indonesian passport.' },
    { key: 'passportBookNumberNA', kind: 'checkbox', page: 'Passport',
      label: 'Passport Book Number - tick "Does Not Apply"',
      def: 'YES', why: 'An Indonesian passport has no separate book number. It is NOT the ' +
                       'passport number - copying that in swears to a document that does ' +
                       'not exist.' },
    { key: 'passportIssuedCountry', kind: 'text', page: 'Passport',
      label: 'Country/Authority that issued the passport', def: 'INDONESIA',
      why: 'Imigrasi issues every passport CTI files with.' },
    { key: 'passportIssuedInCountry', kind: 'text', page: 'Passport',
      label: 'Country/Region where the passport was issued', def: 'INDONESIA',
      why: 'A separate CEAC question from the issuing authority above.' },
    { key: 'spouseAddressType', kind: 'text', page: 'Family - Spouse',
      label: "Spouse's Address", def: 'SAME AS HOME ADDRESS',
      why: 'The intake form collects one address. Change it if the spouse lives elsewhere.' },
    { key: 'fatherInUs', kind: 'yesno', page: 'Family - Relatives',
      label: 'Is your father in the U.S.?',
      def: 'NO', why: 'A Yes makes CEAC ask for that parent\'s status. Check it per applicant.' },
    { key: 'motherInUs', kind: 'yesno', page: 'Family - Relatives',
      label: 'Is your mother in the U.S.?',
      def: 'NO', why: 'Same as the father above.' },
    { key: 'sameCountryResidence', kind: 'yesno', page: 'Previous U.S. Travel',
      label: 'Applying in the same country where the visa was issued, and resident there?',
      def: 'YES', why: 'CTI files in Indonesia for participants resident in Indonesia.' },
    { key: 'immigrantPetition', kind: 'yesno', page: 'Previous U.S. Travel',
      label: 'Has an immigrant petition ever been filed on your behalf?',
      def: 'NO', why: 'A Yes changes how the whole application reads; check it per applicant.' },
    { key: 'attendedEducation', kind: 'yesno', page: 'Previous Work / Education',
      label: 'Have you attended any educational institutions at secondary level or above?',
      def: 'YES', why: 'CEAC counts any secondary school attended for any length of time, and ' +
                       'the J1 form collects junior high, senior high and university.' },
    { key: 'eduCountry', kind: 'text', page: 'Previous Work / Education',
      label: 'Educational institution - country/region', def: 'INDONESIA',
      why: 'Every school in the J1 education columns is Indonesian. The EMPLOYER country is ' +
           'not a constant, for the same reason as on C1/D: it can be abroad.' },
    { key: 'clanTribe', kind: 'yesno', page: 'Additional Work / Education',
      label: 'Do you belong to a clan or tribe?', def: 'NO' },
    { key: 'belongedOrganization', kind: 'yesno', page: 'Additional Work / Education',
      label: 'Have you belonged to, contributed to, or worked for any professional, ' +
             'social or charitable organization?',
      def: 'NO', why: 'The filed sample answers No.' },
    { key: 'specializedSkills', kind: 'yesno', page: 'Additional Work / Education',
      label: 'Do you have specialized skills or training - firearms, explosives, nuclear, ' +
             'biological or chemical?',
      def: 'NO', why: 'Ordinary vocational or hospitality training is NOT what that question ' +
                      'asks about. The temptation to answer Yes on a participant\'s behalf ' +
                      'is real; do not.' },
    { key: 'militaryService', kind: 'yesno', page: 'Additional Work / Education',
      label: 'Have you ever served in the military?', def: 'NO' },
    { key: 'insurgentOrg', kind: 'yesno', page: 'Additional Work / Education',
      label: 'Have you ever served in, been a member of, or been involved with a ' +
             'paramilitary unit, vigilante unit, rebel group, guerrilla group, or ' +
             'insurgent organization?',
      def: 'NO' },
    { key: 'travelCompanions', kind: 'yesno', page: 'Travel Companions',
      label: 'Are there other persons traveling with you?',
      def: 'NO', why: 'The filed sample answers No - participants are placed individually ' +
                      'even when they fly on the same day.' },
    { key: 'fgmcFactSheet', kind: 'checkbox', page: 'Sign and Submit',
      label: 'Certify you have read the FGM/C Fact Sheet - tick',
      def: 'YES', why: 'CEAC will not accept the signature without it. Read the fact sheet ' +
                       'before signing.' },
    { key: 'preparerAssisted', kind: 'yesno', page: 'Sign and Submit',
      label: 'Did anyone assist you in filling out this application?',
      def: 'NO', why: 'CTI transcribes the answers the participant gave on the intake form, ' +
                      'which CEAC does not count as an assisting preparer.' },
    { key: 'securityAllNo', kind: 'yesno', page: 'Security and Background',
      label: 'Answer No to every unanswered Security and Background question',
      def: 'YES', why: 'These are sworn answers. Every one is outlined and listed in the ' +
                       'popup report - read them on the page before pressing Next.' },

    /* ---- WHERE J1 DIVERGES ------------------------------------------ */

    { key: 'purposeOfTrip', kind: 'text', page: 'Travel',
      label: 'Purpose of Trip to the U.S.', def: 'EXCHANGE VISITOR (J)',
      why: 'Must read exactly as the CEAC dropdown option. C1/D uses ALIEN IN TRANSIT (C).' },
    { key: 'specifyPurpose', kind: 'text', page: 'Travel',
      label: 'Specify', def: 'EXCHANGE VISITOR (J1)',
      why: 'The second dropdown, which appears once the purpose above is chosen.' },

    /* THE OPPOSITE OF C1/D, and it changes the page. With Yes, CEAC drops
       the "intended length of stay" question and demands a full itinerary
       instead: arrival date, arrival city, departure date. Those come from
       the DS-2019 programme dates and are per applicant, so they live in
       trip.js - not here. */
    { key: 'specificTravelPlans', kind: 'yesno', page: 'Travel',
      label: 'Have you made specific travel plans?',
      def: 'YES', why: 'The filed sample answers Yes and gives arrival 24 NOV 2026, ' +
                       'departure 23 NOV 2027 - the programme dates from the DS-2019. ' +
                       'C1/D answers No, which hides the itinerary entirely.' },

    /* A DIFFERENT BRANCH, not a different value. C1/D answers
       COMPANY/ORGANIZATION and fills a company block; J1 answers OTHER
       PERSON and CEAC then asks for that person's name, phone, email and
       relationship - which the sheet collects in columns X to AA - plus
       the address question below, which only exists on this branch. */
    { key: 'tripPayer', kind: 'text', page: 'Travel',
      label: 'Person/Entity Paying for Your Trip', def: 'OTHER PERSON',
      why: 'Must read exactly as the CEAC dropdown option. The filed sample is a parent ' +
           'paying; change it if a sponsor or the participant pays.' },
    { key: 'payerAddressSameAsHome', kind: 'yesno', page: 'Travel',
      label: 'Is the address of the party paying the same as your home address?',
      def: 'YES', why: 'Only asked on the OTHER PERSON branch. The sample answers Yes - a ' +
                       'parent at the same address. Check it whenever the payer is not ' +
                       'a household member.' },

    /* The U.S. contact is the HOST EMPLOYER, and the sheet collects the
       name, address, phone and email (columns BZ-CC). Only the
       relationship is not a column, and it is the same on every placement.
       Note the Organization Name IS filled here, where C1/D ticks
       "Do Not Know" - so there is no usPocOrgNA in this pack. */
    /* LEFT UNTICKED, EXPLICITLY. J1 fills the Organization Name - the host
       employer - where C1/D ticks "Do Not Know", so this pack used to omit the
       key entirely. Omitting it is not the same as answering it: the box then
       reported `usPocOrgNA - no value in record` on every J1 row, which is the
       string popup.js reads as "stale record, send it again", and no re-send
       could ever clear it.

       'NO' is the same device as `ssnNA`: it blocks any default and
       `setCheckbox` leaves the box clear. */
    { key: 'usPocOrgNA', kind: 'checkbox', page: 'U.S. Point of Contact',
      label: 'Organization Name - Do Not Know', def: 'NO',
      why: 'J1 fills the host organisation name, so this box stays clear. ' +
           'The name comes from the DS-7002 (Phase Site Name) or is typed in ' +
           'the U.S. contact block for that applicant.' },
    { key: 'usPocRelationship', kind: 'text', page: 'U.S. Point of Contact',
      label: 'U.S. contact - relationship to you', def: 'EMPLOYER',
      why: 'The J1 host is the participant\'s employer. From the filed sample; change it ' +
           'for a school or a host family placement.' },

    /* ---- the Student / Exchange Visitor page ------------------------
       A whole page C1/D never sees. SEVIS ID and Program Number come from
       columns CH and CI. "Additional Point of Contact" takes TWO names in
       the filed sample: the first is CTI Indonesia, identical to the
       manning-agency details in the C1/D pack, and the second comes from
       the sheet (columns CD-CG). */
    { key: 'intendToStudy', kind: 'yesno', page: 'Student / Exchange Visitor',
      label: 'Do you intend to study in the U.S.?',
      def: 'NO', why: 'A J1 trainee or intern is not enrolled in a course of study. Answer ' +
                      'Yes only for a student category, where CEAC then asks for the school.' },
    { key: 'addPoc1Name', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - name', def: 'OKTAVIANIA, DORKAS',
      why: 'CTI Indonesia is the first additional contact on every application. Same person ' +
           'and address as the manning agency block in the C1/D pack.' },
    { key: 'addPoc1Addr1', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - street address',
      def: 'JL. HANG TUAH NO.14B, RENON' },
    { key: 'addPoc1City', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - city', def: 'DENPASAR' },
    { key: 'addPoc1State', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - state/province', def: 'BALI' },
    { key: 'addPoc1Postal', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - postal zone', def: '80239' },
    { key: 'addPoc1Country', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - country/region', def: 'INDONESIA' },
    { key: 'addPoc1Phone', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - telephone', def: '6285333735407',
      why: 'Digits only - CEAC refuses a leading + and any punctuation.' },
    { key: 'addPoc1Email', kind: 'text', page: 'Student / Exchange Visitor',
      label: 'Additional point of contact 1 - email', def: 'indonesia@cti-usa.com' },
  ];

  const engine = (typeof module !== 'undefined' && module.exports)
    ? require('./constants.js')
    : root.DS160Const;
  engine.register('j1', J1);
  if (typeof module !== 'undefined' && module.exports) module.exports = J1;
})(typeof self !== 'undefined' ? self : this);
