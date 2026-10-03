import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { showSaveError } from '@/lib/form-errors'
import { toApiAmount } from '@/lib/money'
import { showSavedToast } from '@/lib/save-toasts'
import { formatCalendarMonth, type CalendarMonth } from '@/months/calendar-month'
import { IncomeField } from '@/months/income-field'
import {
  INCOME_FORM_FIELDS,
  incomeSchema,
  type TypedIncome,
  type ValidIncome,
} from '@/months/income-schema'
import { createMonth, monthsQueryKey, storeSavedMonth } from '@/months/months-api'

interface StartMonthFormProps {
  /** The month to start, which the user hasn't started yet. */
  calendarMonth: CalendarMonth
}

/** The empty state of a month the user hasn't started: a form that starts it with an income. */
export function StartMonthForm({ calendarMonth }: StartMonthFormProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TypedIncome, unknown, ValidIncome>({
    resolver: zodResolver(incomeSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { income: '' },
  })
  const startMutation = useMutation({
    mutationFn: createMonth,
    onSuccess: (createdMonth) => {
      showSavedToast('Month started')
      return storeSavedMonth(queryClient, createdMonth)
    },
  })

  async function startMonth({ income }: ValidIncome) {
    try {
      await startMutation.mutateAsync({ ...calendarMonth, income: toApiAmount(income) })
    } catch (startError) {
      // Started meanwhile, e.g. in another tab: loading the months shows it.
      if (isAlreadyStartedError(startError)) {
        void queryClient.invalidateQueries({ queryKey: monthsQueryKey })
      } else {
        showSaveError(startError, INCOME_FORM_FIELDS, setError)
      }
    }
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
      <form
        className="space-y-4"
        onSubmit={(submitEvent) => void handleSubmit(startMonth)(submitEvent)}
        noValidate
      >
        <IncomeField
          id="new-month-income"
          label="Income"
          incomeRegistration={register('income')}
          errorMessage={errors.income?.message}
        />
        <Button type="submit" disabled={startMutation.isPending}>
          {startMutation.isPending ? 'Starting…' : 'Start this month'}
        </Button>
      </form>
    </div>
  )
}

function isAlreadyStartedError(startError: unknown): boolean {
  return startError instanceof ApiError && startError.code === 'month_already_exists'
}
