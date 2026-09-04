# DS-160 Autofill — Project Context for Claude

## What This Is
Cuts the copy-paste work out of filing DS-160 applications for CTI seafarers.
Data already exists in the Zoho intake sheet; this project normalises it,
validates it, and fills the CEAC form from it.

## THIS IS A C1/D TOOL ONLY
Every applicant is a crewmember in transit. That is not a detail - a large part
of what this project *decides* is only defensible under that scope, so do not
generalise it to B1/B2 or any other class without revisiting each one:

- `purposeOfTrip` = `ALIEN IN TRANSIT (C)` and `specifyPurpose` =
  `CREWMEMBER IN TRANSIT (C1/D)` are defaults because **every** application uses
  them;
- the whole **Crew Visa** page - the vessel, its IMO number, the shipboard job
  title, the manning agency block - exists on the form *because* the purpose is
  C1/D. On any other class CEAC never shows it;
- `travelCompanions` = NO (crew join individually), `specificTravelPlans` = NO,
  and the intended stay is the contract length;
- the *Person/Entity Paying* and *U.S. Contact* blocks are constants because
  they describe the **cruise line**, not the seafarer;
- `LESS THAN 24 HOURS` for a previous stay, and column Q's `In Days` mapping to
  it, are read as a same-day transit - which is what a crew shore leave is;
- `attendedEducation` = YES rests on "every seafarer CTI files has at least an
  SMA or SMK", and `specializedSkills` = NO on STCW training not being what that
  question asks.

A different visa class would need most of that re-decided with the user, not
adapted. `letter.js` likewise parses a **C1/D supporting letter** and nothing
else.

### J1 is being built in the SAME app, and the boundary is the constants pack
The user is adding a J1 (exchange visitor) version. Their requirement is one
link and one login - the admin should not have to remember a second URL, a
second account, or reload a second extension - so it is two tabs in this
worksheet, not a second app. The DS-160 form is also the same form: Personal
1/2, Address & Phone, Passport, Family, Previous U.S. Travel, Security and Sign
& Submit are identical for every visa class, and **that is where every
wrong-fill bug of 2026-09-02 lived.** Two apps would mean fixing each of those
twice.

**`constants.js` is now an engine holding ONE pack at a time**, and
`constants-c1d.js` / `constants-j1.js` register themselves. `use('c1d')` or
`use('j1')` selects; there is **no default and `values()` throws without one**,
because a silent fallback is exactly the failure this prevents:

Each pack carries a block that describes **the wrong principal entirely** - the
vessel owner, the manning agency, the cruise line's U.S. contact - and those must
not cross. That is what the split is for.

The SSN, tax ID and monthly salary **used to be the headline reason** and are no
longer, because the fix moved somewhere better - see below.

#### SSN / tax ID / monthly salary: derived, and the derivation needs no class
| | C1/D | J1 |
|---|---|---|
| SSN | no column | **column K**, `(if any)` |
| U.S. Taxpayer ID | no column | **column L** |
| Monthly Salary | no column | **column AY** |

The original arrangement ticked *Does Not Apply* for all three in the C1/D pack
and omitted them from the J1 pack, so **leaking one pack onto the other class
would tick a box over a number the sheet actually holds** - a wrong sworn answer,
invisible, because a ticked box is not a gap and appears in no report.

That is now fixed at the source instead of by keeping the packs apart:

- **`normalize.js` asserts only the positive case.** `if (rec.ssn) rec.ssnNA =
  'NO'`, and the same for the other two. The answer follows from whether the cell
  holds an amount, which is the **same question in both classes** - so there is
  no branch on `_class` here and none is wanted.
- **`'NO'`, not `''`.** `apply()` reads `''` as unset and would tick straight over
  it; `'NO'` blocks the pack's default and `setCheckbox` leaves the box clear.
- **An empty cell leaves the key alone**, so each pack's own constant still ticks
  it and the panel switch stays live. A toggle that silently does nothing is
  worse than no toggle.
- **Both packs now carry the tick as their default**, which is the common answer:
  all 69 rows of the J1 export have K and L empty, and 15 of them hold `0.00 IDR`
  in AY. `constants.test.js` asserts the leak case with the **wrong pack
  deliberately active** - the salary and the SSN both survive it.

**`normMoney` - the sheet writes a currency, CEAC wants a number.** Every AY value
reads `4200000.00 IDR`. Separators are the trap: this export writes `4200000.00`
while Indonesian writes `4.200.000,00`, and `.` means opposite things in the two.
A trailing group of **one or two** digits after a separator is a fraction and is
dropped; three digits is a thousands group and is kept.

**`0.00 IDR` is not an amount** - it is the sheet saying there is no salary, the
same answer as an empty cell, so `normMoney` returns `''` and the box gets ticked.
Passing `'0'` through would type a zero income onto a sworn form. Six further rows
hold 1.5, 2, 200, 3300, 25000 and 40000 against a median near 3,000,000, so
`validate()` **names them and fills them anyway** - whether 40000 is a mistyped
40,000,000 is not ours to decide.

**No rule fills the SSN or tax ID boxes yet, on purpose.** CEAC splits the SSN
across three boxes and no live J1 Fill has named their ids; guessing CEAC ids has
never once worked here. The derivation leaves the tick **clear** when a number
exists, which is the right way round - a visible gap on the page, not a box
swearing the participant has no SSN - and `validate()` says so in words. It fires
for nobody today.

**`isLeftBlank(ctl, rec)` took a second argument for this.** With the tick on,
CEAC greys those four boxes out and all four were landing in *Not recognised* on
every C1/D Fill, burying the real gaps. `BLANK_WHEN_TICKED` in `matcher.js` keys
them on the record's own NA answer: quiet while greyed out, **loud the moment it
is not**, which is how their real ids will get read off the page. A static
`LEAVE_BLANK` entry would have been wrong half the time.

#### A filed print-out is one application, not the rule
The J1 sample (I KETUT JULIANA) is **row 22 of the export** - the KTP matches - and
the two disagree:

| | Sheet | What was filed |
|---|---|---|
| Present Employer or School | `Grand Hyatt Bali` (AU) | `OVERSEAS TRAINING CENTER BALI` (**BS**, his college) |
| Primary Occupation | `Daily Worker` (AZ) | `STUDENT` |
| Monthly Salary | `3600000.00 IDR` (AY) | **DOES NOT APPLY** |

Whoever filed it framed him as a **student**, not an employee, and the salary tick
follows from that. Most rows are not students - AZ holds Cook Helper, Butler,
Internship - so this is one case, not a rule, and **the two readings put different
answers in the same boxes.** It needs the user's decision, not an inference.

`apply()` also stamps `rec._class`, so the extension popup can say which pack a
record came from. That matters because a C1/D record on a J1 application fills
the cruise line's U.S. contact into the same fields, and nothing else would
notice.

#### The leak this found in trip.js
`purposeOfTrip`, `specifyPurpose` and `specificTravelPlans` carried the C1/D
values **in `trip.js`**. `app.js` applies trip details FIRST and constants
second, and `DS160Const.apply()` never overwrites a value already set - so a J1
record was stamped `ALIEN IN TRANSIT (C)` by `trip.js` and its own pack could
not correct it. Those three now have **no default in `trip.js`**; each pack owns
its own, and the agent can still override per applicant.

#### What the J1 form does differently
From the filed sample (I KETUT JULIANA) plus the 108-column J1 Visa Log:

- **`specificTravelPlans` = YES**, the opposite of C1/D. CEAC then drops
  "intended length of stay" and demands a full itinerary - arrival date, arrival
  city, departure date - which come from the DS-2019 programme dates.
- **The payer is `OTHER PERSON`**, not `COMPANY/ORGANIZATION`. A different
  branch: the person's name, phone, email and relationship (columns X-AA), plus
  a question that exists only on that branch - *is the payer's address the same
  as your home address?*
- **The U.S. contact is the host employer**, collected per applicant (BZ-CC),
  and its **Organization Name is filled** where C1/D ticks *Do Not Know*. So
  there is no `usPocOrgNA` in the J1 pack.
- **A whole new page, Student/Exchange Visitor**: SEVIS ID and Program Number
  (CH, CI), *do you intend to study in the U.S.?* = NO, and an **Additional
  Point of Contact** taking two names - the first is CTI Indonesia, identical to
  the C1/D manning-agency details, the second from the sheet (CD-CG).
- **No Crew Visa page at all.** It exists only because the purpose is C1/D.
- The stay address is the host employer's, so it is per applicant, not a
  constant.

One correction worth recording, because it was nearly carried forward wrong:
the applicant's **Work Phone Number is `DOES NOT APPLY` on J1 too**. The
`6281239399928` in that print-out is the *employer's* phone in the Present
Employer block - a different box. `workPhoneNA` stays a constant in both packs.

#### Header matching had to become tolerant first
The J1 sheet has 108 columns against C1/D's 95, and **column positions differ
throughout** - which costs nothing, because `normalize.js` maps on header TEXT.
What did cost something:

- the lookup was **exact and case-sensitive**, so `Start date at current
  workplace` and `Start Date at Current Workplace` were different columns as far
  as it was concerned. The same field, silently lost. It is matched on a
  lowercase, punctuation-stripped key now.
- aliases could not simply be added as extra MAP entries, because `toRecord()`
  assigned in MAP order and an alias the row does **not** have would overwrite a
  good value with an empty string. It collects every candidate and takes the
  first **non-empty** one per key - the only order-independent answer.

Measured against the real export rather than asserted: **92 of 108 headers
understood**, 9 admin/workflow columns ignored on purpose, 6 document links
still to wire, 1 leftover that is a typo of an admin column.

#### Still to do for J1
- matcher rules for the Student/Exchange Visitor block. To be written from the
  print-out's **labels**, with **no id guessed** - the first live J1 Fill reports
  the ids for anything the labels miss, exactly as every other page here was
  done. No separate trial is needed for that.
- the DS-2019 parser, for the programme dates (the J1 sheet has no
  arrival/departure columns; `Appointment Date` is the interview).
- the two-tab worksheet, and the class banner in the extension popup.

No build tools, no framework — plain HTML/CSS/JS, same house style as the J1
Dashboard and the Indonesia Monitoring Dashboard.

## Repository
- **GitHub:** `https://github.com/CTI-Group-usa/ds160-autofill` (to be created)
- **Local:** `C:\Users\putua\ds160-autofill\`
- **Pages:** `https://cti-group-usa.github.io/ds160-autofill/` once Pages is enabled

## File Structure
```
index.html    — worksheet SPA shell
app.js        — CSV parsing, applicant list, detail rendering, extension bridge
normalize.js  — sheet row -> canonical DS-160 record + validation  (SHARED, tested)
constants.js  — constant answers the intake form never collects  (SHARED, tested)
trip.js       — per-applicant travel / U.S. contact details       (SHARED, tested)
letter.js     — C1/D supporting-letter parser + cross-check        (SHARED, tested)
pdftext.js    — minimal PDF text extraction (no library)           (SHARED, tested)
xlsx.js       — dependency-free .xlsx reader (ZIP + XML)  (SHARED, tested)
style.css     — all styles, light/dark via CSS variables
server.js     — local static preview on :7773
login.html    — Microsoft 365 sign-in page (self-contained styles)
auth.js       — the sign-in gate, browser half            (SHARED, tested)
worker.js     — ds160-auth Cloudflare Worker: OAuth only, no applicant data
wrangler.jsonc— its config; keep_vars is load-bearing, see the file
assets/       — the app logo: logo.png (309px source), logo-32.png, logo-256.png
extension/
  manifest.json  — MV3, host_permissions limited to ceac.state.gov
  icons/         — logo-16/32/48/128.png, the same mark (Chrome resolves
                   manifest icon paths relative to the extension root, so these
                   are a deliberate copy of assets/ - the extension folder is
                   loaded on its own and cannot reach out of itself)
  matcher.js     — control id / label -> record field rules  (SHARED, tested)
  content.js     — reads the DS-160 page, fills it, reports back
  popup.js/html  — applicant summary, Fill button, override teaching
  bridge.js      — receives a record from the worksheet page
test/         — plain-node tests, no framework
docs/sheet-schema.md — the 95 live sheet columns + DS-160 gaps
```

