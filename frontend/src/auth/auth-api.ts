import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { api } from '@/lib/api'

/** The backend's `Token` schema. */
export interface AccessToken {
  access_token: string
  token_type: 'bearer'
}

/** The backend's `UserRead` schema. */
export interface User {
  id: number
  email: string
  /** ISO 4217 code, e.g. EUR. */
  currency: string
  created_at: string
}

export const currentUserQueryKey = ['auth', 'me'] as const

export function fetchCurrentUser(): Promise<User> {
  return api.get<User>('/auth/me')
}

/**
 * Creates an account for `email` with a new passkey: the backend issues creation options, the
 * browser asks the user to create the passkey, and the backend verifies it and signs them in.
 */
export async function registerWithPasskey(email: string): Promise<AccessToken> {
  const registrationOptions = await api.post<PublicKeyCredentialCreationOptionsJSON>(
    '/auth/register-challenge',
    { email },
  )
  const newCredential = await startRegistration({ optionsJSON: registrationOptions })
  return api.post<AccessToken>('/auth/verify-registration', newCredential)
}

/**
 * Signs in with any passkey the browser holds for this site. The options name no credentials,
 * so the user picks one and never types their email.
 */
export async function signInWithPasskey(): Promise<AccessToken> {
  const signInOptions =
    await api.post<PublicKeyCredentialRequestOptionsJSON>('/auth/login-challenge')
  const assertion = await startAuthentication({ optionsJSON: signInOptions })
  return api.post<AccessToken>('/auth/verify-login', assertion)
}
