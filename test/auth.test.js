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
/* THE SCRIPT TAGS, not the bare names. This was `indexOf('auth.js') <
   indexOf('app.js')` and broke the moment a COMMENT in the header mentioned
   app.js - prose before the tags won the indexOf. Same trap the login.html
   stylesheet assertion below already carries a note about. */
ok('auth.js loads before app.js',
   index.indexOf('src="auth.js') < index.indexOf('src="app.js'));
/* Signing out has to leave nothing behind: sessionStorage holds the whole
   intake export - passport numbers, dates of birth, parents' names. */
ok('sign-out wipes the loaded rows before redirecting',
   /sessionStorage\.removeItem\('ds160\.rows'\)[\s\S]{0,400}Auth\.logout\(\)/.test(index));
/* BOTH CLASSES. Each tab keeps its own rows under its own key, so clearing
   one would leave the other tab's applicants - passport numbers, dates of
   birth, parents' names - sitting there for the next person at this browser. */
ok('and it wipes every visa class, not just the active one',
   /DS160Const\.classes\(\)[\s\S]{0,80}removeItem\('ds160\.rows\.'/.test(index));

/* THE SIGNED-IN CHIP MUST NOT REUSE `.who`. That class was already the
   applicant detail header - display:flex, a border-bottom and 12px of
   padding-bottom - and the first version of this chip borrowed the name, so it
   rendered with a stray line under it and sat 6px above the buttons beside it.
   The later rule in the file won on every shared property. */
const css = read('style.css');
ok('the signed-in chip has its own class', /\.signed-in\{/.test(css));
ok('and the header does not reuse .who',
   !/<span[^>]+id="signedIn"[^>]+class="who"/.test(index));
ok('the detail header keeps .who to itself',
   /\.who\{display:flex/.test(css));
ok('the chip is wired to the id that exists in the markup',
   /id="signedIn"/.test(index) && /getElementById\('signedIn'\)/.test(index));

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


// -- the hard refresh button -----------------------------------------
/* A normal reload revalidates the HTML but is free to hand back the cached
   app.js, and the script tags carry their own ?v= tokens - so a deploy that
   changed a file without bumping its token keeps serving the old one, and the
   fix looks like it did not work. That has cost this project several rounds of
   "reload the worksheet". */
ok('the header has a hard refresh button', /id="btnHardRefresh"/.test(index));
ok('and it says what it does, and what it keeps',
   /Hard refresh[\s\S]{0,200}bypassing the browser cache[\s\S]{0,80}applicants are kept/.test(index));
/* An icon alone says nothing to a screen reader, and `title` is not reliably
   announced. */
ok('with a text label for a screen reader', /class="sr">Hard refresh</.test(index));

/* `fetch(url, {cache:'reload'})` is what does the work: it bypasses the HTTP
   cache and REPLACES the stored entry, so the reload straight after picks up
   the fresh copy. `location.reload(true)` has forced nothing in any current
   browser for years - it is ignored - so its presence would mean the button
   does not work. */
ok("it re-fetches with cache:'reload'", /fetch\(u, \{ cache: 'reload' \}\)/.test(index));
/* Matched as a CALL - with the semicolon - because the comment beside the
   handler names `location.reload(true)` in order to explain why it is not
   used, and a bare substring test cannot tell prose from code. */
ok('and does NOT rely on reload(true), which browsers ignore',
   !/location\.reload\(true\)\s*;/.test(index));
ok('the reload comes after the re-fetches',
   index.indexOf("cache: 'reload'") < index.lastIndexOf('location.reload()'));

/* THE ASSET LIST COMES FROM THE DOM, never a list kept by hand: it is exactly
   the tags the page loaded, so it cannot drift from them. The popup already
   learned this lesson the hard way with its copy of the constant keys. */
ok('the assets come from the page itself',
   /querySelectorAll\('script\[src\], link\[rel="stylesheet"\]\[href\]'\)/.test(index));
ok('and no hand-written asset list sits beside it',
   !/\['app\.js'|'normalize\.js',\s*'constants\.js'/.test(index));
/* Same origin only. A CDN or a Google font is not ours to invalidate, and
   fetching it here would fail on CORS and look like a broken refresh. */
ok('only same-origin assets are touched', /u\.origin === location\.origin/.test(index));

/* Cache Storage is empty today - there is no service worker - but clearing it
   costs one call and means adding one later cannot quietly defeat the button. */
ok('cache storage is cleared too', /caches\.delete\(k\)/.test(index));
/* One asset that 404s must not stop the reload, which is the part the operator
   actually pressed the button for. */
ok('a failed asset fetch is swallowed', /\.catch\(\(\) => null\)/.test(index));
/* Disabled while it works, so a second click cannot start a second run. */
ok('the button disables itself', /hard\.disabled = true/.test(index));
ok('and refuses a click while disabled', /if \(hard\.disabled\) return/.test(index));

/* `css` is already read further up, for the signed-in chip's own class. */
ok('the spin animation exists', /button\.icon\.spin svg\{animation:spin/.test(css));
/* A spinner is decoration; the disabled button is what actually says "busy". */
ok('and is dropped for reduced motion',
   /prefers-reduced-motion:reduce\)\{button\.icon\.spin svg\{animation:none/.test(css));


/* -- ONE CACHE TOKEN, AND NO FILE LEFT BEHIND -----------------------
   The tokens used to be per-file and dated by hand - `20260831t`,
   `20260902tabs`, `20260904j1docs`. On 2026-09-05 six shared files were
   changed and not one token was bumped, so the browser went on serving the
   previous day's `pdftext.js`, `app.js`, `trip.js` and `normalize.js`: four
   rounds of "it is still empty" spent on code that was never running.

   A token that is only sometimes bumped is WORSE than none, because it makes
   the cache look managed. One string for every asset, one edit to release, and
   this fails the moment a file is left behind. */
const tokens = (index.match(/\?v=[0-9A-Za-z]+/g) || [])
  .concat(login.match(/\?v=[0-9A-Za-z]+/g) || []);
ok('every asset carries a cache token', tokens.length >= 15);
eq('and every one of them is the same string',
   tokens.filter((t, i, a) => a.indexOf(t) === i).length, 1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