## Data Source
Zoho Sheet **Visa Registration Log**, resourceId
`vpzkvba5ae0adfc1247a8b7383dbef6ea3d8d`, worksheet **VISA APPLICATIONS**,
header row 1, 95 columns (index 0–94; index 1 has a blank header).

The **cti-indonesia-monitoring-dashboard** already reads six of those columns
through the `cti-indo-proxy` Worker (Zoho refresh token has
`ZohoSheet.dataAPI.READ`). A live feed for this project should extend that
Worker rather than mint a second Zoho self-client.

For now the worksheet loads a **file export** — `.xlsx` or CSV, no auth,
works offline. `.xlsx` is unzipped in the browser with
`DecompressionStream('deflate-raw')` and parsed with regexes (`xlsx.js`);
Excel serial dates fall straight through `normalize.js`'s serial branch.
Old binary `.xls` is rejected with a clear message.

## CEAC blocked the agent once - pace accordingly
On 2026-08-31 ceac.state.gov's security service blocked the agent mid
application ("Why have I been blocked?"). The likely trigger was
auto-continue: every postback dropdown reloads the page, and the filler
resumed 400ms later, up to twelve times - a burst of rapid form posts from
one session is the shape of traffic a WAF exists to stop.

Auto-continue was made **off unless switched on**, at 2.5s, giving up after 3
passes. **That was not enough, and on 2026-09-02 it was removed entirely** - see
below. A tool that gets the agent blocked out of CEAC is worse than one that
asks for another click, because the block costs the whole day's applications,
not one page.

If it happens again: stop, do not retry in a loop, and wait it out. Never
work around a block by changing IP, browser or identity - that is evasion of
a security control on a government system, and it is not on the table.

## It happened a SECOND and THIRD time - 2026-09-02, on Previous U.S. Travel
Same page family, same cause, and **nothing in the code had changed to explain
it** - which was checked rather than assumed. On a CEAC page only `matcher.js`
and `content.js` run, and neither makes a single network request: no `fetch`, no
XHR. The only traffic to CEAC is `__doPostBack`, the page's own form submit. The
sign-in gate talks to Cloudflare, and `bridge.js` runs on the worksheet origin,
never on `ceac.state.gov`.

What differed was **the volume of iteration that day** - many pages, many Fill
presses, many re-sends - on one IP. And after the first block the threshold
drops: access came back, a short run of the same work blocked it again.

### AUTO-CONTINUE IS GONE (removed 2026-09-02 at the user's request)
It was the only feature that could reload a CEAC page with nobody pressing
anything. `MAX_AUTO_STEPS = 3` and `AUTO_DELAY_MS = 2500` meant **one Fill press
could produce four reloads 2.5s apart** - precisely the burst shape a WAF exists
to stop.

Worse, it **bypassed the cool-down completely**: `FILL_COOLDOWN_MS` lives in
`popup.js` and paces the button, while the auto-resume ran in `content.js` on
page load and never went near it. Two independent paths could fire postbacks and
only one was paced. That was a defect in the fix shipped an hour earlier, and it
is why the feature was deleted rather than tuned again.

**There is now nothing in `content.js` that reloads a CEAC page.** Every postback
comes from a human pressing Fill, one per press, paced by the popup. Do not
reintroduce an automatic resume; `test/extension-auth.test.js` asserts the
absence. The filler was already as quiet as it can be: all safe fields
first, then **one** postback per pass, and No answers and Does-Not-Apply ticks
set without firing a reload at all (`revealsNothing()`).

What was missing was anything stopping **the operator** pressing Fill again the
instant the page came back. `complete_previousustravel.aspx` is the worst page
for it - two postback gates plus an *Add Another* block - so it takes several
passes, and a fast hand turns those into a burst.

**`FILL_COOLDOWN_MS` in `popup.js` (10s)** disables Fill after any pass that
fired a postback, with a visible countdown that says *why*. It started at 8s and
was raised to 10s on 2026-09-02 at the user's request, after the third block. It
is the **only** pacing left in the extension - auto-continue was deleted rather
than tuned a third time. Details that matter:

- it starts **only** when `report.postbackPending` is set. A pass that reloads
  nothing put no traffic on CEAC, so pausing after it would be pure friction;
- the timestamp lives in `chrome.storage`, because the popup is a fresh
  document every time it opens and closing it would otherwise clear the pause;
- **exactly one line writes `fill.disabled`.** There are now two independent
  gates - the sign-in and the cool-down - and two writers would let whichever
  ran last silently undo the other. `updateFill()` resolves both, and
  `test/extension-auth.test.js` asserts the single writer.

**Do not shorten it for convenience.** Auto-continue was tuned down twice and
blocked the session twice anyway. A block costs the whole day's applications,
not one page. The test asserts both the exact value and an 8s floor, so a quiet
shave fails the suite.

## An empty `section` makes every block guard inert — silently
`blockLabel()` used to `break` and return `''` for any container holding more
than 14 controls ("too big to be one block"). Every `must` and `not` guard reads
that string, so on an oversized block **all block pinning quietly stopped
working**: `must` guards blocked correct fills, and `not` guards stopped blocking
wrong ones.

CEAC's educational-institution block has **sixteen** controls — Name, two address
lines, City, State + its Does-Not-Apply, Postal + its Does-Not-Apply,
Country/Region, Course of Study, and two three-part dates. That is how its
`Country/Region` came back unfilled: the rule was right, the context it depended
on was blank.

Over the cap `blockLabel()` now returns **the heading alone** — the legend, or the
nearest non-empty preceding element. That still identifies the block exactly
without dragging half the page in to weaken the guards. `test/fake-prev-work-education.html`
reproduces the sixteen-control size on purpose; do not trim it back.

**When a `must`-guarded rule mysteriously does not fire, check the control's
`section` first.** It is reported per control by `pageMap()`.

## The sign-in gate, and what it is NOT
Only `@cti-usa.com` Microsoft accounts can open the worksheet. Same arrangement
as **cti-indonesia-monitoring-dashboard**, chosen deliberately by the user after
the limitation below was put to them.

`worker.js` (Worker `ds160-auth`) runs a server-side authorization-code flow:
`/api/auth/login` redirects to Microsoft, `/api/auth/callback` exchanges the code
with our client secret, checks **two** things, mints a session token into KV, and
sends the browser back to `index.html#authToken=…`. `auth.js` picks the token out
of the fragment, strips the fragment, and validates it at `/api/auth/me`.
`index.html` keeps `body{visibility:hidden}` until that resolves.

There is **no MSAL in the browser** and Microsoft's own tokens never reach the
page — only an opaque session id that KV can revoke.

### It hides the UI. It does not protect the files.
The worksheet is a static site on GitHub Pages, so `app.js`, `normalize.js` and
every other file are public. Someone who wants in can read the source, disable
JavaScript, or fetch a file directly. Microsoft genuinely verifies who signs in,
and the gate genuinely stops anyone without a CTI account from *using* the tool —
but it is a deterrent, not a boundary, and it must not be described as one.

The Indonesia dashboard's gate **is** real, and the difference is worth
understanding: every row it shows comes from its Worker, so no session means a
401 and an empty dashboard. This app has nothing server-side to withhold — the
intake file is read in the browser and never leaves it. If that ever changes,
serve the app from a Worker that checks the session before responding (or put
Cloudflare Access in front) and the gate becomes real.

### Two checks, and both are load-bearing
```js
if (claims.tid !== env.SSO_TENANT_ID)          // rejects a personal or
                                              // other-organisation account
if (!email.endsWith('@' + ALLOWED_EMAIL_DOMAIN))  // rejects a GUEST invited
                                                  // into the CTI tenant
```
Either one alone leaves a way in. A guest account is a real case — the tenant
check passes for them and their address ends in something else entirely.
`test/auth.test.js` asserts both are still there.

### Three strings must agree, or sign-in fails silently
`WORKER_ORIGIN` in `worker.js`, the Redirect URI registered on the Entra app,
and `WORKER` in `auth.js`. Microsoft compares the redirect URI character for
character, and a mismatch shows up as a button that appears to do nothing.
`SSO_REDIRECT_URI` is *derived* from `WORKER_ORIGIN` so those two cannot drift,
and the test asserts `auth.js` names the same host. `GET /api/health` answers
"is the Worker even up at this host", which is the first thing to check.

### What is deployed (2026-09-02)
| Thing | Value |
|---|---|
| Worker | `ds160-auth` at **https://ds160-auth.putu-astra.workers.dev** |
| Cloudflare account | `e9e538d5b8134729e6cd90a7cb8da53b` (`putu-astra`) |
| KV namespace | `ds160-auth-sessions`, `ebec7827472647a2b602b4d0f0181483`, bound `TOKEN_CACHE` |
| Entra app | *CTI DS-160 Worksheet*, single tenant |
| Secrets set | `SSO_TENANT_ID`, `SSO_CLIENT_ID` |

`GET /api/health` returns `{"ok":true,...}`.

All three secrets are set, and **CI deploys** work:
`CLOUDFLARE_API_TOKEN` is a repo secret and
`.github/workflows/deploy-worker.yml` deploys `worker.js` on push.

**`keep_vars` was proven, not just trusted.** The first CI `wrangler deploy`
against this Worker ran on 2026-09-02, and afterwards all three secrets were
still present *and still working* - `/api/auth/login` returned a 302 to
Microsoft with the right tenant, which is the only check that distinguishes
"the secret is named" from "the secret has a value". That is the disaster the
flag exists to prevent, and here it was headed off because the flag went in
**before** the first deploy rather than after.

The workflow logs one warning - `actions/checkout@v4`, `setup-node@v4` and
`cloudflare/wrangler-action@v3` all target Node 20, which GitHub now forces onto
Node 24. Harmless, and not fully fixable: the wrangler action is not ours to
bump.

**Still outstanding:** two Entra client secrets went through a chat transcript,
so both should be deleted and replaced with one set only at the wrangler prompt.

### It is on the putu-astra account, and that is technical debt
The August 2026 migration moved CTI's workers off `putu-astra` onto name-neutral
accounts, and `*.putu-astra.workers.dev` now 301-redirects. This Worker was put
back on that account on **2026-09-02 at the user's explicit choice**, to get the
gate working without another login: `putu.astra@cti-usa.com` can only reach
`e9e538d5…`, and the name-neutral account (`91d938b8…`, which runs
`api.cti-crm.workers.dev`) is behind a different login.

So `putu-astra` is in a URL CTI colleagues will see, and this is one more item
for the migration cleanup. Moving it later means changing **four** things
together: `account_id` here, `WORKER_ORIGIN` in `worker.js`, `WORKER` in
`auth.js`, and the Redirect URI on the Entra app - and re-setting the three
secrets on the new Worker, because secrets do not migrate.

### Local development
`ALLOWED_ORIGINS` includes `http://localhost:7773`, so the worksheet can be
signed into from `node server.js`. That grants an attacker nothing — anyone can
serve a page on their own localhost — and the sign-in still has to pass
Microsoft.

### Signing out wipes the loaded rows
`sessionStorage['ds160.rows']` holds the whole intake export: passport numbers,
dates of birth, addresses, parents' names. The sign-out handler clears it
**before** calling `Auth.logout()`, so nothing is left for the next person at
that browser. `Auth.logout()` knows nothing about the app's own storage, and
should not.

