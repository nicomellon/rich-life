import { useId } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompactMoney, formatMoney } from '@/lib/money'
import { BUCKET_STATUS_COLORS, BUCKET_STATUS_LABELS } from '@/summary/bucket-status'
import { toPlanVsActualRows } from '@/summary/plan-vs-actual-rows'
import type { BucketStatus, MonthSummary } from '@/summary/summary-api'

interface LegendKey {
  label: string
  color: string
}

// The actual bars take their status's colour, so the legend has a key per status.
const STATUSES: BucketStatus[] = ['under', 'on_track', 'over']
const LEGEND_KEYS: LegendKey[] = [
  { label: 'Target', color: 'var(--chart-target)' },
  ...STATUSES.map((status) => ({
    label: `Actual, ${BUCKET_STATUS_LABELS[status].toLowerCase()}`,
    color: BUCKET_STATUS_COLORS[status],
  })),
]

interface PlanVsActualChartProps {
  monthSummary: MonthSummary
  /** The user's currency, as an ISO 4217 code. */
  currency: string
}

/** A bar chart of each bucket's target next to its actual amount, coloured by status. */
export function PlanVsActualChart({ monthSummary, currency }: PlanVsActualChartProps) {
  const captionId = useId()
  const planVsActualRows = toPlanVsActualRows(monthSummary)

  function formatTooltipAmount(amount: unknown): string {
    return typeof amount === 'number' ? formatMoney(Math.round(amount * 100), currency) : ''
  }

  return (
    <figure aria-labelledby={captionId} className="space-y-2 rounded-md border p-4">
      <figcaption id={captionId} className="font-semibold">
        Target vs actual per bucket
      </figcaption>
      <BarChart
        responsive
        data={planVsActualRows}
        style={{ width: '100%', height: 280 }}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="bucketLabel" tickLine={false} />
        <YAxis
          tickFormatter={(amount: number) => formatCompactMoney(amount, currency)}
          tickLine={false}
          axisLine={false}
          width="auto"
        />
        <Tooltip formatter={formatTooltipAmount} cursor={{ fill: 'var(--muted)' }} />
        <Bar dataKey="targetAmount" name="Target" fill="var(--chart-target)" radius={4} />
        <Bar dataKey="actualAmount" name="Actual" fill="var(--status-under)" radius={4}>
          {planVsActualRows.map((planVsActualRow) => (
            <Cell
              key={planVsActualRow.bucketLabel}
              fill={BUCKET_STATUS_COLORS[planVsActualRow.status]}
            />
          ))}
        </Bar>
      </BarChart>
      {/* Recharts 3 builds its legend from the bars, which can't show one key per status. */}
      <ul aria-label="Legend" className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        {LEGEND_KEYS.map((legendKey) => (
          <li key={legendKey.label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ backgroundColor: legendKey.color }}
            />
            {legendKey.label}
          </li>
        ))}
      </ul>
    </figure>
  )
}
