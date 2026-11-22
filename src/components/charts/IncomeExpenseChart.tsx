import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyTotals } from '../../lib/analytics/trends'
import { formatBucket, type Granularity } from '../../lib/analytics/granularity'
import { formatCents, formatCentsCompact } from '../../lib/money'

interface IncomeExpenseChartProps {
  data: readonly MonthlyTotals[]
  /** If the last month is incomplete, the date the data stops (shown in the tooltip). */
  partialThrough?: string
  /** What each bar covers. Default: a month. */
  granularity?: Granularity
}

const SERIES = [
  { key: 'income', label: 'Income', color: 'var(--color-series-income)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--color-series-expense)' },
] as const

/**
 * Grouped columns: income vs expenses per month.
 *
 * Styling follows the dataviz rules: thin bars (max 24px) with a rounded
 * data end and a square baseline, a 2px gap between neighbours, hairline
 * gridlines, a legend (two series), and a hover tooltip for exact values.
 */
export function IncomeExpenseChart({ data, partialThrough, granularity = 'month' }: IncomeExpenseChartProps) {
  const lastMonth = data.at(-1)?.month

  return (
    <div>
      <ul className="mb-4 flex gap-4 text-xs text-ink-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data as MonthlyTotals[]} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatBucket(m, granularity) + (partialThrough && m === lastMonth ? '*' : '')}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-navy-600)' }}
              tick={{ fill: 'var(--color-ink-faint)', fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              tickFormatter={(v: number) => formatCentsCompact(v)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--color-ink-faint)', fontSize: 12 }}
              width={52}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-navy-700)', opacity: 0.5 }}
              content={({ active, payload }) => (
                <TrendTooltip
                  active={active}
                  row={payload?.[0]?.payload as MonthlyTotals | undefined}
                  partialThrough={payload?.[0]?.payload?.month === lastMonth ? partialThrough : undefined}
                  granularity={granularity}
                />
              )}
            />
            {SERIES.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {partialThrough && <p className="mt-3 text-xs text-ink-faint">* {granularity === 'month' ? 'Month' : granularity === 'quarter' ? 'Quarter' : 'Year'} to date, through {partialThrough}</p>}

      {/* The same numbers as a table, for screen readers. */}
      <table className="sr-only">
        <caption>Income and expenses by {granularity}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Income</th>
            <th>Expenses</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <td>{formatBucket(row.month, granularity, 'long')}</td>
              <td>{formatCents(row.income)}</td>
              <td>{formatCents(row.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TrendTooltip({ active, row, partialThrough, granularity }: { active?: boolean; row?: MonthlyTotals; partialThrough?: string; granularity: Granularity }) {
  if (!active || !row) return null
  return (
    <div className="min-w-44 rounded-lg border border-navy-600 bg-navy-900 px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-2 font-medium text-ink">
        {formatBucket(row.month, granularity, 'long')}
        {partialThrough && <span className="font-normal text-ink-faint"> · to {partialThrough}</span>}
      </p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-muted">
            <span aria-hidden className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="text-ink tabular">{formatCents(row[s.key])}</span>
        </p>
      ))}
      <p className="mt-1.5 flex justify-between gap-4 border-t border-navy-600 pt-1.5">
        <span className="text-ink-muted">Net</span>
        <span className={`tabular ${row.net >= 0 ? 'text-positive' : 'text-negative'}`}>
          {formatCents(row.net, { signed: true })}
        </span>
      </p>
    </div>
  )
}
