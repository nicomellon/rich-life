import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'
import {
  type ApiResponder,
  defaultSpendingPlan,
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  mockApi,
  neverRespond,
  DATABASE_UNAVAILABLE_MESSAGE,
  sentJsonBody,
  databaseUnavailableResponse,
  signedInUser,
  signInBeforeRender,
  wasSent,
} from '@/test/api-mock'
import { findLoadingSkeleton } from '@/test/loading-skeleton'
import { renderApp } from '@/test/render-app'
import { findToast, shownToasts } from '@/test/toasts'

const updatedSpendingPlan: SpendingPlanPercentages = {
  fixed_costs_pct: '45.00',
  investments_pct: '15.00',
  savings_pct: '20.00',
  guilt_free_pct: '20.00',
}

const PERCENTAGES_TOTAL_ERROR = 'The percentages must add up to 100%.'
const SERVER_PERCENTAGE_ERROR_MESSAGE = 'Input should be less than or equal to 100'

function savingsRejectedResponse(): Response {
  return errorResponse(422, 'validation_failed', 'Some fields are invalid.', [
    { field: 'savings_pct', message: SERVER_PERCENTAGE_ERROR_MESSAGE },
  ])
}

function mockSpendingPlanApi(
  updateResponder: ApiResponder = () => jsonResponse(updatedSpendingPlan),
  readResponder: ApiResponder = () => jsonResponse(defaultSpendingPlan),
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

async function savePlan() {
  await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))
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

  it('shows no percentage error before the plan is first saved', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await typePercentage('Savings', '120')

    expect(screen.getByLabelText('Savings')).not.toHaveAccessibleDescription()
  })

  it.each([
    ['above 100', '120'],
    ['empty', ''],
    ['negative', '-5'],
    ['with 3 decimal places', '12.345'],
  ])('flags a percentage that is %s on save', async (_, typedSavingsPercentage) => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', typedSavingsPercentage)

    await savePlan()

    expect(screen.getByLabelText('Savings')).toHaveAccessibleDescription(
      'Enter a number from 0 to 100, with at most 2 decimals.',
    )
  })

  it('marks an invalid percentage as invalid on save', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '120')

    await savePlan()

    expect(screen.getByLabelText('Savings')).toBeInvalid()
  })

  it('clears a percentage error as the user corrects it', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '120')
    await savePlan()

    await typePercentage('Savings', '20')

    expect(screen.getByLabelText('Savings')).not.toHaveAccessibleDescription()
  })

  it('shows the total error once when the percentages add up to 99.99%', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '19.99')

    await savePlan()

    expect(await screen.findAllByText(PERCENTAGES_TOTAL_ERROR)).toHaveLength(1)
  })

  it('does not save percentages that add up to 99.99%', async () => {
    const fetchMock = mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '19.99')

    await savePlan()

    await screen.findByText(PERCENTAGES_TOTAL_ERROR)
    expect(wasSent(fetchMock, 'PUT /spending-plan')).toBe(false)
  })

  it('clears the total error as the user corrects a percentage', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '19.99')
    await savePlan()
    await screen.findByText(PERCENTAGES_TOTAL_ERROR)

    await typePercentage('Savings', '20')

    await waitFor(() => expect(screen.queryByText(PERCENTAGES_TOTAL_ERROR)).not.toBeInTheDocument())
  })

  it('keeps the save button enabled while the plan is invalid', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await typePercentage('Savings', '30')

    await savePlan()

    await screen.findByText(PERCENTAGES_TOTAL_ERROR)
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled()
  })

  it("shows the server's error about a percentage under its field", async () => {
    mockSpendingPlanApi(savingsRejectedResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await savePlan()

    expect(await screen.findByText(SERVER_PERCENTAGE_ERROR_MESSAGE)).toBeInTheDocument()
  })

  it("keeps the server's error about Savings while the user changes Fixed Costs", async () => {
    mockSpendingPlanApi(savingsRejectedResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()
    await savePlan()
    await screen.findByText(SERVER_PERCENTAGE_ERROR_MESSAGE)

    await typePercentage('Fixed Costs', '44')

    expect(screen.getByLabelText('Savings')).toHaveAccessibleDescription(
      SERVER_PERCENTAGE_ERROR_MESSAGE,
    )
  })

  it("shows no toast for the server's error about a percentage", async () => {
    mockSpendingPlanApi(savingsRejectedResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await savePlan()

    await screen.findByText(SERVER_PERCENTAGE_ERROR_MESSAGE)
    expect(await shownToasts()).toEqual([])
  })

  it('sends the new percentages to the API', async () => {
    const fetchMock = mockSpendingPlanApi()
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await findToast('Spending plan saved')
    expect(sentJsonBody(fetchMock, 'PUT /spending-plan')).toEqual(updatedSpendingPlan)
  })

  it('confirms that the plan was saved', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await findToast('Spending plan saved')).toHaveAttribute('data-type', 'success')
  })

  it("shows the server's message when saving fails", async () => {
    mockSpendingPlanApi(databaseUnavailableResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    expect(await findToast(DATABASE_UNAVAILABLE_MESSAGE)).toHaveAttribute('data-type', 'error')
  })

  it('keeps the typed percentages when saving fails', async () => {
    mockSpendingPlanApi(databaseUnavailableResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.getByLabelText('Investments')).toHaveValue('15')
  })

  it('shows no inline alert when saving fails', async () => {
    mockSpendingPlanApi(databaseUnavailableResponse)
    renderApp('/plan')
    await moveFivePercentFromFixedCostsToInvestments()

    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a skeleton while the plan is loading', async () => {
    mockSpendingPlanApi(undefined, neverRespond)

    renderApp('/plan')

    expect(await findLoadingSkeleton('Loading your plan…')).toBeInTheDocument()
  })

  it('replaces the skeleton with the plan once it is loaded', async () => {
    mockSpendingPlanApi()
    renderApp('/plan')

    await findPercentageInput('Fixed Costs')

    expect(screen.queryByText('Loading your plan…')).not.toBeInTheDocument()
  })

  it('removes the skeleton when the plan could not be loaded', async () => {
    mockSpendingPlanApi(undefined, internalErrorResponse)
    renderApp('/plan')

    await screen.findByRole('alert')

    expect(screen.queryByText('Loading your plan…')).not.toBeInTheDocument()
  })

  it('explains that the plan could not be loaded', async () => {
    mockSpendingPlanApi(undefined, internalErrorResponse)

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
