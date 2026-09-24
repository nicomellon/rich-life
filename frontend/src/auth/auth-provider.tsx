import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { AccessToken } from '@/auth/auth-api'
import { AuthContext, type AuthContextValue } from '@/auth/auth-context'
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeToAccessToken,
} from '@/lib/auth-token'

/**
 * Tracks whether the user is signed in. The access token in localStorage is the source of truth,
 * so a reload keeps the user signed in and signing out in one tab signs out all of them. Must sit
 * inside the QueryClientProvider.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const isSignedIn = useSyncExternalStore(subscribeToAccessToken, getAccessToken) !== null

  // Cached data belongs to whoever was signed in, so neither signing in nor signing out keeps it.
  const signIn = useCallback(
    (newAccessToken: AccessToken) => {
      queryClient.clear()
      setAccessToken(newAccessToken.access_token)
    },
    [queryClient],
  )
  const signOut = useCallback(() => {
    clearAccessToken()
    queryClient.clear()
  }, [queryClient])

  const auth = useMemo<AuthContextValue>(
    () => ({ isSignedIn, signIn, signOut }),
    [isSignedIn, signIn, signOut],
  )
  return <AuthContext value={auth}>{children}</AuthContext>
}
