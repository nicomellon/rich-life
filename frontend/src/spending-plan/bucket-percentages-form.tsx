import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useCurrentUser } from '@/auth/auth-context'
import { FormFieldError } from '@/components/form-field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invalidFieldProps, showSaveError } from '@/lib/form-errors'
import { formatMoney, parseAmountInCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BUCKET_LABELS, BUCKETS, mapBuckets } from '@/spending-plan/buckets'
import {
  FULL_PLAN_BASIS_POINTS,
  formatPercentage,
  parsePercentage,
  shareInCents,
  toApiPercentage,
} from '@/spending-plan/percentages'
import {
  BUCKET_PERCENTAGES_FORM_FIELDS,
  bucketPercentagesSchema,
  percentagesTotalError,
  type TypedBucketPercentages,
  type ValidBucketPercentages,
} from '@/spending-plan/percentages-schema'
import { percentageField, type SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'

interface BucketPercentagesFormProps {
  /** The percentages the form starts with. */
  initialPercentages: SpendingPlanPercentages
  /**
   * Saves the new percentages, called only once each is valid and they add up to 100. When the
   * save fails, the API's messages about the fields show under them, and any other failure shows
   * in a toast.
   */
  onSave: (newPercentages: SpendingPlanPercentages) => Promise<unknown>
  isSaving: boolean
  /** The submit button's text, e.g. "Save plan". */
  submitLabel: string
  /**
   * The income, as the API writes it, that the form previews each bucket's share of. Without it,
   * the form has an optional field to type one.
   */
  previewIncome?: string
  /** Shows a Cancel button that calls it. */
  onCancel?: () => void
}

/**
 * One percentage field per bucket, with a live total and a preview of what each bucket gets from
 * a given income. It's saved only when the percentages add up to exactly 100%.
 */
export function BucketPercentagesForm({
  initialPercentages,
  onSave,
  isSaving,
  submitLabel,
  previewIncome,
  onCancel,
}: BucketPercentagesFormProps) {
  const { data: currentUser } = useCurrentUser()
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitted },
  } = useForm<TypedBucketPercentages, unknown, ValidBucketPercentages>({
    resolver: zodResolver(bucketPercentagesSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    // What the user typed, e.g. "12.5" for a saved "12.50".
    defaultValues: {
      fixed_costs_pct: String(Number(initialPercentages.fixed_costs_pct)),
      investments_pct: String(Number(initialPercentages.investments_pct)),
      savings_pct: String(Number(initialPercentages.savings_pct)),
      guilt_free_pct: String(Number(initialPercentages.guilt_free_pct)),
    },
  })
  const typedPercentages = useWatch({ control })
  const [typedIncome, setTypedIncome] = useState('')

  const basisPointsByBucket = mapBuckets((bucket) =>
    parsePercentage(typedPercentages[percentageField(bucket)] ?? ''),
  )
  const validBasisPoints = Object.values(basisPointsByBucket).filter(
    (basisPoints) => basisPoints !== null,
  )
  const allPercentagesValid = validBasisPoints.length === BUCKETS.length
  const totalBasisPoints = validBasisPoints.reduce((total, basisPoints) => total + basisPoints, 0)
  const isTotalFull = allPercentagesValid && totalBasisPoints === FULL_PLAN_BASIS_POINTS
  const incomeInCents = parseAmountInCents(previewIncome ?? typedIncome)
  const totalErrorMessage = errors.root?.total?.message

  async function savePercentages(validPercentages: ValidBucketPercentages) {
    try {
      await onSave({
        fixed_costs_pct: toApiPercentage(validPercentages.fixed_costs_pct),
        investments_pct: toApiPercentage(validPercentages.investments_pct),
        savings_pct: toApiPercentage(validPercentages.savings_pct),
        guilt_free_pct: toApiPercentage(validPercentages.guilt_free_pct),
      })
    } catch (saveError) {
      // The form keeps what the user typed, to try again.
      showSaveError(saveError, BUCKET_PERCENTAGES_FORM_FIELDS, setError)
    }
  }

  // A field's own error updates as the user types, but the total's depends on every field. Only
  // the total is checked, so the other fields keep their errors, including the API's.
  function revalidateTotal() {
    if (!isSubmitted) return
    const totalError = percentagesTotalError(getValues())
    if (totalError) {
      setError('root.total', { type: 'custom', message: totalError })
    } else {
      clearErrors('root.total')
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(submitEvent) => void handleSubmit(savePercentages)(submitEvent)}
      noValidate
    >
      {previewIncome === undefined && (
        <div className="space-y-2">
          <Label htmlFor="preview-income">Monthly income (optional)</Label>
          <Input
            id="preview-income"
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 3000"
            className="max-w-48"
            aria-describedby="preview-income-hint"
            value={typedIncome}
            onChange={(event) => setTypedIncome(event.target.value)}
          />
          <p id="preview-income-hint" className="text-sm text-muted-foreground">
            Previews how much each bucket gets. It isn't saved.
          </p>
        </div>
      )}

      <div className="divide-y rounded-md border">
        {BUCKETS.map((bucket) => {
          const percentageFieldName = percentageField(bucket)
          const inputId = `percentage-${bucket}`
          const errorId = `${inputId}-error`
          const basisPoints = basisPointsByBucket[bucket]
          const fieldErrorMessage = errors[percentageFieldName]?.message
          return (
            <div key={bucket} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <Label htmlFor={inputId} className="min-w-44">
                {BUCKET_LABELS[bucket]}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-24 text-right"
                  {...invalidFieldProps(errorId, fieldErrorMessage)}
                  {...register(percentageFieldName, { onChange: revalidateTotal })}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              {basisPoints !== null && incomeInCents !== null && currentUser && (
                <span className="ml-auto text-sm tabular-nums">
                  {formatMoney(shareInCents(incomeInCents, basisPoints), currentUser.currency)}
                </span>
              )}
              <FormFieldError id={errorId} message={fieldErrorMessage} className="w-full" />
            </div>
          )
        })}
      </div>

      <div className="space-y-1">
        <div
          role="status"
          aria-label="Total"
          className={cn('text-sm', isTotalFull ? 'text-muted-foreground' : 'text-destructive')}
        >
          {allPercentagesValid
            ? totalMessage(totalBasisPoints)
            : 'Enter a valid percentage for every bucket to see the total.'}
        </div>
        {totalErrorMessage && (
          // Announced on submit, as it belongs to no one field to describe.
          <p role="alert" className="text-sm text-destructive">
            {totalErrorMessage}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" disabled={isSaving} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

/** The total, and what to change when it isn't 100%. */
function totalMessage(totalBasisPoints: number): string {
  const totalLabel = `Total: ${formatPercentage(totalBasisPoints)}`
  const missingBasisPoints = FULL_PLAN_BASIS_POINTS - totalBasisPoints
  if (missingBasisPoints > 0)
    return `${totalLabel}. Add ${formatPercentage(missingBasisPoints)} to reach 100%.`
  if (missingBasisPoints < 0) {
    return `${totalLabel}. Remove ${formatPercentage(-missingBasisPoints)} to get back to 100%.`
  }
  return totalLabel
}
