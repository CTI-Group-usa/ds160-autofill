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
  /* WHICH VISA CLASS THIS RECORD IS. apply() stamps `_class`, and the whole
     reason to show it is that a record of one class filled into the other
     class's application is otherwise invisible: a C1/D record on a J1 form
     writes the cruise line's U.S. contact and the manning agency into boxes
     that take them happily, and a filled field appears in no report.

     An older record predates the stamp entirely, and guessing its class from
     the fields it happens to carry would be exactly the wrong instinct - say
     "not stated" and let the operator re-send. */
  const CLASS_LABEL = { c1d: 'C1/D &middot; seafarer', j1: 'J1 &middot; exchange visitor' };

  /* Kept beside the record rather than read from it inside showReport: the
     popup is a fresh document each time it opens, and the report is rendered
     from chrome.storage in the same pass as the record. */
  let lastClass = null;

  function showWho(rec) {
    /* Cleared BEFORE the early return, so a record that is unloaded cannot
       leave its class behind for the next report to compare against. */
    lastClass = (rec && rec._class) || null;
    if (!rec) { $('who').innerHTML = 'No applicant loaded.'; return; }
    let when = '';
    try { when = rec._sentAt ? new Date(rec._sentAt).toLocaleTimeString() : ''; } catch (e) { /* ignore */ }
    const cls = rec._class;
    let h = '<div class="cls' + (cls ? ' ' + esc(cls) : ' unknown') + '">' +
      (cls ? CLASS_LABEL[cls] || esc(cls) : 'visa class not stated - re-send this applicant') +
      '</div>' +
      '<b>' + esc(rec.surname + ', ' + rec.givenNames) + '</b>' +
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
    /* THE PAGE AND THE RECORD DISAGREE. This is the one thing the class chip
       exists to catch, and it goes FIRST and loud: a C1/D record on the
       exchange-visitor page - or the reverse - fills boxes that accept the
       wrong principal's details without complaint, and a filled field appears
       in no report. content.js infers the page's class only from rules that
       actually fired on class-exclusive pages, and says nothing when the page
       belongs to no class, which is most of them. */
    if (rep.pageClass && lastClass && rep.pageClass !== lastClass) {
      h += '<div class="err"><b>This page belongs to a different visa class.</b> ' +
           'The applicant loaded here is <b>' + esc(lastClass.toUpperCase()) + '</b>, ' +
           'but this is a <b>' + esc(rep.pageClass.toUpperCase()) + '</b> page. ' +
           'Nothing on this page should be filled from that record &mdash; open the ' +
           'worksheet, switch to the right tab and send the applicant again.</div>';
    }
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
           '. Press Fill again once the page has settled.</div>';
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

  /* -- PACING. CEAC HAS BLOCKED THIS SESSION THREE TIMES -------------
     Every time it was the rate of page reloads, not a bug: every postback
     control the filler applies reloads the page, and a human pressing Fill
     again the moment it comes back produces exactly the burst a WAF exists
     to stop. The filler was already as quiet as it can be - all safe fields
     first, then ONE postback per pass, and No answers and Does-Not-Apply
     ticks set without firing a reload at all. What was missing was anything
     stopping the operator hammering the button.

     So after a pass that fires a postback, Fill is disabled with a visible
     countdown and a line saying why. It survives the popup closing, because
     the timestamp is in chrome.storage.

     This is now the ONLY pacing in the extension: auto-continue, the other
     thing that could reload a page, was deleted rather than tuned again.

     DO NOT SHORTEN IT FOR CONVENIENCE. Auto-continue was tuned down twice
     and blocked the session twice anyway. A block costs the whole day's
     applications, not one page. Raised from 8s to 10s on 2026-09-02 at the
     user's request, after the third block. */
  const FILL_COOLDOWN_MS = 10000;

  /* Two independent gates - the sign-in and the cool-down - so they are
     resolved in ONE place. Writing `fill.disabled` from both would let
     whichever ran last silently undo the other. */
  let authAllows = false;
  let authMessage = 'Checking the sign-in...';
  let cooldownUntil = 0;
  let ticker = null;

  function updateFill() {
    const fill = $('fill');
    const left = Math.max(0, cooldownUntil - Date.now());
    const cooling = left > 0;
    fill.disabled = !authAllows || cooling;
    fill.title = !authAllows ? authMessage
               : cooling ? 'Paused so the page reloads are not a burst' : '';

    const box = $('cooldown');
    box.hidden = !cooling;
    if (cooling) {
      box.textContent = 'Page reloaded on CEAC. Pausing ' + Math.ceil(left / 1000) +
                        's - a burst of reloads is what got this session blocked before.';
    }
    if (cooling && !ticker) ticker = setInterval(updateFill, 250);
    if (!cooling && ticker) { clearInterval(ticker); ticker = null; }
  }

  function startCooldown() {
    cooldownUntil = Date.now() + FILL_COOLDOWN_MS;
    chrome.storage.local.set({ fillCooldownUntil: cooldownUntil });
    updateFill();
  }

  /* -- the sign-in gate ----------------------------------------------
     Fill starts DISABLED and is only enabled once the Worker has confirmed
     a live @cti-usa.com session, or the grace period covers a service that
     cannot be reached. Starting enabled and switching off would leave a
     window where a click gets through, which is the whole thing this is
     meant to prevent. */
  function renderAuth() {
    const box = $('auth');
    authAllows = false;
    authMessage = 'Checking the sign-in...';
    updateFill();
    chrome.runtime.sendMessage({ type: 'ds160:checkAuth' }, d => {
      if (chrome.runtime.lastError || !d) {
        box.hidden = false;
        box.className = 'authbox deny';
        box.textContent = 'The background worker did not answer, so the sign-in could not be ' +
                          'checked. Check chrome://extensions for an error on this extension.';
        authAllows = false;
        authMessage = 'Sign-in could not be checked';
        updateFill();
        return;
      }
      box.hidden = false;
      if (d.allow && d.reason === 'verified') {
        box.className = 'authbox ok';
        box.textContent = 'Signed in as ' + (d.email || d.name || 'a CTI account');
      } else if (d.allow) {
        box.className = 'authbox grace';
        box.textContent = d.message;
      } else {
        box.className = 'authbox deny';
        box.textContent = d.message;
      }
      authAllows = !!d.allow;
      authMessage = d.allow ? '' : d.message;
      updateFill();
    });
  }
  renderAuth();

  // -- boot -----------------------------------------------------------
  chrome.storage.local.get(['record', 'lastReport', 'fillCooldownUntil'], st => {
    showWho(st.record);
    if (st.lastReport) showReport(st.lastReport);
    /* The popup is a fresh document every time it opens, so the cool-down
       has to come back from storage or closing the popup would clear it. */
    cooldownUntil = Number(st.fillCooldownUntil) || 0;
    updateFill();
  });

  $('fill').addEventListener('click', () => withTab(tab => {
    /* Belt and braces: the button is disabled without a session, and a
       disabled button fires no click - but an extension popup is a page
       like any other, and `disabled` is one devtools edit away. */
    if ($('fill').disabled) return;
    $('report').textContent = 'Filling...';
    chrome.tabs.sendMessage(tab.id, { type: 'ds160:fill', overwrite: $('overwrite').checked }, rep => {
      if (chrome.runtime.lastError) {
        $('report').innerHTML = '<div class="err">' + esc(chrome.runtime.lastError.message) +
          ' - reload the DS-160 page and try again.</div>';
        return;
      }
      chrome.storage.local.set({ lastReport: rep });
      showReport(rep);
      /* Only when a postback actually fired. A pass that reloads nothing put
         no traffic on CEAC at all, so pausing after it would be pure
         friction. `postbackPending` is set exactly when a postback control
         was applied. */
      if (rep && rep.postbackPending) startCooldown();
    });
  }));

  $('load').addEventListener('click', () => {
    try {
      const rec = JSON.parse($('json').value);
      chrome.storage.local.set({ record: rec }, () => {
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
