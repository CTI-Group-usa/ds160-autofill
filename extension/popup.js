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

  const RECORD_V = 7;

  /* No count of "constant answers included" here. That number came from
     a key list kept by hand, it went stale the moment a constant was
     added, and it then told the agent the record was current when it was
     not. When the record is behind, the fill report says so per field -
     that cannot drift. */
  function showWho(rec) {
    if (!rec) { $('who').innerHTML = 'No applicant loaded.'; return; }
    let when = '';
    try { when = rec._sentAt ? new Date(rec._sentAt).toLocaleTimeString() : ''; } catch (e) { /* ignore */ }
    let h = '<b>' + esc(rec.surname + ', ' + rec.givenNames) + '</b>' +
      '<span>' + esc(rec.passportNumber || 'no passport no.') + ' &middot; ' +
      esc(rec.dob || '') + ' &middot; ' + esc(rec.cruiseLine || '') + '</span>' +
      (when ? '<span>sent ' + esc(when) + '</span>' : '');
    if ((rec._v || 0) < RECORD_V) {
      h += '<div class="stale">This applicant was sent by an older version of the ' +
           'worksheet. Open it and press <b>Send to extension</b> again.</div>';
    }
    $('who').innerHTML = h;
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
    // Already correct is a success, and saying so is what tells the agent
    // the page is done rather than broken.
    h += list('Already correct', rep.already, 'ok', x => esc(x.key) + ' &rarr; <code>' + esc(x.value) + '</code>');
    if (rep.postbackPending) {
      const p = rep.postbackPending;
      h += '<div class="warn">The page reloads after <code>' + esc(p.key) + '</code>' +
           (p.remaining ? ' (' + p.remaining + ' more like it)' : '') +
           '. Auto-continue picks up where it left off; otherwise press Fill again.</div>';
    }
    /* "no value in record" almost always means the record predates a
       constant that has since been added or edited. Saying so beats any
       version number, which is only as good as the last time someone
       remembered to bump it. */
    if (!rep.filled.length && !rep.skipped.length && !rep.postbackPending && rep.already.length) {
      h = '<div class="ok"><b>This page is already complete.</b> ' + rep.already.length +
          ' field(s) hold the right values.</div>' + h;
    }
    /* Two different reasons a field is empty, and only one of them is
       fixable by re-sending. Telling the agent to press Send again for a
       column the intake form has never collected nags forever and trains
       them to ignore the banner. */
    const noSource = new Set(((window.DS160 && window.DS160.MISSING_FROM_INTAKE) || [])
                               .map(x => x[0]));
    const empty = rep.skipped.filter(x => x.why === 'no value in record');
    const absent = empty.filter(x => noSource.has(x.key));
    const stale  = empty.filter(x => !noSource.has(x.key));
    if (absent.length) {
      h += '<div class="note">The intake form does not collect ' +
           '<code>' + absent.slice(0, 6).map(x => esc(x.key)).join(', ') + '</code>' +
           (absent.length > 6 ? ' and ' + (absent.length - 6) + ' more' : '') +
           '. Fill these by hand - re-sending the applicant will not help.</div>';
    }
    if (stale.length >= 2) {
      h += '<div class="stale">' + stale.length + ' field(s) on this page have no value in the ' +
           'loaded record: <code>' + stale.slice(0, 6).map(x => esc(x.key)).join(', ') + '</code>. ' +
           'If you have changed the Constant answers or Trip details since sending this applicant, ' +
           'press <b>Send to extension</b> again in the worksheet.</div>';
    }
    h += list('Skipped', rep.skipped, 'warn', x => esc(x.key) + ' &ndash; ' + esc(x.why) +
      (x.options
        ? '<br>wanted <code>' + esc(x.wanted) + '</code><br>page offers: <code>' +
          esc(x.options.join(' | ')) + '</code>'
        : ''));
    // Both the label and the id: the id is what a new matcher rule needs.
    h += list('Not recognised', rep.unmatched.slice(0, 25), 'warn',
              x => esc((x.label || '').slice(0, 60)) +
                   (x.id ? ' <code>' + esc(x.id.replace(/^ctl00_SiteContentPlaceHolder_FormView1_/, '')) + '</code>' : ''));
    /* Not a gap and not an error: boxes we leave unticked on purpose. Shown
       with their ids because that is what a rule needs when one of them turns
       out to want ticking - the U.S. contact organisation box was invisible
       here and could not be written against. */
    h += list('Left blank on purpose', (rep.deliberate || []).slice(0, 15), 'ok',
              x => esc((x.label || '').slice(0, 40)) +
                   (x.id ? ' <code>' + esc(x.id.replace(/^ctl00_SiteContentPlaceHolder_FormView1_/, '')) + '</code>' : ''));
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
    $('auto').checked = st.autoContinue === true;
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
