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
    /sign(and)?submit/i, /btnsign/i, /esign/i, /confirm/i,
    /password/i, /appid/i, /applicationid/i, /retrieve/i,
  ];

  /* key: canonical field on the record (see normalize.js)
     ids:    regexes tried against the control id / name
     labels: regexes tried against the nearest visible label text
     kind:   text | date | yesno   (date/yesno need special handling) */
  const RULES = [
    { key: 'surname',        kind: 'text',  ids: [/APP_SURNAME/i], labels: [/^surnames/i] },
    { key: 'givenNames',     kind: 'text',  ids: [/APP_GIVEN_NAME/i], labels: [/^given names/i] },
    { key: 'gender',         kind: 'text',  ids: [/APP_GENDER/i], labels: [/^sex$/i] },
    { key: 'maritalStatus',  kind: 'text',  ids: [/APP_MARITAL_STATUS/i], labels: [/marital status/i] },
    // Relatives get their own DOB controls with the same suffix, so the
    // applicant rule has to stand aside for them.
    { key: 'dob',            kind: 'date',  ids: [/DOB(Day|Month|Year)/i], labels: [/date of birth/i],
      not: /FATHER|MOTHER|SPOUSE|POC|CHILD/i },
    { key: 'pobCity',        kind: 'text',  ids: [/APP_POB_CITY/i], labels: [/city.*birth|birth.*city/i] },
    { key: 'pobProvince',    kind: 'text',  ids: [/APP_POB_ST_PROVINCE/i], labels: [/state.*province.*birth/i] },
    { key: 'nationality',    kind: 'text',  ids: [/APP_POB_CNTRY/i, /APP_NATL/i], labels: [/country.*region of (birth|origin)|nationality/i] },
    { key: 'nationalId',     kind: 'text',  ids: [/APP_NATIONAL_ID/i], labels: [/national identification/i] },

    // Constant answers (see constants.js) - questions the intake form
    // never asks. The NA checkbox must not swallow the native-name text
    // box next to it, hence the explicit _NA anchoring.
    { key: 'nativeAlphabetNA',    kind: 'checkbox', ids: [/FULL_NAME_NATIVE.*_NA\b/i, /_NATIVE_NA\b/i],
      labels: [/does not apply.*technology not available/i] },
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
    { key: 'ssnNA',   kind: 'checkbox', ids: [/APP_SSN_NA/i, /SSN.*_NA/i],
      labels: [/social security number/i] },
    { key: 'taxIdNA', kind: 'checkbox', ids: [/APP_TAX_ID_NA/i, /TAX_ID.*_NA/i],
      labels: [/taxpayer id/i] },
    { key: 'mailingSameAsHome',   kind: 'yesno', ids: [/MAILING_ADDR_SAME/i],
      labels: [/mailing address.*same as.*home address/i] },
    { key: 'immediateRelativesUS', kind: 'yesno', ids: [/US_IMMED_RELATIVE_IND/i, /US_IMMEDIATE_RELATIVE/i],
      labels: [/immediate relatives.*united states/i] },
    { key: 'otherRelativesUS',    kind: 'yesno', ids: [/US_OTHER_RELATIVE_IND/i],
      labels: [/other relatives in the united states/i] },

    { key: 'homeAddress',    kind: 'text',  ids: [/APP_ADDR_LN1/i], labels: [/street address/i] },
    { key: 'phone',          kind: 'text',  ids: [/APP_HOME_TEL/i, /PRIMARY.*PHONE/i], labels: [/primary phone/i] },
    { key: 'email',          kind: 'text',  ids: [/APP_EMAIL_ADDR/i], labels: [/^e-?mail address/i] },
    { key: 'socialPlatform', kind: 'text',  ids: [/SOCIAL_MEDIA_PROVIDER/i, /ddlSocialMedia/i], labels: [/social media platform/i] },
    { key: 'socialHandle',   kind: 'text',  ids: [/SOCIAL_MEDIA_IDENT/i, /tbxSocialMediaIdent/i], labels: [/social media identifier/i] },

    { key: 'passportNumber',     kind: 'text', ids: [/PPT_NUM/i], labels: [/passport.*number/i] },
    { key: 'passportIssuePlace', kind: 'text', ids: [/PPT_ISSUED_IN_CITY/i], labels: [/city.*issuance/i] },
    { key: 'passportIssued',     kind: 'date', ids: [/PPT_ISSUED(Day|Month|Year)/i], labels: [/issuance date/i] },
    { key: 'passportExpiry',     kind: 'date', ids: [/PPT_EXPIRE(Day|Month|Year)/i], labels: [/expiration date/i] },

    // Travel page. The visible labels here are clean and distinct, so
    // they carry more weight than the id guesses.
    { key: 'purposeOfTrip',  kind: 'text',  ids: [/PurposeOfTrip/i, /PURPOSE_OF_TRIP/i],
      labels: [/^purpose of trip/i], not: /Specify|OTHER/i },
    { key: 'specifyPurpose', kind: 'text',  ids: [/OtherPurpose/i, /ddlOtherPurpose/i],
      labels: [/^specify$/i] },
    { key: 'specificTravelPlans', kind: 'yesno', ids: [/SpecificTravel/i, /TRAVEL_PLANS_IND/i],
      labels: [/made specific travel plans/i] },
    { key: 'arrivalDate',    kind: 'date',
      ids: [/ARRIVAL_US_DTE(Day|Month|Year)/i, /ARRIVE_(Day|Month|Year)/i, /DTEIntendedDate/i],
      labels: [/date of arrival in u\.?s|intended date of arrival/i] },
    { key: 'arrivalFlight',  kind: 'text',  ids: [/ARRIVAL_FLIGHT/i], labels: [/arrival flight/i] },
    { key: 'arrivalCity',    kind: 'text',  ids: [/ArriveCity/i, /ARRIVAL_CITY/i], labels: [/^arrival city/i] },
    { key: 'departureDate',  kind: 'date',
      ids: [/DEPARTURE_US_DTE(Day|Month|Year)/i, /DEPART_(Day|Month|Year)/i],
      labels: [/date of departure from u\.?s/i] },
    { key: 'departureFlight', kind: 'text', ids: [/DEPARTURE_FLIGHT/i], labels: [/departure flight/i] },
    { key: 'departureCity',  kind: 'text',  ids: [/DepartCity/i, /DEPARTURE_CITY/i], labels: [/^departure city/i] },
    { key: 'stayAddress',    kind: 'text',  ids: [/STAY_ADDR_LN1/i], labels: [/address where you will stay/i] },
    { key: 'vesselName',     kind: 'text',  ids: [/SEAGOING.*NAME/i, /tbxSHIP/i],
      labels: [/seagoing ship.*vessel name|^vessel name/i], not: /IDENT|IMO|NUMBER/i },
    { key: 'vesselImo',      kind: 'text',  ids: [/SEAGOING.*(IDENT|NUM)/i, /VESSEL_ID/i],
      labels: [/vessel identification number/i] },
    { key: 'jobTitleAboard', kind: 'text',  ids: [/CREW_JOB_TITLE/i, /tbxJobTitleAboard/i],
      labels: [/specific job title aboard/i] },
    { key: 'tripPayer',      kind: 'text',  ids: [/WHO_IS_PAYING/i], labels: [/paying for your trip/i] },

    { key: 'usPocName',    kind: 'text', ids: [/POC_(SURNAME|GIVEN)/i, /USPOC/i], labels: [/contact person/i] },
    { key: 'usPocOrg',     kind: 'text', ids: [/POC_ORGANIZATION/i], labels: [/organization name/i] },
    { key: 'usPocAddress', kind: 'text', ids: [/POC_ADDR_LN1/i], labels: [/u\.?s\.? contact.*address|street address.*contact/i] },
    { key: 'usPocPhone',   kind: 'text', ids: [/POC_HOME_TEL/i], labels: [/phone number.*contact/i] },
    { key: 'usPocEmail',   kind: 'text', ids: [/POC_EMAIL_ADDR/i], labels: [/e-?mail address.*contact/i] },

    { key: 'fatherName',   kind: 'text', ids: [/FATHER_(SURNAME|GIVEN_NAME)/i], labels: [/father.*(surname|given name)/i] },
    { key: 'fatherDob',    kind: 'date', ids: [/FATHER_DOB(Day|Month|Year)/i], labels: [/father.*date of birth/i] },
    { key: 'motherName',   kind: 'text', ids: [/MOTHER_(SURNAME|GIVEN_NAME)/i], labels: [/mother.*(surname|given name)/i] },
    { key: 'motherDob',    kind: 'date', ids: [/MOTHER_DOB(Day|Month|Year)/i], labels: [/mother.*date of birth/i] },

    { key: 'spouseName',        kind: 'text', ids: [/SPOUSE_(SURNAME|GIVEN_NAME)/i], labels: [/spouse.*(surname|given name)/i] },
    { key: 'spouseDob',         kind: 'date', ids: [/SPOUSE_DOB(Day|Month|Year)/i], labels: [/spouse.*date of birth/i] },
    { key: 'spouseNationality', kind: 'text', ids: [/SPOUSE_NATL/i], labels: [/spouse.*nationality/i] },
    { key: 'spousePob',         kind: 'text', ids: [/SPOUSE_POB_CITY/i], labels: [/spouse.*city of birth/i] },

    { key: 'employerName',    kind: 'text', ids: [/EmpSchName/i, /PRES_EMPL_NAME/i], labels: [/present employer|school name/i] },
    { key: 'employerAddress', kind: 'text', ids: [/EmpSchAddr1/i], labels: [/employer.*street address/i] },
    { key: 'employerPhone',   kind: 'text', ids: [/WorkEducTel/i, /EmpSchTel/i], labels: [/telephone number.*employer/i] },
    { key: 'employerStart',   kind: 'date', ids: [/EmpDateFrom(Day|Month|Year)/i], labels: [/start date/i] },
    { key: 'jobTitle',        kind: 'text', ids: [/tbxJobTitle/i, /JOB_TITLE/i], labels: [/job title/i] },
    { key: 'monthlyIncome',   kind: 'text', ids: [/MonthlySalary/i], labels: [/monthly (income|salary)/i] },

    { key: 'prevEmployerName',    kind: 'text', ids: [/PrevEmplName/i], labels: [/employer name/i] },
    { key: 'prevEmployerAddress', kind: 'text', ids: [/PrevEmplAddr1/i], labels: [/employer street address/i] },
    { key: 'prevEmployerPhone',   kind: 'text', ids: [/PrevEmplTel/i], labels: [/telephone number/i] },
    { key: 'prevJobTitle',        kind: 'text', ids: [/PrevEmplJobTitle/i], labels: [/job title/i] },
    { key: 'prevSupervisor',      kind: 'text', ids: [/PrevSupervisor(Surname|GivenName)/i], labels: [/supervisor/i] },
    { key: 'prevStart',           kind: 'date', ids: [/PrevEmplDateFrom(Day|Month|Year)/i], labels: [/employment date from/i] },
    { key: 'prevEnd',             kind: 'date', ids: [/PrevEmplDateTo(Day|Month|Year)/i], labels: [/employment date to/i] },

    { key: 'hsName',    kind: 'text', ids: [/SchoolName/i], labels: [/name of institution/i] },
    { key: 'hsAddress', kind: 'text', ids: [/SchoolAddr1/i], labels: [/institution.*street address/i] },
    { key: 'hsCourse',  kind: 'text', ids: [/SchoolCourseOfStudy/i], labels: [/course of study/i] },

    { key: 'priorUsVisa',    kind: 'yesno', ids: [/PREV_US_TRAVEL_IND/i, /rblPREV_US_VISIT/i], labels: [/have you ever been in the u\.?s/i] },
    { key: 'usDriverLicense',kind: 'yesno', ids: [/US_DRIVER_LICENSE_IND/i], labels: [/driver.?s licen[cs]e/i] },
    { key: 'lastVisaNumber', kind: 'text',  ids: [/PREV_VISA_FOIL_NUMBER/i], labels: [/visa number/i] },
    { key: 'lastVisaIssued', kind: 'date',  ids: [/PREV_VISA_ISSUED(Day|Month|Year)/i], labels: [/date last visa was issued/i] },
    { key: 'sameVisaType',   kind: 'yesno', ids: [/PREV_VISA_SAME_TYPE_IND/i], labels: [/same type of visa/i] },
    { key: 'visaLostStolen', kind: 'yesno', ids: [/PREV_VISA_LOST_IND/i], labels: [/lost or stolen/i] },
    { key: 'lostDetails',    kind: 'text',  ids: [/PREV_VISA_LOST_EXPL/i], labels: [/explain.*lost/i] },
    { key: 'visaRevoked',    kind: 'yesno', ids: [/PREV_VISA_CANCELLED_IND/i], labels: [/cancelled or revoked/i] },
    { key: 'revokedDetails', kind: 'text',  ids: [/PREV_VISA_CANCELLED_EXPL/i], labels: [/explain.*(cancel|revok)/i] },
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
    return !isRadio && !isCheck;                      // text / date
  }

  /* Returns {key, via, part} or null.
     `part` is 'day' | 'month' | 'year' for the split date controls. */
  function matchKey(ctl, overrides) {
    const id = String(ctl.id || ''), name = String(ctl.name || ''), label = String(ctl.label || '');
    if (isForbidden(id) || isForbidden(name)) return null;

    const ov = overrides && (overrides[id] || overrides[name]);
    if (ov) return { key: ov, via: 'override', part: datePart(id) };

    for (const r of RULES) {
      if (r.not && (r.not.test(id) || r.not.test(name))) continue;
      if (!kindAllows(r, ctl)) continue;
      for (const re of r.ids) {
        if (re.test(id) || re.test(name)) return { key: r.key, via: 'id', part: datePart(id) };
      }
    }
    if (label) {
      for (const r of RULES) {
        if (r.not && (r.not.test(id) || r.not.test(name) || r.not.test(label))) continue;
        if (!kindAllows(r, ctl)) continue;
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
  const FULLNAME_KEYS = ['fatherName', 'motherName', 'spouseName', 'usPocName', 'prevSupervisor'];

  function nameHalf(id, value) {
    const isSur = /SURNAME/i.test(id), isGiven = /GIVEN/i.test(id);
    if (!isSur && !isGiven) return value;
    const t = String(value || '').toUpperCase().replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
    if (!t.length) return '';
    if (t.length === 1) return isSur ? t[0] : 'FNU';
    return isSur ? t[t.length - 1] : t.slice(0, -1).join(' ');
  }

  const api = { RULES, KIND, FORBIDDEN, FULLNAME_KEYS, matchKey, datePart, splitDate,
                isForbidden, nameHalf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Matcher = api;
})(typeof self !== 'undefined' ? self : this);
