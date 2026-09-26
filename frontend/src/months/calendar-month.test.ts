import {
  addMonths,
  compareNewestFirst,
  formatCalendarMonth,
  isFirstSupportedMonth,
  isLastSupportedMonth,
  parseMonthKey,
  toMonthKey,
} from '@/months/calendar-month'

describe('addMonths', () => {
  it.each([
    ['the next month', { year: 2026, month: 9 }, 1, { year: 2026, month: 10 }],
    ['the previous month', { year: 2026, month: 9 }, -1, { year: 2026, month: 8 }],
    ['into the next year', { year: 2026, month: 12 }, 1, { year: 2027, month: 1 }],
    ['into the previous year', { year: 2026, month: 1 }, -1, { year: 2025, month: 12 }],
  ])('steps %s', (_, startMonth, monthCount, expectedMonth) => {
    expect(addMonths(startMonth, monthCount)).toEqual(expectedMonth)
  })
})

describe('isFirstSupportedMonth', () => {
  it('is true for January of year 1', () => {
    expect(isFirstSupportedMonth({ year: 1, month: 1 })).toBe(true)
  })

  it('is false for any later month', () => {
    expect(isFirstSupportedMonth({ year: 1, month: 2 })).toBe(false)
  })
})

describe('isLastSupportedMonth', () => {
  it('is true for December 9999', () => {
    expect(isLastSupportedMonth({ year: 9999, month: 12 })).toBe(true)
  })

  it('is false for any earlier month', () => {
    expect(isLastSupportedMonth({ year: 9999, month: 11 })).toBe(false)
  })
})

describe('compareNewestFirst', () => {
  it('sorts months from the latest to the earliest', () => {
    const unsortedMonths = [
      { year: 2025, month: 12 },
      { year: 2026, month: 9 },
      { year: 2026, month: 1 },
    ]

    expect(unsortedMonths.sort(compareNewestFirst)).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
    ])
  })
})

describe('toMonthKey', () => {
  it('writes the month as YYYY-MM', () => {
    expect(toMonthKey({ year: 2026, month: 9 })).toBe('2026-09')
  })
})

describe('parseMonthKey', () => {
  it('reads a YYYY-MM key', () => {
    expect(parseMonthKey('2026-09')).toEqual({ year: 2026, month: 9 })
  })

  it.each([
    ['an empty key', ''],
    ['a month without a leading zero', '2026-9'],
    ['month 0', '2026-00'],
    ['month 13', '2026-13'],
    ['year 0', '0000-01'],
    ['text', 'september'],
  ])('rejects %s', (_, monthKey) => {
    expect(parseMonthKey(monthKey)).toBeNull()
  })
})

describe('formatCalendarMonth', () => {
  it('shows the month name and year', () => {
    expect(formatCalendarMonth({ year: 2026, month: 9 })).toBe('September 2026')
  })
})
