// ─────────────────────────────────────────────────────────────
//  DS-160 Worksheet — Microsoft 365 sign-in gate
//
//  This Worker does ONE thing: it signs a person in with their CTI
//  Microsoft account and hands the page a session token. It holds no
//  applicant data and proxies nothing — the worksheet reads the intake
//  file in the browser and never sends it anywhere.
//
//  WHAT THIS GATE IS, HONESTLY. The worksheet is a static site on GitHub
//  Pages, so its HTML and JS are public: someone who wants in can read the
//  source, disable JavaScript, or fetch app.js directly. Microsoft really
//  does verify who signs in, and the redirect really does stop everyone who
//  is not a CTI account from USING the tool — but the files themselves are
//  not protected, and this must not be mistaken for one that does. The user
//  was told this and chose to mirror the Indonesia dashboard's arrangement.
//  If the app ever holds data server-side, serve it from a Worker that
//  checks the session before responding, and the gate becomes real.
//
//  Same shape as cti-indonesia-monitoring-dashboard/worker.js — server-side
//  authorization-code flow, no MSAL in the browser, Microsoft's own tokens
//  never reach the page.
//
//  Secrets (Worker → Settings → Variables, add as *encrypted*):
//    SSO_TENANT_ID      Entra (Azure AD) Directory (tenant) ID
//    SSO_CLIENT_ID      App registration's Application (client) ID
//    SSO_CLIENT_SECRET  A client secret on that app registration
//
//  KV binding:
//    TOKEN_CACHE        a Workers KV namespace, bound as TOKEN_CACHE
// ─────────────────────────────────────────────────────────────

/* ⚠️ THESE FOUR MUST MATCH REALITY EXACTLY OR SIGN-IN FAILS.
   WORKER_ORIGIN has to be the deployed URL of this Worker, and the same
   string has to be registered as a Redirect URI on the Entra app
   registration (with /api/auth/callback on the end). Microsoft compares it
   character for character. `wrangler deploy` prints the URL it published to. */
const WORKER_ORIGIN = 'https://ds160-auth.putu-astra.workers.dev';
const SSO_REDIRECT_URI = WORKER_ORIGIN + '/api/auth/callback';
const SSO_APP_HOME  = 'https://cti-group-usa.github.io/ds160-autofill/index.html';
const SSO_LOGIN_PAGE = 'https://cti-group-usa.github.io/ds160-autofill/login.html';

const ALLOWED_EMAIL_DOMAIN = 'cti-usa.com';
const SESSION_TTL_SEC = 7 * 24 * 3600;   // 7 days, same as the Indonesia dashboard

/* Only these page origins may call this Worker from a browser. localhost is
   here on purpose: the worksheet is developed against `node server.js` on
   :7773, and without it every local run would be locked out. It grants
   nothing an attacker does not already have — anyone can serve a page on
   their own localhost — but the sign-in still has to pass Microsoft. */
const ALLOWED_ORIGINS = [
  'https://cti-group-usa.github.io',
  'http://localhost:7773',
  'http://127.0.0.1:7773',
];

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Auth-Token',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, CORS) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(request, env) {
    const CORS = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const { pathname } = new URL(request.url);

    if (pathname === '/api/auth/login')    return ssoLogin(env, CORS);
    if (pathname === '/api/auth/callback') return ssoCallback(request, env, CORS);
    if (pathname === '/api/auth/me')       return ssoMe(request, env, CORS);
    if (pathname === '/api/auth/logout')   return ssoLogout(request, env, CORS);

    /* A liveness check that says nothing about anybody. Useful because the
       first thing that goes wrong here is WORKER_ORIGIN not matching the
       deployed URL, and this answers "is the Worker even up at this host". */
    if (pathname === '/api/health') {
      return json({ ok: true, expectedOrigin: WORKER_ORIGIN, domain: ALLOWED_EMAIL_DOMAIN }, 200, CORS);
    }

    return json({ error: 'Not found' }, 404, CORS);
  },
};

