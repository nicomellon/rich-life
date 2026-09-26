import type { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CalendarMonth } from '@/months/calendar-month'
import type { Bucket } from '@/spending-plan/buckets'
import { monthSummaryQueryKey } from '@/summary/summary-api'

/** The backend's `EntryRead` schema: an expense or allocation in one of the month's buckets. */
export interface Entry {
  id: number
  bucket: Bucket
  /** A decimal string above 0, such as "1200.00". */
  amount: string
  /** The day it happened, as YYYY-MM-DD, within the entry's month. */
  date: string
  description: string
  created_at: string
}

/** The backend's `EntryCreate` schema; also sent in full to change an entry. */
export interface NewEntry {
  bucket: Bucket
  amount: string
  date: string
  description: string
}

/** The backend's longest description (`DESCRIPTION_MAX_LENGTH`). */
export const DESCRIPTION_MAX_LENGTH = 255

export function monthEntriesQueryKey({ year, month }: CalendarMonth) {
  return ['entries', year, month] as const
}

/** The month's entries, newest first. */
export function fetchMonthEntries({ year, month }: CalendarMonth): Promise<Entry[]> {
  return api.get<Entry[]>(`/months/${year}/${month}/entries`)
}

export function createEntry({ year, month }: CalendarMonth, newEntry: NewEntry): Promise<Entry> {
  return api.post<Entry>(`/months/${year}/${month}/entries`, newEntry)
}

export function updateEntry(entryId: number, changedEntry: NewEntry): Promise<Entry> {
  return api.patch<Entry>(`/entries/${entryId}`, changedEntry)
}

export function deleteEntry(entryId: number): Promise<void> {
  return api.delete(`/entries/${entryId}`)
}

/** Puts a newly added entry into the cached list of the month's entries, keeping it newest first. */
export async function storeAddedEntry(
  queryClient: QueryClient,
  calendarMonth: CalendarMonth,
  createdEntry: Entry,
): Promise<void> {
  // A refetch still in flight would otherwise overwrite it with the list from before the add.
  await queryClient.cancelQueries({ queryKey: monthEntriesQueryKey(calendarMonth) })
  queryClient.setQueryData<Entry[]>(monthEntriesQueryKey(calendarMonth), (storedEntries = []) => {
    // The newest entry comes first among those on its date, as in the API.
    const insertIndex = storedEntries.findIndex(
      (storedEntry) => storedEntry.date <= createdEntry.date,
    )
    return insertIndex === -1
      ? [...storedEntries, createdEntry]
      : storedEntries.toSpliced(insertIndex, 0, createdEntry)
  })
}

/** Puts the entry the API returned after a change into the cached list of the month's entries. */
export async function storeUpdatedEntry(
  queryClient: QueryClient,
  calendarMonth: CalendarMonth,
  updatedEntry: Entry,
): Promise<void> {
  // A refetch still in flight would otherwise overwrite it with the list from before the change.
  await queryClient.cancelQueries({ queryKey: monthEntriesQueryKey(calendarMonth) })
  queryClient.setQueryData<Entry[]>(monthEntriesQueryKey(calendarMonth), (storedEntries = []) =>
    storedEntries.map((storedEntry) =>
      storedEntry.id === updatedEntry.id ? updatedEntry : storedEntry,
    ),
  )
}

/** Takes a deleted entry out of the cached list of the month's entries. */
export async function removeStoredEntry(
  queryClient: QueryClient,
  calendarMonth: CalendarMonth,
  deletedEntryId: number,
): Promise<void> {
  await queryClient.cancelQueries({ queryKey: monthEntriesQueryKey(calendarMonth) })
  queryClient.setQueryData<Entry[]>(monthEntriesQueryKey(calendarMonth), (storedEntries = []) =>
    storedEntries.filter((storedEntry) => storedEntry.id !== deletedEntryId),
  )
}

/** Reloads the month's entries and its summary, after an entry was added, changed or deleted. */
export async function refreshMonthEntries(
  queryClient: QueryClient,
  calendarMonth: CalendarMonth,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monthEntriesQueryKey(calendarMonth) }),
    queryClient.invalidateQueries({ queryKey: monthSummaryQueryKey(calendarMonth) }),
  ])
}
