# DS-160 Autofill — Project Context for Claude

## What This Is
Cuts the copy-paste work out of filing C1/D (and other) DS-160 applications for
CTI seafarers. Data already exists in the Zoho intake sheet; this project
normalises it, validates it, and fills the CEAC form from it.

No build tools, no framework — plain HTML/CSS/JS, same house style as the J1
Dashboard and the Indonesia Monitoring Dashboard.

## Repository
- **GitHub:** `https://github.com/PutuAstra/ds160-autofill` (to be created)
- **Local:** `C:\Users\putua\ds160-autofill\`
- **Pages:** `https://putuastra.github.io/ds160-autofill/` once Pages is enabled

## File Structure
```
index.html    — worksheet SPA shell
app.js        — CSV parsing, applicant list, detail rendering, extension bridge
normalize.js  — sheet row -> canonical DS-160 record + validation  (SHARED, tested)
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

For now the worksheet loads a **CSV export** — no auth, works offline.

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

## Matcher status
`extension/matcher.js` seed rules are keyed on CEAC id fragments
(`tbxAPP_SURNAME`, `ddlDOBDay`, `tbxPPT_NUM`, …) with visible-label fallback.
**These were written without a live DS-160 session open** — the first real run
should use the popup's *Copy page map* and fold the real ids back into `RULES`.
Per-field overrides learned in the popup already win over the seed rules, so a
wrong seed degrades to "not filled", never to "filled wrong".

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
node test/normalize.test.js   # 36 assertions
node test/matcher.test.js     # 33 assertions
```

## UI copy
English only.
