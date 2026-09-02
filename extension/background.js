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


/* ── The sign-in gate for the extension ─────────────────────────────
 *
 * The worksheet is gated; the extension was not. Anyone holding this
 * folder and one record in chrome.storage could fill a DS-160 without
 * ever signing in. This asks the same Worker the worksheet asks.
 *
 * WHAT IT IS, HONESTLY. This code sits on the operator's own disk, so
 * whoever has it can edit popup.js and skip the check. What it does buy
 * is real but narrow: the extension AS DISTRIBUTED refuses to work
 * without a live CTI session, so a disabled Microsoft account loses
 * access within the grace period below, and at the outside within the
 * session's own 7 days. It is a deterrent, not a boundary.
 *
 * The token is not ours - bridge.js lifts it out of the worksheet
 * page's localStorage. So the extension can only be unlocked by
 * someone who has signed in on the worksheet in that browser.
 */
const AUTH_URL = 'https://ds160-auth.putu-astra.workers.dev/api/auth/me';

/* THE GRACE PERIOD IS DELIBERATE, and the user chose it over blocking.
   From the browser there is no way to tell a dead token from a dropped
   connection - both are just a failed fetch. Blocking on every failure
   would mean a flaky office line stops a DS-160 halfway through, which
   is a worse outcome than a few hours of stale trust. Eight hours is
   about one working day, so a disabled account loses access the same
   day without anyone being stranded mid-application. */
const AUTH_GRACE_MS = 8 * 3600 * 1000;

/* Pure, so test/extension-auth.test.js can exercise every branch.
   `probe` is what came back from trying to verify:
     { ok: true, email, name }  the Worker confirmed a session
     { status: 401 }            the Worker rejected the token
     { unreachable: true }      fetch threw, or the service errored
     { noToken: true }          nothing to verify in the first place
   `last` is the stored state from the previous successful check. */
function authDecision(last, probe, now) {
  if (probe && probe.noToken) {
    return { allow: false, reason: 'no-session', clear: true,
             message: 'Sign in on the DS-160 Worksheet, then send this applicant to the extension again.' };
  }
  if (probe && probe.ok) {
    return { allow: true, reason: 'verified', email: probe.email, name: probe.name,
             state: { email: probe.email, name: probe.name, checkedAt: now } };
  }
  if (probe && probe.status === 401) {
    /* The Worker actively refused it. That is proof, not a guess, so the
       grace period must NOT apply - this is how a revoked session and a
       disabled account are shut out. */
    return { allow: false, reason: 'expired', clear: true,
             message: 'That sign-in has expired. Sign in on the DS-160 Worksheet again.' };
  }
  // Unreachable, or the service answered with something other than 200/401.
  const at = last && last.checkedAt;
  if (at && now - at <= AUTH_GRACE_MS) {
    return { allow: true, reason: 'grace', email: last.email, name: last.name,
             withinGraceMs: AUTH_GRACE_MS - (now - at),
             message: 'Could not reach the sign-in service. Working on a session verified ' +
                      Math.round((now - at) / 3600000) + 'h ago.' };
  }
  return { allow: false, reason: 'unverified',
           message: 'Could not reach the sign-in service, and the last verified sign-in is ' +
                    (at ? 'older than ' + (AUTH_GRACE_MS / 3600000) + ' hours' : 'unknown') +
                    '. Open the DS-160 Worksheet to sign in again.' };
}

async function probeSession(token) {
  if (!token) return { noToken: true };
  try {
    const r = await fetch(AUTH_URL, { headers: { 'X-Auth-Token': token }, cache: 'no-store' });
    if (r.status === 401) return { status: 401 };
    if (!r.ok) return { unreachable: true, status: r.status };
    const who = await r.json();
    return { ok: true, email: who.email, name: who.name };
  } catch (e) {
    return { unreachable: true, error: String((e && e.message) || e) };
  }
}

function checkAuth(send) {
  chrome.storage.local.get(['authToken', 'authState'], st => {
    probeSession(st.authToken).then(probe => {
      const d = authDecision(st.authState || null, probe, Date.now());
      if (d.state) chrome.storage.local.set({ authState: d.state });
      else if (d.clear) chrome.storage.local.remove('authState');
      send(d);
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg && msg.type === 'ds160:checkAuth') {
    checkAuth(send);
    return true;
  }
  if (msg && msg.type === 'ds160:authToken') {
    /* bridge.js hands over the worksheet's session token. Stored, not
       validated here - checkAuth does that when Fill is about to run. */
    chrome.storage.local.set({ authToken: msg.token || '' }, () => send({ ok: true }));
    return true;
  }
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
