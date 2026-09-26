import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useCurrentUser } from '@/auth/auth-context'
import { formatApiAmount } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MonthIncome } from '@/months/month-income'
import type { Month } from '@/months/months-api'
import { BucketSummaryCard } from '@/summary/bucket-summary-card'
import { PlanVsActualChart } from '@/summary/plan-vs-actual-chart'
import { fetchMonthSummary, monthSummaryQueryKey } from '@/summary/summary-api'

interface MonthPlanVsActualProps {
  /** A month the user has started. */
  month: Month
}

/**
 * The month's totals (its editable income, what's spent and allocated, and what's left), each
 * bucket's target next to its actual amount, and a chart comparing them.
 */
export function MonthPlanVsActual({ month }: MonthPlanVsActualProps) {
  const { data: currentUser } = useCurrentUser()
  const summaryQuery = useQuery({
    queryKey: monthSummaryQueryKey(month),
    queryFn: () => fetchMonthSummary(month),
  })
  const monthSummary = summaryQuery.data

  function formatAmount(apiAmount: string): string {
    return currentUser ? formatApiAmount(apiAmount, currentUser.currency) : apiAmount
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border p-4">
          <MonthIncome month={month} />
        </div>
        {monthSummary && (
          <>
            <MonthTotal
              label="Spent and allocated"
              amount={formatAmount(monthSummary.total_actual)}
            />
            <MonthTotal
              label="Unallocated"
              amount={formatAmount(monthSummary.unallocated)}
              isNegative={Number(monthSummary.unallocated) < 0}
            />
          </>
        )}
      </div>
      {summaryQuery.isPending && (
        <p className="text-sm text-muted-foreground">Loading this month's totals…</p>
      )}
      {summaryQuery.isLoadingError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't load this month's totals. Please reload the page.
        </p>
      )}
      {summaryQuery.isRefetchError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't update this month's totals. Please reload the page.
        </p>
      )}
      {monthSummary && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Plan vs actual</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {monthSummary.buckets.map((bucketSummary) => (
              <BucketSummaryCard
                key={bucketSummary.bucket}
                bucketSummary={bucketSummary}
                formatAmount={formatAmount}
              />
            ))}
          </div>
          {currentUser && (
            <PlanVsActualChart monthSummary={monthSummary} currency={currentUser.currency} />
          )}
        </section>
      )}
    </div>
  )
}

interface MonthTotalProps {
  label: string
  /** Formatted for display. */
  amount: string
  /** Shown in the over-budget colour. */
  isNegative?: boolean
}

function MonthTotal({ label, amount, isNegative = false }: MonthTotalProps) {
  const labelId = useId()

  return (
    <div role="group" aria-labelledby={labelId} className="space-y-1 rounded-md border p-4">
      <p id={labelId} className="text-sm text-muted-foreground">
        {label}
      </p>
      <p className={cn('text-lg font-semibold tabular-nums', isNegative && 'text-status-over')}>
        {amount}
      </p>
    </div>
  )
}
