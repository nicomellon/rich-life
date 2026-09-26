import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  createEntry,
  refreshMonthEntries,
  storeAddedEntry,
  type NewEntry,
} from '@/entries/entries-api'
import { defaultEntryDate } from '@/entries/entry-date'
import { EntryForm, type TypedEntry } from '@/entries/entry-form'
import type { CalendarMonth } from '@/months/calendar-month'
import { BUCKETS } from '@/spending-plan/buckets'

interface AddEntryFormProps {
  calendarMonth: CalendarMonth
}

/** A quick-add form for the month's entries, dated today when today falls in the month. */
export function AddEntryForm({ calendarMonth }: AddEntryFormProps) {
  const queryClient = useQueryClient()
  const [nextEntry, setNextEntry] = useState<TypedEntry>(() => ({
    typedAmount: '',
    bucket: BUCKETS[0],
    date: defaultEntryDate(calendarMonth),
    description: '',
  }))
  // Changing the form's key after each added entry empties it for the next one.
  const [addedEntryCount, setAddedEntryCount] = useState(0)
  const addMutation = useMutation({
    mutationFn: (newEntry: NewEntry) => createEntry(calendarMonth, newEntry),
    onSuccess: async (createdEntry) => {
      // The next entry keeps the bucket and date, which suits adding several in a row.
      setNextEntry({
        typedAmount: '',
        bucket: createdEntry.bucket,
        date: createdEntry.date,
        description: '',
      })
      setAddedEntryCount((previousCount) => previousCount + 1)
      // Shown even if reloading the entries fails, so it isn't added twice.
      await storeAddedEntry(queryClient, calendarMonth, createdEntry)
      await refreshMonthEntries(queryClient, calendarMonth)
    },
  })

  return (
    <div className="space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">Add an entry</h3>
      <EntryForm
        key={addedEntryCount}
        label="Add an entry"
        calendarMonth={calendarMonth}
        initialEntry={nextEntry}
        onSave={(newEntry) => addMutation.mutate(newEntry)}
        isSaving={addMutation.isPending}
        renderActions={(canSave) => (
          <Button type="submit" disabled={!canSave || addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add entry'}
          </Button>
        )}
      />
      {addMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't add the entry. Please try again.
        </p>
      )}
    </div>
  )
}
