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
trip.js       — per-applicant travel / U.S. contact details       (SHARED, tested)
letter.js     — C1/D supporting-letter parser + cross-check        (SHARED, tested)
pdftext.js    — minimal PDF text extraction (no library)           (SHARED, tested)
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

## What is constant vs. per applicant
The split matters and the user has corrected it twice, so keep it straight.

**`constants.js` - the same on every application CTI files.** The yes/no answers
the intake form never asks, plus (added 2026-08-31 from the filed sample, at the
user's instruction) two whole blocks that describe the **cruise line, not the
seafarer**: the *Person/Entity Paying for Your Trip* block (COMPANY/ORGANIZATION,
CARNIVAL UK, its phone, EMPLOYER, and its Southampton address) and the *U.S.
Contact* block (XAVIER / MARCOS, DO NOT KNOW, BUSINESS ASSOCIATE, the Plantation
FL address, phone and email). Also `travelCompanions` = NO and the intended
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
2. **Have you made specific travel plans? = NO.** CEAC then drops the flight,
   arrival-city and departure questions and asks only for an *Intended Date of
   Arrival* and an *Intended Length of Stay* (the sample: 8 MONTH(S)). Trip
   fields carry `showWhen`, so the itinerary fields are hidden — and, more
   importantly, `apply()` will not send a value for a question CEAC never asks.

The length-of-stay number and its unit dropdown share one label, so the rules
carry `tag: 'input'` / `tag: 'select'` to tell them apart; `kindAllows()`
enforces it.

**Still not implemented from that sample:** the Crew Visa manning-agency block
(constant: CTI INDONESIA / OKTAVIANIA, DORKAS / JL. HANG TUAH NO.14B RENON,
DENPASAR, BALI 80239 / 085333735407) and roughly 25 further constants
(Passport Type REGULAR, Passport Book Number NA, secondary/work phone NA,
ever-in-US / issued / refused NO, parents in US NO, monthly salary NA,
clan/tribe NO, languages ENGLISH, military NO, Primary Occupation OTHER +
SAILOR OS, US contact relationship BUSINESS ASSOCIATE, …). The user has not
asked for these yet.

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

`test/fake-personal1.html`, `fake-personal2.html`, `fake-travel.html` and
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
npm test   # 8 suites, ~204 assertions + background 9
```
`test/make-fixture.py` regenerates `test/fixtures/sample.xlsx` (stdlib only).
The unzip half needs a browser, so it is checked by loading that fixture in
the app rather than under node.

## UI copy
English only.
