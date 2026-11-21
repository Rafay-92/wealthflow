import type { DraftStatus, DraftTransaction } from '../../types/import'
import type { Transaction } from '../../types/transaction'

/** Two transactions are "the same" if account, date, amount and description all match. */
export function duplicateKey(accountId: string, tx: { date: string; amount: number; description: string }): string {
  const description = tx.description.toUpperCase().replace(/\s+/g, ' ').trim()
  return `${accountId}|${tx.date}|${tx.amount}|${description}`
}

/**
 * Labels each draft as new, an already-imported duplicate, or a repeat within the file.
 *
 * It counts matches rather than just checking "seen before?". If you already
 * imported two identical $4.50 coffees and the new file has three, the first
 * two are duplicates and the third is new. That's what makes importing
 * overlapping statements (Oct 1–31, then Oct 15–Nov 15) work correctly.
 */
export function classifyDrafts(
  drafts: readonly DraftTransaction[],
  existing: readonly Transaction[],
  accountId: string,
): DraftStatus[] {
  const remaining = new Map<string, number>()
  for (const tx of existing) {
    if (tx.accountId !== accountId) continue
    const key = duplicateKey(accountId, tx)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }

  const seenInFile = new Set<string>()
  return drafts.map((draft) => {
    const key = duplicateKey(accountId, draft)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      return 'duplicate'
    }
    if (seenInFile.has(key)) return 'repeat'
    seenInFile.add(key)
    return 'new'
  })
}
