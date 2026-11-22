# START HERE: What every file does

A plain-English map of the WealthFlow project.

## How to open the app

**Double-click `Open WealthFlow.bat`.**

1. A black window opens and your web browser opens WealthFlow a few seconds later.
2. Keep the black window open while you use the app.
3. When you're done, close the black window. That stops the app.

The first time, it spends about a minute installing what it needs. After that it starts in seconds.

> Why can't I just double-click `index.html`? WealthFlow is written in a language (TypeScript) that browsers can't run directly. The black window runs a small program that translates it for your browser, so it has to stay open.

---

## Why the files aren't renamed

Many file names are **required by the tools** that build and run the app. For example, the app won't start if `package.json` is renamed, and `index.html` must keep that exact name. This guide explains every name instead. Please don't rename files, or the app will stop working.

**Quick glossary of file endings**

| Ending | Means |
| --- | --- |
| `.ts` | **TypeScript**: the app's code (logic, calculations) |
| `.tsx` | **TypeScript + screen layout**: code that draws something on screen |
| `.css` | **Styling**: colours, fonts, spacing. ("CSS" = Cascading Style Sheets) |
| `.json` | **Settings file**: plain text settings for a tool |
| `.md` | **Document**: readable notes like this one |
| `.csv` | **Spreadsheet data**: bank statement files |
| `.bat` | **Windows shortcut script**: double-click to run it |
| `.test.ts` | **Automatic checks** that the code next to it works correctly |

---

## The main folder

