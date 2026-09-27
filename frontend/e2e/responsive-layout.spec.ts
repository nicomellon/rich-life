import { expect, test, type Page } from '@playwright/test'
import {
  addEntry,
  openPage,
  PINNED_BROWSER_TIME,
  registerWithPasskey,
  setSpendingPlan,
  startCurrentMonth,
  type TypedEntry,
} from './app-steps'
import { addVirtualAuthenticator } from './virtual-authenticator'

/** A small phone, the narrowest screen the app supports. */
const PHONE_VIEWPORT = { width: 375, height: 667 }
/** The narrowest width that shows the email, e.g. a phone in landscape. */
const SMALL_TABLET_VIEWPORT = { width: 640, height: 480 }
const LAPTOP_VIEWPORT = { width: 1024, height: 768 }

const longestEntryDescription = 'Concert tickets for the whole family and a dinner before the show'

// Long enough to need wrapping or truncating at phone width.
const typedEntries: TypedEntry[] = [
  { bucket: 'Fixed Costs', typedAmount: '1234567.89', description: 'Rent for the flat on Main St' },
  { bucket: 'Guilt-Free Spending', typedAmount: '400', description: longestEntryDescription },
]

interface PageWidths {
  scrollWidth: number
  clientWidth: number
}

/** The page's content width, and the width of the viewport showing it. */
async function measurePageWidths(page: Page): Promise<PageWidths> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

/** Passes when the page doesn't scroll sideways. */
async function expectNoHorizontalScroll(page: Page) {
  const pageWidths = await measurePageWidths(page)

  expect(pageWidths.scrollWidth).toBeLessThanOrEqual(pageWidths.clientWidth)
}

test.describe('signed-out pages at phone width', () => {
  test.use({ viewport: PHONE_VIEWPORT })

  test('sign-in page has no horizontal scroll', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    await expectNoHorizontalScroll(page)
  })

  test('register page has no horizontal scroll', async ({ page }) => {
    await page.goto('/register')
    await expect(page.getByRole('heading', { name: 'Create an account' })).toBeVisible()

    await expectNoHorizontalScroll(page)
  })
})

test.describe('signed-in pages', () => {
  // One account is set up once, in one page, and each test checks one screen of it.
  test.describe.configure({ mode: 'serial' })

  let signedInPage: Page
  let registeredEmail: string

  test.beforeAll(async ({ browser }) => {
    signedInPage = await browser.newPage({ viewport: PHONE_VIEWPORT })
    await signedInPage.clock.setFixedTime(PINNED_BROWSER_TIME)
    await addVirtualAuthenticator(signedInPage)
    registeredEmail = await registerWithPasskey(signedInPage)
    await setSpendingPlan(signedInPage, {
      'Fixed Costs': '50',
      Investments: '10',
      Savings: '15',
      'Guilt-Free Spending': '25',
    })
    await startCurrentMonth(signedInPage, '3000')

    for (const typedEntry of typedEntries) await addEntry(signedInPage, typedEntry)
  })

  test.beforeEach(async () => {
    await signedInPage.setViewportSize(PHONE_VIEWPORT)
    // A fresh load, so no form a previous test opened stays open.
    await signedInPage.goto('/')
    await expect(signedInPage.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  })

  test.afterAll(async () => {
    await signedInPage.close()
  })

  test('dashboard with entries has no horizontal scroll at phone width', async () => {
    await expect(signedInPage.getByRole('figure')).toBeVisible()
    // The longest entry, so the rows are measured rather than the loading state.
    await expect(signedInPage.getByText(longestEntryDescription, { exact: true })).toBeVisible()

    await expectNoHorizontalScroll(signedInPage)
  })

  test('dashboard with an entry being edited has no horizontal scroll at phone width', async () => {
    await signedInPage.getByRole('button', { name: 'Edit Rent for the flat on Main St' }).click()
    await expect(
      signedInPage.getByRole('form', { name: 'Edit Rent for the flat on Main St' }),
    ).toBeVisible()

    await expectNoHorizontalScroll(signedInPage)
  })

  test("dashboard adjusting this month's plan has no horizontal scroll at phone width", async () => {
    await signedInPage.getByRole('button', { name: "Adjust this month's plan" }).click()
    await expect(signedInPage.getByRole('heading', { name: "This month's plan" })).toBeVisible()

    await expectNoHorizontalScroll(signedInPage)
  })

  test('dashboard of a month not started has no horizontal scroll at phone width', async () => {
    await signedInPage.getByRole('button', { name: 'Next month' }).click()
    await expect(signedInPage.getByRole('button', { name: 'Start this month' })).toBeVisible()

    await expectNoHorizontalScroll(signedInPage)
  })

  test('spending plan page has no horizontal scroll at phone width', async () => {
    await openPage(signedInPage, 'Spending plan')
    await signedInPage.getByLabel('Monthly income (optional)').fill('1234567.89')

    await expectNoHorizontalScroll(signedInPage)
  })

  test('header at phone width shows the app and page links', async () => {
    const header = signedInPage.getByRole('banner')

    await expect(header.getByRole('link').filter({ visible: true })).toHaveText([
      'Rich Life',
      'Dashboard',
      'Spending plan',
    ])
  })

  test("header at phone width hides the user's email", async () => {
    await expect(signedInPage.getByRole('banner').getByText(registeredEmail)).toBeHidden()
  })

  test("header at phone width hides the sign-out button's text", async () => {
    const signOutButton = signedInPage.getByRole('banner').getByRole('button', { name: 'Sign out' })

    await expect(signOutButton.getByText('Sign out')).toBeHidden()
  })

  // The e2e emails are about 50 characters long, which the header must fit.
  test('dashboard at the narrowest width showing the email has no horizontal scroll', async () => {
    await signedInPage.setViewportSize(SMALL_TABLET_VIEWPORT)
    await expect(signedInPage.getByText(registeredEmail)).toBeVisible()

    await expectNoHorizontalScroll(signedInPage)
  })

  test("header at laptop width shows the user's email", async () => {
    await signedInPage.setViewportSize(LAPTOP_VIEWPORT)

    await expect(signedInPage.getByRole('banner').getByText(registeredEmail)).toBeVisible()
  })

  test("header at laptop width shows the sign-out button's text", async () => {
    await signedInPage.setViewportSize(LAPTOP_VIEWPORT)
    const signOutButton = signedInPage.getByRole('banner').getByRole('button', { name: 'Sign out' })

    await expect(signOutButton.getByText('Sign out')).toBeVisible()
  })
})
