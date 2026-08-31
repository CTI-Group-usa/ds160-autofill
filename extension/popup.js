/* Popup: shows the loaded applicant, runs a fill pass, and lets the
   agent teach the matcher a field it could not identify. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const KEYS = Array.from(new Set(window.DS160Matcher.RULES.map(r => r.key))).sort();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function showWho(rec) {
    $('who').innerHTML = rec
      ? '<b>' + esc(rec.surname + ', ' + rec.givenNames) + '</b>' +
        '<span>' + esc(rec.passportNumber || 'no passport no.') + ' &middot; ' +
        esc(rec.dob || '') + ' &middot; ' + esc(rec.cruiseLine || '') + '</span>'
      : 'No applicant loaded.';
  }

  function list(title, items, cls, render) {
    if (!items || !items.length) return '';
    return '<div class="' + cls + '">' + title + ' (' + items.length + ')</div><ul>' +
      items.map(x => '<li>' + render(x) + '</li>').join('') + '</ul>';
  }

  function showReport(rep) {
    if (rep.error) { $('report').innerHTML = '<div class="err">' + esc(rep.error) + '</div>'; return; }
    let h = '';
    if (rep.security && rep.security.length) {
      h += '<div class="sweep"><b>Answered &ldquo;No&rdquo; to ' + rep.security.length +
           ' Security and Background question(s).</b> These are sworn answers &mdash; ' +
           'read each one on the page before you click Next.<ul>' +
           rep.security.map(s => '<li>' + esc(s.question) + '</li>').join('') + '</ul></div>';
    }
    h += list('Filled', rep.filled, 'ok', x => esc(x.key) + ' &rarr; <code>' + esc(x.value) + '</code>');
    if (rep.postbackPending) {
      const p = rep.postbackPending;
      h += '<div class="warn">The page reloads after <code>' + esc(p.key) + '</code>' +
           (p.remaining ? ' (' + p.remaining + ' more like it)' : '') +
           '. Auto-continue picks up where it left off; otherwise press Fill again.</div>';
    }
    h += list('Skipped', rep.skipped, 'warn', x => esc(x.key) + ' &ndash; ' + esc(x.why));
    h += list('Not recognised', rep.unmatched.slice(0, 25), 'warn', x => '<code>' + esc(x.label || x.id) + '</code>');
    $('report').innerHTML = h || '<div class="warn">Nothing on this page matched.</div>';
  }

  function withTab(fn) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const t = tabs[0];
      if (!t || !/^https:\/\/ceac\.state\.gov\//.test(t.url || '')) {
        $('report').innerHTML = '<div class="err">Open a DS-160 page on ceac.state.gov first.</div>';
        return;
      }
      fn(t);
    });
  }

  // -- boot -----------------------------------------------------------
  chrome.storage.local.get(['record', 'autoContinue', 'lastReport'], st => {
    showWho(st.record);
    $('auto').checked = st.autoContinue !== false;
    if (st.lastReport) showReport(st.lastReport);
  });

  $('auto').addEventListener('change', () =>
    chrome.storage.local.set({ autoContinue: $('auto').checked, autoStep: 0 }));

  $('fill').addEventListener('click', () => withTab(tab => {
    $('report').textContent = 'Filling...';
    chrome.tabs.sendMessage(tab.id, { type: 'ds160:fill', overwrite: $('overwrite').checked }, rep => {
      if (chrome.runtime.lastError) {
        $('report').innerHTML = '<div class="err">' + esc(chrome.runtime.lastError.message) +
          ' - reload the DS-160 page and try again.</div>';
        return;
      }
      chrome.storage.local.set({ lastReport: rep });
      showReport(rep);
    });
  }));

  $('load').addEventListener('click', () => {
    try {
      const rec = JSON.parse($('json').value);
      chrome.storage.local.set({ record: rec, autoStep: 0 }, () => {
        showWho(rec);
        $('report').innerHTML = '<div class="ok">Applicant loaded.</div>';
      });
    } catch (e) {
      $('report').innerHTML = '<div class="err">That is not valid JSON.</div>';
    }
  });

  // -- teaching -------------------------------------------------------
  function renderTeach(map, overrides) {
    const rows = map.filter(m => !m.matched && !m.forbidden && m.id).slice(0, 40);
    $('teach').innerHTML = rows.length
      ? rows.map(m =>
          '<div class="teach"><code title="' + esc(m.id) + '">' + esc(m.label || m.id) + '</code>' +
          '<select data-id="' + esc(m.id) + '"><option value="">-- ignore --</option>' +
          KEYS.map(k => '<option' + (overrides[m.id] === k ? ' selected' : '') + '>' + k + '</option>').join('') +
          '</select></div>').join('')
      : '<div class="ok">Every field on this page is recognised.</div>';

    $('teach').querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        chrome.storage.local.get('overrides', st => {
          const ov = st.overrides || {};
          if (sel.value) ov[sel.dataset.id] = sel.value; else delete ov[sel.dataset.id];
          chrome.storage.local.set({ overrides: ov });
        });
      });
    });
  }

  $('scan').addEventListener('click', () => withTab(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'ds160:map' }, res => {
      if (chrome.runtime.lastError || !res) return;
      chrome.storage.local.get('overrides', st => renderTeach(res.map, st.overrides || {}));
    });
  }));

  $('copymap').addEventListener('click', () => withTab(tab => {
    chrome.tabs.sendMessage(tab.id, { type: 'ds160:map' }, res => {
      if (chrome.runtime.lastError || !res) return;
      navigator.clipboard.writeText(JSON.stringify(res, null, 2));
      $('report').innerHTML = '<div class="ok">Page map copied to the clipboard.</div>';
    });
  }));
})();
