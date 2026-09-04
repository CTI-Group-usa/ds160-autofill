/* ------------------------------------------------------------------
 * DS-2019 parser  (J1 only)
 *
 * WHY THIS EXISTS. J1 answers "Have you made specific travel plans?"
 * with YES - the opposite of C1/D - and CEAC then demands a full
 * itinerary: date of arrival, arrival city, date of departure. The J1
 * sheet has NO column for any of them (`When did you arrive in the US?`
 * is 0 of 69 rows filled, and `Appointment Date` is the interview, not
 * the trip). The dates exist in exactly one place: the participant's
 * Form DS-2019, linked from column CO.
 *
 * WHAT MAPS ONTO WHAT, and the evidence for it. The DS-2019's item 3,
 * "Form Covers Period", gives From and To. Two independent documents say
 * those are what goes on the form:
 *
 *   the blank DS-2019 sample   From 05-25-2026   To 05-24-2027
 *   the filed DS-160 (JULIANA) arrival 24 NOV 2026, departure 23 NOV 2027
 *
 * Both spans are one year minus a day - the shape a DS-2019 period has -
 * and since the sheet holds no arrival or departure column, the DS-2019 is
 * the only source those dates could have come from. So From -> arrivalDate
 * and To -> departureDate.
 *
 * Both stay EDITABLE in the trip block. A participant may enter the U.S.
 * up to 30 days before the programme starts, and if they do, the arrival
 * date is theirs and not the form's.
 *
 * TWO KINDS OF EXTRACTION, deliberately. The dates are label-anchored,
 * because only their label says which order they are written in - the form
 * prints "(mm-dd-yyyy)" beside them, which settles what would otherwise be
 * a guess on any day of the month at or below 12. The SEVIS ID and the
 * programme number are found by PATTERN, because in the sample the SEVIS ID
 * arrives with no label at all - see BOILERPLATE below for what that cost.
 *
 * IT HAS NOW RUN AGAINST A REAL DS-2019 PDF (2026-09-04), which settles the
 * question this header used to leave open: pdftext.js CAN read one. The
 * programme period came out of a live form on the first attempt, which is
 * more than the CEAC print-out managed - that returned zero characters.
 *
 * Two things that live run also showed, and neither is fixed by guessing:
 *   - the SEVIS ID was NOT found, though it is found in the blank sample;
 *   - the programme number matched the form's own stationery.
 * The second is fixed below. The first needs the extracted text of a real
 * form in front of us, and until then it is reported missing, which is the
 * honest state.
 *
 * Same arrangement as letter.js: `parse` takes text, and where that text
 * comes from is the caller's problem. test/ds2019.test.js runs end-to-end
 * against a real one if a file is present.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /* Item 3 of the form. The label carries the date order, which is why
     these are matched on the label and not on shape: "05-12-2026" is
     ambiguous, and the form says month first. Note the sample writes
     "To  (mm-dd-yyyy)" with two spaces - norm() collapses that, so the
     pattern must not depend on exactly one. */
  const DATE_FIELDS = [
    { key: 'programFrom', re: /From\s*\(\s*mm-?dd-?yyyy\s*\)\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i },
    { key: 'programTo',   re: /To\s*\(\s*mm-?dd-?yyyy\s*\)\s*:?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})/i },
  ];

  /* THE FORM'S OWN STATIONERY IS SHAPED LIKE A PROGRAMME NUMBER.
     Corrected 2026-09-04 after the first live run, and the mistake was mine:
     the comment here used to claim "nothing else on a DS-2019 is shaped like
     either". The form's pre-printed 212(e) endorsement reads

       PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO ...

     and P-3-04510 is ECFMG's programme number, printed on every DS-2019
     whoever the participant is. It was the ONLY P-n-nnnnn in the blank
     sample - which should have been the clue, not the reassurance I took it
     for - and a real applicant's form returned it as well, against a sheet
     that said P-4-44043. So the pattern was reading the stationery on both,
     and the cross-check then reported a mismatch on EVERY form. That is
     precisely how an operator learns to ignore a warning.

     Stripped before anything is matched. If nothing survives the strip the
     field is reported MISSING, because a visible gap beats a confident wrong
     answer - and with no value there, crossCheck() stands down by itself. */
  const BOILERPLATE = [
    /(PHYSICIANS\s+SPONSORED\s+BY\s+)P-[0-9]-[0-9]{5}/gi,
  ];

  /* ONLY THE NUMBER GOES, NOT THE SENTENCE AROUND IT. The first attempt at
     this stripped `...BY P-3-04510[^.]*` - everything up to the next full
     stop - and the 212(e) block has no full stop for another two clauses, so
     it swallowed whatever followed. On the blank sample that was harmless; on
     a filled form it could eat the real programme number sitting after it. So
     the phrase is kept and only the identifier is removed. */
  function deBoilerplate(text) {
    let t = text;
    for (const re of BOILERPLATE) t = t.replace(re, '$1');
    return t;
  }

  /* Formatted identifiers, matched on the text with the stationery removed.
     The sample redacts the SEVIS id as N00375XXXXX, so the digit run is
     matched loosely and validate() checks the shape - dropping a real id
     over a strict pattern would be worse than filling an odd one. */
  const ID_FIELDS = [
    { key: 'sevisId',       re: /\bN[0-9X]{8,11}\b/i },
    { key: 'programNumber', re: /\bP-[0-9]-[0-9]{5}\b/i },
  ];

  /* Item 4. Its value is on its own after the label - INTERN, TRAINEE,
     CAMP COUNSELOR, SUMMER WORK TRAVEL and so on - and it is read only to
     show the operator which programme this is; no DS-160 box takes it. */
  const CATEGORY_RE = /Exchange Visitor Category\s*:?\s*([A-Z][A-Z /-]{2,40})/;

  function parse(rawText) {
    const text = norm(rawText);
    const out = {}, missing = [];

    for (const f of DATE_FIELDS) {
      const m = text.match(f.re);
      if (m) out[f.key] = m[1];
      else missing.push(f.key);
    }
    const plain = deBoilerplate(text);
    for (const f of ID_FIELDS) {
      const m = plain.match(f.re);
      if (m) out[f.key] = m[0].toUpperCase();
      else missing.push(f.key);
    }
    const c = text.match(CATEGORY_RE);
    if (c) out.category = norm(c[1]).toUpperCase();

    /* The form states the order, so pass the hint rather than letting
       parseDate fall back to the Indonesian day-first convention. Without
       it, 05-12-2026 would come out as 5 December instead of 12 May. */
    if (typeof DS160 !== 'undefined') {
      for (const k of ['programFrom', 'programTo']) {
        if (!out[k]) continue;
        const p = DS160.parseDate(out[k], { monthFirst: true });
        out[k] = DS160.fmtDate(p) || out[k];
      }
    }

    /* The itinerary answers. Kept as separate keys from programFrom /
       programTo so the operator can see both what the form said and what
       is going on the DS-160 - they are the same until somebody edits the
       arrival date, which is exactly when the difference matters. */
    if (out.programFrom) out.arrivalDate = out.programFrom;
    if (out.programTo) out.departureDate = out.programTo;

    return {
      fields: out,
      missing: missing,
      ok: !missing.length,
      found: Object.keys(out).length,
    };
  }

  /* THE SHEET AND THE FORM SHOULD AGREE. Columns CH and CI hold the SEVIS
     ID and the programme number, typed in by hand; the DS-2019 is the
     document they were copied from. A disagreement means one of them is
     wrong on a sworn application, and nothing else in this project would
     notice - the same reason letter.js cross-checks name and passport. */
  function crossCheck(parsed, rec) {
    const f = parsed.fields || {}, issues = [];
    const cmp = (a, b) => norm(a).toUpperCase().replace(/[^A-Z0-9]/g, '') ===
                          norm(b).toUpperCase().replace(/[^A-Z0-9]/g, '');

    /* A redacted sample reads N00375XXXXX; comparing that to a real id
       would report a mismatch that is really just a blanked-out sample. */
    if (f.sevisId && rec.sevisId && !/X/i.test(f.sevisId) && !cmp(f.sevisId, rec.sevisId))
      issues.push({ field: 'sevisId',
                    msg: 'DS-2019 says ' + f.sevisId + ', the sheet says ' + rec.sevisId });
    if (f.programNumber && rec.programNumber && !cmp(f.programNumber, rec.programNumber))
      issues.push({ field: 'programNumber',
                    msg: 'DS-2019 says ' + f.programNumber + ', the sheet says ' + rec.programNumber });

    /* A programme that ends before it starts is a misread, not a fact. */
    if (typeof DS160 !== 'undefined' && f.programFrom && f.programTo) {
      const a = DS160.parseDate(f.programFrom), b = DS160.parseDate(f.programTo);
      if (a && b && DS160.fmtDate(a) && DS160.fmtDate(b)) {
        const ja = new Date(Date.UTC(a.y, a.m - 1, a.d)), jb = new Date(Date.UTC(b.y, b.m - 1, b.d));
        if (jb <= ja)
          issues.push({ field: 'programTo',
                        msg: 'The programme period ends on or before it starts (' +
                             f.programFrom + ' to ' + f.programTo + ') - check the form' });
      }
    }
    return issues;
  }

  /* Only the fields that are actual DS-160 answers. The category and the
     raw programme dates are for the operator to read, not for the form. */
  const ANSWER_KEYS = ['arrivalDate', 'departureDate'];
  function answers(parsed) {
    const out = {};
    for (const k of ANSWER_KEYS) if (parsed.fields[k]) out[k] = parsed.fields[k];
    return out;
  }

  const api = { DATE_FIELDS, ID_FIELDS, ANSWER_KEYS, parse, crossCheck, answers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Ds2019 = api;
})(typeof self !== 'undefined' ? self : this);
