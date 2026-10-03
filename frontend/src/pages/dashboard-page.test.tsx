import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { monthsQueryKey, type Month } from '@/months/months-api'
import {
  type ApiResponder,
  errorResponse,
  inSequence,
  internalErrorResponse,
  jsonResponse,
  mockApi,
  neverRespond,
  DATABASE_UNAVAILABLE_MESSAGE,
  sentJsonBody,
  databaseUnavailableResponse,
  signedInUser,
  signInBeforeRender,
  startedSeptember2026,
  summaryOfStartedMonth,
  wasSent,
} from '@/test/api-mock'
import { findLoadingSkeleton, unlabelledBusySkeletons } from '@/test/loading-skeleton'
import { createTestQueryClient, renderApp } from '@/test/render-app'
import { findToast, shownToasts } from '@/test/toasts'

const startedJuly2026: Month = { ...startedSeptember2026, month: 7, income: '2800.00' }
const updatedSeptember2026: Month = { ...startedSeptember2026, income: '3500.50' }
const SERVER_INCOME_ERROR_MESSAGE = 'Input should be greater than or equal to 0'
const welcomeLine = "Welcome to Rich Life. Start your first month by entering this month's income."

function incomeRejectedResponse(): Response {
  return errorResponse(422, 'validation_failed', 'Some fields are invalid.', [
    { field: 'income', message: SERVER_INCOME_ERROR_MESSAGE },
  ])
}

function mockMonthsApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([]),
    'POST /months': () => jsonResponse(startedSeptember2026, 201),
    'GET /months/2026/9/entries': () => jsonResponse([]),
    'GET /months/2026/9/summary': () => jsonResponse(summaryOfStartedMonth({})),
    ...extraResponders,
  })
}

function mockStartedMonthsApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockMonthsApi({
    'GET /months': () => jsonResponse([startedSeptember2026, startedJuly2026]),
    'PATCH /months/2026/9': () => jsonResponse(updatedSeptember2026),
    'GET /months/2026/7/entries': () => jsonResponse([]),
    'GET /months/2026/7/summary': () => jsonResponse(summaryOfStartedMonth({}, '2800.00')),
    ...extraResponders,
  })
}

async function typeIncome(typedIncome: string) {
  const incomeInput = await screen.findByLabelText('Income')
  await userEvent.clear(incomeInput)
  if (typedIncome) await userEvent.type(incomeInput, typedIncome)
}

async function startMonthWithIncome(typedIncome: string) {
  await typeIncome(typedIncome)
  await userEvent.click(screen.getByRole('button', { name: 'Start this month' }))
}

async function editIncome(typedIncome: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit income' }))
  await typeIncome(typedIncome)
}

