/* ------------------------------------------------------------------
 * J1 attachment parser  (was ds2019.js)
 *
 * A J1 applicant has THREE documents in Zoho Drive, in their own folder
 * (My Folders / ... / J1 Visa Attachment), and between them they carry
 * every answer the intake sheet cannot:
 *
 *   DS-2019  Certificate of Eligibility. Item 3 "Form Covers Period" is
 *            the programme period, which is the itinerary CEAC demands
 *            once "specific travel plans" is YES. The J1 sheet has NO
 *            arrival or departure column at all.
 *   DS-7002  Training/Internship Placement Plan. The richest of the
 *            three: SEVIS ID and Program Number BOTH LABELLED, the
 *            training dates, the host organisation and its address, and
 *            the supervisor who is the U.S. point of contact.
 *   SEVIS    the I-901 fee receipt. Name, SEVIS ID and date of birth -
 *   receipt  a cross-check rather than a source.
 *
 * THE PARSER IDENTIFIES THE DOCUMENT ITSELF. Each carries a distinctive
 * title, so `parse` detects which one it was handed and applies that
 * profile. Feeding a DS-7002 to the DS-2019 profile would otherwise be a
 * silent half-parse, and with three links in three columns that is a
 * mistake waiting to happen. An unrecognised document is refused, not
 * guessed at.
 *
 * LABELS BEAT PATTERNS, and that is not a style preference. The first
 * version of this file read the programme number by pattern, on the
 * stated grounds that "nothing else on a DS-2019 is shaped like a
 * programme number" - and the form's own pre-printed 212(e) line reads
 * "PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO", which is ECFMG's
 * number, on every form ever issued. It matched the stationery on both
 * the blank sample and a live applicant's form, and the cross-check then
 * reported a mismatch every single time. The DS-7002 labels both
 * identifiers outright, so on that document the trap cannot recur.
 *
 * VALUES ARE CUT AT THE NEXT LABEL, WHICHEVER ONE IT IS. Extracted text
 * is reading order across a two-column form, so labels interleave -
 * "Host Organization Name: The Westin Richmond Employer ID Number:
 * 205500685" - and which label comes next depends on whose software
 * generated the PDF. A fixed order (letter.js's approach, correct for a
 * one-column letter) would mis-cut here.
 *
 * WHAT IS CONFIRMED AGAINST A REAL DOCUMENT, and what is not:
 *   DS-2019  the dates, yes - read off a live form on 2026-09-04.
 *   DS-7002  every label below is copied from a real one.
 *   SEVIS    NOT CONFIRMED. No receipt has been seen; the labels are the
 *   receipt  standard field names and the profile says so. The first
 *            live run settles them, and until it does a miss is reported
 *            rather than filled.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* THE FORM'S OWN STATIONERY. Only the identifier is removed, never the
     sentence around it: the first attempt stripped everything up to the next
     full stop, and the 212(e) block runs on for two more clauses without one,
     so it swallowed whatever followed. Harmless on a blank sample; on a filled
     form it would eat the real programme number sitting after it. */
  const BOILERPLATE = [
    /(PHYSICIANS\s+SPONSORED\s+BY\s+)P-[0-9]-[0-9]{5}/gi,
  ];
  function deBoilerplate(text) {
    let t = text;
    for (const re of BOILERPLATE) t = t.replace(re, '$1');
    return t;
  }

  /* ---- the three profiles ---------------------------------------- */

  const DS2019 = {
    id: 'ds2019',
    name: 'DS-2019',
    /* Two independent markers, because a scanned or partly-extracted form may
       lose either the title or the item heading. */
    detect: /CERTIFICATE OF ELIGIBILITY FOR EXCHANGE VISITOR STATUS|Form Covers Period/i,
    /* Item 3. The label carries the date order - the form prints
       "(mm-dd-yyyy)" - and parseDate's default is day-first, the Indonesian
       convention, so without the hint 05-12-2026 would read as 5 December
       instead of 12 May. */
    dates: [
      { key: 'programFrom', re: /From\s*\(\s*mm-?dd-?yyyy\s*\)\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i },
      { key: 'programTo',   re: /To\s*\(\s*mm-?dd-?yyyy\s*\)\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i },
    ],
    labels: [
      { label: 'Exchange Visitor Category', key: 'category' },
    ],
    /* PATTERN, and only here. The DS-2019 prints the SEVIS id with no label
       at all, so there is nothing to anchor to; the programme number is
       matched after the stationery is stripped and reported missing if that
       leaves nothing. The DS-7002 labels both, which is why it is the better
       source for either. */
    patterns: [
      { key: 'sevisId',       re: /\bN[0-9X]{8,11}\b/i },
      { key: 'programNumber', re: /\bP-[0-9]-[0-9]{5}\b/i },
    ],
    required: ['programFrom', 'programTo'],
  };

  const DS7002 = {
    id: 'ds7002',
    name: 'DS-7002',
    detect: /Training\s*\/?\s*Internship Placement Plan|\bDS-7002\b/i,
    dates: [],
    /* EVERY ONE OF THESE IS COPIED FROM A REAL DS-7002. Note the two generic
       ones: `Address` and `Phone` belong to the host organisation and the
       supervisor respectively on the form seen, and they are generic enough
       that another sponsor's layout could put them elsewhere - which is why
       the values are shown to the operator rather than filled silently.

       `Category` is a substring of `Occupational Category`, and the scanner
       resolves that by preferring the LONGEST label at any position. */
    labels: [
      { label: 'Exchange Visitor (surname/primary, given name)', key: 'docName' },
      { label: 'SEVIS ID', key: 'sevisId' },
      { label: 'Email Address', key: 'docEmail' },
      { label: 'Program Sponsor', key: 'sponsor' },
      { label: 'Program Number', key: 'programNumber' },
      { label: 'Occupational Category', key: 'occupation' },
      { label: 'Category', key: 'category' },
      { label: 'Training/Internship Dates', key: 'trainingDates' },
      { label: 'Current Field of Study/Profession', key: 'fieldOfStudy' },
      { label: 'Type of Degree or Certificate', key: 'degree' },
      { label: 'Host Organization Name', key: 'hostOrgName' },
      { label: 'Employer ID Number', key: 'hostEin' },
      /* SECTION 2 LABELS ITS OWN CITY, STATE AND ZIP - the user pointed at the
         form: "di ds 7002 section host company terlihat jelas ada sub section
         city". The host block is a table of named cells:

           Organization Name | Phase Site Address | Suite
           City | State | ZIP Code | Website URL

         so nothing has to be read out of the tail of an address string. That
         matters because the sheet's own column has to be, and its shape varies
         (`7000 KALAHARI DR, SANDUSKY, OHIO, 44870` against the DS-7002's
         `6631 W BROAD ST, RICHMOND, VA 23230`).

         `Address` stays: one DS-7002 in hand writes a single-line address
         under that label rather than the split cells, and first-wins means
         whichever the document actually has is the one that lands.

         `City`, `State` and `ZIP Code` are the shortest labels in this profile
         and the only generic ones that carry a value, so they are MEASURED on
         a real document rather than trusted - see the end-to-end block in
         test/j1docs.test.js. Section 1 has no address on any form seen, which
         is why first-wins is safe here. */
      { label: 'Phase Site Address', key: 'hostStreet' },
      { label: 'Address', key: 'hostOrgAddress' },
      { label: 'City', key: 'hostCity' },
      { label: 'State', key: 'hostState' },
      { label: 'ZIP Code', key: 'hostZip' },
      { label: 'Suite', key: null },
      /* THE FORM'S OWN LETTERHEAD SAYS "U.S. Department of State", AND A BARE
         `State` MATCHES INSIDE IT. Measured, not guessed: with only the short
         label declared, `hostState` came back as

           *OMB APPROVAL NO. 1405-0170EXPIRATION DATE: 05/31/2024ESTIMATED
           BURDEN: 1.5 HOURSTraining/Internship Placement Plan

         because the letterhead is the FIRST occurrence and readLabelled takes
         the first. Declaring the longer label as a cut point is the fix, and
         it is the mechanism this profile already relies on for `Category`
         against `Occupational Category`: overlaps resolve in favour of the
         longer label, so the letterhead is consumed here and Section 2's own
         `State` cell is the first one left. */
      { label: 'U.S. Department of State', key: null },
      { label: 'Exchange Visitor Hours per week', key: 'hoursPerWeek' },
      { label: 'Stipend', key: 'stipend' },
      /* SECTION 4 SPELLS THE SUPERVISOR'S NAME OUT ON ITS OWN, and gives the
         title, phone and email their own cells beside it. The short label
         below is the older revision's, where all four run together into one
         undecidable string - so BOTH are declared and the longest wins where
         both appear. Only the clean one is split into surname and given
         names; splitting the glued run would put a job title in a name box. */
      { label: 'Main Program Supervisor/POC at Host Organization', key: 'supervisorName' },
      { label: 'Main Program Supervisor/POC', key: 'supervisor' },
      /* The host organisation under its Section 4 name. CEAC's U.S. Contact
         page wants it in Organization Name, and the sheet has no column for
         it at all. */
      { label: 'Phase Site Name', key: 'phaseSiteName' },
      { label: 'Phone', key: 'supervisorPhone' },
      /* Cut points only - these labels are not wanted as values, but naming
         them stops the value before them running on into their text. */
      { label: 'Worker\'s Comp Policy', key: null },
      { label: 'Number of FT Employees', key: null },
      { label: 'Annual Revenue', key: null },
      { label: 'Website URL', key: null },
      { label: 'Host Organization Phases', key: null },
      { label: 'Experience in Field', key: null },
      { label: 'Date Awarded or Expected', key: null },
      { label: 'Non-Monetary Compensation', key: null },
      { label: 'Certifications', key: null },
      { label: 'Additional Participant Details', key: null },
      /* Section 4 cut points. None of these is wanted as a value; naming them
         stops the value BEFORE each one running on into its label text. */
      { label: 'The Exchange Visitor is', key: null },
      { label: 'Supervisor Contact Information', key: null },
      { label: 'Training/Internship Field', key: null },
      { label: 'Primary Phase Supervisor', key: null },
      { label: 'Supervisor Title', key: null },
      { label: 'Phase Name', key: null },
      { label: 'Start Date', key: null },
      { label: 'End Date', key: null },
      { label: 'Description of Trainee', key: null },
      { label: 'E-mail', key: null },
      { label: 'Phone Number', key: null },
    ],
    patterns: [],
    /* SHORT LABELS ARE SCOPED TO THEIR SECTION, and two measurements are why.
       `State` on its own matched the letterhead first - "U.S. Department of
       State" - and once that was declared as a cut point it matched the
       sponsor's attestation instead: "...could be expected to bring the
       Department of State into notoriety or disrepute". The word is all over
       the prose. `City` and `ZIP Code` are luckier but not safer.

       The form gives a real anchor: `SECTION 2: HOST ORGANIZATION INFORMATION`
       through to `SECTION 3`. Inside that slice these labels mean exactly one
       thing, so they are read there and nowhere else - the keys are deleted
       from the whole-document pass before the scoped one runs, so an
       out-of-section match can never survive.

       Measured on both DS-7002s on this machine:
         - the flattened one that parses well has NO section headers at all and
           writes a single-line address under `Address`. The scope never fires,
           and `hostOrgAddress` stays its source.
         - the INTERACTIVE one has the headers and this exact label run -
           `Organization NamePhase Site Address SuiteCityStateZIP CodeWebsite
           URL` - with NOTHING between them, because its values live in form
           objects this reader cannot place. Printing it flat is what puts them
           on the page, which is what its hint already says. */
    scope: {
      from: /HOST\s+ORGANIZATION\s+INFORMATION/i,
      to: /SECTION\s*3\b/i,
      keys: ['hostStreet', 'hostCity', 'hostState', 'hostZip'],
    },
    required: ['sevisId', 'programNumber', 'trainingDates'],
  };

  const SEVIS_RECEIPT = {
    id: 'sevis',
    name: 'SEVIS receipt',
    detect: /\bI-901\b|SEVIS\s+Fee|fmjfee/i,
    dates: [],
    /* UNCONFIRMED. No receipt has been seen - the I-901 email that was
       available is only the notification and carries a payment confirmation
       number, not the SEVIS id. These are the standard field names, and if
       they are wrong the fields come back missing, which is visible. Do not
       add a pattern fallback here until a real receipt has been read: that is
       exactly the shortcut that produced the P-3-04510 bug. */
    labels: [
      { label: 'SEVIS ID', key: 'sevisId' },
      { label: 'Name', key: 'docName' },
      { label: 'Date of Birth', key: 'docDob' },
      { label: 'Payment Confirmation Number', key: 'paymentRef' },
      { label: 'School/Program', key: null },
      { label: 'Amount', key: null },
    ],
    patterns: [],
    required: ['sevisId'],
    unconfirmed: true,
  };

  /* A VALUE THAT IS ABSURDLY LONG IS NOT THAT VALUE.
     Found 2026-09-04 by running the real files: one of the DS-7002s in
     circulation is an INTERACTIVE pdf, whose field values live in AcroForm
     objects rather than in the page, so the extracted text is the form's
     printed boilerplate with every label sitting next to nothing. The parser
     identified it correctly as a DS-7002 and then handed back a programme
     number of 2,700 characters of capitalised attestation text.

     That is a wrong value, not a visible gap, which is the worst outcome this
     project produces. So:

       - the two identifiers must match the shape their issuer prints, and are
         dropped otherwise. That is not a guess: CEAC itself requires
         P-n-nnnnn, and a SEVIS id is N plus digits (with X for a redacted
         sample). The SHEET side stays tolerant and merely warns - see
         normalize.js - because a person typed that, and a person's typo is
         worth showing. A document's own field is not.
       - every other field has a length ceiling. Long enough for the longest
         real value on the form seen, short enough that a runaway cannot pass
         for one. */
  const SHAPES = {
    sevisId: /^N[0-9X]{8,11}$/i,
    programNumber: /^P-[0-9]-[0-9]{5}$/i,
  };
  const MAX_LEN = {
    docName: 80, docEmail: 100, docDob: 20, sponsor: 80, category: 40,
    occupation: 60, trainingDates: 60, fieldOfStudy: 60, degree: 60,
    hostOrgName: 100, hostEin: 20, hostOrgAddress: 140, hoursPerWeek: 20,
    stipend: 60, supervisor: 200, supervisorPhone: 20, paymentRef: 40,
  };
  const DEFAULT_MAX = 200;

  function sane(key, value) {
    const v = norm(value);
    if (!v) return '';
    if (SHAPES[key]) return SHAPES[key].test(v.replace(/\s+/g, '')) ? v : '';
    return v.length <= (MAX_LEN[key] || DEFAULT_MAX) ? v : '';
  }

  const PROFILES = [DS7002, DS2019, SEVIS_RECEIPT];

  /* DS-7002 IS TRIED FIRST ON PURPOSE. It says "Exchange Visitor" and
     "Program Number" too, so a DS-2019 detector written loosely could claim
     it; ordering the specific title ahead of the general one costs nothing and
     removes the question. */
  function identify(text) {
    for (const p of PROFILES) if (p.detect.test(text)) return p;
    return null;
  }

  /* ---- label scanning -------------------------------------------- */

  /* Every occurrence of every label, with overlaps resolved in favour of the
     LONGER label. That is what keeps `Category` from claiming the tail of
     `Occupational Category`, and it is order-independent: the value runs to
     the next label found anywhere, not to the next one in a fixed list. */
  function scanLabels(text, labels) {
    const hits = [];
    for (const def of labels) {
      /* WHITESPACE-INSENSITIVE BETWEEN THE WORDS OF A LABEL, and this is not
         tidiness - it is what the real documents require. pdftext.js joins the
         PDF's text runs with no separator, so a label the form WRAPS across two
         lines arrives with the space missing:

           Main ProgramSupervisor/POC:
           Current Field ofStudy/Profession:

         Matching those literally failed, and the value before them then ran on
         and swallowed the whole supervisor block. The hand-typed test text hid
         it, because a human types the spaces in - only the real PDF showed it.
         Same family as letter.js's "the extracted text has no line breaks". */
      const re = new RegExp(
        def.label.trim().split(/\s+/).map(esc).join('\\s*') + '\\s*[:\\-]?\\s*', 'gi');
      let m;
      while ((m = re.exec(text))) {
        hits.push({ def: def, start: m.index, valueAt: m.index + m[0].length,
                    len: def.label.length });
        if (m.index === re.lastIndex) re.lastIndex++;   // zero-length guard
      }
    }
    hits.sort((a, b) => a.start - b.start || b.len - a.len);
    const kept = [];
    for (const h of hits) {
      const prev = kept[kept.length - 1];
      if (prev && h.start < prev.valueAt) continue;     // overlapped by a longer one
      kept.push(h);
    }
    return kept;
  }

  /* GOVERNMENT FORMS NUMBER THEIR ITEMS, and a numbered item is a cut point
     even where no label is listed for it. The DS-2019 profile has one label,
     so its category ran on into the whole of item 5 - "INTERN 5. During the
     period covered by this form, the total estimated financial support..." -
     until the 200-character fallback stopped it, mid-word.

     Requires a digit, a full stop, whitespace and a capital, so "17.00 per
     Hour" and "$10 - $25 Million" are untouched. */
  const ITEM = /\s\d{1,2}\.\s+[A-Z]/;

  function readLabelled(text, labels) {
    const out = {};
    const hits = scanLabels(text, labels);
    hits.forEach((h, i) => {
      if (!h.def.key) return;                            // a cut point only
      const next = hits[i + 1];
      let v = norm(text.slice(h.valueAt, next ? next.start : h.valueAt + 200));
      v = norm(v.split(ITEM)[0]);
      if (v && !(h.def.key in out)) out[h.def.key] = v;  // first wins
    });
    return out;
  }

  /* ---- parse ------------------------------------------------------ */

  function parse(rawText) {
    const text = norm(rawText);
    const profile = identify(text);
    if (!profile) {
      return { doc: null, name: null, fields: {}, missing: [], ok: false, found: 0,
               error: 'This does not look like a DS-2019, a DS-7002 or a SEVIS receipt.' };
    }

    const out = Object.assign({}, readLabelled(text, profile.labels));

    /* The scoped pass - see `scope` on the profile. The keys are cleared
       first, so a match from outside the section never survives. */
    if (profile.scope) {
      for (const k of profile.scope.keys) delete out[k];
      const at = text.search(profile.scope.from);
      if (at >= 0) {
        const rest = text.slice(at);
        const end = rest.search(profile.scope.to);
        const inSection = readLabelled(end > 0 ? rest.slice(0, end) : rest,
                                       profile.labels);
        for (const k of profile.scope.keys) if (inSection[k]) out[k] = inSection[k];
      }
    }

    for (const f of profile.dates) {
      const m = text.match(f.re);
      if (m) out[f.key] = m[1];
    }

    const plain = deBoilerplate(text);
    for (const f of profile.patterns) {
      if (out[f.key]) continue;                          // a label already got it
      const m = plain.match(f.re);
      if (m) out[f.key] = m[0].toUpperCase();
    }

    /* The DS-7002 gives the period as one range: "09/16/2024 - 09/16/2025",
       month-first like every date on these forms. */
    if (out.trainingDates) {
      const m = out.trainingDates.match(
        /([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})\s*[-–]\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/);
      if (m) { out.programFrom = m[1]; out.programTo = m[2]; }
    }

    /* Month-first, stated by the forms themselves - the DS-2019 prints
       "(mm-dd-yyyy)" and the DS-7002 writes 09/16/2024. */
    if (typeof DS160 !== 'undefined') {
      for (const k of ['programFrom', 'programTo', 'docDob']) {
        if (!out[k]) continue;
        const p = DS160.parseDate(out[k], { monthFirst: true });
        out[k] = DS160.fmtDate(p) || out[k];
      }
    }

    if (out.sevisId) out.sevisId = out.sevisId.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (out.programNumber) out.programNumber = out.programNumber.toUpperCase().replace(/\s+/g, '');

    /* THE SUPERVISOR ARRIVES AS ONE UNSPLITTABLE RUN, and it stays that way.
       The form stacks the name, the job title and the email in one cell with
       no label between them, and pdftext joins the runs with no separator:

         Jackson, SheraeHuman Resources Managersherae.jackson@westinrichmond.com

       An earlier version pulled the email out with a pattern and got
       "Managersherae.jackson@westinrichmond.com" - the job title glued to the
       front. That boundary CANNOT be found: an email local part is letters,
       "Manager" is letters, and nothing in the text says where one ends. A
       wrong-looking address on screen is worse than none, so the run is left
       whole for the operator to read.

       The cross-check does not need the split. It asks whether the sheet's
       own address appears INSIDE the run, which is exact either way - see
       crossCheck below. */

    /* CEAC's phone boxes take digits only - its own error message is the rule -
       and the form writes 804-205-5207. Same helper the sheet's own phone
       columns go through, so the two cannot drift apart. */
    if (out.supervisorPhone && typeof DS160 !== 'undefined' && DS160.phoneAsWritten)
      out.supervisorPhone = DS160.phoneAsWritten(out.supervisorPhone);

    if (out.programFrom) out.arrivalDate = out.programFrom;
    if (out.programTo) out.departureDate = out.programTo;
    /* THE ARRIVAL AND DEPARTURE CITIES ARE THE HOST'S CITY - the user's rule.
       Derived here, the same way the dates are derived from the programme
       period, so the document can answer them directly: both are trip fields,
       so `applyParsed` stores them as this applicant's own entry and they stay
       editable. A participant may fly into somewhere else.

       This is the better of the two sources. The sheet's column has to have a
       city read out of the tail of a free-text address; Section 2 of this form
       labels the cell. */
    if (out.hostCity) {
      out.arrivalCity = out.hostCity;
      out.departureCity = out.hostCity;
    }

    /* THE U.S. POINT OF CONTACT IS THE HOST ORGANISATION AND ITS SUPERVISOR.
       CEAC asks for an organisation name and two name boxes; the sheet has one
       cell for the person and NO column at all for the organisation, which is
       why the user pointed at this form.

       All three are trip fields, so `applyParsed` stores them as this
       applicant's own entry and they stay editable - the operator can correct
       a document, which is the whole point of storing them per applicant. */
    const org = out.hostOrgName || out.phaseSiteName;
    if (org) out.usPocOrg = org;
    /* SPLIT ONLY THE CLEAN CELL. On the older revision the supervisor arrives
       as `Jackson, SheraeHuman Resources Managersherae.jackson@...` - name,
       title and email with no boundary between them, which this file already
       records as undecidable. Splitting THAT would put "Managersherae" in a
       given-name box on a sworn form. `supervisorName` only exists when the
       form labelled the cell on its own. */
    if (out.supervisorName) {
      const parts = String(out.supervisorName).trim().split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        out.usPocSurname = parts[parts.length - 1];
        out.usPocGiven = parts.slice(0, -1).join(' ');
      }
    }

    /* Applied LAST, so it judges the finished value rather than a fragment
       part-way through the normalising above. */
    for (const k in out) {
      const v = sane(k, out[k]);
      if (v) out[k] = v; else delete out[k];
    }

    const missing = profile.required.filter(k => !out[k]);
    /* WHEN NOTHING REQUIRED SURVIVED, say what to do about it. An interactive
       DS-7002 gives exactly this shape of result - the document is recognised,
       and every value is somewhere the page text cannot reach. Printing it to
       a flat PDF puts the values back on the page, which is the fix, and the
       operator has no way to know that otherwise. */
    /* AND THE REASON DEPENDS ON WHICH DOCUMENT IT IS. Blaming the PDF format
       is right for a profile whose labels are known to be correct - the first
       live run met an interactive DS-7002 whose page text is only the blank
       form's printed labels, so every value was somewhere the page cannot
       reach. It is the WRONG guess for the SEVIS receipt, whose labels have
       never been checked against a real one: there the likely fault is ours,
       and saying "print it flat" would send the operator to do something
       useless. */
    const allMissing = profile.required.length && missing.length === profile.required.length;
    const hint = !allMissing ? null
      : profile.unconfirmed
        ? 'Nothing was found, and this profile\'s labels have never been checked ' +
          'against a real one - so the labels are the likely fault, not the file. ' +
          'Send the extracted text and they can be corrected.'
        /* THE OLD WORDING WAS FACTUALLY WRONG and it matters, because it told
           the operator where to look. It said the values "sit in form fields".
           They do not: they are ordinary page text, drawn inside a Form
           XObject per field. Checked on the file itself - the LABELS come out
           at real page coordinates (Trainee/Intern Name at x 39.6, y 698) and
           the VALUES at local ones (Widiantara at x 1.0, y 3.5), because an
           XObject's placement lives in the page stream, not in the XObject.
           Pairing them needs the whole object graph.

           And it framed printing as an instruction. It is not: 0 of the 69
           rows need the DS-7002 for anything that reaches the form. */
        : 'Nothing was found. The values are on the page but inside a form ' +
          'container, and where each one sits is recorded somewhere this reader ' +
          'does not go - so labels and values cannot be paired. Printing the ' +
          'file to PDF flattens them onto the page, if you want this document ' +
          'as a cross-check.';

    return {
      doc: profile.id,
      name: profile.name,
      unconfirmed: !!profile.unconfirmed,
      fields: out,
      missing: missing,
      hint: hint,
      ok: !missing.length,
      found: Object.keys(out).length,
    };
  }

  /* ---- cross-checks ----------------------------------------------- */

  /* THESE DOCUMENTS AND THE SHEET WERE FILLED IN BY DIFFERENT PEOPLE. Columns
     CH and CI were typed FROM these forms, and BZ-CC describe the same host
     organisation the DS-7002 does, so a disagreement means one of them is
     wrong on a sworn application and nothing else here would notice. */
  function crossCheck(parsed, rec) {
    const f = parsed.fields || {}, issues = [];
    /* A DOCUMENT THAT GAVE UP NOTHING CANNOT BE CROSS-CHECKED, and trying is
       worse than not: the first live run met an interactive DS-7002 whose page
       text is only the blank form's printed labels, so `supervisor` came back
       as "at Host Organization TitleEmail" - the NEXT label, not a value - and
       this function then reported that the sheet's real contact address did
       not appear in it. A mismatch against nothing, on a page where the whole
       document had already been reported empty.

       That is the third time today a check has cried wolf on data it should
       not have been looking at. `hint` is set exactly when none of the
       required fields survived, so it is the right gate. */
    if (parsed.hint) return issues;
    const squash = s => norm(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const cmp = (a, b) => squash(a) === squash(b);
    const say = (field, msg) => issues.push({ field: field, msg: msg });

    /* A redacted sample reads N00375XXXXX. That is a blanked-out id, not a
       contradiction, and reporting it would train the operator to ignore this
       check - the same way the stationery bug did. */
    if (f.sevisId && rec.sevisId && !/X/i.test(f.sevisId) && !cmp(f.sevisId, rec.sevisId))
      say('sevisId', parsed.name + ' says ' + f.sevisId + ', the sheet says ' + rec.sevisId);
    if (f.programNumber && rec.programNumber && !cmp(f.programNumber, rec.programNumber))
      say('programNumber', parsed.name + ' says ' + f.programNumber +
                           ', the sheet says ' + rec.programNumber);

    /* The name on the document against the intake row. Compared as a SET of
       words, because these forms write "Putra, I Gede Angga Krisna Mahadi"
       and the sheet writes the same name with its own comma placement -
       ordering is not the disagreement worth reporting. */
    if (f.docName && rec.fullName) {
      /* Sorted WORDS, not sorted characters. The first version sorted
         characters, which makes any two anagrams equal - loose enough that a
         genuinely different name could slip through. */
      const words = s => norm(s).toUpperCase().replace(/[^A-Z ]/g, ' ')
                           .split(/\s+/).filter(Boolean).sort().join(' ');
      if (words(f.docName) !== words(rec.fullName))
        say('fullName', parsed.name + ' says "' + f.docName +
                        '", the sheet says "' + rec.fullName + '"');
    }
    if (f.docDob && rec.dob && f.docDob !== rec.dob)
      say('dob', parsed.name + ' says ' + f.docDob + ', the sheet says ' + rec.dob);

    /* The DS-7002's supervisor IS the U.S. point of contact in columns
       BZ-CC. Only the email is compared: a name can legitimately be written
       "Jackson, Sherae" one place and "Sherae Jackson" the other, but an
       email address either matches or somebody has the wrong contact. */
    /* BY CONTAINMENT, not by comparison, because the supervisor's email cannot
       be cut out of the run it arrives in (see above). Asking whether column
       CC's address appears inside that run is exact in both directions: if it
       is there they agree, and if it is not, somebody has the wrong contact. */
    if (f.supervisor && rec.usPocEmail &&
        squash(f.supervisor).indexOf(squash(rec.usPocEmail)) < 0)
      say('usPocEmail', 'The sheet says the U.S. contact is ' + rec.usPocEmail +
                        ', which does not appear in the ' + parsed.name +
                        ' supervisor block (' + f.supervisor + ')');

    /* A programme that ends on or before it starts is a misread, not a fact. */
    if (typeof DS160 !== 'undefined' && f.programFrom && f.programTo) {
      const a = DS160.parseDate(f.programFrom), b = DS160.parseDate(f.programTo);
      if (a && b) {
        const ja = Date.UTC(a.y, a.m - 1, a.d), jb = Date.UTC(b.y, b.m - 1, b.d);
        if (jb <= ja)
          say('programTo', 'The programme period ends on or before it starts (' +
                           f.programFrom + ' to ' + f.programTo + ') - check the form');
      }
    }
    return issues;
  }

  /* TWO DOCUMENTS STATING THE SAME PROGRAMME MUST AGREE. The DS-2019's "Form
     Covers Period" and the DS-7002's "Training/Internship Dates" describe one
     placement, and the DS-160 swears to one arrival and one departure. If they
     differ, filling either is picking a document to believe, which is not
     ours to do. */
  function compareDocs(a, b) {
    const issues = [];
    if (!a || !b || !a.fields || !b.fields) return issues;
    for (const k of ['programFrom', 'programTo', 'sevisId', 'programNumber']) {
      const x = a.fields[k], y = b.fields[k];
      if (!x || !y || /X/i.test(String(x)) || /X/i.test(String(y))) continue;
      if (norm(x).toUpperCase() !== norm(y).toUpperCase())
        issues.push({ field: k, msg: a.name + ' says ' + x + ', ' + b.name + ' says ' + y });
    }
    return issues;
  }

  /* Only the fields a DS-160 box actually takes. Everything else - the
     sponsor, the stipend, the hours, the field of study - is read so the
     operator can see it and so the cross-checks have something to compare,
     not because the form asks for it. */
  const ANSWER_KEYS = ['arrivalDate', 'departureDate', 'arrivalCity', 'departureCity',
                       'usPocOrg', 'usPocSurname', 'usPocGiven'];
  function answers(parsed) {
    const out = {};
    /* A DOCUMENT THAT GAVE UP NONE OF ITS REQUIRED FIELDS ANSWERS NOTHING.
       `hint` means exactly that, and `crossCheck` has returned early on it
       since the first live run. This is the same gate on the other side, and
       a probe is what showed it was missing: an interactive DS-7002's page
       text is the blank form's LABELS, so

         Main Program Supervisor/POC at Host Organization | Title | Email

       gave `supervisorName = "Title Email"`, which split into Surname "Email",
       Given "Title" - two capitalised words, no shape check can refuse them,
       and they would have gone onto the U.S. Contact page as the contact's
       name. Filled, plausible, wrong, and invisible.

       The dates were safe only by luck: they go through `parseDate`, which
       refuses words. The moment a document supplied a NAME, luck ran out. */
    if (parsed.hint) return out;
    for (const k of ANSWER_KEYS) if (parsed.fields && parsed.fields[k]) out[k] = parsed.fields[k];
    return out;
  }

  const api = { PROFILES, ANSWER_KEYS, SHAPES, MAX_LEN, sane, identify, parse, crossCheck, compareDocs,
                answers, scanLabels, readLabelled };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160J1Docs = api;
  /* The old name, kept so nothing breaks mid-edit. Remove once app.js and
     index.html no longer mention it. */
  root.DS160Ds2019 = api;
})(typeof self !== 'undefined' ? self : this);
