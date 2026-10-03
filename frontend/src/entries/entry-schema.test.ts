import { entrySchema, type TypedEntry } from '@/entries/entry-schema'

const september2026 = { year: 2026, month: 9 }
const typedLunch: TypedEntry = {
  amount: '12.5',
  bucket: 'guilt_free',
  date: '2026-09-15',
  description: ' Lunch ',
}

/** The error messages for `field` when the entry is `typedLunch` with `changes`. */
function entryErrors(changes: Partial<TypedEntry>, field: keyof TypedEntry): string[] {
  const parsedEntry = entrySchema(september2026).safeParse({ ...typedLunch, ...changes })
  return (
    parsedEntry.error?.issues
      .filter((issue) => issue.path[0] === field)
      .map((issue) => issue.message) ?? []
  )
}

describe('entrySchema', () => {
  it('parses the typed amount into cents', () => {
    expect(entrySchema(september2026).parse(typedLunch).amount).toBe(1250)
  })

  it('trims the description', () => {
    expect(entrySchema(september2026).parse(typedLunch).description).toBe('Lunch')
  })

  it.each([
    ['an amount of 0', '0'],
    ['an empty amount', ''],
    ['a negative amount', '-5'],
  ])('rejects %s', (_, typedAmount) => {
    expect(entryErrors({ amount: typedAmount }, 'amount')).toEqual([
      'Enter an amount greater than 0',
    ])
  })

  it('rejects an amount with 3 decimal places', () => {
    expect(entryErrors({ amount: '12.345' }, 'amount')).toEqual(['Use at most 2 decimal places'])
  })

  it('rejects an amount of 10,000,000,000', () => {
    expect(entryErrors({ amount: '10000000000' }, 'amount')).toEqual([
      'Enter an amount up to 9,999,999,999.99',
    ])
  })

  it('accepts an empty description', () => {
    expect(entryErrors({ description: '' }, 'description')).toEqual([])
  })

  it('accepts a description of 255 characters', () => {
    expect(entryErrors({ description: 'a'.repeat(255) }, 'description')).toEqual([])
  })

  it('accepts a description of 255 emoji', () => {
    expect(entryErrors({ description: '💸'.repeat(255) }, 'description')).toEqual([])
  })

  it('rejects a description of 256 emoji', () => {
    expect(entryErrors({ description: '💸'.repeat(256) }, 'description')).toEqual([
      'Keep the description to 255 characters or fewer',
    ])
  })

  it('rejects a description of 256 characters', () => {
    expect(entryErrors({ description: 'a'.repeat(256) }, 'description')).toEqual([
      'Keep the description to 255 characters or fewer',
    ])
  })

  it.each([
    ['the first day of the month', '2026-09-01'],
    ['the last day of the month', '2026-09-30'],
  ])('accepts %s', (_, typedDate) => {
    expect(entryErrors({ date: typedDate }, 'date')).toEqual([])
  })

  it.each([
    ['a day of the next month', '2026-10-01'],
    ['a day of the previous month', '2026-08-31'],
    ['an empty date', ''],
    ['a date that is not YYYY-MM-DD', '2026-09-1'],
  ])('rejects %s', (_, typedDate) => {
    expect(entryErrors({ date: typedDate }, 'date')).toEqual(['Pick a day in September 2026.'])
  })
})
