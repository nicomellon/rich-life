import { z } from 'zod'
import { typedAmountSchema } from '@/lib/amount-schema'

export const INCOME_NOT_AN_AMOUNT_MESSAGE =
  'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.'

/** A month's income as typed into the income form. It parses into the income in cents. */
export const incomeSchema = z.object({
  // 0 or more, as the backend's `Income`: a month can have no income.
  income: typedAmountSchema(INCOME_NOT_AN_AMOUNT_MESSAGE),
})

/** The income form's values, e.g. "3000" for an income of "3000.00". */
export type TypedIncome = z.input<typeof incomeSchema>

/** The income form's values once valid, with the income in cents. */
export type ValidIncome = z.output<typeof incomeSchema>

/** The income form's fields, named like the API's. */
export const INCOME_FORM_FIELDS = incomeSchema.keyof().options
