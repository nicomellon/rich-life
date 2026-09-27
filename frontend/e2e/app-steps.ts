import { expect, type Page } from '@playwright/test'

/** A bucket's label in the UI, in display order. */
export type BucketLabel = 'Fixed Costs' | 'Investments' | 'Savings' | 'Guilt-Free Spending'

/** An entry as the user types it into the add form. */
export interface TypedEntry {
  bucket: BucketLabel
  typedAmount: string
  description: string
}

/** Mid-month, in the UTC time zone the config pins, so no time zone moves it to another month. */
export const PINNED_BROWSER_TIME = new Date('2026-09-15T12:00:00Z')

/** Registers a new account with a passkey and returns its email. */
export async function registerWithPasskey(page: Page): Promise<string> {
  const registeredEmail = `e2e-${crypto.randomUUID()}@example.com`
  await page.goto('/register')
  await page.getByLabel('Email').fill(registeredEmail)
  await page.getByRole('button', { name: 'Create a passkey' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  return registeredEmail
}

export async function openPage(page: Page, linkName: 'Dashboard' | 'Spending plan') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: linkName }).click()
  await expect(page.getByRole('heading', { name: linkName, level: 1 })).toBeVisible()
}

export async function setSpendingPlan(
  page: Page,
  typedPlanPercentages: Record<BucketLabel, string>,
) {
  await openPage(page, 'Spending plan')
  for (const [bucket, typedPercentage] of Object.entries(typedPlanPercentages)) {
    await page.getByLabel(bucket, { exact: true }).fill(typedPercentage)
  }
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText('Spending plan saved', { exact: true })).toBeVisible()
}

export async function startCurrentMonth(page: Page, typedMonthIncome: string) {
  await openPage(page, 'Dashboard')
  // Exact, as the plan page also has a "Monthly income (optional)" field.
  await page.getByLabel('Income', { exact: true }).fill(typedMonthIncome)
  await page.getByRole('button', { name: 'Start this month' }).click()
  await expect(page.getByRole('button', { name: 'Edit income' })).toBeVisible()
}

export async function addEntry(page: Page, typedEntry: TypedEntry) {
  const addEntryForm = page.getByRole('form', { name: 'Add an entry' })
  await addEntryForm.getByLabel('Amount').fill(typedEntry.typedAmount)
  await addEntryForm.getByLabel('Bucket').selectOption({ label: typedEntry.bucket })
  await addEntryForm.getByLabel('Description (optional)').fill(typedEntry.description)
  await addEntryForm.getByRole('button', { name: 'Add entry' }).click()
  const bucketEntries = page.getByRole('region', { name: typedEntry.bucket })
  await expect(bucketEntries.getByText(typedEntry.description, { exact: true })).toBeVisible()
}
