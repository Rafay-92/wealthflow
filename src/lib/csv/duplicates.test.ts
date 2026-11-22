import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import type { DraftTransaction } from '../../types/import'
import { classifyDrafts, duplicateKey } from './duplicates'

const draft = (description: string, amount = -450, date = '2026-11-03'): DraftTransaction => ({
  rowNumber: 0,
  date,
  description,
  amount,
  balance: null,
})

describe('classifyDrafts', () => {
  it('marks rows already imported as duplicates', () => {
    const existing = [tx({ accountId: 'chk', date: '2026-11-03', amount: -450, description: 'STARBUCKS' })]
    expect(classifyDrafts([draft('STARBUCKS'), draft('CHIPOTLE')], existing, 'chk')).toEqual(['duplicate', 'new'])
  })

  it('ignores differences in case and spacing', () => {
    const existing = [tx({ accountId: 'chk', date: '2026-11-03', amount: -450, description: 'Starbucks  #123' })]
    expect(classifyDrafts([draft('STARBUCKS #123')], existing, 'chk')).toEqual(['duplicate'])
  })

  it('only compares within the same account', () => {
    const existing = [tx({ accountId: 'other', date: '2026-11-03', amount: -450, description: 'STARBUCKS' })]
    expect(classifyDrafts([draft('STARBUCKS')], existing, 'chk')).toEqual(['new'])
  })

  it('counts matches, so overlapping statements import correctly', () => {
    // Two identical coffees already imported; the new file has three.
    const existing = [
      tx({ accountId: 'chk', date: '2026-11-03', amount: -450, description: 'STARBUCKS' }),
      tx({ accountId: 'chk', date: '2026-11-03', amount: -450, description: 'STARBUCKS' }),
    ]
    const drafts = [draft('STARBUCKS'), draft('STARBUCKS'), draft('STARBUCKS')]
    expect(classifyDrafts(drafts, existing, 'chk')).toEqual(['duplicate', 'duplicate', 'new'])
  })

  it('flags identical rows within one file as repeats, not duplicates', () => {
    expect(classifyDrafts([draft('STARBUCKS'), draft('STARBUCKS')], [], 'chk')).toEqual(['new', 'repeat'])
  })

  it('treats different amounts or dates as different transactions', () => {
    expect(classifyDrafts([draft('A', -450), draft('A', -451), draft('A', -450, '2026-11-04')], [], 'chk')).toEqual([
      'new',
      'new',
      'new',
    ])
  })
})

describe('duplicate protection after editing or deleting', () => {
  const draft = (description: string, amount = -450, date = '2026-11-03') => ({ rowNumber: 2, date, description, amount, balance: null })

  it('still recognises an imported transaction after you edit it', () => {
    // Imported as -4.50 STARBUCKS, then edited to -5.00 "Coffee with Sam".
    const edited = tx({
      accountId: 'chk',
      importId: 'imp1',
      date: '2026-11-03',
      amount: -500,
      description: 'Coffee with Sam',
      importKey: duplicateKey('chk', { date: '2026-11-03', amount: -450, description: 'STARBUCKS' }),
    })
    expect(classifyDrafts([draft('STARBUCKS')], [edited], 'chk')).toEqual(['duplicate'])
  })

  it('does not bring back a transaction you deleted', () => {
    const deleted = [{ id: 'x', accountId: 'chk', importId: 'imp1', importKey: duplicateKey('chk', draft('STARBUCKS')), deletedAt: '2026-11-21' }]
    expect(classifyDrafts([draft('STARBUCKS'), draft('STARBUCKS')], [], 'chk', deleted)).toEqual(['deleted', 'new'])
  })

  it('treats an exact match of a transaction you added by hand as a duplicate', () => {
    const manual = tx({ accountId: 'chk', date: '2026-11-03', amount: -450, description: 'STARBUCKS' })
    expect(classifyDrafts([draft('STARBUCKS')], [manual], 'chk')).toEqual(['duplicate'])
  })
})
