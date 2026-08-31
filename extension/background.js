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

const isPdf = buf => {
  const h = new Uint8Array(buf.slice(0, 5));
  return h[0] === 0x25 && h[1] === 0x50 && h[2] === 0x44 && h[3] === 0x46;   // %PDF
};

/* A WorkDrive /file/<id> link opens a viewer, not the document, so the
   documented download endpoints are tried after the link itself. */
function candidates(url) {
  const out = [url];
  const m = url.match(/workdrive\.zoho\.[a-z.]+\/file\/([A-Za-z0-9]+)/i);
  if (m) {
    out.push('https://download-accl.zoho.com/v1/workdrive/download/' + m[1]);
    out.push(url.replace(/\/+$/, '') + '/download');
  }
  return out;
}

async function fetchPdf(url) {
  const tried = [];
  for (const candidate of candidates(url)) {
    try {
      const r = await fetch(candidate, { credentials: 'include', redirect: 'follow' });
      if (!r.ok) { tried.push(r.status + ' from ' + candidate); continue; }
      const buf = await r.arrayBuffer();
      if (isPdf(buf)) return { ok: true, b64: toBase64(buf), bytes: buf.byteLength, from: candidate };
      tried.push('not a PDF from ' + candidate);
    } catch (e) {
      tried.push(String(e && e.message || e) + ' for ' + candidate);
    }
  }
  return {
    ok: false,
    error: 'Could not get the PDF itself. Tried: ' + tried.join('; ') +
           '. Open the letter, download it, and paste its text instead.',
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg && msg.type === 'ds160:fetchLetter') {
    if (!ALLOWED.test(msg.url || '')) {
      send({ ok: false, error: 'That link is not on a Zoho host, so the extension will not fetch it.' });
      return true;
    }
    fetchPdf(msg.url).then(send).catch(e => send({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  return false;
});
