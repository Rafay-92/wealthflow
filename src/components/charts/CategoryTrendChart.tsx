import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CategoryMonth } from '../../lib/analytics/analytics'
import { formatBucket, type Granularity } from '../../lib/analytics/granularity'
import { formatCents, formatCentsCompact } from '../../lib/money'
import type { Category } from '../../types/transaction'
import { TooltipFrame, TooltipRow } from './ChartTooltip'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE } from './chartTheme'

interface CategoryTrendChartProps {
  category: Category
  data: readonly CategoryMonth[]
  /** Marks the last month as month-to-date, e.g. "Nov 20". */
  partialThrough?: string
  /** What each bar covers. Default: a month. */
  granularity?: Granularity
}

/** One category's spending per month: a single series, so no legend (the title names it). */
export function CategoryTrendChart({ category, data, partialThrough, granularity = 'month' }: CategoryTrendChartProps) {
  const last = data.at(-1)?.month
  const average = data.length > 0 ? data.reduce((s, d) => s + d.amount, 0) / data.length : 0

  return (
    <div>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data as CategoryMonth[]} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatBucket(m, granularity) + (partialThrough && m === last ? '*' : '')}
              tickLine={false}
              axisLine={AXIS_LINE}
              tick={AXIS_TICK}
              tickMargin={8}
            />
            <YAxis tickFormatter={(v: number) => formatCentsCompact(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={52} />
            <Tooltip
              cursor={{ fill: 'var(--color-navy-700)', opacity: 0.5 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as CategoryMonth | undefined
                if (!active || !row) return null
                return (
                  <TooltipFrame title={formatBucket(row.month, granularity, 'long') + (partialThrough && row.month === last ? ` · to ${partialThrough}` : '')}>
                    <TooltipRow label={category} value={formatCents(row.amount)} color="var(--color-series-expense)" />
                  </TooltipFrame>
                )
              }}
            />
            <Bar dataKey="amount" fill="var(--color-series-expense)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Average {formatCents(Math.round(average))} a {granularity}
        {partialThrough && ` · * ${granularity} to date, through ${partialThrough}`}
      </p>
      <table className="sr-only">
        <caption>{category} spending by {granularity}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{formatBucket(d.month, granularity, 'long')}</td>
              <td>{formatCents(d.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
