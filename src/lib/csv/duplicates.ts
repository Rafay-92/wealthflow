import type { DraftStatus, DraftTransaction } from '../../types/import'
import type { DeletedTransaction, Transaction } from '../../types/transaction'

/** Two transactions are "the same" if account, date, amount and description all match. */
export function duplicateKey(accountId: string, tx: { date: string; amount: number; description: string }): string {
  const description = tx.description.toUpperCase().replace(/\s+/g, ' ').trim()
  return `${accountId}|${tx.date}|${tx.amount}|${description}`
}

/**
 * The key a saved transaction is recognised by when a statement is imported again:
 * the bank's original values if you've edited it since, otherwise its current ones.
 */
export function importFingerprint(tx: Transaction): string {
  return tx.importKey ?? duplicateKey(tx.accountId ?? '', tx)
}

/**
 * Labels each draft as new, an already-imported duplicate, a repeat within the
 * file, or one you deleted before.
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
  deleted: readonly DeletedTransaction[] = [],
): DraftStatus[] {
  const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)
  const remaining = new Map<string, number>()
  for (const tx of existing) count(remaining, importFingerprint(tx))
  const removed = new Map<string, number>()
  for (const d of deleted) count(removed, d.importKey)

  const seenInFile = new Set<string>()
  return drafts.map((draft) => {
    const key = duplicateKey(accountId, draft)
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      return 'duplicate'
    }
    const gone = removed.get(key) ?? 0
    if (gone > 0) {
      removed.set(key, gone - 1)
      return 'deleted'
    }
    if (seenInFile.has(key)) return 'repeat'
    seenInFile.add(key)
    return 'new'
  })
}
