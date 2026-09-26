import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { monthsQueryKey, type Month } from '@/months/months-api'
import {
  type ApiResponder,
  jsonResponse,
  mockApi,
  sentJsonBody,
  signedInUser,
  signInBeforeRender,
  startedSeptember2026,
} from '@/test/api-mock'
import { createTestQueryClient, renderApp } from '@/test/render-app'

const startedJuly2026: Month = { ...startedSeptember2026, month: 7, income: '2800.00' }
const updatedSeptember2026: Month = { ...startedSeptember2026, income: '3500.50' }
const respondWithServerError = () => jsonResponse({ detail: 'Internal Server Error' }, 500)

function mockMonthsApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([]),
    'POST /months': () => jsonResponse(startedSeptember2026, 201),
    ...extraResponders,
  })
}

function mockStartedMonthsApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockMonthsApi({
    'GET /months': () => jsonResponse([startedSeptember2026, startedJuly2026]),
    'PATCH /months/2026/9': () => jsonResponse(updatedSeptember2026),
    ...extraResponders,
  })
}

/** How many requests were sent to `url`, whatever their method. */
function sentRequestCount(fetchMock: ReturnType<typeof mockApi>, url: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === url).length
}

/** Answers each request with the next responder, repeating the last one. */
function inSequence(...responders: ApiResponder[]): ApiResponder {
  let requestCount = 0
  return () => {
    const respond = responders[Math.min(requestCount, responders.length - 1)]!
    requestCount += 1
    return respond()
  }
}

async function typeIncome(typedIncome: string) {
  const incomeInput = await screen.findByLabelText('Income')
  await userEvent.clear(incomeInput)
  await userEvent.type(incomeInput, typedIncome)
}

async function startMonthWithIncome(typedIncome: string) {
  await typeIncome(typedIncome)
  await userEvent.click(screen.getByRole('button', { name: 'Start this month' }))
}

async function editIncome(typedIncome: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit income' }))
  await typeIncome(typedIncome)
}

function monthDropdown(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: 'Month' })
}

function listedMonthNames(): string[] {
  return Array.from(monthDropdown().options, (option) => option.text)
}

