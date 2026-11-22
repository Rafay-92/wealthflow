import type { ISODate } from '../lib/dates'
import type { Cents } from '../lib/money'

/** The date layouts we can read. We never guess silently between them. */
export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM/DD/YY',
  'DD/MM/YY',
  'MONTH_NAME', // "Nov 3, 2026" or "3 Nov 2026"
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

/**
 * How one bank's CSV maps onto our fields. Columns are zero-based indexes;
 * null means "not mapped".
 */
export interface ColumnMapping {
  dateColumn: number | null
  descriptionColumn: number | null
  /** 'single': one signed Amount column. 'split': separate Debit and Credit columns. */
  amountMode: 'single' | 'split'
  amountColumn: number | null
  debitColumn: number | null
  creditColumn: number | null
  balanceColumn: number | null
  dateFormat: DateFormat
  /** Some exports (often credit cards) show purchases as positive. This flips every sign. */
  invertAmounts: boolean
  /**
   * French-Canadian number format ("1 234,56"). Optional because mappings saved
   * before CAD support don't have it; missing means false.
   */
  decimalComma?: boolean
  /**
   * A column saying whether each row is money out or in ("Debit"/"Credit",
   * "DR"/"CR", "Withdrawal"/"Deposit"), used when the amounts themselves are
   * all positive (e.g. Scotiabank). Optional for mappings saved earlier.
   */
  typeColumn?: number | null
}

/** A CSV row successfully turned into transaction data, before it's saved. */
export interface DraftTransaction {
  /** 1-based line in the file, so error messages match what you see in Excel. */
  rowNumber: number
  date: ISODate
  description: string
  amount: Cents
  balance: Cents | null
}

export interface RowError {
  rowNumber: number
  message: string
}

/**
 * new        - not seen before; imported by default
 * duplicate  - already imported earlier; skipped by default
 * repeat     - identical to another row in this same file; imported by default,
 *              because two $4.50 coffees on the same day can both be real
 * deleted    - imported before, then deleted by you; skipped by default
 */
export type DraftStatus = 'new' | 'duplicate' | 'repeat' | 'deleted'

/** A mapping remembered for a bank's file layout, so you only set it up once. */
export interface SavedMapping {
  /** The file's header row, normalised: identifies the bank's layout. */
  signature: string
  headerRow: number
  mapping: ColumnMapping
  accountId: string | null
  updatedAt: string
}

/** One completed import, so it can be listed and undone. */
export interface ImportRecord {
  id: string
  fileName: string
  /** ISO timestamp. */
  importedAt: string
  accountId: string
  transactionCount: number
}
