import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth, useCurrentUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'

/** Router state that tells the sign-in and register pages where to go once the user is in. */
interface SignInRedirectState {
  from: string
}

function isSignInRedirectState(locationState: unknown): locationState is SignInRedirectState {
  return (
    typeof locationState === 'object' &&
    locationState !== null &&
    'from' in locationState &&
    typeof locationState.from === 'string'
  )
}

function pageAfterSignIn(locationState: unknown): string {
  return isSignInRedirectState(locationState) ? locationState.from : '/'
}

/** Renders its child routes for a signed-in user, and sends anyone else to the sign-in page. */
export function RequireAuth() {
  const { isSignedIn, signOut } = useAuth()
  const currentUserQuery = useCurrentUser()
  const location = useLocation()

  if (!isSignedIn) {
    const redirectState: SignInRedirectState = {
      from: `${location.pathname}${location.search}${location.hash}`,
    }
    return <Navigate to="/sign-in" replace state={redirectState} />
  }
  if (currentUserQuery.isPending) {
    return <p className="p-8 text-center text-muted-foreground">Loading…</p>
  }
  if (currentUserQuery.isError) {
    return (
      <div role="alert" className="mx-auto max-w-sm space-y-4 p-8 text-center">
        <p>We couldn't load your account. Please try again.</p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => void currentUserQuery.refetch()}>Try again</Button>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }
  return <Outlet />
}

/**
 * Renders its child routes (sign in, register) for a signed-out user. Once the user signs in, it
 * takes them to the page they first asked for, or the dashboard.
 */
export function RequireSignedOut() {
  const { isSignedIn } = useAuth()
  const location = useLocation()

  if (isSignedIn) return <Navigate to={pageAfterSignIn(location.state)} replace />
  return <Outlet />
}
