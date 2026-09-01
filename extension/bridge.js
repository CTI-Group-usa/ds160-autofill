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

    if (d.type === 'record') {
      chrome.storage.local.set({ record: d.record, autoStep: 0, lastReport: null }, () => {
        reply('record-ack', { name: d.record && d.record.fullName });
      });
      return;
    }

    if (d.type === 'fetch-letter') {
      chrome.runtime.sendMessage({ type: 'ds160:fetchLetter', url: d.url }, res => {
        if (chrome.runtime.lastError) {
          reply('fetch-letter-result', { id: d.id, ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        reply('fetch-letter-result', Object.assign({ id: d.id }, res));
      });
    }
  });
})();
