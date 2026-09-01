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
  /* CEAC sits behind a WAF, and on 2026-08-31 it blocked the agent
     mid-application. A burst of postbacks answered 400ms apart, twelve
     deep, is exactly the shape of traffic that trips one. Auto-continue
     is now opt-in, paced at human speed, and gives up early: a tool that
     gets the agent blocked is worse than one that asks for another
     click. */
  const MAX_AUTO_STEPS = 3;
  const AUTO_DELAY_MS = 2500;

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
  function blockLabel(el) {
    let n = el.parentElement;
    for (let i = 0; i < 10 && n; i++, n = n.parentElement) {
      const count = n.querySelectorAll('input, select, textarea').length;
      if (count < 3) continue;
      if (count > 14) break;          // too big to be one block; stop guessing

      /* The heading usually sits OUTSIDE the block's own table - as a
         legend, or as the element just before it - so taking only the
         block's text misses the very words that identify it. */
      let lead = '';
      const fs = n.closest('fieldset');
      const legend = fs && fs.querySelector('legend');
      if (legend) lead = legend.textContent;
      if (!lead) {
        let prev = n.previousElementSibling;
        while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling;
        if (prev) lead = prev.textContent;
      }
      return (lead + ' ' + n.textContent).replace(/\s+/g, ' ').trim().slice(0, 240);
    }
    return '';
  }

  function controls() {
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
        section: blockLabel(el),
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

  function setSelect(el, value) {
    const want = String(value).trim().toUpperCase();
    if (!want) return NOMATCH;
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
  function valueFor(rec, key, ctl) {
    let v = rec[key];
    if (v === undefined || v === null || v === '') return '';
    if (M.KIND[key] === 'date') {
      const parts = M.splitDate(v);
      const part = M.datePart(ctl.id) || M.datePart(ctl.name);
      if (!parts) return '';
      if (!part) return v;
      return parts[part];
    }
    if (M.FULLNAME_KEYS.indexOf(key) >= 0) v = M.nameHalf(ctl.id || ctl.name, v);
    return v;
  }

  function fillPage(rec, overrides, opts) {
    opts = opts || {};
    const report = { filled: [], already: [], skipped: [], unmatched: [], postbackPending: null, url: location.href };
    const all = controls();

    // Radios sharing a name are one logical question.
    const radioGroups = {};
    for (const c of all) if (c.type === 'radio') (radioGroups[c.name] = radioGroups[c.name] || []).push(c);
    const done = new Set();
    const deferred = [];

    for (const c of all) {
      if (c.type === 'radio' && done.has(c.name)) continue;

      const m = M.matchKey(c, overrides);
      if (!m) {
        /* Forbidden controls are excluded on purpose, not gaps in the
           rules. Listing them as unrecognised is noise that hides the
           real gaps - the tooltip language picker was showing up as one. */
        if (c.type !== 'radio' && !M.isDoesNotApply(c) &&
            !M.isForbidden(c.id) && !M.isForbidden(c.name)) {
          report.unmatched.push({ id: c.id, label: c.label, tag: c.tag });
        }
        continue;
      }
      const value = valueFor(rec, m.key, c);
      if (!value) { report.skipped.push({ id: c.id, key: m.key, why: 'no value in record' }); continue; }
      if (!opts.overwrite && c.type !== 'radio' && c.type !== 'checkbox' &&
          hasRealValue(c) && !c.el.hasAttribute(MARK)) {
        report.skipped.push({ id: c.id, key: m.key, why: 'already has a value' });
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
    return report;
  }

  function pageMap() {
    return controls().map(c => ({
      id: c.id, name: c.name, tag: c.tag, type: c.type, label: c.label,
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
      chrome.storage.local.get(['record', 'overrides', 'autoContinue'], st => {
        if (!st.record) { send({ error: 'No applicant loaded. Open the worksheet and send one to the extension.' }); return; }
        const rep = fillPage(st.record, st.overrides || {}, { overwrite: !!msg.overwrite });
        if (rep.postbackPending && st.autoContinue === true) {
          chrome.storage.local.set({ autoStep: (msg.step || 0) + 1 });
        } else {
          chrome.storage.local.set({ autoStep: 0 });
        }
        send(rep);
      });
      return true;
    }
    if (msg.type === 'ds160:map') { send({ map: pageMap(), url: location.href }); return true; }
    return false;
  });

  /* Resume after an ASP.NET postback reload - only if explicitly asked. */
  try {
    chrome.storage.local.get(['autoStep', 'autoContinue', 'record', 'overrides'], st => {
      if (!alive() || st.autoContinue !== true || !st.record) return;
      const step = st.autoStep || 0;
      if (step <= 0 || step > MAX_AUTO_STEPS) return;
      setTimeout(() => {
        if (!alive()) return;
        try {
          const rep = fillPage(st.record, st.overrides || {}, {});
          chrome.storage.local.set({ autoStep: rep.postbackPending ? step + 1 : 0, lastReport: rep });
        } catch (e) { /* the extension was reloaded mid-pass */ }
      }, AUTO_DELAY_MS);
    });
  } catch (e) { /* orphaned by an extension reload; refreshing the page fixes it */ }
})();
