# LeadVault — notes on the Kampala lead data

Written by Claude, who scraped and verified these leads. This is for whoever is
working on `app.js` next. `leads.csv` in this folder is ready to drag into the
upload zone — but **three things in the current code will break on Ugandan numbers.**

---

## The data

`leads.csv` — 118 Kampala businesses. Every one has a phone number on Google Maps
and **no website anywhere** (each was individually web-searched, not just checked
for a website button on Maps — about a third of "no website" Maps listings turned
out to have a site that was simply never linked, and those are already removed).

- 85 schools / education
- 29 consultancies & professional firms
- 4 churches

Columns `Name`, `Phone`, `Email`, `Company` match the existing `detectColumns()`
mapper exactly, so it imports as-is. The remaining columns are extra context the
app currently ignores — see "Fix 4".

`Email` is empty for every row. Google Maps does not expose email addresses.
The Email button will be disabled throughout; that is expected, not a bug.

---

## Fix 1 — `wa.me` links are broken for every lead (critical)

`wa.me` requires a bare international number: **country code, digits only, no `+`,
no leading zero.** The current code does:

```js
href="https://wa.me/' + lead.phone"
```

...where `cleanPhone()` keeps `+` and any leading `0`. A Ugandan mobile saved as
`0772123456` produces `wa.me/0772123456`, which WhatsApp rejects with "the phone
number shared via url is invalid". `+256772123456` mostly redirects but is not
per spec.

The number must become `256772123456`. Suggested helper:

```js
// Uganda: +256. Accepts 0772123456, +256772123456, 256772123456, 0414267847
function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('256')) return d;          // already international
  if (d.startsWith('0'))   return '256' + d.slice(1);
  if (d.length === 9)      return '256' + d;  // bare national number
  return d;
}
```

Then: `href="https://wa.me/' + waNumber(lead.phone)"`

Keep `tel:` as `+256…` — that dials correctly from a Ugandan handset, and the
CSV already stores phones in that form.

## Fix 2 — 30 of the 118 cannot receive WhatsApp at all

They are landlines and fixed VoIP, not mobiles. The WhatsApp button should be
disabled for them, the same way it already greys out when there is no phone —
otherwise a quarter of the list leads to a dead chat screen.

Ugandan prefixes, after normalising to the local `0…` form:

| Prefix | Type | WhatsApp |
|---|---|---|
| `070` `071` `074` `075` `076` `077` `078` `079` | mobile | yes |
| `041` `039` `031` `020` `042` | landline / fixed VoIP | **no** |

```js
function isMobile(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('256')) d = '0' + d.slice(3);
  return /^0(7[0-9])/.test(d);
}
```

`leads.csv` also ships a precomputed `LineType` (`mobile` / `landline`) and
`CanWhatsApp` (`yes` / `no`) column, so this can be read straight off the row
instead of recomputed — whichever is cleaner.

Split by segment, since it changes how each list gets worked:

- Schools: 67 mobile, 18 landline
- Consultancies / professional firms: 17 mobile, **12 landline**
- Churches: 4 mobile, 0 landline

The professional firms are nearly half landline — that list is call-only.

## Fix 3 — `.xlsx` import reads the wrong sheet

```js
const sheetName = workbook.SheetNames[0];
```

The source workbook (`Kampala_no_website_leads.xlsx`) has four sheets, and the
first is `Summary` — importing it yields junk rows. Either pick the sheet whose
name looks like data, or pick the largest:

```js
function pickSheet(workbook) {
  const preferred = workbook.SheetNames.find(n => /lead|call|contact|data/i.test(n));
  if (preferred) return preferred;
  return workbook.SheetNames.reduce((best, n) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[n]).length;
    return rows > best.rows ? { name: n, rows } : best;
  }, { name: workbook.SheetNames[0], rows: -1 }).name;
}
```

Sheets also carry trailing footnote rows beneath the table. Dropping rows with
no phone **and** no email already handles most of it; `mapToLeads()` does this.

## Fix 4 — worth carrying, if you extend the schema

`mapToLeads()` currently keeps four fields. These extra CSV columns are the ones
that actually change how a call goes:

| Column | Why it matters on the call |
|---|---|
| `Segment` | The pitch to a head teacher is nothing like the pitch to an accountant |
| `Area` | Lets him work one neighbourhood per session |
| `Priority` | From Google review count — High / Medium / Low |
| `Reviews` | The raw number behind Priority |
| `Address` | Useful to confirm you have the right branch |
| `MapsUrl` | One click to see the listing mid-call |
| `PhoneLocal` | The number as printed on Maps, for reading aloud |
| `Status` | Not called / No answer / Call back / Interested / … |
| `Notes` | Who answered, what they said |

`Status` and `Notes` are the big ones — an outreach list without call outcomes
is just a phone book. They persist fine in the existing `localStorage` shape.

A caveat on `Priority`: it is derived from Google review count (20+ = High,
5–19 = Medium, under 5 = Low). It measures how established a business is, **not**
how likely they are to buy. In this dataset the well-established ones were the
most likely to already own a website, so they have mostly been filtered out
already — treat it as ordering, not as a score.

---

## Suggested calling order

Call first, WhatsApp second. Most of these numbers are the front desk, not the
decision-maker, so the call's job is to get a name and a personal mobile; the
WhatsApp follow-up then goes to a named human along with a mockup. That means
the app is most useful if `Notes` can capture the decision-maker's name and a
second number discovered on the call.
