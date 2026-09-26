import { toPlanVsActualRows, type PlanVsActualRow } from '@/summary/plan-vs-actual-rows'
import { summaryOfStartedMonth } from '@/test/api-mock'

describe('toPlanVsActualRows', () => {
  it("turns each bucket's target and actual amounts into numbers", () => {
    const monthSummary = summaryOfStartedMonth({ fixed_costs: '1600.50' })

    const fixedCostsRow = toPlanVsActualRows(monthSummary)[0]

    expect(fixedCostsRow).toEqual<PlanVsActualRow>({
      bucketLabel: 'Fixed Costs',
      targetAmount: 1500,
      actualAmount: 1600.5,
      status: 'over',
    })
  })

  it('keeps the buckets in the order of the summary', () => {
    const monthSummary = summaryOfStartedMonth({})

    const bucketLabels = toPlanVsActualRows(monthSummary).map(
      (planVsActualRow) => planVsActualRow.bucketLabel,
    )

    expect(bucketLabels).toEqual(['Fixed Costs', 'Investments', 'Savings', 'Guilt-Free Spending'])
  })
})
