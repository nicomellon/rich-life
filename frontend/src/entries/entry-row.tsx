import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  deleteEntry,
  refreshMonthEntries,
  removeStoredEntry,
  storeUpdatedEntry,
  updateEntry,
  type Entry,
  type NewEntry,
} from '@/entries/entries-api'
import { formatEntryDate } from '@/entries/entry-date'
import { EntryForm } from '@/entries/entry-form'
import type { TypedEntry } from '@/entries/entry-schema'
import { showSaveFailedToast, showSavedToast } from '@/lib/save-toasts'
import type { CalendarMonth } from '@/months/calendar-month'

type EntryRowMode = 'viewing' | 'editing' | 'confirmingDelete'

interface EntryRowProps {
  entry: Entry
  calendarMonth: CalendarMonth
  /** An amount from the API for display, in the user's currency. */
  formatAmount: (apiAmount: string) => string
}

/** One entry in the list. Edit turns it into a form in place; Delete asks to confirm first. */
export function EntryRow({ entry, calendarMonth, formatAmount }: EntryRowProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<EntryRowMode>('viewing')
  const formattedAmount = formatAmount(entry.amount)
  const entryName = entry.description || `${formattedAmount} entry`
  const updateMutation = useMutation({
    mutationFn: (changedEntry: NewEntry) => updateEntry(entry.id, changedEntry),
    onSuccess: async (updatedEntry) => {
      showSavedToast('Entry saved')
      // Shown even if reloading the entries fails.
      await storeUpdatedEntry(queryClient, calendarMonth, updatedEntry)
      await refreshMonthEntries(queryClient, calendarMonth)
      setMode('viewing')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteEntry(entry.id),
    onSuccess: async () => {
      showSavedToast('Entry deleted')
      // Gone from the list even if reloading the entries fails.
      await removeStoredEntry(queryClient, calendarMonth, entry.id)
      await refreshMonthEntries(queryClient, calendarMonth)
    },
    onError: showSaveFailedToast,
  })

  function switchTo(nextMode: EntryRowMode) {
    updateMutation.reset()
    deleteMutation.reset()
    setMode(nextMode)
  }

  if (mode === 'editing') {
    return (
      <li className="space-y-2 py-3">
        <EntryForm
          label={`Edit ${entryName}`}
          calendarMonth={calendarMonth}
          initialEntry={toTypedEntry(entry)}
          // On failure the form stays open with what the user typed, to try again.
          onSave={updateMutation.mutateAsync}
          isSaving={updateMutation.isPending}
          actions={
            <>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving…' : 'Save entry'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={updateMutation.isPending}
                onClick={() => switchTo('viewing')}
              >
                Cancel
              </Button>
            </>
          }
        />
      </li>
    )
  }

  if (mode === 'confirmingDelete') {
    return (
      <li className="space-y-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm">Delete {entryName}? This can't be undone.</p>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={deleteMutation.isPending}
            onClick={() => switchTo('viewing')}
          >
            Cancel
          </Button>
        </div>
      </li>
    )
  }

  return (
    // On phones the description gets a line of its own, above the date, amount and buttons.
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="w-16 shrink-0 text-sm text-muted-foreground">
        {formatEntryDate(entry.date)}
      </span>
      <span className="min-w-0 flex-1 truncate max-sm:order-first max-sm:basis-full">
        {entry.description || <span className="text-muted-foreground">No description</span>}
      </span>
      <span className="font-medium tabular-nums max-sm:ml-auto">{formattedAmount}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${entryName}`}
        onClick={() => switchTo('editing')}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${entryName}`}
        onClick={() => switchTo('confirmingDelete')}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

/** The saved entry as the form shows it, e.g. an amount of "12.50" as "12.5". */
function toTypedEntry(entry: Entry): TypedEntry {
  return {
    amount: String(Number(entry.amount)),
    bucket: entry.bucket,
    date: entry.date,
    description: entry.description,
  }
}