### A network error must not sign everyone out
A **401** is proof the token is dead, so it is dropped. A **thrown fetch** is
also exactly what a momentary offline looks like, so the token is *kept* and the
login page says it could not reach the service. Wiping on any failure would make
a flaky connection log the whole office out.

### The extension is gated too, with a grace period (2026-09-02)
It was not, and that was the honest gap: `popup.js` filled CEAC from a record
already in `chrome.storage` without ever asking who was driving. Now **Fill
starts disabled** and is only enabled once `background.js` has confirmed a live
session against the same Worker the worksheet uses.

**The extension cannot mint a session.** `bridge.js` lifts the token out of the
worksheet page's `localStorage` - a content script shares that with the page,
because storage is per origin - and hands it to `background.js`. So the only way
to unlock the extension is to have signed in on the worksheet in that same
browser. The token is pushed on every worksheet page load, not only when a
record is sent, so simply opening the worksheet keeps the extension's copy
fresh; an empty value is pushed too, which clears a stale token after sign-out.

**The check runs in `background.js` under `host_permissions`, not in the popup.**
A popup `fetch` would send `Origin: chrome-extension://<id>`, and an unpacked
extension's id is not stable, so it could never be allow-listed in the Worker.
Going through the background worker means **the Worker needed no change at
all**.

#### The grace period, and the one branch that must not have it
`authDecision(last, probe, now)` in `background.js` is pure so every branch is
testable. Four outcomes:

| Probe | Result |
|---|---|
| Worker confirms | allow, and record `checkedAt` |
| no token at all | deny - "sign in on the worksheet" |
| **401** | **deny, clear the state - the grace period must NOT apply** |
| unreachable, or 5xx | allow if the last good check was within **8 hours**, else deny |

The 401 branch is the whole gate. It is the Worker *actively refusing* the token
- proof, not a guess - and it is the only thing that shuts out a revoked session
or a disabled Microsoft account. A 5xx takes the unreachable path instead,
because a broken service says nothing about the token.

The user chose the grace period over blocking, and the reason is the same one
`auth.js` already lives by: **from the browser a dead token and a dropped
connection are the same failed fetch.** Blocking on every failure would let a
flaky office line stop a DS-160 halfway through. Eight hours is about a working
day, so a disabled account loses access the same day without anyone being
stranded mid-application.

#### What it buys, and what it does not
Same class as the worksheet gate: this code sits on the operator's own disk, so
whoever has the folder can edit `popup.js` and skip the check. What is real is
narrow and still worth having - **the extension as distributed refuses to work
without a live CTI session**, so a disabled account loses it within hours. For
someone who copies the folder, it does nothing.

#### Not verified in a browser
`test/extension-auth.test.js` (33 assertions) covers every `authDecision`
branch and asserts the wiring - Fill starts disabled, the click handler refuses a
disabled button, the host permission matches `WORKER_ORIGIN`. What it cannot do
is load an extension: a popup needs a real extension context. The live Worker
was checked instead (no header, a bogus token and an empty token all return
**401**, which is what `probeSession` maps to the deny branch). The remaining
check is a human one: reload the extension and try Fill with and without a
session.

## Hard Rules (safety, not preference)
- Never automate the CAPTCHA / security check.
- Never click Next, Sign, Submit, or Confirm.
- Never fill the Application ID, security question, or answer
  (`FORBIDDEN` in `matcher.js` blocks all of these by id).
- Full headless Playwright submission was considered and rejected: CAPTCHA,
  20-minute session timeout, `__VIEWSTATE` churn, and session-blocking risk.

## How the filler handles ASP.NET
CEAC is WebForms. Controls whose `onchange`/`onclick` calls `__doPostBack`
reload the page, so `content.js` fills every safe field first, then applies
**one** postback control and stops. The agent presses Fill again for the next
one - there is no automatic resume any more, see the block notes above.

**`revealsNothing()` avoids nearly all of that.** CEAC hangs `__doPostBack` on
the conditional questions so a *Yes* can reveal an explanation box. A *No*, or
a "Does Not Apply" tick, reveals nothing, and the value rides the form post
regardless — so those are set silently (`quiet` on `setRadio`/`setCheckbox`)
and no reload happens. A *Yes* still goes through the real postback, because
the explanation fields genuinely have to appear.

Measured on `test/fake-personal1.html`: 12 fields filled in one pass, zero
postbacks. Before this, Personal 1 needed three page reloads for the native
alphabet checkbox and the two Yes/No questions, which is what made it look
like nothing was happening.

## What is constant vs. per applicant
The split matters and the user has corrected it twice, so keep it straight.

