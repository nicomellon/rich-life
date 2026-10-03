import { z } from 'zod'
import { FULL_PLAN_BASIS_POINTS, parsePercentage } from '@/spending-plan/percentages'

export const PERCENTAGE_INVALID_MESSAGE = 'Enter a number from 0 to 100, with at most 2 decimals.'
export const PERCENTAGES_TOTAL_MESSAGE = 'The percentages must add up to 100%.'

/** A bucket's percentage as typed, e.g. "12.5", parsed into basis points. */
const typedPercentageSchema = z.string().transform((typedPercentage, context) => {
  const basisPoints = parsePercentage(typedPercentage)
  if (basisPoints === null) {
    context.addIssue({ code: 'custom', message: PERCENTAGE_INVALID_MESSAGE })
    return z.NEVER
  }
  return basisPoints
})

/**
 * Each bucket's percentage as typed into the percentages form, named like the API's fields. They
 * parse into basis points, and must add up to exactly 100%.
 */
export const bucketPercentagesSchema = z
  .object({
    fixed_costs_pct: typedPercentageSchema,
    investments_pct: typedPercentageSchema,
    savings_pct: typedPercentageSchema,
    guilt_free_pct: typedPercentageSchema,
  })
  .refine(
    (basisPointsByField) =>
      Object.values(basisPointsByField).reduce((total, basisPoints) => total + basisPoints, 0) ===
      FULL_PLAN_BASIS_POINTS,
    // One error for the whole form, as react-hook-form's `errors.root.total`, not one per field.
    { message: PERCENTAGES_TOTAL_MESSAGE, path: ['root', 'total'] },
  )

/** The percentages as typed, e.g. "12.5" for a saved "12.50". */
export type TypedBucketPercentages = z.input<typeof bucketPercentagesSchema>

/** The percentages once valid, in basis points. */
export type ValidBucketPercentages = z.output<typeof bucketPercentagesSchema>

/** The percentages form's fields, named like the API's. */
export const BUCKET_PERCENTAGES_FORM_FIELDS = bucketPercentagesSchema.keyof().options

/**
 * The error about the total of `typedPercentages`, if any. There's none while a percentage is
 * invalid, as the total is only checked once each one is valid.
 */
export function percentagesTotalError(
  typedPercentages: TypedBucketPercentages,
): string | undefined {
  const parsedPercentages = bucketPercentagesSchema.safeParse(typedPercentages)
  return parsedPercentages.error?.issues.find((issue) => issue.path.join('.') === 'root.total')
    ?.message
}
