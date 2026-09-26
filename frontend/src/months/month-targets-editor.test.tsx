import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Month } from '@/months/months-api'
import type { BucketSummary, MonthSummary } from '@/summary/summary-api'
import {
  type ApiResponder,
  inSequence,
  jsonResponse,
  mockApi,
  sentJsonBody,
  signedInUser,
  signInBeforeRender,
  startedSeptember2026,
  summaryOfStartedMonth,
  wasSent,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

const adjustedSeptember2026: Month = {
  ...startedSeptember2026,
  fixed_costs_pct: '45.00',
  investments_pct: '15.00',
}

const summaryOfSeptember2026 = summaryOfStartedMonth({})

/** The summary once Fixed Costs moved 5% of the income to Investments. */
const summaryOfAdjustedMonth: MonthSummary = {
  ...summaryOfSeptember2026,
  buckets: summaryOfSeptember2026.buckets.map((bucketSummary): BucketSummary => {
    if (bucketSummary.bucket === 'fixed_costs') {
      return {
        ...bucketSummary,
        target_pct: '45.00',
        target_amount: '1350.00',
        remaining: '1350.00',
      }
    }
    if (bucketSummary.bucket === 'investments') {
      return { ...bucketSummary, target_pct: '15.00', target_amount: '450.00', remaining: '450.00' }
    }
    return bucketSummary
  }),
}

function mockMonthTargetsApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([startedSeptember2026]),
    'GET /months/2026/9/entries': () => jsonResponse([]),
    'GET /months/2026/9/summary': inSequence(
      () => jsonResponse(summaryOfSeptember2026),
      () => jsonResponse(summaryOfAdjustedMonth),
    ),
    'PUT /months/2026/9/targets': () => jsonResponse(adjustedSeptember2026),
    ...extraResponders,
  })
}

function monthPlanForm(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: "This month's plan" })
}

async function openMonthPlanForm() {
  await userEvent.click(await screen.findByRole('button', { name: "Adjust this month's plan" }))
}

async function typePercentage(bucketLabel: string, typedPercentage: string) {
  const percentageInput = within(await monthPlanForm()).getByLabelText(bucketLabel)
  await userEvent.clear(percentageInput)
  if (typedPercentage) await userEvent.type(percentageInput, typedPercentage)
}

async function moveFivePercentFromFixedCostsToInvestments() {
  await typePercentage('Fixed Costs', '45')
  await typePercentage('Investments', '15')
}

async function saveMonthPlan() {
  await userEvent.click(screen.getByRole('button', { name: "Save this month's plan" }))
}

describe('MonthTargetsEditor', () => {
  beforeEach(() => {
    signInBeforeRender()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts with the month's own percentages", async () => {
    mockMonthTargetsApi({ 'GET /months': () => jsonResponse([adjustedSeptember2026]) })
    renderApp('/')

    await openMonthPlanForm()

    const percentageInputs = within(await monthPlanForm()).getAllByRole('textbox')
    expect(
      percentageInputs.map((percentageInput) => (percentageInput as HTMLInputElement).value),
    ).toEqual(['45', '15', '20', '20'])
  })

  it("previews each bucket's share of the month's income", async () => {
    mockMonthTargetsApi()
    renderApp('/')

    await openMonthPlanForm()

    expect(within(await monthPlanForm()).getByText('€1,500.00')).toBeInTheDocument()
  })

  it("can't be saved when the total isn't 100%", async () => {
    mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()

    await typePercentage('Savings', '30')

    expect(screen.getByRole('button', { name: "Save this month's plan" })).toBeDisabled()
  })

  it("sends the new percentages to the month's targets", async () => {
    const fetchMock = mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await saveMonthPlan()

    await screen.findByRole('button', { name: "Adjust this month's plan" })
    expect(sentJsonBody(fetchMock, 'PUT /months/2026/9/targets')).toEqual({
      fixed_costs_pct: '45.00',
      investments_pct: '15.00',
      savings_pct: '20.00',
      guilt_free_pct: '20.00',
    })
  })

  it('leaves the spending plan unchanged', async () => {
    const fetchMock = mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await saveMonthPlan()

    await screen.findByRole('button', { name: "Adjust this month's plan" })
    expect(wasSent(fetchMock, 'PUT /spending-plan')).toBe(false)
  })

  it('closes the form once the plan is saved', async () => {
    mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await saveMonthPlan()

    expect(
      await screen.findByRole('button', { name: "Adjust this month's plan" }),
    ).toBeInTheDocument()
  })

  it("updates the bucket's target once the plan is saved", async () => {
    mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await saveMonthPlan()

    const investmentsCard = await screen.findByRole('article', { name: 'Investments' })
    expect(await within(investmentsCard).findByText('€450.00 (15%)')).toBeVisible()
  })

  it('starts again from the saved percentages when reopened', async () => {
    mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()
    await saveMonthPlan()

    await openMonthPlanForm()

    expect(within(await monthPlanForm()).getByLabelText('Investments')).toHaveValue('15')
  })

  it('explains that saving failed', async () => {
    mockMonthTargetsApi({
      'PUT /months/2026/9/targets': () => jsonResponse({ detail: 'Internal Server Error' }, 500),
    })
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await saveMonthPlan()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save this month's plan. Please try again.",
    )
  })

  it('closes the form when cancelled', async () => {
    mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()

    await userEvent.click(within(await monthPlanForm()).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('region', { name: "This month's plan" })).not.toBeInTheDocument()
  })

  it('does not save the percentages when cancelled', async () => {
    const fetchMock = mockMonthTargetsApi()
    renderApp('/')
    await openMonthPlanForm()
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(within(await monthPlanForm()).getByRole('button', { name: 'Cancel' }))

    expect(wasSent(fetchMock, 'PUT /months/2026/9/targets')).toBe(false)
  })
})
