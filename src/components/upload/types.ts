import type { AccountType } from '../../types/account'

/** Which account a statement belongs to: one you already have, or a new one. */
export type AccountChoice =
  | { mode: 'existing'; accountId: string }
  | { mode: 'new'; name: string; type: AccountType }
