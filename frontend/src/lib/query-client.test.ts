import { ApiError, NETWORK_ERROR_MESSAGE } from '@/lib/api'
import { createQueryClient } from '@/lib/query-client'

/** Whether the app's query client retries a query whose first attempt failed with `error`. */
function retriesFirstFailure(error: Error): boolean {
  const retry = createQueryClient().getDefaultOptions().queries?.retry
  if (typeof retry !== 'function') return expect.fail('Expected a retry function')
  return retry(0, error)
}

describe('createQueryClient', () => {
  it('retries a query when the server could not be reached', () => {
    const networkError = new ApiError({
      status: 0,
      code: 'network_error',
      message: NETWORK_ERROR_MESSAGE,
    })

    expect(retriesFirstFailure(networkError)).toBe(true)
  })

  it('does not retry a query the API rejected as a client error', () => {
    const notFoundError = new ApiError({
      status: 404,
      code: 'month_not_found',
      message: 'Month not found',
    })

    expect(retriesFirstFailure(notFoundError)).toBe(false)
  })
})
