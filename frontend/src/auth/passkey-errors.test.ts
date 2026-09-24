import { passkeyErrorMessage } from '@/auth/passkey-errors'
import { ApiError } from '@/lib/api'

describe('passkeyErrorMessage', () => {
  it.each([
    [
      'a registered email',
      new ApiError(409, 'Email already registered'),
      'An account with this email already exists. Sign in instead.',
    ],
    [
      'a rejected passkey',
      new ApiError(401, 'Passkey verification failed'),
      "We couldn't verify your passkey. Please try again.",
    ],
    ['an invalid email', new ApiError(422, []), 'Please enter a valid email address.'],
    [
      'a server error',
      new ApiError(500, 'Internal Server Error'),
      'Something went wrong on our side. Please try again.',
    ],
    [
      'a cancelled prompt',
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
      'The passkey prompt was cancelled or timed out. Please try again.',
    ],
    [
      'any other browser error',
      new DOMException('The authenticator failed.', 'UnknownError'),
      "Your passkey couldn't be used. Please try again.",
    ],
  ])('explains %s', (_scenario, error, expectedMessage) => {
    expect(passkeyErrorMessage(error)).toBe(expectedMessage)
  })
})
