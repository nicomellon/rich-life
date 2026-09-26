import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  addMonths,
  compareNewestFirst,
  formatCalendarMonth,
  isFirstSupportedMonth,
  isLastSupportedMonth,
  isSameMonth,
  parseMonthKey,
  toMonthKey,
  type CalendarMonth,
} from '@/months/calendar-month'

interface MonthPickerProps {
  selectedMonth: CalendarMonth
  /** The months the user has started, newest first. */
  startedMonths: CalendarMonth[]
  onSelect: (selectedMonth: CalendarMonth) => void
}

/**
 * Arrows to step to the previous or next calendar month, started or not, and a dropdown to jump
 * to any started month.
 */
export function MonthPicker({ selectedMonth, startedMonths, onSelect }: MonthPickerProps) {
  const selectedMonthKey = toMonthKey(selectedMonth)
  // The dropdown always lists the selected month, even before it's started.
  const listedMonths = [
    selectedMonth,
    ...startedMonths.filter((startedMonth) => !isSameMonth(startedMonth, selectedMonth)),
  ].sort(compareNewestFirst)

  function selectMonthKey(monthKey: string) {
    const calendarMonth = parseMonthKey(monthKey)
    if (calendarMonth) onSelect(calendarMonth)
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous month"
        disabled={isFirstSupportedMonth(selectedMonth)}
        onClick={() => onSelect(addMonths(selectedMonth, -1))}
      >
        <ChevronLeft />
      </Button>
      <select
        aria-label="Month"
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        value={selectedMonthKey}
        onChange={(event) => selectMonthKey(event.target.value)}
      >
        {listedMonths.map((listedMonth) => (
          <option key={toMonthKey(listedMonth)} value={toMonthKey(listedMonth)}>
            {formatCalendarMonth(listedMonth)}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next month"
        disabled={isLastSupportedMonth(selectedMonth)}
        onClick={() => onSelect(addMonths(selectedMonth, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
