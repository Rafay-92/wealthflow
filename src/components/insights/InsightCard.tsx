import { AlertTriangle, Check, ChevronRight, Info } from 'lucide-react'
import type { Insight } from '../../lib/insights/types'

/** Icons say whether something is good news, never which way a number moved. */
const TONES = {
  good: { Icon: Check, className: 'bg-positive-soft text-positive', label: 'Good news' },
  bad: { Icon: AlertTriangle, className: 'bg-negative-soft text-negative', label: 'Worth a look' },
  neutral: { Icon: Info, className: 'bg-navy-700 text-ink-muted', label: 'Note' },
} as const

export function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const { Icon, className, label } = TONES[insight.tone]
  return (
    <article className="flex gap-3">
      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${className}`} title={label}>
        <Icon aria-hidden className="size-4" />
        <span className="sr-only">{label}:</span>
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{insight.title}</h3>
        <p className="mt-0.5 text-sm text-ink-muted">{insight.detail}</p>
        {!compact && (
          <details className="group mt-2 text-xs">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-ink-faint hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
              How this was calculated
            </summary>
            <ul className="mt-2 flex flex-col gap-1 rounded-lg bg-navy-900/70 px-3 py-2 text-ink-muted tabular">
              {insight.evidence.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  )
}
