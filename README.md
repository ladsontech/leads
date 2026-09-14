# Kampala Call Sheet

A standalone web app. Deploy this folder to Vercel and it runs on its own,
with no dependency on Claude or any other service.

## Files

- `index.html` — the whole app, including the 115 leads and the WhatsApp
  message templates. One file, no build step.
- `manifest.webmanifest` — makes it installable on a phone home screen
- `sw.js` — service worker, so it opens and works with no signal
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — app icons
- `vercel.json` — stops Vercel caching `index.html` and `sw.js`, so a
  redeploy actually reaches phones that already installed it
- `leads_current.csv` — the same 115 leads as a spreadsheet backup

## Installing on a phone

Open the Vercel URL in the phone browser, then Share and "Add to Home
Screen". It opens full screen with no browser bars.

## Where the data lives

Call outcomes and notes are stored in the browser's own storage on each
device. **They do not sync between your phone and your laptop.** Export to
CSV from Settings at the end of a calling session if you want one record.

If you want real syncing, that needs a small backend. Supabase would do it
in about an hour of work.

## Redeploying after a change

Bump `CACHE` in `sw.js` (for example `callsheet-v1` to `callsheet-v2`)
whenever you change `index.html`. Otherwise phones that already installed
the app keep serving the old copy from their cache.

## Editing the leads

The leads are a JSON array at the top of the `<script>` block in
`index.html`, on the line starting `const LEADS_RAW =`. Fields:

| key | meaning |
|---|---|
| `n` | business name |
| `p` | phone, local format, e.g. `0772123456` |
| `p2` | second phone, optional |
| `e` | email, optional |
| `c` | Google category |
| `a` | area |
| `s` | `School`, `Consultancy` or `Church` |
| `r` | Google review count |
| `y` | priority, `High` / `Medium` / `Low` |
| `d` | address |
| `x` | note shown on the lead, optional |
| `w` | `1` if the no-website check was ambiguous |

Numbers starting `07` are treated as mobiles and get a WhatsApp button.
Everything else is treated as a landline and gets Call only.
