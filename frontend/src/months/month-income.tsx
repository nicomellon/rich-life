import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useCurrentUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { showSaveError } from '@/lib/form-errors'
import { formatMoney, parseAmountInCents, toApiAmount } from '@/lib/money'
import { showSavedToast } from '@/lib/save-toasts'
import { IncomeField } from '@/months/income-field'
import {
  INCOME_FORM_FIELDS,
  incomeSchema,
  type TypedIncome,
  type ValidIncome,
} from '@/months/income-schema'
import { storeSavedMonth, updateMonthIncome, type Month } from '@/months/months-api'
import { monthSummaryQueryKey } from '@/summary/summary-api'

interface MonthIncomeProps {
  month: Month
}

/** A started month's income, with an Edit button that turns it into a form in place. */
export function MonthIncome({ month }: MonthIncomeProps) {
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const labelId = useId()
  const [isEditing, setIsEditing] = useState(false)
  // The saved "3000.00" shows as "3000".
  const savedTypedIncome = String(Number(month.income))
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<TypedIncome, unknown, ValidIncome>({
    resolver: zodResolver(incomeSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { income: savedTypedIncome },
  })
  const saveMutation = useMutation({
    mutationFn: (newIncome: string) => updateMonthIncome(month, newIncome),
    onSuccess: async (updatedMonth) => {
      showSavedToast('Income saved')
      await storeSavedMonth(queryClient, updatedMonth)
      // The bucket targets are shares of the income.
      void queryClient.invalidateQueries({ queryKey: monthSummaryQueryKey(month) })
      setIsEditing(false)
    },
  })

  function startEditing() {
    reset({ income: savedTypedIncome })
    saveMutation.reset()
    setIsEditing(true)
  }

  async function saveIncome({ income }: ValidIncome) {
    try {
      await saveMutation.mutateAsync(toApiAmount(income))
    } catch (saveError) {
      // The form stays open with what the user typed, to try again.
      showSaveError(saveError, INCOME_FORM_FIELDS, setError)
    }
  }

  if (!isEditing) {
    const savedIncomeInCents = parseAmountInCents(month.income)
    return (
      <div role="group" aria-labelledby={labelId} className="space-y-1">
        <p id={labelId} className="text-sm text-muted-foreground">
          Income
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold tabular-nums">
            {currentUser && savedIncomeInCents !== null
              ? formatMoney(savedIncomeInCents, currentUser.currency)
              : month.income}
          </p>
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil />
            Edit income
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(submitEvent) => void handleSubmit(saveIncome)(submitEvent)}
      noValidate
    >
      <IncomeField
        id="month-income"
        label="Income"
        incomeRegistration={register('income')}
        errorMessage={errors.income?.message}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save income'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={saveMutation.isPending}
          onClick={() => setIsEditing(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
