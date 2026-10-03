import { ApiError, NETWORK_ERROR_MESSAGE } from '@/lib/api'

const RATE_LIMITED_MESSAGE = 'Too many attempts. Please wait a few minutes and try again.'
const SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again.'

/** A message for the user explaining why asking for a sign-in link failed. */
export function signInLinkRequestErrorMessage(error: Error): string {
  if (!(error instanceof ApiError)) return SERVER_ERROR_MESSAGE
  switch (error.code) {
    case 'rate_limited':
      return RATE_LIMITED_MESSAGE
    case 'validation_failed':
      return 'Please enter a valid email address.'
    case 'network_error':
      return NETWORK_ERROR_MESSAGE
    default:
      return SERVER_ERROR_MESSAGE
  }
}

/** A message for the user explaining why signing in with a link failed. */
export function signInWithLinkErrorMessage(error: Error): string {
  if (!(error instanceof ApiError)) return SERVER_ERROR_MESSAGE
  switch (error.code) {
    // A token that isn't even well formed is a broken link, so it's explained the same way.
    case 'magic_link_invalid':
    case 'validation_failed':
      return 'This sign-in link is invalid, has expired or has already been used.'
    case 'rate_limited':
      return RATE_LIMITED_MESSAGE
    case 'network_error':
      return NETWORK_ERROR_MESSAGE
    default:
      return SERVER_ERROR_MESSAGE
  }
}

/**
 * Whether the link may still sign the user in after `error`. The backend only uses a link up
 * once it has passed the rate limit and found the token, so only a rejected token is final.
 */
export function isSignInLinkStillUsable(error: Error): boolean {
  return !(
    error instanceof ApiError &&
    (error.code === 'magic_link_invalid' || error.code === 'validation_failed')
  )
}
