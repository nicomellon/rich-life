// Percentages are handled in hundredths of a percent (basis points), e.g. 1250 for 12.5%, so
// adding them up is exact integer arithmetic.

export const FULL_PLAN_BASIS_POINTS = 10_000

/**
 * Parses what the user typed as a percentage from 0 to 100 with at most 2 decimals, accepting a
 * decimal point or comma. Returns basis points, or null when the text isn't such a percentage.
 */
export function parsePercentage(typedPercentage: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{0,2}))?$/.exec(typedPercentage.trim())
  if (!match) return null
  const [, wholePercent = '', hundredths = ''] = match
  const basisPoints = Number(wholePercent) * 100 + Number(hundredths.padEnd(2, '0'))
  return basisPoints <= FULL_PLAN_BASIS_POINTS ? basisPoints : null
}

/** Basis points as the API's decimal string, e.g. 1250 as "12.50". */
export function toApiPercentage(basisPoints: number): string {
  const hundredths = String(basisPoints % 100).padStart(2, '0')
  return `${Math.floor(basisPoints / 100)}.${hundredths}`
}

const percentageFormat = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 2,
})

/** Basis points for display, e.g. 1250 as "12.5%". */
export function formatPercentage(basisPoints: number): string {
  return percentageFormat.format(basisPoints / FULL_PLAN_BASIS_POINTS)
}

/** The part of `cents` that `basisPoints` stands for, rounded to the nearest cent. */
export function shareInCents(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / FULL_PLAN_BASIS_POINTS)
}
