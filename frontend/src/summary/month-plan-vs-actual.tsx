import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useCurrentUser } from '@/auth/auth-context'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatApiAmount, parseAmountInCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { MonthIncome } from '@/months/month-income'
import { MonthTargetsEditor } from '@/months/month-targets-editor'
import type { Month } from '@/months/months-api'
import { BUCKETS } from '@/spending-plan/buckets'
import { BucketSummaryCard } from '@/summary/bucket-summary-card'
import { PlanVsActualChart } from '@/summary/plan-vs-actual-chart'
import { fetchMonthSummary, monthSummaryQueryKey } from '@/summary/summary-api'

interface MonthPlanVsActualProps {
  /** A month the user has started. */
  month: Month
}

/**
 * The month's totals (its editable income, what's spent and allocated, and what's left), each
 * bucket's target next to its actual amount, a chart comparing them, and a way to adjust this
 * month's targets.
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
        {summaryQuery.isPending && (
          <>
            <MonthTotalSkeleton />
            <MonthTotalSkeleton />
          </>
        )}
      </div>
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
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Plan vs actual</h2>
          <MonthTargetsEditor month={month} />
        </div>
        {parseAmountInCents(month.income) === 0 && (
          <p className="text-sm text-muted-foreground">
            Add this month's income to see your targets.
          </p>
        )}
        {summaryQuery.isPending && <PlanVsActualSkeleton />}
        {monthSummary && (
          <>
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
          </>
        )}
      </section>
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

/** Stands in for one of the month's totals. The bucket cards' skeleton carries the label. */
function MonthTotalSkeleton() {
  return (
    <div aria-busy="true" className="space-y-2 rounded-md border p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-24" />
    </div>
  )
}

/** Stands in for the bucket cards and the chart. */
function PlanVsActualSkeleton() {
  return (
    <LoadingSkeleton label="Loading this month's totals…" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {BUCKETS.map((bucket) => (
          <div key={bucket} className="space-y-3 rounded-md border p-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-md border p-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-70 w-full" />
      </div>
    </LoadingSkeleton>
  )
}
