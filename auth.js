/* DS-160 worksheet — Microsoft 365 sign-in gate (browser half).

   The Worker does the OAuth (see worker.js). This file only redirects to it,
   picks the session token out of the URL fragment on the way back, and asks
   the Worker who that token belongs to. No MSAL, no SDK, and Microsoft's own
   tokens never touch this page.

   WHAT THIS GATE IS. The worksheet is a static site, so this file and every
   other one are public. Microsoft really does verify who signs in, and this
   really does stop anyone without a CTI account from using the tool — but it
   hides the UI, it does not protect the files. Do not treat it as though it
   did. */
const Auth = (() => {
  /* Must match the deployed Worker exactly. If sign-in silently does nothing,
     open <WORKER>/api/auth/health first — a wrong host here is the usual
     cause, and it is invisible otherwise. */
  const WORKER = 'https://ds160-auth.putu-astra.workers.dev';

  /* Its own key. The Indonesia dashboard uses cti_indo_auth_token; sharing one
     would let a session for one app open the other. */
  const TOKEN_KEY = 'ds160_auth_token';

  let _user = null;          // { email, name } once a session has validated
  let _lastError = '';       // surfaced by login.html when a check fails

  function loginWithMicrosoft() {
    window.location.href = WORKER + '/api/auth/login';
  }

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }

  function getUser() { return _user; }
  function lastError() { return _lastError; }

  function authHeaders() {
    const t = getToken();
    return t ? { 'X-Auth-Token': t } : {};
  }

  /* Captures a token handed back in the URL fragment right after the Microsoft
     redirect, or falls back to a stored one, then validates it against the
     Worker. Returns the user on success and null otherwise. */
  async function init() {
    const m = location.hash.match(/authToken=([^&]+)/);
    if (m) {
      try { localStorage.setItem(TOKEN_KEY, decodeURIComponent(m[1])); } catch { /* private mode */ }
      /* Strip the fragment straight away so the token is not left sitting in
         the address bar, in history, or in a screenshot. */
      history.replaceState(null, '', location.pathname + location.search);
    }
    const token = getToken();
    if (!token) return null;
    try {
      const resp = await fetch(WORKER + '/api/auth/me', {
        headers: authHeaders(), cache: 'no-store',
      });
      if (resp.status === 401) {
        /* Definitely not valid any more - drop it so the next load goes
           straight to the sign-in page instead of retrying forever. */
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
        _lastError = 'Your session has expired. Please sign in again.';
        return null;
      }
      if (!resp.ok) { _lastError = 'Sign-in service returned ' + resp.status + '.'; return null; }
      _user = await resp.json();
      return _user;
    } catch (e) {
      /* Network or CORS failure. Do NOT wipe the token - this is also what a
         momentary offline looks like, and throwing the session away would
         make a flaky connection log everyone out. */
      _lastError = 'Could not reach the sign-in service. Check the connection, ' +
                   'or that this page is served from an allowed origin.';
      return null;
    }
  }

  /* Guard for index.html: call before showing anything. */
  async function requireAuth() {
    const user = await init();
    if (!user) {
      const q = _lastError ? '?error=' + encodeURIComponent(_lastError) : '';
      window.location.replace('login.html' + q);
      return null;
    }
    return user;
  }

  async function logout() {
    const token = getToken();
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    if (token) {
      try {
        await fetch(WORKER + '/api/auth/logout', {
          method: 'POST', headers: { 'X-Auth-Token': token },
        });
      } catch { /* already dropped locally; the KV entry expires on its own */ }
    }
    window.location.replace('login.html');
  }

  return { loginWithMicrosoft, init, requireAuth, getUser, getToken, authHeaders, logout, lastError, WORKER };
})();
