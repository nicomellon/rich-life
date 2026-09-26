import type { CalendarMonth } from '@/months/calendar-month'

// Entry dates are calendar days written as YYYY-MM-DD, as in the API and in date inputs.

function toIsoDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

export function firstDayOfMonth({ year, month }: CalendarMonth): string {
  return toIsoDate(year, month, 1)
}

const THIRTY_DAY_MONTHS = [4, 6, 9, 11]

export function lastDayOfMonth({ year, month }: CalendarMonth): string {
  const februaryDayCount = isLeapYear(year) ? 29 : 28
  const dayCount = month === 2 ? februaryDayCount : THIRTY_DAY_MONTHS.includes(month) ? 30 : 31
  return toIsoDate(year, month, dayCount)
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Whether `isoDate` is a day of `calendarMonth`. */
export function isDateInMonth(isoDate: string, calendarMonth: CalendarMonth): boolean {
  return isoDate >= firstDayOfMonth(calendarMonth) && isoDate <= lastDayOfMonth(calendarMonth)
}

/**
 * The date a new entry starts with: today, in the user's time zone, when it falls in
 * `calendarMonth`, or else the day of the month closest to today.
 */
export function defaultEntryDate(calendarMonth: CalendarMonth, today = new Date()): string {
  const todayIsoDate = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const firstDay = firstDayOfMonth(calendarMonth)
  const lastDay = lastDayOfMonth(calendarMonth)
  if (todayIsoDate < firstDay) return firstDay
  if (todayIsoDate > lastDay) return lastDay
  return todayIsoDate
}

const entryDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** The date for display, e.g. "Sep 15". */
export function formatEntryDate(isoDate: string): string {
  return entryDateFormat.format(new Date(`${isoDate}T00:00:00Z`))
}
