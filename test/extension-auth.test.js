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
ok('the gate starts closed, before the check is even sent',
   /authAllows = false;[\s\S]{0,200}sendMessage\(\{ type: 'ds160:checkAuth' \}/.test(popup));
ok('and only opens from the decision itself', /authAllows = !!d\.allow/.test(popup));
ok('renderAuth runs at popup open', /renderAuth\(\);/.test(popup));
ok('the click handler refuses a disabled button as well',
   /if \(\$\('fill'\)\.disabled\) return;/.test(popup));
/* A background worker that never answers must DENY. Failing open here would
   be the worst of both worlds: a gate that disappears exactly when something
   is already wrong. */
const noAnswer = popup.slice(popup.indexOf('chrome.runtime.lastError || !d'));
ok('a background worker that does not answer denies, it does not allow',
   /authAllows = false;/.test(noAnswer.slice(0, 600)));

// -- pacing: CEAC has blocked this session twice ----------------------
/* Both blocks were the RATE of page reloads, not a bug. Every postback the
   filler applies reloads the page, and a human pressing Fill again the moment
   it comes back is the burst a WAF exists to stop. The filler was already as
   quiet as it can be; what was missing was anything stopping the operator
   hammering the button. */
const COOLDOWN = eval((popup.match(/const FILL_COOLDOWN_MS = ([^;]+);/) || [, '0'])[1]);
eq('there is a cool-down after a reload', COOLDOWN, 10000);
/* Asserted as a FLOOR as well, because the temptation to shave it is exactly
   how auto-continue got tuned down twice and blocked the session anyway. */
ok('and it is not shortened below 8s', COOLDOWN >= 8000);

/* THE INVARIANT THAT MATTERS. Two independent gates now decide whether Fill
   works - the sign-in and the cool-down - so exactly one line may write
   `disabled`. Two writers would let whichever ran last silently undo the
   other, and the failure would look like "the button is enabled when it
   should not be", which is the whole thing this prevents. */
eq('fill.disabled is written in exactly one place',
   (popup.match(/\.disabled = /g) || []).length, 1);
ok('and it reads both gates',
   /fill\.disabled = !authAllows \|\| cooling/.test(popup));

ok('the cool-down starts only when a postback actually fired',
   /if \(rep && rep\.postbackPending\) startCooldown\(\)/.test(popup));
ok('it is persisted, so closing the popup does not clear it',
   /chrome\.storage\.local\.set\(\{ fillCooldownUntil/.test(popup));
ok('and restored on open', /cooldownUntil = Number\(st\.fillCooldownUntil\)/.test(popup));
ok('boot asks storage for it',
   /storage\.local\.get\(\[[^\]]*'fillCooldownUntil'[^\]]*\]/.test(popup));
ok('the countdown says WHY, not just to wait',
   /blocked before/.test(popup));
ok('the popup has somewhere to show it', /id="cooldown"/.test(read(path.join('extension', 'popup.html'))));

/* AUTO-CONTINUE IS GONE, AND MUST STAY GONE. It was the only thing that could
   reload a CEAC page with nobody pressing anything - one Fill could produce four
   reloads 2.5s apart - and it bypassed the cool-down entirely, because the
   pacing lives in popup.js while the auto-resume ran in content.js on page
   load. Two paths firing postbacks, one of them paced. */
const content = read(path.join('extension', 'content.js'));
eq('nothing schedules a fill on its own', /setTimeout/.test(content), false);
eq('no auto-continue setting is read', /autoContinue/.test(content), false);
eq('no step counter survives a reload', /autoStep/.test(content), false);
ok('and the popup no longer offers the switch',
   !/id="auto"/.test(read(path.join('extension', 'popup.html'))));
ok('nor writes the setting', !/autoContinue/.test(popup));
/* The only CEAC traffic the extension can cause is the page's own form submit.
   If a fetch ever appears in the content script, that is a new class of
   request against a government system from inside a WAF-protected session. */
eq('the content script makes no network request of its own',
   /fetch\(|XMLHttpRequest|sendBeacon/.test(content), false);

/* The applicant summary is three stacked lines - name, then passport/DOB/cruise
   line, then "sent <time>". showWho() writes the last two as sibling <span>s,
   and inline they ran together on a live popup as "Cunard Linesent 1:31:12 PM".
   The <b> above them was already block; these were meant to stack the same
   way. */
ok('the applicant summary spans stack instead of running together',
   /\.who span \{ display: block;/.test(read(path.join('extension', 'popup.html'))));

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
