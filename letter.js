/* ------------------------------------------------------------------
 * Supporting letter parser
 *
 * The C1/D supporting letter carries the four things the intake form
 * never collects - vessel name, IMO number, joining date and US port -
 * plus the shipboard job title. It also repeats name, date of birth,
 * nationality and passport number, which makes it a free cross-check
 * against the intake row: a mismatch there is exactly the sort of thing
 * that burns an appointment slot.
 *
 * Text extracted from these PDFs has NO line breaks - labels and values
 * run together ("...TODINGANDate of Birth 9/16/1987Nationality..."), so
 * fields are cut out by finding each known label and taking everything
 * up to the next one. Splitting on newlines would find nothing.
 *
 * Dates in the letter are written month-first (9/16/1987) and with
 * ordinals ("17th December 2026"); normalize.js handles both.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  /* In the order they appear. `key` null means "read it, do not keep it
     as an answer" - those are only used for the cross-check. */
  const LABELS = [
    { label: 'Name',                       key: 'letterName' },
    { label: 'Date of Birth',              key: 'letterDob' },
    { label: 'Nationality',                key: 'letterNationality' },
    { label: 'Passport No',                key: 'letterPassport' },
    { label: 'Working in the Capacity of', key: 'jobTitleAboard' },
    { label: 'Joining Cruise Ship',        key: 'vesselName' },
    { label: 'Ship Identification Number', key: 'vesselImo' },
    { label: 'Date of Joining Ship',       key: 'arrivalDate' },
    { label: 'US Port of Joining',         key: 'arrivalCity' },
  ];

  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Where each label starts, in the order the letter uses. A label that
     is missing is skipped rather than shifting everything after it. */
  function findLabels(text) {
    const found = [];
    let from = 0;
    for (const def of LABELS) {
      const re = new RegExp(esc(def.label) + '\\s*[:\\-]?\\s*', 'i');
      const rest = text.slice(from);
      const m = rest.match(re);
      if (!m) continue;
      const start = from + m.index;
      found.push({ def, start, valueAt: start + m[0].length });
      from = start + m[0].length;
    }
    return found;
  }

  function parse(rawText) {
    const text = norm(rawText);
    const out = {}, missing = [];
    const found = findLabels(text);
    const byLabel = found.reduce((m, f) => (m[f.def.label] = f, m), {});

    /* The final value runs straight into the body with no separator at
       all - "MiamiI can confirm that..." - so a word boundary is no help.
       Cut at the phrases the letter body always opens with. */
    const BODY = /I can confirm|I further confirm|I thank you|We kindly|Company will|Yours (sincerely|faithfully)/i;

    found.forEach((f, i) => {
      const next = found[i + 1];
      let v = norm(text.slice(f.valueAt, next ? next.start : f.valueAt + 160));
      if (!next) v = v.split(BODY)[0].split('.')[0].trim();
      out[f.def.key] = v;
    });
    for (const def of LABELS) if (!byLabel[def.label]) missing.push(def.label);

    // Normalise the pieces that become DS-160 answers.
    if (typeof DS160 !== 'undefined') {
      if (out.letterDob) out.letterDob = DS160.fmtDate(DS160.parseDate(out.letterDob, { monthFirst: true })) || out.letterDob;
      if (out.arrivalDate) out.arrivalDate = DS160.dateStr(out.arrivalDate) || out.arrivalDate;
    }
    if (out.vesselImo) out.vesselImo = out.vesselImo.replace(/\D/g, '');
    ['letterName', 'vesselName', 'arrivalCity', 'jobTitleAboard', 'letterPassport', 'letterNationality']
      .forEach(k => { if (out[k]) out[k] = out[k].toUpperCase(); });

    return { fields: out, missing, ok: missing.length === 0, found: found.length };
  }

  /* Same person? The letter and the intake row are filled by different
     people at different times, so disagreement is worth stopping for. */
  function crossCheck(parsed, rec) {
    const f = parsed.fields || {}, issues = [];
    const cmp = (a, b) => norm(a).toUpperCase().replace(/[^A-Z0-9]/g, '') ===
                          norm(b).toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (f.letterName && rec.fullName && !cmp(f.letterName, rec.fullName))
      issues.push({ field: 'fullName', msg: 'Letter says "' + f.letterName + '", intake says "' + rec.fullName + '"' });
    if (f.letterPassport && rec.passportNumber && !cmp(f.letterPassport, rec.passportNumber))
      issues.push({ field: 'passportNumber', msg: 'Letter says "' + f.letterPassport + '", intake says "' + rec.passportNumber + '"' });
    if (f.letterDob && rec.dob && f.letterDob !== rec.dob)
      issues.push({ field: 'dob', msg: 'Letter says ' + f.letterDob + ', intake says ' + rec.dob });
    return issues;
  }

  /* Only the fields that are actual DS-160 answers. */
  const ANSWER_KEYS = ['vesselName', 'vesselImo', 'arrivalDate', 'arrivalCity', 'jobTitleAboard'];
  function answers(parsed) {
    const out = {};
    for (const k of ANSWER_KEYS) if (parsed.fields[k]) out[k] = parsed.fields[k];
    return out;
  }

  const api = { LABELS, ANSWER_KEYS, parse, crossCheck, answers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DS160Letter = api;
})(typeof self !== 'undefined' ? self : this);
