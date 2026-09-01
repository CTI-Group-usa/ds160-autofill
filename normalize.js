/* ------------------------------------------------------------------
 * DS-160 normalizer
 * Turns one "VISA APPLICATIONS" sheet row into a canonical DS-160
 * record, formats every value the way CEAC expects, and reports the
 * problems that would otherwise be found at the embassy counter.
 *
 * Shared by the worksheet app AND the Chrome extension, so it must
 * stay dependency-free and work as a plain <script> or a CommonJS
 * require().
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  // -- value helpers ------------------------------------------------
  const clean = v => (v === undefined || v === null) ? '' : String(v).replace(/\s+/g, ' ').trim();
  const upper = v => clean(v).toUpperCase();

  /* Excel/Zoho serial dates count days from 1899-12-30. */
  function fromSerial(n) {
    const d = new Date((n - 25569) * 86400000);
    return isNaN(d) ? null : { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  /* Tolerant date parser. Returns {y,m,d,ambiguous} or null.
     Sheet rows arrive in whatever the form saved, so accept the lot. */
  function parseDate(raw, opts) {
    // "17th December 2026" - supporting letters write ordinals.
    const s = clean(raw).replace(/(\d{1,2})(st|nd|rd|th)\b/gi, '$1');
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 60000) return fromSerial(Number(s));

    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)))
      return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = s.match(/^(\d{1,2})[-/. ]([A-Za-z]{3,})[-/. ](\d{4})/))) {
      const mi = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase());
      if (mi >= 0) return { y: +m[3], m: mi + 1, d: +m[1] };
    }
    if ((m = s.match(/^([A-Za-z]{3,})[ .]+(\d{1,2}),?[ ]+(\d{4})/))) {
      const mi = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase());
      if (mi >= 0) return { y: +m[3], m: mi + 1, d: +m[2] };
    }
    /* 05/01/1990 - day-first is the Indonesian convention, but flag it
       whenever both halves are <= 12 because we genuinely cannot tell.
       A second half over 12 settles it: that is month-first (9/16/1987),
       which is how the Carnival supporting letters are written.
       opts.monthFirst forces month-first for a source we know writes it
       that way, and still flags the cases that stay ambiguous. */
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) {
      const a = +m[1], b = +m[2], y = +m[3];
      if (a > 12) return { y, m: b, d: a };                       // day-first, certain
      if (b > 12) return { y, m: a, d: b };                       // month-first, certain
      if (opts && opts.monthFirst) return { y, m: a, d: b, ambiguous: a !== b };
      return { y, m: b, d: a, ambiguous: a !== b };
    }
    const d = new Date(s);
    return isNaN(d) ? null : { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }

  /* CEAC prints and expects DD-MMM-YYYY. */
  function fmtDate(p) {
    return p ? String(p.d).padStart(2, '0') + '-' + MONTHS[p.m - 1] + '-' + p.y : '';
  }
  const dateStr = raw => fmtDate(parseDate(raw));
  const toJs = p => (p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null);

  function monthsBetween(a, b) {
    if (!a || !b) return null;
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
      + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1);
  }

  /* Previous U.S. Travel asks Length of Stay as a number plus a period
     dropdown. CEAC's options are a closed set, so a loose intake answer
     ("3 months", "kurang dari 24 jam", "1 day") has to land on one of them
     exactly or the select stays on -SELECT ONE-. */
  const STAY_UNITS = ['YEAR(S)', 'MONTH(S)', 'WEEK(S)', 'DAY(S)', 'LESS THAN 24 HOURS'];
  function stayUnit(raw) {
    const s = upper(raw).replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/24\s*(HOURS?|HRS?|JAM)|LESS THAN A DAY|KURANG DARI/.test(s)) return 'LESS THAN 24 HOURS';
    if (/\bYEARS?\b|\bTAHUN\b/.test(s)) return 'YEAR(S)';
    if (/\bMONTHS?\b|\bBULAN\b/.test(s)) return 'MONTH(S)';
    if (/\bWEEKS?\b|\bMINGGU\b/.test(s)) return 'WEEK(S)';
    if (/\bDAYS?\b|\bHARI\b/.test(s)) return 'DAY(S)';
    return '';
  }
  const stayCount = raw => {
    const m = clean(raw).match(/\d+/);
    return m ? m[0] : '';
  };

  /* The address stays ONE string. Splitting the city out of it was built
     and then reverted on 2026-09-01 at the user's request: they arrange
     City, State/Province and Postal Zone by hand in CEAC. The whole of
     column Z goes to Street Address, wrapped across Line 1 and Line 2 by
     addressHalf() so nothing is clipped and lost. Do not reintroduce a
     parser here. */

  /* Indonesian mobile numbers arrive as 08xx, 628xx, +62 8xx, 8xx... */
  function normPhone(raw) {
    let s = clean(raw).replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (!s) return '';
    if (s.startsWith('0')) s = '62' + s.slice(1);
    else if (s.startsWith('8')) s = '62' + s;
    return '+' + s;
  }

  /* DS-160 has no "single name" option: a mononym goes in Surnames and
     Given Names becomes FNU. Anything longer is a guess until someone
     checks it against the passport MRZ, so we always flag it. */
  function splitName(raw) {
    const t = upper(raw).replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
    if (!t.length) return { surname: '', given: '', mononym: false, guessed: false };
    if (t.length === 1) return { surname: t[0], given: 'FNU', mononym: true, guessed: false };
    return { surname: t[t.length - 1], given: t.slice(0, -1).join(' '), mononym: false, guessed: true };
  }

  function yn(raw) {
    const s = clean(raw);
    if (!s) return '';
    if (/^(y|yes|ya|true|1|sudah|pernah)$/i.test(s)) return 'YES';
    if (/^(n|no|tidak|false|0|belum)$/i.test(s)) return 'NO';
    if (/^yes\b|^ya\b|^pernah\b/i.test(s)) return 'YES';
    if (/^no\b|^tidak\b|^belum\b|never/i.test(s)) return 'NO';
    return upper(s);
  }

  // -- sheet header -> canonical key ---------------------------------
  // Left side is the EXACT header text in the VISA APPLICATIONS sheet.
  const MAP = {
    'Added Time':                                                    ['addedTime', clean],
    'Name':                                                          ['fullName', upper],
    'Cruise Line':                                                   ['cruiseLine', clean],
    'Please select the type of visa you want to process':            ['visaType', clean],
    'Gender':                                                        ['gender', upper],
    'Marital Status':                                                ['maritalStatus', upper],
    'Date of Birth':                                                 ['dob', dateStr],
    'Place of Birth':                                                ['pobCity', upper],
    'Province of Birth':                                             ['pobProvince', upper],
    'Nationality':                                                   ['nationality', upper],
    'KTP Number':                                                    ['nationalId', s => clean(s).replace(/\D/g, '')],
    "Countries I've Been to in the Last 5 Years":                    ['countries5y', clean],
    'Do you have US Driver License?':                                ['usDriverLicense', yn],
    'Have you ever been issued U.S. Visa?':                          ['priorUsVisa', yn],
    'When did you arrive in the US?':                                ['lastUsArrival', dateStr],
    'Period Type of Stay in the US':                                 ['stayUnit', clean],
    'How long did you stay in the US?':                              ['stayLength', clean],
    'Date last Visa was issued':                                     ['lastVisaIssued', dateStr],
    'Last Visa Number':                                              ['lastVisaNumber', upper],
    'Are you applying for the same type of visa?':                   ['sameVisaType', yn],
    'Has your U.S. Visa / passport ever been lost or stolen?':       ['visaLostStolen', yn],
    'Explain Details of Loss/Theft':                                 ['lostDetails', clean],
    'Has your U.S. Visa / passport ever been cancelled or revoked?': ['visaRevoked', yn],
    'Explain Cancellation/Revocation Details':                       ['revokedDetails', clean],
    'Address':                                                       ['homeAddress', clean],
    'Phone Number':                                                  ['phone', normPhone],
    'Email Address':                                                 ['email', s => clean(s).toLowerCase()],
    'Social Media Provider/Platform':                                ['socialPlatform', clean],
    'Social Media Username/Link':                                    ['socialHandle', clean],
    'Passport Number':                                               ['passportNumber', upper],
    'Passport Issued Place':                                         ['passportIssuePlace', upper],
    'Passport Issued Date':                                          ['passportIssued', dateStr],
    'Passport Expired Date':                                         ['passportExpiry', dateStr],
    "Father's Name":                                                 ['fatherName', upper],
    "Father's Date of Birth":                                        ['fatherDob', dateStr],
    "Mother's Name":                                                 ['motherName', upper],
    "Mother's Date of Birth":                                        ['motherDob', dateStr],
    "Husband/Wife's Name":                                           ['spouseName', upper],
    'Husband/Wife Date of Birth':                                    ['spouseDob', dateStr],
    'Husband/Wife Country (Nationality)':                            ['spouseNationality', upper],
    'Husband/Wife Place of Birth':                                   ['spousePob', upper],
    'Date of Marriage':                                              ['marriageDate', dateStr],
    'Date Marriage Ended':                                           ['marriageEnded', dateStr],
    'How the Marriage Ended':                                        ['marriageEndHow', clean],
    'Country/Region Marriage was Terminated':                        ['marriageEndCountry', upper],
    "Current Workplace's Name":                                      ['employerName', upper],
    "Current Workplace's Address":                                   ['employerAddress', clean],
    "Current Workplace's Phone Number":                              ['employerPhone', normPhone],
    'Start Date at Current Workplace':                               ['employerStart', dateStr],
    'Current Employment Position':                                   ['jobTitle', upper],
    'Were you previously employed?':                                 ['prevEmployed', yn],
    'Previous Work Place Name':                                      ['prevEmployerName', upper],
    'Previous Workplace Address':                                    ['prevEmployerAddress', clean],
    'Previous Workplace Phone Number':                               ['prevEmployerPhone', normPhone],
    'Previous Workplace Working Position':                           ['prevJobTitle', upper],
    "Previous Workplace Manager's Name":                             ['prevSupervisor', upper],
    'Previous Workplace Start Date':                                 ['prevStart', dateStr],
    'Previous Workplace Ended Date':                                 ['prevEnd', dateStr],
    'Previous Workplace Country':                                    ['prevCountry', upper],
    'Please select your highest level of education':                 ['educationLevel', clean],
    'Name of high school/vocational school':                         ['hsName', upper],
    'Address of high school/vocational school':                      ['hsAddress', clean],
    'Course of Study in High School/Vocational School':              ['hsCourse', clean],
    'Year of High School/Vocational School Entry':                   ['hsFrom', clean],
    'Year of High School High School Graduation':                    ['hsTo', clean],
    'Name of College/University':                                    ['uniName', upper],
    'Address of College/University':                                 ['uniAddress', clean],
    'Course of Study in College/University':                         ['uniCourse', clean],
    'Year of College/University Entry':                              ['uniFrom', clean],
    'Year of High School/University Graduation':                     ['uniTo', clean],
    'Payment Status':                                                ['paymentStatus', clean],
    'Visa Application ID':                                           ['visaAppId', clean],
    'Visa Status':                                                   ['visaStatus', clean],
    'BNIVA Number':                                                  ['bniva', clean],
    'Appointment Date':                                              ['appointmentDate', dateStr],
    'Embassy Location':                                              ['embassy', clean],
    'Notes':                                                         ['notes', clean],
  };

  /* Fields DS-160 needs that the intake form never asks. They stay
     empty here and are surfaced as "still to collect" in the worksheet. */
  const MISSING_FROM_INTAKE = [
    ['vesselName',    'Vessel / ship name (DS-160 crew section)'],
    ['usPocName',     'US point of contact - name'],
    ['usPocAddress',  'US point of contact - address'],
    ['usPocPhone',    'US point of contact - phone'],
    ['usPocEmail',    'US point of contact - email'],
    ['homeCity',      'Home address - city (the sheet has one address column)'],
    ['passportIssuedState', 'Passport - state/province where issued'],
    ['homeState',     'Home address - state / province'],
    ['homePostal',    'Home address - postal code'],
    ['arrivalDate',   'Intended date of arrival in the US'],
    ['stayAddress',   'Address where you will stay in the US'],
    ['tripPayer',     'Person / entity paying for the trip'],
  ];

  function toRecord(row) {
    const rec = {};
    for (const header in MAP) {
      const [key, fn] = MAP[header];
      rec[key] = fn(row[header]);
    }
    const n = splitName(rec.fullName);
    rec.surname = n.surname;
    rec.givenNames = n.given;
    rec._nameMononym = n.mononym;
    rec._nameGuessed = n.guessed;

    // C1/D crew are employed by the cruise line, not the manning agent.
    if (!rec.employerName && rec.cruiseLine) rec.employerName = upper(rec.cruiseLine);

    /* DS-160 asks "Have you ever been in the U.S.?" - not the same question
       as column O, "Have you ever been issued U.S. Visa?". A seafarer can
       hold a C1/D and never have entered. The intake form has no yes/no for
       it; the only evidence is column P, so the arrival date IS the answer:
       filled means he has been, empty means he has not. */
    rec.beenInUs = rec.lastUsArrival ? 'YES' : 'NO';

    /* Length of Stay is the seafarer's own answer, not a constant. It reads
       the way the headers do: column Q ("Period Type of Stay in the US") is
       the CEAC period, column R ("How long did you stay in the US?") is the
       number beside it. */
    rec.prevStayUnit   = stayUnit(rec.stayUnit);
    rec.prevStayLength = stayCount(rec.stayLength);

    /* "Have you ever been refused a U.S. Visa, or been refused admission, or
       withdrawn your application at the port of entry?" has no column of its
       own. At the user's direction it is answered from column X, which is
       headed "Has your U.S. Visa / passport ever been cancelled or revoked?"
       and also answers that separate DS-160 question. One cell, two sworn
       answers: the worksheet says so on both lines and validate() flags a
       Yes, because someone can be refused a visa without ever having one
       revoked. */
    rec.visaRefused = rec.visaRevoked;

    /* Ten-printing is the full ten-finger scan taken at a visa interview, so
       it follows from having held a U.S. visa before rather than being a
       constant. CEAC only asks it inside the previous-visa block, which is
       the Yes branch anyway. */
    rec.tenPrinted = rec.priorUsVisa === 'YES' ? 'YES' : 'NO';
    /* CEAC greys the number box out for this option, so writing a count
       there would either fail silently or contradict the dropdown. */
    if (rec.prevStayUnit === 'LESS THAN 24 HOURS') rec.prevStayLength = '';

    // The vessel name and IMO number live in the supporting letter, not
    // in any column - carry the link through so the agent can open it.
    /* A filed application shows the Latin full name here, not a ticked
       "Does Not Apply" - see the ALDI MAULANA RIZKY sample. */
    rec.nativeName = rec.fullName;

    const links = row._links || {};
    const cell = clean(row['Supporting Letter']);
    rec.supportingLetterUrl = links['Supporting Letter'] ||
                              (/^https?:\/\//i.test(cell) ? cell : '');
    for (const [k] of MISSING_FROM_INTAKE) if (!(k in rec)) rec[k] = '';
    rec._raw = row;
    return rec;
  }

  // -- validation ----------------------------------------------------
  const REQUIRED = [
    ['fullName', 'Name'], ['gender', 'Gender'], ['maritalStatus', 'Marital status'],
    ['dob', 'Date of birth'], ['pobCity', 'Place of birth'], ['nationality', 'Nationality'],
    ['homeAddress', 'Home address'], ['phone', 'Phone number'], ['email', 'Email address'],
    ['passportNumber', 'Passport number'], ['passportIssued', 'Passport issue date'],
    ['passportExpiry', 'Passport expiry date'], ['fatherName', "Father's name"],
    ['motherName', "Mother's name"], ['employerName', 'Current employer'],
    ['jobTitle', 'Current position'],
  ];

  function validate(rec, opts) {
    opts = opts || {};
    const today = opts.today ? new Date(opts.today) : new Date();
    const errors = [], warnings = [];
    const E = (field, msg) => errors.push({ field, msg });
    const W = (field, msg) => warnings.push({ field, msg });

    for (const [k, label] of REQUIRED) if (!rec[k]) E(k, label + ' is empty');

    const dob = toJs(parseDate(rec.dob));
    if (rec.dob && !dob) E('dob', 'Date of birth could not be read');
    if (dob) {
      const age = Math.floor(monthsBetween(dob, today) / 12);
      if (age < 18) W('dob', 'Applicant is under 18 (' + age + ') - a parent or guardian must sign');
      if (age > 70) W('dob', 'Age ' + age + ' - check the date is not mistyped');
    }
    const rawDob = rec._raw ? parseDate(rec._raw['Date of Birth']) : null;
    if (rawDob && rawDob.ambiguous)
      W('dob', 'Ambiguous date format (day and month both 12 or less) - confirm against the passport');

    const iss = toJs(parseDate(rec.passportIssued));
    const exp = toJs(parseDate(rec.passportExpiry));
    if (rec.passportIssued && !iss) E('passportIssued', 'Passport issue date could not be read');
    if (rec.passportExpiry && !exp) E('passportExpiry', 'Passport expiry date could not be read');
    if (iss && exp && iss >= exp) E('passportExpiry', 'Passport expiry is not after the issue date');

    // Six-month rule, measured from the appointment when we know it.
    const ref = toJs(parseDate(rec.appointmentDate)) || today;
    if (exp) {
      const m = monthsBetween(ref, exp);
      if (m < 0) E('passportExpiry', 'Passport is already expired');
      else if (m < 6) E('passportExpiry', 'Passport expires in ' + m + ' month(s) - under the 6-month rule');
      else if (m < 9) W('passportExpiry', 'Passport expires in ' + m + ' months - renew before the contract starts');
    }

    if (rec.passportNumber && !/^[A-Z0-9]{6,12}$/.test(rec.passportNumber))
      W('passportNumber', 'Unusual passport number format - check for typos or stray spaces');
    if (rec.nationalId && rec.nationalId.length !== 16)
      W('nationalId', 'KTP should be 16 digits, got ' + rec.nationalId.length);
    if (rec.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(rec.email))
      E('email', 'Email address is not valid');
    if (rec.phone && !/^\+62\d{8,13}$/.test(rec.phone))
      W('phone', 'Phone number does not look like a valid Indonesian number');

    if (rec._nameMononym)
      W('surname', 'Single name - filled as Surname "' + rec.surname + '", Given Names "FNU". Confirm against the passport.');
    else if (rec._nameGuessed)
      W('surname', 'Name split is a guess: Surname "' + rec.surname + '" / Given "' + rec.givenNames + '". Must match the passport MRZ exactly.');
    if (/[^A-Z' -]/.test(rec.fullName))
      W('fullName', 'Name contains characters that are not in the passport MRZ (digits, titles, punctuation)');

    if (/MARRIED|KAWIN|MENIKAH/.test(rec.maritalStatus)) {
      if (!rec.spouseName) E('spouseName', 'Married - spouse name is required');
      if (!rec.spouseDob) E('spouseDob', 'Married - spouse date of birth is required');
      if (!rec.spouseNationality) W('spouseNationality', 'Married - DS-160 asks for the spouse nationality');
    }
    if (/DIVORC|WIDOW|CERAI|JANDA|DUDA/.test(rec.maritalStatus) && !rec.marriageEnded)
      W('marriageEnded', 'Previously married - DS-160 asks when and how the marriage ended');

    if (rec.prevEmployed === 'YES' && !rec.prevEmployerName)
      E('prevEmployerName', 'Marked as previously employed but no previous employer given');
    if (rec.priorUsVisa === 'YES') {
      if (!rec.lastVisaNumber) W('lastVisaNumber', 'Held a US visa before - DS-160 asks for the previous visa number');
      if (!rec.lastVisaIssued) W('lastVisaIssued', 'Held a US visa before - DS-160 asks when it was issued');
    }
    /* Length of Stay is a required pair on CEAC once the visit block opens. */
    if (rec.beenInUs === 'YES') {
      if (!rec.prevStayUnit)
        W('prevStayUnit', rec.stayUnit
            ? 'Period of stay "' + rec.stayUnit + '" does not match a CEAC option ' +
              '(YEAR(S) / MONTH(S) / WEEK(S) / DAY(S) / LESS THAN 24 HOURS) - set it by hand'
            : stayUnit(rec.stayLength)
              /* The period comes from column Q. One sitting in R instead would
                 otherwise leave a required CEAC field silently blank. */
              ? 'Period of stay is read from "Period Type of Stay in the US" (column Q), ' +
                'which is empty - "' + rec.stayLength + '" is in column R instead. ' +
                'Move it to column Q or set the period by hand'
              : 'Arrived in the U.S. but no length of stay on the intake form - CEAC requires it');
      else if (rec.prevStayUnit !== 'LESS THAN 24 HOURS' && !rec.prevStayLength)
        W('prevStayLength', 'Length of stay is "' + rec.prevStayUnit +
                            '" with no number - CEAC needs both');
    }
    if (rec.beenInUs === 'NO' && rec.priorUsVisa === 'YES')
      W('lastUsArrival', 'Held a US visa but no arrival date on the intake form, so ' +
                         '"Have you ever been in the U.S.?" is answered No - confirm he never entered');
    if (rec.visaLostStolen === 'YES' && !rec.lostDetails)
      E('lostDetails', 'Visa or passport reported lost/stolen with no explanation');
    if (rec.visaRevoked === 'YES' && !rec.revokedDetails)
      E('revokedDetails', 'Visa reported cancelled/revoked with no explanation');
    /* Column X answers both this and the cancellation question, so a Yes is
       being sworn to twice off one cell. CEAC also demands an explanation
       here, and column Y explains the cancellation, not the refusal. */
    if (rec.visaRefused === 'YES')
      W('visaRefused', 'Answered Yes to "ever refused a U.S. visa or admission" from column X, ' +
                       'which asks about cancellation/revocation - confirm he was actually ' +
                       'refused, and give CEAC a separate explanation if he was');

    // These are the same every time and would drown the real findings,
    // so they are kept in their own bucket.
    const missing = [];
    for (const [k, label] of MISSING_FROM_INTAKE) if (!rec[k]) missing.push({ field: k, msg: label });

    return { errors, warnings, missing, ok: errors.length === 0 };
  }

  // -- worksheet layout, in DS-160 page order -------------------------
  const SECTIONS = [
    { title: 'Personal Information 1', fields: [
      ['surname','Surnames (as in passport)'], ['givenNames','Given Names'],
      ['fullName','Full name as submitted'], ['gender','Sex'],
      ['maritalStatus','Marital Status'], ['dob','Date of Birth'],
      ['pobCity','City of Birth'], ['pobProvince','State/Province of Birth'],
      ['nationality','Country/Region of Birth'] ] },
    { title: 'Personal Information 2', fields: [
      ['nationality','Country/Region of Origin (Nationality)'],
      ['nationalId','National Identification Number (KTP)'] ] },
    { title: 'Address and Phone', fields: [
      ['homeAddress','Home Address'], ['homeCity','City'],
      ['homeState','State/Province'], ['homePostal','Postal Zone/ZIP'],
      ['homeCountry','Country/Region'],
      ['mailingSameAsHome','Mailing address same as home?'],
      ['phone','Primary Phone Number'],
      ['secondaryPhoneNA','Secondary phone - Does Not Apply'],
      ['workPhoneNA','Work phone - Does Not Apply'],
      ['otherPhones5y','Other phone numbers in the last 5 years?'],
      ['email','Email Address'], ['otherEmails5y','Other email addresses in the last 5 years?'],
      ['socialPlatform','Social Media Platform'], ['socialHandle','Social Media Identifier'],
      ['otherWebsites5y','Provide any other websites or applications?'] ] },
    { title: 'Passport', fields: [
      ['passportType','Passport/Travel Document Type'],
      ['passportNumber','Passport Number'],
      ['passportIssuedCountry','Country/Authority that Issued'],
      ['passportIssuePlace','City where Issued'],
      ['passportIssuedState','State/Province where Issued'],
      ['passportIssuedInCountry','Country/Region where Issued'],
      ['passportIssued','Issuance Date'], ['passportExpiry','Expiration Date'],
      ['visaLostStolen','Ever lost or stolen?'], ['lostDetails','Explain'] ] },
    { title: 'Travel', fields: [
      ['visaType','Visa Class'], ['vesselName','Vessel / Ship Name'],
      ['employerName','Principal / Employer'], ['arrivalDate','Intended Date of Arrival'],
      ['stayAddress','Address Where You Will Stay'], ['tripPayer','Person Paying for Trip'] ] },
    { title: 'U.S. Point of Contact', fields: [
      ['usPocName','Contact Name'],
      ['usPocOrgNA','Organization Name - Do Not Know'],
      ['usPocAddress','Address'], ['usPocPhone','Phone'], ['usPocEmail','Email'] ] },
    { title: 'Family - Relatives', fields: [
      ['fatherName',"Father's Full Name"], ['fatherDob',"Father's Date of Birth"],
      ['motherName',"Mother's Full Name"], ['motherDob',"Mother's Date of Birth"] ] },
    { title: 'Family - Spouse', fields: [
      ['spouseName','Spouse Full Name'], ['spouseDob','Spouse Date of Birth'],
      ['spouseNationality','Spouse Nationality'], ['spousePob','Spouse Place of Birth'],
      ['marriageDate','Date of Marriage'], ['marriageEnded','Date Marriage Ended'],
      ['marriageEndHow','How the Marriage Ended'], ['marriageEndCountry','Country Terminated'] ] },
    { title: 'Present Work / Education', fields: [
      ['employerName','Present Employer'], ['employerAddress','Employer Address'],
      ['employerPhone','Employer Phone'], ['employerStart','Start Date'],
      ['jobTitle','Job Title'] ] },
    { title: 'Previous Work / Education', fields: [
      ['prevEmployed','Previously employed?'], ['prevEmployerName','Employer Name'],
      ['prevEmployerAddress','Employer Address'], ['prevEmployerPhone','Employer Phone'],
      ['prevJobTitle','Job Title'], ['prevSupervisor',"Supervisor's Name"],
      ['prevStart','Employment From'], ['prevEnd','Employment To'],
      ['prevCountry','Country'] ] },
    { title: 'Additional Education', fields: [
      ['educationLevel','Highest Level Completed'],
      ['hsName','School Name'], ['hsAddress','School Address'], ['hsCourse','Course of Study'],
      ['hsFrom','Attendance From'], ['hsTo','Attendance To'],
      ['uniName','University Name'], ['uniAddress','University Address'],
      ['uniCourse','Course of Study'], ['uniFrom','From'], ['uniTo','To'] ] },
    { title: 'Previous U.S. Travel', fields: [
      ['beenInUs','Have you ever been in the U.S.?'],
      ['lastUsArrival','Date Arrived'],
      ['prevStayLength','Length of Stay'], ['prevStayUnit','Length of Stay (period)'],
      ['priorUsVisa','Have you ever been issued a U.S. visa?'],
      ['usDriverLicense','Do you hold a U.S. driver licence?'],
      ['lastVisaIssued','Date Last Visa Was Issued'], ['lastVisaNumber','Visa Number'],
      ['sameVisaType','Applying for the same visa type?'],
      ['sameCountryResidence','Applying where the last visa was issued, and resident there?'],
      ['tenPrinted','Have you been ten-printed?'],
      ['visaRevoked','Visa ever cancelled or revoked? (column X)'],
      ['revokedDetails','Explain'],
      ['visaRefused','Ever refused a visa or admission? (also column X)'],
      ['immigrantPetition','Immigrant petition ever filed on your behalf?'],
      ['countries5y','Countries Visited in the Last 5 Years'] ] },
    { title: 'CTI Tracking (not on DS-160)', fields: [
      ['cruiseLine','Cruise Line'], ['visaAppId','Visa Application ID'],
      ['visaStatus','Visa Status'], ['bniva','BNIVA Number'],
      ['appointmentDate','Appointment Date'], ['embassy','Embassy Location'],
      ['paymentStatus','Payment Status'], ['notes','Notes'] ] },
  ];

  const api = { toRecord, validate, SECTIONS, MAP, MISSING_FROM_INTAKE, stayUnit, stayCount, STAY_UNITS,
                parseDate, fmtDate, dateStr, normPhone, splitName, yn, monthsBetween, toJs };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160 = api;
})(typeof self !== 'undefined' ? self : this);
