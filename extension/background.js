/* Fetches a supporting letter on the worksheet's behalf.
 *
 * The worksheet page cannot do this itself: the letter lives on a Zoho
 * host, which blocks cross-origin reads, and it is behind the user's
 * login. The extension can, because host_permissions cover those hosts
 * and the request carries the user's own cookies.
 *
 * Only URLs on those hosts are fetched, and only the bytes are handed
 * back - the page does the parsing. */
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(zoho\.com|zohoexternal\.com|zohousercontent\.com|zoho\.eu|zoho\.in)\//i;

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(s);
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg && msg.type === 'ds160:fetchLetter') {
    if (!ALLOWED.test(msg.url || '')) {
      send({ ok: false, error: 'That link is not on a Zoho host, so the extension will not fetch it.' });
      return true;
    }
    fetch(msg.url, { credentials: 'include', redirect: 'follow' })
      .then(async r => {
        if (!r.ok) { send({ ok: false, error: 'Zoho answered ' + r.status + ' ' + r.statusText }); return; }
        const buf = await r.arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 5));
        const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
        if (!isPdf) {
          send({ ok: false, notPdf: true,
                 error: 'That link returned a web page, not the PDF itself. Open it and use the direct download link.' });
          return;
        }
        send({ ok: true, b64: toBase64(buf), bytes: buf.byteLength });
      })
      .catch(e => send({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  return false;
});
