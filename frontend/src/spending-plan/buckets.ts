/** The four buckets every month's income is split into, in display order. */
export const BUCKETS = ['fixed_costs', 'investments', 'savings', 'guilt_free'] as const

export type Bucket = (typeof BUCKETS)[number]

export const BUCKET_LABELS: Record<Bucket, string> = {
  fixed_costs: 'Fixed Costs',
  investments: 'Investments',
  savings: 'Savings',
  guilt_free: 'Guilt-Free Spending',
}

/** A record with an entry for every bucket, built by calling `entryFor` on each. */
export function mapBuckets<T>(entryFor: (bucket: Bucket) => T): Record<Bucket, T> {
  return {
    fixed_costs: entryFor('fixed_costs'),
    investments: entryFor('investments'),
    savings: entryFor('savings'),
    guilt_free: entryFor('guilt_free'),
  }
}
