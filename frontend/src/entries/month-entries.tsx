import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { useCurrentUser } from '@/auth/auth-context'
import { AddEntryForm } from '@/entries/add-entry-form'
import { fetchMonthEntries, monthEntriesQueryKey, type Entry } from '@/entries/entries-api'
import { EntryRow } from '@/entries/entry-row'
import { formatApiAmount } from '@/lib/money'
import type { CalendarMonth } from '@/months/calendar-month'
import { BUCKET_LABELS, BUCKETS, type Bucket } from '@/spending-plan/buckets'
import { fetchMonthSummary, monthSummaryQueryKey, type BucketSummary } from '@/summary/summary-api'

interface MonthEntriesProps {
  /** A month the user has started. */
  calendarMonth: CalendarMonth
}

/** The month's entries grouped by bucket, each with how much of its target they add up to. */
export function MonthEntries({ calendarMonth }: MonthEntriesProps) {
  const { data: currentUser } = useCurrentUser()
  const entriesQuery = useQuery({
    queryKey: monthEntriesQueryKey(calendarMonth),
    queryFn: () => fetchMonthEntries(calendarMonth),
  })
  // The dashboard's plan vs actual reports when the summary fails to load.
  const summaryQuery = useQuery({
    queryKey: monthSummaryQueryKey(calendarMonth),
    queryFn: () => fetchMonthSummary(calendarMonth),
  })

  function formatAmount(apiAmount: string): string {
    return currentUser ? formatApiAmount(apiAmount, currentUser.currency) : apiAmount
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Entries</h2>
      <AddEntryForm calendarMonth={calendarMonth} />
      {entriesQuery.isPending && (
        <p className="text-sm text-muted-foreground">Loading your entries…</p>
      )}
      {entriesQuery.isLoadingError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't load this month's entries. Please reload the page.
        </p>
      )}
      {entriesQuery.data &&
        BUCKETS.map((bucket) => (
          <BucketEntries
            key={bucket}
            bucket={bucket}
            calendarMonth={calendarMonth}
            bucketEntries={entriesQuery.data.filter((entry) => entry.bucket === bucket)}
            bucketSummary={summaryQuery.data?.buckets.find(
              (summarizedBucket) => summarizedBucket.bucket === bucket,
            )}
            formatAmount={formatAmount}
          />
        ))}
    </section>
  )
}

interface BucketEntriesProps {
  bucket: Bucket
  calendarMonth: CalendarMonth
  /** The bucket's entries, newest first. */
  bucketEntries: Entry[]
  /** The bucket's totals, once they're loaded. */
  bucketSummary: BucketSummary | undefined
  formatAmount: (apiAmount: string) => string
}

function BucketEntries({
  bucket,
  calendarMonth,
  bucketEntries,
  bucketSummary,
  formatAmount,
}: BucketEntriesProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="rounded-md border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-semibold">
          {BUCKET_LABELS[bucket]}
        </h3>
        {bucketSummary && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatAmount(bucketSummary.actual_amount)} of{' '}
            {formatAmount(bucketSummary.target_amount)}
          </p>
        )}
      </div>
      {bucketEntries.length === 0 ? (
        <p className="pt-2 text-sm text-muted-foreground">No entries yet.</p>
      ) : (
        <ul className="divide-y">
          {bucketEntries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              calendarMonth={calendarMonth}
              formatAmount={formatAmount}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
