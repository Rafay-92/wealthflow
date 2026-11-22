import path from 'node:path'
import { expect, fitsScreen, importSample, PAGES, SAMPLES, test } from './fixtures'

test.describe('with sample data', () => {
  test('every page renders, with a title and the sample-data notice', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url)
      await expect(page.locator('main h1')).toBeVisible()
      await expect(page).toHaveTitle(/WealthFlow/)
    }
    await page.goto('/')
    await expect(page.getByText('You’re viewing fictional sample data.').or(page.getByText("You're viewing fictional sample data."))).toBeVisible()
  })

  test('the production build ships a Content Security Policy', async ({ page }) => {
    await page.goto('/')
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("connect-src 'self'")
  })

  test('unknown URLs show a friendly 404', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  })

  test('amounts are shown in Canadian dollars', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('All amounts are in Canadian dollars (CAD).')).toBeVisible()
  })
})

test.describe('importing statements', () => {
  test('chequing, overlapping chequing and credit card: duplicates, transfers and totals', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })

    // The overlapping file reuses saved settings and skips the 13 rows already imported.
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'everyday-chequing-oct15-nov20.csv'))
    await expect(page.getByText('Using your saved settings for this file layout')).toBeVisible()
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await expect(page.locator('p', { hasText: /^Already imported/ }).locator('..')).toContainText('13')
    await page.getByRole('button', { name: /^Import \d/ }).click()
    // Wait for the save to finish before navigating away, as a person would.
    await expect(page.getByRole('heading', { name: 'Imported 19 transactions' })).toBeVisible()

    await importSample(page, 'rewards-card-nov.csv', { name: 'Rewards Card', type: 'credit' })

    await page.goto('/')
    await expect(page.getByText('fictional sample data')).toHaveCount(0)
    // Two paycheques + one invoice; the card payment and refund are not income.
    await expect(page.locator('p', { hasText: /^Income$/ }).locator('..')).toContainText('$5,500.00')

    await page.goto('/transactions')
    const cardPayment = page.locator('li', { hasText: 'ONLINE PMT REWARDS CARD' })
    await expect(cardPayment).toContainText('Matches +$425.00 in Rewards Card')
    await expect(page.getByRole('button', { name: 'Needs review · 0' })).toBeVisible()
  })

  test('a French-language (Quebec) export is read correctly', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'compte-cheques-nov.csv'))
    await expect(page.getByLabel('Number format')).toHaveValue('comma')
    await page.getByLabel('New account name').fill('Compte chèques')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await expect(page.getByText('+$2,380.00').first()).toBeVisible()
    await expect(page.getByRole('region', { name: 'Statement summary' })).toContainText('$5,667.25') // closing balance, from "5 667,25"
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await expect(page.getByRole('heading', { name: 'Imported 10 transactions' })).toBeVisible() // saved
    await page.goto('/transactions')
    await expect(page.locator('li', { hasText: 'HYDRO-QUÉBEC' }).getByRole('combobox')).toHaveValue('Utilities')
  })

  test('Scotiabank style: purchases are spending, not income, and every page works afterwards', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'scotiabank-style.csv'))
    await expect(page.getByLabel('Debit / Credit column')).toHaveValue('5') // "Type of Transaction"
    await expect(page.getByText('6 money out (−) · 2 money in (+)')).toBeVisible()
    await page.getByLabel('New account name').fill('Scotia Chequing')
    await page.getByLabel('Balance today (optional)').fill('3,512.40')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await expect(page.locator('li', { hasText: 'ALIBABA.COM' })).toContainText('-$89.99')
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await expect(page.getByRole('heading', { name: 'Imported 8 transactions' })).toBeVisible()

    await page.goto('/')
    await expect(page.locator('p', { hasText: /^Income$/ }).locator('..')).toContainText('$4,900.00')
    await expect(page.locator('p', { hasText: /^Expenses$/ }).locator('..')).toContainText('$285.58')
    await expect(page.getByText('$3,512.40').first()).toBeVisible() // the balance typed in

    for (const url of PAGES) {
      await page.goto(url)
      await expect(page.locator('main h1'), url).toBeVisible()
      await expect(page.getByText(/Something went wrong|couldn’t be loaded/), url).toHaveCount(0)
    }
  })

  test('TD style: a file without a header row keeps its first transaction', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'td-style-no-header.csv'))
    await expect(page.getByText('td-style-no-header.csv · 6 rows')).toBeVisible()
    await page.getByLabel('New account name').fill('TD Chequing')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await expect(page.locator('li', { hasText: 'PAYROLL ACME' }).first()).toContainText('+$2,450.00')
    await expect(page.locator('li', { hasText: 'ALIBABA.COM' })).toContainText('-$89.99')
    await expect(page.getByText('updated to $8,247.37')).toBeVisible()
  })

  test('warns when a file would turn all spending into income', async ({ page }) => {
    await page.goto('/upload')
    const csv = ['Date,Description,Amount', '2026-11-01,PAY,2450.00', '2026-11-02,ALIBABA.COM,89.99'].join('\n')
    await page.locator('input[type=file]').setInputFiles({ name: 'unsigned.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByText('Every transaction is being read as money IN')).toBeVisible()
    await page.getByRole('checkbox', { name: /Flip signs/ }).check()
    await expect(page.getByText('Every transaction is being read as money IN')).toHaveCount(0)
  })

  test('unsupported files are rejected with a clear message', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') })
    await expect(page.getByRole('alert')).toContainText('PDF statements aren’t supported yet')
  })
})

