import { describe, expect, it } from 'vitest'
import type { StoredData } from '../data/repository'
import { tx } from '../test/factories'
import { backupFileName, createBackup, summarizeData } from './backup'

const empty: StoredData = {
  transactions: [],
  accounts: [],
  imports: [],
  mappings: [],
  rules: [],
  subscriptionDecisions: [],
  wealthItems: [],
  wealthEntries: [],
}

describe('createBackup', () => {
  it('includes every table plus a header, and survives a JSON round trip', () => {
    const data: StoredData = { ...empty, transactions: [tx({ id: 'a' })], accounts: [{ id: 'chk', name: 'Checking', type: 'checking' }] }
    const backup = createBackup(data, new Date('2026-11-21T10:00:00Z'))
    expect(backup).toMatchObject({ app: 'WealthFlow', formatVersion: 1, exportedAt: '2026-11-21T10:00:00.000Z' })
    for (const key of Object.keys(empty)) expect(backup).toHaveProperty(key)
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup)
  })
})

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 21, 23, 0))).toBe('wealthflow-backup-2026-11-21.json')
  })
})

describe('summarizeData', () => {
  it('counts what is stored and knows when nothing is', () => {
    expect(summarizeData(empty).isEmpty).toBe(true)
    const s = summarizeData({ ...empty, transactions: [tx(), tx()], rules: [{ id: 'r', keyword: 'X', category: 'Other', createdAt: '' }] })
    expect(s).toMatchObject({ transactions: 2, rules: 1, isEmpty: false })
  })
})