**`constants.js` - the same on every application CTI files.** The yes/no answers
the intake form never asks, plus (added 2026-08-31 from the filed sample, at the
user's instruction) two whole blocks that describe the **cruise line, not the
seafarer**: the *Person/Entity Paying for Your Trip* block (COMPANY/ORGANIZATION,
CARNIVAL UK, its phone, EMPLOYER, and its Southampton address) and the *U.S.
Contact* block (XAVIER / MARCOS, BUSINESS ASSOCIATE, the Plantation FL address,
phone and email). Also `travelCompanions` = NO and the intended
length of stay. These are Carnival UK values - a different principal means
editing them in the panel, which is why they are text fields rather than
hardcoded.

**`trip.js` - genuinely different per seafarer:** the vessel, its IMO number,
the shipboard rank and the sign-on date, all of which come from that seafarer's
own supporting letter.

`usPocName` was one field holding "XAVIER, MARCOS"; it is now `usPocSurname` and
`usPocGiven`, because CEAC has separate boxes and guessing where the surname
ends would be wrong. `usPocName` is gone from `FULLNAME_KEYS`.

## Trip details (`trip.js`)
The Travel and U.S. Contact pages need an arrival date, city, flight, vessel,
who is paying and a U.S. point of contact — none of which the intake form asks
for. **Each DS-160 is a personal application**, so these are stored *per
applicant*, keyed on passport number (email, then name, as fallbacks), and
edited inline in that applicant's own detail view. An early draft scoped them
to the whole file as "batch" values; the user corrected that — do not
reintroduce it. `copy from...` exists so the cruise-line details need not be
retyped, but it is an explicit per-applicant action.

`purposeOfTrip` / `specifyPurpose` default to `ALIEN IN TRANSIT (C)` /
`CREWMEMBER IN TRANSIT (C1/D)` because every C1/D application uses them; both
are editable.

Trip details and constants are merged in `build()` **before** validation, so
the worksheet's error list reflects what will actually be filled. Any edit
calls `rebuild()`, not `renderDetail()`.

### Where the vessel details actually come from
**Not** the Cruise Line Deployment Report — the user corrected that. The vessel
name and IMO number are in each seafarer's **supporting letter**, held in Zoho
Drive and linked from the **Supporting Letter** column of the uploaded workbook.

The cell renders empty in Zoho Sheet because it holds a *hyperlink*, not text —
`xlsx.js → hyperlinks()` reads both storage forms (a rels-backed
`<hyperlink ref=…>` and an `=HYPERLINK("…")` formula), `gridToObjects` attaches
them to the row as `_links`, and `normalize.js` exposes
`rec.supportingLetterUrl` — falling back to the **cell's own text** when it is
just a URL, which is how the real workbook turned out to store it, which the worksheet shows as a link in the Trip
details block. `letter.js` parses the letter itself. Two things about the format matter:

- **The extracted text has no line breaks.** Labels and values run together
  (`...TODINGANDate of Birth 9/16/1987Nationality...`), so fields are cut out by
  locating each known label and taking everything up to the next one. Splitting
  on newlines finds nothing. The final value runs straight into the body
  (`MiamiI can confirm that...`), so it is cut at the body's opening phrases — a
  word boundary does not help when `i` meets `I`.
- **Its dates are written differently from the intake form**: month-first
  (`9/16/1987`) and with ordinals (`17th December 2026`). `parseDate` now strips
  ordinals, resolves the order when either half exceeds 12, and takes an
  `opts.monthFirst` hint for sources known to write that way.

It yields vessel, IMO, joining date, US port and shipboard job title, and
**cross-checks name / passport / date of birth against the intake row** — a
disagreement there is the kind of thing that burns an appointment slot.

**The letter is fetched and read automatically.** Pasting is only the fallback.

The worksheet page cannot fetch a Zoho URL itself — cross-origin, and behind the
user's login — so `extension/background.js` does it (host permissions cover the
Zoho hosts, and the request carries the user's cookies) and hands the bytes back
through `bridge.js`. The page then runs `pdftext.js` over them.

`pdftext.js` is deliberately blunt: inflate every `stream…endstream` span, keep
the ones that look like page content (mostly printable, containing `BT` and
`Tf`), and take the strings that are operands of `Tj`/`TJ`. No xref table, no
object streams, no page tree. Two things it has to get right:

- **Chrome's `DecompressionStream` errors on trailing bytes** where node's zlib
  ignores them, so the EOL before `endstream` is trimmed off the slice. Without
  that, every stream fails in the browser while the node tests pass — which is
  exactly how it first showed up.
- **The letter body is set in a Type0 font addressed by glyph id.** Without that
  font's ToUnicode map those bytes are meaningless, so unreadable runs are
  dropped rather than emitted; otherwise they corrupt the value that precedes
  them. What survives of the body can be a bare word like "Company", which
  `letter.js` cuts on.

A WorkDrive `/file/<id>` link opens a **viewer**, not the document, so
`background.js` tries the link, then
`https://download-accl.zoho.com/v1/workdrive/download/<id>`, then
`<link>/download`, and reports every attempt if none yields a PDF. Pasting a URL
into the paste box is treated as a link, not as letter text — that is what an
agent will naturally do.

`test/pdftext.test.js` runs end-to-end against a real letter if one is present
at `~/Downloads/SL-*.pdf` (or `LETTER_PDF=`); the unit tests run either way. The
PDFs are never committed — `.gitignore` covers `*.pdf`.

## Two answers taken from the filed sample
`Consular Electronic Application Center - Print Application_ALDI MAULANA
RIZKY_2.pdf` is a real, submitted C1/D application. Two of the defaults chosen
before it was seen were wrong, and the user confirmed both changes:

1. **Full Name in Native Alphabet is FILLED** with the Latin full name
   (`ALDI MAULANA RIZKY`) — not ticked as "Does Not Apply". `rec.nativeName`
   carries it; the adjacent NA checkbox now matches no rule at all and is left
   alone. Do not reintroduce a `nativeAlphabetNA` constant.

   It is built from the **name split**, not from the raw cell. Some intake rows
   write the name with a comma — `I PUTU JULI, FRINDAYANA` — and
   `rec.nativeName = rec.fullName` put that comma on a live form. A name has no
   punctuation in it: the comma is the sheet's separator and `splitName()`
   already treats it as one, so `given + surname` reproduces the passport order
   without it. A mononym is the single name alone, never `FNU SUROSO`.

   Note what the comma does **not** settle: `splitName()` still takes the last
   token as the surname, so `I PUTU JULI, FRINDAYANA` gives Surname FRINDAYANA
   (right for this sheet) while `FRINDAYANA, I PUTU JULI` would give Surname
   JULI (wrong). Reading the comma as a surname-first marker would be a guess
   about a convention nobody has stated, and every multi-word split is already
   warned about.
2. **Have you made specific travel plans? = NO.** CEAC then drops the flight,
   arrival-city and departure questions and asks only for an *Intended Date of
   Arrival* and an *Intended Length of Stay* (the sample: 8 MONTH(S)). Trip
   fields carry `showWhen`, so the itinerary fields are hidden — and, more
   importantly, `apply()` will not send a value for a question CEAC never asks.

The length-of-stay number and its unit dropdown share one label, so the rules
carry `tag: 'input'` / `tag: 'select'` to tell them apart; `kindAllows()`
enforces it. They also carry `not: /PREV/i`, because Previous U.S. Travel has
its own length of stay and `/LOS_CD/` matches `PREV_US_VISIT_LOS_CD` too — the
intended stay for this trip was landing in a visit years in the past.

## Previous U.S. Travel (added 2026-09-01, at the user's instruction)
Two questions on this page read alike and are not the same thing:

- **"Have you ever been in the U.S.?"** — about entries. The intake form has no
  column for it, so it is **derived**: `rec.beenInUs = lastUsArrival ? YES : NO`.
  If the seafarer filled *When did you arrive in the US?* (column P) the answer
  is Yes. This is the user's rule, stated as how CTI has always filled it.
- **"Have you ever been issued a U.S. Visa?"** — column O, `priorUsVisa`.

They shared one key until 2026-09-01, which put Yes on the entry question for
anyone holding a C1/D who had never actually landed, and then left the arrival
dates CEAC demands empty. Do not merge them again.

Splitting them exposed a bug in `fillPage`: only `deferred[0]` was ever applied,
so on a page with **two** postback questions the second was never filled and
never reported - it only showed up as a number in `remaining`. The deferred queue
is now walked until something actually changes, because an answer already correct
reloads nothing and must not consume the pass. Drive
`test/fake-prev-us-travel.html` twice: pass 1 answers "been in the U.S.", pass 2
answers "issued a U.S. Visa", and `remaining` reaches 0.

**Length of Stay comes from the intake form, not a constant.** It was briefly
built as a constant (`LESS THAN 24 HOURS` — crew transits are same-day) and the
user corrected that the same day: it is the seafarer's own answer. `prevStayUnit`
and `prevStayLength` are derived from columns Q and R. Do not reintroduce a
constant for it.

**Column Q** (*Period Type of Stay in the US*) is the period; **column R**
(*How long did you stay in the US?*) is the number beside it — the headers read
that way. The two are near-synonyms and easy to transpose, so if a period turns
up in R with Q empty, `validate()` names the column rather than quietly using it:
a blank here is a required CEAC field left unanswered.

The CEAC dropdown is a closed set — `-SELECT ONE-`, `YEAR(S)`, `MONTH(S)`,
`WEEK(S)`, `DAY(S)`, `LESS THAN 24 HOURS` — so a loose intake answer has to land
on an option exactly or the select stays unset. `stayUnit()` maps English and
Indonesian wording ("3 months", "2 minggu", "kurang dari 24 jam", "<24 hrs") onto
it and returns `''` for anything it cannot place, which `validate()` reports
rather than guessing.

For `LESS THAN 24 HOURS` the count is cleared: CEAC greys the number box out for
that option, so writing there would fail silently or contradict the dropdown.

### Column Q "IN DAYS" is a same-day transit
The user's rule, 2026-09-02: `In Days` in column Q with **no number in column
R** is filled as **LESS THAN 24 HOURS**. It is the shortest period their intake
form offers, and CTI's crew go ashore and back aboard on one tide.

Left as `DAY(S)` the page could not be completed: the dropdown was set, the
number box beside it stayed blank, and the report only said `prevStayLength -
no value in record` with nothing to fill it from.

**Guarded on the number being absent.** Q `In Days` with a `5` in R is five
days, and rewriting that to less than 24 hours would swear to something the
sheet contradicts - that branch keeps `DAY(S) + 5`. `validate()` names **both**
outcomes, because either one is an interpretation of a coarse intake answer
rather than something the sheet says outright.

### `_blankOnPurpose` - a field the record empties on purpose is not a gap
Fixing the period was not enough: `prevStayLength` still appeared as
`no value in record`, and **that exact string is what `popup.js` reads as "this
record is stale, send it again"**. Re-sending can never fill a box CEAC greys
out, so the red banner would have nagged for ever - the same trap
`MISSING_FROM_INTAKE` was built for, in a different shape.

`normalize.js` now publishes `rec._blankOnPurpose`, and `content.js` routes
those keys to **"Left blank on purpose"** instead of `skipped`. It is
record-driven where `LEAVE_BLANK` in `matcher.js` is a static id list, because
whether the box should be blank depends on the answer above it, not on which
control it is.

### The rest of the page (added 2026-09-01, at the user's instruction)
- **"Applying in the same country the visa was issued, and resident there?"** —
  constant `sameCountryResidence` = YES. CTI files in Jakarta for seafarers
  resident in Indonesia.
- **"Have you been ten-printed?"** — **derived, not a constant.** The user first
  said constant NO, then corrected it to YES *if he has held a U.S. visa before*,
  which makes it `priorUsVisa === 'YES' ? 'YES' : 'NO'`. Ten-printing is the scan
  taken at a visa interview, and CEAC only asks it inside the previous-visa
  block, so in practice it is the Yes branch.
- **"Immigrant petition filed on your behalf?"** — constant `immigrantPetition`
  = NO. A Yes changes how the whole application reads; check it per applicant.
- **"Ever refused a U.S. visa, refused admission, or withdrawn an application at
  the port of entry?"** — `visaRefused`, taken from **column X** at the user's
  direction.

Column X is headed *"Has your U.S. Visa / passport ever been cancelled or
revoked?"* and already answers `visaRevoked`, a **different** DS-160 question —
the intake form has no column for refusals. So one cell now swears to two
answers. That was raised with the user and they confirmed it, so it stands, but:
both worksheet lines name column X, and `validate()` warns on a Yes, because
someone can be refused a visa without ever having one revoked, and CEAC wants a
separate explanation for a refusal (column Y explains the cancellation). If a
refusal column is ever added to the sheet, point `visaRefused` at it and delete
the derivation.

## A printed DS-160 is not a filled DS-160
`usPocOrg` was set to the text **"DO NOT KNOW"** because those words appear in the
Organization Name box of a filed sample. They appear there **because the checkbox
beside the box is ticked** - CEAC renders the tick as that phrase when it prints.
Typing the words in leaves the checkbox unticked and puts a literal string where
an organisation name belongs. The user corrected it on 2026-09-01: `usPocOrg` has
no constant now, and `usPocOrgNA` ticks the box instead.

**Reading a value off a printed application is a guess about the control that
produced it.** Where a printed field could be either a typed value or a ticked
box, check the live page before turning it into a constant.

Then the fix ticked **both** boxes. This block has two "Do Not Know" checkboxes —
one for the contact person's name, one for the organisation — and CEAC titles the
block *"Contact Person or Organization in the United States"*, so the word
"Organization" is in the context of both. A label rule guarded by
`must: /organization/i` claimed the person's box too and greyed out the Surnames
and Given Names that do get filled. `usPocOrgNA` is therefore matched on its
**id alone**. If CEAC renames that control the box goes unticked and the report
says so, which is the right way round: a wrongly ticked box is a wrong sworn
answer, a missed one is a visible gap.

Matching on the id alone then **missed the live control** — the box came back
unticked, and because `isDoesNotApply()` silences every "Do Not Know" box, it did
not appear in the report either, so its id could not be read off the page. Two
changes:

- the pattern accepts the short spelling as well (`POC_ORG` rather than
  `POC_ORGANIZATION`);
- `fillPage` reports does-not-apply boxes in **`report.deliberate`**, rendered as
  a calm "Left blank on purpose" list **with ids**. Left alone is not a gap, but
  it is not nothing either: the next time one of them turns out to want ticking,
  the id is right there.

`test/fake-us-contact.html` proves the end state; the regression itself is pinned
in `matcher.test.js`, which passes the block text explicitly — a fixture's
`blockLabel()` does not necessarily reproduce the live nesting.

## Present Employer or School comes from AU–AY — do not branch it
A conditional source keyed on column AZ was built here on 2026-09-01 and
**reverted the same day at the user's request**. Column AU holds whatever that
seafarer's employer or school actually is: a shipping company for one applicant,
`INSTITUTE TOURISM OF SAHID` for another. There is nothing to branch on.

`CTI INDONESIA` appearing in this box for one applicant was **that row's own AU
value**, not a mapping error. The manning agency block on the Crew Visa page is a
separate thing and lives in `constants.js`.

| Box | Column |
|---|---|
| Present Employer or School Name | AU |
| Street Address | AV |
| Phone Number | AW |
| Start Date | AX |
| Primary Occupation / position | AY |

CEAC requires the address and the start date, so a blank AV or AX is reported
rather than passed over. Tests assert that BA (previous employer) and BO
(university) are **not** consulted for this block.

### One constant on this page, and one that was withdrawn
`monthlyIncomeNA` = **tick Does Not Apply** — no salary column in the sheet, and
CEAC only asks it "if employed". It is pinned by
`must: /monthly (income|salary)/i`, because State/Province and Postal Zone on
this same page carry an identical "Does Not Apply" **and hold real values**.

**`employerCountry` was a constant = INDONESIA for a few hours and is now
removed.** A row whose employer is Carnival UK filled `INDONESIA` against an
address in *Southampton, Hampshire, SO15 1ST*. The employer is Indonesian for
most applicants and foreign for some, so there is no constant to have — the
agent picks it, and `MISSING_FROM_INTAKE` names it so the omission is visible.

`Country/Region` is still a bare label shared by **four** blocks — home address,
passport issue, manning agency and present employer — so each of those rules is
pinned to its own block and a bare one outside any block stays unclaimed. A
cross-block test covers all four.

### Only the applicant's own phone number is normalised
`normPhone` assumes Indonesia: it strips a leading `0` and prepends `62`. Column
AW held Carnival UK's `02380655000`, which came out as `+622380655000` — a number
that does not exist. An Indonesian landline starts with `0` as well (`0361`,
`021`), so no prefix rule can tell them apart, and CEAC accepts the local format.

`employerPhone` (AW) and `prevEmployerPhone` (BC) therefore use
**`phoneAsWritten`** — digits and a leading `+`, nothing else. The agency phone
constant is stored raw for the same reason. Only column AA, the applicant's own
number, still goes through `normPhone`.

### The employer's phone label is bare "Phone Number"
The rule wanted `/telephone number.*employer/i` and never fired, so column AW
landed nowhere. A bare "Phone Number" also labels the U.S. contact box, so the
rule is pinned to this block.

### The employer address was clipping in Line 1
`employerAddress` matched only `EmpSchAddr1`, so nothing claimed Line 2 and an
address over CEAC's 40 characters lost its tail to the browser — silently.
`employerAddress` joined `ADDRESS_KEYS`, its rule takes `EmpSchAddr[12]`, and
`addressHalf()` recognises `Addr2` as a second line alongside `_LN2`.

The cap lookup in `valueFor` had to change with it: it searched the whole page
for `ADDR_LN1` and so measured the **home** address line while filling the
employer's. It now finds the partner by turning the 2 into a 1 in the control's
own id.

`employerCity`, `employerState` and `employerPostal` have no column in the sheet
either — one free-text address, same as home — so they get id-only rules and
join `MISSING_FROM_INTAKE`, which puts them in the calm "not collected by the
intake form" note instead of the red re-send banner.

**`ddlPresentOccupation` (Primary Occupation) is still unmatched.** It is a fixed
CEAC dropdown and no intake column maps onto its option list; the shipboard rank
in the supporting letter is not the same thing (a Hotel Assistant is not
CULINARY/FOOD SERVICES). It needs a decision, not a guess.

### The four "Year of ..." columns hold full dates
BM, BN, BR and BS are headed *"Year of ... Entry"* / *"... Graduation"*, but the
sheet holds `28 Aug 2015`, `06 Apr 2017`, `16 Jul 2019` — the user confirmed
there are **no year-only values**. The header is misleading, not the data.

All four are therefore parsed with **`strictDate`**, not passed through as text:
CEAC's attendance dates are split day/month/year dropdowns, so raw text would
never land. `strictDate` is `dateStr` with one refusal — a bare 4-digit year
returns `''` rather than `01-JAN-YYYY`, a day and month nobody stated on a sworn
form. `validate()` then quotes the raw cell and asks for the real date.

An empty cell is reported too: CEAC requires Start Date, so a blank has to be
visible rather than silent.

## Additional Work / Education / Training (2026-09-01)
Seven controls, all reported unrecognised from a live Fill — so every id in
these rules is the real one.

| Question | Key | Source |
|---|---|---|
| Do you belong to a clan or tribe? | `clanTribe` | constant NO |
| Languages You Speak — first row | `languageSpoken` | constant ENGLISH |
| Traveled to any countries in the last five years? | `countriesVisited` | **column M** |
| Belonged to any professional/social/charitable organization? | `belongedOrganization` | constant NO |
| Specialized skills — firearms, explosives, nuclear, biological, chemical? | `specializedSkills` | constant NO |
| Ever served in the military? | `militaryService` | constant NO |
| Ever involved with a paramilitary/rebel/insurgent organization? | `insurgentOrg` | constant NO |

These are **sworn answers**, so each is its own named constant with a `why` —
not folded into `securityAllNo`'s blanket sweep, which only covers
`securityandbackground` URLs anyway. The agent can see and change each one.

Note on `specializedSkills`: STCW safety and firefighting training is **not**
what that question asks about. Its `why` says so, because the temptation to
answer Yes on a seafarer's behalf is real.

### Column M: "NONE" means No
`countriesVisited` is derived, not constant, and the rule is the user's:

| Column M | Answer | Country/Region |
|---|---|---|
| `NONE` (or blank, `Nil`, `-`) | **NO** | left alone |
| anything else | **YES** | the **first** country |

A first pass here answered Yes for any non-empty cell, which made `NONE` a Yes
**and then left the country list CEAC demands empty** — a page that cannot be
completed, from a cell that was saying the opposite.

`firstCountryVisited` splits column M on commas, semicolons, slashes, newlines
and the words *and* / *dan*, then takes the first. `setSelect`'s tolerant option
matching does the rest. Every further country is handed back by `validate()`:

> Only the first country is filled (SINGAPORE). Add these by hand: Malaysia, Thailand

That is deliberate, not a shortcut. Each extra row costs an *Add Another*
postback, and **CEAC's WAF blocked the agent once over a burst of postbacks** —
see the note at the top of this file. `languageSpoken` stops at the first
repeater row for the same reason.

Country/Region here is the **sixth** block sharing that bare label, pinned by
`must: /countries.*visited|list of countries/i` plus `not: /_IND\b/i` — the
Yes/No radio's own id also contains `COUNTRIES_VISITED`.

## Previous Work / Education / Training (2026-09-01)
The live page came back with **both** gating questions unanswered — neither had
a matcher rule at all — so the page could not be completed. Their ids are
`rblPreviouslyEmployed` and `rblOtherEduc`, and both are postbacks, so they land
one per pass.

| Question | Source |
|---|---|
| Were you previously employed? | column **AZ** |
| Attended an educational institution at secondary level or above? | constant **YES** |

A Yes on the first fills the employer block from **BA–BH** — note BH, the
previous workplace country, which had no rule before.

**Column BI picks the education block**, not column AZ. CEAC's education block is
*one* set of fields — Name of Institution, Address, Course of Study, Date of
Attendance From/To — and the sheet carries two candidates:

| Column BI | Source |
|---|---|
| High School / Vocational School | BJ–BN |
| College / University | BO–BS |

`normalize.js` derives `eduName` / `eduAddress` / `eduCourse` / `eduFrom` /
`eduTo` from that choice, and `_eduSource` records which block ran. Matching is
tolerant of loose wording — `SMK`, `Diploma III`, `Sarjana (S1)` all land
correctly. The three old rules pointed at the **high-school columns directly**;
they now point at the derived keys.

If BI is unreadable **and both** candidate blocks hold a name, nothing is chosen
and `validate()` asks — picking an institution to swear to is not ours to do.
With only one block filled there is no ambiguity, so it is used.

`attendedEducation` = YES because CEAC's own help counts *any* secondary school
attended for any length of time, and every seafarer CTI files has at least an SMA
or SMK. Answering No would hide the block entirely.

**`eduCountry` = INDONESIA is a constant, and `employerCountry` is not.** The
school is always in Indonesia; the employer can be Carnival UK in Southampton.
That is the whole distinction, and it is why one is a constant and the other
was withdrawn.

This is the **fifth** block with a bare `Country/Region` label — home address,
passport issue, manning agency, present employer, educational institution.
`employerCountry`'s guard is `must: /employer|school/i`, for the heading
*"Present employer or school address"*, so it needed an explicit
`not: /institution|attendance/i` to stay out of the education block. A test
covers all five.

`eduAddress` joined `ADDRESS_KEYS`, so a long school address overflows into
Line 2 instead of being clipped — same arrangement as the home and employer
addresses.

`prevEmployerCity` and `eduCity` have no columns — BB and BP are single
free-text addresses — so both are named by id only and join
`MISSING_FROM_INTAKE`.

### THE REPEATER PREFIX IS THE ONLY DISCRIMINATOR (2026-09-02)
Nobody had filed a `previously employed = YES` row until the admin did, and the
first live Fill on that branch found ten unrecognised controls and one silent
wrong fill. CEAC renders this page as two ASP.NET **DataLists**, so every id
carries a repeater prefix - and INSIDE them the field names are the ones the
**Present** employer page uses:

| Live id | What the old rule wanted |
|---|---|
| `dtlPrevEmpl_ctl00_ddlEmpDateFromDay` | `PrevEmplDateFrom…` |
| `dtlPrevEmpl_ctl00_ddlEmpDateToDay` | `PrevEmplDateTo…` |
| `dtlPrevEmpl_ctl00_tbEmployerCity` | `PrevEmpl.*Addr.*City` |
| `dtlPrevEmpl_ctl00_tbxPREV_EMPL_ADDR_STATE` | no rule at all |
| `dtlPrevEmpl_ctl00_tbxPREV_EMPL_ADDR_POSTAL_CD` | no rule at all |
| `dtlPrevEmpl_ctl00_tbDescribeDuties` | no rule at all |
| `dtlPrevEmpl_ctl00_tbxSupervisorSurname` | `PrevSupervisorSurname` |
| `dtlPrevEduc_ctl00_tbxSchoolCity` | `School.*Addr.*City` |
| `dtlPrevEduc_ctl00_tbxEDUC_INST_ADDR_STATE` | no rule at all |
| `dtlPrevEduc_ctl00_tbxEDUC_INST_POSTAL_CD` | no rule at all |

**The start date is the one that matters.** `employerStart` matches
`/EmpDateFrom(Day|Month|Year)/`, which the repeater id satisfies exactly - so on
this page it claimed the previous employer's box and wrote the **PRESENT**
employer's start date (column AX) where column BF belongs. Filled, plausible,
and wrong on a sworn form, and **invisible in the report because a filled field
is not a gap**. It now carries `not: /PrevEmpl/i`; the repeater prefix is the
only thing that separates the two.

The **To** date had no working rule at all, which is what the admin saw as "the
end date will not fill". `prevStart` / `prevEnd` now key on
`/PrevEmpl.*EmpDateFrom|To(Day|Month|Year)/`.

**`employerCountry` was quietly eating column BH too.** Its `must: /employer/i`
is satisfied by the section text "Previous Employer", and it sits BEFORE
`prevCountry` in the table, so in the label pass it claimed the previous
employer's Country/Region and left it blank - it has no constant behind it.
That is why the report read `employerCountry - no value in record` on a page
where that field does not exist. `previous|PrevEmpl` joined its `not`.

**Four `_NA` twins share their value box's whole prefix** -
`PREV_EMPL_ADDR_STATE` vs `..._STATE_NA`, and the same for postal, on both
repeaters. That is the vessel-owner trap again, so every one of those rules
carries a lookahead. Ticking one of them would wipe an address the agent had
typed by hand.

Six of the new keys have **no sheet column** - `prevEmployerState`,
`prevEmployerPostal`, `prevDuties`, `eduCity`, `eduState`, `eduPostal` (BB and
BP are single free-text addresses, and BD is the position, not the duties). All
six are in `MISSING_FROM_INTAKE`, so the report says "the intake form does not
collect this" instead of raising the red re-send banner that no re-send could
ever clear.

`test/fake-prev-work-education.html` now carries the real repeater ids. Verified
in a browser with column AX **holding a value**, which is the only way to prove
the guard: the From box took `01-FEB-2019` (BF) and not `28-AUG-2015` (AX), the
To box took `15-JUN-2021` (BG), column BH filled, and nothing was unrecognised.
The Present page was re-checked in the same session and still fills its own
start date.

Its day dropdowns had one option each, so a legitimate value came back
"no matching option" and looked like a matcher failure - they carry a realistic
range now.

## Crew Visa: the vessel block (2026-09-01, at the user's instruction)
Nine controls, and they describe **three different companies plus the ship**.

| Question | Key | Source |
|---|---|---|
| Specific job title aboard aircraft or vessel | `jobTitleAboard` | supporting letter |
| Name of company that owns the aircraft or vessel | `vesselOwnerCompany` | constant CARNIVAL UK |
| Company Telephone Number | `vesselOwnerPhone` | constant `+19545685888` |
| Did you acquire your position using a recruiting/manning/crewing agency? | `usedAgency` | constant YES |
| Are you serving aboard a seagoing ship or vessel? | `servingAboardVessel` | constant YES |
| Seagoing Ship/Vessel Name | `vesselName` | supporting letter |
| Seagoing Ship/Vessel Identification Number | `vesselImo` | supporting letter |

The three from the letter stay in `trip.js`, per applicant - a different ship
every contract. The owner's phone is the **same number** the payer block carries
on the Travel page, but stored with the `+` where the payer's has none; that is
how each page shows it, and the `why` on the constant says so, otherwise it looks
like one of them is a typo.

### Two ways a guard can name the wrong thing
Both of these fill something **wrong** rather than leaving it empty, which is the
worst class of bug here, and both were silent.

1. **Never name a sibling field in a `not` guard.** `vesselName` carried
   `not: /IDENT|IMO|NUMBER/i` to keep off the IMO box. But `not` is tested
   against the **section**, and this block's text contains "Seagoing Ship/Vessel
   Identification Number" - so the rule excluded **itself** on every real page.
   The ids separate the two cleanly; put `vesselImo` first and drop the guard.
2. **Sibling ids can share a prefix.** `VESSEL_OWNER_NAME` and
   `VESSEL_OWNER_TEL` both contain `VESSEL_OWNER`, so the company rule claimed
   the phone box in the id pass and wrote `CARNIVAL UK` into it - caught in the
   browser, not by the matcher tests. A `not` cannot fix this one either: the
   block says "Company Telephone Number". The company id carries a negative
   **lookahead** - `/VESSEL_OWNER(?!.*(?:TEL|PHONE))/i` - which only ever looks
   at the id, and the phone rule sits first as well.

The general shape: **a `not` guard is for other blocks, never for a neighbour in
the same one.** Neighbours are separated by ids, ordering, or a lookahead.

### What the live page corrected
Both gate questions came back unrecognised and their real ids look nothing like
what was guessed:

| Question | Guessed | Real |
|---|---|---|
| Did you acquire your position using an agency? | `rblAGENCY_IND` | **`rblPositionThroughAgency`** |
| Are you serving aboard a seagoing ship or vessel? | `rblSEAGOING_VESSEL_IND` | **`rblVesselWorkQuestion`** |

Neither label rule saved them, because a radio's derived label on this page is
just "Yes" - so on a Yes/No question the id genuinely has to carry it.

**The sheet's own job title claimed the crew box.** Column AY (the present
employer's position) filled `COMMIS` into *Specific job title aboard aircraft or
vessel*, where the supporting letter says `COMMIS DE CUISINE` - a different
answer, from the wrong document. The label rule on `jobTitleAboard` matches the
live wording exactly; what beat it is that **the id pass runs before any label
pass, across every rule**, and the live id starts `tbxJobTitle`, which
`jobTitle`'s own `/tbxJobTitle/i` matches. Rule order within the table does not
help when the two passes are ordered like that.

The discriminator is the word **"aboard"**, which is in the box's own label, so
`jobTitle` carries `not: /aboard/i` - it holds even where `blockLabel()` yields
no section at all, and Present Employer never says "aboard".

**A pattern that only fires in the label pass is one `not` away from being
overridden by any rule with a matching id fragment.** When two pages ask a
similar question, guard the one whose source is *wrong* as well as pointing the
right one at the right box.

The Vessel Name and Identification Number boxes appear only after the gate is
answered Yes, so **their real ids are still unknown** - the labels carry them,
and no id has been guessed for them on purpose. The next Fill report on that
revealed block settles it.

### The agency block is constants
`usedAgency` = YES plus `agencyName`, `agencyContactSurname` /
`agencyContactGiven`, `agencyAddr1`, `agencyCity`, `agencyState`,
`agencyPostal`, `agencyCountry`, `agencyPhone` — CTI's own office, identical on
every application, so it sits with the payer and U.S. contact blocks in
`constants.js`. The phone is stored as CEAC shows it (`085333735407`), **not**
normalised to +62.

Every one of those boxes shares its label with at least one other block —
Surnames, Given Names, Street Address, City, State/Province, Postal Zone,
Country/Region, Telephone Number — so every rule carries `must: /agency/i`.
Writing the tests found two real leaks, both now guarded:

- the applicant's own `surname` / `givenNames` rules claimed the **agency
  contact** boxes on their labels, which would have sworn the seafarer's name as
  the agency contact. `AGENCY` joined the relative guard;
- `prevEmployerPhone` had a bare `/telephone number/i` label and claimed the
  agency phone — a previous employer's number in the agency's box. Now scoped by
  `must: /previous|prevempl/i`.

Ids in this block are still guesses; the labels carry them until a live Fill
report pins them.

## Family: Relatives (added 2026-09-01, at the user's instruction)
Two constants — `fatherInUs` and `motherInUs`, both **NO**. A Yes makes CEAC ask
for that parent's status, so check them per applicant.

**All six Date-of-Birth parts came back unrecognised** while the names filled.
CEAC writes the parents' controls in a PascalCase plural here —
`ddlFathersDOBDay` and `tbxMothersGivenName`, not `FATHER_DOBDay` and
`FATHER_GIVEN_NAME`. Both spellings are accepted now, `GivenName` without the
underscore included. The spouse rules were widened the same way; that half is
**not yet confirmed against a live page.**

The applicant's own `dob` rule matches any `/DOB(Day|Month|Year)/`, and the only
thing keeping it out of the parents' boxes is its
`not: /FATHER|MOTHER|SPOUSE|POC|CHILD/i` guard. That guard is load-bearing —
without it the seafarer's own birthday goes into both parents' fields. A test
asserts it.

### THE EXCEL SERIAL FLOOR WAS 20000, SO EVERY DATE BEFORE 1954 WAS LOST
`parseDate` took a bare number as a serial only when it was **over 20000** —
which is **3 October 1954**. Anything earlier fell through to the final
`new Date(s)` fallback, where JavaScript reads a number as a **year**: a father
born on serial `18628` became `01-JAN-18628`.

It then failed *silently, twice over*:

- `splitDate()` requires `\d{4}`, so a five-digit year returns null, `valueFor`
  returns `''`, and the fill report said **`fatherDob – no value in record`** —
  naming the one cause that was not true. The date was in column AJ all along.
- that exact string is what `popup.js` reads as "stale record, send it again",
  so the fix it suggested could never work.

Parents' dates of birth live squarely in that window. **104 cells in the live
export were being dropped** — 72 fathers, 32 mothers, out of 813 rows that have
them. Nothing anywhere said so; the CEAC dropdown was simply empty and the
operator was told the record was stale.

The floor is about **digit count, not magnitude**: a bare year is four digits, a
serial for any date from 1927-05-18 is five. It is `>= 10000` now, and the
`new Date(s)` fallback **refuses an all-digit string outright** — that fallback
is for odd textual formats, and handing it digits is what invents a January the
1st nobody stated on a sworn form. (`dateStr('1995')` is `''` now too, which is
what `strictDate` already existed to enforce for the "Year of ..." columns.)

Three reporting changes went with it, all of the same kind — **a value we cannot
use must say so in its own words**:

- `toRecord()` publishes **`rec._unreadable`**: cells the sheet filled in and a
  *date* transform refused. By the time it is a record field, "rejected" and
  "empty column" are both `''`, and only that loop can tell them apart.
  `validate()` names each one and quotes the cell. It is scoped to `dateStr` /
  `strictDate` on purpose — `stayUnit()` and the yes/no readers also return `''`
  for a non-empty cell, and validate already reports those in their own words.
- `content.js` reports a date it cannot split as **`the record holds "…", which
  is not a DD-MMM-YYYY date`**, never as `no value in record`.
- a **mononym relative's empty Given Names box** moved to *Left blank on
  purpose*. `fatherGivenNA`/`motherGivenNA` is *why* it is empty, so every
  single-named parent was raising the red re-send banner for an answer that was
  already correct.

`test/fake-family.html`'s day and month dropdowns held **one option each**, so
`31` and `DEC` came back "no matching option on this page" and read as a matcher
failure while the rule worked perfectly — the same trap already recorded for
`fake-prev-work-education.html`. They carry full ranges now; do not trim them
back. Verified in a browser: 13 filled, nothing skipped, nothing unrecognised,
zero postbacks, `31-DEC-1950` and `23-JUN-1973` in the two blocks.

### "FNU" is a placeholder, not a name — and for a relative it is a TICK
The live page filled the father as **Surnames FNU / Given Names SUROSO** —
exactly backwards. The intake value was `SUROSO FNU`, and the splitter took the
last token as the surname. `FNU` is the DS-160 placeholder for a name that does
not exist; it arrives in already-processed intake data and is never a name
itself. `splitName()` and `nameHalf()` drop it before splitting.

Then the user corrected the other half: for a **relative**, a single name is
**Surnames + a ticked "Do Not Know" beside Given Names** — not the letters
`FNU` typed in. Third time the same trap: CEAC prints `FNU` there *because* the
box is ticked, exactly as it prints `DO NOT KNOW` for the U.S. contact
organisation.

`MONONYM_NA_KEYS` in `matcher.js` lists the keys that opt in — `fatherName` and
`motherName` only. For those, `nameHalf()` returns `''` for the given half of a
mononym and `normalize.js` derives `fatherGivenNA` / `motherGivenNA` to tick the
box. **The applicant's own Given Names on Personal 1 has no such checkbox, so
`surname` / `givenNames` keep FNU** — do not "fix" that to match.

The Surnames Do-Not-Know box is never ticked: that half always has a value.

The live ids for these six boxes are still unknown — they are silenced by
`isDoesNotApply()` and now appear under "Left blank on purpose" with their ids,
so one Fill report settles it. Both plausible spellings (`...GivenNameUnknown`
and `..._GIVEN_NAME_NA`) are accepted meanwhile.

## Family: Spouse (2026-09-01, at the user's instruction)
Six controls came back unrecognised, and one box was quietly filled from the
wrong source.

| Box | Source |
|---|---|
| Spouse's Surnames / Given Names | column AM |
| Spouse's Date of Birth | column AN |
| Spouse's Country/Region of Origin (Nationality) | column **AO** |
| Spouse's Place of Birth - City | column **AP** |
| Spouse's Place of Birth - Country/Region | column **AO** |
| Spouse's Address | constant SAME AS HOME ADDRESS |

**Column AO answers two DS-160 questions.** It is headed *"Husband/Wife Country
(Nationality)"* and now also fills the country in the Place of Birth block, at
the user's instruction. Like column V and column X, one cell swears to two
things. They coincide for an Indonesian spouse and part company for anyone born
abroad, so `validate()` flags a non-Indonesian value rather than passing it
through silently. Both worksheet lines name column AO.

### The applicant's nationality was filling the spouse's box
The report read `nationality -> INDONESIA` on the Spouse page: the applicant's
own rule had claimed *Spouse's Country/Region of Origin (Nationality)* on its
label. Both are Indonesian almost always, **which is exactly why it looked
fine** - and a foreign spouse would have been sworn to the wrong nationality.
`nationality` now carries `not: /spouse/i`.

### THE PAGE IS PART OF A CONTROL'S CONTEXT
The spouse's date of birth is `ddlDOBDay` / `ddlDOBMonth` / `tbxDOBYear` -
**byte for byte the applicant's own ids from Personal 1** - and on the live page
those three carry no label and no block text either. Nothing inside the block
says whose birthday it is. The applicant's `dob` rule stood aside correctly (its
`not: /SPOUSE/i` guard) and then nothing claimed them at all, so the page could
not be completed.

