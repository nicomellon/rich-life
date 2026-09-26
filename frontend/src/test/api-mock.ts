import type { AccessToken, User } from '@/auth/auth-api'
import { setAccessToken } from '@/lib/auth-token'
import type { Month } from '@/months/months-api'
import type { SpendingPlanPercentages } from '@/spending-plan/spending-plan-api'

/** Builds the response to one request; a fresh one each time, since a body can be read once. */
export type ApiResponder = () => Response | Promise<Response>

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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

/** The JSON body the app sent with `request`, e.g. `'POST /auth/verify-login'`. */
export function sentJsonBody(fetchMock: ReturnType<typeof mockApi>, request: string): unknown {
  const [method, path] = request.split(' ')
  const sentRequest = fetchMock.mock.calls.find(
    ([input, init]) => init?.method === method && String(input) === `/api/v1${path}`,
  )
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
