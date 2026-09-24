import { useQuery } from '@tanstack/react-query'
import { createContext, useContext } from 'react'
import { currentUserQueryKey, fetchCurrentUser, type AccessToken } from '@/auth/auth-api'

export interface AuthContextValue {
  /** Whether there is an access token. The signed-in user may still be loading. */
  isSignedIn: boolean
  signIn: (accessToken: AccessToken) => void
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside an AuthProvider')
  return auth
}

/** The signed-in user (`GET /auth/me`). The query only runs while signed in. */
export function useCurrentUser() {
  const { isSignedIn } = useAuth()
  return useQuery({ queryKey: currentUserQueryKey, queryFn: fetchCurrentUser, enabled: isSignedIn })
}
