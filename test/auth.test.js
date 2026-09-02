/* The sign-in gate, checked where it can be checked without a browser.

   The point of this file is the URL agreement. Three strings have to be the
   same host, and Microsoft compares the redirect URI character for character:

     worker.js  WORKER_ORIGIN     the Worker's own deployed URL
     worker.js  SSO_REDIRECT_URI  that plus /api/auth/callback, registered on
                                  the Entra app
     auth.js    WORKER            what the page actually calls

   A mismatch fails in the least helpful way available: the button appears to
   do nothing, or Microsoft shows a redirect-URI error with no clue which end
   is wrong. Nothing in the app notices. So it is asserted here. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
/* Line endings normalised: the Windows working copy is CRLF while git holds
   LF, and a pattern with a literal newline would otherwise pass on one and
   fail on the other. */
const read = f => fs.readFileSync(path.join(root, f), 'utf8').split('\r\n').join('\n');
const worker = read('worker.js');
const auth = read('auth.js');
const index = read('index.html');
const login = read('login.html');

let pass = 0, fail = 0;
function eq(what, got, want) {
  if (got === want) { pass++; return; }
  fail++;
  console.log('FAIL ' + what + '\n  got  ' + JSON.stringify(got) + '\n  want ' + JSON.stringify(want));
}
function ok(what, cond) { eq(what, !!cond, true); }

const constOf = (src, name) => {
  const m = src.match(new RegExp('const\\s+' + name + "\\s*=\\s*'([^']*)'"));
  return m ? m[1] : null;
};

// -- the three URLs agree --------------------------------------------
const workerOrigin = constOf(worker, 'WORKER_ORIGIN');
const pageWorker = constOf(auth, 'WORKER');
ok('worker.js declares WORKER_ORIGIN', !!workerOrigin);
ok('auth.js declares WORKER', !!pageWorker);
eq('the page calls the Worker at its own deployed origin', pageWorker, workerOrigin);
ok('the Worker origin is https', /^https:\/\//.test(workerOrigin || ''));
ok('no trailing slash, which would double up into //api/auth/login',
   !/\/$/.test(workerOrigin || ''));

/* SSO_REDIRECT_URI is built from WORKER_ORIGIN rather than written out again,
   so the two cannot drift. Assert that it still is. */
ok('the redirect URI is derived from WORKER_ORIGIN, not repeated',
   /const SSO_REDIRECT_URI = WORKER_ORIGIN \+ '\/api\/auth\/callback'/.test(worker));

// -- the app URLs the Worker redirects back to ----------------------
const appHome = constOf(worker, 'SSO_APP_HOME');
const loginPage = constOf(worker, 'SSO_LOGIN_PAGE');
ok('the app home points at index.html', /\/index\.html$/.test(appHome || ''));
ok('the login page points at login.html', /\/login\.html$/.test(loginPage || ''));
eq('both live in the same directory',
   (appHome || '').replace(/index\.html$/, ''), (loginPage || '').replace(/login\.html$/, ''));

// -- the domain rule -------------------------------------------------
eq('only cti-usa.com may sign in', constOf(worker, 'ALLOWED_EMAIL_DOMAIN'), 'cti-usa.com');
/* Both checks are load-bearing. The tenant check rejects a personal or
   other-organisation account; the domain check rejects a guest invited INTO
   the CTI tenant, whose address ends in something else. Either alone leaves a
   way in, so neither may quietly disappear. */
ok('the tenant is checked', /claims\.tid !== env\.SSO_TENANT_ID/.test(worker));
ok('the email domain is checked',
   /endsWith\('@' \+ ALLOWED_EMAIL_DOMAIN\)/.test(worker));
ok('the email is lower-cased before the domain test, so Name@CTI-USA.COM passes',
   /\.toLowerCase\(\)/.test(worker.slice(0, worker.indexOf('endsWith'))));

// -- the OAuth state is verified, not just echoed --------------------
ok('login stores a one-time state in KV', /TOKEN_CACHE\.put\('ssostate:'/.test(worker));
ok('callback requires that state to exist', /TOKEN_CACHE\.get\('ssostate:'/.test(worker));
ok('and consumes it, so a callback cannot be replayed',
   /TOKEN_CACHE\.delete\('ssostate:'/.test(worker));

// -- the session token never lands in a server log -------------------
ok('the token is handed back in the URL fragment, not a query string',
   /Location: SSO_APP_HOME \+ '#authToken='/.test(worker));
ok('and the page strips the fragment immediately', /history\.replaceState/.test(auth));

// -- sessions expire -------------------------------------------------
ok('the KV entry carries a TTL', /expirationTtl: SESSION_TTL_SEC/.test(worker));
ok('and the expiry is re-checked on every /me, failing closed',
   /!session\.expiresAt \|\| session\.expiresAt < Date\.now\(\)/.test(worker));

// -- a network failure must not log everyone out ---------------------
/* A 401 is proof the token is dead, so it is dropped. A thrown fetch is also
   what a momentary offline looks like, so the token is kept - throwing it away
   would make a flaky connection sign people out. */
ok('a 401 clears the stored token', /resp\.status === 401[\s\S]{0,220}removeItem/.test(auth));
const catchBlock = auth.slice(auth.indexOf('} catch (e) {'));
ok('a network error does NOT clear it', !/removeItem/.test(catchBlock.slice(0, 400)));

// -- the page is gated before anything is painted --------------------
ok('the body starts hidden', /<style>body\{visibility:hidden\}<\/style>/.test(index));
ok('and is only revealed after requireAuth resolves',
   index.indexOf('Auth.requireAuth()') < index.indexOf("style.visibility = 'visible'"));
ok('auth.js loads before app.js', index.indexOf('auth.js') < index.indexOf('app.js'));
/* Signing out has to leave nothing behind: sessionStorage holds the whole
   intake export - passport numbers, dates of birth, parents' names. */
ok('sign-out wipes the loaded rows before redirecting',
   /sessionStorage\.removeItem\('ds160\.rows'\)[\s\S]{0,120}Auth\.logout\(\)/.test(index));

// -- the login page stands on its own --------------------------------
ok('login.html loads auth.js', /src="auth\.js/.test(login));
/* Test the LINK, not the bare string: "style.css" also appears in a comment
   in login.html explaining that the tokens are duplicated on purpose. */
ok('login.html carries its own styles, so a missing stylesheet cannot hide ' +
   'the sign-in button',
   /<style>/.test(login) && !/<link[^>]+href="style\.css/.test(login));
ok('login.html shows the reason a session was rejected',
   /URLSearchParams\(location\.search\)\.get\('error'\)/.test(login));

// -- localhost is allowed on purpose, and only on the dev port -------
ok('the github.io origin is allowed',
   /'https:\/\/cti-group-usa\.github\.io'/.test(worker));
ok('localhost:7773 is allowed for local runs', /localhost:7773/.test(worker));
ok('no wildcard origin', !/Allow-Origin[^\n]*\*/.test(worker));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
