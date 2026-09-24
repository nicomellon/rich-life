// Amounts are handled in cents, so the arithmetic on them is exact.

/**
 * Parses what the user typed as an amount of money with at most 2 decimals, accepting a decimal
 * point or comma. Returns cents, or null when the text isn't such an amount.
 */
export function parseAmountInCents(typedAmount: string): number | null {
  const match = /^(\d{1,10})(?:[.,](\d{0,2}))?$/.exec(typedAmount.trim())
  if (!match) return null
  const [, typedWholeUnits = '', typedCentDigits = ''] = match
  return Number(typedWholeUnits) * 100 + Number(typedCentDigits.padEnd(2, '0'))
}

/** Cents in `currency` (an ISO 4217 code) for display, e.g. 150000 in EUR as "€1,500.00". */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
}
