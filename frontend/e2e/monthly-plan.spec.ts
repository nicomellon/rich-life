import { expect, test, type Locator, type Page } from '@playwright/test'
import { addVirtualAuthenticator } from './virtual-authenticator'

/** A bucket's label in the UI, in display order. */
type BucketLabel = 'Fixed Costs' | 'Investments' | 'Savings' | 'Guilt-Free Spending'

/** An entry as the user types it into the add form. */
interface TypedEntry {
  bucket: BucketLabel
  typedAmount: string
  description: string
}

const typedPlanPercentages: Record<BucketLabel, string> = {
  'Fixed Costs': '40',
  Investments: '15',
  Savings: '25',
  'Guilt-Free Spending': '20',
}

/** Mid-month, in the UTC time zone the config pins, so no time zone moves it to another month. */
const PINNED_BROWSER_TIME = new Date('2026-09-15T12:00:00Z')

const typedMonthIncome = '3000'

const typedEntries: TypedEntry[] = [
  { bucket: 'Fixed Costs', typedAmount: '1200', description: 'Rent' },
  { bucket: 'Investments', typedAmount: '300', description: 'ETF' },
  { bucket: 'Savings', typedAmount: '600', description: 'Emergency fund' },
  { bucket: 'Guilt-Free Spending', typedAmount: '400', description: 'Concert tickets' },
]

async function registerWithPasskey(page: Page) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(`e2e-${crypto.randomUUID()}@example.com`)
  await page.getByRole('button', { name: 'Create a passkey' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

async function setSpendingPlan(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Spending plan' })
    .click()
  for (const [bucket, typedPercentage] of Object.entries(typedPlanPercentages)) {
    await page.getByLabel(bucket, { exact: true }).fill(typedPercentage)
  }
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Your spending plan is saved.' }),
  ).toBeVisible()
}

async function startCurrentMonth(page: Page) {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Dashboard' })
    .click()
  // Exact, as the plan page also has a "Monthly income (optional)" field.
  await page.getByLabel('Income', { exact: true }).fill(typedMonthIncome)
  await page.getByRole('button', { name: 'Start this month' }).click()
  await expect(page.getByRole('button', { name: 'Edit income' })).toBeVisible()
}

async function addEntry(page: Page, typedEntry: TypedEntry) {
  const addEntryForm = page.getByRole('form', { name: 'Add an entry' })
  await addEntryForm.getByLabel('Amount').fill(typedEntry.typedAmount)
  await addEntryForm.getByLabel('Bucket').selectOption({ label: typedEntry.bucket })
  await addEntryForm.getByLabel('Description (optional)').fill(typedEntry.description)
  await addEntryForm.getByRole('button', { name: 'Add entry' }).click()
  const bucketEntries = page.getByRole('region', { name: typedEntry.bucket })
  await expect(bucketEntries.getByText(typedEntry.description, { exact: true })).toBeVisible()
}

/** Each bucket card's target or actual amount, in display order. */
function bucketCardAmounts(page: Page, term: 'Target' | 'Actual'): Locator {
  return page
    .getByRole('article')
    .locator('dl > div')
    .filter({ has: page.getByText(term, { exact: true }) })
    .locator('dd')
}

// The whole journey runs once, in one page, and each test checks one of the dashboard's numbers.
test.describe.configure({ mode: 'serial' })

test.describe('a month planned and tracked from registration', () => {
  let dashboardPage: Page

  test.beforeAll(async ({ browser }) => {
    dashboardPage = await browser.newPage()
    // The dashboard opens on the browser's current month and dates entries today, so a fixed
    // clock keeps the journey in one month even if it runs across midnight. The backend only
    // checks that entry dates fall in their month, never against its own clock.
    await dashboardPage.clock.setFixedTime(PINNED_BROWSER_TIME)
    await addVirtualAuthenticator(dashboardPage)
    await registerWithPasskey(dashboardPage)
    await setSpendingPlan(dashboardPage)
    await startCurrentMonth(dashboardPage)

    for (const typedEntry of typedEntries) await addEntry(dashboardPage, typedEntry)
  })

  test.afterAll(async () => {
    await dashboardPage.close()
  })

  test('dashboard shows bucket targets from the spending plan', async () => {
    await expect(bucketCardAmounts(dashboardPage, 'Target')).toHaveText([
      '€1,200.00 (40%)',
      '€450.00 (15%)',
      '€750.00 (25%)',
      '€600.00 (20%)',
    ])
  })

  test('dashboard shows bucket actuals adding up the entries', async () => {
    await expect(bucketCardAmounts(dashboardPage, 'Actual')).toHaveText([
      '€1,200.00 (40%)',
      '€300.00 (10%)',
      '€600.00 (20%)',
      '€400.00 (13.33%)',
    ])
  })

  test('dashboard shows the income left unallocated', async () => {
    const unallocatedTotal = dashboardPage.getByRole('group', { name: 'Unallocated' })

    await expect(unallocatedTotal.locator('p').last()).toHaveText('€500.00')
  })
})
