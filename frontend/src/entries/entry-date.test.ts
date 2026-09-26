import {
  defaultEntryDate,
  firstDayOfMonth,
  formatEntryDate,
  isDateInMonth,
  lastDayOfMonth,
} from '@/entries/entry-date'

const september2026 = { year: 2026, month: 9 }

describe('firstDayOfMonth', () => {
  it('writes the first day as YYYY-MM-DD', () => {
    expect(firstDayOfMonth(september2026)).toBe('2026-09-01')
  })
})

describe('lastDayOfMonth', () => {
  it.each([
    ['a 30-day month', { year: 2026, month: 9 }, '2026-09-30'],
    ['a 31-day month', { year: 2026, month: 12 }, '2026-12-31'],
    ['February', { year: 2026, month: 2 }, '2026-02-28'],
    ['February in a leap year', { year: 2028, month: 2 }, '2028-02-29'],
    ['February in a century year', { year: 1900, month: 2 }, '1900-02-28'],
    ['February in a year divisible by 400', { year: 2000, month: 2 }, '2000-02-29'],
  ])('finds the last day of %s', (_, calendarMonth, expectedLastDay) => {
    expect(lastDayOfMonth(calendarMonth)).toBe(expectedLastDay)
  })
})

describe('isDateInMonth', () => {
  it.each([
    ['the first day', '2026-09-01'],
    ['the last day', '2026-09-30'],
  ])('accepts %s of the month', (_, isoDate) => {
    expect(isDateInMonth(isoDate, september2026)).toBe(true)
  })

  it.each([
    ['the day before the month', '2026-08-31'],
    ['the day after the month', '2026-10-01'],
    ['an empty date', ''],
  ])('rejects %s', (_, isoDate) => {
    expect(isDateInMonth(isoDate, september2026)).toBe(false)
  })
})

describe('defaultEntryDate', () => {
  it.each([
    ['today when it falls in the month', new Date(2026, 8, 15), '2026-09-15'],
    ['the first day for a month after today', new Date(2026, 7, 20), '2026-09-01'],
    ['the last day for a month before today', new Date(2026, 9, 3), '2026-09-30'],
  ])('is %s', (_, today, expectedDate) => {
    expect(defaultEntryDate(september2026, today)).toBe(expectedDate)
  })
})

describe('formatEntryDate', () => {
  it('shows the month and day', () => {
    expect(formatEntryDate('2026-09-05')).toBe('Sep 5')
  })
})