`content.js -> pageTag()` therefore appends the page heading and the `?node=`
value to every control's `section`: "Family Information: Spouse". `must` and
`not` read that; `labels` never do, so it can only rule a match in or out, never
invent one. Both junk filters matter - CSS declarations are stripped and the
string is capped - because this text is now read by every guard on the page, and
a stylesheet swept into it is a coincidence waiting to happen.

Verified against all fourteen fixtures before and after: the unmatched count per
page is identical, so no rule started or stopped matching anywhere else.

### `pageMap()` was hiding the one field that explains a guard
It reported id, name, tag, type, label and the match - **but not `section`**,
which is the only context a `must` or `not` is judged on beyond those. This file
told you to check it there. Two hours of this page went into rediscovering that
the Place of Birth block has no reachable text at all; the map would have said
so immediately. It is reported now.

### Two rules per key when a block has no text
CEAC's Place of Birth block is a bare `<div>`; `blockLabel()` returns nothing for
it. A `must` gates the **id path** as well as the label path, so a guarded rule
could never fire there and both boxes were reported unrecognised even though
their ids say `SpousePOBCity` and `SpousePOBCountry` outright. Split it: an
id-only rule with no guard, plus a label-only rule that keeps the guard for the
bare "City" and "Country/Region" labels. Same arrangement as `eduCountry`, and
the third time this shape has been needed.

