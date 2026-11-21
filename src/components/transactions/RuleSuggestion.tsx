import { Wand2, X } from 'lucide-react'
import { useState } from 'react'
import { transactionsMatchingKeyword } from '../../lib/transactions'
import type { Category, Transaction } from '../../types/transaction'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface RuleSuggestionProps {
  /** The transaction whose category was just changed. */
  changed: Transaction
  category: Category
  initialKeyword: string
  allTransactions: readonly Transaction[]
  busy: boolean
  onCreate: (keyword: string) => void
  onDismiss: () => void
}

/**
 * Shown after a manual category change: "Always put STARBUCKS in Restaurants?"
 * The keyword is editable, and the count updates live so you can see how far
 * the rule reaches before creating it.
 */
export function RuleSuggestion({ changed, category, initialKeyword, allTransactions, busy, onCreate, onDismiss }: RuleSuggestionProps) {
  const [keyword, setKeyword] = useState(initialKeyword)
  const others = transactionsMatchingKeyword(allTransactions, keyword).filter((t) => t.id !== changed.id)

  return (
    <div
      role="region"
      aria-label="Create a rule"
      className="sticky bottom-4 z-10 mt-6 rounded-2xl border border-positive/40 bg-navy-800/95 p-4 shadow-2xl backdrop-blur motion-safe:animate-rise"
    >
      <div className="flex items-start gap-3">
        <Wand2 aria-hidden className="mt-0.5 size-5 shrink-0 text-positive" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Always put matching transactions in <span className="text-positive">{category}</span>?
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Applies to future imports too.{' '}
            {others.length > 0
              ? `Also updates ${others.length} other ${others.length === 1 ? 'transaction' : 'transactions'} now.`
              : 'No other transactions match yet.'}
          </p>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              if (keyword.trim()) onCreate(keyword)
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Description contains</span>
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} className={`${fieldClass} w-full`} maxLength={60} placeholder="Description contains…" />
            </label>
            <Button type="submit" variant="primary" disabled={busy || keyword.trim() === ''}>
              Create rule
            </Button>
          </form>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Not now" className="rounded-md p-1 text-ink-faint hover:bg-navy-700 hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
