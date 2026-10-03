import { z } from 'zod'
import {
  AMOUNT_DECIMAL_PLACES,
  MAX_AMOUNT_IN_CENTS,
  splitTypedAmount,
  typedAmountInCents,
} from '@/lib/money'

export const TOO_MANY_DECIMALS_MESSAGE = 'Use at most 2 decimal places'
export const AMOUNT_TOO_LARGE_MESSAGE = 'Enter an amount up to 9,999,999,999.99'

/**
 * An amount of money as the user types it, with a decimal point or comma, parsed into cents.
 * `notAnAmountMessage` is the error for an empty field or for text that isn't a number of 0 or
 * more, such as "abc" or "-5".
 */
export function typedAmountSchema(notAnAmountMessage: string) {
  return z.string().transform((typedAmount, context) => {
    const amountParts = splitTypedAmount(typedAmount)
    if (!amountParts) {
      context.addIssue({ code: 'custom', message: notAnAmountMessage })
      return z.NEVER
    }
    if (amountParts.centDigits.length > AMOUNT_DECIMAL_PLACES) {
      context.addIssue({ code: 'custom', message: TOO_MANY_DECIMALS_MESSAGE })
      return z.NEVER
    }
    const cents = typedAmountInCents(amountParts)
    if (cents > MAX_AMOUNT_IN_CENTS) {
      context.addIssue({ code: 'custom', message: AMOUNT_TOO_LARGE_MESSAGE })
      return z.NEVER
    }
    return cents
  })
}
