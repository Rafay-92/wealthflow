import type { StoredData } from '../data/repository'
import { CATEGORIES } from '../types/transaction'
import { WEALTH_TYPES } from '../types/wealth'
import { pointsFromMonthlyBalances, type MonthlyBalance } from '../types/balance'
import { isISODate } from './dates'
import { isCents } from './money'

/**
 * 2 added monthlyBalances; 3 added deletedTransactions and budgets;
 * 4 replaced monthlyBalances with balancePoints (balances per date).
 * Older backups still restore: missing lists are empty, monthly balances are converted.
 */
export const BACKUP_FORMAT_VERSION = 4
/** Larger than any realistic backup; anything bigger is refused before reading. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024

const TABLES = ['transactions', 'accounts', 'imports', 'mappings', 'rules', 'subscriptionDecisions', 'wealthItems', 'wealthEntries', 'balancePoints', 'deletedTransactions', 'budgets'] as const

export interface Backup extends StoredData {
  app: 'WealthFlow'
  formatVersion: number
  exportedAt: string
}

/**
 * Everything WealthFlow stores, as one JSON document you can keep.
 * It contains your financial data in plain text, so the UI tells you to
 * store it somewhere safe.
 */
export function createBackup(data: StoredData, now: Date = new Date()): Backup {
  return { app: 'WealthFlow', formatVersion: BACKUP_FORMAT_VERSION, exportedAt: now.toISOString(), ...data }
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `wealthflow-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Counts of what's stored, for the Settings page. */
export function summarizeData(data: StoredData) {
  return {
    transactions: data.transactions.length,
    accounts: data.accounts.length,
    imports: data.imports.length,
    rules: data.rules.length,
    subscriptionDecisions: data.subscriptionDecisions.length,
    wealthItems: data.wealthItems.length,
    wealthEntries: data.wealthEntries.length,
    balancePoints: data.balancePoints.length,
    budgets: data.budgets.length,
    isEmpty: TABLES.every((t) => data[t].length === 0),
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const categories = new Set<string>(CATEGORIES)
const wealthTypes = new Set<string>(WEALTH_TYPES.map((t) => t.value))

/**
 * Reads and checks a backup file before anything is replaced.
 *
 * A backup is UNTRUSTED input: it may be from another app, an older or newer
 * version, hand-edited, or damaged. Restoring a bad one would corrupt every
 * figure in the app, so we check the structure and the money-critical fields
 * (dates, whole-cent amounts, categories) and refuse with a clear reason.
 *
 * @returns the backup, or an error message for the user.
 */
export function parseBackup(text: string): Backup | string {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return 'This file isn’t valid JSON, so it can’t be a WealthFlow backup.'
  }
  if (!isObject(raw) || raw.app !== 'WealthFlow') return 'This file isn’t a WealthFlow backup.'
  if (typeof raw.formatVersion !== 'number' || !Number.isInteger(raw.formatVersion)) return 'The backup’s version is missing.'
  if (raw.formatVersion > BACKUP_FORMAT_VERSION) return 'This backup was made by a newer version of WealthFlow.'
  // Version-1 backups were made before monthly balances existed.
  if (raw.formatVersion < 2 && raw.monthlyBalances === undefined) raw.monthlyBalances = []
  // ...and before deleted-transaction records and budgets.
  if (raw.formatVersion < 3) {
    raw.deletedTransactions ??= []
    raw.budgets ??= []
  }
  if (raw.formatVersion < 4) {
    const old = raw.monthlyBalances
    if (!Array.isArray(old) || !old.every(isObject)) return 'The backup’s “monthlyBalances” list is damaged.'
    const nullableCents = (v: unknown) => v === null || isCents(v)
    for (const [i, b] of (old as Record<string, unknown>[]).entries()) {
      if (typeof b.id !== 'string' || typeof b.accountId !== 'string' || typeof b.month !== 'string' || !/^\d{4}-\d{2}$/.test(b.month) || !nullableCents(b.opening) || !nullableCents(b.actualClosing)) {
        return `Monthly balance ${i + 1} in the backup is invalid, so nothing was restored.`
      }
    }
    const dates = Array.isArray(raw.transactions) ? (raw.transactions as { date?: unknown }[]).map((t) => t?.date).filter((d): d is string => typeof d === 'string').sort() : []
    raw.balancePoints = pointsFromMonthlyBalances(old as unknown as MonthlyBalance[], dates.at(-1) ?? null)
    delete raw.monthlyBalances
  }
  for (const table of TABLES) {
    if (!Array.isArray(raw[table])) return `The backup is incomplete: “${table}” is missing.`
    if (!(raw[table] as unknown[]).every(isObject)) return `The backup’s “${table}” list is damaged.`
  }

  const transactions = raw.transactions as Record<string, unknown>[]
  for (const [i, t] of transactions.entries()) {
    const problem =
      typeof t.id !== 'string' ? 'has no id'
      : typeof t.date !== 'string' || !isISODate(t.date) ? 'has an invalid date'
      : !isCents(t.amount) ? 'has an invalid amount'
      : typeof t.category !== 'string' || !categories.has(t.category) ? 'has an unknown category'
      : typeof t.description !== 'string' ? 'has no description'
      : null
    if (problem) return `Transaction ${i + 1} in the backup ${problem}, so nothing was restored.`
  }
  for (const [i, item] of (raw.wealthItems as Record<string, unknown>[]).entries()) {
    if (typeof item.id !== 'string' || typeof item.type !== 'string' || !wealthTypes.has(item.type)) {
      return `Wealth item ${i + 1} in the backup is invalid, so nothing was restored.`
    }
  }
  for (const [i, e] of (raw.wealthEntries as Record<string, unknown>[]).entries()) {
    if (typeof e.itemId !== 'string' || typeof e.date !== 'string' || !isISODate(e.date) || !isCents(e.value)) {
      return `Wealth value ${i + 1} in the backup is invalid, so nothing was restored.`
    }
  }
  for (const [i, p] of (raw.balancePoints as Record<string, unknown>[]).entries()) {
    if (typeof p.id !== 'string' || typeof p.accountId !== 'string' || typeof p.date !== 'string' || !isISODate(p.date) || !isCents(p.amount)) {
      return `Balance ${i + 1} in the backup is invalid, so nothing was restored.`
    }
  }
  for (const [i, d] of (raw.deletedTransactions as Record<string, unknown>[]).entries()) {
    if (typeof d.id !== 'string' || typeof d.accountId !== 'string' || typeof d.importId !== 'string' || typeof d.importKey !== 'string') {
      return `Deleted-transaction record ${i + 1} in the backup is invalid, so nothing was restored.`
    }
  }
  for (const [i, b] of (raw.budgets as Record<string, unknown>[]).entries()) {
    if (typeof b.category !== 'string' || !categories.has(b.category) || !isCents(b.amount) || (b.amount as number) <= 0) {
      return `Budget ${i + 1} in the backup is invalid, so nothing was restored.`
    }
  }
  if (new Set(transactions.map((t) => t.id)).size !== transactions.length) return 'The backup contains duplicate transactions.'

  return raw as unknown as Backup
}

/** Just the stored tables from a backup (drops the header fields). */
export function backupData(backup: Backup): StoredData {
  return Object.fromEntries(TABLES.map((t) => [t, backup[t]])) as unknown as StoredData
}