/** The month's saved income, once it's shown rather than being edited. */
function shownIncome(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: 'Income' })
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

    expect(await shownIncome()).toHaveTextContent('€3,000.00')
  })

  it('shows no income error before the month is first started', async () => {
    mockMonthsApi()
    renderApp('/')

    await typeIncome('abc')

    expect(screen.getByLabelText('Income')).not.toHaveAccessibleDescription()
  })

  it.each([
    ['an empty income', '', 'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.'],
    [
      'a negative income',
      '-100',
      'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.',
    ],
    ['text', 'abc', 'Enter an amount such as 3000 or 3000.50, with at most 2 decimals.'],
    ['an income above the maximum', '10000000000', 'Enter an amount up to 9,999,999,999.99'],
    ['an income with 3 decimal places', '12.345', 'Use at most 2 decimal places'],
  ])('flags %s when starting the month', async (_, typedIncome, expectedError) => {
    mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome(typedIncome)

    expect(screen.getByLabelText('Income')).toHaveAccessibleDescription(expectedError)
  })

  it('does not start the month with a negative income', async () => {
    const fetchMock = mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome('-100')

    await screen.findByText('Enter an amount such as 3000 or 3000.50, with at most 2 decimals.')
    expect(wasSent(fetchMock, 'POST /months')).toBe(false)
  })

  it('keeps the start button enabled while the income is invalid', async () => {
    mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome('abc')

    expect(screen.getByRole('button', { name: 'Start this month' })).toBeEnabled()
  })

  it('clears the income error as the user corrects it', async () => {
    mockMonthsApi()
    renderApp('/')
    await startMonthWithIncome('12.345')

    await userEvent.type(screen.getByLabelText('Income'), '{Backspace}')

    expect(screen.getByLabelText('Income')).not.toHaveAccessibleDescription()
  })

  it("shows the server's error about the income under the income field", async () => {
    mockMonthsApi({ 'POST /months': incomeRejectedResponse })
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await screen.findByText(SERVER_INCOME_ERROR_MESSAGE)).toBeInTheDocument()
  })

  it("shows no toast for the server's error about the income", async () => {
    mockMonthsApi({ 'POST /months': incomeRejectedResponse })
    renderApp('/')

    await startMonthWithIncome('3000')

    await screen.findByText(SERVER_INCOME_ERROR_MESSAGE)
    expect(await shownToasts()).toEqual([])
  })

  it('confirms that the month was started', async () => {
    mockMonthsApi()
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await findToast('Month started')).toHaveAttribute('data-type', 'success')
  })

  it("shows the server's message when starting the month fails", async () => {
    mockMonthsApi({ 'POST /months': databaseUnavailableResponse })
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await findToast(DATABASE_UNAVAILABLE_MESSAGE)).toHaveAttribute('data-type', 'error')
  })

  it('keeps the typed income when starting the month fails', async () => {
    mockMonthsApi({ 'POST /months': databaseUnavailableResponse })
    renderApp('/')

    await startMonthWithIncome('3000')

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.getByLabelText('Income')).toHaveValue('3000')
  })

  it('shows no inline alert when starting the month fails', async () => {
    mockMonthsApi({ 'POST /months': databaseUnavailableResponse })
    renderApp('/')

    await startMonthWithIncome('3000')

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the month when it was already started elsewhere', async () => {
    mockMonthsApi({
      'GET /months': inSequence(
        () => jsonResponse([]),
        () => jsonResponse([startedSeptember2026]),
      ),
      'POST /months': () => errorResponse(409, 'month_already_exists', 'Month already exists'),
    })
    renderApp('/')

    await startMonthWithIncome('3000')

    expect(await shownIncome()).toHaveTextContent('€3,000.00')
  })

  it('does not report a failure when the month was already started elsewhere', async () => {
    let answerAlreadyStarted = () => {}
    mockMonthsApi({
      'POST /months': () =>
        new Promise<Response>((resolve) => {
          answerAlreadyStarted = () =>
            resolve(errorResponse(409, 'month_already_exists', 'Month already exists'))
        }),
    })
    renderApp('/')
    await startMonthWithIncome('3000')
    await screen.findByRole('button', { name: 'Starting…' })

    answerAlreadyStarted()

    await screen.findByRole('button', { name: 'Start this month' })
    expect(await shownToasts()).toEqual([])
  })

  it('keeps showing the month when reloading the months fails', async () => {
    mockStartedMonthsApi({
      'GET /months': inSequence(() => jsonResponse([startedSeptember2026]), internalErrorResponse),
    })
    const queryClient = createTestQueryClient()
    renderApp('/', queryClient)
    await shownIncome()

    await act(() => queryClient.invalidateQueries({ queryKey: monthsQueryKey }))

    await waitFor(() => expect(queryClient.getQueryState(monthsQueryKey)?.status).toBe('error'))
    expect(await shownIncome()).toHaveTextContent('€3,000.00')
  })

  it('shows a skeleton while the months are loading', async () => {
    mockMonthsApi({ 'GET /months': neverRespond })

    renderApp('/')

    expect(await findLoadingSkeleton('Loading your months…')).toBeInTheDocument()
  })

  it('marks the month picker skeleton busy while the months are loading', async () => {
    mockMonthsApi({ 'GET /months': neverRespond })
    renderApp('/')

    await findLoadingSkeleton('Loading your months…')

    expect(unlabelledBusySkeletons()).toHaveLength(1)
  })

  it('shows no month picker while the months are loading', async () => {
    mockMonthsApi({ 'GET /months': neverRespond })
    renderApp('/')

    await findLoadingSkeleton('Loading your months…')

    expect(screen.queryByRole('combobox', { name: 'Month' })).not.toBeInTheDocument()
  })

  it('does not welcome the user while the months are loading', async () => {
    mockMonthsApi({ 'GET /months': neverRespond })
    renderApp('/')

    await findLoadingSkeleton('Loading your months…')

    expect(screen.queryByText(welcomeLine)).not.toBeInTheDocument()
  })

  it('replaces the skeleton with the month once the months are loaded', async () => {
    mockMonthsApi()
    renderApp('/')

    await screen.findByRole('button', { name: 'Start this month' })

    expect(screen.queryByText('Loading your months…')).not.toBeInTheDocument()
  })

  it('removes the skeleton when the months could not be loaded', async () => {
    mockMonthsApi({ 'GET /months': internalErrorResponse })
    renderApp('/')

    await screen.findByRole('alert')

    expect(screen.queryByText('Loading your months…')).not.toBeInTheDocument()
  })

  it('shows the month picker when the months could not be loaded', async () => {
    mockMonthsApi({ 'GET /months': internalErrorResponse })
    renderApp('/')

    await screen.findByRole('alert')

    expect(monthDropdown()).toBeInTheDocument()
  })

  it('shows no toast when the months could not be loaded', async () => {
    mockMonthsApi({ 'GET /months': internalErrorResponse })

    renderApp('/')

    await screen.findByRole('alert')
    expect(await shownToasts()).toEqual([])
  })

  it('explains that the months could not be loaded', async () => {
    mockMonthsApi({ 'GET /months': internalErrorResponse })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load your months. Please reload the page.",
    )
  })

  it('shows the month named in the URL', async () => {
    mockStartedMonthsApi()

    renderApp('/?month=2026-07')

    expect(await shownIncome()).toHaveTextContent('€2,800.00')
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

  it('welcomes a user who has not started any month above the start-month form', async () => {
    mockMonthsApi()

    renderApp('/')

    const startMonthHeading = await screen.findByRole('heading', {
      name: "You haven't started September 2026 yet",
    })
    expect(
      screen.getByText(welcomeLine).compareDocumentPosition(startMonthHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not welcome a user who has started a month', async () => {
    mockStartedMonthsApi()

    renderApp('/?month=2026-10')

    await screen.findByRole('button', { name: 'Start this month' })
    expect(screen.queryByText(welcomeLine)).not.toBeInTheDocument()
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
    await shownIncome()

    await userEvent.selectOptions(monthDropdown(), 'July 2026')

    expect(await shownIncome()).toHaveTextContent('€2,800.00')
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

    await shownIncome()
    expect(sentJsonBody(fetchMock, 'PATCH /months/2026/9')).toEqual({ income: '3500.50' })
  })

  it('shows the edited income once it is saved', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await shownIncome()).toHaveTextContent('€3,500.50')
  })

  it('does not save a negative income', async () => {
    const fetchMock = mockStartedMonthsApi()
    renderApp('/')
    await editIncome('-100')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    await screen.findByText('Enter an amount such as 3000 or 3000.50, with at most 2 decimals.')
    expect(wasSent(fetchMock, 'PATCH /months/2026/9')).toBe(false)
  })

  it("shows the server's error about the edited income under the income field", async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': incomeRejectedResponse })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await screen.findByText(SERVER_INCOME_ERROR_MESSAGE)).toBeInTheDocument()
  })

  it('keeps the saved income when editing is cancelled', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await shownIncome()).toHaveTextContent('€3,000.00')
  })

  it("can't cancel editing while the income is being saved", async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': neverRespond })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('confirms that the income was saved', async () => {
    mockStartedMonthsApi()
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await findToast('Income saved')).toHaveAttribute('data-type', 'success')
  })

  it("shows the server's message when saving the income fails", async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': databaseUnavailableResponse })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(await findToast(DATABASE_UNAVAILABLE_MESSAGE)).toHaveAttribute('data-type', 'error')
  })

  it('keeps the typed income when saving it fails', async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': databaseUnavailableResponse })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.getByLabelText('Income')).toHaveValue('3500.50')
  })

  it('shows no inline alert when saving the income fails', async () => {
    mockStartedMonthsApi({ 'PATCH /months/2026/9': databaseUnavailableResponse })
    renderApp('/')
    await editIncome('3500.50')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    await findToast(DATABASE_UNAVAILABLE_MESSAGE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
