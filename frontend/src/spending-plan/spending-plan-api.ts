import { api } from '@/lib/api'
import type { Bucket } from '@/spending-plan/buckets'

/**
 * The backend's `SpendingPlanPercentages` schema: each bucket's share of the month's income, as a
 * decimal string such as "12.50" so no precision is lost. They add up to 100.
 */
export interface SpendingPlanPercentages {
  fixed_costs_pct: string
  investments_pct: string
  savings_pct: string
  guilt_free_pct: string
}

/** The `SpendingPlanPercentages` field that holds `bucket`'s percentage. */
export function percentageField(bucket: Bucket): keyof SpendingPlanPercentages {
  return `${bucket}_pct`
}

export const spendingPlanQueryKey = ['spending-plan'] as const

export function fetchSpendingPlan(): Promise<SpendingPlanPercentages> {
  return api.get<SpendingPlanPercentages>('/spending-plan')
}

export function updateSpendingPlan(
  newPlan: SpendingPlanPercentages,
): Promise<SpendingPlanPercentages> {
  return api.put<SpendingPlanPercentages>('/spending-plan', newPlan)
}
