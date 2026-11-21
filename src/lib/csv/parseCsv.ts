import Papa from 'papaparse'

export const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB: years of transactions
export const MAX_ROWS = 50_000

/** Thrown for problems the user can fix. The message is shown to them as-is. */
export class ImportError extends Error {
  override name = 'ImportError'
}

/** Checks a file before reading it. Returns an error message, or null if it looks OK. */
export function checkFile(file: { name: string; size: number }): string | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? ''
  if (extension === 'pdf') return 'PDF statements aren’t supported yet. Download a CSV export from your bank instead.'
  if (['xls', 'xlsx', 'numbers', 'ods'].includes(extension)) {
    return 'Spreadsheet files aren’t supported. Open it and use “Save as CSV”, or download a CSV export from your bank.'
  }
  if (!['csv', 'txt'].includes(extension)) return `“.${extension}” files aren’t supported. Please choose a CSV file.`
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FILE_BYTES) return 'This file is larger than 5 MB. Try exporting a shorter date range.'
  return null
}

/**
 * Parses CSV text into rows of cells. Uses PapaParse, which handles the
 * awkward cases: quoted fields containing commas ("Smith, J"), escaped
 * quotes, Windows/Mac/Unix line endings, and semicolon- or tab-separated
 * files (it auto-detects the delimiter).
 */
export function parseCsvText(text: string): string[][] {
  // Real CSVs that are actually something else, renamed:
  if (text.startsWith('%PDF')) throw new ImportError('This is a PDF file with a .csv name. Please download a real CSV export.')
  if (text.startsWith('PK\u0003\u0004')) throw new ImportError('This looks like an Excel file renamed to .csv. Open it and use “Save as CSV”.')
  if (text.includes('\u0000')) throw new ImportError('This file contains binary data and isn’t a CSV.')

  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''))

  // Blank lines are KEPT (as empty rows) so that rows[i] is always line i + 1
  // of the file. Error messages can then say "Row 7" and mean line 7 in Excel.
  // Every later step skips blank rows with isBlankRow().
  const rows = result.data.map((row) => row.map((cell) => cell.trim()))
  while (rows.length > 0 && isBlankRow(rows.at(-1)!)) rows.pop()

  const contentRows = rows.filter((row) => !isBlankRow(row))
  if (contentRows.length === 0) throw new ImportError('No rows found in this file.')
  if (contentRows.length > MAX_ROWS) throw new ImportError(`This file has more than ${MAX_ROWS.toLocaleString()} rows. Try a shorter date range.`)
  if (contentRows.every((row) => row.length < 2)) {
    throw new ImportError('Couldn’t find separate columns. Make sure the file is comma-, semicolon- or tab-separated.')
  }
  return rows
}

/**
 * Finds the header row. Many banks put a few lines of account info above the
 * real table, e.g. "Account: ****1234". We look for the first row (within the
 * first 10) that is as wide as the data and mostly text.
 */
export function detectHeaderRow(rows: readonly string[][]): number {
  const widthCounts = new Map<number, number>()
  for (const row of rows) {
    if (!isBlankRow(row)) widthCounts.set(row.length, (widthCounts.get(row.length) ?? 0) + 1)
  }
  const dataWidth = [...widthCounts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]

  const looksLikeText = (cell: string) => cell !== '' && !/^[-+$(]?[\d.,/\s:-]+\)?$/.test(cell)

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i]!
    if (row.length === dataWidth && row.filter(looksLikeText).length >= Math.ceil(row.length / 2)) return i
  }
  return 0
}

/** True for a row with no content, e.g. a blank line or ",,,". */
export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell === '')
}

/** A stable fingerprint of a header row, used to recognise a bank's format next time. */
export function headerSignature(headers: readonly string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join('|')
}
