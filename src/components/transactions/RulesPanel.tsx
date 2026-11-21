import { ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CATEGORIES, type Category, type CategoryRule } from '../../types/transaction'
import { CategoryLabel } from '../CategoryLabel'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface RulesPanelProps {
  rules: readonly CategoryRule[]
  readOnly: boolean
  busy: boolean
  onAdd: (keyword: string, category: Category) => void
  onDelete: (rule: CategoryRule) => void
}

export function RulesPanel({ rules, readOnly, busy, onAdd, onDelete }: RulesPanelProps) {
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState<Category>('Restaurants')
  const sorted = [...rules].sort((a, b) => a.keyword.localeCompare(b.keyword))

  return (
    <div>
      <h2 className="font-semibold">Your rules</h2>
      <p className="mt-0.5 mb-4 text-xs text-ink-faint">
        Rules run before the built-in merchant list. If a description contains the words, it gets the category. Categories you set by hand are never
        changed.
      </p>

      {sorted.length === 0 ? (
        <p className="mb-4 text-sm text-ink-muted">No rules yet. Change a transaction's category and you'll be offered one.</p>
      ) : (
        <ul className="mb-4 divide-y divide-navy-600/40">
          {sorted.map((rule) => (
            <li key={rule.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 truncate font-medium">“{rule.keyword}”</span>
              <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-faint" />
              <CategoryLabel category={rule.category} className="flex-1" />
              {!readOnly && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(rule)}
                  aria-label={`Delete rule ${rule.keyword}`}
                  className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-negative-soft hover:text-negative disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            if (!keyword.trim()) return
            onAdd(keyword, category)
            setKeyword('')
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Description contains</span>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Description contains, e.g. Blue Bottle" maxLength={60} className={`${fieldClass} w-full`} />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={`${fieldClass} w-full sm:w-44`}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy || keyword.trim() === ''}>
            <Plus aria-hidden className="size-4" /> Add rule
          </Button>
        </form>
      )}
    </div>
  )
}
