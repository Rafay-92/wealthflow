# WealthFlow

A personal finance analytics app. Import CSV bank statements and see where your money goes: spending by category, trends, monthly reports, subscriptions, net worth and plain-English insights.

**Everything runs in your browser.** Statements are read on your device, data is stored only in this browser (IndexedDB), and the production build's Content Security Policy blocks connections to any other server.

> ⚠️ This is a learning project and a prototype. Use the fictional sample data, not real financial information, until the security checklist at the bottom has been completed.

## Features

| Page | What it does |
| --- | --- |
| **Dashboard** | Total balance, monthly income/expenses/savings/savings rate vs last month, insights, trends, spending breakdown, recent transactions |
| **Import** | CSV upload with drag and drop, header detection, column mapping with live preview, date-format ambiguity warnings, duplicate detection, review before saving, undo per import |
| **Transactions** | Search and filter, change categories, create merchant rules, "needs review" queue |
| **Analytics** | 3M/6M/12M/All ranges, spending by category with per-category trends, income vs expenses, savings rate, month-over-month comparison, largest purchases, average daily spending |
| **Insights** | Rule-based findings, each with "how this was calculated" |
| **Reports** | Monthly report with observations, exportable as a text-based PDF |
| **Subscriptions** | Detected monthly payments with monthly and yearly cost; confirm or dismiss each |
| **Wealth** | Manually tracked assets and liabilities, net worth over time |
| **Settings** | Data overview, JSON backup, delete all data, privacy facts |

Until you import a statement, every page shows **fictional sample data**. Sample data is never saved and never mixed with your own.

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | Run the unit tests once (283 tests) |
| `npm run test:watch` | Re-run tests on every save |
| `npm run build` | Type-check and build for production (into `dist/`) |
| `npm run preview` | Serve the production build at http://localhost:4173 (restart it after each build) |
| `npm run lint` | Check for common mistakes |

The Import page links to fictional sample CSVs in [`public/sample-data/`](public/sample-data/) in four formats, including a deliberately messy one.

## Architecture

```
src/
├── lib/            Pure logic, no React. Every financial calculation lives here and is unit-tested.
│   ├── money.ts        Money as integer cents (never floating-point dollars)
│   ├── dates.ts        Calendar dates as 'YYYY-MM-DD' strings (no timezone drift)
│   ├── csv/            Parse → detect header → map columns → normalise → find duplicates
│   ├── categorize/     Keyword rules, user rules, transfer detection
│   ├── analytics/      Summaries, periods, trends, comparisons
│   ├── recurring/      Recurring payments and subscriptions
│   ├── report/         Monthly report and PDF rendering
│   ├── insights/       Insight context + providers
│   └── wealth/         Net worth
├── data/           IndexedDB schema (Dexie) and the repository: the only code that touches storage
├── store/          Zustand store: mirrors the database for the UI
├── components/     Reusable UI pieces, grouped by feature
├── hooks/          React hooks (insights)
└── pages/          One component per route (lazy-loaded)
```

Data flows one way: **lib → store → pages → components**. Pages only display what `lib` functions return, which is why almost every number on screen is covered by a test.

### Key decisions

- **Integer cents.** `0.1 + 0.2 !== 0.3` in JavaScript, so all money is stored as integers. `parseAmountToCents` parses text directly and rejects ambiguous input such as `12,34`.
- **Transfers are not spending.** Money moving between your own accounts is detected (matching pairs across accounts, plus wording) and excluded from income and spending. Payments to other people (Zelle, Venmo…) are never treated as transfers.
- **Fair comparisons.** A partial month is compared with the same days of the previous month (Nov 1–20 vs Oct 1–20).
- **Categorization priority:** your manual choice → your rules → transfer pairs → transfer wording → built-in merchant keywords (longest match wins) → fallback marked "needs review".
- **Schema migrations.** The database is at version 4. Each stage added a version rather than editing an old one, and a test upgrades a version-1 database without losing data.
- **Insights are AI-ready but rule-based.** `buildInsightContext` produces aggregated numbers only; an `InsightProvider` turns them into insights. An AI provider could implement the same interface, receiving the summary, never raw statements, and only with the user's opt-in.

## Testing

- **Unit tests** (Vitest): `npm test`. These cover money parsing, dates, CSV parsing (including the real sample files), duplicates, categorization, analytics, recurring detection, reports and PDF content, insights, net worth, backups and database migrations.
- **Browser checks** were run during development with headless Microsoft Edge: every page in sample and real-data mode, import flows, PDF export, backup, delete-all, mobile width (390px), keyboard access, and zero Content Security Policy violations. Those scripts aren't part of the repository yet; adding Playwright would make them repeatable in CI.

## Known limitations

- **CSV only.** PDF statements aren't supported. Dates and amounts assume US conventions; ambiguous dates (MM/DD vs DD/MM) are flagged for you to choose.
- **USD only.**
- **Subscriptions** must recur monthly. Weekly and yearly charges aren't detected.
- **Wealth values are entered by hand.** There are no investment price feeds.
- **Backup is export-only.** Restoring from a backup file isn't built yet.
- **One browser, one device.** Clearing site data deletes everything, and there's no sync.
- **Heuristics can be wrong.** Categories, transfers and recurring payments are detected by rules. Everything can be corrected by hand, and the "needs review" filter shows what nothing matched.

## Before using real financial data

The prototype keeps data local, but more is needed before real statements should go in it:

1. **Data at rest is not encrypted.** Anyone with access to this browser profile can read it. Consider encrypting IndexedDB contents with a user passphrase (Web Crypto).
2. **Deliver the CSP as an HTTP header** (it's currently a `<meta>` tag), and add `frame-ancestors 'none'`, HTTPS-only hosting and HSTS.
3. **Supply chain:** keep `npm audit` clean, pin dependency versions, and review updates.
4. **A security review** of the import path (untrusted CSV input), the PDF generation and the backup file handling.
5. **Backups contain plain-text financial data.** Users need clear guidance, or the backups should be encrypted.
