import { BUCKET_LABELS } from '@/spending-plan/buckets'
import type { BucketStatus, MonthSummary } from '@/summary/summary-api'

/** One bucket's bar pair in the plan vs actual chart, with amounts as numbers. */
export interface PlanVsActualRow {
  bucketLabel: string
  targetAmount: number
  actualAmount: number
  status: BucketStatus
}

/** The chart's rows, one per bucket in the summary's order. */
export function toPlanVsActualRows(monthSummary: MonthSummary): PlanVsActualRow[] {
  return monthSummary.buckets.map((bucketSummary) => ({
    bucketLabel: BUCKET_LABELS[bucketSummary.bucket],
    targetAmount: Number(bucketSummary.target_amount),
    actualAmount: Number(bucketSummary.actual_amount),
    status: bucketSummary.status,
  }))
}
