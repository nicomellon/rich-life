import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entry } from '@/entries/entries-api'
import type { Month } from '@/months/months-api'
import {
  type ApiResponder,
  emptyResponse,
  groceriesEntry,
  inSequence,
  jsonResponse,
  mockApi,
  rentEntry,
  sentJsonBody,
  signedInUser,
  signInBeforeRender,
  startedSeptember2026,
  summaryOfStartedMonth,
  wasSent,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

const lunchEntry: Entry = {
  id: 3,
  bucket: 'guilt_free',
  amount: '12.50',
  date: '2026-09-15',
  description: 'Lunch',
  created_at: '2026-09-15T12:00:00Z',
}
const changedRentEntry: Entry = { ...rentEntry, amount: '1250.00', description: 'Rent and bills' }
const updatedSeptember2026: Month = { ...startedSeptember2026, income: '3500.00' }
const summaryOfSavedEntries = summaryOfStartedMonth({ fixed_costs: '1200.00', guilt_free: '45.50' })
const respondWithServerError = () => jsonResponse({ detail: 'Internal Server Error' }, 500)

function mockEntriesApi(extraResponders: Record<string, ApiResponder> = {}) {
  return mockApi({
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([startedSeptember2026]),
    'GET /months/2026/9/entries': () => jsonResponse([groceriesEntry, rentEntry]),
    'GET /months/2026/9/summary': () => jsonResponse(summaryOfSavedEntries),
    'POST /months/2026/9/entries': () => jsonResponse(lunchEntry, 201),
    'PATCH /entries/1': () => jsonResponse(changedRentEntry),
    'DELETE /entries/1': emptyResponse,
    ...extraResponders,
  })
}

/** The list of a bucket's entries, with its totals, e.g. `bucketSection('Fixed Costs')`. */
function bucketSection(bucketLabel: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: bucketLabel })
}

function addEntryForm(): Promise<HTMLElement> {
  return screen.findByRole('form', { name: 'Add an entry' })
}

async function replaceText(field: HTMLElement, typedText: string) {
  await userEvent.clear(field)
  if (typedText) await userEvent.type(field, typedText)
}

interface TypedNewEntry {
  amount: string
  bucketLabel: string
  date?: string
  description: string
}

async function fillNewEntry({ amount, bucketLabel, date, description }: TypedNewEntry) {
  const form = within(await addEntryForm())
  await replaceText(form.getByLabelText('Amount'), amount)
  await userEvent.selectOptions(form.getByLabelText('Bucket'), bucketLabel)
  if (date !== undefined) await replaceText(form.getByLabelText('Date'), date)
  await replaceText(form.getByLabelText('Description (optional)'), description)
}

async function addLunch() {
  await fillNewEntry({ amount: '12.5', bucketLabel: 'Guilt-Free Spending', description: 'Lunch' })
  await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))
}

async function editRentAmount(typedAmount: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit Rent' }))
  const form = within(screen.getByRole('form', { name: 'Edit Rent' }))
  await replaceText(form.getByLabelText('Amount'), typedAmount)
}

async function changeRent() {
  await editRentAmount('1250')
  const form = within(screen.getByRole('form', { name: 'Edit Rent' }))
  await replaceText(form.getByLabelText('Description (optional)'), 'Rent and bills')
  await userEvent.click(form.getByRole('button', { name: 'Save entry' }))
}

async function startDeletingRent() {
  await userEvent.click(await screen.findByRole('button', { name: 'Delete Rent' }))
}

async function deleteRent() {
  await startDeletingRent()
  await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
}

