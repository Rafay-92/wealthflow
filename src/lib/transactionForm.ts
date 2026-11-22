import type { AccountType } from '../types/account'
import type { Category, Transaction, TransactionInput } from '../types/transaction'
import { isISODate } from './dates'
import { parseAmountToCents } from './money'

/** The add/edit form's fields, exactly as typed. */
export interface TransactionFormValues {
  direction: 'out' | 'in'
  /** Typed without a sign; the direction decides it. */
  amount: string
  date: string
  description: string
  /** An existing account's id, or 'new'. */
  accountId: string
  newAccountName: string
  newAccountType: AccountType
  category: Category | 'auto'
}

export const MAX_DESCRIPTION_LENGTH = 200
/** $10 million: far above any real single transaction, so a typo like 4500000 is caught. */
export const MAX_AMOUNT_CENTS = 1_000_000_000

/** Starting values: blank for a new transaction, or the transaction's own values for an edit. */
export function initialFormValues(tx: Transaction | null, defaults: { date: string; accountId: string }): TransactionFormValues {
  if (!tx) {
    return { direction: 'out', amount: '', date: defaults.date, description: '', accountId: defaults.accountId, newAccountName: '', newAccountType: 'checking', category: 'auto' }
  }
  return {
    direction: tx.amount < 0 ? 'out' : 'in',
    amount: (Math.abs(tx.amount) / 100).toFixed(2),
    date: tx.date,
    description: tx.description,
    accountId: tx.accountId ?? defaults.accountId,
    newAccountName: '',
    newAccountType: 'checking',
    // Only a category you chose stays fixed; anything else stays automatic.
    category: tx.categorySource === 'manual' ? tx.category : 'auto',
  }
}

/**
 * Checks the form and turns it into a transaction to save.
 * The amount is typed as a positive number and the "money out / money in"
 * choice sets the sign, so nobody has to remember that spending is negative.
 */
export function readTransactionForm(v: TransactionFormValues): { input: TransactionInput } | { error: string } {
  if (!isISODate(v.date)) return { error: 'Choose a valid date.' }
  const description = v.description.trim()
  if (description === '') return { error: 'Add a description, e.g. the merchant’s name.' }
  if (description.length > MAX_DESCRIPTION_LENGTH) return { error: `Keep the description under ${MAX_DESCRIPTION_LENGTH} characters.` }

  const cents = parseAmountToCents(v.amount.replace(/^[-+]/, ''))
  if (cents === null) return { error: 'The amount isn’t a valid number, e.g. 45.99' }
  const size = Math.abs(cents)
  if (size === 0) return { error: 'The amount can’t be zero.' }
  if (size > MAX_AMOUNT_CENTS) return { error: 'That amount looks too large. Please check it.' }

  let account: TransactionInput['account']
  if (v.accountId === 'new') {
    const name = v.newAccountName.trim()
    if (name === '') return { error: 'Name the new account, e.g. “Cash” or “TD Chequing”.' }
    account = { name, type: v.newAccountType }
  } else if (v.accountId === '') {
    return { error: 'Choose an account.' }
  } else {
    account = { id: v.accountId }
  }

  return { input: { date: v.date, description, amount: v.direction === 'out' ? -size : size, category: v.category, account } }
}
