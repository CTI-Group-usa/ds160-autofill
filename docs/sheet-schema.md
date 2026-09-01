# Zoho Sheet — "Visa Registration Log" / worksheet `VISA APPLICATIONS`

resourceId: `vpzkvba5ae0adfc1247a8b7383dbef6ea3d8d`
Header row: 1. Columns 0-94 (95 total). Column index 1 (spreadsheet col `B`) has a blank header.
Read live from the sheet on 2026-08-31.

| # | Col | Header |
|---|-----|--------|
| 0 | A | Added Time |
| 1 | B | *(blank header)* |
| 2 | C | Name |
| 3 | D | Cruise Line |
| 4 | E | Please select the type of visa you want to process |
| 5 | F | Gender |
| 6 | G | Marital Status |
| 7 | H | Date of Birth |
| 8 | I | Place of Birth |
| 9 | J | Province of Birth |
| 10 | K | Nationality |
| 11 | L | KTP Number |
| 12 | M | Countries I've Been to in the Last 5 Years |
| 13 | N | Do you have US Driver License? |
| 14 | O | Have you ever been issued U.S. Visa? |
| 15 | P | When did you arrive in the US? |
| 16 | Q | Period Type of Stay in the US |
| 17 | R | How long did you stay in the US? |
| 18 | S | Date last Visa was issued |
| 19 | T | Last Visa Number |
| 20 | U | Are you applying for the same type of visa? |
| 21 | V | Has your U.S. Visa / passport ever been lost or stolen? |
| 22 | W | Explain Details of Loss/Theft |
| 23 | X | Has your U.S. Visa / passport ever been cancelled or revoked? |
| 24 | Y | Explain Cancellation/Revocation Details |
| 25 | Z | Address |
| 26 | AA | Phone Number |
| 27 | AB | Email Address |
| 28 | AC | Social Media Provider/Platform |
| 29 | AD | Social Media Username/Link |
| 30 | AE | Passport Number |
| 31 | AF | Passport Issued Place |
| 32 | AG | Passport Issued Date |
| 33 | AH | Passport Expired Date |
| 34 | AI | Father's Name |
| 35 | AJ | Father's Date of Birth |
| 36 | AK | Mother's Name |
| 37 | AL | Mother's Date of Birth |
| 38 | AM | Husband/Wife's Name |
| 39 | AN | Husband/Wife Date of Birth |
| 40 | AO | Husband/Wife Country (Nationality) |
| 41 | AP | Husband/Wife Place of Birth |
| 42 | AQ | Date of Marriage |
| 43 | AR | Date Marriage Ended |
| 44 | AS | How the Marriage Ended |
| 45 | AT | Country/Region Marriage was Terminated |
| 46 | AU | Current Workplace's Name |
| 47 | AV | Current Workplace's Address |
| 48 | AW | Current Workplace's Phone Number |
| 49 | AX | Start Date at Current Workplace |
| 50 | AY | Current Employment Position |
| 51 | AZ | Were you previously employed? |
| 52 | BA | Previous Work Place Name |
| 53 | BB | Previous Workplace Address |
| 54 | BC | Previous Workplace Phone Number |
| 55 | BD | Previous Workplace Working Position |
| 56 | BE | Previous Workplace Manager's Name |
| 57 | BF | Previous Workplace Start Date |
| 58 | BG | Previous Workplace Ended Date |
| 59 | BH | Previous Workplace Country |
| 60 | BI | Please select your highest level of education |
| 61 | BJ | Name of high school/vocational school |
| 62 | BK | Address of high school/vocational school |
| 63 | BL | Course of Study in High School/Vocational School |
| 64 | BM | Year of High School/Vocational School Entry |
| 65 | BN | Year of High School High School Graduation |
| 66 | BO | Name of College/University |
| 67 | BP | Address of College/University |
| 68 | BQ | Course of Study in College/University |
| 69 | BR | Year of College/University Entry |
| 70 | BS | Year of High School/University Graduation |
| 71 | BT | CV/Resume |
| 72 | BU | Passport |
| 73 | BV | BST Certificate |
| 74 | BW | Seaman's Book |
| 75 | BX | Working Certificate |
| 76 | BY | Family Card (KK) |
| 77 | BZ | National ID |
| 78 | CA | Photo |
| 79 | CB | Payment Receipt |
| 80 | CC | Supporting Letter |
| 81 | CD | Payment Status |
| 82 | CE | Date of Payment Received |
| 83 | CF | Visa Application ID |
| 84 | CG | Visa Status |
| 85 | CH | Visa Payment ID |
| 86 | CI | BNIVA Number |
| 87 | CJ | Paymen Status by Accounting |
| 88 | CK | Accounting payment receipt |
| 89 | CL | US Travel Doc. payment receipt |
| 90 | CM | Appointment Date |
| 91 | CN | Notes |
| 92 | CO | Courrier Fee Payment Receipt |
| 93 | CP | Courrier Fee Reimbursement Receipt |
| 94 | CQ | Embassy Location |

