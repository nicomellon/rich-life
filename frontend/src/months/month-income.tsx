import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useCurrentUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { formatMoney, parseAmountInCents, toApiAmount } from '@/lib/money'
import { IncomeField } from '@/months/income-field'
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
  const [typedIncome, setTypedIncome] = useState(savedTypedIncome)
  const incomeInCents = parseAmountInCents(typedIncome)
  const saveMutation = useMutation({
    mutationFn: (newIncome: string) => updateMonthIncome(month, newIncome),
    onSuccess: async (updatedMonth) => {
      await storeSavedMonth(queryClient, updatedMonth)
      // The bucket targets are shares of the income.
      void queryClient.invalidateQueries({ queryKey: monthSummaryQueryKey(month) })
      setIsEditing(false)
    },
  })

  function startEditing() {
    setTypedIncome(savedTypedIncome)
    saveMutation.reset()
    setIsEditing(true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (incomeInCents === null) return
    saveMutation.mutate(toApiAmount(incomeInCents))
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
    <form className="max-w-md space-y-4" onSubmit={handleSubmit} noValidate>
      <IncomeField
        id="month-income"
        label="Income"
        typedIncome={typedIncome}
        onChange={setTypedIncome}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={incomeInCents === null || saveMutation.isPending}>
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
      {saveMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't save the income. Please try again.
        </p>
      )}
    </form>
  )
}
