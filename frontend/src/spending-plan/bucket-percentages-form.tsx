import { useState, type FormEvent } from 'react'
import { useCurrentUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, parseAmountInCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import { BUCKET_LABELS, BUCKETS, mapBuckets, type Bucket } from '@/spending-plan/buckets'
import {
  FULL_PLAN_BASIS_POINTS,
  formatPercentage,
  parsePercentage,
  shareInCents,
  toApiPercentage,
} from '@/spending-plan/percentages'
import { percentageField, type SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'

interface BucketPercentagesFormProps {
  /** The percentages the form starts with. */
  initialPercentages: SpendingPlanPercentages
  /** Called with the new percentages, only when each is valid and they add up to 100. */
  onSave: (newPercentages: SpendingPlanPercentages) => void
  isSaving: boolean
  /** Called whenever the user changes a field. */
  onEdit?: () => void
}

/**
 * One percentage field per bucket, with a live total and a preview of what each bucket gets from
 * a given income. It can only be submitted when the percentages add up to exactly 100%.
 */
export function BucketPercentagesForm({
  initialPercentages,
  onSave,
  isSaving,
  onEdit,
}: BucketPercentagesFormProps) {
  const { data: currentUser } = useCurrentUser()
  // What the user typed, e.g. "12.5" for a saved "12.50".
  const [typedPercentages, setTypedPercentages] = useState(() =>
    mapBuckets((bucket) => String(Number(initialPercentages[percentageField(bucket)]))),
  )
  const [typedIncome, setTypedIncome] = useState('')

  const basisPointsByBucket = mapBuckets((bucket) => parsePercentage(typedPercentages[bucket]))
  const validBasisPoints = Object.values(basisPointsByBucket).filter(
    (basisPoints) => basisPoints !== null,
  )
  const allPercentagesValid = validBasisPoints.length === BUCKETS.length
  const totalBasisPoints = validBasisPoints.reduce((total, basisPoints) => total + basisPoints, 0)
  const canSave = allPercentagesValid && totalBasisPoints === FULL_PLAN_BASIS_POINTS
  const incomeInCents = parseAmountInCents(typedIncome)

  function changePercentage(bucket: Bucket, typedPercentage: string) {
    setTypedPercentages((previousTypedPercentages) => ({
      ...previousTypedPercentages,
      [bucket]: typedPercentage,
    }))
    onEdit?.()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    const apiPercentages = mapBuckets((bucket) => toApiPercentage(basisPointsByBucket[bucket] ?? 0))
    onSave({
      fixed_costs_pct: apiPercentages.fixed_costs,
      investments_pct: apiPercentages.investments,
      savings_pct: apiPercentages.savings,
      guilt_free_pct: apiPercentages.guilt_free,
    })
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate>
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

      <div className="divide-y rounded-md border">
        {BUCKETS.map((bucket) => {
          const inputId = `percentage-${bucket}`
          const errorId = `${inputId}-error`
          const basisPoints = basisPointsByBucket[bucket]
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
                  aria-invalid={basisPoints === null}
                  aria-describedby={basisPoints === null ? errorId : undefined}
                  value={typedPercentages[bucket]}
                  onChange={(event) => changePercentage(bucket, event.target.value)}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              {basisPoints !== null && incomeInCents !== null && currentUser && (
                <span className="ml-auto text-sm tabular-nums">
                  {formatMoney(shareInCents(incomeInCents, basisPoints), currentUser.currency)}
                </span>
              )}
              {basisPoints === null && (
                <p id={errorId} className="w-full text-sm text-destructive">
                  Enter a number from 0 to 100, with at most 2 decimals.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div
        role="status"
        aria-label="Total"
        className={cn('text-sm', canSave ? 'text-muted-foreground' : 'text-destructive')}
      >
        {allPercentagesValid
          ? totalMessage(totalBasisPoints)
          : 'Enter a valid percentage for every bucket to see the total.'}
      </div>

      <Button type="submit" disabled={!canSave || isSaving}>
        {isSaving ? 'Saving…' : 'Save plan'}
      </Button>
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
