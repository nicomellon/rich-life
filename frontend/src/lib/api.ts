import { z } from 'zod'
import { clearAccessToken, getAccessToken } from '@/lib/auth-token'

// Same origin as the app: the dev server (vite.config.ts) or, in production, the web server
// serving the build passes /api through to the backend.
const API_PREFIX = '/api/v1'

/** One invalid value in a request, e.g. `{ field: 'amount', message: '...' }`. */
const fieldErrorSchema = z.object({ field: z.string(), message: z.string() })

export type FieldError = z.infer<typeof fieldErrorSchema>

/** The backend's `ErrorCode`: what went wrong, for the app to branch on. */
const errorCodeSchema = z.enum([
  'not_authenticated',
  'passkey_verification_failed',
  'magic_link_invalid',
  'rate_limited',
  'email_already_registered',
  'month_not_found',
  'entry_not_found',
  'month_already_exists',
  'validation_failed',
  'bad_request',
  'not_found',
  'method_not_allowed',
  'internal_error',
])

/** The backend's codes, plus ours for a response we can't read and for no response at all. */
export type ApiErrorCode = z.infer<typeof errorCodeSchema> | 'unknown_error' | 'network_error'

/** The body of every error response from the backend (`ErrorResponse`). */
const errorResponseSchema = z.object({
  detail: z.string(),
  code: errorCodeSchema,
  fields: z.array(fieldErrorSchema).optional(),
})

export type ErrorResponseBody = z.infer<typeof errorResponseSchema>

export const UNKNOWN_ERROR_MESSAGE = 'Something went wrong. Please try again.'
export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. Check your connection and try again."

interface ApiErrorFields {
  /** The HTTP status, or 0 when the request never got a response. */
  status: number
  code: ApiErrorCode
  /** The backend's `detail`: safe to show to the user as it is. */
  message: string
  fieldErrors?: FieldError[]
}

/** A failed API request: a non-2xx response, or no response at all. */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** The invalid values of a 422 response; empty for every other error. */
  readonly fieldErrors: FieldError[]

  constructor({ status, code, message, fieldErrors = [] }: ApiErrorFields) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
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

  // Outside the `try`, so a body that can't be serialised isn't reported as a network error.
  const requestBody = body === undefined ? undefined : JSON.stringify(body)
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, { ...init, headers, body: requestBody })
  } catch {
    throw new ApiError({ status: 0, code: 'network_error', message: NETWORK_ERROR_MESSAGE })
  }

  if (!response.ok) {
    // The token has expired or its account is gone. Forgetting it signs the user out, and the
    // route guards send them to the sign-in page.
    if (response.status === 401 && token) clearAccessToken()
    throw await readApiError(response)
  }
  return (await readBody(response)) as T
}

/**
 * The error a non-2xx response stands for, or an `unknown_error` when its body isn't in the
 * backend's format or has a code this app doesn't know.
 */
async function readApiError(response: Response): Promise<ApiError> {
  const parsedBody = errorResponseSchema.safeParse(await readBody(response).catch(() => undefined))
  if (!parsedBody.success) {
    return new ApiError({
      status: response.status,
      code: 'unknown_error',
      message: UNKNOWN_ERROR_MESSAGE,
    })
  }
  const { detail, code, fields = [] } = parsedBody.data
  return new ApiError({ status: response.status, code, message: detail, fieldErrors: fields })
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  const isJson = response.headers.get('Content-Type')?.includes('application/json')
  return isJson ? JSON.parse(text) : text
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
