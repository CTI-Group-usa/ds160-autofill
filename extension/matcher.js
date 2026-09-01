/* ------------------------------------------------------------------
 * DS-160 field matcher
 *
 * CEAC is ASP.NET WebForms: control ids look like
 *   ctl00_SiteContentPlaceHolder_FormView1_tbxAPP_SURNAME
 * The id fragments are stable and descriptive, so they are the primary
 * signal. Visible label text is the fallback, because Consular Affairs
 * does rename controls between form revisions and we would rather match
 * loosely than silently fill nothing.
 *
 * Nothing here is authoritative: every match is reported back to the
 * agent before anything is submitted, and a per-field override learned
 * in the popup always wins.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  /* Controls we must never touch, whatever they look like. Filling any
     of these would either be pointless or would be us doing something
     only the applicant/agent is allowed to do. */
  const FORBIDDEN = [
    /captcha/i, /codetextbox/i, /securityquest/i, /_answer/i, /tbxanswer/i,
    /ddlLanguage/i,                       // the tooltip language picker
    /sign(and)?submit/i, /btnsign/i, /esign/i, /confirm/i,
    /password/i, /appid/i, /applicationid/i, /retrieve/i,
  ];

  /* key: canonical field on the record (see normalize.js)
     ids:    regexes tried against the control id / name
     labels: regexes tried against the nearest visible label text
     kind:   text | date | yesno   (date/yesno need special handling) */
  const RULES = [
    /* "Surnames" and "Given Names" are the labels on the relatives' boxes too,
       and these rules sit first. The id pass saves them today - FathersSurname
       matches `fatherName` before any label is tried - but if CEAC renames one
       of those controls the label pass would write the SEAFARER's own name into
       his father's box. Same guard, and same reason, as `dob` below. */
    { key: 'surname',        kind: 'text',  ids: [/APP_SURNAME/i], labels: [/^surnames/i],
      not: /FATHER|MOTHER|SPOUSE|POC|CHILD|RELATIVE|SUPERVISOR|AGENCY|agency/i },
    { key: 'givenNames',     kind: 'text',  ids: [/APP_GIVEN_NAME/i], labels: [/^given names/i],
      not: /FATHER|MOTHER|SPOUSE|POC|CHILD|RELATIVE|SUPERVISOR|AGENCY|agency/i },
    { key: 'gender',         kind: 'text',  ids: [/APP_GENDER/i], labels: [/^sex$/i] },
    { key: 'maritalStatus',  kind: 'text',  ids: [/APP_MARITAL_STATUS/i], labels: [/marital status/i] },
    // Relatives get their own DOB controls with the same suffix, so the
    // applicant rule has to stand aside for them.
    { key: 'dob',            kind: 'date',  ids: [/DOB(Day|Month|Year)/i], labels: [/date of birth/i],
      not: /FATHER|MOTHER|SPOUSE|POC|CHILD/i },
    { key: 'pobCity',        kind: 'text',  ids: [/APP_POB_CITY/i], labels: [/city.*birth|birth.*city/i] },
    { key: 'pobProvince',    kind: 'text',  ids: [/APP_POB_ST_PROVINCE/i], labels: [/state.*province.*birth/i] },
    /* `not: /spouse/i`. On a live Spouse page this rule claimed "Spouse's
       Country/Region of Origin (Nationality)" and reported `nationality ->
       INDONESIA`. Both are Indonesian almost always, which is exactly why it
       looked fine - but the spouse's nationality is column AO, a different
       answer, and a foreign spouse would have been sworn to the wrong one. */
    { key: 'nationality',    kind: 'text',  ids: [/APP_POB_CNTRY/i, /APP_NATL/i],
      labels: [/country.*region of (birth|origin)|nationality/i], not: /spouse/i },
    { key: 'nationalId',     kind: 'text',  ids: [/APP_NATIONAL_ID/i], labels: [/national identification/i] },

    // Constant answers (see constants.js) - questions the intake form
    // never asks. The NA checkbox must not swallow the native-name text
    // box next to it, hence the explicit _NA anchoring.
    // The filed sample writes the Latin full name in this box and leaves
    // the "Does Not Apply" checkbox alone, so nothing matches that box.
    { key: 'nativeName',          kind: 'text', ids: [/FULL_NAME_NATIVE/i],
      labels: [/full name in native alphabet/i], not: /_NA\b/ },
    { key: 'otherNamesUsed',      kind: 'yesno', ids: [/OTHER_NAMES_IND/i, /rblOtherNames/i],
      labels: [/ever used other names/i] },
    { key: 'telecode',            kind: 'yesno', ids: [/TELECODE_QUESTION_IND/i, /rblTelecodeQuestion/i],
      labels: [/telecode that represents your name/i] },
    { key: 'otherNationality',    kind: 'yesno', ids: [/APP_OTH_NATL_IND/i],
      labels: [/nationality other than the one/i] },
    { key: 'otherCountryPermRes', kind: 'yesno',
      ids: [/APP_OTH_PERM_RESIDENT_IND/i, /PERM_RESIDENT/i, /PermResOther/i],
      labels: [/permanent resident of a country/i] },
    // Both boxes just say "Does Not Apply", so they are told apart by the
    // field name that questionText() picks up from the row above.
    { key: 'ssnNA',   kind: 'checkbox', ids: [/APP_SSN_NA\b/i, /SSN.*_NA\b/i],
      labels: [/social security number/i] },
    { key: 'taxIdNA', kind: 'checkbox', ids: [/APP_TAX_ID_NA\b/i, /TAX_ID.*_NA\b/i],
      labels: [/taxpayer id/i] },
    /* The live page left this unanswered. The label matches, so widen the
       id: CEAC also writes it without underscores (rblMailingAddrSame). */
    { key: 'mailingSameAsHome',   kind: 'yesno',
      ids: [/MAILING_ADDR_SAME/i, /MailingAddrSame/i, /MAILING.*SAME/i],
      labels: [/mailing address.*same as.*home address/i] },
    { key: 'immediateRelativesUS', kind: 'yesno', ids: [/US_IMMED_RELATIVE_IND/i, /US_IMMEDIATE_RELATIVE/i],
      labels: [/immediate relatives.*united states/i] },
    { key: 'otherRelativesUS',    kind: 'yesno', ids: [/US_OTHER_RELATIVE_IND/i],
      labels: [/other relatives in the united states/i] },

    /* "Street Address (Line 1)" appears in at least four blocks, so the
       rule is pinned to its own block and the seafarer's home address can
       never land in the U.S. stay address again.

       Both address lines take the same record field; addressHalf() decides
       which piece each one gets. Before this, Line 2 matched on the label
       "Street Address (Line 2)" and received the whole address a second
       time, while Line 1 was over CEAC's limit and clipped. */
    { key: 'homeAddress', kind: 'text', ids: [/APP_ADDR_LN[12]/i], labels: [/street address/i],
      not: /will stay|contact|employer|school|paying|mailing/i },
    /* The home country is a constant - the intake form has no country field.
       "Country/Region" is bare and reused by several blocks, so a label match
       has to see the Home Address heading. `must` gates the id too, which is
       the safe side of the trade: an unfilled dropdown is now reported, a
       wrongly filled one would not be. `nationality` sits earlier in this
       list, so Personal 2 still wins there. */
    { key: 'homeCountry', kind: 'text', ids: [/APP_ADDR_CNTRY/i],
      labels: [/^country\s*\/?\s*region$/i], must: /home address/i },
    /* None of these three has a source: the sheet holds one free-text address
       column and the agent arranges City, State/Province and Postal by hand.
       They are named here only so the report says "no value in record" and
       points at the sheet, rather than "not recognised" and blames the rules.

       Id only, no label. "City" and "State/Province" are word-for-word the
       same in the U.S. stay block, and a bare one outside any block must
       stay unclaimed - writing an Indonesian city into the U.S. address is
       the bug this codebase already had once. */
    { key: 'homeCity',   kind: 'text', ids: [/APP_ADDR_CITY/i] },
    { key: 'homeState',  kind: 'text', ids: [/APP_ADDR_STATE/i] },
    { key: 'homePostal', kind: 'text', ids: [/APP_ADDR_POSTAL/i] },
    { key: 'phone',          kind: 'text',  ids: [/APP_HOME_TEL/i, /PRIMARY.*PHONE/i], labels: [/primary phone/i] },
    /* One number on the intake form, so the other two are ticked away. The
       "Does Not Apply" label is identical on both, and on the State and
       Postal boxes further up the page - only the block tells them apart. */
    { key: 'secondaryPhoneNA', kind: 'checkbox',
      ids: [/APP_(MOBILE|SEC)_TEL_NA/i, /SECONDARY.*TEL.*_NA/i],
      labels: [/does not apply/i], must: /secondary phone/i },
    { key: 'workPhoneNA', kind: 'checkbox',
      ids: [/APP_BUS_TEL_NA/i, /WORK.*TEL.*_NA/i],
      labels: [/does not apply/i], must: /work phone/i },
    /* The live page reports these three with an EMPTY question text - the
       label came back as just "Yes" - so the label regexes never fire and the
       id is the only signal. CEAC names them in short PascalCase here
       (rblAddPhone), not the APP_*_IND style used elsewhere.

       No \b after the name: the ids end in _0 / _1 and an underscore IS a
       word character, so \b never matches there. */
    { key: 'otherPhones5y', kind: 'yesno', ids: [/rblAddPhone/i, /ADD_PHONE_IND/i, /OTHER_PHONE/i],
      labels: [/other phone numbers in the last five years/i] },
    { key: 'otherEmails5y', kind: 'yesno', ids: [/rblAddEmail/i, /ADD_EMAIL_IND/i, /OTHER_EMAIL/i],
      labels: [/other email addresses in the last five years/i] },
    { key: 'otherWebsites5y', kind: 'yesno', ids: [/rblAddSocial/i, /ADD_SOCIAL_IND/i, /OTHER_WEBSITE/i],
      labels: [/presence on any other websites/i, /other websites or applications/i] },
    { key: 'email',          kind: 'text',  ids: [/APP_EMAIL_ADDR/i], labels: [/^e-?mail address/i] },
    { key: 'socialPlatform', kind: 'text',  ids: [/SOCIAL_MEDIA_PROVIDER/i, /ddlSocialMedia/i], labels: [/social media platform/i] },
    { key: 'socialHandle',   kind: 'text',  ids: [/SOCIAL_MEDIA_IDENT/i, /tbxSocialMediaIdent/i], labels: [/social media identifier/i] },

    { key: 'passportType',       kind: 'text', ids: [/PPT_TYPE/i],
      labels: [/passport.*travel document type/i] },
    /* "Passport Book Number" satisfies a loose /passport.*number/ too, so this
       rule copied the passport number into it on a live page - a document
       number sworn to that does not exist. The box is left empty and the tick
       beside it goes on (`passportBookNumberNA`); LEAVE_BLANK keeps it out of
       the unrecognised list.

       The fix is an ANCHORED LABEL plus a lookahead on the id - NOT a
       `not: /book/i`, which was tried first and broke the rule outright: `not`
       is tested against the section, and this block's text contains "Passport
       Book Number", so passportNumber excluded ITSELF. Second time in one day
       - a `not` guard is for other blocks, never for a neighbour. */
    { key: 'passportNumber',     kind: 'text',
      ids: [/PPT_NUM(?!.*BOOK)/i, /PPTNum(?!.*BOOK)/i],
      labels: [/^passport\s*\/?\s*travel document number/i, /^passport number$/i,
               /^enter your passport\s*\/?\s*travel document number/i] },
    { key: 'passportBookNumberNA', kind: 'checkbox',
      ids: [/PPT_BOOK.*NA/i, /PassportBookNum.*(NA|Unknown)/i],
      labels: [/^does not apply/i], must: /book number/i },
    /* Two different countries: the authority that issued the document, and
       the place it was physically issued. Both Indonesia here. */
    { key: 'passportIssuedCountry',   kind: 'text', ids: [/PPT_ISSUED_CNTRY/i],
      labels: [/country.*authority that issued/i] },
    { key: 'passportIssuePlace', kind: 'text', ids: [/PPT_ISSUED_IN_CITY/i], labels: [/city.*issuance/i] },
    /* No source on the sheet - column AF is one free-text place. Id only, so
       the report says "no value in record" instead of blaming the rules. */
    { key: 'passportIssuedState',     kind: 'text', ids: [/PPT_ISSUED_IN_STATE/i] },
    { key: 'passportIssuedInCountry', kind: 'text', ids: [/PPT_ISSUED_IN_CNTRY/i],
      labels: [/^country\s*\/?\s*region$/i], must: /issuance|issued/i },
    /* Same _DTE infix that hid PREV_VISA_ISSUED: the live ids are
       PPT_ISSUED_DTEDay and PPT_EXPIRE_DTEDay. Only the Year boxes were
       being filled, which is why the page showed a bare 2023 / 2033. */
    { key: 'passportIssued',     kind: 'date', ids: [/PPT_ISSUED_?(DTE)?(Day|Month|Year)/i],
      labels: [/issuance date/i] },
    { key: 'passportExpiry',     kind: 'date', ids: [/PPT_EXPIRE_?(DTE)?(Day|Month|Year)/i],
      labels: [/expiration date/i], not: /_NA\b/ },

    // Travel page. The visible labels here are clean and distinct, so
    // they carry more weight than the id guesses.
    { key: 'purposeOfTrip',  kind: 'text',  ids: [/PurposeOfTrip/i, /PURPOSE_OF_TRIP/i],
      labels: [/^purpose of trip/i], not: /Specify|OTHER/i },
    { key: 'specifyPurpose', kind: 'text',  ids: [/OtherPurpose/i, /ddlOtherPurpose/i],
      labels: [/^specify$/i] },
    { key: 'specificTravelPlans', kind: 'yesno', ids: [/SpecificTravel/i, /TRAVEL_PLANS_IND/i],
      labels: [/made specific travel plans/i] },
    { key: 'arrivalDate',    kind: 'date',
      // TRAVEL_DTE* are the real CEAC ids, taken from a live page.
      ids: [/TRAVEL_DTE(Day|Month|Year)/i, /ARRIVAL_US_DTE(Day|Month|Year)/i,
            /ARRIVE_(Day|Month|Year)/i, /DTEIntendedDate/i],
      labels: [/date of arrival in u\.?s|intended date of arrival/i] },
    // With travel plans answered No, CEAC replaces the itinerary with an
    // intended date plus a length of stay: a number and a unit dropdown
    // that share one label, told apart by the control being a <select>.
    // The `PREV` guard matters: Previous U.S. Travel has its own length of
    // stay, and /LOS_CD/ below matches PREV_US_VISIT_LOS_CD just as happily.
    // Without it the intended stay for this trip (8 MONTH(S)) lands in the
    // box describing a visit that happened years ago.
    { key: 'lengthOfStay',     kind: 'text', tag: 'input',
      ids: [/TRAVEL_LOS\b/i, /STAY_LENGTH\b/i],
      labels: [/intended length of stay/i], not: /_CD\b|UNIT|PREV/i },
    { key: 'lengthOfStayUnit', kind: 'text', tag: 'select',
      ids: [/TRAVEL_LOS_CD/i, /LOS_CD/i, /STAY_LENGTH_UNIT/i],
      labels: [/intended length of stay/i], not: /PREV/i },
    { key: 'arrivalFlight',  kind: 'text',  ids: [/ARRIVAL_FLIGHT/i], labels: [/arrival flight/i] },
    { key: 'arrivalCity',    kind: 'text',  ids: [/ArriveCity/i, /ARRIVAL_CITY/i], labels: [/^arrival city/i] },
    { key: 'departureDate',  kind: 'date',
      ids: [/DEPARTURE_US_DTE(Day|Month|Year)/i, /DEPART_(Day|Month|Year)/i],
      labels: [/date of departure from u\.?s/i] },
    { key: 'departureFlight', kind: 'text', ids: [/DEPARTURE_FLIGHT/i], labels: [/departure flight/i] },
    { key: 'departureCity',  kind: 'text',  ids: [/DepartCity/i, /DEPARTURE_CITY/i], labels: [/^departure city/i] },
    { key: 'stayAddr1', kind: 'text', ids: [/STAY_ADDR_LN1/i],
      labels: [/street address \(line ?1\)|^street address$/i], must: /will stay/i },
    { key: 'stayAddr2', kind: 'text', ids: [/STAY_ADDR_LN2/i],
      labels: [/street address \(line ?2\)/i], must: /will stay/i },
    { key: 'stayCity',  kind: 'text', ids: [/STAY_ADDR_CITY/i], labels: [/^city$/i], must: /will stay/i },
    { key: 'stayState', kind: 'text', ids: [/STAY_ADDR_STATE/i], labels: [/^state$/i], must: /will stay/i },
    { key: 'stayZip',   kind: 'text', ids: [/STAY_ADDR_POSTAL/i], labels: [/zip code|postal/i], must: /will stay/i },
    /* The gate for the vessel block. A No hides the name and IMO fields, so it
       lands on its own pass. `kind: 'yesno'` also keeps it clear of the two
       text rules below, whose ids start with the same SEAGOING fragment. */
    { key: 'servingAboardVessel', kind: 'yesno',
      ids: [/VesselWorkQuestion/i, /VESSEL_WORK/i,
            /SEAGOING.*IND/i, /VESSEL_IND/i, /rblSeagoing/i],
      labels: [/serving aboard a seagoing/i] },
    /* Three separate companies appear on this form and none of them is this
       one: the manning agency (CTI), the payer (Travel page) and the seafarer's
       own employer. This is the OWNER of the ship. Its label contains the word
       "vessel", so `vesselName` below is anchored to keep off it. */
    /* Phone first, and the company id carries a negative LOOKAHEAD rather than
       a `not` guard. The owner's two boxes share a prefix - VESSEL_OWNER_NAME
       and VESSEL_OWNER_TEL - so the company rule claimed the phone box and
       wrote "CARNIVAL UK" into it. A `not: /TEL|PHONE/i` cannot fix that:
       `not` is tested against the section too, and this block's text contains
       "Company Telephone Number", so it would exclude the company box as well.
       A lookahead only ever looks at the id. */
    { key: 'vesselOwnerPhone', kind: 'text',
      ids: [/VESSEL_OWNER.*(TEL|PHONE)/i, /SHIP_OWNER.*(TEL|PHONE)/i],
      labels: [/^company telephone number$/i] },
    { key: 'vesselOwnerCompany', kind: 'text',
      ids: [/VESSEL_OWNER(?!.*(?:TEL|PHONE))/i, /OWNS.*(VESSEL|AIRCRAFT)/i,
            /SHIP_OWNER(?!.*(?:TEL|PHONE))/i],
      labels: [/name of company that owns/i] },
    /* NEVER name a sibling field in a `not` guard. `vesselName` used to carry
       `not: /IDENT|IMO|NUMBER/i` to stay off the IMO box - but `not` is tested
       against the SECTION too, and this block's text contains "Seagoing
       Ship/Vessel Identification Number". The rule was excluding itself on
       every real page, silently.

       The ids separate these two cleanly on their own: SEAGOING_VESSEL_NAME
       holds no IDENT or NUM, and SEAGOING_VESSEL_IDENT holds no NAME. The IMO
       rule goes first so its id wins outright. */
    { key: 'vesselImo',      kind: 'text',  ids: [/SEAGOING.*(IDENT|NUM)/i, /VESSEL_ID/i],
      labels: [/vessel identification number/i] },
    { key: 'vesselName',     kind: 'text',  ids: [/SEAGOING.*NAME/i, /tbxSHIP/i],
      labels: [/seagoing ship.*vessel name|^vessel name$/i] },
    /* The manning agency block. Ids are best guesses from CEAC's naming - the
       labels are what these will match on until a live Fill report pins them,
       and every one of them is scoped to the agency block by `must`, because
       "City", "State/Province" and "Telephone Number" are word-for-word the
       same in four other blocks. */
    { key: 'usedAgency', kind: 'yesno',
      ids: [/PositionThroughAgency/i, /POSITION_THROUGH_AGENCY/i,
            /AGENCY_IND/i, /RECRUIT.*IND/i, /rblAgency/i],
      labels: [/recruiting.*manning.*crewing agency/i, /using a recruit/i] },
    { key: 'agencyName', kind: 'text', ids: [/AGENCY_NAME/i, /tbxAgencyName/i],
      labels: [/^agency name/i] },
    { key: 'agencyContactSurname', kind: 'text', ids: [/AGENCY.*(POC|CONTACT).*SURNAME/i],
      labels: [/^surnames/i], must: /agency/i },
    { key: 'agencyContactGiven', kind: 'text', ids: [/AGENCY.*(POC|CONTACT).*GIVEN/i],
      labels: [/^given names/i], must: /agency/i },
    { key: 'agencyAddr1', kind: 'text', ids: [/AGENCY.*ADDR_?LN1/i, /AGENCY.*STREET/i],
      labels: [/street address/i], must: /agency/i },
    { key: 'agencyCity', kind: 'text', ids: [/AGENCY.*ADDR.*CITY/i],
      labels: [/^city$/i], must: /agency/i },
    { key: 'agencyState', kind: 'text', ids: [/AGENCY.*ADDR.*(STATE|PROVINCE)/i],
      labels: [/^state\s*\/?\s*province$/i], must: /agency/i },
    { key: 'agencyPostal', kind: 'text', ids: [/AGENCY.*ADDR.*POSTAL/i],
      labels: [/^postal zone/i], must: /agency/i },
    { key: 'agencyCountry', kind: 'text', ids: [/AGENCY.*ADDR.*CNTRY/i],
      labels: [/^country\s*\/?\s*region$/i], must: /agency/i },
    { key: 'agencyPhone', kind: 'text', ids: [/AGENCY.*TEL/i, /AGENCY.*PHONE/i],
      labels: [/^telephone number/i], must: /agency/i },
    /* The sheet's own `jobTitle` (column AY, the present employer's position)
       claimed this box on a live page and wrote COMMIS into it, where the
       supporting letter says COMMIS DE CUISINE. The label rule here matches
       the live wording exactly - what beat it is that the ID PASS RUNS FIRST
       across every rule, so `jobTitle`'s /JOB_TITLE/ id matched before any
       label was tried. `jobTitle` now carries `not: /aboard/i` for it. */
    { key: 'jobTitleAboard', kind: 'text',
      ids: [/CREW.?JOB.?TITLE/i, /tbxJobTitleAboard/i],
      labels: [/specific job title aboard/i] },
    { key: 'tripPayer',      kind: 'text',  ids: [/WHO_IS_PAYING/i], labels: [/paying for your trip/i] },

    // Person/entity paying for the trip - a whole block appears once the
    // answer is COMPANY/ORGANIZATION.
    /* Every one of these carries a label rule as well as an id, pinned to
       the payer block. Six of them used to be id-only, on ids that were
       guessed - if CEAC spells them differently the whole block fills
       nothing and says nothing. "City" and "State/Province" are far too
       common to match on their own, which is what `must` is for. */
    /* Real ids, read off a live page. The labels in this block come back
       empty - deriveLabel finds nothing for them - so the id is the only
       signal that works here and every guess before this one missed.
       The label rules stay as a fallback, pinned by must:/pay/ because
       City, State/Province and Country/Region are word for word the same
       in the U.S. contact block on the same page. */
    { key: 'payerCompany',      kind: 'text', ids: [/tbxPayerName/i, /PAYER_NAME/i, /PayerCompany/i],
      labels: [/company.*organization paying/i], must: /pay/i },
    { key: 'payerPhone',        kind: 'text', ids: [/tbxPayerPhone/i, /PAYER_TEL/i],
      labels: [/^telephone number$/i], must: /pay/i },
    { key: 'payerRelationship', kind: 'text', ids: [/tbxCompanyRelation/i, /PAYER_REL/i],
      labels: [/^relationship to you$/i], must: /pay|relation/i },
    { key: 'payerAddr1',        kind: 'text', ids: [/tbxPayerStreetAddress1/i, /PAYER_ADDR_LN1/i],
      labels: [/address of company.*paying|^street address \(line ?1\)/i], must: /pay/i },
    { key: 'payerAddr2',        kind: 'text', ids: [/tbxPayerStreetAddress2/i, /PAYER_ADDR_LN2/i],
      labels: [/^street address \(line ?2\)/i], must: /pay/i },
    { key: 'payerCity',         kind: 'text', ids: [/tbxPayerCity/i, /PAYER_ADDR_CITY/i],
      labels: [/^city$/i], must: /pay/i },
    { key: 'payerState',        kind: 'text', ids: [/tbxPayerStateProvince/i, /PAYER_ADDR_STATE/i],
      labels: [/^state\/?province$|^state$/i], must: /pay/i, not: /DNA|_NA\b/i },
    { key: 'payerZip',          kind: 'text', ids: [/tbxPayerPostalZIPCode/i, /PAYER_ADDR_POSTAL/i],
      labels: [/postal zone|zip code/i], must: /pay/i, not: /DNA|_NA\b/i },
    { key: 'payerCountry',      kind: 'text', ids: [/ddlPayerCountry/i, /PAYER_ADDR_CNTRY/i],
      labels: [/country\/?region/i], must: /pay/i },
    { key: 'travelCompanions',  kind: 'yesno', ids: [/OTHER_PERS_TRAVELING/i, /TravelingWith/i],
      labels: [/other persons traveling with you/i] },

    // U.S. point of contact. Surname and given name are separate boxes,
    // so they are separate answers: "XAVIER, MARCOS" must not be split
    // by guessing where the surname ends.
    { key: 'usPocSurname',      kind: 'text', ids: [/POC_SURNAME/i], labels: [/surnames of contact/i] },
    { key: 'usPocGiven',        kind: 'text', ids: [/POC_GIVEN_NAME/i], labels: [/given names of contact/i] },
    /* The text box is left EMPTY and the box beside it ticked - see
       usPocOrgNA in constants.js. `not: /_NA\b/` keeps the text rule off the
       checkbox's id, and the checkbox rule is pinned to this row because
       "Do Not Know" also appears beside the previous visa number. */
    { key: 'usPocOrg',          kind: 'text', ids: [/POC_ORGANIZATION/i],
      labels: [/organization name/i], not: /_NA\b/ },
    /* Id ONLY. There are two "Do Not Know" boxes in this block - one for the
       contact person's name, one for the organisation - and the block is
       titled "Contact Person or Organization in the United States", so the
       word "Organization" is in the context of BOTH. A label rule guarded by
       `must: /organization/i` therefore ticked the person's box too and
       greyed out the Surnames and Given Names we do fill.

       If CEAC renames this control the box goes unticked and the report says
       so, which is the right way round: a wrongly ticked box is a wrong sworn
       answer, a missed one is a visible gap. */
    { key: 'usPocOrgNA',        kind: 'checkbox', ids: [/POC_ORG.*_NA/i] },
    { key: 'usPocRelationship', kind: 'text', ids: [/POC_REL_TO_APP/i] },
    { key: 'usPocAddr1',        kind: 'text', ids: [/POC_ADDR_LN1/i],
      labels: [/street address \(line ?1\)|u\.?s\.? contact.*address/i], must: /contact/i },
    { key: 'usPocAddr2',        kind: 'text', ids: [/POC_ADDR_LN2/i],
      labels: [/street address \(line ?2\)/i], must: /contact/i },
    { key: 'usPocCity',         kind: 'text', ids: [/POC_ADDR_CITY/i],
      labels: [/^city$/i], must: /contact/i },
    { key: 'usPocState',        kind: 'text', ids: [/POC_ADDR_STATE/i],
      labels: [/^state$/i], must: /contact/i },
    { key: 'usPocZip',          kind: 'text', ids: [/POC_ADDR_POSTAL/i],
      labels: [/zip code|postal/i], must: /contact/i },
    { key: 'usPocPhone',        kind: 'text', ids: [/POC_HOME_TEL/i], labels: [/phone number.*contact/i] },
    { key: 'usPocEmail',        kind: 'text', ids: [/POC_EMAIL_ADDR/i], labels: [/e-?mail address.*contact/i] },

    /* CEAC writes the parents' controls in the PascalCase plural here -
       ddlFathersDOBDay, not FATHER_DOBDay - so the DOB boxes came back
       unrecognised while the names filled on their labels. Accept both
       spellings; `dob` above still stands aside on its FATHER|MOTHER guard,
       which is the only reason the applicant's own birthday was not written
       into them. */
    { key: 'fatherName',   kind: 'text', ids: [/FATHERS?_?(SURNAME|GIVEN_?NAME)/i],
      labels: [/father.*(surname|given name)/i], not: /UNK|_NA\b/i },
    /* Ticked instead of typing "FNU" when the parent has a single name. The
       live id for these boxes is not known yet - they are silenced from the
       report by isDoesNotApply(), and now appear under "Left blank on
       purpose" with their ids, so one Fill report will settle it. */
    { key: 'fatherGivenNA', kind: 'checkbox',
      ids: [/FATHERS?_?GIVEN_?NAME.*(UNK|_NA)/i, /FATHER.*GIVEN.*(UNK|_NA)/i] },
    { key: 'fatherDob',    kind: 'date', ids: [/FATHERS?_?DOB(Day|Month|Year)/i],
      labels: [/father.*date of birth/i] },
    { key: 'fatherInUs',   kind: 'yesno', ids: [/FATHERS?_?LIVE_IN_US/i],
      labels: [/is your father in the u\.?s/i] },
    { key: 'motherName',   kind: 'text', ids: [/MOTHERS?_?(SURNAME|GIVEN_?NAME)/i],
      labels: [/mother.*(surname|given name)/i], not: /UNK|_NA\b/i },
    { key: 'motherGivenNA', kind: 'checkbox',
      ids: [/MOTHERS?_?GIVEN_?NAME.*(UNK|_NA)/i, /MOTHER.*GIVEN.*(UNK|_NA)/i] },
    { key: 'motherDob',    kind: 'date', ids: [/MOTHERS?_?DOB(Day|Month|Year)/i],
      labels: [/mother.*date of birth/i] },
    { key: 'motherInUs',   kind: 'yesno', ids: [/MOTHERS?_?LIVE_IN_US/i],
      labels: [/is your mother in the u\.?s/i] },

    /* Family Information: Spouse. Six of its controls came back unrecognised
       from a live page, and three of them are the reason this block needs its
       own `must`: the spouse's date of birth is `ddlDOBDay` / `ddlDOBMonth` /
       `tbxDOBYear` - BYTE FOR BYTE THE APPLICANT'S OWN IDS. The applicant's
       `dob` rule stands aside correctly (its `not: /SPOUSE/i` guard), and then
       nothing claimed them at all. Only the block text separates the two, so
       the second rule below is `must: /spouse/i` on a bare DOB id. */
    { key: 'spouseName',        kind: 'text',
      ids: [/SPOUSES?_?(SURNAME|GIVEN_?NAME)/i, /Spouse(Surname|GivenName)/i],
      labels: [/spouse.*(surname|given name)/i] },
    { key: 'spouseDob',         kind: 'date', ids: [/SPOUSES?_?DOB(Day|Month|Year)/i],
      labels: [/spouse.*date of birth/i] },
    { key: 'spouseDob',         kind: 'date', ids: [/DOB(Day|Month|Year)/i],
      labels: [], must: /spouse/i, not: /APP_DOB/i },
    { key: 'spouseNationality', kind: 'text',
      ids: [/SPOUSE_NATL/i, /Spouse.*Nationality/i],
      labels: [/spouse.*nationality/i, /country\s*\/?\s*region of origin/i],
      must: /spouse/i, not: /place of birth|POB/i },
    /* TWO RULES PER KEY, and the id one carries no `must`. A `must` gates the
       id path as well as the label path, and CEAC's Place of Birth block is a
       bare <div> whose text `blockLabel()` does not reach - it came back with
       NO SECTION AT ALL on the live page, so a guarded rule could never fire
       and both boxes were reported unrecognised. The ids say "spouse" and
       "POB" themselves, so they need no guard; the bare labels "City" and
       "Country/Region" absolutely do. Same arrangement as `eduCountry`. */
    { key: 'spousePob',         kind: 'text', ids: [/SPOUSE_?POB_?CITY(?!.*NA)/i] },
    { key: 'spousePob',         kind: 'text', ids: [],
      labels: [/spouse.*city of birth/i, /^city$/i],
      must: /spouse/i, not: /_NA\b|country/i },
    /* Column AO answers this AND the spouse's nationality - see normalize.js. */
    { key: 'spousePobCountry',  kind: 'text', ids: [/SPOUSE_?POB_?(CNTRY|COUNTRY)/i] },
    { key: 'spousePobCountry',  kind: 'text', ids: [],
      labels: [/^country\s*\/?\s*region$/i],
      must: /spouse/i, not: /_IND|city/i },
    { key: 'spouseAddressType', kind: 'text',
      ids: [/Spouse.*Address.*Type/i, /SPOUSE_ADDR_TYPE/i],
      labels: [/^spouse.s address$/i] },

    { key: 'employerName',    kind: 'text', ids: [/EmpSchName/i, /PRES_EMPL_NAME/i], labels: [/present employer|school name/i] },
    /* Both lines take the same field; addressHalf() splits it on a word at
       Line 1's real maxlength, so a long address overflows instead of being
       clipped away. See homeAddress for the same arrangement. */
    { key: 'employerAddress', kind: 'text', ids: [/EmpSchAddr[12]/i],
      labels: [/employer.*street address/i] },
    /* No column in the sheet for these three - one free-text address, same as
       the home address. Named so the report says "no value in record" and
       points at the sheet rather than blaming the rules. Id only: "City" and
       "State/Province" are identical in four other blocks. */
    { key: 'employerCity',   kind: 'text', ids: [/EmpSch(Addr)?City/i] },
    { key: 'employerState',  kind: 'text', ids: [/EmpSch(Addr)?State/i], not: /_?NA\b/i },
    { key: 'employerPostal', kind: 'text', ids: [/EmpSch(Addr)?Postal/i], not: /_?NA\b/i },
    /* The live label is a bare "Phone Number" - the rule wanted "telephone
       number ... employer" and so never fired, leaving column AW on the floor.
       A bare "Phone Number" also labels the U.S. contact box, so the rule is
       pinned to this block. */
    { key: 'employerPhone',   kind: 'text',
      ids: [/WorkEducTel/i, /EmpSchTel/i, /EmpSch(Addr)?(Tel|Phone)/i],
      labels: [/telephone number.*employer/i, /^phone number$/i],
      must: /employer|school/i },
    { key: 'employerStart',   kind: 'date', ids: [/EmpDateFrom(Day|Month|Year)/i], labels: [/start date/i] },
    /* "Country/Region" is bare and shared by the home address, the passport
       issue block, the manning agency and this one, so the label match has to
       see the "Present employer or school address" heading. `must` gates the
       id too - an unfilled dropdown is reported, a wrongly filled one is not. */
    { key: 'employerCountry', kind: 'text',
      ids: [/EmpSch.*(CNTRY|COUNTRY)/i, /EMPLOYER.*CNTRY/i, /WorkEduc.*CNTRY/i],
      /* `must` is tested against id + name + label + section together, so
         "school" in it was satisfied by the education block's OWN id,
         ddlSchoolCountry - and this rule, which has no constant behind it,
         claimed that box and left it blank. The Present block's heading says
         "Present employer or school address", so "employer" alone pins it. */
      labels: [/^country\s*\/?\s*region$/i], must: /employer/i,
      not: /institution|attendance/i },
    /* `not: /aboard/i` keeps the sheet's position out of the Crew Visa page's
       "Specific job title aboard aircraft or vessel", which is the supporting
       letter's `jobTitleAboard`. The word is in that box's own label, so this
       holds even where `blockLabel()` gives no section at all. Present
       Employer never says "aboard". */
    { key: 'jobTitle',        kind: 'text', ids: [/tbxJobTitle/i, /JOB_TITLE/i],
      labels: [/job title/i], not: /aboard/i },
    /* The box is left empty and the one beside it ticked - the intake form has
       no salary column, and CEAC only asks "if employed". `not` keeps the text
       rule off the checkbox's id; `must` keeps the checkbox rule off the four
       other "Does Not Apply" boxes on this page. */
    { key: 'monthlyIncome',   kind: 'text', ids: [/MonthlySalary/i, /MONTHLY_SALARY/i],
      labels: [/monthly (income|salary)/i], not: /_NA\b|NA$/i },
    { key: 'monthlyIncomeNA', kind: 'checkbox',
      ids: [/MONTHLY_SALARY.*_?NA/i, /MonthlySalary.*NA/i],
      labels: [/does not apply/i], must: /monthly (income|salary)/i },

    /* The two questions that gate this whole page. Neither had a rule, so both
       came back unanswered and the page could not be completed. Both are
       postbacks - a Yes reveals its block - so they land one per pass. */
    { key: 'prevEmployed',        kind: 'yesno',
      ids: [/rblPreviouslyEmployed/i, /PREV_EMPL_IND/i],
      labels: [/were you previously employed/i] },
    { key: 'attendedEducation',   kind: 'yesno',
      ids: [/rblOtherEduc/i, /OTHER_EDUC_IND/i],
      labels: [/attended any educational institutions/i] },
    { key: 'prevEmployerName',    kind: 'text', ids: [/PrevEmplName/i], labels: [/employer name/i] },
    { key: 'prevEmployerAddress', kind: 'text', ids: [/PrevEmplAddr1/i], labels: [/employer street address/i] },
    /* A bare "Telephone Number" label reaches four blocks. Unscoped, this rule
       claimed the manning agency's phone box and would have written a previous
       employer's number there. `must` gates the id too, which is the safe side:
       an unfilled box is reported, a wrongly filled one is not. */
    { key: 'prevEmployerPhone',   kind: 'text', ids: [/PrevEmplTel/i],
      labels: [/telephone number/i], must: /previous|prevempl/i },
    { key: 'prevJobTitle',        kind: 'text', ids: [/PrevEmplJobTitle/i], labels: [/job title/i] },
    { key: 'prevSupervisor',      kind: 'text', ids: [/PrevSupervisor(Surname|GivenName)/i], labels: [/supervisor/i] },
    { key: 'prevStart',           kind: 'date', ids: [/PrevEmplDateFrom(Day|Month|Year)/i], labels: [/employment date from/i] },
    { key: 'prevEnd',             kind: 'date', ids: [/PrevEmplDateTo(Day|Month|Year)/i], labels: [/employment date to/i] },

    /* CEAC's education block is ONE set of fields and the sheet carries two
       candidate blocks, so these point at the keys normalize.js derives from
       column BI - not at the high-school columns directly, which is what they
       used to do. See `_eduSource` for which block was chosen. */
    { key: 'eduName',    kind: 'text', ids: [/SchoolName/i, /EducInstName/i],
      labels: [/name of institution/i] },
    { key: 'eduAddress', kind: 'text', ids: [/SchoolAddr[12]/i, /EducInstAddr/i],
      labels: [/institution.*street address/i] },
    { key: 'eduCourse',  kind: 'text', ids: [/SchoolCourseOfStudy/i, /CourseOfStudy/i],
      labels: [/course of study/i] },
    /* The FIFTH block with a bare "Country/Region" label. The school is always
       in Indonesia, so unlike `employerCountry` this one is a constant. */
    /* Two rules, one key. `must` gates a rule's id path as well as its label
       path, and these ids are specific enough to stand alone - no other block's
       country dropdown is named School*. Keeping them in one rule meant an
       empty or heading-less section disabled the id match too, which is how
       this box stayed blank on the live page even after the section fix. */
    { key: 'eduCountry', kind: 'text',
      ids: [/School.*(CNTRY|COUNTRY)/i, /EducInst.*(CNTRY|COUNTRY)/i] },
    { key: 'eduCountry', kind: 'text', ids: [],
      labels: [/^country\s*\/?\s*region$/i], must: /institution|attendance/i },
    { key: 'eduFrom',    kind: 'date',
      ids: [/School(Date)?From(Day|Month|Year)/i, /EducInstFrom(Day|Month|Year)/i],
      labels: [/date of attendance.*from/i, /^from$/i], must: /institution|attendance|school/i },
    { key: 'eduTo',      kind: 'date',
      ids: [/School(Date)?To(Day|Month|Year)/i, /EducInstTo(Day|Month|Year)/i],
      labels: [/date of attendance.*to/i, /^to$/i], must: /institution|attendance|school/i },
    { key: 'prevCountry', kind: 'text', ids: [/PrevEmpl.*(CNTRY|COUNTRY)/i],
      labels: [/^country\s*\/?\s*region$/i], must: /previous|prevempl/i },
    /* Column BB is one free-text address, so there is no city to fill. Named
       by id only, so the report points at the sheet rather than the rules. */
    { key: 'prevEmployerCity', kind: 'text', ids: [/PrevEmpl.*Addr.*City/i] },

    /* Additional Work/Education/Training. All seven ids come from a live Fill
       report, so these are not guesses. Six are constants; countriesVisited is
       derived from intake column M. */
    { key: 'clanTribe', kind: 'yesno', ids: [/CLAN_TRIBE_IND/i],
      labels: [/belong to a clan or tribe/i] },
    /* Only the FIRST row of the languages repeater - dtlLANGUAGES_ctl00_. More
       rows need "Add Another", a postback each, and a burst of those is what
       got the agent blocked out of CEAC once. */
    { key: 'languageSpoken', kind: 'text', ids: [/LANGUAGE_NAME/i],
      labels: [/^language name$/i] },
    { key: 'countriesVisited', kind: 'yesno', ids: [/COUNTRIES_VISITED_IND/i],
      labels: [/traveled to any countries.*last five years/i] },
    /* The SIXTH block with a bare "Country/Region" label. Only the first row
       of the repeater is filled - see firstCountryVisited in normalize.js.
       `not: /_IND/` keeps it off the Yes/No radio's own id, which also
       contains COUNTRIES_VISITED. */
    { key: 'firstCountryVisited', kind: 'text',
      ids: [/COUNTRIES_VISITED(?!_IND)/i, /COUNTRY_VISITED/i],
      labels: [/^country\s*\/?\s*region$/i],
      must: /countries.*visited|list of countries/i, not: /_IND\b/i },
    { key: 'belongedOrganization', kind: 'yesno', ids: [/ORGANIZATION_IND/i],
      labels: [/belonged to.*contributed to.*organization/i] },
    { key: 'specializedSkills', kind: 'yesno', ids: [/SPECIALIZED_SKILLS_IND/i],
      labels: [/specialized skills or training/i] },
    { key: 'militaryService', kind: 'yesno', ids: [/MILITARY_SERVICE_IND/i],
      labels: [/ever served in the military/i] },
    { key: 'insurgentOrg', kind: 'yesno', ids: [/INSURGENT_ORG_IND/i],
      labels: [/paramilitary|vigilante|insurgent organization/i] },
    { key: 'eduCity', kind: 'text', ids: [/School.*Addr.*City/i, /EducInst.*City/i] },

    /* Sign and Submit. The filler fills the three answers CEAC asks for here
       and NOTHING else: the CAPTCHA is FORBIDDEN (/codetextbox/) and the Sign
       and Submit button is FORBIDDEN too (/sign(and)?submit/, /btnsign/).
       Pressing that button is the applicant's act, not ours - see the hard
       rules in CLAUDE.md. Note the ids on this page carry no FormView1
       segment, which is why they are matched on bare fragments. */
    { key: 'fgmcFactSheet', kind: 'checkbox', ids: [/FGMC/i],
      labels: [/fact sheet on female genital/i] },
    { key: 'preparerAssisted', kind: 'yesno', ids: [/PREP_IND/i, /rblPreparer/i],
      labels: [/anyone assist you in filling out/i] },

    /* Two different questions that used to share one key. "Have you ever
       been in the U.S.?" is about entries; "Have you ever been issued a
       U.S. Visa?" is about the visa. A seafarer can hold a C1/D and never
       have set foot ashore, so answering the first from the second put
       Yes on the form and then left the arrival dates it demands empty. */
    { key: 'beenInUs',       kind: 'yesno', ids: [/PREV_US_TRAVEL_IND/i, /rblPREV_US_VISIT\b/i],
      labels: [/have you ever been in the u\.?s/i] },
    { key: 'priorUsVisa',    kind: 'yesno', ids: [/PREV_VISA_IND/i],
      labels: [/ever been issued a u\.?s\.? visa/i] },
    /* The visit block CEAC opens once "been in the U.S." is Yes. `must`
       keeps these off the Travel page, which asks the same two things
       about the trip being applied for. */
    { key: 'lastUsArrival',  kind: 'date', ids: [/PREV_US_VISIT_DTE(Day|Month|Year)/i],
      labels: [/^date arrived/i], must: /PREV|previous/i },
    { key: 'prevStayLength', kind: 'text', tag: 'input', ids: [/PREV_US_VISIT_LOS\b/i],
      labels: [/^length of stay/i], must: /PREV|previous/i, not: /_CD\b|UNIT/i },
    { key: 'prevStayUnit',   kind: 'text', tag: 'select', ids: [/PREV_US_VISIT_LOS_CD/i],
      labels: [/^length of stay/i], must: /PREV|previous/i },
    /* CEAC abbreviates this one: PREV_US_DRIVER_LIC_IND, not ..._LICENSE_IND.
       The label carries a typographic apostrophe, hence .{0,2} rather than a
       literal quote. The live page showed it unanswered with a required-field
       marker, and an unmatched radio used to be invisible in the report. */
    { key: 'usDriverLicense',kind: 'yesno',
      ids: [/US_DRIVER_LIC(ENSE)?_IND/i, /DRIVER_LIC/i],
      labels: [/driver.{0,2}s licen[cs]e/i] },
    { key: 'lastVisaNumber', kind: 'text',  ids: [/PREV_VISA_FOIL_NUMBER/i], labels: [/visa number/i] },
    /* CEAC is not consistent about the _DTE infix: the visit block uses
       PREV_US_VISIT_DTEDay, this one PREV_VISA_ISSUED_DTEDay. Accept both -
       the live page reported all three parts as unrecognised. */
    { key: 'lastVisaIssued', kind: 'date',  ids: [/PREV_VISA_ISSUED_?(DTE)?(Day|Month|Year)/i],
      labels: [/date last visa was issued/i] },
    { key: 'sameVisaType',   kind: 'yesno', ids: [/PREV_VISA_SAME_TYPE_IND/i], labels: [/same type of visa/i] },
    /* Column V asks about the visa AND the passport, so it answers both the
       Previous U.S. Travel question and the Passport page one. The live
       passport id is LOST_PPT_IND, and it came back with no question text -
       the label was just "Yes" - so the id has to carry it. */
    { key: 'visaLostStolen', kind: 'yesno', ids: [/PREV_VISA_LOST_IND/i, /LOST_PPT_IND/i],
      labels: [/lost or stolen/i] },
    { key: 'lostDetails',    kind: 'text',  ids: [/PREV_VISA_LOST_EXPL/i, /LOST_PPT.*EXPL/i],
      labels: [/explain.*lost/i] },
    { key: 'visaRevoked',    kind: 'yesno', ids: [/PREV_VISA_CANCELLED_IND/i], labels: [/cancelled or revoked/i] },
    { key: 'revokedDetails', kind: 'text',  ids: [/PREV_VISA_CANCELLED_EXPL/i], labels: [/explain.*(cancel|revok)/i] },
    /* The rest of the page. Ids here are best guesses from CEAC's naming;
       the label regexes are what these will match on until a live Fill
       report pins them - PREV_VISA_ISSUED_DTE had to be corrected that way. */
    { key: 'sameCountryResidence', kind: 'yesno',
      ids: [/PREV_VISA_(ISSUED_)?SAME_CNTRY_IND/i, /SAME_CNTRY/i],
      labels: [/same country or location where the visa/i, /place of principal.*residence/i] },
    { key: 'tenPrinted',     kind: 'yesno', ids: [/TEN_PRINT/i, /PREV_VISA_TEN_PRINT_IND/i],
      labels: [/ten.?printed/i] },
    { key: 'visaRefused',    kind: 'yesno', ids: [/PREV_VISA_REFUSED_IND/i, /VISA_REFUSED/i],
      labels: [/refused a u\.?s\.? visa|refused admission|withdrawn your application/i] },
    { key: 'refusedDetails', kind: 'text',  ids: [/PREV_VISA_REFUSED_EXPL/i],
      labels: [/explain.*refus/i] },
    { key: 'immigrantPetition', kind: 'yesno', ids: [/IV_PETITION_IND/i, /IMMIGRANT_PETITION/i],
      labels: [/immigrant petition/i] },
  ];

  const KIND = RULES.reduce((m, r) => (m[r.key] = r.kind, m), {});

  function isForbidden(idOrName) {
    const s = String(idOrName || '');
    return FORBIDDEN.some(re => re.test(s));
  }

  /* A rule only applies to the kind of control it describes.
     Without this a Yes/No radio can match a text rule on wording alone -
     "Are you a permanent resident of a country/region other than your
     country/region of origin (nationality)..." reads as the nationality
     field - and the filler then quietly writes nothing. */
  function kindAllows(rule, ctl) {
    const type = String(ctl.type || '').toLowerCase();
    const tag = String(ctl.tag || '').toLowerCase();
    const isRadio = type === 'radio', isCheck = type === 'checkbox';
    if (!tag && !type) return true;                   // caller gave us no shape
    if (rule.kind === 'yesno') return isRadio;
    if (rule.kind === 'checkbox') return isCheck;
    // A number and its unit dropdown can share one label; `tag` splits them.
    if (rule.tag && tag !== rule.tag) return false;
    return !isRadio && !isCheck;                      // text / date
  }

  /* Returns {key, via, part} or null.
     `part` is 'day' | 'month' | 'year' for the split date controls. */
  function matchKey(ctl, overrides) {
    const id = String(ctl.id || ''), name = String(ctl.name || ''), label = String(ctl.label || '');
    const section = String(ctl.section || '');
    if (isForbidden(id) || isForbidden(name)) return null;

    const ov = overrides && (overrides[id] || overrides[name]);
    if (ov) return { key: ov, via: 'override', part: datePart(id) };

    /* `not` and `must` see the block heading as well as the control's own
       label; `labels` never does. Context may rule a match out or in, but
       may not be the thing that finds it. */
    const context = [id, name, label, section].join(' ');
    const allowed = r => {
      if (r.not && r.not.test(context)) return false;
      if (r.must && !r.must.test(context)) return false;
      return kindAllows(r, ctl);
    };

    for (const r of RULES) {
      if (!allowed(r)) continue;
      for (const re of r.ids) {
        if (re.test(id) || re.test(name)) return { key: r.key, via: 'id', part: datePart(id) };
      }
    }
    if (label) {
      for (const r of RULES) {
        if (!allowed(r)) continue;
        for (const re of r.labels || []) {
          if (re.test(label)) return { key: r.key, via: 'label', part: datePart(id) };
        }
      }
    }
    return null;
  }

  function datePart(id) {
    if (/Day$/i.test(id) || /_Day\b/i.test(id)) return 'day';
    if (/Month$/i.test(id) || /_Month\b/i.test(id)) return 'month';
    if (/Year$/i.test(id) || /_Year\b/i.test(id)) return 'year';
    return null;
  }

  /* "25-MAR-1995" -> {day:'25', month:'MAR', year:'1995'} */
  function splitDate(v) {
    const m = String(v || '').match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
    return m ? { day: m[1], month: m[2], year: m[3] } : null;
  }

  /* Record fields that hold ONE full name but land in two CEAC boxes
     (Surnames + Given Names). Same mononym convention as normalize.js. */
  const FULLNAME_KEYS = ['fatherName', 'motherName', 'spouseName', 'prevSupervisor'];

  /* Same idea for the street address: one intake column, two CEAC boxes
     with a length limit. Line 1 takes as much as fits, breaking on a word
     so a street name is never cut mid-word; Line 2 takes the rest. `cap`
     is the real maxlength read off the page, not a guess. */
  const ADDRESS_KEYS = ['homeAddress', 'employerAddress', 'eduAddress'];

  function addressHalf(id, value, cap) {
    const s = String(value || '').trim();
    /* CEAC names the second line _LN2 on the address pages and Addr2 on the
       Work/Education one. The employer address was clipping in Line 1 while
       Line 2 sat empty, because nothing claimed it. */
    const isLine2 = /_LN2\b|LINE.?2|Addr2\b/i.test(String(id || ''));
    const max = Number(cap) > 0 ? Number(cap) : 40;
    if (s.length <= max) return isLine2 ? '' : s;
    let cut = s.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;                     // one very long word
    return isLine2 ? s.slice(cut).trim() : s.slice(0, cut).trim();
  }

  /* Relatives' name boxes each sit beside a "Do Not Know" checkbox, so a
     single name is filled as Surnames + a ticked box - NOT the literal
     "FNU", which is only what CEAC prints when that box is ticked. Same
     trap as the U.S. contact Organization Name.

     The applicant's own name on Personal 1 has no such checkbox, so
     `surname` / `givenNames` keep FNU. Only these keys blank the given half
     and let the NA flag do the talking. */
  const MONONYM_NA_KEYS = ['fatherName', 'motherName'];

  function nameHalf(id, value, opts) {
    const isSur = /SURNAME/i.test(id), isGiven = /GIVEN/i.test(id);
    if (!isSur && !isGiven) return value;
    let t = String(value || '').toUpperCase().replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
    /* "FNU" is the DS-160 placeholder for a name that does not exist, never a
       name itself. Kept as a token it became the surname: the live Family page
       filled Surnames FNU / Given Names SUROSO from an intake value of
       "SUROSO FNU". Same rule as splitName() in normalize.js. */
    if (t.length > 1) t = t.filter(x => x !== 'FNU');
    if (!t.length) return '';
    if (t.length === 1) {
      if (isSur) return t[0];
      return (opts && opts.blankGiven) ? '' : 'FNU';
    }
    return isSur ? t[t.length - 1] : t.slice(0, -1).join(' ');
  }

  /* A "Does Not Apply" checkbox that no rule claims is being left
     unticked on purpose - we have a real value for the field beside it.
     Reporting it as unrecognised suggests a gap that is not there.

     CEAC words some of them "Do Not Know" (beside the previous visa number)
     or "No Expiration" (beside the passport expiry date). Classified on the label, never on an _NA suffix
     in the id: APP_SSN_NA and APP_TAX_ID_NA end that way too and are boxes
     we deliberately tick. */
  /* Boxes deliberately left EMPTY because the "Does Not Apply" beside them is
     ticked. CEAC greys them out, so a value would be lost or would contradict
     the tick - leaving them alone is the correct action, not a gap, and
     listing them as unrecognised buries the real ones. Checkboxes are excluded:
     a "Does Not Apply" box is judged by isDoesNotApply() instead. */
  const LEAVE_BLANK = [/PPT_BOOK_NUM/i, /PassportBookNum/i, /passport book number/i];
  function isLeftBlank(ctl) {
    if (String(ctl.type || '').toLowerCase() === 'checkbox') return false;
    return LEAVE_BLANK.some(re => re.test([ctl.id, ctl.name, ctl.label].join(' ')));
  }

  function isDoesNotApply(ctl) {
    if (String(ctl.type || '').toLowerCase() !== 'checkbox') return false;
    return /does not apply|do not know|no expiration/i.test(String(ctl.label || '')) ||
           /cbxDNA/i.test(String(ctl.id || ''));
  }

  const api = { RULES, KIND, FORBIDDEN, FULLNAME_KEYS, MONONYM_NA_KEYS,
                ADDRESS_KEYS, addressHalf,
                matchKey, datePart, splitDate, isDoesNotApply, isLeftBlank, LEAVE_BLANK,
                isForbidden, nameHalf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Matcher = api;
})(typeof self !== 'undefined' ? self : this);
