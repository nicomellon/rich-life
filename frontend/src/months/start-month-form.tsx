import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { parseAmountInCents, toApiAmount } from '@/lib/money'
import { formatCalendarMonth, type CalendarMonth } from '@/months/calendar-month'
import { IncomeField } from '@/months/income-field'
import { createMonth, monthsQueryKey, storeSavedMonth } from '@/months/months-api'

interface StartMonthFormProps {
  /** The month to start, which the user hasn't started yet. */
  calendarMonth: CalendarMonth
}

/** The empty state of a month the user hasn't started: a form that starts it with an income. */
export function StartMonthForm({ calendarMonth }: StartMonthFormProps) {
  const queryClient = useQueryClient()
  const [typedIncome, setTypedIncome] = useState('')
  const incomeInCents = parseAmountInCents(typedIncome)
  const startMutation = useMutation({
    mutationFn: createMonth,
    onSuccess: (createdMonth) => storeSavedMonth(queryClient, createdMonth),
    onError: (startError) => {
      // Started meanwhile, e.g. in another tab: loading the months shows it.
      if (isAlreadyStartedError(startError)) {
        void queryClient.invalidateQueries({ queryKey: monthsQueryKey })
      }
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (incomeInCents === null) return
    startMutation.mutate({ ...calendarMonth, income: toApiAmount(incomeInCents) })
  }

  return (
    <div className="max-w-md space-y-4 rounded-md border p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          You haven't started {formatCalendarMonth(calendarMonth)} yet
        </h2>
        <p className="text-sm text-muted-foreground">
          Enter this month's income. Its targets are copied from your spending plan.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <IncomeField
          id="new-month-income"
          label="Income"
          typedIncome={typedIncome}
          onChange={setTypedIncome}
        />
        <Button type="submit" disabled={incomeInCents === null || startMutation.isPending}>
          {startMutation.isPending ? 'Starting…' : 'Start this month'}
        </Button>
      </form>
      {startMutation.isError && !isAlreadyStartedError(startMutation.error) && (
        <p role="alert" className="text-sm text-destructive">
          We couldn't start this month. Please try again.
        </p>
      )}
    </div>
  )
}

function isAlreadyStartedError(startError: Error): boolean {
  return startError instanceof ApiError && startError.status === 409
}