test.describe('features', () => {
  test('categories, rules and subscriptions are saved', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    await page.goto('/transactions')
    const starbucks = page.locator('li', { hasText: 'STARBUCKS' }).first()
    await starbucks.getByRole('combobox').selectOption('Entertainment')
    await page.getByRole('region', { name: 'Create a rule' }).getByRole('button', { name: 'Create rule' }).click()
    await expect(page.getByRole('status')).toContainText('Rule created')
    await page.reload()
    await expect(page.getByText('“STARBUCKS”', { exact: false }).first()).toBeVisible()
  })

  test('balance check: a statement with a running balance gives bank-reported balances that reconcile', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    await page.goto('/?month=2026-10')
    const income = page.locator('p', { hasText: /^Income$/ }).locator('..')
    const incomeBefore = await income.innerText()
    const card = page.locator('[data-testid^="balance-check-"]')

    // The file's balance column gives the bank's own opening and closing.
    await expect(card).toContainText('Opening balance (Oct 1)')
    await expect(card).toContainText('$3,512.40')
    await expect(card.getByTestId('opening-source')).toHaveText('Bank-reported')
    await expect(card).toContainText('Bank-reported closing')
    await expect(card).toContainText('$5,381.83')
    await expect(card.getByRole('status')).toContainText('Balanced')
    await expect(card.getByTestId('checkpoint-summary')).toContainText('all match')

    // A balance you type is never overwritten by the bank's, and a wrong one shows a difference.
    await card.getByRole('button', { name: /Edit balances/ }).click()
    await card.getByPlaceholder('e.g. 5,000.00').fill('3,500.00')
    await card.getByRole('button', { name: 'Save balances' }).click()
    await expect(card.getByTestId('opening-source')).toHaveText('User-provided')
    await expect(card.getByRole('status')).toContainText('Difference: +$12.40')

    await page.reload()
    await expect(card.getByTestId('opening-source')).toHaveText('User-provided') // saved
    expect(await income.innerText()).toBe(incomeBefore) // balances never change income
  })

  test('an inferred opening is labelled and never shown as verified', async ({ page }) => {
    // No balance column: the "Balance today" typed at import is the only bank figure.
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(process.cwd(), 'e2e', 'data', 'period-nov22-dec22.csv'))
    await page.getByLabel('New account name').fill('Test Chequing')
    await page.getByLabel('Balance today (optional)').fill('7,860.60')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await expect(page.getByRole('heading', { name: 'Imported 24 transactions' })).toBeVisible()
    await page.goto('/?from=2026-12-01&to=2026-12-22')
    const card = page.locator('[data-testid^="balance-check-"]')
    await expect(card.getByTestId('opening-source')).toHaveText('Inferred from a reported closing balance')
    await expect(card.getByRole('status')).toContainText('Can’t be verified')
  })

  test('custom period Nov 22 – Dec 22: every figure follows the chosen dates; the monthly view is unchanged', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(process.cwd(), 'e2e', 'data', 'period-nov22-dec22.csv'))
    await page.getByLabel('New account name').fill('Test Chequing')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await expect(page.getByRole('heading', { name: 'Imported 24 transactions' })).toBeVisible()

    const stat = (label: string) => page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('..')
    const card = page.locator('[data-testid^="balance-check-"]')

    // Calendar month (December) is unchanged.
    await page.goto('/?month=2026-12')
    await expect(page.getByText(/^Calendar month · December 2026, month to date/)).toBeVisible()
    await expect(stat('Income')).toContainText('$1,000.00')
    await expect(stat('Expenses')).toContainText('$1,140.74')
    await expect(stat('Net cash flow')).toContainText('-$140.74')

    // Choose any dates in the picker, then Apply.
    await page.getByRole('button', { name: /^Period:/ }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a period' })
    await picker.getByLabel('Start date').fill('2026-11-22')
    await picker.getByLabel('End date').fill('2026-12-22')
    await picker.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/from=2026-11-22&to=2026-12-22/)
    await expect(page.getByTestId('active-range')).toHaveText('Nov 22 – Dec 22, 2026')
    await expect(page.getByText('Custom period · Nov 22 – Dec 22, 2026 · 31 days · 24 transactions')).toBeVisible()
    await expect(stat('Income')).toContainText('$4,500.00')
    await expect(stat('Expenses')).toContainText('$1,639.40')
    await expect(stat('Net cash flow')).toContainText('$2,860.60')
    await expect(stat('Savings rate')).toContainText('63.57%')

    // No balance column and nothing typed: the opening is Unknown, never assumed.
    await expect(card.getByTestId('opening-source')).toHaveText('Unknown')
    await card.getByRole('button', { name: 'Add opening balance' }).click()
    await card.getByPlaceholder('e.g. 5,000.00').fill('5,000')
    await card.getByRole('button', { name: 'Save balances' }).click()
    await expect(card.getByTestId('opening-source')).toHaveText('User-provided')
    await expect(card).toContainText('$9,500.00') // total available funds
    await expect(card).toContainText('= Expected closing (Dec 22)')
    await expect(card).toContainText('$7,860.60')
    await expect(stat('Income')).toContainText('$4,500.00') // the opening is not income

    // The period is remembered: Reports opens on the same dates.
    await page.getByRole('navigation').getByRole('link', { name: 'Reports', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Custom period report' })).toBeVisible()
    await expect(page.getByTestId('report-dates')).toContainText('Exact dates: Nov 22 – Dec 22, 2026 (31 days, both included)')
    await expect(stat('Income')).toContainText('$4,500.00')
    await expect(stat('Spending')).toContainText('$1,639.40')
    await expect(page.getByRole('cell', { name: '$7,860.60' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'User-provided' })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF' }).click()
    expect((await download).suggestedFilename()).toBe('wealthflow-report-2026-11-22-to-2026-12-22.pdf')

    // The transactions link opens exactly the period.
    await page.goto('/?from=2026-11-22&to=2026-12-22')
    await page.getByRole('link', { name: 'View all 24' }).click()
    await expect(page.getByText(/^24 shown/)).toBeVisible()
  })

  test('statement Dec 23 – Jan 22 with a running balance: import summary, statement period, presets and comparisons', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('input[type=file]').setInputFiles(path.join(process.cwd(), 'e2e', 'data', 'statement-dec23-jan22.csv'))
    await page.getByLabel('New account name').fill('Statement Chequing')
    await page.getByRole('button', { name: 'Review transactions' }).click()
    const summary = page.getByRole('region', { name: 'Statement summary' })
    await expect(summary).toContainText('Dec 23, 2026 – Jan 22, 2027') // the file's own dates, not a calendar month
    await expect(summary).toContainText('$3,800.00') // money in
    await expect(summary).toContainText('$1,748.77') // money out
    await expect(summary).toContainText('Yes · ends at $9,911.83')
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await page.getByRole('link', { name: 'View this statement period' }).click()

    const stat = (label: string) => page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('..')
    const card = page.locator('[data-testid^="balance-check-"]')
    await expect(page.getByTestId('active-range')).toHaveText('Dec 23, 2026 – Jan 22, 2027')
    await expect(stat('Income')).toContainText('$3,800.00')
    await expect(stat('Expenses')).toContainText('$1,748.77')
    // Running balances are checkpoints: the bank's own opening and closing, every day checked.
    await expect(card.getByTestId('opening-source')).toHaveText('Bank-reported')
    await expect(card).toContainText('$7,860.60')
    await expect(card).toContainText('$9,911.83')
    await expect(card.getByRole('status')).toContainText('Balanced')
    await expect(card.getByTestId('checkpoint-summary')).toContainText('all match')
    await expect(page.getByTestId('total-balance')).toHaveText('$9,911.83') // current balance

    // January as a calendar month: the verified January figures, current balance unchanged.
    await page.getByRole('button', { name: /^Period:/ }).click()
    await page.getByRole('dialog', { name: 'Choose a period' }).getByLabel('Calendar month').selectOption('2027-01')
    await expect(stat('Income')).toContainText('$600.00')
    await expect(stat('Expenses')).toContainText('$1,415.13')
    await expect(page.getByTestId('total-balance')).toHaveText('$9,911.83') // a historical period doesn't change it

    // Presets count back from the latest transaction (Jan 22, 2027 is after today).
    await page.getByRole('button', { name: /^Period:/ }).click()
    await page.getByRole('dialog', { name: 'Choose a period' }).getByRole('button', { name: 'Last 7 days' }).click()
    await expect(page.getByTestId('active-range')).toHaveText('Jan 16 – Jan 22, 2027')

    // Jan 23 – Feb 22 vs the previous equivalent period, Dec 23 – Jan 22 (31 days each).
    await page.getByRole('button', { name: /^Period:/ }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a period' })
    await picker.getByLabel('Start date').fill('2027-02-22')
    await picker.getByLabel('End date').fill('2027-01-23')
    await expect(picker.getByRole('alert')).toContainText('on or after the start date')
    await expect(picker.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await picker.getByLabel('Start date').fill('2027-01-23')
    await picker.getByLabel('End date').fill('2027-02-22')
    await picker.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByTestId('custom-period-note')).toContainText('(Dec 23, 2026 – Jan 22, 2027)')
    await page.getByLabel('Compare with').selectOption('none')
    await expect(stat('Income')).toContainText('No comparison selected')

    // Reset returns to the latest calendar month.
    await page.getByRole('button', { name: /^Period:/ }).click()
    await page.getByRole('dialog', { name: 'Choose a period' }).getByRole('button', { name: 'Reset' }).click()
    await expect(page).toHaveURL(/month=2027-01/)
  })

  test('the dashboard can show one account or all accounts', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    await importSample(page, 'rewards-card-nov.csv', { name: 'Rewards Card', type: 'credit' })
    await page.goto('/?from=2026-10-01&to=2026-11-30')
    const count = async () => Number((await page.getByRole('link', { name: /^View all \d+/ }).innerText()).match(/\d+/)![0])
    const all = await count()
    await page.getByLabel('Account').selectOption({ label: 'Rewards Card' })
    await expect(page.getByText(/· Rewards Card only$/)).toBeVisible()
    const card = await count()
    expect(card).toBeGreaterThan(0)
    expect(card).toBeLessThan(all)
  })

  test('analytics follows a custom range, grouped by day or week', async ({ page }) => {
    await page.goto('/?from=2026-10-01&to=2026-10-31')
    await page.getByRole('navigation').getByRole('link', { name: 'Analytics', exact: true }).first().click()
    await expect(page.getByText(/^Custom period · Oct 1 – Oct 31, 2026/)).toBeVisible() // remembered from the Dashboard
    await expect(page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Daily' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'Weekly' }).click()
    await expect(page.getByText(/^Per week · \d+ weeks/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Period over period' })).toBeVisible()
  })

  test('live transactions: adding, editing and deleting update the dashboard without a reload', async ({ page }) => {
    const nav = (name: string) => page.getByRole('navigation').getByRole('link', { name, exact: true }).first()
    const stat = (label: string) => page.locator('p', { hasText: new RegExp(`^${label}$`) }).locator('..')

    await page.goto('/transactions')
    // A marker on the page: if anything below did a full reload, it would vanish.
    await page.evaluate(() => ((window as unknown as { liveMarker: number }).liveMarker = 1))

    const add = async (direction: 'Money in' | 'Money out', amount: string, description: string) => {
      await page.getByRole('button', { name: 'Add transaction' }).first().click()
      const form = page.getByRole('dialog', { name: 'Add transaction' })
      await form.getByText(direction).click()
      await form.getByLabel('Amount (CAD)').fill(amount)
      await form.getByLabel('Date').fill('2026-11-02')
      await form.getByLabel('Description').fill(description)
      if (await form.getByLabel('New account name').isVisible()) await form.getByLabel('New account name').fill('Cash Wallet')
      await form.getByRole('button', { name: 'Add transaction' }).click()
      await expect(page.getByRole('status').filter({ hasText: 'Transaction added' })).toBeVisible()
    }
    await add('Money in', '1000', 'ACME PAYROLL')
    await add('Money out', '45.99', 'LOBLAWS #12')
    await expect(page.locator('li', { hasText: 'LOBLAWS #12' }).getByRole('combobox')).toHaveValue('Groceries') // categorised automatically

    await nav('Dashboard').click()
    await expect(stat('Income')).toContainText('$1,000.00')
    await expect(stat('Expenses')).toContainText('$45.99')
    await expect(stat('Net cash flow')).toContainText('$954.01')

    // Edit: the purchase was really $1,100, so net cash flow goes negative.
    await nav('Transactions').click()
    await page.getByRole('button', { name: 'Edit LOBLAWS #12' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit transaction' })
    await edit.getByLabel('Amount (CAD)').fill('1100')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Transaction saved' })).toBeVisible()
    await nav('Dashboard').click()
    await expect(stat('Expenses')).toContainText('$1,100.00')
    await expect(stat('Net cash flow')).toContainText('-$100.00')

    // Delete it.
    await nav('Transactions').click()
    await page.getByRole('button', { name: 'Edit LOBLAWS #12' }).click()
    await page.getByRole('dialog', { name: 'Edit transaction' }).getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete transaction' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Transaction deleted' })).toBeVisible()
    await nav('Dashboard').click()
    await expect(stat('Expenses')).toContainText('$0.00')
    await expect(stat('Income')).toContainText('$1,000.00')

    // Account balance: opening $500 + $1,000 pay = $1,500, and it moves with every new transaction.
    await expect(page.getByText('Not provided')).toBeVisible()
    const check = page.locator('[data-testid^="balance-check-"]')
    await check.getByRole('button', { name: 'Add opening balance' }).click()
    await check.getByPlaceholder('e.g. 5,000.00').fill('500')
    await check.getByRole('button', { name: 'Save balances' }).click()
    await expect(page.getByTestId('total-balance')).toHaveText('$1,500.00')
    await expect(stat('Income')).toContainText('$1,000.00') // the opening balance is not income
    await nav('Transactions').click()
    await add('Money out', '200', 'TIM HORTONS')
    await nav('Dashboard').click()
    await expect(page.getByTestId('total-balance')).toHaveText('$1,300.00')
    await expect(check).toContainText('$1,300.00') // expected closing in the balance check agrees

    expect(await page.evaluate(() => (window as unknown as { liveMarker?: number }).liveMarker)).toBe(1) // never reloaded
    await page.reload()
    await expect(stat('Income')).toContainText('$1,000.00') // and it was all saved
  })

  test('analytics switches between monthly, quarterly and yearly, with consistent totals', async ({ page }) => {
    await page.goto('/analytics')
    const group = page.getByRole('group', { name: 'Group by' })
    await page.getByRole('group', { name: 'Time range' }).getByRole('button', { name: 'All' }).click()
    const income = page.locator('p', { hasText: /^Total income$/ }).locator('..')
    const monthlyIncome = await income.innerText()

    await group.getByRole('button', { name: 'Quarterly' }).click()
    await expect(page.getByRole('heading', { name: 'Quarter over quarter' })).toBeVisible()
    await expect(page.getByText(/^Per quarter · \d+ quarters?/)).toBeVisible()
    expect(await income.innerText()).toBe(monthlyIncome) // same data, grouped differently

    await group.getByRole('button', { name: 'Yearly' }).click()
    await expect(page.getByRole('heading', { name: 'Year over year' })).toBeVisible()
    expect(await income.innerText()).toBe(monthlyIncome)
    await expect(page.getByRole('group', { name: 'Time range' })).toHaveCount(0) // ranges are for the monthly view
  })

  test('budgets: budget, spent, remaining and % used, updated as transactions change', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    await page.goto('/budgets?month=2026-10')
    const add = page.getByRole('form', { name: 'Add a budget' })
    await add.getByLabel('Category').selectOption('Groceries')
    await add.getByLabel('Monthly budget (CAD)').fill('100')
    await add.getByRole('button', { name: 'Add budget' }).click()
    await expect(page.getByRole('status')).toContainText('Groceries budget set to $100.00')

    const row = page.getByTestId('budget-Groceries')
    const spentText = (await row.innerText()).match(/\$([\d,.]+) of \$100\.00/)
    expect(spentText).not.toBeNull()
    const spentBefore = Number(spentText![1]!.replace(/,/g, ''))

    // Add a $25 grocery purchase: the budget updates without a reload.
    await page.getByRole('navigation').getByRole('link', { name: 'Transactions', exact: true }).first().click()
    await page.getByRole('button', { name: 'Add transaction' }).first().click()
    const form = page.getByRole('dialog', { name: 'Add transaction' })
    await form.getByLabel('Amount (CAD)').fill('25')
    await form.getByLabel('Date').fill('2026-10-30')
    await form.getByLabel('Description').fill('LOBLAWS #99')
    await form.getByRole('button', { name: 'Add transaction' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Transaction added' })).toBeVisible()
    await page.getByRole('navigation').getByRole('link', { name: 'Budgets', exact: true }).first().click()
    const after = (spentBefore + 25).toLocaleString('en-CA', { minimumFractionDigits: 2 })
    await expect(row).toContainText(`$${after} of $100.00`)
    await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuetext', `${Math.round(spentBefore + 25)}% used`)

    await page.reload()
    await expect(row).toContainText(`$${after} of $100.00`) // the budget was saved
    await page.goto('/?month=2026-10')
    await expect(page.getByRole('progressbar', { name: 'Groceries budget used' })).toBeVisible() // on the dashboard too
  })

  test('report exports a PDF', async ({ page }) => {
    await page.goto('/reports?month=2026-10')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export PDF' }).click()
    expect((await download).suggestedFilename()).toBe('wealthflow-report-2026-10.pdf')
  })

  test('wealth: net worth = assets − liabilities, saved across reloads', async ({ page }) => {
    await page.goto('/wealth')
    const add = async (name: string, type: string, value: string) => {
      await page.getByPlaceholder('e.g. Brokerage account').fill(name)
      await page.locator('form select').selectOption(type)
      await page.getByPlaceholder('$0.00').fill(value)
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      // Saved once the item is listed and the form has closed.
      await expect(page.getByRole('button', { name: `Delete ${name}` })).toBeVisible()
    }
    await add('TFSA', 'registered', '20000')
    await page.getByRole('button', { name: 'Add an asset or debt' }).click()
    await add('Line of credit', 'line-of-credit', '3500')
    await page.reload()
    await expect(page.locator('p', { hasText: /^Net worth$/ }).locator('..')).toContainText('$16,500.00')
  })

  test('backup and restore round trip', async ({ page }) => {
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    await page.goto('/settings')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download backup' }).click()
    const backupPath = await (await downloading).path()

    await page.getByRole('button', { name: 'Delete all data' }).click()
    await page.getByRole('button', { name: 'Delete everything' }).click()
    await expect(page.getByRole('status')).toContainText('All data was deleted')

    await page.getByLabel('Backup file').setInputFiles(backupPath)
    await expect(page.getByRole('dialog')).toContainText('has 25 transactions')
    await page.getByRole('button', { name: 'Replace my data' }).click()
    await expect(page.getByRole('status')).toContainText('Restored 25 transactions')
    await page.goto('/')
    await expect(page.getByText('fictional sample data')).toHaveCount(0)
  })

  test('a file that is not a backup is refused, and nothing changes', async ({ page }) => {
    await page.goto('/settings')
    await page.getByLabel('Backup file').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
    await expect(page.getByRole('alert')).toContainText('isn’t a WealthFlow backup')
  })
})

test.describe('phones and keyboards', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no page scrolls sideways on a phone, with or without data', async ({ page }) => {
    for (const url of PAGES) {
      await page.goto(url)
      await expect(page.locator('main h1')).toBeVisible()
      expect(await fitsScreen(page), `${url} fits a 390px screen`).toBe(true)
    }
    await importSample(page, 'everyday-chequing-oct.csv', { name: 'Everyday Chequing' })
    for (const url of PAGES) {
      await page.goto(url)
      await expect(page.locator('main h1')).toBeVisible()
      expect(await fitsScreen(page), `${url} fits with real data`).toBe(true)
    }
  })

  test('the closed menu cannot be reached with Tab; the skip link can', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('div[inert] nav')).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.locator('div[inert] nav')).toHaveCount(0)
  })
})