### The applicant's name rules carry the relative guard
"Surnames" and "Given Names" label the relatives' boxes too, and `surname` /
`givenNames` sit first in `RULES`. The id pass saves it today — `FathersSurname`
matches `fatherName` before any label is tried — but a renamed CEAC control would
let the label pass write the **seafarer's own name into his father's box**. Both
rules now carry `not: /FATHER|MOTHER|SPOUSE|POC|CHILD|RELATIVE|SUPERVISOR/i`, the
same guard and the same reason as `dob`.

### Never put markdown backticks through a double-quoted shell command
Writing this very section with `python -c "…"` let bash evaluate every
backticked identifier as a command substitution and silently deleted all of
them, leaving sentences with holes in them. Same family of accident as the
0x08 bytes in `matcher.js`. Use the file-editing tools for prose and rules.

## Passport (added 2026-09-01, at the user's instruction)
The live page reported **ten** controls unrecognised and showed a bare `2023` /
`2033` with the day and month dropdowns empty.

| Answer | Key | Source |
|---|---|---|
| Passport/Travel Document Type | `passportType` | constant REGULAR |
| Country/Authority that Issued | `passportIssuedCountry` | constant INDONESIA |
| Country/Region where Issued | `passportIssuedInCountry` | constant INDONESIA |
| Issuance Date | `passportIssued` | column AG |
| Expiration Date | `passportExpiry` | column AH |
| Ever lost a passport or had one stolen? | `visaLostStolen` | column V |