describe('DashboardPage', () => {
  beforeEach(() => {
    signInBeforeRender()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the current month by default', async () => {
    mockMonthsApi()

    renderApp('/')

    await screen.findByRole('button', { name: 'Start this month' })
    expect(monthDropdown().selectedOptions[0]).toHaveTextContent('September 2026')
  })

  it('offers to start a month the user has not started', async () => {
    mockMonthsApi()

    renderApp('/')

    expect(
      await screen.findByRole('heading', { name: "You haven't started September 2026 yet" }),
    ).toBeInTheDocument()
  })

  it('starts the month with the typed income', async () => {
    const fetchMock = mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome('3000')

    await screen.findByRole('button', { name: 'Edit income' })
    expect(sentJsonBody(fetchMock, 'POST /months')).toEqual({
      year: 2026,
      month: 9,
      income: '3000.00',
    })
  })

  it('shows the income of the month once it is started', async () => {
    mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await screen.findByText('€3,000.00')).toBeInTheDocument()
  })

  it("can't start the month before an income is typed", async () => {
    mockMonthsApi()

    renderApp('/')

    expect(await screen.findByRole('button', { name: 'Start this month' })).toBeDisabled()
  })

  it("can't start the month when the income is not an amount", async () => {
    mockMonthsApi()
    renderApp('/')

    await typeIncome('abc')

    expect(screen.getByRole('button', { name: 'Start this month' })).toBeDisabled()
  })

  it('flags an income that is not an amount', async () => {
    mockMonthsApi()
    renderApp('/')

    await typeIncome('12.345')

    expect(screen.getByLabelText('Income')).toHaveAccessibleDescription(
      'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.',
    )
  })

  it('explains that starting the month failed', async () => {
    mockMonthsApi({ 'POST /months': respondWithServerError })
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't start this month. Please try again.",
    )
  })

  it('shows the month when it was already started elsewhere', async () => {
    mockMonthsApi({
      'GET /months': inSequence(
        () => jsonResponse([]),
        () => jsonResponse([startedSeptember2026]),
      ),
      'POST /months': () => jsonResponse({ detail: 'Month already exists' }, 409),
    })
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await screen.findByText('€3,000.00')).toBeInTheDocument()
  })

  it('does not report a failure when the month was already started elsewhere', async () => {
    const fetchMock = mockMonthsApi({
      'POST /months': () => jsonResponse({ detail: 'Month already exists' }, 409),
    })
    renderApp('/')

    await startMonthWithIncome('3000')

    await waitFor(() => expect(sentRequestCount(fetchMock, '/api/v1/months')).toBe(3))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps showing the month when reloading the months fails', async () => {
    mockStartedMonthsApi({
      'GET /months': inSequence(() => jsonResponse([startedSeptember2026]), respondWithServerError),
    })
    const queryClient = createTestQueryClient()
    renderApp('/', queryClient)
    await screen.findByText('€3,000.00')

    await act(() => queryClient.invalidateQueries({ queryKey: monthsQueryKey }))

    await waitFor(() => expect(queryClient.getQueryState(monthsQueryKey)?.status).toBe('error'))
    expect(await screen.findByText('€3,000.00')).toBeInTheDocument()
  })

  it('explains that the months could not be loaded', async () => {
    mockMonthsApi({ 'GET /months': respondWithServerError })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your months. Please reload the page.",
    )
  })

  it('shows the month named in the URL', async () => {
    mockStartedMonthsApi()

    renderApp('/?month=2026-07')

    expect(await screen.findByText('€2,800.00')).toBeInTheDocument()
  })

  it('shows the current month when the URL names an invalid month', async () => {
    mockMonthsApi()

    renderApp('/?month=2026-13')

    await screen.findByRole('button', { name: 'Start this month' })
    expect(monthDropdown().selectedOptions[0]).toHaveTextContent('September 2026')
  })

  it.each([
    ['Previous month', '2026-08'],
    ['Next month', '2026-10'],
  ])('steps to another month with the %s arrow', async (arrowName, expectedMonthKey) => {
    mockMonthsApi()
    const router = renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: arrowName }))

    expect(router.state.location.search).toBe(`?month=${expectedMonthKey}`)
  })

  it('offers to start a month the user steps to', async () => {
    mockStartedMonthsApi()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Next month' }))

    expect(
      await screen.findByRole('heading', { name: "You haven't started October 2026 yet" }),
    ).toBeInTheDocument()
  })

  it('lists the started months and the selected one in the dropdown, newest first', async () => {
    mockStartedMonthsApi()

    renderApp('/?month=2026-10')

    await screen.findByRole('button', { name: 'Start this month' })
    expect(listedMonthNames()).toEqual(['October 2026', 'September 2026', 'July 2026'])
  })

  it('switches to the month chosen in the dropdown', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await screen.findByText('€3,000.00')

    await userEvent.selectOptions(monthDropdown(), 'July 2026')

    expect(screen.getByText('€2,800.00')).toBeInTheDocument()
  })

  it('starts editing the income with the saved amount', async () => {
    mockStartedMonthsApi()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit income' }))

    expect(screen.getByLabelText('Income')).toHaveValue('3000')
  })

  it('sends the edited income to the API', async () => {
    const fetchMock = mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    await screen.findByText('€3,500.50')
    expect(sentJsonBody(fetchMock, 'PATCH /months/2026/9')).toEqual({ income: '3500.50' })
  })

  it('shows the edited income once it is saved', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await screen.findByText('€3,500.50')).toBeInTheDocument()
  })

  it("can't save an income that is not an amount", async () => {
    mockStartedMonthsApi()
    renderApp('/')

    await editIncome('abc')

    expect(screen.getByRole('button', { name: 'Save income' })).toBeDisabled()
  })

  it('keeps the saved income when editing is cancelled', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('€3,000.00')).toBeInTheDocument()
  })

  it("can't cancel editing while the income is being saved", async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': () => new Promise<Response>(() => {}) })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('explains that saving the income failed', async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': respondWithServerError })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save the income. Please try again.",
    )
  })
})
