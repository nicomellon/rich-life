import { formatApiAmount, formatMoney, parseAmountInCents, toApiAmount } from '@/lib/money'

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

describe('toApiAmount', () => {
  it.each([
    [300050, '3000.50'],
    [300000, '3000.00'],
    [5, '0.05'],
    [0, '0.00'],
  ])('writes %i cents as "%s"', (cents, expectedApiAmount) => {
    expect(toApiAmount(cents)).toBe(expectedApiAmount)
  })
})

describe('formatApiAmount', () => {
  it.each([
    ['an amount', '1500.50', '€1,500.50'],
    ['a negative amount', '-50.00', '-€50.00'],
  ])('formats %s from the API in the given currency', (_, apiAmount, expectedDisplay) => {
    expect(formatApiAmount(apiAmount, 'EUR')).toBe(expectedDisplay)
  })
})