describe('MonthEntries', () => {
  beforeEach(() => {
    signInBeforeRender()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 15))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists each entry under its bucket', async () => {
    mockEntriesApi()

    renderApp('/')

    expect(within(await bucketSection('Fixed Costs')).getByText('Rent')).toBeInTheDocument()
  })

  it("shows each entry's amount", async () => {
    mockEntriesApi()

    renderApp('/')

    expect(within(await bucketSection('Guilt-Free Spending')).getByText('€45.50')).toBeVisible()
  })

  it('shows how much of its target each bucket has used', async () => {
    mockEntriesApi()

    renderApp('/')

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('€1,200.00 of €1,500.00'),
    ).toBeInTheDocument()
  })

  it('says when a bucket has no entries', async () => {
    mockEntriesApi()

    renderApp('/')

    expect(within(await bucketSection('Savings')).getByText('No entries yet.')).toBeInTheDocument()
  })

  it('names an entry without a description by its amount', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': () => jsonResponse([{ ...rentEntry, description: '' }]),
    })

    renderApp('/')

    expect(await screen.findByRole('button', { name: 'Edit €1,200.00 entry' })).toBeInTheDocument()
  })

  it('explains that the entries could not be loaded', async () => {
    mockEntriesApi({ 'GET /months/2026/9/entries': respondWithServerError })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load this month's entries. Please reload the page.",
    )
  })

  it('explains that the totals could not be loaded', async () => {
    mockEntriesApi({ 'GET /months/2026/9/summary': respondWithServerError })

    renderApp('/')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't load this month's totals. Please reload the page.",
    )
  })

  it('dates a new entry today', async () => {
    mockEntriesApi()

    renderApp('/')

    expect(within(await addEntryForm()).getByLabelText('Date')).toHaveValue('2026-09-15')
  })

  it('dates a new entry in another month on its closest day to today', async () => {
    mockEntriesApi({
      'GET /months': () => jsonResponse([{ ...startedSeptember2026, month: 7 }]),
      'GET /months/2026/7/entries': () => jsonResponse([]),
      'GET /months/2026/7/summary': () => jsonResponse(summaryOfStartedMonth({})),
    })

    renderApp('/?month=2026-07')

    expect(within(await addEntryForm()).getByLabelText('Date')).toHaveValue('2026-07-31')
  })

  it('sends the new entry to the API', async () => {
    const fetchMock = mockEntriesApi()
    renderApp('/')

    await addLunch()

    await screen.findByRole('button', { name: 'Add entry' })
    expect(sentJsonBody(fetchMock, 'POST /months/2026/9/entries')).toEqual({
      bucket: 'guilt_free',
      amount: '12.50',
      date: '2026-09-15',
      description: 'Lunch',
    })
  })

  it('shows the added entry in its bucket', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        () => jsonResponse([lunchEntry, groceriesEntry, rentEntry]),
      ),
    })
    renderApp('/')

    await addLunch()

    expect(
      await within(await bucketSection('Guilt-Free Spending')).findByText('Lunch'),
    ).toBeInTheDocument()
  })

  it("updates the bucket's total after adding an entry", async () => {
    mockEntriesApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryOfSavedEntries),
        () => jsonResponse(summaryOfStartedMonth({ fixed_costs: '1200.00', guilt_free: '58.00' })),
      ),
    })
    renderApp('/')

    await addLunch()

    expect(
      await within(await bucketSection('Guilt-Free Spending')).findByText('€58.00 of €600.00'),
    ).toBeInTheDocument()
  })

  it('shows the added entry even when reloading the entries fails', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        respondWithServerError,
      ),
    })
    renderApp('/')

    await addLunch()

    expect(
      await within(await bucketSection('Guilt-Free Spending')).findByText('Lunch'),
    ).toBeInTheDocument()
  })

  it('explains that the totals could not be updated after a change', async () => {
    mockEntriesApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryOfSavedEntries),
        respondWithServerError,
      ),
    })
    renderApp('/')

    await addLunch()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't update this month's totals. Please reload the page.",
    )
  })

  it('empties the amount once the entry is added', async () => {
    mockEntriesApi()
    renderApp('/')

    await addLunch()

    await screen.findByRole('button', { name: 'Add entry' })
    expect(within(await addEntryForm()).getByLabelText('Amount')).toHaveValue('')
  })

  it('keeps the bucket for the next entry once one is added', async () => {
    mockEntriesApi()
    renderApp('/')

    await addLunch()

    await screen.findByRole('button', { name: 'Add entry' })
    expect(within(await addEntryForm()).getByLabelText('Bucket')).toHaveValue('guilt_free')
  })

  it('empties the description once the entry is added', async () => {
    mockEntriesApi()
    renderApp('/')

    await addLunch()

    await screen.findByRole('button', { name: 'Add entry' })
    expect(within(await addEntryForm()).getByLabelText('Description (optional)')).toHaveValue('')
  })

  it('keeps the date for the next entry once one is added', async () => {
    mockEntriesApi({
      'POST /months/2026/9/entries': () => jsonResponse({ ...lunchEntry, date: '2026-09-20' }, 201),
    })
    renderApp('/')
    await fillNewEntry({
      amount: '12.5',
      bucketLabel: 'Guilt-Free Spending',
      date: '2026-09-20',
      description: 'Lunch',
    })

    await userEvent.click(screen.getByRole('button', { name: 'Add entry' }))

    await screen.findByRole('button', { name: 'Add entry' })
    expect(within(await addEntryForm()).getByLabelText('Date')).toHaveValue('2026-09-20')
  })

  it("can't add an entry of 0", async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({ amount: '0', bucketLabel: 'Savings', description: '' })

    expect(screen.getByRole('button', { name: 'Add entry' })).toBeDisabled()
  })

  it('flags an amount of 0', async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({ amount: '0', bucketLabel: 'Savings', description: '' })

    expect(within(await addEntryForm()).getByLabelText('Amount')).toHaveAccessibleDescription(
      'Enter an amount above 0 such as 12 or 12.50, with at most 2 decimals.',
    )
  })

  it('flags an amount with more than 2 decimals', async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({ amount: '12.345', bucketLabel: 'Savings', description: '' })

    expect(within(await addEntryForm()).getByLabelText('Amount')).toHaveAccessibleDescription(
      'Enter an amount above 0 such as 12 or 12.50, with at most 2 decimals.',
    )
  })

  it('flags a date outside the month', async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({
      amount: '12',
      bucketLabel: 'Savings',
      date: '2026-10-01',
      description: '',
    })

    expect(within(await addEntryForm()).getByLabelText('Date')).toHaveAccessibleDescription(
      'Pick a day in September 2026.',
    )
  })

  it('flags an empty date', async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({ amount: '12', bucketLabel: 'Savings', date: '', description: '' })

    expect(within(await addEntryForm()).getByLabelText('Date')).toHaveAccessibleDescription(
      'Pick a day in September 2026.',
    )
  })

  it("can't add an entry dated outside the month", async () => {
    mockEntriesApi()
    renderApp('/')

    await fillNewEntry({
      amount: '12',
      bucketLabel: 'Savings',
      date: '2026-10-01',
      description: '',
    })

    expect(screen.getByRole('button', { name: 'Add entry' })).toBeDisabled()
  })

  it("can't change the new entry while it is being added", async () => {
    mockEntriesApi({ 'POST /months/2026/9/entries': () => new Promise<Response>(() => {}) })
    renderApp('/')

    await addLunch()

    expect(within(await addEntryForm()).getByLabelText('Amount')).toBeDisabled()
  })

  it('explains that adding the entry failed', async () => {
    mockEntriesApi({ 'POST /months/2026/9/entries': respondWithServerError })
    renderApp('/')

    await addLunch()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't add the entry. Please try again.",
    )
  })

  it("starts editing with the entry's amount", async () => {
    mockEntriesApi()
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Rent' }))

    const form = within(screen.getByRole('form', { name: 'Edit Rent' }))
    expect(form.getByLabelText('Amount')).toHaveValue('1200')
  })

  it('sends the changed entry to the API', async () => {
    const fetchMock = mockEntriesApi()
    renderApp('/')

    await changeRent()

    await screen.findByRole('button', { name: 'Edit Rent' })
    expect(sentJsonBody(fetchMock, 'PATCH /entries/1')).toEqual({
      bucket: 'fixed_costs',
      amount: '1250.00',
      date: '2026-09-01',
      description: 'Rent and bills',
    })
  })

  it('shows the changed entry once it is saved', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        () => jsonResponse([groceriesEntry, changedRentEntry]),
      ),
    })
    renderApp('/')

    await changeRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('Rent and bills'),
    ).toBeInTheDocument()
  })

  it("updates the bucket's total after editing an entry", async () => {
    mockEntriesApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryOfSavedEntries),
        () => jsonResponse(summaryOfStartedMonth({ fixed_costs: '1250.00', guilt_free: '45.50' })),
      ),
    })
    renderApp('/')

    await changeRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('€1,250.00 of €1,500.00'),
    ).toBeInTheDocument()
  })

  it("can't save an entry of 0", async () => {
    mockEntriesApi()
    renderApp('/')

    await editRentAmount('0')

    expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled()
  })

  it('keeps the saved entry when editing is cancelled', async () => {
    mockEntriesApi()
    renderApp('/')
    await editRentAmount('1250')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(within(await bucketSection('Fixed Costs')).getByText('€1,200.00')).toBeInTheDocument()
  })

  it('shows the changed entry even when reloading the entries fails', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        respondWithServerError,
      ),
    })
    renderApp('/')

    await changeRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('Rent and bills'),
    ).toBeInTheDocument()
  })

  it("can't change the entry while it is being saved", async () => {
    mockEntriesApi({ 'PATCH /entries/1': () => new Promise<Response>(() => {}) })
    renderApp('/')

    await changeRent()

    const form = within(screen.getByRole('form', { name: 'Edit Rent' }))
    expect(form.getByLabelText('Amount')).toBeDisabled()
  })

  it('explains that saving the entry failed', async () => {
    mockEntriesApi({ 'PATCH /entries/1': respondWithServerError })
    renderApp('/')

    await changeRent()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't save the entry. Please try again.",
    )
  })

  it('asks to confirm before deleting an entry', async () => {
    mockEntriesApi()
    renderApp('/')

    await startDeletingRent()

    expect(screen.getByText("Delete Rent? This can't be undone.")).toBeInTheDocument()
  })

  it('does not delete the entry before the deletion is confirmed', async () => {
    const fetchMock = mockEntriesApi()
    renderApp('/')

    await startDeletingRent()

    expect(wasSent(fetchMock, 'DELETE /entries/1')).toBe(false)
  })

  it('deletes the entry once the deletion is confirmed', async () => {
    const fetchMock = mockEntriesApi()
    renderApp('/')

    await deleteRent()

    expect(wasSent(fetchMock, 'DELETE /entries/1')).toBe(true)
  })

  it('removes the deleted entry from the list', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        () => jsonResponse([groceriesEntry]),
      ),
    })
    renderApp('/')

    await deleteRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('No entries yet.'),
    ).toBeInTheDocument()
  })

  it("updates the bucket's total after deleting an entry", async () => {
    mockEntriesApi({
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryOfSavedEntries),
        () => jsonResponse(summaryOfStartedMonth({ guilt_free: '45.50' })),
      ),
    })
    renderApp('/')

    await deleteRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('€0.00 of €1,500.00'),
    ).toBeInTheDocument()
  })

  it('removes the deleted entry even when reloading the entries fails', async () => {
    mockEntriesApi({
      'GET /months/2026/9/entries': inSequence(
        () => jsonResponse([groceriesEntry, rentEntry]),
        respondWithServerError,
      ),
    })
    renderApp('/')

    await deleteRent()

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('No entries yet.'),
    ).toBeInTheDocument()
  })

  it('keeps the entry when the deletion is cancelled', async () => {
    mockEntriesApi()
    renderApp('/')
    await startDeletingRent()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(within(await bucketSection('Fixed Costs')).getByText('Rent')).toBeInTheDocument()
  })

  it('explains that deleting the entry failed', async () => {
    mockEntriesApi({ 'DELETE /entries/1': respondWithServerError })
    renderApp('/')

    await deleteRent()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't delete the entry. Please try again.",
    )
  })

  it("updates the buckets' targets after the income is saved", async () => {
    mockEntriesApi({
      'PATCH /months/2026/9': () => jsonResponse(updatedSeptember2026),
      'GET /months/2026/9/summary': inSequence(
        () => jsonResponse(summaryOfSavedEntries),
        () =>
          jsonResponse(
            summaryOfStartedMonth({ fixed_costs: '1200.00', guilt_free: '45.50' }, '3500.00'),
          ),
      ),
    })
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit income' }))
    await replaceText(screen.getByLabelText('Income'), '3500')

    await userEvent.click(screen.getByRole('button', { name: 'Save income' }))

    expect(
      await within(await bucketSection('Fixed Costs')).findByText('€1,200.00 of €1,750.00'),
    ).toBeInTheDocument()
  })
})
