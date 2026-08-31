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
        if (t) return t;
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

  /* Yes/No questions live in a Q:/A: block, so the adjacent cell is
     often just "A:". Climb until an ancestor holds the real sentence. */
  function questionText(el) {
    let n = el.parentElement;
    for (let i = 0; i < 7 && n; i++, n = n.parentElement) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length >= 15 && t.length <= 600) return t;
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

  function setText(el, value) {
    if (el.value === value) return false;
    el.focus();
    el.value = value;
    fire(el, ['input', 'change']);
    el.blur();
    return true;
  }

  function setSelect(el, value) {
    const want = String(value).trim().toUpperCase();
    if (!want) return false;
    const opts = Array.from(el.options);
    let hit = opts.find(o => o.value.trim().toUpperCase() === want)
           || opts.find(o => o.text.trim().toUpperCase() === want)
           || opts.find(o => o.text.trim().toUpperCase().startsWith(want))
           || opts.find(o => want.startsWith(o.text.trim().toUpperCase()) && o.text.trim().length > 2);
    if (!hit) return false;
    if (el.value === hit.value) return false;
    el.value = hit.value;
    fire(el, ['input', 'change']);
    return true;
  }

  function setRadio(group, value) {
    const want = String(value).trim().toUpperCase();
    if (want !== 'YES' && want !== 'NO') return false;
    const hit = group.find(c => {
      const t = (deriveLabel(c.el) + ' ' + c.el.value + ' ' + c.id).toUpperCase();
      return want === 'YES' ? /\bY(ES)?\b|_0$/.test(t) : /\bNO?\b|_1$/.test(t);
    });
    if (!hit || hit.el.checked) return false;
    hit.el.checked = true;
    fire(hit.el, ['click', 'change']);
    return true;
  }

  function setCheckbox(el, value) {
    const want = String(value).trim().toUpperCase() === 'YES';
    if (el.checked === want) return false;
    el.checked = want;
    fire(el, ['click', 'change']);
    return true;
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
    const report = { filled: [], skipped: [], unmatched: [], postbackPending: null, url: location.href };
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
      if (isPostback(c.el)) { deferred.push({ c, m, value }); continue; }

      let ok = false;
      if (c.type === 'radio') { ok = setRadio(radioGroups[c.name], value); done.add(c.name); }
      else if (c.type === 'checkbox') ok = setCheckbox(c.el, value);
      else if (c.tag === 'select') ok = setSelect(c.el, value);
      else ok = setText(c.el, value);

      if (ok) { mark(c.el, true); report.filled.push({ id: c.id, key: m.key, via: m.via, value: String(value) }); }
      else { mark(c.el, false); report.skipped.push({ id: c.id, key: m.key, why: 'no matching option / unchanged' }); }
    }

    // One postback control per pass; the page reloads after it.
    if (deferred.length) {
      const d = deferred[0];
      let ok = false;
      if (d.c.type === 'radio') ok = setRadio(radioGroups[d.c.name], d.value);
      else if (d.c.type === 'checkbox') ok = setCheckbox(d.c.el, d.value);
      else if (d.c.tag === 'select') ok = setSelect(d.c.el, d.value);
      else ok = setText(d.c.el, d.value);
      report.postbackPending = { id: d.c.id, key: d.m.key, value: String(d.value), applied: ok, remaining: deferred.length - 1 };
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

  // -- messaging ------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
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
  chrome.storage.local.get(['autoStep', 'autoContinue', 'record', 'overrides'], st => {
    if (st.autoContinue === false || !st.record) return;
    const step = st.autoStep || 0;
    if (step <= 0 || step > MAX_AUTO_STEPS) return;
    setTimeout(() => {
      const rep = fillPage(st.record, st.overrides || {}, {});
      chrome.storage.local.set({ autoStep: rep.postbackPending ? step + 1 : 0, lastReport: rep });
    }, 400);
  });
})();
