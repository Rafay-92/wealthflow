import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router'

export function SampleDataNotice() {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-navy-600/60 bg-navy-900 px-4 py-3 text-sm">
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
      <p className="text-ink-muted">
        <span className="font-medium text-ink">You're viewing fictional sample data.</span> Every name and amount is
        made up.{' '}
        <Link to="/upload" className="font-medium text-positive hover:underline">
          Import a CSV
        </Link>{' '}
        to see your own numbers instead.
      </p>
    </div>
  )
}
