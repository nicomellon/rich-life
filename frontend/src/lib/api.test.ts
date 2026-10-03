import { api, ApiError, type FieldError } from '@/lib/api'
import { getAccessToken, setAccessToken } from '@/lib/auth-token'
import { errorResponse, jsonResponse } from '@/test/api-mock'

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
}

function sentRequest(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls[0]!
  return { url, init: init!, headers: new Headers(init!.headers) }
}

/** The `ApiError` that `request` rejects with; fails the test if it resolves or rejects otherwise. */
async function apiErrorOf(request: Promise<unknown>): Promise<ApiError> {
  const rejection = await request.then(
    () => expect.fail('Expected the request to fail'),
    (error: unknown) => error,
  )
  if (!(rejection instanceof ApiError)) return expect.fail(`Expected an ApiError: ${rejection}`)
  return rejection
}

describe('api client', () => {
  it('calls the API under /api/v1 on the same origin and parses JSON', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 1 }))

    await expect(api.get('/buckets')).resolves.toEqual({ id: 1 })

    const { url, init } = sentRequest(fetchMock)
    expect(url).toBe('/api/v1/buckets')
    expect(init.method).toBe('GET')
  })

  it('attaches the access token when there is one', async () => {
    setAccessToken('secret-token')
    const fetchMock = mockFetch(jsonResponse({}))

    await api.get('/auth/me')

    expect(sentRequest(fetchMock).headers.get('Authorization')).toBe('Bearer secret-token')
  })

  it('sends no Authorization header when logged out', async () => {
    const fetchMock = mockFetch(jsonResponse({}))

    await api.get('/auth/me')

    expect(sentRequest(fetchMock).headers.has('Authorization')).toBe(false)
  })

  it('sends bodies as JSON', async () => {
    const fetchMock = mockFetch(jsonResponse({}, 201))

    await api.post('/months', { year: 2026, month: 9, income: '3000.00' })

    const { init, headers } = sentRequest(fetchMock)
    expect(init.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe('{"year":2026,"month":9,"income":"3000.00"}')
  })

  it('resolves with undefined for empty responses', async () => {
    mockFetch(new Response(null, { status: 204 }))

    await expect(api.delete('/entries/1')).resolves.toBeUndefined()
  })

  it('rejects with the status, code and message of an error response', async () => {
    mockFetch(errorResponse(409, 'month_already_exists', 'Month already exists'))

    const apiError = await apiErrorOf(api.post('/months', {}))

    expect(apiError).toMatchObject({
      status: 409,
      code: 'month_already_exists',
      message: 'Month already exists',
    })
  })

  it('rejects with the field errors of a validation error', async () => {
    const amountError: FieldError = { field: 'amount', message: 'Input should be greater than 0' }
    mockFetch(errorResponse(422, 'validation_failed', 'Some fields are invalid.', [amountError]))

    const apiError = await apiErrorOf(api.post('/months/2026/9/entries', {}))

    expect(apiError.fieldErrors).toEqual([amountError])
  })

  it('rejects with no field errors when the error response has none', async () => {
    mockFetch(errorResponse(409, 'month_already_exists', 'Month already exists'))

    const apiError = await apiErrorOf(api.post('/months', {}))

    expect(apiError.fieldErrors).toEqual([])
  })

  it('rejects with an unknown error when the error response is not JSON', async () => {
    mockFetch(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    const apiError = await apiErrorOf(api.get('/months'))

    expect(apiError).toMatchObject({
      status: 502,
      code: 'unknown_error',
      message: 'Something went wrong. Please try again.',
    })
  })

  it('rejects with an unknown error when the error response is not in the API format', async () => {
    mockFetch(jsonResponse({ detail: 'Internal Server Error' }, 500))

    const apiError = await apiErrorOf(api.get('/months'))

    expect(apiError).toMatchObject({
      status: 500,
      code: 'unknown_error',
      message: 'Something went wrong. Please try again.',
    })
  })

  it('rejects with an unknown error when the error response has a code the app does not know', async () => {
    mockFetch(jsonResponse({ detail: 'Payment required', code: 'payment_required' }, 402))

    const apiError = await apiErrorOf(api.get('/months'))

    expect(apiError).toMatchObject({
      status: 402,
      code: 'unknown_error',
      message: 'Something went wrong. Please try again.',
    })
  })

  it('rejects with a network error when the server cannot be reached', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    const apiError = await apiErrorOf(api.get('/months'))

    expect(apiError).toMatchObject({
      status: 0,
      code: 'network_error',
      message: "Couldn't reach the server. Check your connection and try again.",
    })
  })

  it('rejects with the serialisation error when the body cannot be sent as JSON', async () => {
    mockFetch(jsonResponse({}, 201))

    const postWithUnserialisableBody = api.post('/months', { income: 3000n })

    await expect(postWithUnserialisableBody).rejects.toThrow(TypeError)
  })

  it('forgets the access token when the API rejects it', async () => {
    setAccessToken('expired-token')
    mockFetch(errorResponse(401, 'not_authenticated', 'Not authenticated'))

    await api.get('/auth/me').catch(() => undefined)

    expect(getAccessToken()).toBeNull()
  })
})
