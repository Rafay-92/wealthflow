import type { StoredData } from '../data/repository'

export const BACKUP_FORMAT_VERSION = 1

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
    isEmpty: Object.values(data).every((list) => list.length === 0),
  }
}
