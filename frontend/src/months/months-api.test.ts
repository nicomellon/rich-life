import { withSavedMonth } from '@/months/months-api'
import { startedSeptember2026 } from '@/test/api-mock'

const startedAugust2026 = { ...startedSeptember2026, month: 8 }
const startedOctober2026 = { ...startedSeptember2026, month: 10 }

describe('withSavedMonth', () => {
  it('adds a new month in newest-first order', () => {
    expect(withSavedMonth([startedOctober2026, startedAugust2026], startedSeptember2026)).toEqual([
      startedOctober2026,
      startedSeptember2026,
      startedAugust2026,
    ])
  })

  it('replaces the stored copy of an updated month', () => {
    const updatedSeptember2026 = { ...startedSeptember2026, income: '3500.00' }

    expect(withSavedMonth([startedSeptember2026], updatedSeptember2026)).toEqual([
      updatedSeptember2026,
    ])
  })
})
