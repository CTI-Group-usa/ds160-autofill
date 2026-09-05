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

## The three J1 attachments (`j1docs.js`, 2026-09-04)
A J1 applicant has **three** documents in Zoho Drive, in their own folder
(`My Folders / ... / J1 Visa Attachment`, *not* with the C1/D supporting
letters), in sheet columns **CN, CO, CP**:

| Column | Document | What it gives |
|---|---|---|
| **CN** | DS-7002 (Training/Internship Placement Plan) | the richest by far: SEVIS ID and Program Number **both labelled**, the training dates, the host organisation and its address, the supervisor who is the U.S. contact |
| **CO** | DS-2019 (Certificate of Eligibility) | item 3, *Form Covers Period* |
| **CP** | SEVIS receipt (I-901) | name, SEVIS ID, date of birth — a cross-check, not a source |

J1 answers *specific travel plans* **YES**, so CEAC demands a full itinerary,
and the sheet has **no arrival or departure column at all** (`When did you
arrive in the US?` is 0 of 69 rows). These documents are the only source.

### The parser identifies the document itself
Three links in three columns is a mistake waiting to happen, and feeding a
DS-7002 to a DS-2019 profile would be a silent half-parse. Each form carries a
distinctive title, so `parse` detects which one it was handed. **An
unrecognised document is refused, not guessed at** — a CEAC print-out is the
realistic wrong file, and it is full of the same words.

That also means **one button reads all three**, and the operator never has to
match a link to a reader. They are read in one pass for a second reason: the
DS-2019's period and the DS-7002's training dates describe the *same*
placement, and `compareDocs()` can only compare them if both are in hand.

**DS-7002 first, and the order is load-bearing.** First value wins on merge,
and the DS-7002 labels both identifiers where the DS-2019 labels neither.

### From / To are the itinerary, and here is the evidence
| Source | From / arrival | To / departure |
|---|---|---|
| the blank DS-2019 sample | 05-25-2026 | 05-24-2027 |
| the filed DS-160 (JULIANA) | 24 NOVEMBER 2026 | 23 NOVEMBER 2027 |
| a real DS-7002 | 09/16/2024 | 09/16/2025 |

The first two are one year minus a day, the third exactly a year — the shape a
programme period has. With no column in the sheet, the documents are the only
possible source. Both dates stay **editable**: a participant may enter the U.S.
up to 30 days early, and then the arrival date is theirs.

**The dates are label-anchored, because only the label states the order.** The
DS-2019 prints `(mm-dd-yyyy)` and the DS-7002 writes `09/16/2024`, while
`parseDate`'s default is day-first — the Indonesian convention — so without the
hint `05-12-2026` reads as 5 December instead of 12 May. A test pins exactly
that case, because the samples' own dates happen to be unambiguous.

### THE FORM'S OWN STATIONERY IS SHAPED LIKE A PROGRAMME NUMBER
The first version read the programme number by pattern, on the stated grounds
that *"nothing else on a DS-2019 is shaped like either"*. Every DS-2019 carries
the pre-printed 212(e) endorsement:

> **PHYSICIANS SPONSORED BY P-3-04510 ARE SUBJECT TO** …

`P-3-04510` is **ECFMG's** number, printed whoever the participant is. It was
the **only** `P-n-nnnnn` in the blank sample — the clue, not the reassurance it
was taken for — and a live applicant's form returned it too, against a sheet
saying `P-4-44043`. **The cross-check then reported a mismatch on every form**,
which is how an operator learns to ignore a warning.

Stripped before matching, and **only the number, not the sentence**: the first
attempt took everything up to the next full stop, and that block runs on for
two more clauses without one, so it swallowed whatever followed.

**Labels beat patterns, and it is not a style preference.** The DS-7002 labels
both identifiers, which is why it is read first and why the trap cannot recur
on it.

