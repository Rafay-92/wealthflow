import { describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import { initialFormValues, readTransactionForm, type TransactionFormValues } from './transactionForm'

const base: TransactionFormValues = {
  direction: 'out',
  amount: '45.99',
  date: '2026-11-02',
  description: '  Farmers market  ',
  accountId: 'chk',
  newAccountName: '',
  newAccountType: 'checking',
  category: 'auto',
}

describe('readTransactionForm', () => {
  it('money out becomes a negative amount; money in a positive one', () => {
    expect(readTransactionForm(base)).toEqual({
      input: { date: '2026-11-02', description: 'Farmers market', amount: -4599, category: 'auto', account: { id: 'chk' } },
    })
    expect(readTransactionForm({ ...base, direction: 'in', amount: '1,250.00' })).toMatchObject({ input: { amount: 125000 } })
  })

  it('ignores a sign typed by habit: the direction decides', () => {
    expect(readTransactionForm({ ...base, amount: '-45.99' })).toMatchObject({ input: { amount: -4599 } })
  })

  it('creates a new account when asked', () => {
    expect(readTransactionForm({ ...base, accountId: 'new', newAccountName: 'Cash', newAccountType: 'checking' })).toMatchObject({
      input: { account: { name: 'Cash', type: 'checking' } },
    })
  })

  it.each([
    [{ amount: '' }, /amount/],
    [{ amount: 'abc' }, /amount/],
    [{ amount: '0' }, /zero/],
    [{ amount: '99999999' }, /too large/],
    [{ description: '   ' }, /description/],
    [{ date: '2026-13-40' }, /date/],
    [{ accountId: 'new', newAccountName: '' }, /Name the new account/],
    [{ accountId: '' }, /account/],
  ] as const)('refuses %j', (patch, message) => {
    const result = readTransactionForm({ ...base, ...patch })
    expect('error' in result && result.error).toMatch(message)
  })
})

describe('initialFormValues', () => {
  it('fills the form from a transaction, keeping only a hand-picked category fixed', () => {
    const auto = tx({ amount: -4599, categorySource: 'keyword', category: 'Groceries', accountId: 'chk' })
    expect(initialFormValues(auto, { date: '', accountId: '' })).toMatchObject({ direction: 'out', amount: '45.99', category: 'auto' })
    const manual = tx({ amount: 2000, categorySource: 'manual', category: 'Shopping' })
    expect(initialFormValues(manual, { date: '', accountId: 'chk' })).toMatchObject({ direction: 'in', category: 'Shopping', accountId: 'chk' })
  })
})
