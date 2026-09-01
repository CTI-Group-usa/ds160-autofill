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
      try {
        chrome.storage.local.set({ record: d.record, autoStep: 0, lastReport: null }, () => {
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
