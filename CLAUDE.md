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

## CEAC blocked the agent once - pace accordingly
On 2026-08-31 ceac.state.gov's security service blocked the agent mid
application ("Why have I been blocked?"). The likely trigger was
auto-continue: every postback dropdown reloads the page, and the filler
resumed 400ms later, up to twelve times - a burst of rapid form posts from
one session is the shape of traffic a WAF exists to stop.

Auto-continue is therefore **off unless switched on**, waits 2.5s, and gives
up after 3 passes. Do not tune these back up for convenience. A tool that
gets the agent blocked out of CEAC is worse than one that asks for another
click, because the block costs the whole day's applications, not one page.

If it happens again: stop, do not retry in a loop, and wait it out. Never
work around a block by changing IP, browser or identity - that is evasion of
a security control on a government system, and it is not on the table.

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

**Still not implemented from that sample:** the Crew Visa manning-agency block
(constant: CTI INDONESIA / OKTAVIANIA, DORKAS / JL. HANG TUAH NO.14B RENON,
DENPASAR, BALI 80239 / 085333735407) and roughly 25 further constants
(Passport Type REGULAR, Passport Book Number NA, secondary/work phone NA,
ever-in-US / issued / refused NO, parents in US NO, monthly salary NA,
clan/tribe NO, languages ENGLISH, military NO, Primary Occupation OTHER +
SAILOR OS, US contact relationship BUSINESS ASSOCIATE, …). The user has not
asked for these yet.

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
`fake-crew-visa.html`, `fake-work-education.html`, `fake-prev-work-education.html` and
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
