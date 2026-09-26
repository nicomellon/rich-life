/** A calendar year and month, e.g. `{ year: 2026, month: 9 }` for September 2026. */
export interface CalendarMonth {
  year: number
  /** 1 for January to 12 for December, as in the API. */
  month: number
}

// The years the API accepts: the range Python dates support.
const FIRST_YEAR = 1
const LAST_YEAR = 9999

/** The month today falls in, in the user's time zone. */
export function currentCalendarMonth(): CalendarMonth {
  const today = new Date()
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}

/** The month `monthCount` months after `calendarMonth`, or before it when negative. */
export function addMonths(calendarMonth: CalendarMonth, monthCount: number): CalendarMonth {
  const monthIndex = calendarMonth.year * 12 + calendarMonth.month - 1 + monthCount
  return { year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 }
}

export function isFirstSupportedMonth({ year, month }: CalendarMonth): boolean {
  return year === FIRST_YEAR && month === 1
}

export function isLastSupportedMonth({ year, month }: CalendarMonth): boolean {
  return year === LAST_YEAR && month === 12
}

export function isSameMonth(firstMonth: CalendarMonth, secondMonth: CalendarMonth): boolean {
  return firstMonth.year === secondMonth.year && firstMonth.month === secondMonth.month
}

/** Sorts months from the latest to the earliest, e.g. with `months.sort(compareNewestFirst)`. */
export function compareNewestFirst(firstMonth: CalendarMonth, secondMonth: CalendarMonth): number {
  return secondMonth.year - firstMonth.year || secondMonth.month - firstMonth.month
}

/** The month as `YYYY-MM`, e.g. "2026-09", for URLs and form values. */
export function toMonthKey({ year, month }: CalendarMonth): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** Reads a `YYYY-MM` key, returning null when it isn't a month the API accepts. */
export function parseMonthKey(monthKey: string): CalendarMonth | null {
  const monthKeyMatch = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!monthKeyMatch) return null
  const [, yearDigits = '', monthDigits = ''] = monthKeyMatch
  const calendarMonth = { year: Number(yearDigits), month: Number(monthDigits) }
  const isValid =
    calendarMonth.year >= FIRST_YEAR && calendarMonth.month >= 1 && calendarMonth.month <= 12
  return isValid ? calendarMonth : null
}

const monthNameFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** The month for display, e.g. "September 2026". */
export function formatCalendarMonth({ year, month }: CalendarMonth): string {
  const firstDay = new Date(Date.UTC(2000, month - 1, 1))
  firstDay.setUTCFullYear(year)
  return monthNameFormat.format(firstDay)
}
