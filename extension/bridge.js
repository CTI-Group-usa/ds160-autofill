/* Bridge between the worksheet page and the extension.
   Two jobs: hand a normalised record to storage for the DS-160 filler,
   and fetch a supporting letter that the page itself cannot reach.
   Only same-window messages carrying our own marker are accepted. */
(function () {
  'use strict';
  document.documentElement.setAttribute('data-ds160-extension', '1');

  function reply(type, payload) {
    window.postMessage(Object.assign({ channel: 'cti-ds160', type }, payload), '*');
  }

  /* An extension reload orphans this script; chrome.* then throws. */
  const alive = () => {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  };

  /* Hand the worksheet's session token to the extension.
     A content script shares the page's localStorage - it is per origin,
     not per world - so the token the sign-in gate stored is readable here
     and nowhere else. Pushed on every page load, not only when a record is
     sent, so simply opening the worksheet keeps the extension's copy fresh.
     An empty value is still worth sending: it clears a stale token after
     the operator signs out. */
  function pushAuthToken() {
    if (!alive()) return;
    let token = '';
    try { token = localStorage.getItem('ds160_auth_token') || ''; } catch (e) { /* private mode */ }
    try { chrome.runtime.sendMessage({ type: 'ds160:authToken', token }, () => {
      void chrome.runtime.lastError;    // nothing to do if the worker is asleep
    }); } catch (e) { /* orphaned content script */ }
  }
  pushAuthToken();

  window.addEventListener('message', ev => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.channel !== 'cti-ds160') return;
    if (!alive()) {
      reply(d.type === 'record' ? 'record-ack-failed' : 'fetch-letter-result',
            { id: d.id, ok: false,
              error: 'The extension was reloaded. Refresh this page and try again.' });
      return;
    }

    /* Every path answers. A silent failure here shows up on the page as
       "the extension did not answer", which says nothing about why. */
    if (d.type === 'record') {
      pushAuthToken();          // the operator may have signed in since load
      try {
        chrome.storage.local.set({ record: d.record, lastReport: null }, () => {
          const err = chrome.runtime.lastError;
          if (err) reply('record-ack-failed', { error: 'Storage refused the record: ' + err.message });
          else reply('record-ack', { name: d.record && d.record.fullName });
        });
      } catch (e) {
        reply('record-ack-failed', { error: String((e && e.message) || e) });
      }
      return;
    }

    if (d.type === 'fetch-letter') {
      try {
        chrome.runtime.sendMessage({ type: 'ds160:fetchLetter', url: d.url }, res => {
          const err = chrome.runtime.lastError;
          if (err) {
            reply('fetch-letter-result', { id: d.id, ok: false,
              error: 'The background worker did not answer: ' + err.message +
                     '. Check chrome://extensions for an error on this extension.' });
            return;
          }
          reply('fetch-letter-result', Object.assign({ id: d.id }, res));
        });
      } catch (e) {
        reply('fetch-letter-result', { id: d.id, ok: false, error: String((e && e.message) || e) });
      }
    }
  });
})();
