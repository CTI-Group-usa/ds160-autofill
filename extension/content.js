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
  const MAX_AUTO_STEPS = 12;

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

  function setSelect(el, value) {
    const want = String(value).trim().toUpperCase();
    if (!want) return false;
    const opts = Array.from(el.options);
    let hit = opts.find(o => o.value.trim().toUpperCase() === want)
           || opts.find(o => o.text.trim().toUpperCase() === want)
           || opts.find(o => o.text.trim().toUpperCase().startsWith(want))
           || opts.find(o => want.startsWith(o.text.trim().toUpperCase()) && o.text.trim().length > 2);
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
      report.skipped.push({ id: c.id, key: m.key, why: 'no matching option on this page' });
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
        if (c.type !== 'radio') report.unmatched.push({ id: c.id, label: c.label, tag: c.tag });
        continue;
      }
      const value = valueFor(rec, m.key, c);
      if (!value) { report.skipped.push({ id: c.id, key: m.key, why: 'no value in record' }); continue; }
      if (!opts.overwrite && c.type !== 'radio' && c.type !== 'checkbox' &&
          c.el.value && c.el.value.trim() && !c.el.hasAttribute(MARK)) {
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

    // One postback control per pass; the page reloads after it.
    if (deferred.length) {
      const d = deferred[0];
      let st;
      if (d.c.type === 'radio') st = setRadio(radioGroups[d.c.name], d.value);
      else if (d.c.type === 'checkbox') st = setCheckbox(d.c.el, d.value);
      else if (d.c.tag === 'select') st = setSelect(d.c.el, d.value);
      else st = setText(d.c.el, d.value);
      /* Already correct means nothing reloads, so this is not a pending
         postback and the agent is not told to press Fill again. */
      if (st === SET) {
        report.postbackPending = { id: d.c.id, key: d.m.key, value: String(d.value),
                                   applied: true, remaining: deferred.length - 1 };
      } else {
        record(report, st, d.c, d.m, d.value);
      }
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
        if (rep.postbackPending && st.autoContinue !== false) {
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

  /* Resume automatically after an ASP.NET postback reload. */
  try {
    chrome.storage.local.get(['autoStep', 'autoContinue', 'record', 'overrides'], st => {
      if (!alive() || st.autoContinue === false || !st.record) return;
      const step = st.autoStep || 0;
      if (step <= 0 || step > MAX_AUTO_STEPS) return;
      setTimeout(() => {
        if (!alive()) return;
        try {
          const rep = fillPage(st.record, st.overrides || {}, {});
          chrome.storage.local.set({ autoStep: rep.postbackPending ? step + 1 : 0, lastReport: rep });
        } catch (e) { /* the extension was reloaded mid-pass */ }
      }, 400);
    });
  } catch (e) { /* orphaned by an extension reload; refreshing the page fixes it */ }
})();
