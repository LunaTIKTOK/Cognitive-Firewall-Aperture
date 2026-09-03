# Clearspend — Personal Budgeting App

A fast, private, fully client-side budgeting app. No account, no server, no
tracking — your data lives in your browser's `localStorage`.

## Features

- **Transactions** — add, edit, delete, search, filter, and sort income/expenses.
- **Category budgets** — set a monthly limit per category and track spend with
  color-coded progress bars (green / amber / red).
- **Charts** — spending-by-category breakdown and a 6-month income vs. expense
  trend, powered by a locally vendored copy of Chart.js (works fully offline).
- **Recurring transactions** — define rent, subscriptions, or your paycheck
  once, then apply them to any month with one click.
- **Month navigation** — step back and forward through history.
- **Dark mode** — toggle in the top bar; preference is saved.
- **Export / Import** — download your data as JSON and restore it later or on
  another device.

## Running it

No build step, no dependencies to install. Just serve the folder statically
and open it, e.g.:

```bash
cd budgeting-app
python3 -m http.server 8080
# then open http://localhost:8080
```

Or open `index.html` directly in a browser (some browsers restrict
`localStorage`/file access under `file://`, so a local server is recommended).

## Data & privacy

All data (transactions, categories, budgets, recurring rules, theme) is
stored client-side under the `clearspend.budget.v1` key in `localStorage`.
Nothing is sent to a server. Use **Export** periodically to back up your data,
and **Import** to restore it or move it to another browser/device.

## Files

- `index.html` — markup and modal templates
- `styles.css` — theming (light/dark) and layout
- `app.js` — application state, rendering, and event handling
- `vendor-chart.umd.js` — vendored Chart.js 4.4.4 (UMD build), so the app has
  no runtime dependency on a CDN
