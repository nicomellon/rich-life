// Amounts are handled in cents, so the arithmetic on them is exact.

/** The backend's largest amount, 9,999,999,999.99 (`max_digits=12`, `decimal_places=2`). */
export const MAX_AMOUNT_IN_CENTS = 999_999_999_999

/** The backend's `decimal_places` for amounts. */
export const AMOUNT_DECIMAL_PLACES = 2

/** An amount as the user typed it, split at its decimal point or comma, e.g. "12,5" as 12 and 5. */
export interface TypedAmountParts {
  wholeUnits: string
  /** The digits after the decimal point or comma, as typed: there may be more than 2. */
  centDigits: string
}

/**
 * Splits what the user typed as an amount at its decimal point or comma, ignoring surrounding
 * spaces. Returns null when the text isn't a number of 0 or more, such as "abc" or "-5".
 */
export function splitTypedAmount(typedAmount: string): TypedAmountParts | null {
  const amountParts = /^(\d+)(?:[.,](\d*))?$/.exec(typedAmount.trim())
  if (!amountParts) return null
  const [, wholeUnits = '', centDigits = ''] = amountParts
  return { wholeUnits, centDigits }
}

/** A typed amount with at most 2 cent digits in cents, e.g. 12 and 5 as 1250. */
export function typedAmountInCents({ wholeUnits, centDigits }: TypedAmountParts): number {
  return Number(wholeUnits) * 100 + Number(centDigits.padEnd(AMOUNT_DECIMAL_PLACES, '0'))
}

/**
 * Parses what the user typed as an amount of money with at most 2 decimals and up to the
 * backend's maximum, accepting a decimal point or comma. Returns cents, or null when the text
 * isn't such an amount.
 */
export function parseAmountInCents(typedAmount: string): number | null {
  const amountParts = splitTypedAmount(typedAmount)
  if (!amountParts || amountParts.centDigits.length > AMOUNT_DECIMAL_PLACES) return null
  const cents = typedAmountInCents(amountParts)
  return cents <= MAX_AMOUNT_IN_CENTS ? cents : null
}

/** Cents in `currency` (an ISO 4217 code) for display, e.g. 150000 in EUR as "€1,500.00". */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
}

/** Cents as the API's decimal string, e.g. 300050 as "3000.50". */
export function toApiAmount(cents: number): string {
  const centDigits = String(cents % 100).padStart(2, '0')
  return `${Math.floor(cents / 100)}.${centDigits}`
}

/** An amount as the API writes it for display, e.g. "1500.00" in EUR as "€1,500.00". */
export function formatApiAmount(apiAmount: string, currency: string): string {
  return formatMoney(Math.round(Number(apiAmount) * 100), currency)
}

/** A rounded, short amount in `currency` for a chart axis, e.g. 1500 in EUR as "€1.5K". */
export function formatCompactMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
  }).format(amount)
}
