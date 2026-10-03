import { typedAmountSchema } from '@/lib/amount-schema'

const NOT_AN_AMOUNT_MESSAGE = 'Enter an amount'
const amountSchema = typedAmountSchema(NOT_AN_AMOUNT_MESSAGE)

/** The error messages the schema gives for `typedAmount`, or none when it's valid. */
function amountErrors(typedAmount: string): string[] {
  return amountSchema.safeParse(typedAmount).error?.issues.map((issue) => issue.message) ?? []
}

describe('typedAmountSchema', () => {
  it.each([
    ['a whole amount', '3000', 300000],
    ['one decimal', '3000.5', 300050],
    ['a decimal comma', '1234,56', 123456],
    ['a trailing decimal point', '12.', 1200],
    ['surrounding spaces', ' 12 ', 1200],
    ['zero', '0', 0],
    ['the maximum', '9999999999.99', 999999999999],
  ])('parses %s into cents', (_, typedAmount, expectedCents) => {
    expect(amountSchema.parse(typedAmount)).toBe(expectedCents)
  })

  it.each([
    ['an empty field', ''],
    ['a negative amount', '-1'],
    ['text', 'abc'],
    ['exponent notation', '1e3'],
  ])('rejects %s with the given message', (_, typedAmount) => {
    expect(amountErrors(typedAmount)).toEqual([NOT_AN_AMOUNT_MESSAGE])
  })

  it('rejects more than 2 decimal places', () => {
    expect(amountErrors('1.234')).toEqual(['Use at most 2 decimal places'])
  })

  it('rejects an amount above 9,999,999,999.99', () => {
    expect(amountErrors('10000000000')).toEqual(['Enter an amount up to 9,999,999,999.99'])
  })
})
