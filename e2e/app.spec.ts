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
    await expect(page.getByText('$5,667.25')).toBeVisible() // closing balance, from "5 667,25"
    await page.getByRole('button', { name: /^Import \d/ }).click()
    await expect(page.getByRole('heading', { name: 'Imported 10 transactions' })).toBeVisible() // saved
    await page.goto('/transactions')
    await expect(page.locator('li', { hasText: 'HYDRO-QUÉBEC' }).getByRole('combobox')).toHaveValue('Utilities')
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
