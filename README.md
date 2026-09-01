# DS-160 Autofill — CTI Group

Turns the **Visa Registration Log → VISA APPLICATIONS** intake sheet into a
validated, DS-160-ordered worksheet, and fills the CEAC form from it.

Two pieces:

| Piece | What it does |
|---|---|
| **Worksheet** (`index.html`) | Loads the sheet export, normalises every row (dates → `DD-MMM-YYYY`, phones → `+62…`, name → Surname / Given Names), flags the problems that get an application rejected, and shows each applicant in DS-160 page order with copy buttons. |
| **Extension** (`extension/`) | Chrome MV3. On `ceac.state.gov` it fills the fields it recognises on the page you are looking at, outlines what it touched, and reports what it skipped. |

## What it deliberately does NOT do

- It never solves the security check (CAPTCHA) — the agent does.
- It never clicks **Next**, **Sign**, or **Submit**.
- It never touches the Application ID, security question, or answer.
- **Auto-continue is off by default.** CEAC sits behind a security service;
  rapid repeated page reloads have got an agent blocked before. Leave it off
  unless you have a reason, and never retry a block in a loop.
- On the Security and Background pages it answers No to every unanswered
  question **only while that switch is on**, outlines each one on the page, and
  lists them in the report for you to read before clicking Next.
- It does not create, retrieve, or submit applications on its own.

The agent stays in the loop for every page. The DS-160 preparer block must be
filled in honestly, and the applicant signs their own application.

## Using it

1. Zoho Sheet → **Visa Registration Log** → worksheet **VISA APPLICATIONS** →
   *File → Download As* — **XLSX** or **CSV**, either works.
2. Open the worksheet app, drop the file in (or click the box to browse).
   An `.xlsx` with several sheets is opened at **VISA APPLICATIONS**.
3. Check the **Constant answers** panel once. These are DS-160 questions the
   intake form never asks (native alphabet, telecode, other names, relatives in
   the U.S. …), plus the **Security and Background** sweep. They are answers on a
   visa application — read them, and change any that are wrong for the applicant
   in front of you.
4. In **Trip details** (the first block), press **Read supporting letter**. The
   extension fetches it from Zoho and reads it: vessel, IMO, joining date, US
   port and shipboard job title are filled in, and the name, passport and date
   of birth in the letter are checked against the intake row. Fill the rest by
   hand; `copy from...` saves retyping the cruise-line details for the next
   applicant. If the link is a viewer page rather than the PDF, open it and
   paste the text instead.
5. Work the list: fix every red **error** before booking an appointment — those
   are the ones that waste a slot.
6. Pick an applicant → **Send to extension** (or **Copy JSON** if the extension
   is not installed).
7. On each DS-160 page press **Fill this page**, review, then click Next yourself.

### Faster still, with no software at all

CEAC has two built-in shortcuts most agents miss:

- **Save Application to File** (`.dat`) on one fully-filled template, then
  **Upload an Application** for each new applicant and change only the personal
  fields.
- On the confirmation page, **Create Family or Group Application** copies the
  shared data into the next application. For a batch of 10+ crew this is the
  fastest path.

## Installing the extension

Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked**
→ pick the `extension/` folder.

### Teaching it a field

CEAC control ids are stable but Consular Affairs does rename them. If a field
is not filled: open the popup → **Teach unmatched fields** → **Scan page** →
pick the record field for that control. The override is stored locally and wins
over the built-in rules from then on. **Copy page map** dumps every control on
the page for adding new rules to `extension/matcher.js`.

## Development

```bash
npm test                     # normalize + matcher + xlsx + constants
node server.js               # http://localhost:7773
python test/make-fixture.py  # rebuild test/fixtures/sample.xlsx
```

`.xlsx` is read by `xlsx.js`, a ~150-line ZIP + XML reader built on the
browser's own `DecompressionStream('deflate-raw')` — no library, nothing to
install. Old binary `.xls` is not supported; re-save as `.xlsx` or CSV.

`docs/sheet-schema.md` is the live column list read from the Zoho sheet, plus
the DS-160 fields the intake form does not yet ask for.
