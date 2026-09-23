import { getAccessToken } from '@/lib/auth-token'

// Same origin as the app: the dev server (vite.config.ts) or, in production, the web server
// serving the build passes /api through to the backend.
const API_PREFIX = '/api/v1'

/** A non-2xx response from the API. `detail` is FastAPI's error payload when there is one. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : `API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & {
  /** Sent as JSON. */
  body?: unknown
}

/**
 * Calls the API at `path` (relative to /api/v1), attaching the access token when there is one.
 * Resolves with the parsed JSON body, or `undefined` for empty responses such as 204.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: initHeaders, ...init } = options
  const headers = new Headers(initHeaders)
  headers.set('Accept', 'application/json')

  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (body !== undefined) headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload = await readBody(response)
  if (!response.ok) {
    const detail = isObject(payload) && 'detail' in payload ? payload.detail : payload
    throw new ApiError(response.status, detail)
  }
  return payload as T
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  const isJson = response.headers.get('Content-Type')?.includes('application/json')
  return isJson ? JSON.parse(text) : text
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = void>(path: string, options?: RequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
}
