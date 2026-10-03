import {
  isSignInLinkStillUsable,
  signInLinkRequestErrorMessage,
  signInWithLinkErrorMessage,
} from '@/auth/sign-in-link-errors'
import { ApiError } from '@/lib/api'

const rateLimitedError = new ApiError({
  status: 429,
  code: 'rate_limited',
  message: 'Too many requests. Please try again later.',
})
const invalidRequestError = new ApiError({
  status: 422,
  code: 'validation_failed',
  message: 'Some fields are invalid.',
})
const serverError = new ApiError({
  status: 500,
  code: 'internal_error',
  message: 'Something went wrong. Please try again.',
})
const networkError = new ApiError({
  status: 0,
  code: 'network_error',
  message: "Couldn't reach the server. Check your connection and try again.",
})
const invalidLinkError = new ApiError({
  status: 401,
  code: 'magic_link_invalid',
  message: 'This sign-in link is invalid, expired or already used.',
})
const browserError = new TypeError('Something broke')

describe('signInLinkRequestErrorMessage', () => {
  it.each([
    {
      id: 'too many requests',
      error: rateLimitedError,
      expectedMessage: 'Too many attempts. Please wait a few minutes and try again.',
    },
    {
      id: 'an invalid email',
      error: invalidRequestError,
      expectedMessage: 'Please enter a valid email address.',
    },
    {
      id: 'an unreachable server',
      error: networkError,
      expectedMessage: "Couldn't reach the server. Check your connection and try again.",
    },
    {
      id: 'a server error',
      error: serverError,
      expectedMessage: 'Something went wrong on our side. Please try again.',
    },
    {
      id: 'an error outside the API',
      error: browserError,
      expectedMessage: 'Something went wrong on our side. Please try again.',
    },
  ])('explains $id', ({ error, expectedMessage }) => {
    expect(signInLinkRequestErrorMessage(error)).toBe(expectedMessage)
  })
})

describe('signInWithLinkErrorMessage', () => {
  it.each([
    {
      id: 'an invalid, expired or used link',
      error: invalidLinkError,
      expectedMessage: 'This sign-in link is invalid, has expired or has already been used.',
    },
    {
      id: 'a malformed token',
      error: invalidRequestError,
      expectedMessage: 'This sign-in link is invalid, has expired or has already been used.',
    },
    {
      id: 'too many attempts',
      error: rateLimitedError,
      expectedMessage: 'Too many attempts. Please wait a few minutes and try again.',
    },
    {
      id: 'an unreachable server',
      error: networkError,
      expectedMessage: "Couldn't reach the server. Check your connection and try again.",
    },
    {
      id: 'a server error',
      error: serverError,
      expectedMessage: 'Something went wrong on our side. Please try again.',
    },
    {
      id: 'an error outside the API',
      error: browserError,
      expectedMessage: 'Something went wrong on our side. Please try again.',
    },
  ])('explains $id', ({ error, expectedMessage }) => {
    expect(signInWithLinkErrorMessage(error)).toBe(expectedMessage)
  })
})

describe('isSignInLinkStillUsable', () => {
  it.each([
    { id: 'an invalid, expired or used link', error: invalidLinkError },
    { id: 'a malformed token', error: invalidRequestError },
  ])('treats the link as used up after $id', ({ error }) => {
    expect(isSignInLinkStillUsable(error)).toBe(false)
  })

  it.each([
    { id: 'too many attempts', error: rateLimitedError },
    { id: 'an unreachable server', error: networkError },
    { id: 'a server error', error: serverError },
    { id: 'an error outside the API', error: browserError },
  ])('keeps the link usable after $id', ({ error }) => {
    expect(isSignInLinkStillUsable(error)).toBe(true)
  })
})
