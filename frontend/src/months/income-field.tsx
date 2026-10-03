import type { UseFormRegisterReturn } from 'react-hook-form'
import { FormFieldError } from '@/components/form-field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { invalidFieldProps } from '@/lib/form-errors'

interface IncomeFieldProps {
  id: string
  label: string
  /** The field's registration with the form, from `register('income')`. */
  incomeRegistration: UseFormRegisterReturn<'income'>
  /** The error to show under the field, if any. */
  errorMessage: string | undefined
}

/** A text field for a month's income, with its error under it. */
export function IncomeField({ id, label, incomeRegistration, errorMessage }: IncomeFieldProps) {
  const errorId = `${id}-error`

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="e.g. 3000"
        className="max-w-48"
        {...invalidFieldProps(errorId, errorMessage)}
        {...incomeRegistration}
      />
      <FormFieldError id={errorId} message={errorMessage} />
    </div>
  )
}
