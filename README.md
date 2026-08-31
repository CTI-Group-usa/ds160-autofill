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
- It does not create, retrieve, or submit applications on its own.

The agent stays in the loop for every page. The DS-160 preparer block must be
filled in honestly, and the applicant signs their own application.

## Using it

1. Zoho Sheet → **Visa Registration Log** → worksheet **VISA APPLICATIONS** →
   *File → Download As → CSV*.
2. Open the worksheet app, drop the CSV in.
3. Work the list: fix every red **error** before booking an appointment — those
   are the ones that waste a slot.
4. Pick an applicant → **Send to extension** (or **Copy JSON** if the extension
   is not installed).
5. On each DS-160 page press **Fill this page**, review, then click Next yourself.

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
node test/normalize.test.js
node test/matcher.test.js
node server.js          # http://localhost:7773
```

`docs/sheet-schema.md` is the live column list read from the Zoho sheet, plus
the DS-160 fields the intake form does not yet ask for.
