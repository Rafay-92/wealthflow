import { FlaskConical } from 'lucide-react'

export function SampleDataNotice() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-navy-600/60 bg-navy-900 px-4 py-3 text-sm">
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
      <p className="text-ink-muted">
        <span className="font-medium text-ink">You're viewing fictional sample data.</span> Every
        name and amount is made up. Importing your own CSV comes in Stage 3.
      </p>
    </div>
  )
}
