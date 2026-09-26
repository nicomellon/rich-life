import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { compareNewestFirst, isSameMonth, type CalendarMonth } from '@/months/calendar-month'
import type { SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'

/**
 * The backend's `MonthRead` schema: a budgeted month, its income as a decimal string such as
 * "3000.00", and the share of the income each bucket targets.
 */
export interface Month extends SpendingPlanPercentages, CalendarMonth {
  income: string
  created_at: string
}

/** The backend's `MonthCreate` schema. */
export interface NewMonth extends CalendarMonth {
  income: string
}

export const monthsQueryKey = ['months'] as const

/** The user's months, newest first. */
export function fetchMonths(): Promise<Month[]> {
  return api.get<Month[]>('/months')
}

/** Starts the month with the targets of the current spending plan. */
export function createMonth(newMonth: NewMonth): Promise<Month> {
  return api.post<Month>('/months', newMonth)
}

export function updateMonthIncome({ year, month }: CalendarMonth, income: string): Promise<Month> {
  return api.patch<Month>(`/months/${year}/${month}`, { income })
}

/** `months` with `savedMonth` added, or replacing the stored copy, kept newest first. */
export function withSavedMonth(months: Month[], savedMonth: Month): Month[] {
  return [
    savedMonth,
    ...months.filter((storedMonth) => !isSameMonth(storedMonth, savedMonth)),
  ].sort(compareNewestFirst)
}

/** Puts the month the API returned after a save into the cached list of months. */
export async function storeSavedMonth(queryClient: QueryClient, savedMonth: Month): Promise<void> {
  // A refetch still in flight would otherwise overwrite it with the list from before the save.
  await queryClient.cancelQueries({ queryKey: monthsQueryKey })
  queryClient.setQueryData<Month[]>(monthsQueryKey, (storedMonths = []) =>
    withSavedMonth(storedMonths, savedMonth),
  )
}
