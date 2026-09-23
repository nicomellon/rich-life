import { api, ApiError } from '@/lib/api'
import { setAccessToken } from '@/lib/auth-token'

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sentRequest(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls[0]!
  return { url, init: init!, headers: new Headers(init!.headers) }
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

  it('throws an ApiError with the status and FastAPI detail', async () => {
    mockFetch(jsonResponse({ detail: 'Email already registered' }, 409))

    const error = await api.post('/auth/register', {}).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, detail: 'Email already registered' })
    expect((error as ApiError).message).toBe('Email already registered')
  })
})
