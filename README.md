# Kashier Cases module (prototype)

A static HTML prototype of the **Cases** module in the Kashier agent portal: where Underwriting reviews and decides
sales applications, from Underwriting Review until the account goes live.

## Run it

```bash
python -m http.server 3000
```

Then open <http://localhost:3000/cases.html>.

## What is in it

- `cases.html` — the case list: status tabs, search (business name, MID, email), assignee and submitted-by filters, sortable table, pagination, CSV export.
- `case-details.html` — one case: every step of the sales application (business details, services and pricing, documents, payout method, contracts), a review checklist, internal notes, approve / reject, and an Activity Log drawer.
- `cases-core.js` — case model, round-robin assignment, review checklist and shared shell.
- `cases.css` — styles, following the Kashier design system.
- `rate-decisions.js` — shared sample data and rules for sales applications (fake merchants only).

Cases are assigned round robin across the underwriting agents; an Underwriting Manager can reassign (use the "Viewing as" switch).
All state is kept in the browser's `localStorage`; there is no backend.

Links to other portal pages (Home, Merchant, the application form, and so on) are not part of this repository and will not open.
