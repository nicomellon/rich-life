import { ApiError, NETWORK_ERROR_MESSAGE } from '@/lib/api'

export const PASSKEYS_UNSUPPORTED_MESSAGE =
  "This browser doesn't support passkeys. Try an up-to-date version of Chrome, Safari, Firefox or Edge."

/** A message for the user explaining why registering or signing in with a passkey failed. */
export function passkeyErrorMessage(error: Error): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'email_already_registered':
        return 'An account with this email already exists. Sign in instead.'
      case 'passkey_verification_failed':
        return "We couldn't verify your passkey. Please try again."
      case 'validation_failed':
        return 'Please enter a valid email address.'
      case 'network_error':
        return NETWORK_ERROR_MESSAGE
      default:
        return 'Something went wrong on our side. Please try again.'
    }
  }
  // Browsers raise NotAllowedError, deliberately vague, when the user closes the passkey prompt,
  // it times out, or they have no passkey for this site. @simplewebauthn/browser keeps the name.
  if (error.name === 'NotAllowedError') {
    return 'The passkey prompt was cancelled or timed out. Please try again.'
  }
  return "Your passkey couldn't be used. Please try again."
}