**Six of the ten were the `_DTE` infix again** - the ids are `PPT_ISSUED_DTEDay`
and `PPT_EXPIRE_DTEDay`, and the rules wanted `PPT_ISSUEDDay`. Only the Year
boxes were matching, by label, which is exactly why the years alone appeared on
the form. This is the third page where that infix has bitten; **check the live id
before trusting a `(Day|Month|Year)` pattern.**

**Column V asks about the visa AND the passport** (*"Has your U.S. Visa /
passport ever been lost or stolen?"*), so it legitimately answers both this
question and the Previous U.S. Travel one - unlike column X, this is not a
conflation. The passport control is `LOST_PPT_IND` and arrives with **no question
text**, so the id carries it alone.

**This page has two country dropdowns** - the issuing authority and the place of
issue - and the home address country on another page shares the same bare
`Country/Region` label. Each is pinned: the passport ones by
`must: /issuance|issued/i`, the home one by `must: /home address/i`.

**"No Expiration"** beside the expiry date is the same kind of box as "Does Not
Apply": the passport has an expiry, so it stays unticked and
`isDoesNotApply()` now recognises that wording so it is not reported as a gap.

`passportIssuedState` has no source - column AF is one free-text place - so it
keeps an id-only rule and lands in `MISSING_FROM_INTAKE`.

### Passport Book Number is a TICK, and the passport number must stay out of it
The live page filled *Passport Book Number* with `E3291557` - the passport number
copied into a second box. The filed sample reads **DOES NOT APPLY** there: an
Indonesian passport has no separate book number, so the box is left empty and
`passportBookNumberNA` ticks the checkbox beside it. Typing the passport number
there swears to a document number that does not exist.

The cause was a loose label - `/passport.*number/i` matches "Passport Book
Number" perfectly well. The fix is an **anchored label** plus a lookahead on the
id.

**The first fix was `not: /book/i`, and it broke the rule outright** - `not` is
tested against the section, this block's text contains "Passport Book Number", so
`passportNumber` excluded **itself** and the box came back empty on the fixture.
That is the second time in one day, after `vesselName`. It is the single easiest
mistake to make in this file:

> A `not` guard is for **other blocks**. Never name a neighbour in the same one.
> Neighbours are separated by anchored labels, ids, ordering, or a lookahead.

**The node test did not catch it, because it passed no `section`.** `key('tbxPPT_NUM')`
was green the whole time. A guard can only be exercised by a context that
actually contains the words it names - so a rule with `must` or `not` needs a
test that passes the real block text, and the browser fixture is what finds the
rest.

### `LEAVE_BLANK` - boxes we empty on purpose
Once the tick goes on, CEAC greys the text box out. Nothing matches it, so it
would land in "Not recognised" on every Fill and bury the real gaps.
`LEAVE_BLANK` in `matcher.js` names those boxes and `isLeftBlank()` routes them
to **"Left blank on purpose"** alongside the does-not-apply checkboxes - quiet,
but with the id, the same arrangement as `report.deliberate`.

## Address and Phone (added 2026-09-01, at the user's instruction)
Seven answers, all constants except where noted. The live page came back with
Country/Region on `- SELECT ONE -` and the mailing question unanswered, while
Street Address and Primary Phone filled fine.

| Answer | Key | Value |
|---|---|---|
| Home Country/Region | `homeCountry` | INDONESIA |
| Mailing address same as home? | `mailingSameAsHome` | YES |
| Secondary Phone Number | `secondaryPhoneNA` | tick *Does Not Apply* |
| Work Phone Number | `workPhoneNA` | tick *Does Not Apply* |
| Other phone numbers in last 5 yrs? | `otherPhones5y` | NO |
| Other email addresses in last 5 yrs? | `otherEmails5y` | NO |
| Any other websites or applications? | `otherWebsites5y` | NO |

`otherPhones5y` and `otherEmails5y` used to sit in `MISSING_FROM_INTAKE` as
missing *details*. Answered No, there are no details to give, so they moved out.

**`mailingSameAsHome` was already a constant and still came back blank** — CEAC
writes the id without underscores (`rblMailingAddrSame`), so only the label was
matching. It is also a postback, so it lands on its own pass.

**"Does Not Apply" appears on four boxes on this page:** Secondary Phone, Work
Phone, State/Province and Postal Zone. Only the block heading separates them, and
the last two hold correct values — ticking one of those wipes an address that is
right. The two phone rules carry `must: /secondary phone/i` and
`must: /work phone/i`; `test/fake-address-phone.html` asserts the State and Postal
boxes stay untouched.

### CEAC phone boxes take DIGITS ONLY - no leading +
The live page rejected the applicant's own number:

> Primary Phone Number is invalid. Phone number must be 5-15 digits, with no
> spaces or hyphens (-).

The value was `+628195201137810` - **fifteen digits, inside the range, refused
for the plus alone.** CEAC's message is the rule, so no phone value this project
produces carries one any more: `normPhone` returns bare digits, `phoneAsWritten`
strips a `+` off a foreign number too, and `vesselOwnerPhone` lost the `+` the
user had specified for it (the payer block on the Travel page always stored the
same number without one, which was the clue).

`validate()` now treats a phone outside 5-15 digits, or holding any non-digit, as
an **error** rather than a warning - CEAC refuses the page when Next is pressed,
so it is not a matter of taste.

The number above also survives a second look: `628195201137810` is 15 digits
where an Indonesian mobile is 12-13, so the intake cell most likely holds a stray
digit or two numbers run together. That is a separate warning quoting the value,
because guessing which digits to drop from a phone number is not ours to do.

### The address stays one string
The sheet has **only** column Z, `Address` - none of the 95 columns holds a city,
province or postal code. A parser that pulled the city out of the text was built
and **reverted the same day at the user's request**: they arrange City,
State/Province and Postal Zone by hand in CEAC. Do not reintroduce it.

What is kept is `addressHalf()` in `matcher.js`, which wraps the whole address
across CEAC's two street boxes, breaking on a space so nothing is cut mid-word.
The cap is the **real `maxlength` read off Line 1**, and the same cap is used for
both halves so they rejoin exactly. Without it Line 1 went over the limit and the
browser clipped the tail silently - text gone, not merely misplaced. Before that,
both lines also matched `homeAddress` on the label "Street Address", so Line 2
received the whole address a second time.

```
Address: DUSUN 2 RT 14 RW 04 BANGLARANGAN AMPELGADING, PEMALANG
  Line 1  DUSUN 2 RT 14 RW 04 BANGLARANGAN     (32 of 40)
  Line 2  AMPELGADING, PEMALANG
```

`homeCity`, `homeState` and `homePostal` keep **id-only** rules with no source, so
the report names them instead of leaving three boxes silently unexplained. No
label rule: *City* and *State/Province* are word-for-word identical in the U.S.
stay block, and a bare one must stay unclaimed. `homeCountry` does keep a label,
gated by `must: /home address/i`.

### Two reasons a field is empty, and only one is fixable
The popup used to tell the agent to press **Send to extension** again whenever two
or more fields had no value - including `homeCity`/`homeState`/`homePostal`, which
no amount of re-sending will fill. That nags forever and teaches them to ignore
the banner. `popup.js` now splits the list on `MISSING_FROM_INTAKE`: a calm grey
note for what the intake form never collects, the red re-send banner only for the
rest. `popup.html` loads `normalize.js` for that list.

### `\b` does not work after a CEAC id fragment
`/rblAddPhone\b/i` never matches `..._rblAddPhone_0`: the ids end in `_0` / `_1`
and an underscore **is** a word character, so there is no boundary there. Three
rules were written that way and still came back "Not recognised" from the live
page. Use a bare fragment, or `(?=_|$)` if an anchor is genuinely needed.

### A word-boundary escape was once a literal backspace byte
Four rules in `matcher.js` held **0x08** where they should have held the two
characters backslash-b — written that way by an earlier session, because this
machine's shell strips backslashes out of a heredoc even when the delimiter is
quoted, so the escape reached Python as a control character. The regexes then
matched nothing, silently: `ssnNA` and `taxIdNA` had stopped matching by id and
were surviving on their label fallback alone.

`matcher.test.js` now fails on **any** control character in `matcher.js`. When
editing rules from a shell, keep backslashes out of the command entirely —
build them from character codes, or use the file-editing tools.

### What the live page corrected (2026-09-01)
Running it against the real CEAC page found four things the fixture had not:

1. **`prevStayUnit` skipped as "already has a value".** The Length of Stay
   placeholder is `<option>- SELECT ONE -</option>` with **no `value=""`**, so
   `el.value` returns its own text and the field read as answered. `hasRealValue()`
   now treats a placeholder selection as empty — a genuine prior selection still
   skips, so an agent's own choice is never overwritten.
2. **`PREV_VISA_ISSUED_DTEDay` did not match.** CEAC is inconsistent about the
   `_DTE` infix: the visit block is `PREV_US_VISIT_DTEDay`, the visa date
   `PREV_VISA_ISSUED_DTEDay`. The rule accepts both, so Date Last Visa Was Issued
   was never being filled at all.
3. **"Do Not Know" beside the visa number** was reported as a gap.
   `isDoesNotApply()` now reads that wording too — but on the **label only**,
   never on an `_NA` id suffix: `APP_SSN_NA` and `APP_TAX_ID_NA` end that way and
   are boxes we deliberately tick.
4. **Forbidden controls were listed as "not recognised".** `ddlLanguage` was
   already in `FORBIDDEN`; the report just did not distinguish "excluded on
   purpose" from "no rule for it", which buried the real gaps.
5. **An unmatched radio was invisible.** `fillPage` skipped radios when building
   the unmatched list, so a Yes/No question no rule claimed came back blank with
   nothing in the report to say why — that is how the U.S. driver's licence
   question was lost. Unmatched radios are now reported **once per group**
   (`done.add(c.name)` on the miss). Its id is `PREV_US_DRIVER_LIC_IND`, not
   `..._LICENSE_IND`, and the label carries a typographic apostrophe.

The lesson these five share: **a rule that stops matching must be loud.** Prefer
reporting a control you cannot place over quietly leaving it alone. `usDriverLicense`
comes from intake column N.

`test/fake-prev-us-travel.html` now carries the live page's ids and reproduces
its label for the Do-Not-Know box verbatim
(`Do Not Know Visa Number Do Not Know`), so these do not regress.

**Still not implemented from that sample:** `Primary Occupation`
(`ddlPresentOccupation`, the printed sample shows OTHER + SAILOR OS) and
`Passport Book Number NA`. Everything else on that list has since been
implemented at the user's instruction - the manning-agency block, Passport Type,
secondary/work phone, the ever-in-US questions, parents in US, monthly salary,
clan/tribe, languages, military, the U.S. contact relationship.

## Sign and Submit (2026-09-01, at the user's instruction)
Three answers on the signature page, and **nothing else on it is touched**.

| Question | Key | Source |
|---|---|---|
| I certify I have read the FGM/C Fact Sheet | `fgmcFactSheet` | constant, ticked |
| Did anyone assist you in filling out this application? | `preparerAssisted` | constant NO |
| Enter your Passport/Travel Document Number | `passportNumber` | column, re-entered |

`preparerAssisted` = NO because CTI transcribes the answers the seafarer gave on
the intake form, which is not what CEAC means by an assisting preparer. If
someone genuinely filled the form in for them, answer Yes and name them.

The e-signature box is the passport number a second time, and its id is
**`PPTNumTbx`** - no underscore, so `/PPT_NUM/i` misses it entirely. Both
spellings are matched now. The lookahead that keeps the rule off the Book Number
box is carried on both.

**The ids on this page have no `FormView1` segment.** Two of the three are
`ctl00_SiteContentPlaceHolder_*` directly and the third is `FormView3`. Rules
here match bare fragments; nothing may be anchored to the usual prefix.

### What is never touched, and why
- the **CAPTCHA** - `/codetextbox/` in `FORBIDDEN`. Automating it is off the
  table, full stop;
- the **Sign and Submit** button - `/sign(and)?submit/`, `/btnsign/`. Signing is
  the applicant's act under penalty of perjury, and it is not ours to perform.

`test/fake-sign.html` carries the live ids and asserts both stay untouched -
that is what the fixture is for, more than the three fills. Verified in a
browser: three answers in one pass, CAPTCHA empty, zero postbacks, nothing
unrecognised.

## The payer block has no usable labels
On the live page `deriveLabel` returns **nothing** for the paying-company
controls, so the id is the only signal there. Three rounds of guessed ids all
missed; the real ones are `tbxPayerName`, `tbxPayerPhone`,
`tbxCompanyRelation`, `tbxPayerStreetAddress1/2`, `tbxPayerCity`,
`tbxPayerStateProvince`, `tbxPayerPostalZIPCode`, `ddlPayerCountry`.

The lesson that keeps repeating: **the popup's unrecognised list is the cheap
way to get real ids.** Guessing them has never once worked.

Its `cbxDNAPayer*` "Does Not Apply" boxes must stay unticked, because we fill
the state and postal code beside them. `isDoesNotApply()` keeps them out of the
unrecognised list — leaving them alone is the correct action, not a gap.

## Dropdown wording differs from the printed application
The printed DS-160 says `COMPANY/ORGANIZATION`; the CEAC dropdown says
`OTHER COMPANY/ORGANIZATION`. `setSelect` therefore falls back to a
containment match - but **only when exactly one option qualifies**. Choosing
between two plausible options is guessing, and this is a visa form.

When nothing matches, the skipped entry carries `wanted` and the page's actual
`options`, and the popup prints them. That turns "no matching option" from a
dead end into the exact list needed to correct the constant once.

## A setter has three outcomes, not two
`setText`/`setSelect`/`setRadio`/`setCheckbox` return `set`, `same` or
`nomatch`. Collapsing `same` into failure meant a second press of Fill
reported five correctly filled address boxes as "no matching option /
unchanged" and outlined them amber - telling the agent the page was broken
when it was finished. `report.already` carries them, and the popup says
"This page is already complete" when that is all there is.

A deferred postback control that is already correct fires no postback, so it
is recorded rather than reported as pending: the agent is not told to press
Fill again for a page that is done.

## Address rules are pinned to their block
DS-160 repeats **"Street Address (Line 1)"** word for word in at least four
places: the home address, the address where you will stay, the U.S. contact,
and the paying company. A rule keyed on that label alone wrote the seafarer's
Indonesian home address into *Address Where You Will Stay in the U.S.* on a live
application - the worst class of bug this project can produce, because it fills
something wrong rather than leaving it empty.

`content.js -> blockLabel()` gives every control the heading of the block it
sits in. Two details matter:

- The heading is usually **outside** the block's own table (a `<legend>`, or the
  element just before it), so taking only the block's own text misses the very
  words that identify it.