### Values are cut at the next label, whichever one it is
Extracted text is reading order across a two-column form, so labels interleave
— `Host Organization Name: The Westin Richmond Employer ID Number: 205500685` —
and which label comes next depends on whose software made the PDF. A fixed
order (`letter.js`'s approach, correct for a one-column letter) mis-cuts here.

Two details that took a real document to find:

- **the longest label wins at any position.** `Category` is a substring of
  `Occupational Category`, so a naive scan gives the occupation's value to the
  category.
- **whitespace between the words of a label is optional.** `pdftext.js` joins
  the PDF's text runs with no separator, so a label the form *wraps* arrives
  with the space missing — `Main ProgramSupervisor/POC:`, `Current Field
  ofStudy/Profession:`. Matching literally failed and the value before it
  swallowed the whole supervisor block. **The hand-typed test text hid this,
  because a human types the spaces in** — so the fixture now reproduces the
  glued form verbatim. Do not tidy it.

### One boundary that cannot be found, and is not guessed
The supervisor arrives as `Jackson, SheraeHuman Resources Managersherae.jackson@westinrichmond.com`.
An earlier version pulled the email out and got
`Managersherae.jackson@…` — the job title glued to the front. That boundary is
undecidable: an email local part is letters and so is "Manager". The run is
left **whole**, and the cross-check asks whether column CC's address appears
**inside** it, which is exact in both directions.

### A value that is absurdly long is not that value
One DS-7002 in circulation is an **interactive** PDF whose field values live in
AcroForm objects rather than on the page. The parser identified it correctly and
returned a programme number of **2,700 characters of capitalised attestation
text** — a wrong value, not a visible gap.

- **the two identifiers must match the shape their issuer prints**
  (`P-n-nnnnn`, `N` + digits) and are dropped otherwise. The *sheet* side stays
  tolerant and merely warns, because a person typed that and a person's typo is
  worth showing; a document's own field is not.
- **everything else has a length ceiling.**
- **when nothing required survives, the parser says what to do**: print the
  interactive PDF flat so the values land on the page. The operator has no way
  to know that otherwise.

### What is proven, and what is not
**Proven** — `pdftext.js` reads a real DS-2019 *and* a real DS-7002 (44,390
characters out of the latter, every required field with it). More than the CEAC
print-out managed, which returned zero.

**Not proven** — no real **SEVIS receipt** has been seen. The I-901 email that
was available is only the notification and carries a payment confirmation
number, not the SEVIS ID. That profile's labels are the standard field names,
it is flagged `unconfirmed`, the report says so, and **no pattern fallback has
been added** — that shortcut is what produced the P-3-04510 bug.

Also open: the SEVIS ID does **not** extract from a real DS-2019, which is one
more reason the DS-7002 is read first.

`test/j1docs.test.js` ends with an **end-to-end block over the real bytes** —
`pdftext.js` over any DS-2019/DS-7002/SEVIS PDF in `~/Downloads`, or `J1_DOC=`.
That block is what caught the whitespace bug and the runaway value; the typed
text above it caught neither. The documents are gitignored (`*.pdf`, `*.docx`)
because they are real people's and **this repo is public**.

### What the first live run found (2026-09-04)
Three defects, and all three were **a check speaking about data it should not
have been looking at** - the third time in one day.

**The DS-7002 in circulation is the INTERACTIVE kind.** Its page text is only
the blank form's printed labels, so `Main Program Supervisor/POC` matched and
took the **next label** as its value: `at Host Organization TitleEmail`.
`crossCheck` then reported that the sheet's real contact address did not appear
in it - a mismatch against nothing, on a document the same report had already
called empty.

- **`crossCheck` now returns immediately when `parsed.hint` is set.** That flag
  means none of the required fields survived, which is exactly the condition
  under which no cross-check can mean anything.
- **the hint's reason depends on which document it is.** Blaming the PDF format
  is right where the labels are known good; for the **SEVIS receipt**, whose
  labels have never been checked against a real one, the likely fault is *ours*
  - and "print it flat" would send the operator to do something useless. That
  profile now says so instead.
- **the hint is named and de-duplicated.** Two documents failed the same way in
  one pass and the identical sentence printed twice, unattributed, leaving the
  operator to guess which file to go and fix.

**The report itself then had to be rewritten.** With the false cross-check gone
it was still saying something untrue: it opened *"2 field(s) read from
DS-7002"* on a pass where the DS-7002 gave **nothing** and both dates came from
the DS-2019. That is the merged total attached to the first name in the list -
a count against the wrong document, in the one string the operator sees.

It is **one line per document** now, each saying what that document did:

> 2 field(s) filled. DS-7002: nothing - *(the interactive-PDF hint)*.
> DS-2019: arrivalDate, departureDate. SEVIS receipt: nothing - *(the
> unconfirmed-labels hint)*.

- **`from[k]` records which document supplied each answer**, so a name is only
  credited with what it actually gave.
- the old shape said the same thing about a failed document **three times** -
  in *"not in it"*, as its unconfirmed note, and as its hint - while leaving
  the successful one unmentioned. The unconfirmed note now stands down when the
  hint has already said it.
- **green only when there is nothing to do.** Two documents carrying a hint
  each ask the operator to go and fix something, so a green tick over that
  would be a lie even though the fields that matter were filled.
- one full stop, not two: a hint already ends in one, so joining with `'. '`
  produced *"...read that instead.. DS-2019:"*.


**What still worked, and it is the part that matters:** the DS-2019 supplied the
arrival and departure dates. That is the answer the sheet cannot give at all.

**EVERY DS-7002 IN CIRCULATION IS A FLATTENED FILLABLE FORM**, and the user
confirmed all of theirs report the same way. The values are **not** locked in
form fields - the first wording of the hint said so and was wrong. They are
ordinary page text, drawn inside a **Form XObject per field**. Proved by
building a positioned extractor and running it on the file:

| | x | y |
|---|---|---|
| label, drawn on the page | 39.6 | 698.0 |
| value, drawn in an XObject | **1.0** | **3.5** |

The labels get real page coordinates; the values get **local** ones, because an
XObject's placement lives in the *page* stream and its resource dictionary, not
in the XObject. `pdftext.js` inflates every stream detached from whatever draws
it, so it fundamentally cannot place them. That extractor was **reverted** -
100 lines of parser with no consumer would rot.

Pairing them needs the object graph: xref stream, 13 object streams, page tree,
`/Resources /XObject`, `Do` placement. ~300-400 lines of real PDF parsing, in a
file whose bluntness is a documented choice.

### Why that parser is not being built, measured rather than argued
| | |
|---|---|
| rows carrying a DS-7002 | 67 of 69 |
| rows where it is the **only** itinerary source | **0** |
| SEVIS ID present in column CH | 56 of 69 |
| Programme number in CI | 57 of 69 |

**Nothing the DS-7002 puts on the form is unavailable elsewhere.** Every row
that has one has a DS-2019 too, and the itinerary - the only thing any of these
documents fills - comes from that. So the parser buys a **cross-check**.

The real gap is the **13 rows with no SEVIS ID in column CH**, and that is a
*sheet* problem: thirteen cells, filled once by eye, against four hundred lines
that would need maintaining and could put `Miami Beach` in a date field. That
comparison is the recommendation.

### So a missing cross-check stopped being a failure
The report was putting a **red banner on 67 of 69 rows** for an unreadable
DS-7002 when nothing was missing from the form. Red now means the pass actually
failed - **nothing reached the form, or something disagrees** - and a document
that gave nothing says so calmly, with printing offered rather than demanded.

This is the comma warning a third time: **a red line that is always there and
never actionable teaches the operator to stop reading.**



### One attachment set per class, one code path
`app.js` holds a `DOCS` descriptor: C1/D one link and `letter.js`, J1 three
links and `j1docs.js`. `parse` / `answers` / `crossCheck` / `compareDocs` all go
through it, and only the parser and the wording differ.

**The tab chooses, not the record** — `index.html` says the tab is the authority
for which class is in play.

**`fetchDocs` captures the descriptor once, before the first fetch.** Three
reads at up to 20s each is a long time to hold a tab still, and switching class
mid-run would change what `activeDoc()` returns — so replies would be parsed by
the other class's parser and reported in the other document's words.

**`fetchOne` resolves on failure rather than rejecting**, so one unreadable
attachment does not throw away the two that were fine; the failure is carried
into the report instead. A row missing an attachment is normal and is named
rather than treated as an error.

**Not verified in a browser** — the worksheet is behind the Microsoft sign-in.
`test/trip.test.js` asserts the wiring textually, the arrangement
`auth.test.js` and `extension-auth.test.js` already use.

## The J1 Travel page, from its first live Fill (2026-09-04)
One report - fifteen skipped lines and five unrecognised controls - and it
found four separate faults. Every id below is read off that report, not
guessed.

### A GATE THIS FILE NO LONGER OWNED
`specificTravelPlans` moved to the constants packs on 2026-09-02 (C1/D answers
NO, J1 answers YES) and its default in `trip.js` was emptied. But
`visible(f, v)` kept reading it **from there**, where it is now always `''` -
so **every `showWhen` field was hidden on both classes.**

On C1/D that looked correct: the answer really is NO and those fields really
should be hidden. On J1 the answer is YES, and it silently hid the whole
itinerary. The report read `departureDate - no value in record` **while the
DS-2019 had supplied it**, `arrivalCity` and `departureCity` the same, and the
trip block did not even offer the boxes to type into. **Four of the fifteen
skipped lines, one cause** - and invisible on the class that gets exercised
every day.

`values(rec)` now resolves a gate in precedence order: **this applicant's own
entry** (an operator's answer must beat a constant), then **the record**, then
**the active pack** - asked last and inside a `try`, because `trip.js` is
loaded without `constants.js` in the node tests and a gate lookup that threw
would take the whole record with it.

`GATE_KEYS` is **derived from the field table**, never listed by hand, so
adding a `showWhen` cannot forget to register its gate.

### Column AA is plain English; CEAC's dropdown is a closed set
The report quoted the page back:

> `payerRelationship – no matching option on this page`
> wanted `FATHER`
> page offers: `- SELECT ONE - | CHILD | PARENT | SPOUSE | OTHER RELATIVE | FRIEND | OTHER`

**Not one value in the export is an option:**

| Column AA | Rows | Option |
|---|---|---|
| Father 35, Mother 20 | **55** | `PARENT` |
| Uncle 6, Brother 4, Sister 2, Aunt 1, Cousin 1 | **14** | `OTHER RELATIVE` |

69 of 69, every one leaving a required dropdown unset. `payerRelation()` maps
them, Indonesian wording included (`Ibu`, `Kakak`, `Teman`) because the applicant
fills the intake form in.

**Anything unplaced is passed through, not blanked.** On a closed dropdown an
unmapped word fails either way - but it fails as *"no matching option, wanted
X, page offers ..."*, which is how this became visible at all. `''` would
report *"no value in record"*, which is untrue and names the wrong cause.
C1/D's own `EMPLOYER` constant survives the same way.

### The payer boxes take ONE set of keys, and the class decides the source
CEAC shows one name box, one phone and one email whichever branch of *who is
paying* was answered. C1/D fills them from constants - the payer is the cruise
line - and J1's payer is a **person**, in columns X, Y and Z.

`payerPhone - no value in record` on a row whose column Y holds a number:
`normalize.js` named it `payerPersonPhone` and the matcher looked for
`payerPhone`. **A value sitting in the sheet, landing nowhere, with the report
naming a cause that was not true.**

Derived the same way as the SSN - only the positive case is asserted, so a
sheet without those columns leaves the keys alone and each pack's constants
still fill them. No branch on `_class`, and none wanted.

### Five real ids
| Control | Was | Real |
|---|---|---|
| payer's email | *(no rule)* | `tbxPAYER_EMAIL_ADDR` |
| payer address same as home? | *(no rule)* | `rblPayerAddrSameAsInd` |
| arrival flight | `ARRIVAL_FLIGHT` | **`tbxArriveFlight`** |
| departure flight | `DEPARTURE_FLIGHT` | **`tbxDepartFlight`** |
| places you will visit | *(no rule)* | `dtlTravelLoc_ctl00_tbxSPECTRAVEL_LOCATION` |

`payerAddressSameAsHome` was in the J1 pack from the start; nothing matched the
control. Its Yes is a real postback - it *hides* the payer address block, which
is why none of `payerAddr1..payerCountry` appears in a J1 report at all.

**The payer's email is matched on its id alone.** "Email Address" also labels
the applicant's own box, the U.S. contact's and both additional points of
contact, so a label rule here would be one renamed control away from putting
the wrong address on a sworn form.

### What the J1 Travel page genuinely has no source for
`arrivalCity`, `departureCity`, both flights, the places-to-visit repeater, and
the five stay-address boxes. C1/D fills the stay block from constants (the
cruise line's address); **J1's stay address is the host organisation**, which is
per applicant and which the sheet holds only as one free-text string in column
CA. The user's standing rule for the home address applies here too - they
arrange City, State/Province and Postal Zone by hand, and no address parser is
to be reintroduced.

All ten are in `MISSING_FROM_INTAKE`, which turns a red *"send the applicant
again"* banner - that no re-send could ever clear - into the calm *"the intake
form does not collect this"*. They are reported only when **empty**, so C1/D's
stay constants keep it quiet there.

### `test/fake-travel-j1.html`
The J1 branch is a different *shape* of page, so it has its own fixture, and
the relationship dropdown carries **CEAC's option list verbatim** - that list
is the evidence for the mapping above, so do not tidy it.

Verified: ten fields filled, **nothing unrecognised**, the payer address
question correctly deferred as a postback with `remaining: 0`. The
cross-fixture sweep confirms **no page's unmatched list changed** - only the
filled counts rose, because the sweep record now carries the J1 travel keys.

## The payer's name was the applicant's (2026-09-04, second live report)
The J1 Travel page came back with **Surnames of Person Paying for Trip** and
**Given Names of Person Paying for Trip** holding `PRATAMA` / `PUTU YUDA` -
**the applicant himself** - while column X reads `Ketut Purna Yasa`. The report
listed both as *"Already correct"*.

Worst class of bug this project produces: it fills something wrong rather than
leaving it empty, a filled field is not a gap, and the report **agreed with
it**.

### Two boxes, and there was no key for either
`surname`'s label is `/^surnames/i` and `givenNames`'s is `/^given names/i`.
Both match those labels exactly, and nothing kept them out of that block.
Meanwhile `payerPersonName` was aliased to `payerCompany`, which is the
**single** Name box the COMPANY/ORGANIZATION branch shows - so on this branch
the sheet's value had nowhere to go and the applicant's name had somewhere it
should not.

Column X is split the same way as the applicant's own name - last token is the
surname, a mononym keeps `FNU` in the given box (no "Do Not Know" checkbox sits
beside it, so the relatives' arrangement does not apply) - and `validate()`
names it as the same guess, because it is.

`payerCompany` is kept for the single-box branch, with a **negative lookahead**
on both id patterns: if those two boxes turn out to be `tbxPayerNameSurname`
and `tbxPayerNameGiven`, a bare `/tbxPayerName/i` would put the whole name in
the surname box. A `not` cannot do that job - it is tested against the section,
and this block says "Person/Entity Paying".

**`paying` joined `RELATIVE_OR_THIRD_PARTY`**, which is where `homeAddress` has
carried it since the day its "Street Address" label reached this block, and
`email` now carries it too.

**Their real ids are unknown, and here is why:** the boxes never reached a "Not
recognised" list, because a rule was already claiming them. The two new rules
are label-only - no `must`, because a guard gates the id path too and there is
no id here to rescue it - and the fixture's ids are opaque on purpose, so it
proves the label path, which is the only path the live page has.

### A DROPDOWN'S OPTION LIST WAS IN THE SECTION, AND IT SWITCHED A GUARD OFF
Writing the fixture found something worse than the bug it was written for.
`blockLabel()` built its section from `n.textContent`, which includes every
`<option>`. This block holds the relationship dropdown, whose options are
CEAC's own closed set - `CHILD | PARENT | SPOUSE | OTHER RELATIVE | FRIEND |
OTHER` - so the word **RELATIVE** was in the section of every control in it,
and `RELATIVE_OR_THIRD_PARTY` **excluded itself from all of them.**

Measured on the old code, same label, three contexts:

| Section | Old result |
|---|---|
| empty | `surname` - the live bug |
| the block heading | `surname` - the live bug |
| heading **+ the option list** | `undefined` - the guard fires |

So the guard held on the fixture and failed on the live page: **protective by
accident in test, absent in production, which is the worst way round.** It also
meant the first version of this fixture could not reproduce the bug at all.

`blockText()` walks text nodes and rejects anything inside an `<option>`. That
is the `{...}` stylesheet filter's lesson a second time - this string is read by
every `must` and `not` on the page, so anything swept into it that nobody wrote
as a heading is a coincidence waiting to happen. Options are the whole of a
`<select>`'s text and are read from `el.options` when a value is set, so
dropping them here costs nothing.

**Verified both ways.** With the fix, `travel-j1` fills `payerSurname` and
`payerGivenNames` and nothing is unrecognised. With `matcher.js` reverted and
`content.js` kept, the same fixture fills **`surname = PRATAMA`,
`givenNames = PUTU YUDA`** into the payer's boxes - the live failure, on the
bench. The cross-fixture sweep was run against the committed matcher first and
then against the fix: **all twenty-two other pages byte-identical.**

## A guard held up by string truncation (2026-09-04, third J1 report)
Stripping option text out of the section had a consequence nothing predicted,
and it exposed a defect older than the change.

`purposeOfTrip` carried **`not: /Specify|OTHER/i`**. "Specify" is the label of
the dropdown **next to it in the same block** - the mistake this file records
twice already, under `vesselName` and `passportNumber`:

> A `not` guard is for **other blocks**. Never name a neighbour in the same one.

It looked like it worked. It only worked because CEAC's own option list -
twenty-odd purposes - pushed that word past `tidy()`'s **240-character cut**.
The moment `blockText()` stopped sweeping `<option>` text into the section,
"Specify" fitted inside the window and the rule excluded itself from its own
box. Measured, same label, three contexts:

| Section | Old result |
|---|---|
| empty | `purposeOfTrip` |
| heading **+ the option list**, truncated | `purposeOfTrip` |
| heading + the sibling's label | **`undefined`** |

The live J1 report named it: `dlPrincipalAppTravel_ctl00_ddlPurposeOfTrip`,
unrecognised. **A guard whose behaviour depends on whether a word fell inside
an arbitrary 240-character window is not a guard** - and `travel-noplans` had
been listing that control as unmatched in every sweep, unnoticed, for the same
reason.

Nothing replaced it. Neither id fragment reaches `ddlOtherPurpose`, the label
is anchored and cannot match "Specify", and `specifyPurpose` sits below with
its own anchored label. `/OTHER/i` was guarding nothing the ids do not already
separate - and a bare word like that is exactly what catches an option list,
since OTHER is an option in most CEAC dropdowns.

`test/fake-travel-j1.html` now carries **both** dropdowns with the real
repeater id, and its option list is there because its **length** was what hid
the bug. Do not trim it.

## "Already has a value" was hiding a wrong sworn answer
The same report read:

> `payerSurname – already has a value`
> `payerGivenNames – already has a value`

Those boxes still held `PRATAMA` / `PUTU YUDA` - the applicant's own name, put
there by a pass before the fix above. The filler is right not to overwrite
them: **an operator's own typing must never be replaced.** But the line it
printed is word for word what it prints for an address somebody typed by hand,
so the wrong answer sat on a sworn form looking settled.

The skip now says what is in the box and what the record wants whenever they
differ, and what to do about it:

> `payerSurname` - the box holds "PRATAMA", the record says "YASA" - clear the
> box and Fill again to replace it

Then leaving it is the operator's decision, taken with the disagreement in
front of them, rather than ours taken silently. Two details:

- **it asks the setter's own question.** `findOption()` is lifted out of
  `setSelect` so the report resolves a dropdown exactly as the filler would. A
  select's value is often a code where the record holds the display text (`J`
  against `EXCHANGE VISITOR (J)`), and comparing the two strings directly
  invents a disagreement that is not there - verified on the live purpose
  dropdown, which correctly stays quiet.
- **the wording avoids "no value in record"**, the exact string `popup.js`
  reads as *"stale record, send it again"*. Re-sending would not clear a box
  that is already full, so that instruction would be wrong.

Why this keeps happening, stated once: **a reason that is true of a good page
and a broken one alike is not a reason.** It was the comma warning, the
P-3-04510 cross-check, the repeater note, `no value in record` on a malformed
date, and now this.

## The stay address IS the host company (2026-09-04, user's rule)
Two instructions, one after the other:

> Address Where You Will Stay in the U.S. - **always using host company
> address**
> arrival city dan departure city juga memakai **city dimana host company
> berada**

On J1 the host organisation is also the U.S. point of contact, so **one
free-text cell answers two whole blocks** - and it was reaching **neither**.
The sheet names it `usPocAddress`; the matcher has `usPocAddr1`/`usPocAddr2`
and `stayAddr1`..`stayZip`. A value sitting in the sheet, landing nowhere:
**the third time that exact shape has turned up**, after `payerPersonPhone`
and `payerPersonName`. The U.S. Contact page had been filling name, phone and
email and silently skipping the address.

### The address ban stands; this is a different string
No parser for the seafarer's **home** address. Indonesian free text has no
convention to lean on, one was built and reverted the same day at the user's
request, and it is not coming back.

This is a **US** address, in a column that exists to hold one, and the user has
now twice said what it feeds. There is nothing else to read the city from - the
J1 sheet has no host-city column.

### THE REAL CELLS ARE NOT ONE SHAPE
The first version was a single regex demanding `, CITY, XX 12345`. It matched
the DS-7002's spelling and **refused the sheet's**:

| Source | Written as | First version |
|---|---|---|
| the DS-7002 | `6631 W BROAD ST, RICHMOND, VA 23230` | read |
| **a live sheet row** | `7000 KALAHARI DR, SANDUSKY, OHIO, 44870` | **refused** |

State spelled out **in full**, ZIP behind **its own comma**. So the whole
string went into Street Line 1 and no city was ever produced - the Arrival City
and Departure City boxes stayed empty on a live page, which is what the user
reported. One regex cannot hold both shapes without becoming unreadable, so
`usPlace()` walks the comma-separated parts **backwards**: ZIP, then state,
then city, and whatever is left is the street. That is also why a street
containing a comma survives intact.

**The state is the gate, and how tight it has to be depends on how it is
written:**

| Written as | ZIP | Why |
|---|---|---|
| full name - `OHIO`, `VIRGINIA` | not needed | unambiguous |
| two-letter - `VA`, `MO` | **required** | `ID` is Idaho *and* the code Indonesia is written with |

A probe on the first version read `JL RAYA KUTA NO 12, KUTA, ID` as **Kuta,
IDAHO**, and IN/India, MO/Macao, MD/Moldova, MT/Malta and NE/Niger set the same
trap. Idaho stays in the table - a host company can be in Sun Valley - so what
is refused is the **bare code**, not the state. The comment that had called
that collision harmless was **wrong, and my own probe is what disproved it**.
A country name is not a state either, so `..., KUTA, INDONESIA` is refused too.

`..., KUTA, ID 80361` would still read as Idaho: an Indonesian postcode is five
digits too. So the gate is not the only defence:

- **`validate()` states the place it read, on every row, as a `note`.** Nothing
  is wrong, it fires on every J1 row, it needs no decision - so it must not
  inflate the amber count, which is the trap recorded here for the comma
  warning and the repeater message. What it buys is that a misread address is
  in front of the operator **in words**, not only in five boxes.
- **refusing is the safe direction.** An empty box is a visible gap; a filled
  one is a sworn answer nobody rechecks. A refusal is named, with the value
  quoted rather than a column letter.

### The state code is expanded to the full name
CEAC's State is a dropdown of **full names**, and `setSelect`'s prefix fallback
would answer `MI` with MICHIGAN or MINNESOTA - whichever came first. Picking
between two plausible options is guessing, and this is a visa form. So
`US_STATES` maps the code, and that map doubles as the gate.

Both fixtures now carry MICHIGAN, MINNESOTA, MISSOURI and VIRGINIA together, so
the expansion is what makes the right one land. `fake-us-contact.html`'s State
had **one option** (FLORIDA) and a correct MISSOURI came back "no matching
option on this page", reading as a matcher failure - the same trap already
recorded for `fake-family.html` and `fake-prev-work-education.html`.

### THE OPERATOR STILL WINS ON THE TWO CITIES
`arrivalCity` and `departureCity` are **trip fields**, and `trip.apply()` never
overwrites a value the record already holds. So deriving them onto the record
would make the derivation beat **this applicant's own entry** - exactly
backwards, and the reason trip details are stored per applicant at all. A
participant may fly into a different city.

`normalize.js` publishes **`hostCity`** and trip.js reads it as a fallback:
`from: 'hostCity'` on the field, resolved in `values()` **after** the
operator's own entry and before the pack. `FROM_KEYS` is derived from the field
table, exactly like `GATE_KEYS`, so adding a `from` registers itself.

Verified: with a host address both cities read the host's city; set
`arrivalCity` for that applicant and it becomes LOS ANGELES while
`departureCity` stays put; with no host address both stay empty; and a closed
`specificTravelPlans` gate still keeps them off the page entirely.

End to end on the live cell: `7000 KALAHARI DR, SANDUSKY, OHIO, 44870` fills
both cities with SANDUSKY, and OHIO lands in the State dropdown with MICHIGAN,
MINNESOTA, MISSOURI and VIRGINIA all present beside it. **And the previous
commit's work showed up where it was needed** - Street Line 1 still held the
whole address from before the fix, so the skip read *the box holds "7000
KALAHARI DR, SANDUSKY, OHIO, 44870", the record says "7000 KALAHARI DR" - clear
the box and Fill again* instead of the old, silent "already has a value".

### Two street boxes, two keys, a fixed cap
`addressHalf()` in `matcher.js` reads the real `maxlength` off the box, which is
the right way round, but it spreads **one** record key over two controls.
`stayAddr1`/`stayAddr2` are two separate keys, because C1/D supplies two
distinct constant lines - so `twoLines()` splits here against CEAC's known
40-character cap, breaking on a space. The alternative is the browser clipping
the tail silently, which is how the employer address lost text before anyone
noticed.

### What it does not touch
Positive case only, as with the SSN and the payer keys: an **empty** cell
leaves every key alone, so C1/D's five stay constants - the cruise line's
address - still fill the block and the panel switch stays live.

The six derived keys stay in `MISSING_FROM_INTAKE`, because that list is only
consulted when a key is **empty** - which now means one of two things, no host
address in the sheet or one the reader refused. Both are fixed in the same
cell, and the wording says so instead of claiming the intake form does not
collect it.

### The places-to-visit repeater takes the same city
The user's instruction: *"section ini isi juga dengan city dari host company"*.
So `travelLocation` is the host organisation's city as well.

**It goes in as a ONE-ENTRY LIST, not a plain key**, and that is the whole
design. CEAC shows one Location row plus *Add Another*, and a plain key hands
its value to **every** row the operator opens - so pressing Add Another to add
somewhere else would produce the same city twice, a duplicate on a sworn form,
caused by the button they pressed to fix it. `_travelList` has one entry;
`REPEATED` resolves ordinal 1 to nothing and the row is left alone. `_eduList`
on C1/D is the same arrangement for the same reason.

#### A repeater row past the end of its list is not a gap
Proving that in the browser exposed the trap one more time. Row 2 was left
alone correctly - and reported as **`no value in record`**, which is the exact
string `popup.js` reads as *"stale record, send it again"*. No re-send can fill
a row the sheet has no entry for, so the red banner would have nagged for ever;
the same failure as `prevStayLength`, arriving from a different direction. It
had been true of the education rows all along and nobody had looked.

`beyondList()` in `content.js` routes those to **Left blank on purpose**. An
**empty** list still takes the normal path on purpose: no school at all is a
genuine gap, and filling the sheet and re-sending is exactly the fix.

Verified: row 1 `SANDUSKY`, row 2 empty and reported as deliberate, nothing
unrecognised; on the education page a single-entry C1/D list now puts twenty
row-2-and-3 controls in that list instead of the re-send banner.

#### The guard on REPEATED had to stop being a hand-written list
`matcher.test.js` asserted every repeated key names a field its list carries -
against a hard-coded `['name','address','course','from','to']`. The day a
**second** list arrived it failed on a correct change and said nothing about
why. It reads the fields off `normalize.js` now, by building a record and
looking at what it publishes. **A guard that must be edited every time the
thing it guards grows is a guard that will be edited to shut it up.**

**Still no source on the J1 Travel page:** both flight numbers, and `stayAddr2`
when the host street fits one line.

### The DS-7002 labels the city itself - Section 2 does
The user pointed at the form: *"di ds 7002 section host company terlihat jelas
ada sub section city"*. Section 2 is a table of named cells -

> Organization Name | Phase Site Address | Suite
> City | State | ZIP Code | Website URL

so on that revision **nothing has to be read out of the tail of an address
string**. `j1docs.js` reads those cells, and `arrivalCity` / `departureCity`
are derived from the host city exactly as the dates are derived from the
programme period - they are trip fields, so `applyParsed` stores them as this
applicant's own entry and they stay editable.

**Two measurements shaped this, and both said the same thing: a short label is
not a label.**

`State` on its own matched the **letterhead** first - *U.S. Department of
State* - and `hostState` came back as

> `*OMB APPROVAL NO. 1405-0170EXPIRATION DATE: 05/31/2024ESTIMATED BURDEN: 1.5 HOURS...`

Declaring the longer letterhead as a cut point moved the problem rather than
fixing it: the next match was the sponsor's own attestation, *"could be
expected to bring the Department of State into notoriety or disrepute"*. The
word is all over the prose.

So the profile carries a **`scope`**: `SECTION 2: HOST ORGANIZATION
INFORMATION` through to `SECTION 3`, and `hostStreet` / `hostCity` /
`hostState` / `hostZip` are read **there and nowhere else**. Those keys are
deleted from the whole-document pass before the scoped pass runs, so a match
from outside the section cannot survive.

### THE SCREENSHOT IS OF THE INTERACTIVE ONE
Measured on both DS-7002s on this machine, and it is the thing to understand
before wiring anything else to this document:

| | Section headers | Section 2 values |
|---|---|---|
| the flattened one that parses well | **none at all** | writes a single-line `Address` |
| the **interactive** one | present | **nothing between the labels** |

The interactive file's text is exactly the label run and no more -
`Organization NamePhase Site Address SuiteCityStateZIP CodeWebsite URL` -
because its values live in form objects this reader cannot place. **So the City
cell is genuinely there and clearly labelled, and its value still is not
reachable.** Printing the file flat is what puts it on the page, which is what
that document's hint already says.

The scope therefore never fires on the revision that parses, and
`hostOrgAddress` stays its source. It earns itself the day someone prints an
interactive one flat - and the test pins that case with the label run **glued**
the way pdftext delivers it, because hand-typing the spaces in is what hid the
supervisor bug once already.

**The recommendation against building the AcroForm parser stands unchanged.**
The sheet's own column answers all five stay boxes and both cities today - the
Kalahari row proves it end to end - so the document buys a cross-check, not an
answer.

### Section 4 answers the U.S. Contact page (2026-09-05)
A live report on that page filled the address, phone and email and left the
name and the organisation empty. The user pointed at the form: *"kamu bisa
menemukan informasi ini di DS 7002 ... untuk organization name kamu bisa
menemukan di section phrase information di subsection phase site name"*.

**The sheet's own cell was landing nowhere, again.** `Point of contact` holds a
person and CEAC asks for Surnames and Given Names, so `usPocName` reached no
box at all - **the fourth time this exact shape has turned up**, after
`payerPersonPhone`, `payerPersonName` and `usPocAddress`. Every one of them was
a value sitting in the sheet with the report naming a cause that was not true.

**Three sources, and the order is the design.** These are per applicant on J1 -
the host organisation differs for nearly every participant - so they are trip
fields now:

| | |
|---|---|
| 1 | **this applicant's own entry** - which is also where `applyParsed` stores what the DS-7002 gave, so an operator can correct a document |
| 2 | **the sheet**, through `from: 'hostPocSurname'` / `'hostPocGiven'` |
| 3 | **nothing** - C1/D's cruise-line constants then fill the boxes, because `apply()` skips an empty value and never overwrites a set one |

`usPocOrg` has **no `from`**: the sheet has no host-organisation-name column at
all, which is exactly why the user pointed at the form. It comes from
`Host Organization Name` on the revision that parses, or Section 4's
`Phase Site Name` on the other.

**`usPocOrgNA` is `'NO'` in the J1 pack now, not absent.** Omitting a key is not
the same as answering it: the box reported *"no value in record"* on every J1
row, which is the string `popup.js` reads as *"stale record, send it again"*,
and no re-send could ever clear it. `'NO'` is the `ssnNA` device - it blocks a
default and `setCheckbox` leaves the box clear.

#### THE PROBE CAUGHT A WRONG FILL I HAD JUST WRITTEN
Section 4 labels the supervisor on its own, so the name can be split - unlike
the older revision, where it arrives as
`Jackson, SheraeHuman Resources Managersherae.jackson@...` and the boundary is
undecidable. Only the clean cell is split. That much was deliberate.

What was not: on an **interactive** DS-7002 the page text is the blank form's
labels, so

> `Main Program Supervisor/POC at Host Organization` | `Title` | `Email`

gave `supervisorName = "Title Email"`, which split into **Surname "Email",
Given "Title"** - two capitalised words that no shape check can refuse, heading
for the U.S. Contact page as the contact's name.

**`answers()` now returns nothing when `parsed.hint` is set.** `crossCheck` has
returned early on that flag since the first live run; this is the same gate on
the other side, and it was missing. The dates were safe only because
`parseDate` refuses words - **the moment a document supplied a NAME, luck ran
out.**

Verified in a browser: nine fields fill on the U.S. Contact page, `usPocOrg`
among them, the Do-Not-Know box stays **unticked**, nothing unrecognised. Sweep:
no unmatched drift on any page.

#### The next report left two lines that no re-send could clear
The name filled from the sheet. Two lines remained, and both were asking for
something that cannot help:

**`usPocOrg - no value in record`.** There is no column for it *anywhere* - the
four `Point of contact` columns name the person, the address, the phone and the
email. It joins `MISSING_FROM_INTAKE`, so the popup shows the calm grey *"the
intake form does not collect this"* instead of the red re-send banner, and the
line names both ways to fill it: **press *Read J1 documents*** (Section 4's
Phase Site Name, or Host Organization Name), or **type it once in Trip
details** - the box is there, under a *U.S. Contact* heading, with its hint.

**`usPocAddr2 - no value in record`.** CEAC marks the second street line
*Optional* and `7000 Kalahari Dr` fits the first box with room to spare, so it
is empty **on purpose** - it joins `_blankOnPurpose` alongside `stayAddr2`.
Guarded on the address having been read: with no host address at all these are
honestly missing, and `MISSING_FROM_INTAKE` says so instead. Verified all three
ways - short street, long street (line 2 fills), and no address.

That is the same trap for the sixth time in two days, and worth stating as a
rule: **before writing "no value in record", ask whether re-sending the
applicant could possibly change it.** If not, it belongs in
`MISSING_FROM_INTAKE` or `_blankOnPurpose`, never in the banner.

### A FILLED INTERACTIVE PDF KEEPS ITS VALUES IN NAMED FIELDS (2026-09-05)
The organisation name stayed empty, and the user said again that it is in the
DS-7002. The chain was proved end to end first - parse, `answers`,
`DS160Trip.set`, `apply` - and it works. So the blocker was the document, and
the evidence for that was already in their own reports: `arrivalDate` and
`departureDate` were filled on a sheet that **has no arrival column**, so
*Read J1 documents* had been pressed and the **DS-2019 read fine**. Only the
DS-7002 gave nothing.

Then the measurement that changed the answer:

| | Named AcroForm fields | Carrying a value |
|---|---|---|
| the flattened DS-7002 | **0** | 0 |
| the interactive one | **79** | 0 *(that copy is blank)* |

And the names are not opaque. They are the **printed labels**:

> `Organization Name` | `Phase Site Name` | `City` | `State` | `ZIP Code` |
> `ProgramNumber` | `Phase Supervisor` | `Training Start Date`

**A name beside a value is a label beside a value**, which is the one thing
this project can always work with - and it is a completely different problem
from the XObject geometry that was refused. No object graph, no placement, no
guess about position.

So `pdftext.js` gained `formFields()` (read `/T` + `/V`, inflating object
streams because that is where they live) and `formText()` (lay the pairs out as
`label value`), and `app.js` appends that **after** the page text. A flattened
document is unaffected - first value wins - and **a blank form contributes
nothing at all**, because a value-less field is skipped rather than emitted as
a bare label for the parser to mistake for a value.

`formText` puts the **Section 2 markers back** around `Organization Name`,
`Suite`, `City`, `State`, `ZIP Code`, `Website URL`, `Employer ID Number` and
the two address lines. That is where those cells are on the form, and `scope`
reads the short labels there and nowhere else - without the markers the scoped
pass never fires and all four are dropped.

#### Two defects its own tests caught before they shipped
**Every field took the previous object's value.** The first version used a
fixed ±600-character window around each `/T` and took the first `/V` in it. A
window wide enough to hold one dictionary is wider than the gap between two, so
on a file with 79 fields **all 79 would have been wrong** - filled, plausible,
and invisible. It collects every name and every value first and pairs each
value with the **nearest name that has not already claimed one**: no nesting to
track, no window to tune, right whichever order the writer used.

**Three wrong assumptions in the first probe**, all found by running it rather
than reading it: `readLiteral`/`readHex` return `.value`, not `.text`; their
index must be *after* the opening delimiter; and `inflateStreams` is **async**,
so a missing `await` left only the raw bytes searched - which reported **zero**
named fields on a file that has seventy-nine.

#### And a wrong value that reached the required list
Adding the AcroForm names as cut points changed where values cut on the blank
form, and `Training/Internship Dates` came back as
`(mm-dd-yyyy)FromToSECTION 2: HOST ORGANIZATION INFORMATION`. That counted
towards `required`, so the document **stopped reporting itself as unreadable**.
`SHAPES.trainingDates` now demands two digits with something between them - a
date range has digits in it.

#### What this does and does not settle
It settles a **filled** interactive DS-7002: its organisation name, host city,
state, ZIP and supervisor now read exactly, with no mapping table.

It does **not** touch the flattened kind, whose values are XObject page content
- those still need printing flat, and the hint still says so.

### THE DURABLE FIX IS A COLUMN, AND IT IS ALREADY WIRED
The report came back with the organisation name still empty. Two things are
worth separating, because only one of them is a defect:

- **Reading the documents does not re-send the record.** `applyParsed` calls
  `rebuild()`, which redraws the worksheet - the extension still holds whatever
  was sent before. So the order is **Read J1 documents, then Send to
  extension, then Fill**, and a record sent first will not carry what the
  documents gave.
- **Everything else on that page now fills from the sheet**, including the
  contact's name, which is what proves the `from` chain works end to end in a
  browser.

Both remaining routes depend on something outside the sheet - a document that
may not parse, or an operator remembering to type. **A column removes both.**
`hostOrg` is mapped under six plausible header spellings - `Host organization
name`, `Host Organization`, `Host company name`, `Host Company`, `Name of host
organization`, `Organization name` - and `usPocOrg` reads it through `from`, so
the day that column exists it fills for every row at once, and the operator's
own entry still wins over it.

Matching is on header **text**, so where the column sits does not matter. This
is the same trade as the thirteen SEVIS cells: one column filled by hand beats
a reader that has to be maintained.

### The report now says which kind of document it was handed
The operator reloaded everything, read the documents and re-sent, and the box
was still empty - which is a fact about their DS-7002 that nothing on screen
was reporting. A document that gives nothing is one of **two** different
documents and they look identical from the outside:

| What the file has | What to do |
|---|---|
| named form fields, **none** carrying a value | its values are page drawings this reader cannot place - **print it flat** |
| no named fields at all | the same, from the other direction |
| named fields **with** values | they are readable, and anything still missing is a label this profile has not been taught - **a fixable** |

The hint line now carries the count: *"(no form field in it carries a value)"*
or *"(N form field(s) in it do carry a value - tell Claude)"*. That is the same
discipline as the popup's unrecognised-id list - **guessing what a document
contains has never once worked here, and asking it has.**

`formFields` rides from `fetchOne` through the per-document list to the report;
`trip.test.js` asserts that chain textually, because the worksheet is behind
the Microsoft sign-in.

### THE REAL REASON FOUR ROUNDS WERE WASTED: THE CACHE TOKENS
The operator reloaded, read the documents, re-sent, and the box stayed empty -
four times. The cause was not the document. **Six shared files were changed on
2026-09-05 and not one `?v=` token was bumped**, so the browser went on serving
the previous day's `pdftext.js`, `app.js`, `trip.js` and `normalize.js`. The
code being debugged was never running.

This file already warned about it, in the hard-refresh section, and it happened
anyway - because the tokens were **per file and dated by hand**
(`20260831t`, `20260902tabs`, `20260904j1docs`), so keeping them right meant
remembering which of eleven tags to edit on every change. **A token that is
only sometimes bumped is worse than none: it makes the cache look managed.**

Every asset in `index.html` and `login.html` now carries **one** token, and
`auth.test.js` fails if they are ever not all identical - proved by breaking
one on purpose. One string, one edit to release, and no file can be left
behind.

The hard-refresh button remains the operator's answer to a stale asset; the
token is the developer's, and it was the half that was missing.

#### And the answer to "why is this so hard - you got Hannah Berkey easily"
Because **`Hannah Berkey` never came from the DS-7002.** It comes from the
sheet's `Point of contact` column, split into Surnames and Given Names. The
organisation name two lines below it on the form has **no column at all**, so
it is the one value on that page that has only ever had the document as a
source - and the document has not been read successfully once. The two look
adjacent on paper and come from opposite places.

### A DOCUMENT THIS ROW HAS NO LINK TO WAS DROPPED IN SILENCE
Six rounds went into the organisation name. The cause was not the parser, the
matcher, the trip field or the cache token. `docLinks` read:

```js
/* ...a missing one is skipped with a NOTE rather than treated as a failure. */
const docLinks = (doc, rec) =>
  doc.links.map(l => ({ name: l.name, url: rec[l.key] })).filter(l => l.url);
```

**There was no note.** A row whose DS-7002 column is empty produced a report
with no DS-7002 line *at all* - not "nothing was read", not "no link", simply
nothing - while the operator, looking at the document in Zoho Drive, had every
reason to believe the tool had it. Every fix shipped in those six rounds was for
a document that was never fetched.

A comment describing behaviour the code does not have is worse than no comment:
it is the one place anybody looks to check.

The absent documents are carried through with no url and **named in the
report** - *"DS-7002: this row has no link to one - paste it below, or fill its
column in the sheet"* - and `anyAbsent` keeps the report from going green over
it. `letterBox` filters them out again, because a link with no url is not
something to render.

**Everything before this still stands** and none of it was wasted - the
AcroForm reader, the Section 4 labels, the `from` chain, the one cache token.
But the order was wrong: **before improving how a document is read, prove the
document arrives.**

### THE VALUE OF A FILLED FIELD IS OFTEN NOT `/V` - IT IS DRAWN
With the report finally saying something, the row came back:

> DS-7002: nothing - ... **(no form field in it carries a value)**
> DS-2019: arrivalDate, departureDate

All three links present, the DS-7002 fetched and correctly identified, and not
one field carrying a value - on a form the operator can see is full.

**That count was measuring the reader, not the file.** `formFields` read `/V`
and nothing else. A widget looks like this, and a blank template carries
neither entry:

```
42 0 obj <</FT/Tx/Rect[...]/Subtype/Widget/T(ProgramNumber)/Type/Annot>>
```

Fill it in and Acrobat writes `/V (P-4-44043)` **and** an appearance stream.
Several other writers - and any form flattened on save - write **only** the
appearance: `/AP<</N 91 0 R>>`, object 91 being a small content stream that
draws the text.

`/AP /N` is an object reference, and **streams cannot live inside object
streams**, so the widget may be compressed while the appearance it points at is
always in the plain bytes. Name and value in one dictionary: no page tree, no
coordinates, no guess about position. **It is a different problem from placing
an XObject on a page**, which is still refused - the earlier 300-400 line
estimate was for that one, and it does not apply here.

`appearanceText()` resolves the reference, inflates the stream and runs
`textFromContent` over it. `/V` still wins where it exists; a field with
neither stays empty; both real DS-7002s on this machine are unchanged, one
having no fields at all and the other being a genuinely blank template.

### `its 1 form fields` - AND THE REPORT STILL TOLD THEM THE WRONG THING
The next report read:

> DS-7002: nothing - ... **(its 1 form fields are all empty** - no typed value
> and nothing drawn in them - so this looks like a blank copy of the form...)

**One.** The blank template measured here has **79**. A file with one stray
`/T` is not an AcroForm at all - it is a **flattened** document, and "a blank
copy, check the link" sent the operator to check a link that was never wrong.
The threshold is `nf >= 10` now, and anything below it is named as flattened.

Two wrong conclusions in two rounds, both from the same habit: **reading a
count as if it answered a question it was not measuring.**

### THE REPORT ASKED FOR THE EXTRACTED TEXT AND GAVE NO WAY TO SEND IT
The SEVIS receipt's own hint has said, all along, *"Send the extracted text and
they can be corrected."* Nothing in the app produced it. That is `docLinks`'
phantom note a second time - **an instruction the code does not implement** -
and it is the single thing that would have ended six rounds in one.

**Copy what the documents said** puts every document's extracted text on the
clipboard, each headed with its name and character count. A document that gives
nothing is either laid out in a way these labels do not match - fixable in one
round, from the text - or genuinely empty. Nobody can tell which by looking at
the PDF, and until now nobody could look at anything else.

**The lesson, and it is the same one three times now:** when the tool says it
cannot read something, the next move is to make the tool show what it *did*
read. Every real CEAC id in this project came from the popup's unrecognised
list; every real document label should come from the same place.

### THE ANSWER WAS IN THE DOCUMENT THAT WORKED ALL ALONG
One paste of the extracted text ended it. Two things were immediately visible.

**The DS-7002 cannot be read by labels, and never will be.** Its flattened
layout prints every label in one block and every value in another, in a
different order:

> ...`StipendYesNoIf yes, value?per` | `Intern` `Putu Yuda  Pratama` `Diploma`
> `7000 Kalahari Dr.` `OH` `44870` `Kalahari Resort Sandusky OH` `Alliance
> Abroad` `Sandusky`...

Nothing can pair those. Six rounds of profile work went at a document whose
shape forbids it.

**The DS-2019 prints the same fact beside its label:**

```
Primary Site of Activity:Kalahari Resort Sandusky OH7000 Kalahari Dr.Sandusky, OH 44870
```

`siteOfActivity` is read there, and `usPocOrg` follows. The DS-2019 has read
correctly since the day it was wired - **it supplied the arrival and departure
dates in every one of those failing reports.** The answer was in the document
that was working, and nobody looked because the question had been framed as
"why won't the DS-7002 read".

The name arrives glued to the address, because the form prints them on three
lines and the extracted text has no line breaks. **A US street address begins
with its number**, so the name is what comes before the first digit - a rule
about American addresses, not a guess about this one.

### THE SEVIS RECEIPT IS CONFIRMED, AND EVERY GUESSED LABEL WAS WRONG
The same paste carried a real I-901 receipt, the thing this file has been
waiting for since the profile was written.

| Guessed | Actually |
|---|---|
| `SEVIS ID` | **`SEVIS IDENTIFICATION NUMBER`** |
| `Name` | **`APPLICANT`** |
| `Payment Confirmation Number` | **`CONFIRMATION NUMBER`** |
| `Date of Birth` | `DATE OF BIRTH` - the only one right |

**Not one of the invented labels would ever have matched**, and the profile
said so: it carried `unconfirmed` and the file forbade a pattern fallback
behind it. That flag is why nothing wrong was ever filled from this document -
had a pattern been added "to make it work", it would have been reading a
receipt through labels that matched nothing. The flag is gone now, on evidence.

The receipt also prints the programme number **without hyphens** - `P444043`,
the issuer's own format, not a typo - so `SHAPES.programNumber` accepts the
compressed form and writes it back hyphenated, the same repair `normProgram()`
already makes on the sheet's copy.

**The rule this whole sequence earns:** when a document will not read, the
first question is not *how do I parse it better* but **which document actually
has this, and does that one already read.**

#### A conclusion that was nearly published wrong
Under the `/V`-only reader the next step was going to be a report line saying
*"this looks like a blank copy - check the link"*. For any form filled by
drawing that sentence is **false**, and it would have sent the operator hunting
a file that was never the problem. It is only safe now because both places a
value can live are read - and the comment beside it says so, which is the
lesson from `docLinks` one section above.

## The visa-class banner in the popup (2026-09-04)
`apply()` stamps `rec._class`, and the popup now shows it as a coloured chip
above the applicant's name. **That half is decoration.** The half that earns it
is the mismatch warning:

> **This page belongs to a different visa class.** The applicant loaded here is
> **C1D**, but this is a **J1** page.

Because *that* is the failure worth catching. A C1/D record on a J1 application
writes the cruise line's U.S. contact and the manning agency into boxes that
accept them without complaint, and **a filled field appears in no report**.

### The page's class comes from the rules that fired
`CLASS_ONLY` in `matcher.js` names the keys that exist on one class's pages
only - the vessel and manning-agency block for C1/D, SEVIS / programme number /
intend-to-study for J1 - and `fillPage` counts which sets matched. **No URL and
no page heading is guessed**, and only *matched* keys count: the vessel-name and
IMO ids are still unknown, so counting unmatched controls would make the whole
thing rest on a guess.

Three rules it follows:

- **counted on the match, not the fill.** A Crew Visa page whose boxes are all
  already correct is still a Crew Visa page.
- **one class only, or nothing.** Most of the form - Personal, Passport, Family,
  Address, Security, Sign - belongs to no class at all and must not be labelled;
  and if both sets fired, that is a contradiction rather than an answer.
  Verified: Crew Visa → `c1d` (11 keys), Student/Exchange → `j1` (3), Personal 1
  → **null**.
- **an unstamped record is never guessed at.** An older record predates
  `_class`; the chip says *not stated*, and the mismatch check stands down.

`matcher.test.js` asserts the two sets are disjoint - an overlapping key would
make a page report both classes, which `fillPage` answers with silence, so the
guard would quietly stop guarding - and that every key named has a rule that can
actually produce it.

## Student / Exchange Visitor - J1 only (2026-09-04)
CEAC shows this page for a J class and never for C1/D, so nothing on it can
collide with the seafarer side. Labels taken verbatim from the filed sample:

| Question | Key | Source |
|---|---|---|
| SEVIS ID | `sevisId` | column **CH** |
| Program Number | `programNumber` | column **CI** |
| Do you intend to study in the U.S.? | `intendToStudy` | constant **NO** |

**Three rules, matched on the label alone, and no id guessed.** Those labels
appear nowhere else on the form, so no `must` guard is wanted - an unnecessary
guard is what killed `eduCountry` and both `spousePob` rules, because `must`
gates the id path too.

### The sheet drops the hyphens CEAC requires
Column CI writes the programme number two ways: **30 rows as `P-3-05133`, 18 as
`P305133`**. The compressed form maps onto the hyphenated one unambiguously - P,
one category digit, five digits - so `normProgram()` repairs it.

Seven rows hold things no pattern can repair (`PL52-449`, `J 1 PROGRAM`, a bare
`-`, two floats). Those are **passed through as written, not dropped**: `''`
would leave the box empty with the sheet's own value nowhere in sight, whereas
filled-and-flagged lets the operator see the cell and CEAC rejects a malformed
number itself. Whitespace is stripped only to *match*, so `J 1 PROGRAM` keeps
its spacing and stays recognisable on screen. `normSevis` is loose for the same
reason - an over-strict pattern would drop a real id.

### A point of contact who is the applicant is not a contact
Column CD is the additional point of contact, and **two of the 69 rows hold the
applicant's own name, address, phone and email** - the intake form was filled in
wrongly. On the filed sample that row is exactly one of the two, and whoever
filed it substituted the host school's contact instead of using the cell.
`validate()` names it.

The keys are `addPoc2*`, not `addPoc*`: the J1 pack carries **Name (1)** as
constants (CTI Indonesia), so the sheet's contact is CEAC's second block.

### THE ADDITIONAL POINT OF CONTACT BLOCK HAS NO RULES, ON PURPOSE
CEAC takes **two** contacts there and every sub-label is shared between them -
Street Address, City, State/Province, Postal Zone/ZIP Code, Country/Region,
Telephone Number, Email Address. A label-only rule matches **both rows** and
would write CTI Indonesia's address into the second contact's boxes. Only the
repeater id prefix can separate them, the way `dtlPrevEmpl` does on Previous
Work, and that prefix is unknown until one live J1 Fill reports it.

`test/fake-student-exchange.html` carries **both** rows for exactly this reason.
Do not "fix" it by deleting the second one; it is what makes the leak provable.

### What that fixture found immediately
`homeAddress` and `email` had no guard that reached this page and claimed **four
boxes across the two contact blocks** - the applicant's own address and email in
a stranger's contact details. Filled, plausible, wrong, and invisible, because a
filled field is not a gap.

`surname` stood aside only because the fixture's invented id contains `AddPoc`,
which the old guard's `POC` matched. **Luck, not protection** - the real CEAC id
may carry no such letters.

All four now share `RELATIVE_OR_THIRD_PARTY`, with **two independent guards**
because either one can be out of reach:

- **`point of contact`** is in the block heading - but `blockLabel()` prefers a
  `<legend>`, and this page's legends say only *Name (1)* / *Name (2)*, so on a
  page laid out that way the heading never reaches the section;
- **`exchange`** comes from `pageTag()` - the page heading plus `?node=` - which
  is reachable however the block is nested.

None of these fields exists anywhere on that page, so excluding the whole page
costs nothing. The browser fixture exercises the `exchange` path; `matcher.test.js`
asserts the no-legend path by passing that section explicitly.

### `test/sweep-fixtures.html` - the cross-fixture sweep, as a file
Adding a `not` guard to a widely-shared rule can silently stop it matching on a
page nobody was looking at, and the node tests cannot see that because they pass
their own contrived sections. The sweep loads **every** `fake-*.html` in an
iframe, fills each with one full record, and reports what each matched.

Run it, change the rule, run it again: every page's lists must be identical
except the one you meant to change. It is how these four guards were cleared -
before, `student-exchange` filled `email, email, homeAddress, homeAddress`; after,
`intendToStudy, programNumber, sevisId` and eighteen honestly unrecognised boxes,
with all twenty-one other pages byte-identical.

CLAUDE.md records this being done by hand twice. It is not part of `npm test` -
it needs a browser and `node server.js` - and **PAGES must be kept in step with
`test/fake-*.html`**, because a page missing from that list is a page whose
regressions it will not catch.

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
- the Additional Point of Contact block on the Student/Exchange Visitor page -
  blocked on one live J1 Fill report, see below.
- **one human check**: press *Read J1 documents* on a real row. It needs the
  Microsoft sign-in, and it settles the last open question - whether a real
  SEVIS receipt matches the labels that profile assumes.

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

### The hard refresh button (2026-09-04)
A normal reload revalidates the HTML but is free to hand back the cached
`app.js`, and the script tags carry their own `?v=` tokens - so a deploy that
changed a file **without** bumping its token keeps serving the old one, and the
fix looks like it did not work. That has cost this project several rounds of
"reload the worksheet".

The icon button in the header re-fetches every asset the page loaded with
**`fetch(url, {cache: 'reload'})`** and then reloads. That call is what does the
work: it bypasses the HTTP cache *and replaces the stored entry*, so the reload
straight after picks up the fresh copy. `location.reload(true)` has forced
nothing in any current browser for years - it is ignored, and a test asserts it
is not relied on.

- **the asset list comes from the DOM**, never a list kept by hand: it is
  exactly the tags the page loaded, so it cannot drift from them. The popup
  already learned that lesson with its copy of the constant keys.
- **same origin only.** A CDN or a Google font is not ours to invalidate, and
  fetching it here fails on CORS and looks like a broken refresh.
- **Cache Storage is cleared too.** It is empty today - there is no service
  worker - but the call costs nothing and means adding one later cannot quietly
  defeat the button.
- **a failed asset fetch is swallowed**, because one 404 must not stop the
  reload, which is the part the operator actually pressed.
- **nothing is lost.** The loaded applicants are in `sessionStorage`, which a
  reload in the same tab keeps, and trip details and constant answers are in
  `localStorage`. The `title` says so, because a button that might lose an
  hour of typing is a button nobody presses.

Two of `auth.test.js`'s assertions had to be tightened when this went in, and
the reason is worth keeping: both tested a **bare substring** of `index.html`,
and a comment beside the new button broke them - one names `app.js` while
explaining the caching problem, the other names `location.reload(true)` while
explaining why it is not used. They now match the script **tag** and the
**call** respectively. A test that cannot tell prose from code will eventually
be broken by prose.

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

## The chips on the applicant list, and one that was always wrong
Each row in the list carries two independent chips, answering two different
questions:

| Chip | Means |
|---|---|
| `ready` **or** `N errors` | **whether it can be filed.** An error is CEAC refusing the page, or a required field empty. |
| `N to check` | **the tool will still fill it**, but a human should look before swearing to it. |

They are independent, and `ready` + `N to check` is the normal combination.
That is the point of the amber count: **a warning stops nothing**, the value
goes on the form regardless, so the number is the list of things being sworn to
that the tool is not sure of.

Note the adjacent trap: the **only rows with errors** checkbox filters on
`errors` alone, so a row with 0 errors and 3 warnings *disappears* when it is
ticked. The amber count is exactly what that checkbox hides.

### A THIRD CATEGORY: notes (2026-09-04)
`validate()` returns `errors`, `warnings` and now **`notes`**, because some
lines are neither. They are how a page works, they are true on **every single
row**, and nothing is wrong.

The repeater message was the case that forced it: *"3 schools. CEAC shows one
row at a time: press Add Another and Fill again for each."* That is the
arrangement we chose, it fires on 69 of 69 J1 rows, and it needs no decision -
so sitting in the amber list it was inflating "N to check" by one on every row.
**Same failure as the comma warning fixed the same day, in a milder form: a
line that is never a problem teaches the operator that the amber count is
noise.** The user made exactly that objection, having read the same argument
from me an hour earlier.

Notes are:
- **counted nowhere.** The chip stays `warnings.length` and `ok` stays
  `errors.length === 0`, so *"Nothing to fix"* still shows when only notes are
  present.
- **not flagged in the table below.** A note is not a doubt about the value in
  that row, and outlining it amber would say the opposite.
- **the quietest thing in the list** - no coloured ground, muted text, a thin
  border - and rendered last. Checked against the error and warning styles side
  by side in a browser: distinct, and still legible.

`normalize.test.js` asserts the contract *and its consumer* in one place,
because a category is only worth having if `app.js` honours it and the two rot
together.

### The comma is the sheet's separator, not a character in the name
`validate()` warned *"Name contains characters that are not in the passport
MRZ"* whenever `fullName` held anything outside `A-Z ' -`. Measured on the live
export: **it fired on 516 of 832 rows - 62% - and in every single one the comma
was the only offender.** Not one row held a genuinely odd character.

A warning that is wrong every time it appears is worse than no warning. It was
**62% of the amber count on the list**, and it taught the operator that the
amber count is noise - the same failure as the P-3-04510 cross-check reporting
a mismatch on every DS-2019.

`splitName()` already treats the comma as a separator and `rec.nativeName`
already drops it for the same stated reason - a name has no punctuation in it -
so the test now runs on the name with the separator removed. It still catches
what it is for: a digit, a full stop, a title like `MR.`. Hyphens and
apostrophes are in the MRZ and never warned.

**`surname`'s "Name split is a guess" is NOT the same case and stays.** The
comma does not settle which half is the surname - `I PUTU JULI, FRINDAYANA`
gives FRINDAYANA (right for this sheet) while `FRINDAYANA, I PUTU JULI` would
give JULI (wrong) - and that is already written down further up this file.

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

### THE TWO TEMPLATES FEED THE EDUCATION BLOCK DIFFERENTLY (corrected 2026-09-04)
CEAC's education block is a **repeater** - Name of Institution, Address, Course
of Study, Attendance From/To, then *Add Another* - and C1/D and J1 fill it in
opposite ways. Getting this wrong showed up as a warning on **every J1 row**
naming a column that holds something else entirely.

**C1/D asks which one.** Column BI, *"Please select your highest level of
education"*, picks between two candidates at the user's instruction:

| Column BI | Source |
|---|---|
| High School / Vocational School | BJ-BN |
| College / University | BO-BS |

That rule stands, unchanged. (It is **not** keyed on column AZ; that mistake was
made on 2026-09-01 and corrected. AZ only decides whether the previous-*employer*
block is filled.) Matching is tolerant of loose wording - `SMK`, `Diploma III`,
`Sarjana (S1)` all land. If BI is unreadable **and both** candidates hold a name,
nothing is chosen and `validate()` asks: picking an institution to swear to is
not ours to do. One candidate is no ambiguity, so it is used.

**The J1 template does not ask, and has three blocks.** Checked against the
template the user supplied on 2026-09-04: there is no such column, and **BI on
the J1 sheet is `Previous Workplace Country`**. It carries junior high (BJ-BM),
senior high / vocational (BN-BR) and college / university (BS-BW), and the filed
sample lists them **all**, chronologically:

> Name of Institution (1): SMP NEGERI 11 DENPASAR - Course of Study: **JUNIOR HIGH SCHOOL**
> Name of Institution (2): SMK NEGERI 3 DENPASAR - Course of Study: KULINER

Note the first one's course of study. The template has **no course column for
junior high**, and those words were typed in. That is CTI's own convention,
taken from the filed application rather than invented.

So on J1 the blocks are a **list**, not a choice: the first is filled and
`validate()` hands back the rest, exactly as `languageSpoken` and
`firstCountryVisited` do - each *Add Another* costs a postback and CEAC's WAF
has blocked this agent three times over bursts of them.

`rec._asksEducationLevel` is what separates the two paths, and it is keyed on
**the header being present, not on its value**: an empty BI on a C1/D row is a
question that was asked and not answered, which is worth a warning; a missing BI
is a question the template never asks, which is not.

#### Never put a column letter in a message
The warning read *"Highest level of education (column BI) reads ..."* and fired
on J1 rows, where BI is Previous Workplace Country. **A message pointing at the
wrong data is worse than a vague one.** `_eduSource` had the same fault from the
other direction - its `BJ-BM` labels were the *J1* template's letters, so they
were wrong for every C1/D row.

Both name the block or the header now. This file already says mapping is by
header **text** precisely because positions differ between the templates; a
letter in a user-facing string quietly contradicts that.

### REPEATER ROWS: the filler fills all three schools (2026-09-04)
The message then said *"add these by hand"*, and the user's answer was the
right one: the information is already uploaded, so why retype it. CEAC's
education block is an ASP.NET DataList - one visible row plus **Add Another** -
and the J1 template names three schools for **all 69 of its rows**, so this was
the normal case, not an edge one.

**The pacing is the operator's own click, which is why this adds no risk.**
They press *Add Another* - that click **is** the postback - the next row
appears, and the next Fill press fills it. Nothing here puts extra traffic on
CEAC: it is the same one-postback-per-press discipline the rest of the filler
follows, and the postback is theirs, not ours.

| | |
|---|---|
| `REPEATED` in `matcher.js` | key → `{ list, field }`. A key listed there reads `rec[list][ordinal][field]` instead of `rec[key]`. |
| `_eduList` in `normalize.js` | the schools in order, each with name, address, course, from, to. |
| `repeaterOrdinals()` in `content.js` | which row of a repeater each control belongs to. |

**THE ROW'S POSITION, NEVER THE NUMBER IN ITS ID.** ASP.NET numbers DataList
rows `ctl00, ctl01, ctl02` - but a repeater with **separator templates** numbers
its *data* rows `ctl00, ctl02, ctl04`. Using the raw number as a list index
would then put the college in the senior-high row: filled, plausible, wrong on
a sworn form, and invisible. So the rows present are collected per repeater,
sorted, and their **ordinal position** is used. That is correct whatever the
numbering and needs no guess about how CEAC numbers anything. A browser check
deletes `ctl01` to reproduce the gap and asserts `ctl02` gets the *second*
school.

**A row with no entry is left alone** - the right answer for an *Add Another*
pressed one time too many.

**On C1/D `_eduList` holds exactly one entry.** Column BI names the block to
fill and the user's rule is that the others are not; pressing Add Another there
leaves the new row alone, because nothing in the sheet says to swear to a second
institution.

`test/fake-prev-work-education.html` carries **three** education rows -
`ctl00`, `ctl01`, `ctl02` - and its date dropdowns got real ranges at the same
time (they had one option each, the trap already recorded for this page). Do not
renumber the rows to be consecutive: the gap between 01 and 02 is not tidiness,
it is what the ordinal test needs.

Verified in a browser: three rows get their own school, course and dates; C1/D's
single entry fills row 1 and leaves 2 and 3 empty; a gapped repeater puts the
senior high in `ctl02`; **zero postbacks** throughout. The cross-fixture sweep
(`test/sweep-fixtures.html`) confirms all twenty-one other pages are unchanged.

**The same mechanism now fits three more places that are still "first only":**
languages spoken, countries visited in the last five years, and the second
Additional Point of Contact. Each needs its list published the way `_eduList`
is, plus - for the point of contact - the repeater ids that only a live Fill
report can give.

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

### THAT NUMBER WAS NOT A TYPO - IT WAS AN EXPONENT (found 2026-09-04)
`628195201137810` was written off above as "a stray digit or two numbers run
together". **It was neither.** It is a valid thirteen-digit Indonesian mobile
with a two-digit **exponent** glued on the end.

Zoho stores phone numbers, ID numbers and payment references as **numbers**, and
its xlsx writer serialises the large ones in exponential form:

```xml
<c r="AA2" s="2"><v>6.2895410887918E13</v></c>
```

That is a perfectly legal numeric cell. `xlsx.js` passed the `<v>` text through
verbatim, so every digit-taking helper downstream read the exponent as part of
the value:

| Cell | Was | Should be |
|---|---|---|
| `6.281215303279E12` | `628121530327912` | `6281215303279` |
| `6.2895410887918E13` | `6289541088791813` | `62895410887918` |

**Scale, measured rather than guessed:** in the C1/D export, **690 of the 2564
rows** carry the applicant's own phone (column AA) that way — plus 529 employer
phones, 294 previous-employer phones, 79 last-visa numbers and 11 KTPs. Of a
400-row sample of column AA, **341 produced a number CEAC refuses outright** and
the rest were still wrong while passing the length check. In the J1 export it is
columns N, Y, AW, BD, CB, CF, and one row each of CH and CI.

**The fix is `expandExp()` in `xlsx.js`, at the reader** — one change covering
every column, mapped, unmapped and future, in both sheets. After it, 398 of those
400 are valid; the two that remain are genuine oddities and `validate()` names
them. Two details:

- **only the numeric branch.** A shared-string cell that looks exponential is
  text somebody typed, and rewriting it would be a guess.
- **only a non-negative exponent**, so a genuine tiny fraction survives as
  written — and a date serial like `45848` never enters the branch at all, which
  matters more than anything else here: if it did, every date in the sheet would
  move.

**`deExp()` in `normalize.js` is the backstop for the CSV path**, where Excel
writes the same cell as `6.2895410887918E+13` — note the `+`, which xlsx does not
write. A fix that covers only the route anyone tests is the worst shape a bug can
have.

The general lesson, and it has now cost this project twice: **when a value looks
like a plausible number with something extra on the end, suspect the export
before suspecting the typist.**

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
