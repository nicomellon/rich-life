import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { DESCRIPTION_MAX_LENGTH, type NewEntry } from '@/entries/entries-api'
import { firstDayOfMonth, isDateInMonth, lastDayOfMonth } from '@/entries/entry-date'
import { parseAmountInCents, toApiAmount } from '@/lib/money'
import { formatCalendarMonth, type CalendarMonth } from '@/months/calendar-month'
import { BUCKET_LABELS, BUCKETS, type Bucket } from '@/spending-plan/buckets'

/** An entry as typed into the form, e.g. "12.5" for an amount of "12.50". */
export interface TypedEntry {
  typedAmount: string
  bucket: Bucket
  date: string
  description: string
}

interface EntryFormProps {
  /** The form's accessible name, e.g. "Add an entry". */
  label: string
  /** The month the entry belongs to; its date must fall in it. */
  calendarMonth: CalendarMonth
  initialEntry: TypedEntry
  /** Called with the entry, only when its amount and date are valid. */
  onSave: (savedEntry: NewEntry) => void
  /** The submit button and any others, given whether the entry can be saved. */
  renderActions: (canSave: boolean) => ReactNode
  /** While true the fields are disabled, so nothing typed is lost when the form resets. */
  isSaving: boolean
}

/** The fields of an entry: amount, bucket, date within the month, and description. */
export function EntryForm({
  label,
  calendarMonth,
  initialEntry,
  onSave,
  renderActions,
  isSaving,
}: EntryFormProps) {
  const fieldIdPrefix = useId()
  const [typedEntry, setTypedEntry] = useState(initialEntry)
  const amountInCents = parseAmountInCents(typedEntry.typedAmount)
  const isAmountValid = amountInCents !== null && amountInCents > 0
  const isDateValid = isDateInMonth(typedEntry.date, calendarMonth)
  const showAmountError = typedEntry.typedAmount.trim() !== '' && !isAmountValid
  const showDateError = !isDateValid

  function changeField<Field extends keyof TypedEntry>(
    field: Field,
    typedValue: TypedEntry[Field],
  ) {
    setTypedEntry((previousTypedEntry) => ({ ...previousTypedEntry, [field]: typedValue }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (amountInCents === null || !isAmountValid || !isDateValid) return
    onSave({
      bucket: typedEntry.bucket,
      amount: toApiAmount(amountInCents),
      date: typedEntry.date,
      description: typedEntry.description.trim(),
    })
  }

  const amountId = `${fieldIdPrefix}-amount`
  const bucketId = `${fieldIdPrefix}-bucket`
  const dateId = `${fieldIdPrefix}-date`
  const descriptionId = `${fieldIdPrefix}-description`

  return (
    <form aria-label={label} className="space-y-2" onSubmit={handleSubmit} noValidate>
      <fieldset disabled={isSaving} className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor={amountId}>Amount</Label>
          <Input
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 12.50"
            className="w-32"
            aria-invalid={showAmountError}
            aria-describedby={showAmountError ? `${amountId}-error` : undefined}
            value={typedEntry.typedAmount}
            onChange={(event) => changeField('typedAmount', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={bucketId}>Bucket</Label>
          <NativeSelect
            id={bucketId}
            className="block"
            value={typedEntry.bucket}
            onChange={(event) => changeField('bucket', toBucket(event.target.value))}
          >
            {BUCKETS.map((bucket) => (
              <option key={bucket} value={bucket}>
                {BUCKET_LABELS[bucket]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor={dateId}>Date</Label>
          <Input
            id={dateId}
            type="date"
            className="w-40"
            min={firstDayOfMonth(calendarMonth)}
            max={lastDayOfMonth(calendarMonth)}
            aria-invalid={showDateError}
            aria-describedby={showDateError ? `${dateId}-error` : undefined}
            value={typedEntry.date}
            onChange={(event) => changeField('date', event.target.value)}
          />
        </div>
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor={descriptionId}>Description (optional)</Label>
          <Input
            id={descriptionId}
            autoComplete="off"
            placeholder="e.g. Rent"
            maxLength={DESCRIPTION_MAX_LENGTH}
            value={typedEntry.description}
            onChange={(event) => changeField('description', event.target.value)}
          />
        </div>
        <div className="flex gap-2">{renderActions(isAmountValid && isDateValid)}</div>
      </fieldset>
      {showAmountError && (
        <p id={`${amountId}-error`} className="text-sm text-destructive">
          Enter an amount above 0 such as 12 or 12.50, with at most 2 decimals.
        </p>
      )}
      {showDateError && (
        <p id={`${dateId}-error`} className="text-sm text-destructive">
          Pick a day in {formatCalendarMonth(calendarMonth)}.
        </p>
      )}
    </form>
  )
}

function toBucket(selectedOption: string): Bucket {
  return BUCKETS.find((bucket) => bucket === selectedOption) ?? BUCKETS[0]
}
