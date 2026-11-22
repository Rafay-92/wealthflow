import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyWithRate } from '../../lib/analytics/analytics'
import { formatBucket, type Granularity } from '../../lib/analytics/granularity'
import { formatCents, formatPercent } from '../../lib/money'
import { TooltipFrame, TooltipRow } from './ChartTooltip'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE } from './chartTheme'

const LINE_COLOR = 'var(--color-series-income)'

/**
 * Savings rate per month as a line: a rate changing over time.
 * A 0% reference line makes months where you spent more than you earned
 * obvious. Months with no income have no rate, so the line has a gap there
 * rather than pretending it was 0%.
 */
export function SavingsRateChart({ data, partialThrough, granularity = 'month' }: { data: readonly MonthlyWithRate[]; partialThrough?: string; granularity?: Granularity }) {
  const last = data.at(-1)?.month
  const rates = data.map((d) => d.savingsRate).filter((r): r is number => r !== null)
  // Even, clean ticks (0%, 10%, 20%…), with the step widening for big ranges.
  const span = Math.max(10, ...rates) - Math.min(0, ...rates)
  const step = span <= 50 ? 10 : span <= 100 ? 20 : 50
  const min = Math.floor(Math.min(0, ...rates) / step) * step
  const max = Math.ceil(Math.max(10, ...rates) / step) * step
  const ticks = Array.from({ length: (max - min) / step + 1 }, (_, i) => min + i * step)

  return (
    <div>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as MonthlyWithRate[]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatBucket(m, granularity) + (partialThrough && m === last ? '*' : '')}
              tickLine={false}
              axisLine={AXIS_LINE}
              tick={AXIS_TICK}
              tickMargin={8}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              domain={[min, max]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              width={44}
            />
            <ReferenceLine y={0} stroke="var(--color-navy-600)" />
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as MonthlyWithRate | undefined
                if (!active || !row) return null
                return (
                  <TooltipFrame title={formatBucket(row.month, granularity, 'long') + (partialThrough && row.month === last ? ` · to ${partialThrough}` : '')}>
                    <TooltipRow label="Savings rate" value={formatPercent(row.savingsRate)} color={LINE_COLOR} />
                    <TooltipRow label="Saved" value={formatCents(row.net)} />
                  </TooltipFrame>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="savingsRate"
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: LINE_COLOR, stroke: 'var(--color-navy-800)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: LINE_COLOR, stroke: 'var(--color-navy-800)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Savings rate by {granularity}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{formatBucket(d.month, granularity, 'long')}</td>
              <td>{formatPercent(d.savingsRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
