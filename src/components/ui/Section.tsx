import type { CSSProperties, ReactNode } from 'react'
import { Card } from './Card'

interface SectionProps {
  title: string
  subtitle?: string
  /** A link or control shown at the top right. */
  action?: ReactNode
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** A titled card: the building block of the dashboard and analytics pages. */
export function Section({ title, subtitle, action, className = '', style, children }: SectionProps) {
  return (
    // min-w-0: grid children default to "min-width: auto", which lets wide
    // content (like a scrollable table) stretch the whole grid off-screen.
    <Card className={`min-w-0 motion-safe:animate-rise ${className}`} style={style}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}
