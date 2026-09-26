import { QueryClient } from '@tanstack/react-query'
import { monthEntriesQueryKey, storeAddedEntry, type Entry } from '@/entries/entries-api'
import { groceriesEntry, rentEntry } from '@/test/api-mock'

const september2026 = { year: 2026, month: 9 }

describe('storeAddedEntry', () => {
  it.each([
    ['before older entries', '2026-09-15', [3, 2, 1]],
    ['after newer entries', '2026-09-05', [2, 3, 1]],
    ['first among entries on its date', '2026-09-12', [3, 2, 1]],
    ['last when it is the oldest', '2026-08-31', [2, 1, 3]],
  ])('puts the added entry %s', async (_, addedDate, expectedEntryIds) => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(monthEntriesQueryKey(september2026), [groceriesEntry, rentEntry])
    const addedEntry: Entry = { ...groceriesEntry, id: 3, date: addedDate }

    await storeAddedEntry(queryClient, september2026, addedEntry)

    const storedEntries = queryClient.getQueryData<Entry[]>(monthEntriesQueryKey(september2026))
    expect(storedEntries?.map((storedEntry) => storedEntry.id)).toEqual(expectedEntryIds)
  })
})
