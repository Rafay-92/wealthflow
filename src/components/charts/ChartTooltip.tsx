import type { ReactNode } from 'react'

/** The box every chart tooltip sits in, so they all look the same. */
export function TooltipFrame({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-40 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-medium text-ink">{title}</p>
      {children}
    </div>
  )
}

/** One "label ..... value" line inside a tooltip, with an optional colour key. */
export function TooltipRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-1.5 text-ink-muted">
        {color && <span aria-hidden className="size-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="text-ink tabular">{value}</span>
    </p>
  )
}