async function ssoLogin(env, CORS) {
  if (!env.SSO_TENANT_ID || !env.SSO_CLIENT_ID || !env.SSO_CLIENT_SECRET) {
    return ssoError('This Worker has no Microsoft sign-in configured yet: set ' +
                    'SSO_TENANT_ID, SSO_CLIENT_ID and SSO_CLIENT_SECRET on it.', CORS);
  }
  const state = crypto.randomUUID();
  await env.TOKEN_CACHE.put('ssostate:' + state, '1', { expirationTtl: 600 });
  const authUrl = 'https://login.microsoftonline.com/' + env.SSO_TENANT_ID +
    '/oauth2/v2.0/authorize?' + new URLSearchParams({
      client_id: env.SSO_CLIENT_ID,
      response_type: 'code',
      redirect_uri: SSO_REDIRECT_URI,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
    });
  return new Response(null, { status: 302, headers: { ...CORS, Location: authUrl } });
}

async function ssoCallback(request, env, CORS) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthErr = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (oauthErr) return ssoError(oauthErr, CORS);
  if (!code) return ssoError('No authorization code returned.', CORS);

  /* The state has to have been minted by /api/auth/login, so a callback
     someone else constructed cannot open a session. */
  if (!state || !(await env.TOKEN_CACHE.get('ssostate:' + state))) {
    return ssoError('Invalid or expired sign-in request. Please try signing in again.', CORS);
  }
  await env.TOKEN_CACHE.delete('ssostate:' + state);

  const tokenRes = await fetch('https://login.microsoftonline.com/' + env.SSO_TENANT_ID +
                               '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SSO_CLIENT_ID,
      client_secret: env.SSO_CLIENT_SECRET,
      code,
      redirect_uri: SSO_REDIRECT_URI,
      grant_type: 'authorization_code',
      scope: 'openid profile email',
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.id_token) {
    return ssoError('Sign-in failed: ' + (tok.error_description || tok.error || 'unknown error'), CORS);
  }

  let claims;
  try { claims = decodeJwt(tok.id_token); } catch { return ssoError('Invalid identity token.', CORS); }

  /* TWO CHECKS, AND BOTH MATTER. The tenant check rejects a personal or
     other-organisation Microsoft account; the domain check rejects a guest
     invited into the CTI tenant, whose email ends in something else. Either
     one alone leaves a way in. */
  if (claims.tid !== env.SSO_TENANT_ID) {
    return ssoError('This sign-in is not from the CTI organization.', CORS);
  }
  const email = String(claims.preferred_username || claims.email || '').toLowerCase();
  if (!email.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) {
    return ssoError('Only @' + ALLOWED_EMAIL_DOMAIN + ' accounts may open the DS-160 worksheet.', CORS);
  }

  const sessionToken = crypto.randomUUID();
  await env.TOKEN_CACHE.put('authsession:' + sessionToken, JSON.stringify({
    email,
    name: claims.name || email,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SEC * 1000,
  }), { expirationTtl: SESSION_TTL_SEC });

  // Fragment, not query string, so the session token never lands in a server log.
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: SSO_APP_HOME + '#authToken=' + sessionToken },
  });
}

async function ssoMe(request, env, CORS) {
  const session = await resolveSession(request, env);
  if (!session) return json({ error: 'Unauthorized' }, 401, CORS);
  return json({ email: session.email, name: session.name }, 200, CORS);
}

async function ssoLogout(request, env, CORS) {
  const token = request.headers.get('X-Auth-Token');
  if (token) await env.TOKEN_CACHE.delete('authsession:' + token);
  return json({ ok: true }, 200, CORS);
}

async function resolveSession(request, env) {
  const token = request.headers.get('X-Auth-Token');
  if (!token) return null;
  const raw = await env.TOKEN_CACHE.get('authsession:' + token);
  if (!raw) return null;
  const session = JSON.parse(raw);
  /* KV expires the key on its own, but check anyway: the TTL and this field
     are set separately and a mismatch must fail closed. */
  if (!session.expiresAt || session.expiresAt < Date.now()) return null;
  return session;
}

/* Decode an id_token payload. No JWKS signature check: this token came
   straight from Microsoft's token endpoint over TLS, in exchange for our
   own client secret, so it was never in the browser's hands. Same
   simplification the Indonesia dashboard and ZeusHire make. Do NOT copy
   this into a path that accepts a token from a caller. */
function decodeJwt(jwt) {
  const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

function ssoError(msg, CORS) {
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sign-in failed</title></head>' +
    '<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#111827">' +
    '<h2 style="font-family:Georgia,serif">Sign-in failed</h2><p>' + esc(msg) + '</p>' +
    '<p><a href="' + SSO_LOGIN_PAGE + '">Back to sign in</a></p></body></html>';
  return new Response(html, { status: 401, headers: { ...CORS, 'Content-Type': 'text/html' } });
}