## Gaps vs. DS-160 (intake does NOT ask these — must be added or defaulted)
- Surname / Given Names **as printed in passport MRZ** (only one free-text "Name")
- Other names used / telecode
- Native-alphabet name (N/A for Indonesia)
- Home address vs. mailing address (only one "Address")
- Secondary/work phone, other phone numbers used in last 5 years
- Other email addresses used in last 5 years
- National ID number is captured (KTP), but no US Social Security / Taxpayer ID question
- Purpose-of-trip specifics for C1/D: **vessel name, principal/employer in the US, port**
- Intended date of arrival, length of stay, address where you will stay
- Person/entity paying for the trip
- Travel companions
- US point of contact (name, org, address, phone, email)
- Other countries' passports / lost-passport details beyond the single free-text
- **Security & Background: all Part 1-5 yes/no questions** (none are asked)
- Present a "Person who completed this application" (preparer) block

## Previous U.S. Travel - how columns O, P, Q, R are used
`Have you ever been in the U.S.?` is **not** a column. It is derived from
column P: an arrival date means Yes, an empty cell means No. Column O
(`Have you ever been issued U.S. Visa?`) answers a different DS-160
question and must not be reused for it.

| Column | Field | Filled into CEAC? |
|---|---|---|
| O | `priorUsVisa` | yes - *Have you ever been issued a U.S. Visa?* |
| P | `lastUsArrival` | yes - *Date Arrived*, and it derives `beenInUs` |
| Q | `stayUnit` | yes - *Length of Stay* period, via `prevStayUnit` |
| R | `stayLength` | yes - *Length of Stay* number, via `prevStayLength` |
| X | `visaRevoked` | yes - **twice**: *cancelled or revoked* AND *ever refused* |

Column Q holds the CEAC period and column R the number beside it, as the
headers read. `stayUnit()` accepts loose English and Indonesian wording
("months", "2 minggu", "kurang dari 24 jam", "<24 hrs") and maps it onto the
closed option set (`YEAR(S)`, `MONTH(S)`, `WEEK(S)`, `DAY(S)`,
`LESS THAN 24 HOURS`). For `LESS THAN 24 HOURS` the number is cleared - CEAC
greys that box out. `validate()` warns when the period cannot be placed on an
option, when it is missing, when it turns up in column R instead of Q, and
when a period has no number.

### Column X answers two questions
The sheet has no column for *"Have you ever been refused a U.S. Visa, or been
refused admission, or withdrawn your application at the port of entry?"*, so at
the user's direction it is answered from column X, which is headed
*"Has your U.S. Visa / passport ever been cancelled or revoked?"* and answers
that separate DS-160 question too. `validate()` warns on a Yes: a refusal and a
revocation are not the same event, and CEAC asks for a separate explanation for
each (column Y explains the revocation). Adding a refusal column to the sheet
would let `visaRefused` read from it directly.

The remaining questions on the page are not from the sheet: `sameCountryResidence`
= YES and `immigrantPetition` = NO are constants, and `tenPrinted` is derived from
`priorUsVisa` (column O).

### Column Z is the only address column
No column among the 95 holds a city, province or postal code. `splitAddress()`
takes the part after the last comma as the **City** when it reads like a place
name; the rest becomes the street and is wrapped across CEAC's Street Address
Line 1 / Line 2 at the real `maxlength`. **State/Province and Postal Zone cannot
be derived** - the province is not in the text and the postal code is nowhere in
the sheet, so the agent still types those two. Adding City, State/Province and
Postal Code columns to the sheet would remove the last of the manual typing.
