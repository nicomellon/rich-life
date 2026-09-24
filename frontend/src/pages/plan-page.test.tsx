import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'
import {
  defaultSpendingPlan,
  jsonResponse,
  mockApi,
  sentJsonBody,
  signedInUser,
  signInBeforeRender,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

const updatedSpendingPlan: SpendingPlanPercentages = {
  fixed_costs_pct: '45.00',
  investments_pct: '15.00',
  savings_pct: '20.00',
  guilt_free_pct: '20.00',
}

function mockSpendingPlanApi(
  updateResponder = () => jsonResponse(updatedSpendingPlan),
  readResponder = () => jsonResponse(defaultSpendingPlan),
) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /spending-plan': readResponder,
    'PUT /spending-plan': updateResponder,
  })
}

async function findPercentageInput(bucketLabel: string) {
  return screen.findByLabelText(bucketLabel)
}

async function typePercentage(bucketLabel: string, typedPercentage: string) {
  const percentageInput = await findPercentageInput(bucketLabel)
  await userEvent.clear(percentageInput)
  if (typedPercentage) await userEvent.type(percentageInput, typedPercentage)
}

async function moveFivePercentFromFixedCostsToInvestments() {
  await typePercentage('Fixed Costs', '45')
  await typePercentage('Investments', '15')
}

describe('PlanPage', () => {
  beforeEach(() => {
    signInBeforeRender()
  })

  it('shows the saved percentage of each bucket', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    const percentageInputs = await Promise.all(
      ['Fixed Costs', 'Investments', 'Savings', 'Guilt-Free Spending'].map(findPercentageInput),
    )

    expect(
      percentageInputs.map((percentageInput) => (percentageInput as HTMLInputElement).value),
    ).toEqual(['50', '10', '20', '20'])
  })

  it('shows a total of 100% for the saved plan', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await findPercentageInput('Fixed Costs')

    expect(screen.getByRole('status', { name: 'Total' })).toHaveTextContent('Total: 100%')
  })

  it('updates the total while the user types', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await typePercentage('Fixed Costs', '45.5')

    expect(screen.getByRole('status', { name: 'Total' })).toHaveTextContent(
      'Total: 95.5%. Add 4.5% to reach 100%.',
    )
  })

  it('warns when the total is over 100%', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await typePercentage('Savings', '30')

    expect(screen.getByRole('status', { name: 'Total' })).toHaveTextContent(
      'Total: 110%. Remove 10% to get back to 100%.',
    )
  })

  it.each([
    ["the total isn't 100%", '30'],
    ['a percentage is empty', ''],
  ])("can't be saved when %s", async (_, typedSavingsPercentage) => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await typePercentage('Savings', typedSavingsPercentage)

    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled()
  })

  it('flags a percentage that is out of range', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await typePercentage('Savings', '120')

    expect(screen.getByLabelText('Savings')).toHaveAccessibleDescription(
      'Enter a number from 0 to 100, with at most 2 decimals.',
    )
  })

  it('sends the new percentages to the API', async () => {
    const fetchMock = mockSpendingPlanApi()
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await screen.findByText('Your spending plan is saved.')
    expect(sentJsonBody(fetchMock, 'PUT /spending-plan')).toEqual(updatedSpendingPlan)
  })

  it('confirms that the plan is saved', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await screen.findByText('Your spending plan is saved.')).toBeInTheDocument()
  })

  it('hides the saved confirmation once the user edits again', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))
    await screen.findByText('Your spending plan is saved.')

    await typePercentage('Savings', '19')

    expect(screen.queryByText('Your spending plan is saved.')).not.toBeInTheDocument()
  })

  it('explains that saving failed', async () => {
    mockSpendingPlanApi(() => jsonResponse({ detail: 'Internal Server Error' }, 500))
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save your spending plan. Please try again.",
    )
  })

  it('explains that the plan could not be loaded', async () => {
    mockSpendingPlanApi(undefined, () => jsonResponse({ detail: 'Internal Server Error' }, 500))

    renderApp('/plan')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your spending plan. Please reload the page.",
    )
  })

  it("previews each bucket's share of an income in the user's currency", async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await findPercentageInput('Fixed Costs')

    await userEvent.type(screen.getByLabelText('Monthly income (optional)'), '3000')

    expect(screen.getByText('€1,500.00')).toBeInTheDocument()
  })
})
