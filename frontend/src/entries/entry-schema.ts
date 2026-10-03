import { z } from 'zod'
import { isDateInMonth } from '@/entries/entry-date'
import { typedAmountSchema } from '@/lib/amount-schema'
import { formatCalendarMonth, type CalendarMonth } from '@/months/calendar-month'
import { BUCKETS } from '@/spending-plan/buckets'

/** The backend's longest description (`DESCRIPTION_MAX_LENGTH`). */
export const DESCRIPTION_MAX_LENGTH = 255

/** A calendar day as date inputs and the API write it, YYYY-MM-DD. */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const AMOUNT_NOT_ABOVE_ZERO_MESSAGE = 'Enter an amount greater than 0'
export const DESCRIPTION_TOO_LONG_MESSAGE = 'Keep the description to 255 characters or fewer'

/** The error for a date that isn't a day of `calendarMonth`, e.g. "Pick a day in September 2026." */
export function dateOutsideMonthMessage(calendarMonth: CalendarMonth): string {
  return `Pick a day in ${formatCalendarMonth(calendarMonth)}.`
}

/**
 * An entry as typed into the entry form, dated in `calendarMonth`. It parses into the amount in
 * cents, the bucket, the date as YYYY-MM-DD and the trimmed description.
 */
export function entrySchema(calendarMonth: CalendarMonth) {
  return z.object({
    amount: typedAmountSchema(AMOUNT_NOT_ABOVE_ZERO_MESSAGE).refine(
      (amountInCents) => amountInCents > 0,
      AMOUNT_NOT_ABOVE_ZERO_MESSAGE,
    ),
    bucket: z.enum(BUCKETS),
    date: z
      .string()
      .refine(
        (typedDate) => ISO_DATE_PATTERN.test(typedDate) && isDateInMonth(typedDate, calendarMonth),
        dateOutsideMonthMessage(calendarMonth),
      ),
    description: z
      .string()
      .trim()
      // Counted in characters (code points), like the backend, so an emoji counts once.
      .refine(
        (description) => [...description].length <= DESCRIPTION_MAX_LENGTH,
        DESCRIPTION_TOO_LONG_MESSAGE,
      ),
  })
}

/** An entry as typed into the form, e.g. "12.5" for an amount of "12.50". */
export type TypedEntry = z.input<ReturnType<typeof entrySchema>>

/** An entry from the form once it's valid, with its amount in cents. */
export type ValidEntry = z.output<ReturnType<typeof entrySchema>>
