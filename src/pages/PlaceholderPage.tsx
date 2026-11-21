import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import type { NavItem } from '../components/layout/navigation'

/** Temporary page shown for features not built yet. Each stage replaces one. */
export function PlaceholderPage({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <Card className="flex flex-col items-center gap-4 border-dashed py-16 text-center">
        <div className="grid size-12 place-items-center rounded-xl bg-navy-700">
          <Icon aria-hidden className="size-6 text-ink-muted" />
        </div>
        <div>
          <p className="font-medium">Coming in Stage {item.stage}</p>
          <p className="mt-1 text-sm text-ink-faint">This page is part of the WealthFlow build plan.</p>
        </div>
      </Card>
    </>
  )
}
