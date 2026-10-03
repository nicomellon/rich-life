import { incomeSchema } from '@/months/income-schema'

/** The error messages for the typed income, or none when it's valid. */
function incomeErrors(typedIncome: string): string[] {
  return (
    incomeSchema.safeParse({ income: typedIncome }).error?.issues.map((issue) => issue.message) ??
    []
  )
}

describe('incomeSchema', () => {
  it('parses an income into cents', () => {
    expect(incomeSchema.parse({ income: '3000.5' })).toEqual({ income: 300050 })
  })

  it('accepts an income of 0', () => {
    expect(incomeErrors('0')).toEqual([])
  })

  it.each([
    ['a negative income', '-100'],
    ['an empty income', ''],
  ])('rejects %s', (_, typedIncome) => {
    expect(incomeErrors(typedIncome)).toEqual([
      'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.',
    ])
  })

  it('rejects an income with 3 decimal places', () => {
    expect(incomeErrors('3000.505')).toEqual(['Use at most 2 decimal places'])
  })

  it('rejects an income above 9,999,999,999.99', () => {
    expect(incomeErrors('10000000000')).toEqual(['Enter an amount up to 9,999,999,999.99'])
  })
})
