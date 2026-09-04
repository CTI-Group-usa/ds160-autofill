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
    /* THE FLOOR IS ABOUT DIGIT COUNT, NOT MAGNITUDE. It exists so a bare
       four-digit year is never read as a serial, and 10000 is where five
       digits begin (1927-05-18). It was 20000 - which is 1954-10-03 - so
       EVERY date before that fell through to `new Date(s)` and came back as
       a year: a father born on serial 18628 became 01-JAN-18628. Parents'
       dates of birth live squarely in that range, and the failure was
       silent - a five-digit year fails splitDate(), so the extension
       reported "no value in record" while the value was right there in the
       sheet. */
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) >= 10000 && Number(s) < 60000) return fromSerial(Number(s));

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
    /* A STRING OF DIGITS THAT REACHED HERE IS NOT A DATE. This fallback is
       for odd textual formats; handing it bare digits is how `new Date` turns
       18628 into the year 18628 and 1995 into 01-JAN-1995 - a day and month
       nobody stated, on a sworn form. Any number that was a real serial was
       taken by the branch above, so refuse the rest and let validate() quote
       the cell. */
    if (/^\d+(\.\d+)?$/.test(s)) return null;
    const d = new Date(s);
    return isNaN(d) ? null : { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }

  /* CEAC prints and expects DD-MMM-YYYY. */
  function fmtDate(p) {
    return p ? String(p.d).padStart(2, '0') + '-' + MONTHS[p.m - 1] + '-' + p.y : '';
  }
  const dateStr = raw => fmtDate(parseDate(raw));

  /* The four education columns are headed "Year of ..." but hold full dates -
     the user confirmed there are no year-only values in the sheet. They still
     go through a stricter parser than `dateStr`: a bare 4-digit year would
     otherwise come back as 01-JAN-YYYY, a day and month nobody stated, on a
     sworn form. Empty is the honest answer, and validate() asks for the rest. */
  const strictDate = raw => (/^\s*\d{4}\s*$/.test(clean(raw)) ? '' : dateStr(raw));
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

  /* CEAC PHONE BOXES TAKE DIGITS ONLY. Its own error message is the rule:
     "Phone number must be 5-15 digits, with no spaces or hyphens (-)". A
     leading + is rejected as well, which is how +628195201137810 came back
     invalid on a live page - fifteen digits, within range, refused for the
     plus alone. So no phone value this file produces carries one, and neither
     does any phone constant. */
  /* MONTHLY SALARY: THE SHEET WRITES A CURRENCY, CEAC WANTS A NUMBER.
     Every one of the 69 rows in the J1 export reads like "4200000.00 IDR",
     and CEAC's Monthly Income in Local Currency box takes digits - the
     currency is implied by the question. So strip the code and the decimal
     fraction and keep the amount.

     Separators are the awkward part: Indonesian writes 4.200.000,00 while
     this export writes 4200000.00, and "." means opposite things in the two.
     A trailing group of ONE OR TWO digits after a separator is a fraction and
     is dropped; three digits is a thousands group and is kept. Then every
     remaining separator goes.

     ZERO IS NOT AN AMOUNT. Fifteen of those 69 rows hold 0.00 IDR, which is
     the sheet saying "no salary" - the same answer as an empty cell, and the
     derivation below reads it that way. Returning '0' would type a zero
     income onto a sworn form. */
  function normMoney(raw) {
    let t = deExp(raw).replace(/[^0-9.,]/g, '');
    t = t.replace(/[.,](\d{1,2})$/, '');
    t = t.replace(/[.,]/g, '');
    if (!/^\d+$/.test(t)) return '';
    return String(Number(t)) === '0' ? '' : String(Number(t));
  }
  const PHONE_DIGITS = /[^0-9]/g;

  /* Third-party numbers keep the sheet's own digits. `normPhone` below is
     Indonesia-specific, and an employer is not always Indonesian: Carnival
     UK's Southampton number 02380655000 came out as 622380655000, a number
     that does not exist. An Indonesian landline starts with 0 too (0361, 021),
     so a prefix cannot tell them apart - and CEAC takes the local format. Only
     the applicant's own number, which is always Indonesian, is normalised. */
  /* A BACKSTOP FOR EXPONENTIAL NUMBERS, mirroring xlsx.js -> expandExp().
     That is where the real fix lives - at the reader, so it covers every
     column - but the worksheet also takes CSV and pasted TSV, and Excel writes
     the same cell as "6.2895410887918E+13" there. Without this, the CSV route
     keeps the bug the xlsx route no longer has, which is the worst shape for a
     bug to have: fixed on the path anyone tests and live on the other one.

     Note the '+', which xlsx does not write and CSV does. */
  function deExp(raw) {
    const t = clean(raw);
    if (!/^[-+]?\d+(\.\d+)?[eE]\+?\d+$/.test(t)) return t;
    const n = Number(t);
    if (!isFinite(n)) return t;
    return Number.isInteger(n) ? n.toFixed(0) : String(n);
  }

  /* Digits of a numeric cell, exponent expanded first. For ID numbers that
     are numbers rather than measurements - a KTP, a visa number, a SEVIS id. */
  const numText = raw => deExp(raw).replace(/\s+/g, ' ').trim();
  const phoneAsWritten = raw => deExp(raw).replace(PHONE_DIGITS, '');

  /* THE SHEET DROPS THE HYPHENS CEAC REQUIRES. Column CI holds the DS-2019
     programme number, and the export writes it two ways: 30 rows as
     `P-3-05133` and 18 as `P305133`. The filed sample shows CEAC's own
     rendering is the hyphenated one, and the compressed form maps onto it
     unambiguously - P, one category digit, five digits.

     Anything else is PASSED THROUGH AS WRITTEN rather than dropped. Seven
     rows hold things like `PL52-449`, `J 1 PROGRAM` and a bare `-`, and
     returning '' for those would leave the box empty with the sheet's own
     value nowhere in sight. Filled and flagged is better: validate() names
     it, the operator sees it, and CEAC rejects a malformed number itself. */
  function normProgram(raw) {
    /* Whitespace is stripped only to MATCH. A value that falls through keeps
       the sheet's own spacing, because "J1PROGRAM" is harder to recognise on
       screen than the "J 1 PROGRAM" somebody actually typed. */
    const orig = upper(deExp(raw));
    const t = orig.replace(/\s+/g, '');
    if (/^P-\d-\d{5}$/.test(t)) return t;
    const m = t.match(/^P(\d)(\d{5})$/);
    return m ? 'P-' + m[1] + '-' + m[2] : orig;
  }

  /* A SEVIS id is N plus ten digits (N0037491619 in the filed sample). Kept
     deliberately loose - strip punctuation and upper-case, nothing more -
     because an over-strict pattern that returned '' would DROP a real id, and
     an unusual one is better filled and flagged than silently gone. One row
     of the export holds it as a float, which xlsx.js now expands. */
  const normSevis = raw => upper(deExp(raw)).replace(/[^A-Z0-9]/g, '');
  /* Indonesian mobile numbers arrive as 08xx, 628xx, +62 8xx, 8xx... */
  function normPhone(raw) {
    let s = deExp(raw).replace(PHONE_DIGITS, '');
    if (!s) return '';
    if (s.startsWith('0')) s = '62' + s.slice(1);
    else if (s.startsWith('8')) s = '62' + s;
    return s;
  }

  /* DS-160 has no "single name" option: a mononym goes in Surnames and
     Given Names becomes FNU. Anything longer is a guess until someone
     checks it against the passport MRZ, so we always flag it. */
  function splitName(raw) {
    let t = upper(raw).replace(/[^A-Z' -]/g, ' ').split(/\s+/).filter(Boolean);
    /* "FNU" is the DS-160 placeholder for a name that does not exist - it is
       never a name itself. It arrives in already-processed intake data, and
       taking it as a real token put FNU in Surnames and the actual single
       name in Given Names, exactly backwards: "SUROSO FNU" filled the live
       page as Surnames FNU / Given Names SUROSO. Drop it and let the mononym
       rule below put the real name where it belongs. */
    if (t.length > 1) t = t.filter(x => x !== 'FNU');
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
    'KTP Number':                                                    ['nationalId', s => deExp(s).replace(/\D/g, '')],
    "Countries I've Been to in the Last 5 Years":                    ['countries5y', clean],
    'Do you have US Driver License?':                                ['usDriverLicense', yn],
    'Have you ever been issued U.S. Visa?':                          ['priorUsVisa', yn],
    'When did you arrive in the US?':                                ['lastUsArrival', dateStr],
    'Period Type of Stay in the US':                                 ['stayUnit', clean],
    'How long did you stay in the US?':                              ['stayLength', clean],
    'Date last Visa was issued':                                     ['lastVisaIssued', dateStr],
    'Last Visa Number':                                              ['lastVisaNumber', s => upper(numText(s))],
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
    "Current Workplace's Phone Number":                              ['employerPhone', phoneAsWritten],
    'Start Date at Current Workplace':                               ['employerStart', dateStr],
    'Current Employment Position':                                   ['jobTitle', upper],
    'Were you previously employed?':                                 ['prevEmployed', yn],
    'Previous Work Place Name':                                      ['prevEmployerName', upper],
    'Previous Workplace Address':                                    ['prevEmployerAddress', clean],
    'Previous Workplace Phone Number':                               ['prevEmployerPhone', phoneAsWritten],
    'Previous Workplace Working Position':                           ['prevJobTitle', upper],
    "Previous Workplace Manager's Name":                             ['prevSupervisor', upper],
    'Previous Workplace Start Date':                                 ['prevStart', dateStr],
    'Previous Workplace Ended Date':                                 ['prevEnd', dateStr],
    'Previous Workplace Country':                                    ['prevCountry', upper],
    'Please select your highest level of education':                 ['educationLevel', clean],
    'Name of high school/vocational school':                         ['hsName', upper],
    'Address of high school/vocational school':                      ['hsAddress', clean],
    'Course of Study in High School/Vocational School':              ['hsCourse', clean],
    'Year of High School/Vocational School Entry':                   ['hsFrom', strictDate],
    'Year of High School High School Graduation':                    ['hsTo', strictDate],
    'Name of College/University':                                    ['uniName', upper],
    'Address of College/University':                                 ['uniAddress', clean],
    'Course of Study in College/University':                         ['uniCourse', clean],
    'Year of College/University Entry':                              ['uniFrom', strictDate],
    'Year of High School/University Graduation':                     ['uniTo', strictDate],
    'Payment Status':                                                ['paymentStatus', clean],
    'Visa Application ID':                                           ['visaAppId', clean],
    'Visa Status':                                                   ['visaStatus', clean],
    'BNIVA Number':                                                  ['bniva', clean],
    'Appointment Date':                                              ['appointmentDate', dateStr],
    'Embassy Location':                                              ['embassy', clean],
    'Notes':                                                         ['notes', clean],

    /* ---- J1 Visa Log ------------------------------------------------
       The J1 sheet is ~90% the same form, but 108 columns instead of 95 and
       several worded differently. Column POSITIONS differ throughout and that
       costs nothing: this map is keyed on the header TEXT.

       Aliases sit alongside the C1/D spelling rather than replacing it, and
       toRecord() takes the first NON-EMPTY one per key, so a row only ever has
       one of each pair. Case and punctuation are already forgiven by the loose
       lookup, so only genuinely different WORDING is listed here. */
    'Current employment job title':                                  ['jobTitle', upper],
    'Previous workplace working job title':                          ['prevJobTitle', upper],
    "Previous workplace supervisor's Name":                          ['prevSupervisor', upper],
    'Name of Senior High School/Vocational School':                  ['hsName', upper],
    'Address of Senior High School/Vocational School':               ['hsAddress', clean],
    'Course of Study in Senior High School/Vocational School':       ['hsCourse', upper],
    'Year of Senior High School/Vocational School Entry':            ['hsFrom', strictDate],
    'Year of Senior High School/Vocational School Graduation':       ['hsTo', strictDate],
    /* "High Collage" is the sheet's own typo. Left exactly as written - the
       lookup matches the header the file actually has, not the one it should. */
    'Year of High Collage/University Graduation':                    ['uniTo', strictDate],
    'Countries you have been to in the last 5 years':                ['countries5y', clean],
    'Date last U.S. Visa was issued':                                ['lastVisaIssued', dateStr],

    /* Fields the J1 form collects that the C1/D one never does. */
    'National Identification Number (KTP)':                          ['nationalId', numText],
    'U.S. Social Security Number (if any)':                          ['ssn', clean],
    'U.S. Taxpayer ID Number (if any)':                              ['taxId', clean],
    'Monthly Salary':                                                ['monthlyIncome', normMoney],
    'Provide a list of languages you speak':                         ['languages', upper],
    'SEVIS ID':                                                      ['sevisId', normSevis],
    'Program Number':                                                ['programNumber', normProgram],

    /* J1's payer is a PERSON, not a company - a different branch of the
       DS-160 question entirely. See constants-j1.js. */
    'Name of the person paying for your trip':                       ['payerPersonName', upper],
    'Phone number of the person paying for your trip':               ['payerPersonPhone', phoneAsWritten],
    'Email address of the person paying for your trip':              ['payerPersonEmail', clean],
    'Relationship to you':                                           ['payerRelationship', upper],

    /* And its U.S. contact is the host employer, collected per applicant,
       where C1/D has the cruise line's as a constant. */
    'Point of contact':                                              ['usPocName', upper],
    'Point of contact address':                                      ['usPocAddress', clean],
    'Point of contact phone number':                                 ['usPocPhone', phoneAsWritten],
    'Point of contact email Address':                                ['usPocEmail', clean],
    /* NAME (2). The J1 pack carries Name (1) as constants - CTI Indonesia -
       so the sheet's contact is the second block, and the keys say so. */
    'Additional point of contact':                                   ['addPoc2Name', upper],
    'Additional point of contact address':                           ['addPoc2Address', clean],
    'Additional point of contact phone number':                      ['addPoc2Phone', phoneAsWritten],
    'Additional point of contact email Address':                     ['addPoc2Email', clean],

    /* Junior High School - a THIRD education level the C1/D sheet has no
       columns for. CEAC's education block is one repeating set, so this is a
       further candidate for the block chooser, not an extra block. */
    'Name of Junior High School':                                    ['jhsName', upper],
    'Address of Junior High School':                                 ['jhsAddress', clean],
    'Year of Junior High School Entry':                              ['jhsFrom', strictDate],
    'Year of Junior High School Graduation':                         ['jhsTo', strictDate],
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
    ['employerCountry','Employer / school - country/region'],
    /* Column BB is one free-text address and BP likewise, so neither block has
       a city, state or postal code to fill - and the "Briefly describe your
       duties" box has no column at all (BD is the position, not the duties).
       All six are named here so the report says "the intake form does not
       collect this" instead of the red re-send banner, which no amount of
       re-sending would clear. */
    ['prevEmployerCity','Previous employer - city (one address column in the sheet)'],
    ['prevEmployerState','Previous employer - state / province'],
    ['prevEmployerPostal','Previous employer - postal code'],
    ['prevDuties','Previous employer - briefly describe your duties'],
    ['eduCity','Educational institution - city'],
    ['eduState','Educational institution - state / province'],
    ['eduPostal','Educational institution - postal code'],
    ['employerCity',   'Employer / school - city (one address column in the sheet)'],
    ['employerState',  'Employer / school - state / province'],
    ['employerPostal', 'Employer / school - postal code'],
    ['arrivalDate',   'Intended date of arrival in the US'],
    ['stayAddress',   'Address where you will stay in the US'],
    ['tripPayer',     'Person / entity paying for the trip'],
  ];

  /* HEADERS ARE MATCHED LOOSELY, AND SEVERAL MAY FEED ONE KEY.
     Two things forced this, both found while reading the J1 Visa Log:

     1. The lookup was exact and case-sensitive, so `Start date at current
        workplace` and `Start Date at Current Workplace` are different columns
        as far as it was concerned - the same field, silently lost. Nobody
        edits a Zoho form thinking about capitals.
     2. The J1 sheet words a dozen columns differently from the C1/D one
        (`Current employment job title` vs `Current Employment Position`), so
        one key needs several accepted spellings.

     Aliases could not just be added to MAP as extra entries: `toRecord` assigns
     in MAP order, so an alias the row does NOT have would overwrite a good
     value with ''. Hence two passes - collect every candidate, then take the
     first NON-EMPTY one per key. */
  const looseKey = h => String(h == null ? '' : h)
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function looseIndex(row) {
    const idx = {};
    for (const h in row) {
      const k = looseKey(h);
      if (!(k in idx)) idx[k] = row[h];      // first spelling in the row wins
    }
    return idx;
  }

  function toRecord(row) {
    const rec = {};
    const idx = looseIndex(row);
    /* key -> the formatter to use, plus the best raw value found for it.
       Named `chosen`, not `pick`: the education-block chooser further down this
       function already owns that name. */
    const chosen = {};
    for (const header in MAP) {
      const [key, fn] = MAP[header];
      const raw = (header in row) ? row[header] : idx[looseKey(header)];
      const filled = raw !== undefined && raw !== null && String(raw).trim() !== '';
      if (!(key in chosen) || (!chosen[key].filled && filled)) {
        chosen[key] = { fn: fn, raw: raw, filled: filled };
      }
    }
    /* A CELL THE SHEET FILLED IN BUT THE PARSER REJECTED IS NOT AN EMPTY
       CELL, and only this loop can tell the two apart - by the time it is a
       record field both are ''. Column AJ held a father's date of birth as an
       Excel serial the parser refused, and the only trace anywhere was an
       empty CEAC dropdown and a report line reading "no value in record".
       validate() names these, quoting the cell. */
    rec._unreadable = [];
    for (const key in chosen) {
      rec[key] = chosen[key].fn(chosen[key].raw);
      /* Dates only. Every other transform has a legitimate reason to return
         '' for a non-empty cell - stayUnit() on wording it cannot place, the
        yes/no readers - and validate() already reports those in their own
        words. Widening this would double up on them. */
      if (chosen[key].filled && rec[key] === '' &&
          (chosen[key].fn === dateStr || chosen[key].fn === strictDate))
        rec._unreadable.push({ key: key, raw: clean(chosen[key].raw) });
    }
    const n = splitName(rec.fullName);
    rec.surname = n.surname;
    rec.givenNames = n.given;
    rec._nameMononym = n.mononym;
    rec._nameGuessed = n.guessed;

    /* "Present Employer or School" comes straight from columns AU-AY, the
       "Current Workplace" block. A conditional source keyed on column AZ was
       built here on 2026-09-01 and reverted the same day at the user's
       request: AU holds whatever that seafarer's employer or school actually
       is - a shipping company for one applicant, "INSTITUTE TOURISM OF SAHID"
       for another - so there is nothing to branch on. Do not reintroduce it.

       CTI Indonesia appearing in this box for one applicant was that row's
       own AU value, not a mapping error. The agency block on the Crew Visa
       page is separate and lives in constants.js. */

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

    /* COLUMN Q "IN DAYS" IS A SAME-DAY TRANSIT, and CEAC's answer for that is
       LESS THAN 24 HOURS - the user's rule, 2026-09-02. CTI's crew go ashore
       and back aboard on one tide, and "in days" is the shortest period the
       intake form offers, so that is how it arrives.

       Left as DAY(S) the page could not be completed: the dropdown was set,
       the number box beside it stayed blank, and the report only said
       `prevStayLength - no value in record` with nothing to fill it from.

       Guarded on a number being ABSENT, and that matters: Q "In Days" with a
       5 in column R is five days, and rewriting that to "less than 24 hours"
       would swear to something the sheet contradicts. That branch keeps
       DAY(S) + 5, and validate() names both outcomes so neither passes
       unseen. */
    rec._stayDaysNoCount = rec.prevStayUnit === 'DAY(S)' && !rec.prevStayLength;
    if (rec._stayDaysNoCount) rec.prevStayUnit = 'LESS THAN 24 HOURS';

    /* Keys this record leaves empty ON PURPOSE, so the filler reports them as
       "left blank on purpose" instead of "no value in record" - the latter is
       the string popup.js reads as "the record is stale, send it again", and
       re-sending can never fill a box CEAC greys out. */
    rec._blankOnPurpose = [];
    if (rec.prevStayUnit === 'LESS THAN 24 HOURS') rec._blankOnPurpose.push('prevStayLength');

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

    /* Spouse's Place of Birth has a Country/Region box and the sheet has no
       column for it. At the user's instruction it comes from column AO, which
       is headed "Husband/Wife Country (Nationality)" - so one cell answers two
       DS-160 questions, the way column V answers two and column X answers two.
       validate() flags a non-Indonesian value, where the two really can differ. */
    rec.spousePobCountry = rec.spouseNationality || '';

    /* CEAC's education block is ONE set of fields - Name of Institution,
       Address, Course of Study, Date of Attendance From / To - and the sheet
       carries two candidate blocks. Column BI picks which, at the user's
       instruction:
         BI = High School / Vocational School -> BJ..BN
         BI = College / University            -> BO..BS
       This is NOT keyed on column AZ; that mistake was made earlier today and
       corrected. AZ only decides whether the previous-EMPLOYER block is
       filled (from BA..BH). */
    const lvl = upper(rec.educationLevel);
    let pick = /COLLEGE|UNIVERS|DIPLOMA|SARJANA|POLITEKNIK|AKADEMI/.test(lvl) ? 'uni'
             : /HIGH SCHOOL|VOCATION|SMA\b|SMK\b|SEKOLAH MENENGAH/.test(lvl) ? 'hs' : '';
    if (!pick) {
      /* BI unreadable. One block with a name is no ambiguity; both or neither
         is not ours to guess - validate() asks instead. */
      if (rec.uniName && !rec.hsName) pick = 'uni';
      else if (rec.hsName && !rec.uniName) pick = 'hs';
    }
    if (pick === 'uni') {
      rec.eduName = rec.uniName; rec.eduAddress = rec.uniAddress;
      rec.eduCourse = rec.uniCourse; rec.eduFrom = rec.uniFrom; rec.eduTo = rec.uniTo;
    } else if (pick === 'hs') {
      rec.eduName = rec.hsName; rec.eduAddress = rec.hsAddress;
      rec.eduCourse = rec.hsCourse; rec.eduFrom = rec.hsFrom; rec.eduTo = rec.hsTo;
    } else {
      rec.eduName = ''; rec.eduAddress = ''; rec.eduCourse = '';
      rec.eduFrom = ''; rec.eduTo = '';
    }
    rec._eduSource = pick === 'uni' ? 'college / university (columns BO-BS)'
                   : pick === 'hs'  ? 'high school / vocational (columns BJ-BN)'
                   : '';

    /* "Have you traveled to any countries/regions within the last five years?"
       comes from column M. The user's rule: the literal "NONE" means No, and
       anything else means Yes with the FIRST country filling the one visible
       row. The other six questions on that page are constants.

       An earlier pass here answered Yes for any non-empty cell, which made
       "NONE" a Yes - and then left the country list CEAC demands empty.

       Only the first row is filled. Each further country needs an "Add
       Another" postback, and a burst of those is what got the agent blocked
       out of CEAC once, so validate() hands the rest back instead. */
    const visited = clean(rec.countries5y);
    const noneVisited = !visited || /^(none|nil|tidak ada|-)$/i.test(visited);
    const countryList = noneVisited ? []
      : visited.split(/[,;/\n]|\band\b|\bdan\b/i).map(s => clean(s)).filter(Boolean);
    rec.countriesVisited     = noneVisited ? 'NO' : 'YES';
    rec.firstCountryVisited  = countryList.length ? upper(countryList[0]) : '';
    rec._otherCountriesVisited = countryList.slice(1).join(', ');

    /* A parent with one name is filled as Surnames + a ticked "Do Not Know"
       beside Given Names. Typing the literal "FNU" there was wrong: CEAC
       prints those letters BECAUSE the box is ticked. The applicant's own
       Given Names on Personal 1 has no such box, so `givenNames` keeps FNU. */
    /* SSN, U.S. TAXPAYER ID AND MONTHLY SALARY - DERIVED, AND THE DERIVATION
       DOES NOT NEED TO KNOW THE VISA CLASS. The C1/D sheet has no columns for
       these three, so every application ticks Does Not Apply; the J1 sheet
       collects all three ("if any" - columns K, L and AY). The answer follows
       from whether the cell holds an amount, which is the same question in
       both classes, so there is no branch on `_class` here and none is wanted.

       ONLY THE POSITIVE CASE IS ASSERTED. 'NO' means \"leave this box
       unticked\" and blocks the pack's default, because apply() treats '' as
       unset and would tick over it. An empty cell leaves the key alone, so
       each pack's own constant still ticks it and the panel switch stays
       live - a toggle that silently does nothing is worse than no toggle.

       This is the wrong-fill shape that made one app with two packs the
       right answer: a ticked box over a number the seafarer gave is a wrong
       sworn answer, and a ticked box is not a gap, so nothing would notice. */
    if (rec.ssn)           rec.ssnNA = 'NO';
    if (rec.taxId)         rec.taxIdNA = 'NO';
    if (rec.monthlyIncome) rec.monthlyIncomeNA = 'NO';
    rec.fatherGivenNA = splitName(rec.fatherName).mononym ? 'YES' : '';
    rec.motherGivenNA = splitName(rec.motherName).mononym ? 'YES' : '';
    /* CEAC greys the number box out for this option, so writing a count
       there would either fail silently or contradict the dropdown. */
    if (rec.prevStayUnit === 'LESS THAN 24 HOURS') rec.prevStayLength = '';

    // The vessel name and IMO number live in the supporting letter, not
    // in any column - carry the link through so the agent can open it.
    /* A filed application shows the Latin full name here, not a ticked
       "Does Not Apply" - see the ALDI MAULANA RIZKY sample.

       BUILT FROM THE SPLIT, not from the raw cell. Some intake rows write the
       name with a comma - "I PUTU JULI, FRINDAYANA" - and passing that through
       put the comma on the live form. A name has no punctuation in it: the
       comma is the sheet's separator, and `splitName()` already treats it as
       one, so given + surname reproduces the passport order without it. A
       mononym is the single name alone - never "FNU SUROSO". */
    rec.nativeName = n.mononym ? n.surname : (n.given + ' ' + n.surname).trim();

    /* DOCUMENT LINKS. The cell renders empty in Zoho Sheet because it holds a
       hyperlink rather than text, so xlsx.js attaches both storage forms as
       `_links` - and the real workbook turned out to store some of them as the
       cell's own text, hence the fallback. */
    const links = row._links || {};
    const docUrl = header => {
      const cell = clean(row[header]);
      return links[header] || (/^https?:\/\//i.test(cell) ? cell : '');
    };
    rec.supportingLetterUrl = docUrl('Supporting Letter');
    /* THE THREE J1 ATTACHMENTS - columns CN, CO and CP - which live in their
       own Zoho Drive folder, not with the supporting letters. Between them they
       carry every answer this sheet cannot:

         DS-7002 (CN)  the richest: SEVIS id and programme number BOTH
                       LABELLED, the training dates, the host organisation and
                       its address, and the supervisor who is the U.S. contact
         DS-2019 (CO)  item 3, the programme period - and the J1 sheet has no
                       arrival or departure column at all, while CEAC demands a
                       full itinerary once specific travel plans are YES
         SEVIS   (CP)  the I-901 receipt: name, SEVIS id, date of birth. A
                       cross-check rather than a source.

       All three go to the same parser, which identifies the document itself -
       see j1docs.js. */
    rec.ds7002Url = docUrl('DS-7002');
    rec.ds2019Url = docUrl('DS-2019');
    rec.sevisReceiptUrl = docUrl('SEVIS Receipt');
    for (const [k] of MISSING_FROM_INTAKE) if (!(k in rec)) rec[k] = '';
    rec._raw = row;
    return rec;
  }

  // -- validation ----------------------------------------------------
  /* The worksheet already names every field once, in SECTIONS. A second list
     here would drift from it, so look it up - and fall back to the key, which
     is still more use than nothing. */
  function fieldLabel(key) {
    for (const s of SECTIONS)
      for (const f of s.fields) if (f[0] === key) return f[1] + ' (' + s.title + ')';
    return key;
  }
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

    /* A PARENT BORN AFTER THE APPLICANT IS A TYPO, NOT A DATE. Found in the
       J1 export: one row gives the mother 2026-05-15 against an applicant born
       2006-11-14. It parses cleanly, so nothing else catches it - it would go
       onto a sworn form and be read at the counter. One row in 69, and the
       check is four lines. */
    for (const [k, who] of [['fatherDob', "Father's"], ['motherDob', "Mother's"]]) {
      const p = toJs(parseDate(rec[k]));
      if (!p) continue;
      if (p > today) W(k, who + ' date of birth is in the future (' + rec[k] + ')');
      else if (dob && p >= dob)
        W(k, who + ' date of birth (' + rec[k] + ') is not before the applicant, born (' +
             rec.dob + ') - check the intake cell');
    }

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

    /* A DATE THE SHEET FILLED IN AND THE PARSER REFUSED. By the time it is a
       record field it is '', indistinguishable from a column nobody filled -
       so toRecord() keeps `_unreadable` and this quotes the cell. Column AJ,
       a father's date of birth held as an Excel serial, was rejected outright
       and the only trace was an empty CEAC dropdown and a fill report saying
       "no value in record". Loud beats silent: a date we cannot read is an
       answer the seafarer gave that will not reach the form. */
    for (const u of (rec._unreadable || []))
      E(u.key, fieldLabel(u.key) + ' could not be read as a date (the cell holds "' +
               u.raw + '") - correct the intake column, or fill it in CEAC by hand');

    if (rec.passportNumber && !/^[A-Z0-9]{6,12}$/.test(rec.passportNumber))
      W('passportNumber', 'Unusual passport number format - check for typos or stray spaces');
    if (rec.nationalId && rec.nationalId.length !== 16)
      W('nationalId', 'KTP should be 16 digits, got ' + rec.nationalId.length);
    if (rec.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(rec.email))
      E('email', 'Email address is not valid');
    /* CEAC's own rule, quoted from the page it rejects on: 5-15 digits, no
       spaces, no hyphens, and no leading +. Anything outside that is refused
       when Next is pressed, so it is an error here, not a warning. */
    for (const [k, what] of [['phone', 'Primary phone number'],
                             ['employerPhone', "Employer's phone number"],
                             ['prevEmployerPhone', "Previous employer's phone number"]]) {
      const v = String(rec[k] || '');
      if (!v) continue;
      if (/[^0-9]/.test(v))
        E(k, what + ' still has a character CEAC will not accept (' + v +
             ') - its phone boxes take digits only, no + and no punctuation');
      else if (v.length < 5 || v.length > 15)
        E(k, what + ' is ' + v.length + ' digits (' + v +
             ') - CEAC accepts 5 to 15, and refuses the page otherwise');
    }
    /* AN AMOUNT TOO SMALL TO BE A MONTHLY WAGE. Six of the 69 rows in the J1
       export hold 1.5, 2, 200, 3300, 25000 and 40000 - against a median of
       about 3,000,000 IDR. Whether 40000 is a mistyped 40,000,000 or a real
       figure in some other unit is not ours to decide, so it is filled and
       named rather than corrected. (0.00 is different: normMoney treats it as
       no salary at all, which ticks Does Not Apply.) */
    if (rec.monthlyIncome && Number(rec.monthlyIncome) < 100000)
      W('monthlyIncome', 'Monthly salary reads ' + rec.monthlyIncome + ' in local currency - ' +
                         'too small for a monthly wage in IDR. Check the intake cell for a ' +
                         'missing thousand or a different unit.');

    /* THE DS-2019 PROGRAMME NUMBER AND THE SEVIS ID, both from the sheet and
       both sworn on the form. normProgram() repairs the one shape it can read
       unambiguously (P305133 -> P-3-05133, 18 rows of the export) and passes
       everything else through as written - seven rows hold things like
       `PL52-449`, `J 1 PROGRAM` and a bare `-`. Filled and flagged beats
       dropped: the operator can see the cell, and CEAC rejects a malformed
       number itself. */
    if (rec.programNumber && !/^P-\d-\d{5}$/.test(rec.programNumber))
      W('programNumber', 'Programme number is ' + rec.programNumber + ', which is not ' +
                         'the P-n-nnnnn shape CEAC expects - check it against the DS-2019');
    if (rec.sevisId && !/^N\d{10}$/.test(rec.sevisId))
      W('sevisId', 'SEVIS ID is ' + rec.sevisId + ', which is not N plus ten digits - ' +
                   'check it against the DS-2019');

    /* A POINT OF CONTACT WHO IS THE APPLICANT IS NOT A CONTACT. Column CD is
       the additional point of contact and two of the 69 rows hold the
       applicant's own name, address, phone and email - the intake form was
       filled in wrongly. On the filed sample that row is exactly the one, and
       whoever filed it substituted the host school's contact instead. */
    if (rec.addPoc2Name && rec.fullName &&
        upper(rec.addPoc2Name).replace(/[^A-Z]/g, '') === upper(rec.fullName).replace(/[^A-Z]/g, ''))
      W('addPoc2Name', 'The additional point of contact is the applicant themselves (' +
                       rec.addPoc2Name + ') - the intake cell needs a different person');

    /* THE TOOL CANNOT FILL THESE YET, AND SAYING SO BEATS FAILING QUIETLY.
       CEAC splits the SSN across three boxes and no live J1 Fill report has
       named their ids, so no rule has been written - guessing CEAC ids has
       never once worked on this project. The derivation above already leaves
       the Does Not Apply box CLEAR when a number is present, which is the
       right way round: a visible gap on the page, not a ticked box swearing
       the participant has no SSN. Every row of the export has both columns
       empty, so this fires for nobody today. */
    for (const [k, what] of [['ssn', 'A U.S. Social Security Number'],
                             ['taxId', 'A U.S. Taxpayer ID Number']]) {
      if (!rec[k]) continue;
      W(k, what + ' is in the sheet (' + rec[k] + ') but the DS-160 box ids for it ' +
           'are not known yet - type it into CEAC by hand, then send the Fill report ' +
           'so the rule can be written.');
    }

    if (rec.phone && /^[0-9]+$/.test(rec.phone) && !/^62[0-9]{8,12}$/.test(rec.phone))
      W('phone', 'Phone number does not look like a valid Indonesian number (' + rec.phone +
                 ') - check the intake cell for a stray digit or two numbers in one cell');

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
      /* Column AO is headed "Husband/Wife Country (Nationality)" and now
         answers TWO DS-160 questions: the spouse's nationality and the country
         in the spouse's Place of Birth block, at the user's instruction. The
         two coincide for an Indonesian spouse and part company for anyone born
         abroad, so a foreign value is flagged rather than quietly sworn to. */
      if (rec.spousePobCountry && !/INDONESIA/i.test(rec.spousePobCountry))
        W('spousePobCountry', 'Spouse place of birth country is taken from column AO, the ' +
          'nationality column (' + rec.spousePobCountry + '). Confirm the spouse was born ' +
          'there - a naturalised or foreign-born spouse makes these two different answers');
    }
    if (/DIVORC|WIDOW|CERAI|JANDA|DUDA/.test(rec.maritalStatus) && !rec.marriageEnded)
      W('marriageEnded', 'Previously married - DS-160 asks when and how the marriage ended');

    if (rec.prevEmployed === 'YES' && !rec.prevEmployerName)
      E('prevEmployerName', 'Marked as previously employed but no previous employer given');
    /* The education block is chosen by column BI. If BI is unreadable and both
       candidate blocks carry a name, picking one is not ours to do. */
    if (!rec.eduName) {
      const both = rec.hsName && rec.uniName;
      W('eduName', both
          ? 'Highest level of education (column BI) reads "' + clean(rec.educationLevel) +
            '", which matches neither High School/Vocational nor College/University, ' +
            'and both blocks hold a name - choose the institution by hand'
          : 'No institution for the education block: column BI reads "' +
            clean(rec.educationLevel) + '" and columns BJ-BN / BO-BS are empty');
    }
    /* CEAC requires both of these on the Work/Education page, and both come
       from columns AX and AV. A blank has to be visible rather than silent. */
    if (!rec.employerStart)
      W('employerStart', 'No Start Date for the present employer or school ' +
                         '(column AX), which CEAC requires');
    if (!rec.employerAddress)
      W('employerAddress', 'No address for the present employer or school (column AV)');
    /* The first country fills the one visible row; every further one costs an
       "Add Another" postback, so they are handed back rather than filled. */
    if (rec.countriesVisited === 'YES' && rec._otherCountriesVisited)
      W('countries5y', 'Only the first country is filled (' + rec.firstCountryVisited +
                       '). Add these by hand: ' + rec._otherCountriesVisited);
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
      /* The "in days" -> LESS THAN 24 HOURS rule is worth naming when it
         fires, because it is an interpretation of a coarse intake answer and
         not something the sheet says outright. */
      if (rec._stayDaysNoCount)
        W('prevStayUnit', 'Column Q reads "' + rec.stayUnit + '" with no number in column R, ' +
                          'filled as LESS THAN 24 HOURS (a same-day transit). Change it if ' +
                          'the stay was longer.');
      /* And worth naming when it deliberately does NOT fire. */
      else if (rec.prevStayUnit === 'DAY(S)' && rec.prevStayLength)
        W('prevStayUnit', 'Column Q reads "' + rec.stayUnit + '" and column R states ' +
                          rec.prevStayLength + ', so it is filled as ' + rec.prevStayLength +
                          ' DAY(S) - not LESS THAN 24 HOURS. Confirm which is right.');
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
    { title: 'Crew Visa', fields: [
      ['servingAboardVessel','Serving aboard a seagoing vessel?'],
      ['jobTitleAboard','Specific job title aboard (supporting letter)'],
      ['vesselName','Seagoing Ship / Vessel Name (supporting letter)'],
      ['vesselImo','Vessel Identification Number (supporting letter)'],
      ['vesselOwnerCompany','Company that owns the vessel'],
      ['vesselOwnerPhone','Company Telephone Number'],
      ['usedAgency','Used a recruiting/manning agency?'],
      ['agencyName','Agency Name'], ['agencyPhone','Agency Telephone'] ] },
    { title: 'Sign and Submit', fields: [
      ['fgmcFactSheet','FGM/C Fact Sheet certification - tick'],
      ['preparerAssisted','Did anyone assist you in filling out this application?'],
      ['passportNumber','Passport number, re-entered as the e-signature'] ] },
    { title: 'U.S. Point of Contact', fields: [
      ['usPocName','Contact Name'],
      ['usPocOrgNA','Organization Name - Do Not Know'],
      ['usPocAddress','Address'], ['usPocPhone','Phone'], ['usPocEmail','Email'] ] },
    { title: 'Family - Relatives', fields: [
      ['fatherName',"Father's Full Name"], ['fatherDob',"Father's Date of Birth"],
      ['fatherGivenNA','Father given names - Do Not Know'], ['motherGivenNA','Mother given names - Do Not Know'],
      ['fatherInUs','Is your father in the U.S.?'], ['motherInUs','Is your mother in the U.S.?'],
      ['motherName',"Mother's Full Name"], ['motherDob',"Mother's Date of Birth"] ] },
    { title: 'Family - Spouse', fields: [
      ['spouseName','Spouse Full Name'], ['spouseDob','Spouse Date of Birth'],
      ['spouseNationality','Spouse Nationality (column AO)'],
      ['spousePob','Spouse Place of Birth - city (column AP)'],
      ['spousePobCountry','Spouse Place of Birth - country (column AO, the nationality column)'],
      ['marriageDate','Date of Marriage'], ['marriageEnded','Date Marriage Ended'],
      ['marriageEndHow','How the Marriage Ended'], ['marriageEndCountry','Country Terminated'] ] },
    { title: 'Present Work / Education', fields: [
      ['employerName','Present Employer or School'], ['employerAddress','Address'],
      ['employerCity','City'], ['employerState','State/Province'],
      ['employerPostal','Postal Zone/ZIP'], ['employerCountry','Country/Region'],
      ['monthlyIncomeNA','Monthly Income - Does Not Apply'],
      ['employerPhone','Phone'], ['employerStart','Start Date'],
      ['jobTitle','Job Title'] ] },
    { title: 'Previous Work / Education', fields: [
      ['prevEmployed','Were you previously employed? (column AZ)'], ['attendedEducation','Attended a secondary school or above?'], ['prevEmployerName','Employer Name'],
      ['prevEmployerAddress','Employer Address'], ['prevEmployerPhone','Employer Phone'],
      ['prevJobTitle','Job Title'], ['prevSupervisor',"Supervisor's Name"],
      ['prevStart','Employment From'], ['prevEnd','Employment To'],
      ['prevCountry','Country'] ] },
    { title: 'Additional Education', fields: [
      ['educationLevel','Highest Level Completed (column BI)'], ['_eduSource','Education block sourced from'],
      ['eduName','Name of Institution'], ['eduAddress','Institution Address'],
      ['eduCourse','Course of Study'], ['eduCountry','Country/Region'], ['eduFrom','Attendance From'], ['eduTo','Attendance To'],
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
      ['countries5y','Countries Visited in the Last 5 Years (column M)'],
      ['countriesVisited','Traveled abroad in the last 5 years?'], ['firstCountryVisited','First country (filled)'],
      ['_otherCountriesVisited','Other countries (by hand)'],
      ['clanTribe','Belong to a clan or tribe?'], ['languageSpoken','Language spoken'],
      ['belongedOrganization','Belonged to an organization?'],
      ['specializedSkills','Specialized skills or training?'],
      ['militaryService','Served in the military?'], ['insurgentOrg','Insurgent organization?'] ] },
    { title: 'CTI Tracking (not on DS-160)', fields: [
      ['cruiseLine','Cruise Line'], ['visaAppId','Visa Application ID'],
      ['visaStatus','Visa Status'], ['bniva','BNIVA Number'],
      ['appointmentDate','Appointment Date'], ['embassy','Embassy Location'],
      ['paymentStatus','Payment Status'], ['notes','Notes'] ] },
  ];

  const api = { toRecord, validate, SECTIONS, MAP, MISSING_FROM_INTAKE, stayUnit, stayCount, STAY_UNITS,
                parseDate, fmtDate, dateStr, strictDate, normPhone, phoneAsWritten, deExp,
                normMoney, splitName, yn, monthsBetween, toJs };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160 = api;
})(typeof self !== 'undefined' ? self : this);
