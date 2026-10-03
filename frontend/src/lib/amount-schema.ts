import { z } from 'zod'

/** The backend's largest amount, 9,999,999,999.99 (`max_digits=12`, `decimal_places=2`). */
export const MAX_AMOUNT_IN_CENTS = 999_999_999_999

/** The backend's `decimal_places` for amounts. */
export const AMOUNT_DECIMAL_PLACES = 2

export const TOO_MANY_DECIMALS_MESSAGE = 'Use at most 2 decimal places'
export const AMOUNT_TOO_LARGE_MESSAGE = 'Enter an amount up to 9,999,999,999.99'

/**
 * An amount of money as the user types it, with a decimal point or comma, parsed into cents.
 * `notAnAmountMessage` is the error for an empty field or for text that isn't a number of 0 or
 * more, such as "abc" or "-5".
 */
export function typedAmountSchema(notAnAmountMessage: string) {
  return z
    .string()
    .trim()
    .transform((typedAmount, context) => {
      const amountParts = /^(\d+)(?:[.,](\d*))?$/.exec(typedAmount)
      if (!amountParts) {
        context.addIssue({ code: 'custom', message: notAnAmountMessage })
        return z.NEVER
      }
      const [, typedWholeUnits = '', typedCentDigits = ''] = amountParts
      if (typedCentDigits.length > AMOUNT_DECIMAL_PLACES) {
        context.addIssue({ code: 'custom', message: TOO_MANY_DECIMALS_MESSAGE })
        return z.NEVER
      }
      const cents = Number(typedWholeUnits) * 100 + Number(typedCentDigits.padEnd(2, '0'))
      if (cents > MAX_AMOUNT_IN_CENTS) {
        context.addIssue({ code: 'custom', message: AMOUNT_TOO_LARGE_MESSAGE })
        return z.NEVER
      }
      return cents
    })
}
