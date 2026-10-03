import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useMemo, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { FormFieldError } from '@/components/form-field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { NewEntry } from '@/entries/entries-api'
import { firstDayOfMonth, lastDayOfMonth } from '@/entries/entry-date'
import { entrySchema, type TypedEntry, type ValidEntry } from '@/entries/entry-schema'
import { invalidFieldProps, showSaveError } from '@/lib/form-errors'
import { toApiAmount } from '@/lib/money'
import type { CalendarMonth } from '@/months/calendar-month'
import { BUCKET_LABELS, BUCKETS } from '@/spending-plan/buckets'

interface EntryFormProps {
  /** The form's accessible name, e.g. "Add an entry". */
  label: string
  /** The month the entry belongs to; its date must fall in it. */
  calendarMonth: CalendarMonth
  initialEntry: TypedEntry
  /**
   * Saves the entry, called only once it's valid. When the save fails, the API's messages about
   * the fields show under them, and any other failure shows in a toast.
   */
  onSave: (savedEntry: NewEntry) => Promise<unknown>
  /** The submit button and any others. */
  actions: ReactNode
  /** While true the fields are disabled, so nothing typed is lost when the form resets. */
  isSaving: boolean
}

/** The fields of an entry: amount, bucket, date within the month, and description. */
export function EntryForm({
  label,
  calendarMonth,
  initialEntry,
  onSave,
  actions,
  isSaving,
}: EntryFormProps) {
  const fieldIdPrefix = useId()
  const monthEntrySchema = useMemo(() => entrySchema(calendarMonth), [calendarMonth])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TypedEntry, unknown, ValidEntry>({
    resolver: zodResolver(monthEntrySchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: initialEntry,
  })

  async function saveEntry(validEntry: ValidEntry) {
    try {
      await onSave({
        bucket: validEntry.bucket,
        amount: toApiAmount(validEntry.amount),
        date: validEntry.date,
        description: validEntry.description,
      })
    } catch (saveError) {
      showSaveError(saveError, monthEntrySchema.keyof().options, setError)
    }
  }

  const amountId = `${fieldIdPrefix}-amount`
  const bucketId = `${fieldIdPrefix}-bucket`
  const dateId = `${fieldIdPrefix}-date`
  const descriptionId = `${fieldIdPrefix}-description`
  const amountErrorId = `${amountId}-error`
  const bucketErrorId = `${bucketId}-error`
  const dateErrorId = `${dateId}-error`
  const descriptionErrorId = `${descriptionId}-error`

  return (
    <form
      aria-label={label}
      className="space-y-2"
      onSubmit={(submitEvent) => void handleSubmit(saveEntry)(submitEvent)}
      noValidate
    >
      <fieldset disabled={isSaving} className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor={amountId}>Amount</Label>
          <Input
            id={amountId}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 12.50"
            className="w-32"
            {...invalidFieldProps(amountErrorId, errors.amount?.message)}
            {...register('amount')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={bucketId}>Bucket</Label>
          <NativeSelect
            id={bucketId}
            className="block"
            {...invalidFieldProps(bucketErrorId, errors.bucket?.message)}
            {...register('bucket')}
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
            {...invalidFieldProps(dateErrorId, errors.date?.message)}
            {...register('date')}
          />
        </div>
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor={descriptionId}>Description (optional)</Label>
          <Input
            id={descriptionId}
            autoComplete="off"
            placeholder="e.g. Rent"
            {...invalidFieldProps(descriptionErrorId, errors.description?.message)}
            {...register('description')}
          />
        </div>
        <div className="flex gap-2">{actions}</div>
      </fieldset>
      <FormFieldError id={amountErrorId} message={errors.amount?.message} />
      <FormFieldError id={bucketErrorId} message={errors.bucket?.message} />
      <FormFieldError id={dateErrorId} message={errors.date?.message} />
      <FormFieldError id={descriptionErrorId} message={errors.description?.message} />
    </form>
  )
}
