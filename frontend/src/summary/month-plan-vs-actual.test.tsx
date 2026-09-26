import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entry } from '@/entries/entries-api'
import {
  type ApiResponder,
  inSequence,
  jsonResponse,
  mockApi,
  rentEntry,
  signedInUser,
  signInBeforeRender,
  startedSeptember2026,
  summaryOfStartedMonth,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

const summaryWithRent = summaryOfStartedMonth({ fixed_costs: '1200.00' })
const respondWithServerError = () => jsonResponse({ detail: 'Internal Server Error' }, 500)

const investmentEntry: Entry = {
  id: 4,
  bucket: 'investments',
  amount: '250.00',
  date: '2026-09-02',
  description: 'ETF',
  created_at: '2026-09-02T10:00:00Z',
}

function mockSummaryApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([startedSeptember2026]),
    'GET /months/2026/9/entries': () => jsonResponse([rentEntry]),
    'GET /months/2026/9/summary': () => jsonResponse(summaryWithRent),
    'POST /months/2026/9/entries': () => jsonResponse(investmentEntry, 201),
    ...extraResponders,
  })
}

function respondWithSummary(...actualAmountsByBucket: Parameters<typeof summaryOfStartedMonth>) {
  return () => jsonResponse(summaryOfStartedMonth(...actualAmountsByBucket))
}

/** A bucket's plan vs actual card, e.g. `bucketCard('Fixed Costs')`. */
function bucketCard(bucketLabel: string): Promise<HTMLElement> {
  return screen.findByRole('article', { name: bucketLabel })
}

/** The figure on a bucket's card named `statLabel`, such as "Target", with its label. */
async function bucketStat(bucketLabel: string, statLabel: string): Promise<HTMLElement> {
  const statTerm = within(await bucketCard(bucketLabel)).getByText(statLabel)
  return statTerm.parentElement!
}

/** The amount a bucket's card shows as remaining. */
async function remainingAmount(bucketLabel: string): Promise<HTMLElement> {
  return within(await bucketStat(bucketLabel, 'Remaining')).getByRole('definition')
}

/** One of the month's totals, e.g. `monthTotal('Unallocated')`. */
function monthTotal(totalLabel: string): Promise<HTMLElement> {
  return screen.findByRole('group', { name: totalLabel })
}

async function addInvestment() {
  const form = within(await screen.findByRole('form', { name: 'Add an entry' }))
  await userEvent.type(form.getByLabelText('Amount'), '250')
  await userEvent.selectOptions(form.getByLabelText('Bucket'), 'Investments')
  await userEvent.type(form.getByLabelText('Description (optional)'), 'ETF')
  await userEvent.click(form.getByRole('button', { name: 'Add entry' }))
}

describe('MonthPlanVsActual', () => {
  beforeEach(() => {
    signInBeforeRender()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows a bucket's target amount and share of the income", async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await bucketStat('Fixed Costs', 'Target')).toHaveTextContent('€1,500.00 (50%)')
  })

  it("shows a bucket's actual amount and share of the income", async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await bucketStat('Fixed Costs', 'Actual')).toHaveTextContent('€1,200.00 (40%)')
  })

  it('shows how much of its target a bucket has left', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await bucketStat('Fixed Costs', 'Remaining')).toHaveTextContent('€300.00')
  })

  it('shows how far a bucket is over its target', async () => {
    mockSummaryApi({ 'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: '1600.00' }) })

    renderApp('/')

    expect(await bucketStat('Fixed Costs', 'Remaining')).toHaveTextContent('-€100.00')
  })

  it("flags an over-budget bucket's remaining amount", async () => {
    mockSummaryApi({ 'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: '1600.00' }) })

    renderApp('/')

    expect(await remainingAmount('Fixed Costs')).toHaveClass('text-status-over')
  })

  it('does not flag the remaining amount of a bucket on track but over its target', async () => {
    mockSummaryApi({ 'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: '1550.00' }) })

    renderApp('/')

    expect(await remainingAmount('Fixed Costs')).not.toHaveClass('text-status-over')
  })

  it.each([
    ['below its target', '1200.00', 'Under target'],
    ['within 5% of its target', '1550.00', 'On track'],
    ['over its target', '1600.00', 'Over budget'],
  ])('labels a bucket %s', async (_, fixedCostsActualAmount, expectedStatusLabel) => {
    mockSummaryApi({
      'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: fixedCostsActualAmount }),
    })

    renderApp('/')

    expect(within(await bucketCard('Fixed Costs')).getByText(expectedStatusLabel)).toBeVisible()
  })

  it('shows a card for every bucket', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })

  it('shows how much the entries add up to', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await monthTotal('Spent and allocated')).toHaveTextContent('€1,200.00')
  })

  it('shows how much of the income is unallocated', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await monthTotal('Unallocated')).toHaveTextContent('€1,800.00')
  })

  it('shows the income among the totals', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(await monthTotal('Income')).toHaveTextContent('€3,000.00')
  })

  it('flags a negative unallocated amount', async () => {
    mockSummaryApi({ 'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: '3100.00' }) })

    renderApp('/')

    expect(within(await monthTotal('Unallocated')).getByText('-€100.00')).toHaveClass(
      'text-status-over',
    )
  })

  it.each([
    ['a positive', '1200.00', '€1,800.00'],
    ['a zero', '3000.00', '€0.00'],
  ])('does not flag %s unallocated amount', async (_, fixedCostsActualAmount, expectedDisplay) => {
    mockSummaryApi({
      'GET /months/2026/9/summary': respondWithSummary({ fixed_costs: fixedCostsActualAmount }),
    })

    renderApp('/')

    expect(within(await monthTotal('Unallocated')).getByText(expectedDisplay)).not.toHaveClass(
      'text-status-over',
    )
  })

  it("formats the amounts in the user's currency", async () => {
    mockSummaryApi({ 'GET /auth/me': () => jsonResponse({ ...signedInUser, currency: 'USD' }) })

    renderApp('/')

    expect(await monthTotal('Unallocated')).toHaveTextContent('$1,800.00')
  })

  it("updates the bucket's actual amount after an entry is added", async () => {
    mockSummaryApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryWithRent),
        respondWithSummary({ fixed_costs: '1200.00', investments: '250.00' }),
      ),
    })
    renderApp('/')

    await addInvestment()

    expect(
      await within(await bucketCard('Investments')).findByText('€250.00 (8.33%)'),
    ).toBeVisible()
  })

  it('compares the targets with the actual amounts in a chart', async () => {
    mockSummaryApi()

    renderApp('/')

    expect(
      await screen.findByRole('figure', { name: 'Target vs actual per bucket' }),
    ).toBeInTheDocument()
  })

  it("keys the chart's actual bars by status in its legend", async () => {
    mockSummaryApi()

    renderApp('/')

    const legendKeys = within(await screen.findByRole('list', { name: 'Legend' })).getAllByRole(
      'listitem',
    )
    expect(legendKeys.map((legendKey) => legendKey.textContent)).toEqual([
      'Target',
      'Actual, under target',
      'Actual, on track',
      'Actual, over budget',
    ])
  })

  it('explains that the totals could not be updated after an entry is added', async () => {
    mockSummaryApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryWithRent),
        respondWithServerError,
      ),
    })
    renderApp('/')

    await addInvestment()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't update this month's totals. Please reload the page.",
    )
  })

  it('explains that the totals could not be loaded', async () => {
    mockSummaryApi({ 'GET /months/2026/9/summary': respondWithServerError })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load this month's totals. Please reload the page.",
    )
  })
})
