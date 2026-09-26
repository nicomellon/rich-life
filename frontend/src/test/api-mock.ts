import type { AccessToken, User } from '@/auth/auth-api'
import type { Entry } from '@/entries/entries-api'
import { setAccessToken } from '@/lib/auth-token'
import type { Month } from '@/months/months-api'
import { BUCKETS, type Bucket } from '@/spending-plan/buckets'
import { percentageField, type SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'
import type { BucketStatus, BucketSummary, MonthSummary } from '@/summary/summary-api'

/** Builds the response to one request; a fresh one each time, since a body can be read once. */
export type ApiResponder = () => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Answers each request with the next responder, repeating the last one. */
export function inSequence(...responders: ApiResponder[]): ApiResponder {
  let requestCount = 0
  return () => {
    const respond = responders[Math.min(requestCount, responders.length - 1)]!
    requestCount += 1
    return respond()
  }
}

/**
 * Replaces `fetch` with a fake API. Keys are requests such as `'GET /auth/me'`, with paths
 * relative to /api/v1; any other request fails the test.
 */
export function mockApi(respondersByRequest: Record<string, ApiResponder>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = `${init?.method ?? 'GET'} ${String(input).replace(/^\/api\/v1/, '')}`
    const respond = respondersByRequest[request]
    if (!respond) throw new Error(`Unexpected API request: ${request}`)
    return respond()
  })
}

export function emptyResponse(): Response {
  return new Response(null, { status: 204 })
}

/** The `fetch` call that sent `request`, e.g. `'DELETE /entries/1'`, if the app sent it. */
function findSentRequest(fetchMock: ReturnType<typeof mockApi>, request: string) {
  const [method, path] = request.split(' ')
  return fetchMock.mock.calls.find(
    ([input, init]) => init?.method === method && String(input) === `/api/v1${path}`,
  )
}

/** Whether the app sent `request`, e.g. `'DELETE /entries/1'`. */
export function wasSent(fetchMock: ReturnType<typeof mockApi>, request: string): boolean {
  return findSentRequest(fetchMock, request) !== undefined
}

/** The JSON body the app sent with `request`, e.g. `'POST /auth/verify-login'`. */
export function sentJsonBody(fetchMock: ReturnType<typeof mockApi>, request: string): unknown {
  const sentRequest = findSentRequest(fetchMock, request)
  if (!sentRequest) throw new Error(`No ${request} request was sent`)
  return JSON.parse(String(sentRequest[1]?.body))
}

export const signedInUser: User = {
  id: 1,
  email: 'ada@example.com',
  currency: 'EUR',
  created_at: '2026-09-01T10:00:00Z',
}

/** The default plan every new user starts with. */
export const defaultSpendingPlan: SpendingPlanPercentages = {
  fixed_costs_pct: '50.00',
  investments_pct: '10.00',
  savings_pct: '20.00',
  guilt_free_pct: '20.00',
}

/** A month the user has started with the default plan, with an income of 3000. */
export const startedSeptember2026: Month = {
  year: 2026,
  month: 9,
  income: '3000.00',
  ...defaultSpendingPlan,
  created_at: '2026-09-01T10:00:00Z',
}

export const issuedAccessToken: AccessToken = { access_token: 'new-token', token_type: 'bearer' }

/** Starts the test signed in, as if the user had signed in before a reload. */
export function signInBeforeRender(): void {
  setAccessToken('stored-token')
}

/** September 2026's rent, in Fixed Costs. */
export const rentEntry: Entry = {
  id: 1,
  bucket: 'fixed_costs',
  amount: '1200.00',
  date: '2026-09-01',
  description: 'Rent',
  created_at: '2026-09-01T10:00:00Z',
}

/** A September 2026 grocery run, in Guilt-Free Spending. */
export const groceriesEntry: Entry = {
  id: 2,
  bucket: 'guilt_free',
  amount: '45.50',
  date: '2026-09-12',
  description: 'Groceries',
  created_at: '2026-09-12T18:00:00Z',
}

/** The backend's status: on track within 5% of the target amount either way. */
function bucketStatus(targetAmount: number, actualAmount: number): BucketStatus {
  const tolerance = targetAmount * 0.05
  if (actualAmount > targetAmount + tolerance) return 'over'
  if (actualAmount < targetAmount - tolerance) return 'under'
  return 'on_track'
}

/**
 * The summary of a month on the default plan, whose entries add up to `actualAmountsByBucket`
 * (0 for the buckets left out).
 */
export function summaryOfStartedMonth(
  actualAmountsByBucket: Partial<Record<Bucket, string>>,
  income = '3000.00',
): MonthSummary {
  const bucketSummaries = BUCKETS.map((bucket): BucketSummary => {
    const targetPercentage = defaultSpendingPlan[percentageField(bucket)]
    const targetAmount = (Number(income) * Number(targetPercentage)) / 100
    const actualAmount = Number(actualAmountsByBucket[bucket] ?? 0)
    return {
      bucket,
      target_pct: targetPercentage,
      target_amount: targetAmount.toFixed(2),
      actual_amount: actualAmount.toFixed(2),
      actual_pct: ((actualAmount / Number(income)) * 100).toFixed(2),
      remaining: (targetAmount - actualAmount).toFixed(2),
      status: bucketStatus(targetAmount, actualAmount),
    }
  })
  const totalActual = bucketSummaries.reduce(
    (total, bucketSummary) => total + Number(bucketSummary.actual_amount),
    0,
  )
  return {
    income,
    buckets: bucketSummaries,
    total_actual: totalActual.toFixed(2),
    unallocated: (Number(income) - totalActual).toFixed(2),
  }
}
