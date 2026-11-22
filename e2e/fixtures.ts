import { expect, test as base, type Page } from '@playwright/test'
import path from 'node:path'

export const SAMPLES = path.join(process.cwd(), 'public', 'sample-data')
export const PAGES = ['/', '/upload', '/transactions', '/analytics', '/budgets', '/insights', '/reports', '/subscriptions', '/wealth', '/settings']

/**
 * Every test automatically fails if the page logs an error, throws, or the
 * Content Security Policy blocks anything. Tests only need to check their
 * own behaviour; these safety nets apply everywhere.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`))
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP blocked ${e.violatedDirective} ${e.blockedURI}`))
      })
      await use(problems)
      expect(problems, 'console errors, crashes or CSP violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Imports one of the sample CSVs through the real UI. */
export async function importSample(page: Page, file: string, account?: { name: string; type?: 'checking' | 'savings' | 'credit' }) {
  await page.goto('/upload')
  await page.locator('input[type=file]').setInputFiles(path.join(SAMPLES, file))
  await expect(page.getByRole('heading', { name: 'Match the columns' })).toBeVisible()
  const newName = page.getByLabel('New account name')
  if (account && (await newName.isVisible())) {
    await newName.fill(account.name)
    if (account.type) await page.getByLabel('Account type').selectOption(account.type)
  }
  await page.getByRole('button', { name: 'Review transactions' }).click()
  await page.getByRole('button', { name: /^Import \d/ }).click()
  await expect(page.getByRole('heading', { name: /^Imported \d+ transaction/ })).toBeVisible()
}

/** True when nothing on the page is wider than the screen (no sideways scrolling). */
export async function fitsScreen(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
}
