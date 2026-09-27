import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  addEntry,
  PINNED_BROWSER_TIME,
  registerWithPasskey,
  setSpendingPlan,
  startCurrentMonth,
  type BucketLabel,
  type TypedEntry,
} from './app-steps'
import { addVirtualAuthenticator } from './virtual-authenticator'

const typedPlanPercentages: Record<BucketLabel, string> = {
  'Fixed Costs': '40',
  Investments: '15',
  Savings: '25',
  'Guilt-Free Spending': '20',
}

const typedMonthIncome = '3000'

const typedEntries: TypedEntry[] = [
  { bucket: 'Fixed Costs', typedAmount: '1200', description: 'Rent' },
  { bucket: 'Investments', typedAmount: '300', description: 'ETF' },
  { bucket: 'Savings', typedAmount: '600', description: 'Emergency fund' },
  { bucket: 'Guilt-Free Spending', typedAmount: '400', description: 'Concert tickets' },
]

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
    await setSpendingPlan(dashboardPage, typedPlanPercentages)
    await startCurrentMonth(dashboardPage, typedMonthIncome)

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

    // Exact, so "-€500.00" doesn't match.
    await expect(unallocatedTotal.getByText('€500.00', { exact: true })).toBeVisible()
  })
})
