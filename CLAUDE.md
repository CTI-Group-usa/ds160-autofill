# DS-160 Autofill — Project Context for Claude

## What This Is
Cuts the copy-paste work out of filing C1/D (and other) DS-160 applications for
CTI seafarers. Data already exists in the Zoho intake sheet; this project
normalises it, validates it, and fills the CEAC form from it.

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
xlsx.js       — dependency-free .xlsx reader (ZIP + XML)  (SHARED, tested)
style.css     — all styles, light/dark via CSS variables
server.js     — local static preview on :7773
extension/
  manifest.json  — MV3, host_permissions limited to ceac.state.gov
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
**one** postback control and stops. `autoStep` in `chrome.storage.local` makes
it resume after the reload (max 12 passes).

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

`test/fake-security.html` is a stand-in DS-160 page for driving this in a normal
browser; `content.js` exposes `window.DS160Filler` for it (isolated world, so it
is not reachable from ceac.state.gov).

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
npm test   # normalize 36 + matcher 33 + xlsx 9 + constants 25 assertions
```
`test/make-fixture.py` regenerates `test/fixtures/sample.xlsx` (stdlib only).
The unzip half needs a browser, so it is checked by loading that fixture in
the app rather than under node.

## UI copy
English only.
