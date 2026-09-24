import { ApiError } from '@/lib/api'

export const PASSKEYS_UNSUPPORTED_MESSAGE =
  "This browser doesn't support passkeys. Try an up-to-date version of Chrome, Safari, Firefox or Edge."

/** A message for the user explaining why registering or signing in with a passkey failed. */
export function passkeyErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'An account with this email already exists. Sign in instead.'
    if (error.status === 401) return "We couldn't verify your passkey. Please try again."
    if (error.status === 422) return 'Please enter a valid email address.'
    return 'Something went wrong on our side. Please try again.'
  }
  // Browsers raise NotAllowedError, deliberately vague, when the user closes the passkey prompt,
  // it times out, or they have no passkey for this site. @simplewebauthn/browser keeps the name.
  if (error.name === 'NotAllowedError') {
    return 'The passkey prompt was cancelled or timed out. Please try again.'
  }
  return "Your passkey couldn't be used. Please try again."
}
