import { formatMoney, parseAmountInCents } from '@/lib/money'

describe('parseAmountInCents', () => {
  it.each([
    ['a whole amount', '3000', 300000],
    ['one decimal', '3000.5', 300050],
    ['a decimal comma', '1234,56', 123456],
  ])('parses %s into cents', (_, typedAmount, expectedCents) => {
    expect(parseAmountInCents(typedAmount)).toBe(expectedCents)
  })

  it.each([
    ['an empty field', ''],
    ['a negative amount', '-1'],
    ['three decimals', '1.234'],
    ['text', 'abc'],
  ])('rejects %s', (_, typedAmount) => {
    expect(parseAmountInCents(typedAmount)).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formats cents in the given currency', () => {
    expect(formatMoney(150000, 'EUR')).toBe('€1,500.00')
  })
})
