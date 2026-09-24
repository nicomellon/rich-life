import {
  formatPercentage,
  parsePercentage,
  shareInCents,
  toApiPercentage,
} from '@/spending-plan/percentages'

describe('parsePercentage', () => {
  it.each([
    ['a whole number', '50', 5000],
    ['one decimal', '12.5', 1250],
    ['two decimals', '12.25', 1225],
    ['a decimal comma', '12,5', 1250],
    ['a trailing decimal point', '12.', 1200],
    ['zero', '0', 0],
    ['one hundred', '100', 10000],
    ['surrounding spaces', ' 20 ', 2000],
  ])('parses %s into basis points', (_, typedPercentage, expectedBasisPoints) => {
    expect(parsePercentage(typedPercentage)).toBe(expectedBasisPoints)
  })

  it.each([
    ['an empty field', ''],
    ['text', 'abc'],
    ['a negative number', '-5'],
    ['more than 100', '100.01'],
    ['three decimals', '12.345'],
    ['exponent notation', '1e2'],
  ])('rejects %s', (_, typedPercentage) => {
    expect(parsePercentage(typedPercentage)).toBeNull()
  })
})

describe('toApiPercentage', () => {
  it.each([
    [1250, '12.50'],
    [5000, '50.00'],
    [5, '0.05'],
    [0, '0.00'],
  ])('writes %i basis points as "%s"', (basisPoints, expectedApiPercentage) => {
    expect(toApiPercentage(basisPoints)).toBe(expectedApiPercentage)
  })
})

describe('formatPercentage', () => {
  it('shows basis points as a percentage', () => {
    expect(formatPercentage(1250)).toBe('12.5%')
  })
})

describe('shareInCents', () => {
  it('takes the percentage of the amount', () => {
    expect(shareInCents(300000, 5000)).toBe(150000)
  })

  it('rounds to the nearest cent', () => {
    expect(shareInCents(1001, 3333)).toBe(334)
  })
})
