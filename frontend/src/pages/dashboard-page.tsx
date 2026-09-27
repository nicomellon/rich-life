import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { MonthEntries } from '@/entries/month-entries'
import {
  currentCalendarMonth,
  isSameMonth,
  parseMonthKey,
  toMonthKey,
  type CalendarMonth,
} from '@/months/calendar-month'
import { MonthPicker } from '@/months/month-picker'
import { fetchMonths, monthsQueryKey } from '@/months/months-api'
import { StartMonthForm } from '@/months/start-month-form'
import { BUCKETS } from '@/spending-plan/buckets'
import { MonthPlanVsActual } from '@/summary/month-plan-vs-actual'

export function DashboardPage() {
  // The month shown is in the URL (`?month=2026-09`), so it survives a reload and can be shared.
  // Without one, or with an invalid one, the dashboard shows the current month.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedMonth = parseMonthKey(searchParams.get('month') ?? '') ?? currentCalendarMonth()
  const monthsQuery = useQuery({ queryKey: monthsQueryKey, queryFn: fetchMonths })
  const startedMonths = monthsQuery.data ?? []
  const selectedStartedMonth = startedMonths.find((startedMonth) =>
    isSameMonth(startedMonth, selectedMonth),
  )

  function selectMonth(calendarMonth: CalendarMonth) {
    setSearchParams({ month: toMonthKey(calendarMonth) })
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            This month's plan versus what you've actually spent.
          </p>
        </div>
        {monthsQuery.isPending ? (
          <MonthPickerSkeleton />
        ) : (
          <MonthPicker
            selectedMonth={selectedMonth}
            startedMonths={startedMonths}
            onSelect={selectMonth}
          />
        )}
      </div>
      {monthsQuery.isPending && <MonthSkeleton />}
      {monthsQuery.isLoadingError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't load your months. Please reload the page.
        </p>
      )}
      {/* Keyed by month, so switching months resets the forms. A failed refetch keeps the
          months already loaded, so the forms stay. */}
      {monthsQuery.data &&
        (selectedStartedMonth ? (
          <div key={toMonthKey(selectedMonth)} className="space-y-6">
            <MonthPlanVsActual month={selectedStartedMonth} />
            <MonthEntries calendarMonth={selectedMonth} />
          </div>
        ) : (
          <div key={toMonthKey(selectedMonth)} className="space-y-4">
            {startedMonths.length === 0 && (
              <p>Welcome to Rich Life. Start your first month by entering this month's income.</p>
            )}
            <StartMonthForm calendarMonth={selectedMonth} />
          </div>
        ))}
    </section>
  )
}

/**
 * Stands in for the month picker: two arrows around the dropdown. The month skeleton below
 * carries the loading label.
 */
function MonthPickerSkeleton() {
  return (
    <div aria-busy="true" className="flex items-center gap-2">
      <Skeleton className="size-9" />
      <Skeleton className="h-9 w-40" />
      <Skeleton className="size-9" />
    </div>
  )
}

/** Stands in for the selected month: its totals, then its bucket cards. */
function MonthSkeleton() {
  return (
    <LoadingSkeleton label="Loading your months…" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((totalIndex) => (
          <Skeleton key={totalIndex} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        {BUCKETS.map((bucket) => (
          <Skeleton key={bucket} className="h-32" />
        ))}
      </div>
    </LoadingSkeleton>
  )
}
