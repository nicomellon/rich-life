import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseAmountInCents } from '@/lib/money'

interface IncomeFieldProps {
  id: string
  label: string
  typedIncome: string
  onChange: (typedIncome: string) => void
}

/** A text field for a month's income that flags anything but an amount with 2 decimals. */
export function IncomeField({ id, label, typedIncome, onChange }: IncomeFieldProps) {
  const errorId = `${id}-error`
  const isInvalid = typedIncome.trim() !== '' && parseAmountInCents(typedIncome) === null

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 3000"
        className="max-w-48"
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? errorId : undefined}
        value={typedIncome}
        onChange={(event) => onChange(event.target.value)}
      />
      {isInvalid && (
        <p id={errorId} className="text-sm text-destructive">
          Enter an amount such as 3000 or 3000.50, with at most 2 decimals.
        </p>
      )}
    </div>
  )
}
