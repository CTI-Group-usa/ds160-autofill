/* ------------------------------------------------------------------
 * DS-160 page filler (content script, ceac.state.gov only)
 *
 * Fills the fields it can identify on the page currently open, marks
 * what it touched, and hands a report back to the popup. It never
 * clicks Next, never signs, never submits, and never goes near the
 * security check - the agent does all of that.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const M = window.DS160Matcher;
  const MARK = 'data-ds160-filled';
  /* AUTO-CONTINUE IS GONE, REMOVED 2026-09-02 AT THE USER'S REQUEST.
     CEAC's WAF blocked this session on 2026-08-31 and twice again on
     2026-09-02, and this was the only feature that could reload the page
     with nobody pressing anything: one Fill could produce four reloads
     2.5s apart, which is precisely the shape of traffic a WAF exists to
     stop. It was made opt-in and paced after the first block; that was
     not enough.

     There is nothing left in this file that reloads a CEAC page. Every
     postback now comes from a human pressing Fill, one per press, and
     popup.js paces those. DO NOT REINTRODUCE AN AUTOMATIC RESUME. */

  // -- reading the page ----------------------------------------------
  const FILLABLE =
    'input[type=text], input[type=tel], input[type=email], input:not([type]), textarea, select, ' +
    'input[type=radio], input[type=checkbox]';

  function visible(el) {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    return !!(r.width || r.height || el.offsetParent);
  }

  /* CEAC lays fields out in tables: the label is nearly always the text
     of the cell before the input, or a span ending in "Label". */
  function deriveLabel(el) {
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    const byFor = el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (byFor) return byFor.textContent.trim();

    const cell = el.closest('td, th');
    if (cell) {
      let prev = cell.previousElementSibling;
      while (prev) {
        const t = prev.textContent.replace(/\s+/g, ' ').trim();
        if (t && !/^[QA]:?$/.test(t)) return t;   // "Q:" / "A:" are not labels
        prev = prev.previousElementSibling;
      }
      const row = cell.closest('tr');
      const prevRow = row && row.previousElementSibling;
      if (prevRow) {
        const t = prevRow.textContent.replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    }
    return (el.title || el.placeholder || '').trim();
  }

  /* Yes/No questions sit in a two-row Q:/A: block, so the neighbouring
     cell is usually just "A:" and the enclosing table holds every
     question on the page. The sentence we want is in one of the rows
     just above; only fall back to climbing ancestors. */
  function questionText(el) {
    const row = el.closest('tr');
    const own = el.closest('td, th');

    /* A "Does Not Apply" box is named by the first cell of its OWN row
       ("U.S. Taxpayer ID Number"), not by the row above - which would be
       the previous field and would tick the wrong box. */
    if (row) {
      for (const cell of row.children) {
        if (cell === own) continue;
        const t = cell.textContent.replace(/\s+/g, ' ').trim();
        if (/^[QA]:?$/.test(t)) continue;
        if (t.length >= 15 && t.length <= 600) return t;
      }
    }

    let prev = row && row.previousElementSibling;
    for (let i = 0; i < 4 && prev; i++, prev = prev.previousElementSibling) {
      const t = prev.textContent.replace(/\s+/g, ' ').replace(/^Q:\s*/, '').trim();
      if (t.length >= 15 && t.length <= 600) return t;
    }
    let n = el.parentElement;
    for (let i = 0; i < 7 && n; i++, n = n.parentElement) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length >= 15 && t.length <= 600) return t;
    }
    return '';
  }

  /* The heading of the block a control sits in - "Address Where You Will
     Stay in the U.S.", "U.S. Contact Address". DS-160 repeats "Street
     Address (Line 1)" verbatim in several blocks, so the label alone
     cannot tell the applicant's home address from the address of the
     ship's agent. This is only ever used to RESTRICT a match, never to
     cause one: the text is broad, and letting it match positively would
     trade one wrong fill for another. */
  const BLOCK_MAX = 14;

  /* A DROPDOWN'S OPTION LIST IS NOT BLOCK CONTEXT, and leaving it in silently
     switched a guard off. The J1 payer block holds the relationship dropdown,
     whose options are CEAC's own closed set - CHILD, PARENT, SPOUSE, OTHER
     RELATIVE, FRIEND, OTHER - so the word RELATIVE landed in the section of
     every control in that block and `RELATIVE_OR_THIRD_PARTY` excluded itself
     from all of them.

     That is the `{...}` filter's lesson a second time: this string is read by
     every `must` and `not` on the page, so anything swept into it that nobody
     wrote as a heading is a coincidence waiting to happen. Here the
     coincidence was protective by accident on the fixture and absent on the
     live page - the guard held in test and failed in production, which is the
     worst way round.

     Options are the whole of a <select>'s text and are read from `el.options`
     when a value is set, so dropping them here costs nothing. */
  function blockText(n) {
    let t = '';
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, {
      acceptNode: x => (x.parentElement && x.parentElement.closest('option'))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    while (w.nextNode()) t += w.currentNode.nodeValue + ' ';
    return t;
  }

  function blockLabel(el) {
    let n = el.parentElement;
    for (let i = 0; i < 10 && n; i++, n = n.parentElement) {
      const count = n.querySelectorAll('input, select, textarea').length;
      if (count < 3) continue;

      /* The heading usually sits OUTSIDE the block's own table - as a
         legend, or as the element just before it - so taking only the
         block's text misses the very words that identify it.

         CEAC does not always use a <fieldset>, and the heading is not always
         the immediately preceding sibling: on the educational-institution
         block it sits a level or two up. Climb until some preceding element
         has text, or give up after a few levels. Without this, `lead` came
         back '' on an oversized block and the section was empty again. */
      let lead = '';
      const fs = n.closest('fieldset');
      const legend = fs && fs.querySelector('legend');
      if (legend) lead = legend.textContent;
      for (let up = n, hops = 0; !lead && up && hops < 4; up = up.parentElement, hops++) {
        let prev = up.previousElementSibling;
        while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling;
        if (prev) lead = prev.textContent;
      }
      /* `{...}` goes first: climbing can sweep up a <style> element's text, and
         this string is read by every `must` and `not` guard on the page, so
         stylesheet words sitting in it are a coincidence waiting to happen. */
      const tidy = s => s.replace(/\{[^}]*\}/g, ' ')
                         .replace(/\s+/g, ' ').trim().slice(0, 240);

      /* Over the cap this is more than one block, so its own text would drag
         half the page in and weaken every guard that reads it. The HEADING
         still identifies it exactly, so return that alone.

         This used to `break` and return '' - and an empty section makes every
         `must` and `not` guard on the block INERT, silently. CEAC's
         educational-institution block has sixteen controls, which is how its
         Country/Region went unfilled: the rule was right, the context it
         depended on was blank. */
      if (count > BLOCK_MAX) return tidy(lead);
      return tidy(lead + ' ' + blockText(n));
    }
    return '';
  }

  /* THE PAGE ITSELF IS PART OF A CONTROL'S CONTEXT, and sometimes the only
     part. On complete_family2.aspx?node=Spouse the spouse's date of birth is
     `ddlDOBDay` / `ddlDOBMonth` / `tbxDOBYear` - the applicant's own control
     ids from Personal 1 - and on the live page those three carry NO LABEL and
     NO BLOCK TEXT at all. Nothing inside the block distinguishes whose
     birthday it is. The page heading does: "Family Information: Spouse".

     So the heading and the `?node=` value are appended to every control's
     section. `must` and `not` read that string, `labels` never do, so this can
     only ever rule a match in or out - it can never invent one. Keep it to the
     heading and the node: the full URL would drag in words like "General" and
     "complete" that a guard could trip over. */
  function pageTag() {
    const h = document.querySelector(
      '#ctl00_SiteContentPlaceHolder_FormView1_lblTitle, h1, h2, .h1');
    const node = (location.search.match(/node=([\w.-]+)/i) || [, ''])[1];
    /* Strip CSS declarations and cap the length. A heading that swept up a
       stylesheet put `legend{font-weight:600}` into every guard's context on
       one fixture - harmless there, but this string is read by every `must` and
       `not` on the page, so junk in it is a bug waiting for a coincidence. */
    return ((h ? h.textContent || '' : '') + ' ' + node)
      .replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function controls() {
    const tag = pageTag();
    return Array.from(document.querySelectorAll(FILLABLE))
      .filter(visible)
      .map(el => ({
        el,
        id: el.id || '',
        name: el.name || '',
        tag: el.tagName.toLowerCase(),
        type: (el.type || '').toLowerCase(),
        label: (el.type === 'radio' || el.type === 'checkbox')
          ? (deriveLabel(el) + ' ' + questionText(el)).trim()
          : deriveLabel(el),
        section: (blockLabel(el) + ' ' + tag).trim(),
      }));
  }

  /* ASP.NET reloads the whole page when one of these changes, so they
     have to be filled one at a time. */
  function isPostback(el) {
    const h = (el.getAttribute('onchange') || '') + (el.getAttribute('onclick') || '');
    return h.indexOf('__doPostBack') >= 0 || h.indexOf('WebForm_DoPostBack') >= 0;
  }

  // -- writing to the page -------------------------------------------
  function fire(el, types) {
    for (const t of types) el.dispatchEvent(new Event(t, { bubbles: true }));
  }

  /* Three outcomes, not two. "Already holds exactly this value" is a
     success - reporting it as a failure told the agent that five
     correctly filled address boxes had gone wrong. */
  const SET = 'set', SAME = 'same', NOMATCH = 'nomatch';

  function setText(el, value) {
    if (el.value === value) return SAME;
    el.focus();
    el.value = value;
    fire(el, ['input', 'change']);
    el.blur();
    return SET;
  }

  /* "Already has a value" must mean somebody answered it, not that the
     browser is showing the first option. A <select> with nothing chosen
     still reports a value, and CEAC's placeholder is not always
     value="" - "- SELECT ONE -" can carry its own text as the value.
     Reading that as an answer skipped the Length of Stay dropdown on the
     live page. A real prior selection still skips, so an agent's own
     choice is never overwritten. */
  function hasRealValue(c) {
    const v = String(c.el.value || '').trim();
    if (!v) return false;
    if (String(c.tag || '').toLowerCase() !== 'select') return true;
    const opt = c.el.selectedOptions && c.el.selectedOptions[0];
    const text = String(opt ? opt.text : '').trim().toUpperCase()
                   .replace(/^-+|-+$/g, '').trim();
    return text !== '' && !/^SELECT\b/.test(text);
  }

  /* Lifted out of setSelect so the skip report can ask the SAME question the
     setter would - "is the option already selected the one this record wants?"
     A dropdown's value is often a code where the record holds the display text
     (`C` against `ALIEN IN TRANSIT (C)`), so comparing the two strings
     directly invents a disagreement that is not there. */
  function findOption(el, value) {
    const want = String(value).trim().toUpperCase();
    if (!want) return null;
    const opts = Array.from(el.options);
    const txt = o => o.text.trim().toUpperCase();

    let hit = opts.find(o => o.value.trim().toUpperCase() === want)
           || opts.find(o => txt(o) === want)
           || opts.find(o => txt(o).startsWith(want))
           || opts.find(o => want.startsWith(txt(o)) && txt(o).length > 2);

    /* CEAC words some options more fully than the printed application
       does - "COMPANY/ORGANIZATION" appears in the print, the dropdown
       may say "OTHER COMPANY/ORGANIZATION". Accept a containment match,
       but only when exactly one option qualifies: picking between two
       plausible options is guessing, and this is a visa form. */
    if (!hit && want.length >= 4) {
      const near = opts.filter(o => txt(o).length >= 4 &&
                                    (txt(o).indexOf(want) >= 0 || want.indexOf(txt(o)) >= 0));
      if (near.length === 1) hit = near[0];
    }
    return hit || null;
  }

  function setSelect(el, value) {
    const hit = findOption(el, value);
    if (!hit) return NOMATCH;
    if (el.value === hit.value) return SAME;
    el.value = hit.value;
    fire(el, ['input', 'change']);
    return SET;
  }

  function setRadio(group, value, quiet) {
    const want = String(value).trim().toUpperCase();
    if (want !== 'YES' && want !== 'NO') return NOMATCH;
    const hit = group.find(c => {
      const t = (deriveLabel(c.el) + ' ' + c.el.value + ' ' + c.id).toUpperCase();
      return want === 'YES' ? /\bY(ES)?\b|_0$/.test(t) : /\bNO?\b|_1$/.test(t);
    });
    if (!hit) return NOMATCH;
    if (hit.el.checked) return SAME;
    hit.el.checked = true;
    if (!quiet) fire(hit.el, ['click', 'change']);
    return SET;
  }

  function setCheckbox(el, value, quiet) {
    const want = String(value).trim().toUpperCase() === 'YES';
    if (el.checked === want) return SAME;
    el.checked = want;
    if (!quiet) fire(el, ['click', 'change']);
    return SET;
  }

  /* CEAC hangs __doPostBack on the conditional questions so that a Yes
     can reveal an explanation box. A No, or a "Does Not Apply" tick,
     reveals nothing - and the value rides the form post either way.
     Setting those silently saves the agent a full page reload each. */
  function revealsNothing(ctl, value) {
    if (ctl.type === 'checkbox') return true;
    if (ctl.type === 'radio') return String(value).trim().toUpperCase() === 'NO';
    return false;
  }

  /* --- Security and Background sweep -------------------------------
     Five pages of sworn Yes/No questions. The agent asked for every one
     to be answered No; the answers are outlined in amber and listed in
     the report so they get read before Next is clicked.

     Answering No is set WITHOUT firing events on purpose. Those radios
     carry __doPostBack so that answering Yes can reveal an explanation
     box - No reveals nothing, and the value is carried by the form post
     anyway. Firing the handler would reload the page once per question. */
  function isSecurityPage() {
    // CEAC uses complete_securityandbackground.aspx?node=SecurityandBackground1..5
    if (/securityandbackground/i.test(location.href)) return true;
    const h = document.querySelector('h1, h2, .h1, #ctl00_SiteContentPlaceHolder_FormView1_lblTitle');
    return !!h && /security\s+and\s+background/i.test(h.textContent || '');
  }

  function sweepSecurityNo(all, radioGroups, report) {
    report.security = [];
    for (const name in radioGroups) {
      const group = radioGroups[name];
      if (group.length !== 2) continue;                       // not a Yes/No pair
      if (M.isForbidden(name) || group.some(c => M.isForbidden(c.id))) continue;
      if (group.some(c => c.el.checked)) continue;            // already answered

      const no = group.find(c => {
        const t = (c.el.value + ' ' + c.id + ' ' + deriveLabel(c.el)).toUpperCase();
        return /\bNO?\b/.test(t) || /_1$/.test(c.id);
      });
      if (!no) continue;

      no.el.checked = true;                                    // quiet on purpose
      mark(no.el, false);
      const q = questionText(no.el).replace(/\s*A:\s*Yes\s*No\s*$/i, '').replace(/^Q:\s*/, '');
      report.security.push({ name, question: q.slice(0, 220) });
    }
  }

  function record(report, status, c, m, value) {
    if (status === SET) {
      mark(c.el, true);
      report.filled.push({ id: c.id, key: m.key, via: m.via, value: String(value) });
    } else if (status === SAME) {
      mark(c.el, true);
      report.already.push({ id: c.id, key: m.key, value: String(value) });
    } else {
      mark(c.el, false);
      const entry = { id: c.id, key: m.key, why: 'no matching option on this page' };
      /* Name what the page actually offers, so the value can be corrected
         once instead of guessed at repeatedly. */
      if (c.tag === 'select') {
        entry.wanted = String(value);
        entry.options = Array.from(c.el.options)
          .map(o => o.text.trim()).filter(Boolean).slice(0, 12);
      }
      report.skipped.push(entry);
    }
  }

  function mark(el, ok) {
    el.setAttribute(MARK, ok ? '1' : '0');
    el.style.outline = ok ? '2px solid #16a34a' : '2px solid #f59e0b';
    el.style.outlineOffset = '1px';
  }

  // -- the fill pass --------------------------------------------------
  /* THE ROW'S POSITION, NOT THE NUMBER IN ITS ID.

     ASP.NET numbers DataList rows ctl00, ctl01, ctl02 ... but a repeater with
     separator templates numbers the DATA rows ctl00, ctl02, ctl04. Using the
     raw number as a list index would then put the college in the senior-high
     row - filled, plausible and wrong on a sworn form, which is the worst
     thing this project produces.

     So the rows actually present are collected per repeater, sorted, and their
     ordinal position is used. That is correct whatever the numbering, and it
     needs no guess about how CEAC numbers anything. */
  function repeaterOrdinals(all) {
    const seen = {};
    for (const c of all) {
      const m = /^(.*)_ctl(\d+)_/.exec(String(c.id || ''));
      if (!m) continue;
      (seen[m[1]] = seen[m[1]] || {})[m[2]] = true;
    }
    const ord = {};
    for (const name in seen) {
      Object.keys(seen[name])
        .sort((a, b) => Number(a) - Number(b))
        .forEach((n, i) => { ord[name + '_ctl' + n] = i; });
    }
    /* id -> ordinal, so valueFor needs nothing but the control it is filling. */
    const byId = {};
    for (const c of all) {
      const m = /^(.*_ctl\d+)_/.exec(String(c.id || ''));
      if (m && ord[m[1]] !== undefined) byId[c.id] = ord[m[1]];
    }
    return byId;
  }

  function valueFor(rec, key, ctl, ordinals) {
    let v = rec[key];
    /* A REPEATED KEY READS ITS ROW, not a single record field. The list is
       resolved FIRST so everything below - the date split, the address wrap -
       works on the value that is actually going into this row. */
    const rep = M.REPEATED && M.REPEATED[key];
    if (rep) {
      const i = (ordinals && ordinals[ctl.id] !== undefined) ? ordinals[ctl.id] : 0;
      const list = rec[rep.list] || [];
      v = list[i] ? list[i][rep.field] : '';
    }
    if (v === undefined || v === null || v === '') return '';
    if (M.KIND[key] === 'date') {
      const parts = M.splitDate(v);
      const part = M.datePart(ctl.id) || M.datePart(ctl.name);
      if (!parts) return '';
      if (!part) return v;
      return parts[part];
    }
    if (M.FULLNAME_KEYS.indexOf(key) >= 0) {
      /* A relative with one name gets Surnames + a ticked Do Not Know box,
         so the given half is left EMPTY rather than filled with FNU. */
      v = M.nameHalf(ctl.id || ctl.name, v,
                     { blankGiven: (M.MONONYM_NA_KEYS || []).indexOf(key) >= 0 });
    }
    if (M.ADDRESS_KEYS.indexOf(key) >= 0) {
      /* Split on LINE 1's own maxlength, whichever box we are filling, so the
         two halves always meet - writing past maxlength lets the browser clip
         the tail away silently. Find the partner by turning the 2 into a 1 in
         this control's own id: a page-wide search for ADDR_LN1 picked the HOME
         address line even while filling the employer's. */
      const id = String(ctl.id || ctl.name || '');
      let cap = ctl.el && ctl.el.maxLength > 0 ? ctl.el.maxLength : 0;
      const partnerId = id.replace(/(_LN)2\b/i, '$11').replace(/Addr2\b/i, 'Addr1');
      if (partnerId !== id) {
        const ln1 = document.getElementById(partnerId);
        if (ln1 && ln1.maxLength > 0) cap = ln1.maxLength;
      }
      v = M.addressHalf(id, v, cap);
    }
    return v;
  }

  function fillPage(rec, overrides, opts) {
    opts = opts || {};
    const report = { filled: [], already: [], skipped: [], unmatched: [], deliberate: [],
                     postbackPending: null, url: location.href,
                     /* Which visa class's page this is, inferred from the rules
                        that actually fired - see CLASS_ONLY in matcher.js. */
                     classSeen: { c1d: 0, j1: 0 }, pageClass: null };
    const all = controls();
    /* Which row of a repeater each control belongs to, by position. */
    const ordinals = repeaterOrdinals(all);

    // Radios sharing a name are one logical question.
    const radioGroups = {};
    for (const c of all) if (c.type === 'radio') (radioGroups[c.name] = radioGroups[c.name] || []).push(c);
    const done = new Set();
    const deferred = [];

    for (const c of all) {
      if (c.type === 'radio' && done.has(c.name)) continue;

      const m = M.matchKey(c, overrides);
      if (!m) {
        /* Report an unmatched radio ONCE per group, rather than not at all.
           Hiding them made a rule that no longer matched look like a filled
           field: the U.S. driver's licence question came back blank from the
           live page with nothing in the report to say why.

           Forbidden controls stay out - they are excluded on purpose, not
           gaps in the rules, and listing them buried the real ones. */
        /* A does-not-apply box left alone is not a gap, but it is not
           nothing either: the U.S. contact organisation box needed ticking
           and this silence hid its id, so there was no way to write a rule
           for it. Report those separately - quiet, but with the id. */
        if (M.isDoesNotApply(c) || (M.isLeftBlank && M.isLeftBlank(c, rec))) {
          report.deliberate.push({ id: c.id, label: c.label });
        } else if (!M.isForbidden(c.id) && !M.isForbidden(c.name)) {
          /* Forbidden controls stay out entirely - excluded on purpose, and
             listing them buried the real gaps. */
          report.unmatched.push({ id: c.id, label: c.label, tag: c.tag });
        }
        if (c.type === 'radio') done.add(c.name);
        continue;
      }
      /* Counted on the MATCH, not on the fill: a Crew Visa page whose boxes
         are all already correct is still a Crew Visa page. */
      const kc = M.classOfKey && M.classOfKey(m.key);
      if (kc && report.classSeen[kc] !== undefined) report.classSeen[kc]++;
      const value = valueFor(rec, m.key, c, ordinals);
      if (!value) {
        /* A FIELD THE RECORD DELIBERATELY LEAVES EMPTY IS NOT A GAP. CEAC
           greys out the Length of Stay number box when the period is LESS
           THAN 24 HOURS, so `prevStayLength` is blank on purpose - but it was
           landing in `skipped` as "no value in record", which is the exact
           string popup.js reads as "this record is stale, send it again".
           Re-sending can never fill it, so the banner would nag forever.
           normalize.js names those keys in `_blankOnPurpose`. */
        if ((rec._blankOnPurpose || []).indexOf(m.key) >= 0) {
          report.deliberate.push({ id: c.id, key: m.key, label: c.label });
        } else if ((M.MONONYM_NA_KEYS || []).indexOf(m.key) >= 0 &&
                   /GIVEN/i.test(c.id || c.name) &&
                   rec[m.key.replace(/Name$/, 'GivenNA')] === 'YES') {
          /* A RELATIVE WITH ONE NAME GETS A TICKED "Do Not Know" BESIDE AN
             EMPTY GIVEN NAMES BOX - that is the answer, not a gap. The box
             was landing in `skipped` as "no value in record", the exact
             string popup.js reads as "stale record, send it again", so every
             mononym parent raised a red banner that no re-send could clear.
             The record says so itself: fatherGivenNA / motherGivenNA is why
             the half is blank. */
          report.deliberate.push({ id: c.id, key: m.key, label: c.label });
        } else if (M.KIND[m.key] === 'date' && rec[m.key] && !M.splitDate(rec[m.key])) {
          /* A DATE THE RECORD HOLDS BUT CANNOT BE SPLIT IS NOT A MISSING
             VALUE, and saying so sent the operator to re-send a record that
             was never going to improve. A father's date of birth parsed out
             of an Excel serial as the year 18628 fails splitDate() on its
             five-digit year, and this line reported it as an empty column
             while the sheet held it all along. Note the wording: popup.js
             reads the exact string "no value in record" as "stale record,
             send it again", so a malformed date must not use it. */
          report.skipped.push({ id: c.id, key: m.key,
            why: 'the record holds "' + rec[m.key] + '", which is not a DD-MMM-YYYY date' });
        } else {
          report.skipped.push({ id: c.id, key: m.key, why: 'no value in record' });
        }
        continue;
      }
      if (!opts.overwrite && c.type !== 'radio' && c.type !== 'checkbox' &&
          hasRealValue(c) && !c.el.hasAttribute(MARK)) {
        /* A BOX THAT DISAGREES WITH THE RECORD IS NOT THE SAME AS ONE THE
           OPERATOR TYPED. Both are left alone - never overwrite someone's own
           entry - but "already has a value" says nothing, and on the J1 Travel
           page it hid a wrong sworn answer: the payer's name boxes still held
           the applicant's own name from a pass before the fix, and the report
           read exactly the same as it does for an address typed by hand.

           So say what is in the box and what the record wants whenever they
           differ. Then leaving it alone is the operator's decision, taken with
           the disagreement in front of them, rather than ours taken silently.

           The wording deliberately avoids "no value in record" - popup.js
           reads that exact string as "stale record, send it again", which is
           the wrong instruction here. */
        let held = String(c.el.value || '').trim(), agrees;
        if (c.tag === 'select') {
          const sel = c.el.options[c.el.selectedIndex];
          if (sel) held = sel.text.trim();
          const hit = findOption(c.el, value);
          agrees = !!hit && hit.value === c.el.value;
        } else {
          agrees = held.toUpperCase() === String(value).trim().toUpperCase();
        }
        report.skipped.push({ id: c.id, key: m.key,
          why: (held && !agrees)
            ? 'the box holds "' + held + '", the record says "' + value +
              '" - clear the box and Fill again to replace it'
            : 'already has a value' });
        continue;
      }
      if (isPostback(c.el)) {
        if (revealsNothing(c, value)) {
          const st = c.type === 'radio' ? setRadio(radioGroups[c.name], value, true)
                                        : setCheckbox(c.el, value, true);
          done.add(c.name);
          record(report, st, c, m, value);
        } else {
          deferred.push({ c, m, value });
          done.add(c.name);
        }
        continue;
      }

      let st;
      if (c.type === 'radio') { st = setRadio(radioGroups[c.name], value); done.add(c.name); }
      else if (c.type === 'checkbox') st = setCheckbox(c.el, value);
      else if (c.tag === 'select') st = setSelect(c.el, value);
      else st = setText(c.el, value);
      record(report, st, c, m, value);
    }

    if (rec.securityAllNo === 'YES' && isSecurityPage()) sweepSecurityNo(all, radioGroups, report);

    /* One *reloading* postback per pass. Walk the queue until something
       actually changes: an answer already correct reloads nothing, so it
       must not consume the pass. Previously only deferred[0] was ever
       touched, and a page with two postback questions - Previous U.S.
       Travel has "been in the U.S." and "issued a U.S. Visa" - left the
       second permanently unfilled and unreported once the first was
       already answered. */
    for (let i = 0; i < deferred.length; i++) {
      const d = deferred[i];
      let st;
      if (d.c.type === 'radio') st = setRadio(radioGroups[d.c.name], d.value);
      else if (d.c.type === 'checkbox') st = setCheckbox(d.c.el, d.value);
      else if (d.c.tag === 'select') st = setSelect(d.c.el, d.value);
      else st = setText(d.c.el, d.value);
      if (st === SET) {
        report.postbackPending = { id: d.c.id, key: d.m.key, value: String(d.value),
                                   applied: true, remaining: deferred.length - 1 - i };
        break;
      }
      record(report, st, d.c, d.m, d.value);
    }

    /* ONE CLASS ONLY, OR NOTHING. Most DS-160 pages - Personal, Passport,
       Family, Security - belong to no class at all and must not be labelled;
       and if both sets somehow fired, that is a contradiction rather than an
       answer, so say nothing rather than pick one. */
    const cs = report.classSeen;
    if (cs.c1d && !cs.j1) report.pageClass = 'c1d';
    else if (cs.j1 && !cs.c1d) report.pageClass = 'j1';
    return report;
  }

  function pageMap() {
    return controls().map(c => ({
      /* `section` is the ONLY thing a must/not guard is judged on beyond the
         id, name and label, so a map without it cannot explain why a guarded
         rule did not fire - which is the main reason to reach for this map at
         all. It was missing here while CLAUDE.md said it was reported. */
      id: c.id, name: c.name, tag: c.tag, type: c.type, label: c.label,
      section: c.section,
      matched: (M.matchKey(c, {}) || {}).key || null,
      forbidden: M.isForbidden(c.id) || M.isForbidden(c.name),
    }));
  }

  // Content scripts run in an isolated world, so this is not reachable
  // from ceac.state.gov itself - it exists so test/fake-security.html
  // can drive the filler against a stand-in DS-160 page.
  window.DS160Filler = { fillPage, pageMap, isSecurityPage, controls, questionText };

  // -- messaging ------------------------------------------------------
  /* Reloading the extension orphans the content scripts already running
     in open CEAC tabs: chrome.* then throws "Extension context
     invalidated" on the next call. The page still works, but the errors
     pile up in chrome://extensions, so every call is guarded and the
     agent is told to refresh rather than left guessing. */
  const alive = () => {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  };
  if (!alive()) return;

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    if (!alive()) return false;
    if (msg.type === 'ds160:fill') {
      chrome.storage.local.get(['record', 'overrides'], st => {
        if (!st.record) { send({ error: 'No applicant loaded. Open the worksheet and send one to the extension.' }); return; }
        send(fillPage(st.record, st.overrides || {}, { overwrite: !!msg.overwrite }));
      });
      return true;
    }
    if (msg.type === 'ds160:map') { send({ map: pageMap(), url: location.href }); return true; }
    return false;
  });
})();
