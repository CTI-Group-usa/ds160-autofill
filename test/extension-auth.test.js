/* The extension's sign-in gate. Run: node test/extension-auth.test.js
 *
 * background.js is a service worker, so `authDecision` is lifted out of the
 * source the same way background.test.js lifts ALLOWED and candidates(). It is
 * written as a pure function precisely so every branch can be exercised here -
 * the branch that matters most (a dead token must NOT get the grace period)
 * is unreachable from a browser without waiting for a session to expire.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/* NORMALISE LINE ENDINGS. The working copy on Windows is CRLF while git holds
   LF, so a pattern containing a literal newline matches on one machine and not
   the other - which is a test measuring the checkout, not the code. */
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').split('\r\n').join('\n');
const bgSrc = read(path.join('extension', 'background.js'));
/* Lift the constant and the function into ONE scope: authDecision closes over
   AUTH_GRACE_MS, so eval-ing them separately leaves the function referring to
   a name that does not exist. */
const graceDecl = bgSrc.match(/const AUTH_GRACE_MS = [^\n]+;/)[0];
const fnSrc = bgSrc.match(/function authDecision\(last, probe, now\)[\s\S]*?\n\}/)[0];
const authDecision = eval('(function () {' + graceDecl + '\n' + fnSrc + '\nreturn authDecision; })()');
const GRACE = eval('(function () {' + graceDecl + '\nreturn AUTH_GRACE_MS; })()');

const bridge = read(path.join('extension', 'bridge.js'));
const popup = read(path.join('extension', 'popup.js'));
const manifest = JSON.parse(read(path.join('extension', 'manifest.json')));
const auth = read('auth.js');
const worker = read('worker.js');

let pass = 0, fail = 0;
function eq(what, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + what + '\n  got  ' + g + '\n  want ' + w);
}
const ok = (what, cond) => eq(what, !!cond, true);

const NOW = 1788000000000;
const hoursAgo = h => NOW - h * 3600000;
const verified = { email: 'putu.astra@cti-usa.com', name: 'Putu Astra', checkedAt: hoursAgo(1) };

// -- the four probe outcomes -----------------------------------------
const fresh = authDecision(null, { ok: true, email: 'a@cti-usa.com', name: 'A' }, NOW);
eq('a confirmed session allows Fill', fresh.allow, true);
eq('and is recorded, so the grace period has something to stand on',
   fresh.state && fresh.state.checkedAt, NOW);
eq('the account is named back for the popup', fresh.email, 'a@cti-usa.com');

const none = authDecision(null, { noToken: true }, NOW);
eq('no token at all denies Fill', none.allow, false);
eq('and says what to do about it', /Sign in on the DS-160 Worksheet/.test(none.message), true);

/* THE BRANCH THAT MATTERS. A 401 is the Worker actively refusing the token -
   proof, not a guess - so the grace period must not rescue it. This is the
   only thing that shuts out a revoked session or a disabled Microsoft
   account, and it is why `expired` is handled before the unreachable case. */
const dead = authDecision(verified, { status: 401 }, NOW);
eq('a 401 denies Fill even with a session verified an hour ago', dead.allow, false);
eq('and clears the stored state', dead.clear, true);
eq('reason is expiry, not a network problem', dead.reason, 'expired');

// -- the grace period, chosen by the user over blocking ---------------
const offline1h = authDecision(verified, { unreachable: true }, NOW);
eq('unreachable, verified 1h ago -> allowed', offline1h.allow, true);
eq('and flagged as grace, not as verified', offline1h.reason, 'grace');
ok('the message says how stale it is', /verified 1h ago/.test(offline1h.message));

const edge = authDecision({ ...verified, checkedAt: NOW - GRACE }, { unreachable: true }, NOW);
eq('exactly at the limit is still allowed', edge.allow, true);

const stale = authDecision({ ...verified, checkedAt: NOW - GRACE - 1000 }, { unreachable: true }, NOW);
eq('one second past the limit is refused', stale.allow, false);
eq('reason is unverified', stale.reason, 'unverified');
ok('and it names the window', /8 hours/.test(stale.message));

eq('unreachable with no prior check at all -> refused',
   authDecision(null, { unreachable: true }, NOW).allow, false);
/* A 500 is the service being broken, not the token being bad, so it takes the
   same path as a dropped connection. */
eq('a 500 from the service is treated as unreachable, not as expiry',
   authDecision(verified, { unreachable: true, status: 500 }, NOW).reason, 'grace');
/* Corrupt or partial stored state must not be read as "verified long ago" and
   must not throw either. */
eq('state with no checkedAt is refused', authDecision({ email: 'x' }, { unreachable: true }, NOW).allow, false);

// -- eight hours is about a working day ------------------------------
eq('the grace period is 8 hours', GRACE, 8 * 3600 * 1000);

// -- the token comes from the worksheet, not from the extension -------
/* The extension cannot mint a session. bridge.js lifts the token out of the
   worksheet page's localStorage, which a content script shares with the page
   because localStorage is per origin. So the only way to unlock the extension
   is to have signed in on the worksheet in that same browser. */
ok('bridge.js reads the worksheet token', /localStorage\.getItem\('ds160_auth_token'\)/.test(bridge));
ok('and the key is the one auth.js writes', /TOKEN_KEY = 'ds160_auth_token'/.test(auth));
ok('bridge.js pushes it on page load, not only when a record is sent',
   /pushAuthToken\(\);\s*\n\n  window\.addEventListener\('message'/.test(bridge));
ok('and again when a record is sent, in case the operator signed in since',
   /if \(d\.type === 'record'\) \{\s*\n\s*pushAuthToken\(\);/.test(bridge));
ok('an empty token is still sent, so signing out clears the stale one',
   /token = localStorage\.getItem[\s\S]{0,120}sendMessage\(\{ type: 'ds160:authToken', token \}/.test(bridge));

// -- the popup starts locked ------------------------------------------
/* Starting enabled and switching off would leave a window in which a click
   gets through, which is the one thing this is meant to prevent. */
ok('Fill is disabled before the check runs',
   /fill\.disabled = true;[\s\S]{0,200}sendMessage\(\{ type: 'ds160:checkAuth' \}/.test(popup));
ok('and only re-enabled from the decision', /fill\.disabled = !d\.allow/.test(popup));
ok('renderAuth runs at popup open', /renderAuth\(\);/.test(popup));
ok('the click handler refuses a disabled button as well',
   /if \(\$\('fill'\)\.disabled\) return;/.test(popup));
ok('a background worker that does not answer denies, it does not allow',
   /chrome\.runtime\.lastError \|\| !d[\s\S]{0,400}fill\.title = 'Sign-in could not be checked'/.test(popup));

// -- host permission, so the check is not blocked by CORS -------------
/* Done from background.js under host_permissions rather than from the popup:
   a popup fetch sends Origin: chrome-extension://<id>, and an unpacked
   extension's id is not stable, so it could not be allow-listed in the
   Worker. This way the Worker needs no change at all. */
const workerHost = (worker.match(/const WORKER_ORIGIN = '([^']+)'/) || [])[1];
ok('the Worker host is in host_permissions',
   manifest.host_permissions.some(h => h === workerHost + '/*'));
ok('background.js calls /api/auth/me on that host',
   bgSrc.indexOf("const AUTH_URL = '" + workerHost + "/api/auth/me'") >= 0);
ok('ceac.state.gov is still there', manifest.host_permissions.includes('https://ceac.state.gov/*'));
ok('no wildcard host permission', !manifest.host_permissions.some(h => /^https:\/\/\*\/|<all_urls>/.test(h)));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
