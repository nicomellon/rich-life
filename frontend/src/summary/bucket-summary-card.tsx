import { useId } from 'react'
import { cn } from '@/lib/utils'
import { BUCKET_LABELS } from '@/spending-plan/buckets'
import { formatApiPercentage } from '@/spending-plan/percentages'
import {
  BUCKET_STATUS_BADGE_CLASSES,
  BUCKET_STATUS_FILL_CLASSES,
  BUCKET_STATUS_LABELS,
} from '@/summary/bucket-status'
import type { BucketSummary } from '@/summary/summary-api'

interface BucketSummaryCardProps {
  bucketSummary: BucketSummary
  formatAmount: (apiAmount: string) => string
}

/** One bucket's target next to its actual amount, with a progress bar in its status's colour. */
export function BucketSummaryCard({ bucketSummary, formatAmount }: BucketSummaryCardProps) {
  const headingId = useId()
  const { status } = bucketSummary

  function amountWithShare(apiAmount: string, apiPercentage: string): string {
    return `${formatAmount(apiAmount)} (${formatApiPercentage(apiPercentage)})`
  }

  return (
    <article aria-labelledby={headingId} className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-semibold">
          {BUCKET_LABELS[bucketSummary.bucket]}
        </h3>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            BUCKET_STATUS_BADGE_CLASSES[status],
          )}
        >
          {BUCKET_STATUS_LABELS[status]}
        </span>
      </div>
      {/* The amounts below say the same, so the bar is only for the eye. */}
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          data-testid="progress-fill"
          className={cn('h-full rounded-full', BUCKET_STATUS_FILL_CLASSES[status])}
          style={{ width: `${progressPercentage(bucketSummary)}%` }}
        />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Target</dt>
          <dd className="tabular-nums">
            {amountWithShare(bucketSummary.target_amount, bucketSummary.target_pct)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Actual</dt>
          <dd className="tabular-nums">
            {amountWithShare(bucketSummary.actual_amount, bucketSummary.actual_pct)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Remaining</dt>
          {/* Only flagged once over budget: a little over the target is still on track. */}
          <dd className={cn('tabular-nums', status === 'over' && 'text-status-over')}>
            {formatAmount(bucketSummary.remaining)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

/** How much of its target the bucket has used, from 0 to 100; full once it's reached. */
function progressPercentage(bucketSummary: BucketSummary): number {
  const targetAmount = Number(bucketSummary.target_amount)
  const actualAmount = Number(bucketSummary.actual_amount)
  if (targetAmount === 0) return actualAmount > 0 ? 100 : 0
  return Math.min((actualAmount / targetAmount) * 100, 100)
}