- The search stops at an ancestor holding 3-14 controls. Any wider and the
  "block" is the whole page, which would start excluding everything.

`matchKey()` tests `not` and `must` against id + name + label + **section**, but
`labels` against the label only. Context may rule a match out or in; it may
never be the thing that finds one. Broad text can then only ever cost a match,
not invent one.

## Rules are type-aware
`matchKey()` only applies a rule to the kind of control it describes
(`yesno` -> radio, `checkbox` -> checkbox, `text`/`date` -> everything else).
Without that, Personal 2's "Are you a permanent resident of a country/region
other than your country/region of origin **(nationality)** indicated above?"
matched the `nationality` TEXT rule on wording, so the filler handed
"INDONESIA" to a Yes/No group and silently did nothing. Keep `kind` accurate on
every rule — it is load-bearing, not documentation.

`questionText()` reads the control's **own** row before the rows above it: a
"Does Not Apply" box is named by the first cell beside it ("U.S. Taxpayer ID
Number"), and looking upward first ticked the previous field's box.

## Do not reintroduce a hand-maintained key list
The popup used to show "N constant answers included" from a `CONST_KEYS`
array copied by hand from `constants.js`, and staleness was judged by a
`RECORD_V` number bumped by hand. Both drifted: five stay-address constants
were added without touching either, so the popup reported a record as current
while five fields on the Travel page silently had nothing to fill, and the
agent was left staring at empty boxes with no explanation.

Staleness is now read off the fill report itself — a skipped field whose reason
is `no value in record` is the ground truth, and the popup says plainly that the
applicant needs re-sending. That cannot drift, because it is measured rather
than declared. `RECORD_V` survives only as a coarse check for records that
predate the field entirely.

## Record versioning
Records handed to the extension carry `_v` (`RECORD_V`, currently 2 = includes
constant answers) and `_sentAt`. The popup shows a red banner when `_v` is
behind, because a record sent before a feature existed silently lacks its
fields. Bump `RECORD_V` in **both** `app.js` and `extension/popup.js` whenever
the record shape grows.

## Matcher status
`extension/matcher.js` seed rules are keyed on CEAC id fragments
(`tbxAPP_SURNAME`, `ddlDOBDay`, `tbxPPT_NUM`, …) with visible-label fallback.
**These were written without a live DS-160 session open** — the first real run
should use the popup's *Copy page map* and fold the real ids back into `RULES`.
Per-field overrides learned in the popup already win over the seed rules, so a
wrong seed degrades to "not filled", never to "filled wrong".

## Constant answers (`constants.js`)
DS-160 asks questions the intake form does not. For Indonesian seafarers most
have the same answer every time, but they are still **answers on a visa
application**, so they are held in the open: every one is listed in the
worksheet's *Constant answers* panel with its DS-160 page and the reason,
each is individually switchable (Yes / No / leave to the agent), the choices
persist in `localStorage`, and each applicant's detail view repeats them under
*Constant answers — not from the seafarer*. `apply()` never overwrites a value
that came from the seafarer.

Decided with the user 2026-08-31 after the first live CEAC run.

### The Security and Background sweep
`securityAllNo` (default on, **explicitly requested by the user** after the
concern was raised) answers **No** to every unanswered two-option Yes/No group
on the five Security and Background pages. Guards:
- only fires when `isSecurityPage()` matches `complete_securityandbackground.aspx`
  or a "Security and Background" heading;
- skips any group already answered, any group that is not exactly two options,
  and anything `FORBIDDEN` catches;
- sets `.checked` **without dispatching events** — those radios carry
  `__doPostBack` so a Yes can reveal an explanation box, but No reveals nothing
  and the value rides the form post anyway. Firing it would reload the page once
  per question;
- outlines every answer in amber and lists the question text in the popup report,
  so the agent reads them before clicking Next.

`test/fake-personal1.html`, `fake-personal2.html`, `fake-travel.html`,
`fake-prev-us-travel.html`, `fake-address-phone.html`, `fake-passport.html`,
`fake-us-contact.html`, `fake-family.html`,
`fake-crew-visa.html`, `fake-family-spouse.html`, `fake-sign.html`, `fake-work-education.html`, `fake-prev-work-education.html`, `fake-additional-work.html` and
`fake-security.html` are stand-in DS-160 pages for driving the filler in a
normal browser (the Travel one uses deliberately unknown ids, so it proves the
label matching alone); `content.js` exposes `window.DS160Filler` for them (isolated
world, so it is not reachable from ceac.state.gov). They cache-bust the filler
scripts — without that the browser serves a stale `content.js` and a fix looks
like it did not work.

## Known Gaps
- Intake form does not collect: vessel name, US point of contact, intended
  arrival date, US address, who pays for the trip, other emails/phones in the
  last 5 years, and **none** of the DS-160 Security & Background questions.
  Listed in `MISSING_FROM_INTAKE` and surfaced per applicant.
- One free-text `Name` column: the Surname / Given Names split is a guess for
  multi-word names and always warned about. Mononyms use the FNU convention.
- One `Address` column: DS-160 wants street/city/state/postal separately.

## Testing
```bash
npm test   # 9 suites; auth.test.js checks the sign-in gate's invariants
```
`test/make-fixture.py` regenerates `test/fixtures/sample.xlsx` (stdlib only).
The unzip half needs a browser, so it is checked by loading that fixture in
the app rather than under node.

## The logo
`assets/logo.png` is the app mark - a rounded-square icon with its own dark blue
ground, a US flag, a form and a pencil. It is the favicon on both HTML pages, the
Chrome toolbar and extensions-page icon, and the header mark on the worksheet and
in the popup.

Three details worth keeping:

- **No plate behind it.** The old header mark was a red `CTI` chip that needed a
  background; this one carries its own, so `.mark` is just a 32px box with an
  8px radius. It reads correctly in light and dark without a second version -
  checked in both.
- **Width and height are set in the HTML**, so a slow load cannot shift the
  wordmark beside it.
- **Sizes are pre-rendered, not scaled in CSS.** 16 and 32 exist because Chrome
  asks for them exactly; letting the browser downscale a 309px source for a
  16px toolbar slot loses the flag entirely.

Regenerating them, if the source is ever replaced: PowerShell with
`System.Drawing`, `HighQualityBicubic`, onto a transparent bitmap - the command
is in this session's history and takes one call for all five sizes. Rebuild
`favicon.ico` after, with the ICO writer in the same history (stdlib `struct`,
PNG-encoded entries at 16/32/48).

### The tab showed a letter tile while the header logo rendered fine
Three things cause that, and all three are handled now:

- **Chrome asks for `/favicon.ico` before it has parsed a single `<link>`**, and
  a 404 there is remembered. `favicon.ico` is a real multi-size ICO at the repo
  root (16/32/48, PNG-encoded entries - Chrome reads those). `server.js` had no
  `.ico` MIME type either, so it was served as `text/plain`.
- **The favicon cache is separate from the page cache** and a normal reload does
  not touch it. The PNG links carry `?v=2`; bump it if the mark ever changes.
- **Chrome shows NO favicon for a `file://` page**, whatever the page declares.
  If the tab icon is missing, check the URL first - open the worksheet over
  http (`node server.js`, then localhost:7773) or from GitHub Pages.

The extension icons are a different mechanism entirely: Chrome reads
`manifest.json` only when the extension is loaded or reloaded, so a new
`icons` / `action.default_icon` needs **chrome://extensions -> Reload** on the
card. All four files were verified to decode at 16/32/48/128 from the paths the
manifest names.

### A pinned taskbar icon comes from the WEB APP MANIFEST, not the favicon
This is the one that actually produced the "D" tile on the Windows taskbar.
Chrome's *Install page as app* reads `manifest.webmanifest` and takes its
largest `any` icon for the desktop and taskbar shortcut. With no manifest it
generates a letter tile from the title - `DS-160 Worksheet` gives **D**. The
favicon has nothing to do with it.

- `manifest.webmanifest` declares 192 / 256 / 512 PNGs, all `purpose: "any"`.
  No maskable variant: that matters on Android, and adding one here would put a
  flat ring around an icon that already has its own rounded ground.
- `server.js` needed `.webmanifest` -> `application/manifest+json`. Served as
  `application/octet-stream`, Chrome ignores the manifest and the pin falls back
  to the letter again - which is exactly what happened on the first attempt.
- **The icon is baked in when the app is installed.** Fixing the manifest does
  not update an existing pin: it has to be removed and re-installed.
- Install from the **GitHub Pages URL**, not `localhost:7773`. A pin to
  localhost is dead whenever `node server.js` is not running.

Three separate icon mechanisms, then, and each needs its own trigger to refresh:
favicon (cache + `?v=`), extension manifest (Reload on the card), web app
manifest (re-install the pin).

## UI copy
English only.
