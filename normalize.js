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
  /* WHO IS PAYING, IN CEAC'S OWN WORDS. Its dropdown is a closed set -
     - SELECT ONE - | CHILD | PARENT | SPOUSE | OTHER RELATIVE | FRIEND | OTHER
     - and column AA holds the relationship in plain English. Not one of its
     values is an option:

       Father 35, Mother 20            -> PARENT
       Uncle 6, Brother 4, Sister 2,
       Aunt 1, Cousin 1                -> OTHER RELATIVE

     That is 69 rows of 69, every one leaving a required dropdown unset. The
     live report is what found it: "wanted FATHER, page offers - SELECT ONE - |
     CHILD | PARENT | SPOUSE | OTHER RELATIVE | FRIEND | OTHER".

     Indonesian wording is mapped too, because the intake form is filled in by
     the applicant and nothing stops them writing `Ibu`.

     ANYTHING UNPLACED IS PASSED THROUGH, not blanked. On a closed dropdown an
     unmapped word is guaranteed to fail - but it fails as "no matching option,
     wanted X, page offers ...", which is how this bug became visible in the
     first place. Returning '' would report "no value in record" instead, which
     is not true and names the wrong cause. validate() quotes it as well. */
  const PAYER_RELATIONS = [
    [/\bPARENT|FATHER|MOTHER|\bDAD\b|\bMUM\b|\bMOM\b|AYAH|IBU|BAPAK|ORANG\s*TUA/, 'PARENT'],
    [/\bSPOUSE|HUSBAND|\bWIFE\b|SUAMI|ISTRI/, 'SPOUSE'],
    [/\bCHILD|\bSON\b|DAUGHTER|\bANAK\b/, 'CHILD'],
    [/UNCLE|\bAUNT|BROTHER|SISTER|COUSIN|NEPHEW|NIECE|GRAND|IN.?LAW|SAUDARA|KAKAK|ADIK|\bOM\b|TANTE|SEPUPU|KAKEK|NENEK|PAMAN|BIBI/,
     'OTHER RELATIVE'],
    [/FRIEND|TEMAN|SAHABAT/, 'FRIEND'],
  ];
  function payerRelation(raw) {
    const t = upper(raw);
    if (!t) return '';
    for (const [re, out] of PAYER_RELATIONS) if (re.test(t)) return out;
    return t;
  }

  /* THE HOST ORGANISATION'S ADDRESS, AND THE ONE PLACE AN ADDRESS IS READ.
     The user's standing rule stands: no parser for the seafarer's HOME
     address. Indonesian free text has no convention to lean on
     (`DUSUN 2 RT 14 RW 04 BANGLARANGAN AMPELGADING, PEMALANG`), a parser for
     it was built and reverted the same day, and it is not coming back.

     This is a different string. It is a US address, and the user has now
     stated twice what it feeds: the stay address is always the host company's,
     and the arrival and departure cities are the city the host company is in.
     The J1 sheet holds it as one free-text cell, so there is nothing else to
     read it from.

     THE GATE IS A REAL US STATE. Anything whose tail is not a state in this
     table returns null, and validate() then names the cell so the operator
     types the boxes - the same refusal `stayUnit` and `strictDate` already
     make. A shape this tight is not the parser that was banned.

     The code is expanded to the full state name because CEAC's State is a
     dropdown of full names, and setSelect's prefix fallback would answer `MI`
     with MICHIGAN or MINNESOTA - whichever came first. Picking between two
     plausible options is guessing, and this is a visa form. */
  const US_STATES = {
    AL: 'ALABAMA', AK: 'ALASKA', AZ: 'ARIZONA', AR: 'ARKANSAS',
    CA: 'CALIFORNIA', CO: 'COLORADO', CT: 'CONNECTICUT', DE: 'DELAWARE',
    DC: 'DISTRICT OF COLUMBIA', FL: 'FLORIDA', GA: 'GEORGIA', HI: 'HAWAII',
    ID: 'IDAHO', IL: 'ILLINOIS', IN: 'INDIANA', IA: 'IOWA', KS: 'KANSAS',
    KY: 'KENTUCKY', LA: 'LOUISIANA', ME: 'MAINE', MD: 'MARYLAND',
    MA: 'MASSACHUSETTS', MI: 'MICHIGAN', MN: 'MINNESOTA', MS: 'MISSISSIPPI',
    MO: 'MISSOURI', MT: 'MONTANA', NE: 'NEBRASKA', NV: 'NEVADA',
    NH: 'NEW HAMPSHIRE', NJ: 'NEW JERSEY', NM: 'NEW MEXICO', NY: 'NEW YORK',
    NC: 'NORTH CAROLINA', ND: 'NORTH DAKOTA', OH: 'OHIO', OK: 'OKLAHOMA',
    OR: 'OREGON', PA: 'PENNSYLVANIA', RI: 'RHODE ISLAND',
    SC: 'SOUTH CAROLINA', SD: 'SOUTH DAKOTA', TN: 'TENNESSEE', TX: 'TEXAS',
    UT: 'UTAH', VT: 'VERMONT', VA: 'VIRGINIA', WA: 'WASHINGTON',
    WV: 'WEST VIRGINIA', WI: 'WISCONSIN', WY: 'WYOMING',
    AS: 'AMERICAN SAMOA', GU: 'GUAM', MP: 'NORTHERN MARIANA ISLANDS',
    PR: 'PUERTO RICO', VI: 'U.S. VIRGIN ISLANDS',
  };
  /* READ FROM THE RIGHT, ONE COMMA AT A TIME - because the real cells are not
     one shape. A live row reads

       7000 KALAHARI DR, SANDUSKY, OHIO, 44870

     with the state spelled out IN FULL and the ZIP behind its own comma, while
     the DS-7002 writes

       6631 W BROAD ST, RICHMOND, VA 23230

     with a code and a space. The first version was a single regex demanding
     `, CITY, XX 12345`; it matched the second and refused the first, so the
     whole string went into Street Line 1 and no city was ever produced. One
     regex cannot hold both without becoming unreadable, so this walks the
     comma-separated parts backwards: ZIP, then state, then city, and whatever
     is left is the street - which is also why a street containing a comma
     survives intact.

     THE STATE IS STILL THE GATE, and how tight it has to be depends on how it
     is written:

       full name  - OHIO, VIRGINIA. Unambiguous. No ZIP needed.
       two-letter - VA, MO. A ZIP IS REQUIRED, because `ID` is Idaho and also
                    the code Indonesia is written with, and IN/India, MO/Macao,
                    MD/Moldova, MT/Malta and NE/Niger set the same trap. A
                    probe on the first version read
                    `JL RAYA KUTA NO 12, KUTA, ID` as Kuta, IDAHO. Idaho stays
                    in the table - a host company can be in Sun Valley - so
                    what is refused is the bare code, not the state.

     `..., KUTA, ID 80361` would still read as Idaho: an Indonesian postcode is
     five digits too. That is why validate() states the place it read on every
     row, and why refusing is the safe direction - an empty box is a visible
     gap, a filled one is a sworn answer nobody rechecks. */
  const US_STATE_NAMES = {};
  for (const c in US_STATES) US_STATE_NAMES[US_STATES[c]] = US_STATES[c];

  function stateName(raw, hasZip) {
    const t = upper(raw).replace(/\.$/, '').trim();
    if (!t) return '';
    if (US_STATE_NAMES[t]) return US_STATE_NAMES[t];
    if (/^[A-Z]{2}$/.test(t) && hasZip) return US_STATES[t] || '';
    return '';
  }

  function usPlace(raw) {
    const parts = clean(raw).split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    /* The ZIP arrives either behind its own comma or glued to the state. */
    let zip = '';
    const last = parts[parts.length - 1];
    let m = last.match(/^(\d{5})(?:-\d{4})?$/);
    if (m) { zip = m[1]; parts.pop(); }
    else {
      m = last.match(/^(.*?)\s+(\d{5})(?:-\d{4})?$/);
      if (m) { zip = m[2]; parts[parts.length - 1] = m[1].trim(); }
    }
    if (parts.length < 2) return null;

    const state = stateName(parts[parts.length - 1], !!zip);
    if (!state) return null;
    parts.pop();

    const city = parts.pop();
    if (!city || !/[A-Za-z]/.test(city)) return null;

    return { street: parts.join(', '), city: upper(city), state: state, zip: zip };
  }

  /* CEAC's two street boxes take 40 characters each - the maxlength on the
     live page and on the fixture. `addressHalf()` in matcher.js reads that
     attribute off the box, which is the right way round, but it works on ONE
     record key spread over two controls. These are two separate keys, because
     C1/D supplies two distinct constant lines, so the split has to happen here
     against the known cap. Breaking on a space keeps a word whole; the
     alternative is the browser clipping the tail silently, which is how the
     employer address lost text before anyone noticed. */
  function twoLines(raw, max) {
    const t = clean(raw), cap = max || 40;
    if (t.length <= cap) return [t, ''];
    let cut = t.lastIndexOf(' ', cap);
    if (cut <= 0) cut = cap;
    return [t.slice(0, cut).trim(), t.slice(cut).trim()];
  }

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
    'Relationship to you':                                           ['payerRelationship', payerRelation],

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
    /* THE J1 TRAVEL PAGE, from the first live Fill on it (2026-09-04).
       C1/D fills the five stay-address boxes from constants - the cruise
       line's address - and J1's stay address is the HOST ORGANISATION, which
       is per applicant and which the sheet holds only as one free-text string
       in column CA. The user's standing rule for the home address applies
       here too: they arrange City, State/Province and Postal Zone by hand in
       CEAC, and no address parser is to be reintroduced.

       The flights and the "places you will visit" repeater have no column on
       either sheet at all.

       Naming them here is what turns a red "send the applicant again" banner -
       which no re-send could ever clear - into the calm "the intake form does
       not collect this". They are only reported when EMPTY, so C1/D's
       constants still fill the stay block and it stays quiet there. */
    /* These six are DERIVED on J1 whenever the host organisation address
       ends in a US city, state and ZIP - see usPlace(). They stay listed
       because the list is only consulted when a key is EMPTY, which now means
       one of two things: no host address in the sheet, or one this reader
       refused. Both are fixed in the same cell, so both say so. */
    ['arrivalCity',   'Arrival city (J1: read from the host organisation address)'],
    ['departureCity', 'Departure city (J1: read from the host organisation address)'],
    ['arrivalFlight', 'Arrival flight (no column on either sheet)'],
    ['departureFlight','Departure flight (no column on either sheet)'],
    /* NO COLUMN ANYWHERE. The four `Point of contact` columns name the
       person, the address, the phone and the email - not the organisation. So
       this can only come from the DS-7002 (Section 4's Phase Site Name, or
       Host Organization Name) or be typed once in Trip details, and the report
       has to say that instead of asking for a re-send that cannot help. */
    ['usPocOrg',      'US point of contact - organisation name (J1: the DS-7002, or type it in Trip details)'],
    ['travelLocation','Places you will visit (J1: the host organisation city)'],
    ['stayAddr1',     'Address where you will stay - street (J1: the host organisation address)'],
    ['stayAddr2',     'Address where you will stay - second line'],
    ['stayCity',      'Address where you will stay - city (J1: from the host organisation address)'],
    ['stayState',     'Address where you will stay - state (J1: from the host organisation address)'],
    ['stayZip',       'Address where you will stay - ZIP (J1: from the host organisation address)'],
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
    /* WHICH TEMPLATE THIS ROW CAME FROM, in the only terms that matter below:
       does the sheet ASK for the highest level of education? C1/D does - its
       column BI - and the J1 template does not. Checked against the template
       the user supplied on 2026-09-04, and it is not a detail: on the J1 sheet
       BI is *Previous Workplace Country*, so a message naming "column BI"
       there is pointing at the wrong data.

       Keyed on the header being PRESENT, not on its value. An empty BI on a
       C1/D row is a question that was asked and not answered, which is worth a
       warning; a missing BI is a question this template never asks, which is
       not. */
    rec._asksEducationLevel = !!(chosen.educationLevel && chosen.educationLevel.raw !== undefined);

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

    /* CEAC's education block is a REPEATER - Name of Institution, Address,
       Course of Study, Date of Attendance From/To, then "Add Another" - and
       the two templates feed it completely differently.

       C1/D ASKS WHICH ONE. Column BI, "Please select your highest level of
       education", picks between two candidate blocks at the user's
       instruction:
         BI = High School / Vocational School -> BJ..BN
         BI = College / University            -> BO..BS
       That is their rule and it stands. (It is NOT keyed on column AZ; that
       mistake was made on 2026-09-01 and corrected. AZ only decides whether
       the previous-EMPLOYER block is filled.)

       THE J1 TEMPLATE DOES NOT ASK, and carries THREE blocks: junior high
       (BJ-BM), senior high / vocational (BN-BR) and college / university
       (BS-BW). There is nothing to choose, and the filed sample shows why -
       I KETUT JULIANA's application lists them ALL, chronologically:

         Name of Institution (1): SMP NEGERI 11 DENPASAR   Course: JUNIOR HIGH SCHOOL
         Name of Institution (2): SMK NEGERI 3 DENPASAR    Course: KULINER

       Note the first one's course of study: the template has no course column
       for junior high, and the words "JUNIOR HIGH SCHOOL" were typed in. That
       is CTI's own convention, taken from the filed application rather than
       invented here.

       So on J1 the blocks are a LIST. The first is filled and validate() hands
       back the rest, exactly as `languageSpoken` and `firstCountryVisited`
       already do - each "Add Another" costs a postback, and CEAC's WAF has
       blocked this agent three times over bursts of them. */
    const lvl = upper(rec.educationLevel);
    let pick = /COLLEGE|UNIVERS|DIPLOMA|SARJANA|POLITEKNIK|AKADEMI/.test(lvl) ? 'uni'
             : /HIGH SCHOOL|VOCATION|SMA\b|SMK\b|SEKOLAH MENENGAH/.test(lvl) ? 'hs' : '';

    const BLOCKS = [
      { key: 'jhs', label: 'junior high school',
        name: rec.jhsName, address: rec.jhsAddress,
        /* No course column for this block on either template; the filed
           application types the level itself. */
        course: rec.jhsCourse || (rec.jhsName ? 'JUNIOR HIGH SCHOOL' : ''),
        from: rec.jhsFrom, to: rec.jhsTo },
      { key: 'hs', label: 'senior high / vocational school',
        name: rec.hsName, address: rec.hsAddress, course: rec.hsCourse,
        from: rec.hsFrom, to: rec.hsTo },
      { key: 'uni', label: 'college / university',
        name: rec.uniName, address: rec.uniAddress, course: rec.uniCourse,
        from: rec.uniFrom, to: rec.uniTo },
    ].filter(b => b.name);

    let chosenBlocks;
    if (rec._asksEducationLevel) {
      /* The C1/D path, unchanged. BI names one block and the others are not
         filled; if BI is unreadable, one candidate is no ambiguity and two is
         not ours to guess - validate() asks. */
      if (!pick) {
        const cands = BLOCKS.filter(b => b.key !== 'jhs');
        if (cands.length === 1) pick = cands[0].key;
      }
      chosenBlocks = BLOCKS.filter(b => b.key === pick);
    } else {
      /* The J1 path: chronological, all of them, first one filled. */
      chosenBlocks = BLOCKS;
    }

    const first = chosenBlocks[0] || null;
    rec.eduName = first ? first.name : '';
    rec.eduAddress = first ? first.address : '';
    rec.eduCourse = first ? first.course : '';
    rec.eduFrom = first ? first.from : '';
    rec.eduTo = first ? first.to : '';
    /* NO COLUMN LETTERS HERE EITHER. They were 'BJ-BM' and friends, which are
       the J1 template's letters - on a C1/D sheet the senior-high block is
       BJ-BN, so the string would have been wrong for half the rows. The block
       name is true on both templates; the letters are the part that lies. */
    rec._eduSource = first ? first.label : '';
    /* THE WHOLE LIST, IN ORDER, for the repeater to read row by row.
       CEAC's education block is an ASP.NET DataList: one visible row plus an
       "Add Another" button. The operator presses Add Another - that click is
       the postback - the next row appears, and the next Fill press fills it
       from `_eduList[1]`, then `[2]`. See REPEATED in matcher.js.

       On C1/D this holds exactly ONE entry: column BI names the block to fill
       and the user's rule is that the others are not filled. Pressing Add
       Another there leaves the new row alone, which is the honest answer -
       nothing in the sheet says to swear to a second institution. */
    rec._eduList = chosenBlocks.map(b => ({
      label: b.label, name: b.name, address: b.address,
      course: b.course, from: b.from, to: b.to,
    }));
    /* Names only, for the message. The addresses and dates are in the
       applicant's detail view beside it. */
    rec._eduMore = chosenBlocks.slice(1).map(b => b.label + ': ' + b.name);

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
    /* THE PAYER BOXES TAKE ONE SET OF KEYS, AND THE CLASS DECIDES THE SOURCE.
       CEAC shows one name box, one phone and one email whichever branch of
       "who is paying" was answered, so the matcher has one key each -
       `payerCompany`, `payerPhone`, `payerEmail`. C1/D fills them from
       constants, because the payer is the cruise line. J1's payer is a PERSON
       and the sheet collects them in columns X, Y and Z.

       The live report is what caught this: `payerPhone - no value in record`
       on a row whose column Y holds a number. normalize named it
       `payerPersonPhone` and the matcher looked for `payerPhone` - a value
       sitting in the sheet, landing nowhere, with the report naming a cause
       that was not true.

       Same shape as the SSN derivation: only the positive case is asserted, so
       a sheet without those columns leaves the keys alone and each pack's own
       constants still fill them. No branch on `_class`, and none wanted. */
    if (rec.payerPersonPhone) rec.payerPhone   = rec.payerPersonPhone;
    if (rec.payerPersonEmail) rec.payerEmail   = rec.payerPersonEmail;

    /* ON THE OTHER-PERSON BRANCH THE NAME IS TWO BOXES, NOT ONE. Column X is
       one free-text name - `Ketut Purna Yasa` - and CEAC asks for "Surnames of
       Person Paying for Trip" and "Given Names of Person Paying for Trip"
       separately, exactly as it does for the applicant.

       The live report showed both of those boxes holding PRATAMA / PUTU YUDA -
       THE APPLICANT'S OWN NAME - because `surname` and `givenNames` match on
       `/^surnames/i` and `/^given names/i`, and nothing kept them out of this
       block. Filled, plausible, and sworn to the wrong person; the report
       called them "already correct".

       Split the same way as the applicant's own name, because it is the same
       kind of value from the same kind of cell: last token is the surname, a
       mononym keeps FNU in the given box (there is no "Do Not Know" checkbox
       beside it, so the placeholder is typed - the relatives' arrangement does
       not apply here). And it is flagged the same way, because it is the same
       guess. */
    if (rec.payerPersonName) {
      const pn = splitName(rec.payerPersonName);
      rec.payerSurname     = pn.surname;
      rec.payerGivenNames  = pn.given;
      rec._payerNameMononym = pn.mononym;
      rec._payerNameGuessed = pn.guessed;
      /* Kept for the single-box branch: C1/D's payer is a company and CEAC
         gives it one Name box. Harmless on J1, where no control matches it. */
      rec.payerCompany = rec.payerPersonName;
    }

    /* THE STAY ADDRESS IS ALWAYS THE HOST COMPANY'S - the user's rule, stated
       2026-09-04 after a live report listed all five of its boxes as having no
       value. On J1 the host organisation is also the U.S. point of contact, so
       one cell answers both blocks, and it was reaching NEITHER: the sheet
       names it `usPocAddress` while the matcher has `usPocAddr1`/`usPocAddr2`
       and `stayAddr1`..`stayZip`. A value sitting in the sheet, landing
       nowhere - the third time that exact shape has turned up.

       Positive case only, as with the SSN and the payer: an empty cell leaves
       every key alone, so C1/D's five stay constants - the cruise line's
       address - still fill the block and the panel switch stays live. */
    if (rec.usPocAddress) {
      const place = usPlace(rec.usPocAddress);
      const lines = twoLines(place ? place.street : rec.usPocAddress);
      rec.stayAddr1  = lines[0];
      rec.usPocAddr1 = lines[0];
      if (lines[1]) { rec.stayAddr2 = lines[1]; rec.usPocAddr2 = lines[1]; }
      /* A SECOND STREET LINE THE ADDRESS DOES NOT NEED IS NOT A GAP. CEAC
         marks it *Optional* and `7000 Kalahari Dr` fits the first box with
         room to spare - but both boxes were reporting `no value in record`,
         the string popup.js reads as "stale record, send it again". No
         re-send can invent a second line, so the banner would nag for ever.
         Recorded only when the address WAS read: with no host address at all
         these are honestly missing, and MISSING_FROM_INTAKE says so. */
      else (rec._blankOnPurpose || []).push('stayAddr2', 'usPocAddr2');
      if (place) {
        rec.stayCity   = place.city;
        rec.stayState  = place.state;
        rec.usPocCity  = place.city;
        rec.usPocState = place.state;
        rec.stayZip = place.zip;
        rec.usPocZip = place.zip;
        /* NOT arrivalCity / departureCity. Those are trip fields, and
           `trip.apply()` never overwrites a value the record already holds -
           so setting them here would make this derivation beat the operator's
           own entry for that applicant, which is exactly backwards. trip.js
           falls back to `hostCity` instead, after their own answer. */
        rec.hostCity = place.city;
        /* AND THE PLACES-TO-VISIT REPEATER, at the user's instruction: the one
           location is the host company's city. It goes in as a ONE-ENTRY LIST
           rather than a plain key, because CEAC's repeater shows a row at a
           time and a plain key would hand the same city to every row the
           operator opens with `Add Another` - a duplicate on a sworn form,
           from a button they pressed to add somewhere ELSE. `_eduList` on
           C1/D is the same arrangement for the same reason. */
        rec._travelList = [{ location: place.city }];
        rec.travelLocation = place.city;
      }
      rec._hostPlace = !!place;
    }

    /* THE U.S. CONTACT IS A PERSON AND CEAC ASKS FOR TWO BOXES. The sheet
       holds one cell, `Point of contact`, and the matcher has `usPocSurname`
       and `usPocGiven` - so it was landing NOWHERE. That is the FOURTH time
       this exact shape has turned up, after `payerPersonPhone`,
       `payerPersonName` and `usPocAddress`, and every one of them was a value
       sitting in the sheet with the report naming a cause that was not true.

       Published under its own names rather than written straight onto
       `usPocSurname`, because those are trip fields now: the DS-7002 names the
       supervisor too, and the operator must be able to correct either. trip.js
       reads these as the LAST resort - their own entry, then the document,
       then this. Same arrangement as `hostCity`. */
    if (rec.usPocName) {
      const poc = splitName(rec.usPocName);
      rec.hostPocSurname = poc.surname;
      rec.hostPocGiven   = poc.given;
      rec._hostPocGuessed = poc.guessed;
    }

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
    const errors = [], warnings = [], notes = [];
    const E = (field, msg) => errors.push({ field, msg });
    const W = (field, msg) => warnings.push({ field, msg });
    /* A THIRD CATEGORY, AND THE REASON IT EXISTS. Errors block filing;
       warnings are doubts a human must resolve before swearing to them. Some
       things are neither - they are how a page works, they are true on every
       single row, and nothing is wrong.

       Those were going in the amber list and inflating the "N to check" chip
       on the applicant list. That is the same failure as the comma warning
       fixed earlier today, in a milder form: a line that appears on 69 of 69
       rows and never needs a decision teaches the operator that the amber
       count is noise. Notes are shown calmly and counted nowhere. */
    const N = (field, msg) => notes.push({ field, msg });

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

    /* AN ADDRESS THAT IS NOT AMERICAN CANNOT ANSWER FIVE AMERICAN BOXES.
       Only fires when the cell holds something and its tail is not
       `, CITY, XX` with a real state code - so it is silent on every row the
       derivation handles, and it quotes the value rather than naming a
       column. */
    /* WHAT IT READ, ON EVERY ROW IT READ ONE. A note, not a warning: nothing
       is wrong, it fires on every J1 row, and it needs no decision - so it
       must not inflate the amber count, which is the trap this file records
       for the comma warning and the repeater message. What it buys is that a
       misread address is visible in words instead of only in five boxes. */
    if (rec._hostPlace)
      N('stayCity', 'The stay address, the arrival and departure cities and ' +
                    'the place you will visit all come from the host ' +
                    'organisation: ' + rec.stayAddr1 + ', ' + rec.stayCity +
                    ', ' + rec.stayState + ' ' + rec.stayZip);
    if (rec.usPocAddress && !rec._hostPlace)
      W('stayCity', 'The host organisation address reads "' + rec.usPocAddress +
                    '", which does not end in a US city, state and ZIP ' +
                    'code - so the stay city, state and ZIP, and the arrival ' +
                    'and departure cities, have to be typed in');

    /* AND SO IS THE U.S. CONTACT'S. One cell, two boxes, last token taken as
       the surname - the same guess and worth the same sentence. It is only
       raised when the sheet is the source: a DS-7002 that names the supervisor
       in its own cell is not a guess, and trip.js prefers that. */
    if (rec._hostPocGuessed)
      W('usPocSurname', 'The U.S. contact name is split as a guess: Surname "' +
                        rec.hostPocSurname + '" / Given "' + rec.hostPocGiven +
                        '" - check it against the DS-7002');

    /* THE PAYER'S NAME SPLIT IS THE SAME GUESS AS THE APPLICANT'S, so it is
       named the same way. Nobody checks this half against a passport, but the
       payer's name has to match the document they will show if asked. */
    if (rec._payerNameMononym)
      W('payerSurname', 'The person paying has a single name - filled as ' +
                        'Surname "' + rec.payerSurname + '", Given Names "FNU".');
    else if (rec._payerNameGuessed)
      W('payerSurname', 'Name of the person paying is split as a guess: ' +
                        'Surname "' + rec.payerSurname + '" / Given "' +
                        rec.payerGivenNames + '".');

    /* CEAC's relationship dropdown is a closed set and column AA is free text.
       Everything in the export maps, but a new word would land here rather
       than silently leaving a sworn answer unset. */
    if (rec.payerRelationship &&
        ['PARENT', 'SPOUSE', 'CHILD', 'OTHER RELATIVE', 'FRIEND', 'OTHER', 'EMPLOYER']
          .indexOf(rec.payerRelationship) < 0)
      W('payerRelationship', 'Relationship to the person paying reads "' +
                             rec.payerRelationship + '", which is not one of CEAC\'s ' +
                             'options - pick the closest on the page');

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
    /* THE COMMA IS THE SHEET'S SEPARATOR, NOT A CHARACTER IN THE NAME, and
       this warning used to count it as one. Measured on the live export: it
       fired on 516 of 832 rows - 62% - and in EVERY one of them the comma was
       the only offender. Not a single row held a genuinely odd character. A
       warning that is wrong every time it appears is worse than no warning:
       it is 62% of the amber count on the applicant list, and it teaches the
       operator that the amber count is noise.

       `splitName()` already treats the comma as a separator, and CLAUDE.md
       already says why - a name has no punctuation in it. So the test runs on
       the name with the separator removed, and still catches what it is for:
       a digit, a full stop, a title like MR. */
    if (/[^A-Z' -]/.test(rec.fullName.replace(/,/g, '')))
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
    /* NAMES THE HEADER, NOT A COLUMN LETTER. This said "column BI" and fired
       on J1 rows, where BI is *Previous Workplace Country* - the two templates
       put different things in the same letter, which is exactly why this file
       maps on header TEXT everywhere else. A message that points at the wrong
       data is worse than a vague one.

       And it only asks about the level on a template that ASKS: a missing
       column is not an unanswered question. */
    if (!rec.eduName) {
      if (rec._asksEducationLevel) {
        const both = rec.hsName && rec.uniName;
        W('eduName', both
            ? '"Please select your highest level of education" reads "' +
              clean(rec.educationLevel) + '", which matches neither High School/' +
              'Vocational nor College/University, and both blocks hold a name - ' +
              'choose the institution by hand'
            : 'No institution for the education block: "highest level of education" ' +
              'reads "' + clean(rec.educationLevel) + '" and both school blocks are empty');
      } else {
        W('eduName', 'No school named in any of the three education blocks - ' +
                     'CEAC asks for any institution at secondary level or above');
      }
    }
    /* THE REST OF THE SCHOOLS - and this used to say "add these by hand",
       which stopped being true on 2026-09-04. CEAC's block is an ASP.NET
       DataList, so only the first row is on the page until the operator
       presses "Add Another"; the filler now fills whatever rows ARE there,
       matching each to its school by position. So this is an instruction with
       a promise, not a chore: press Add Another, press Fill, done.

       Still a warning rather than silence, because a page showing one school
       out of three looks finished, and Next is right there. */
    /* A NOTE, NOT A WARNING. It was amber, and the user's objection was the
       right one: this is the arrangement we chose, it is true on every J1 row,
       and there is nothing to decide. The filler does fill all three - the
       operator just presses Add Another between passes. */
    if ((rec._eduMore || []).length)
      N('eduName', rec._eduList.length + ' schools. CEAC shows one row at a time: ' +
                   'press "Add Another" and Fill again for each, and the filler puts ' +
                   'them in order - ' + rec._eduMore.join('; '));
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

    return { errors, warnings, notes, missing, ok: errors.length === 0 };
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
      ['educationLevel','Highest Level Completed'], ['_eduSource','Education block sourced from'],
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
                normMoney, splitName, yn, monthsBetween, toJs, usPlace, twoLines };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160 = api;
})(typeof self !== 'undefined' ? self : this);
