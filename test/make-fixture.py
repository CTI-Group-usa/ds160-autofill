"""Builds test/fixtures/sample.xlsx by hand (stdlib only) so the .xlsx
reader can be exercised against a real, deflate-compressed workbook.

Run: python test/make-fixture.py
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures", "sample.xlsx")

# Two sheets, so sheet selection by name is actually tested.
SHEETS = ["Notes", "VISA APPLICATIONS"]

HEADERS = [
    "Added Time", "Name", "Cruise Line", "Gender", "Marital Status",
    "Date of Birth", "Place of Birth", "Nationality", "KTP Number",
    "Address", "Phone Number", "Email Address", "Passport Number",
    "Passport Issued Date", "Passport Expired Date", "Father's Name",
    "Mother's Name", "Current Workplace's Name", "Current Employment Position",
    "Appointment Date",
]

# Dates go in as Excel serials, exactly as Zoho exports them.
ROWS = [
    ["46000", "Budi Santoso", "Royal Caribbean", "Male", "Single",
     "34783", "Denpasar", "Indonesia", "5103021234567890",
     "Jl. Raya Kuta 12, Badung", "081234567890", "budi@example.com", "C1234567",
     "45332", "47058", "Santoso", "Wayan Sari", "PT Bahari", "Waiter", "46296"],
    ["46001", "Sukarno", "Carnival", "Male", "Married",
     "32937", "Surabaya", "Indonesia", "12345",
     "Jl. Melati 3 <blok A> & B", "12", "not-an-email", "X 12",
     "43831", "46327", "Fauzi", "", "", "", "46296"],
]


def col_ref(i):
    s, i = "", i + 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def esc(v):
    return (v.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def sheet_xml(grid, strings):
    rows = []
    for r, row in enumerate(grid, start=1):
        cells = []
        for c, val in enumerate(row):
            if val == "":
                continue
            ref = col_ref(c) + str(r)
            if val.replace(".", "", 1).isdigit():
                cells.append('<c r="%s"><v>%s</v></c>' % (ref, val))
            else:
                if val not in strings:
                    strings[val] = len(strings)
                cells.append('<c r="%s" t="s"><v>%d</v></c>' % (ref, strings[val]))
        rows.append('<row r="%d">%s</row>' % (r, "".join(cells)))
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            "<sheetData>%s</sheetData></worksheet>" % "".join(rows))


def main():
    strings = {}
    body = sheet_xml([["Nothing here"]], strings)
    visa = sheet_xml([HEADERS] + ROWS, strings)

    sst = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>'
           % (len(strings), len(strings),
              "".join("<si><t>%s</t></si>" % esc(s)
                      for s, _ in sorted(strings.items(), key=lambda kv: kv[1]))))

    wb = ('<?xml version="1.0" encoding="UTF-8"?>'
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
          + "".join('<sheet name="%s" sheetId="%d" r:id="rId%d"/>' % (n, i + 1, i + 1)
                    for i, n in enumerate(SHEETS))
          + "</sheets></workbook>")

    rels = ('<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join('<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet%d.xml"/>'
                      % (i + 1, i + 1) for i in range(len(SHEETS)))
            + '<Relationship Id="rIdSst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            "</Relationships>")

    ct = ('<?xml version="1.0" encoding="UTF-8"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          "</Types>")

    root_rels = ('<?xml version="1.0" encoding="UTF-8"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                 "</Relationships>")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", wb)
        z.writestr("xl/_rels/workbook.xml.rels", rels)
        z.writestr("xl/sharedStrings.xml", sst)
        z.writestr("xl/worksheets/sheet1.xml", body)
        z.writestr("xl/worksheets/sheet2.xml", visa)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
