import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
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
        <MonthPicker
          selectedMonth={selectedMonth}
          startedMonths={startedMonths}
          onSelect={selectMonth}
        />
      </div>
      {monthsQuery.isPending && (
        <p className="text-sm text-muted-foreground">Loading your months…</p>
      )}
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
          <StartMonthForm key={toMonthKey(selectedMonth)} calendarMonth={selectedMonth} />
        ))}
    </section>
  )
}
