/* Bridge between the worksheet page and the extension.
   The worksheet posts a normalised record; we hand it to storage so the
   DS-160 content script can use it. Only same-window messages carrying
   our own marker are accepted. */
(function () {
  'use strict';
  document.documentElement.setAttribute('data-ds160-extension', '1');

  window.addEventListener('message', ev => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.channel !== 'cti-ds160' || d.type !== 'record') return;
    chrome.storage.local.set({ record: d.record, autoStep: 0, lastReport: null }, () => {
      window.postMessage({ channel: 'cti-ds160', type: 'record-ack', name: d.record && d.record.fullName }, '*');
    });
  });
})();
