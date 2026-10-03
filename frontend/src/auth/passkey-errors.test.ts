import { passkeyErrorMessage } from '@/auth/passkey-errors'
import { ApiError } from '@/lib/api'

describe('passkeyErrorMessage', () => {
  it.each([
    [
      'a registered email',
      new ApiError({
        status: 409,
        code: 'email_already_registered',
        message: 'Email already registered',
      }),
      'An account with this email already exists. Sign in instead.',
    ],
    [
      'a rejected passkey',
      new ApiError({
        status: 401,
        code: 'passkey_verification_failed',
        message: 'Passkey verification failed',
      }),
      "We couldn't verify your passkey. Please try again.",
    ],
    [
      'an invalid email',
      new ApiError({
        status: 422,
        code: 'validation_failed',
        message: 'Some fields are invalid.',
        fieldErrors: [{ field: 'email', message: 'value is not a valid email address' }],
      }),
      'Please enter a valid email address.',
    ],
    [
      'a server error',
      new ApiError({
        status: 500,
        code: 'internal_error',
        message: 'Something went wrong. Please try again.',
      }),
      'Something went wrong on our side. Please try again.',
    ],
    [
      'an unreachable server',
      new ApiError({
        status: 0,
        code: 'network_error',
        message: "Couldn't reach the server. Check your connection and try again.",
      }),
      "Couldn't reach the server. Check your connection and try again.",
    ],
    [
      'a cancelled prompt',
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
      'The passkey prompt was cancelled or timed out. Please try again.',
    ],
    [
      'a passkey this device already has',
      new DOMException('The authenticator was previously registered.', 'InvalidStateError'),
      'This device already has a passkey for your account. You can sign in with it next time.',
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
