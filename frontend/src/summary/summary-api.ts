import { api } from '@/lib/api'
import type { CalendarMonth } from '@/months/calendar-month'
import type { Bucket } from '@/spending-plan/buckets'

/** How a bucket's actual amount compares with its target amount. */
export type BucketStatus = 'under' | 'on_track' | 'over'

/**
 * The backend's `BucketSummary` schema: one bucket's target next to what its entries add up to.
 * Amounts and percentages are decimal strings with 2 decimals, such as "1500.00".
 */
export interface BucketSummary {
  bucket: Bucket
  target_pct: string
  target_amount: string
  actual_amount: string
  actual_pct: string
  /** Negative when the entries add up to more than the target. */
  remaining: string
  status: BucketStatus
}

/** The backend's `MonthSummary` schema: each bucket in the order of `BUCKETS`, and the totals. */
export interface MonthSummary {
  income: string
  buckets: BucketSummary[]
  total_actual: string
  /** Negative when the entries add up to more than the income. */
  unallocated: string
}

export function monthSummaryQueryKey({ year, month }: CalendarMonth) {
  return ['summary', year, month] as const
}

export function fetchMonthSummary({ year, month }: CalendarMonth): Promise<MonthSummary> {
  return api.get<MonthSummary>(`/months/${year}/${month}/summary`)
}
