import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDay, type ISODate } from '../../lib/dates'
import { formatCents, formatCentsCompact } from '../../lib/money'
import type { NetWorthPoint } from '../../lib/wealth/netWorth'
import { TooltipFrame, TooltipRow } from '../charts/ChartTooltip'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE } from '../charts/chartTheme'

const LINE = 'var(--color-series-income)'

/** Net worth at each date you recorded values. One series, so the title names it (no legend). */
export function NetWorthChart({ points }: { points: readonly NetWorthPoint[] }) {
  const spansYears = points.length > 0 && points[0]!.date.slice(0, 4) !== points.at(-1)!.date.slice(0, 4)
  const label = (d: ISODate) => (spansYears ? `${formatDay(d)} ’${d.slice(2, 4)}` : formatDay(d))
  const hasNegative = points.some((p) => p.netWorth < 0)

  // Updates happen at irregular intervals, so the x-axis is a real time scale:
  // two updates a week apart sit close together, not as far apart as two
  // updates three months apart.
  const data = points.map((p) => ({ ...p, t: Date.parse(`${p.date}T00:00:00Z`) }))
  const step = Math.max(1, Math.ceil(data.length / 6)) // at most ~6 date labels
  const ticks = data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d) => d.t)
  const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10)

  return (
    <div>
      <div className="h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tickFormatter={(t: number) => label(dateOf(t))}
              tickLine={false}
              axisLine={AXIS_LINE}
              tick={AXIS_TICK}
              tickMargin={8}
              padding={{ left: 16, right: 16 }}
            />
            <YAxis tickFormatter={(v: number) => formatCentsCompact(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={56} />
            {hasNegative && <ReferenceLine y={0} stroke="var(--color-navy-600)" />}
            <Tooltip
              cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as NetWorthPoint | undefined
                if (!active || !p) return null
                return (
                  <TooltipFrame title={formatDay(p.date) + ', ' + p.date.slice(0, 4)}>
                    <TooltipRow label="Net worth" value={formatCents(p.netWorth)} color={LINE} />
                    <TooltipRow label="Assets" value={formatCents(p.assets)} />
                    <TooltipRow label="Liabilities" value={formatCents(p.liabilities)} />
                  </TooltipFrame>
                )
              }}
            />
            <Line
              type="linear"
              dataKey="netWorth"
              stroke={LINE}
              strokeWidth={2}
              dot={{ r: 4, fill: LINE, stroke: 'var(--color-navy-800)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: LINE, stroke: 'var(--color-navy-800)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Net worth over time</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatCents(p.netWorth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