| Name | What it is | Will you touch it? |
| --- | --- | --- |
| **`Open WealthFlow.bat`** | Double-click to open the app | ✅ Yes |
| **`START HERE - What every file does.md`** | This guide | ✅ Read it |
| **`README.md`** | The project's official description, for developers | 📖 Optional |
| **`src`** | **All of the app's code.** Explained below | Only to change the app |
| **`public`** | Files given to the browser as-is: the app's icon and the sample bank statements | 📖 Sample files are in `public/sample-data` |
| **`e2e`** | Automatic **browser tests**: a robot clicks through the app to check it works ("e2e" = end-to-end) | No |
| `index.html` | The single web page the whole app lives inside | ❌ No |
| `package.json` | The app's **ingredients list**: which tools and libraries it uses, plus shortcut commands | ❌ No |
| `package-lock.json` | Exact versions of every ingredient, written automatically | ❌ Never |
| `vite.config.ts` | Settings for **Vite**, the tool that runs and builds the app (also holds the security rules) | ❌ No |
| `playwright.config.ts` | Settings for the browser tests | ❌ No |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` | Settings for **TypeScript**, the error-checker for the code | ❌ No |
| `.oxlintrc.json` | Settings for the **linter**, a tool that spots common mistakes | ❌ No |
| `.gitignore`, `.gitattributes` | Settings for **Git**, the project's save-history tool | ❌ No |
| `.git` (hidden) | Git's saved history of every change ("versions") | ❌ Never |
| `node_modules` | Thousands of downloaded tool files. Created automatically | ❌ Never. Safe to delete; it's re-downloaded |
| `dist` | The finished, packaged app, created when you "build" it | ❌ Never. Created automatically |
| `test-results` | Leftovers from browser tests | ❌ Never. Safe to delete |

---

## Inside `src` (the app's code)

| Name | What it is |
| --- | --- |
| `main.tsx` | **Starting point.** The first code that runs; it starts the app |
| `App.tsx` | **The map of pages**: which web address shows which page |
| `index.css` | **The look**: colours (dark navy, green), fonts and spacing for the whole app |
| **`pages`** | One file per page of the app (see below) |
| **`components`** | Reusable building blocks for pages: cards, buttons, charts, forms |
| **`lib`** | **The brains**: every calculation (money, dates, categories, reports…). No screen code |
| **`data`** | Saving and loading your data in the browser, plus the fictional sample data |
| **`store`** | Keeps the latest data in memory so every page shows the same numbers |
| **`types`** | Descriptions of what each kind of data looks like (a transaction, an account…) |
| **`hooks`** | Small helpers pages share: insights, and the selected period (remembered across Dashboard, Analytics and Reports) |
| **`test`** | Helpers used only by the automatic checks |

### `src/pages`: one file per screen

| File | The page |
| --- | --- |
| `DashboardPage.tsx` | **Dashboard**: home screen with live balances, totals, balance check, budgets and charts |
| `UploadPage.tsx` | **Import**: upload bank statements (CSV files) |
| `TransactionsPage.tsx` | **Transactions**: add, edit, delete, search, filter, sort, change categories, rules |
| `BudgetsPage.tsx` | **Budgets**: monthly limits per category vs what you spent |
| `AnalyticsPage.tsx` | **Analytics**: detailed charts, by month, quarter or year |
| `InsightsPage.tsx` | **Insights**: plain-English findings |
| `ReportsPage.tsx` | **Reports**: monthly report and PDF export |
| `SubscriptionsPage.tsx` | **Subscriptions**: recurring payments |
| `WealthPage.tsx` | **Wealth**: assets, debts and net worth |
| `SettingsPage.tsx` | **Settings**: backup, restore, delete all data |
| `NotFoundPage.tsx` | The "page not found" message |

### `src/components`: building blocks, grouped by page

| Folder / file | Contains |
| --- | --- |
| `layout` | The frame around every page: side menu, mobile menu, error message screen |
| `ui` | Generic pieces used everywhere: cards, buttons, pop-up confirmations, page titles |
| `dashboard` | Dashboard pieces: balance card, summary boxes, spending list |
| `charts` | The charts (income vs spending, savings rate, category trend) |
| `upload` | Import pieces: drop area, column matching, review list, import history |
| `transactions` | Add/edit form, category picker, rules panel, "create a rule?" prompt |
| `budgets` | The budget progress bar |
| `analytics` | Analytics pieces: time-range buttons, category ranking, comparison table |
| `insights` | The insight card |
| `subscriptions` | One subscription row |
| `wealth` | Net worth chart and the add/update forms |
| `categories.ts` | Which icon goes with which category |
| `CategoryLabel.tsx` | A category's icon and name, side by side |

### `src/lib`: the calculations

| Folder / file | What it calculates |
| --- | --- |
| `money.ts` | Money in **cents** (to avoid rounding errors), reading amounts like "CA$1,234.56" or "1 234,56 $", showing amounts as CAD |
| `dates.ts` | Dates and months |
| `transactions.ts` | Transaction types (income, expense, refund, transfer), sorting, searching and filtering |
| `transactionForm.ts` | Checking what you type in the add/edit form |
| `budgets` | Budget vs actual spending |
| `balances` | Running balances from statements (`checkpoints.ts`), and the balance check (opening + income − expenses = expected closing), and where each opening balance comes from (user-provided, inferred, estimated or unknown) |
| `backup.ts` | Creating and checking backup files |
| `csv` | Reading bank statement files: finding columns, dates, amounts, duplicates |
| `categorize` | Sorting transactions into categories, and spotting transfers between your accounts |
| `analytics` | Totals, savings rate, live account balances, monthly/quarterly/yearly grouping, comparisons, chart data |
| `recurring` | Finding recurring payments and subscriptions |
| `report` | Building the monthly report and its PDF |
| `insights` | The rules that write the insights |
| `wealth` | Net worth (assets minus debts) |

### `src/data`, `src/store`, `src/types`

| File | What it does |
| --- | --- |
| `data/db.ts` | Sets up the **browser's private storage** (IndexedDB) where your data lives |
| `data/repository.ts` | Every save, load and delete goes through here |
| `data/sampleData.ts` | The **fictional** example data shown before you import anything |
| `store/financeStore.ts` | Keeps your data in memory for the pages |
| `types/*.ts` | What a transaction, account, import or wealth item contains |

---

## Files ending in `.test.ts`

Each one sits next to the file it checks. For example, `money.test.ts` checks `money.ts`. There are 329 checks in total, and they never change your data. They run with the command `npm test`.

## Where is my data?

**Not in this folder.** Your imported transactions are stored inside your web browser, on this computer only. To keep a copy, use **Settings → Download backup**.
