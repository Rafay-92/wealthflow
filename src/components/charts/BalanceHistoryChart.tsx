import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BalanceHistory } from '../../lib/analytics/dashboard'
import { OPENING_SOURCE_LABEL } from '../../lib/balances/reconcile'
import { formatDay, type ISODate } from '../../lib/dates'
import { formatCents, formatCentsCompact } from '../../lib/money'
import { TooltipFrame, TooltipRow } from './ChartTooltip'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE } from './chartTheme'

/** Validated series colours (the first two match income/expense elsewhere). */
const COLORS = ['var(--color-series-income)', 'var(--color-positive)', 'var(--color-warning)', 'var(--color-series-expense)']

/**
 * Each bank account's end-of-day balance through the period. Only accounts
 * with a known starting balance get a line, and each says what it's built
 * on; nothing is drawn for days or accounts we can't support with real figures.
 */
export function BalanceHistoryChart({ history }: { history: readonly BalanceHistory[] }) {
  if (history.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        No balance history: add an opening balance in the Balance check, or import a statement with a running balance column.
      </p>
    )
  }
  const dates = history[0]!.points.map((p) => p.date)
  const rows = dates.map((date, i) => {
    const row: Record<string, number | string | null> = { date }
    for (const h of history) {
      row[h.accountId] = h.points[i]?.balance ?? null
      row[`${h.accountId}:reported`] = h.points[i]?.reported ?? null
    }
    return row
  })

  return (
    // relative: keeps the screen-reader table below (position: absolute) inside this box on small screens.
    <div className="relative">
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
        {history.map((h, i) => (
          <li key={h.accountId} className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: COLORS[i % COLORS.length] }} />
            {h.name} <span className="text-ink-faint">· starting balance: {OPENING_SOURCE_LABEL[h.source].toLowerCase()}</span>
          </li>
        ))}
      </ul>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="date" tickFormatter={(d: ISODate) => formatDay(d)} tickLine={false} axisLine={AXIS_LINE} tick={AXIS_TICK} tickMargin={8} minTickGap={24} />
            <YAxis tickFormatter={(v: number) => formatCentsCompact(v)} tickLine={false} axisLine={false} tick={AXIS_TICK} width={56} domain={['auto', 'auto']} />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Record<string, number | string | null> | undefined
                if (!active || !row) return null
                return (
                  <TooltipFrame title={`End of ${formatDay(row.date as string)}, ${(row.date as string).slice(0, 4)}`}>
                    {history.map((h, i) => (
                      <div key={h.accountId}>
                        <TooltipRow color={COLORS[i % COLORS.length]!} label={h.name} value={formatCents(row[h.accountId] as number)} />
                        {row[`${h.accountId}:reported`] !== null && (
                          <p className={`pl-3.5 text-[11px] ${row[`${h.accountId}:reported`] === row[h.accountId] ? 'text-ink-faint' : 'text-warning'}`}>
                            Bank reported {formatCents(row[`${h.accountId}:reported`] as number)}
                          </p>
                        )}
                      </div>
                    ))}
                  </TooltipFrame>
                )
              }}
            />
            {history.map((h, i) => (
              <Line key={h.accountId} type="monotone" dataKey={h.accountId} name={h.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers as a table, for screen readers. It sits in an sr-only <div>:
          a table can't be squeezed to 1px itself, and would widen the page on phones. */}
      <div className="sr-only">
      <table>
        <caption>Account balances by day</caption>
        <thead>
          <tr>
            <th>Date</th>
            {history.map((h) => (
              <th key={h.accountId}>{h.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date as string}>
              <td>{formatDay(r.date as string)}</td>
              {history.map((h) => (
                <td key={h.accountId}>{formatCents(r[h.accountId] as number)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
