import {
  bucketPercentagesSchema,
  percentagesTotalError,
  type TypedBucketPercentages,
} from '@/spending-plan/percentages-schema'

const typedDefaultPlan: TypedBucketPercentages = {
  fixed_costs_pct: '50',
  investments_pct: '10',
  savings_pct: '20',
  guilt_free_pct: '20',
}

/** One error of a plan: where it is, e.g. "savings_pct" or "root.total", and its message. */
interface PlanError {
  path: string
  message: string
}

/** Each error of the plan `typedDefaultPlan` with `changes`. */
function planErrors(changes: Partial<TypedBucketPercentages>): PlanError[] {
  const parsedPlan = bucketPercentagesSchema.safeParse({ ...typedDefaultPlan, ...changes })
  return (
    parsedPlan.error?.issues.map((issue): PlanError => ({
      path: issue.path.join('.'),
      message: issue.message,
    })) ?? []
  )
}

describe('bucketPercentagesSchema', () => {
  it('parses the percentages into basis points', () => {
    expect(
      bucketPercentagesSchema.parse({
        ...typedDefaultPlan,
        fixed_costs_pct: '49.5',
        savings_pct: '20.5',
      }),
    ).toEqual({
      fixed_costs_pct: 4950,
      investments_pct: 1000,
      savings_pct: 2050,
      guilt_free_pct: 2000,
    })
  })

  it.each([
    ['above 100', '100.01'],
    ['negative', '-5'],
    ['empty', ''],
    ['with 3 decimal places', '12.345'],
  ])('rejects a percentage that is %s', (_, typedPercentage) => {
    expect(planErrors({ savings_pct: typedPercentage })).toEqual([
      { path: 'savings_pct', message: 'Enter a number from 0 to 100, with at most 2 decimals.' },
    ])
  })

  it.each([
    ['99.99%', '19.99'],
    ['100.01%', '20.01'],
  ])('rejects percentages that add up to %s with one error for the form', (_, typedSavings) => {
    expect(planErrors({ savings_pct: typedSavings })).toEqual([
      { path: 'root.total', message: 'The percentages must add up to 100%.' },
    ])
  })
})

describe('percentagesTotalError', () => {
  it('is the total error when the percentages add up to 99.99%', () => {
    expect(percentagesTotalError({ ...typedDefaultPlan, savings_pct: '19.99' })).toBe(
      'The percentages must add up to 100%.',
    )
  })

  it('is undefined when the percentages add up to 100%', () => {
    expect(percentagesTotalError(typedDefaultPlan)).toBeUndefined()
  })

  it('is undefined while a percentage is invalid', () => {
    expect(percentagesTotalError({ ...typedDefaultPlan, savings_pct: 'abc' })).toBeUndefined()
  })
})
