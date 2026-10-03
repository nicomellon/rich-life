import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { addPasskey, signInWithLink } from '@/auth/auth-api'
import { useAuth, useCurrentUser } from '@/auth/auth-context'
import { passkeyErrorMessage } from '@/auth/passkey-errors'
import { isSignInLinkStillUsable, signInWithLinkErrorMessage } from '@/auth/sign-in-link-errors'
import { Button } from '@/components/ui/button'
import { showSavedToast } from '@/lib/save-toasts'

const INCOMPLETE_LINK_MESSAGE =
  'This sign-in link is incomplete. Copy the whole link from the email, or ask for a new one.'

/** Where signing in with the link has got to. */
type LinkSignIn =
  | { status: 'pending' }
  | { status: 'signed-in' }
  | {
      status: 'failed'
      message: string
      /** Whether the link may still work, so trying it again makes sense. */
      retryable: boolean
    }

/**
 * The token in an emailed sign-in link, e.g. `/sign-in/link#token=...`, or null if the link has
 * none. The backend puts it in the fragment, which browsers never send to a server.
 */
function signInLinkToken(locationHash: string): string | null {
  return new URLSearchParams(locationHash.replace(/^#/, '')).get('token') || null
}

/**
 * Where an emailed sign-in link lands: it signs the user in with the link's token, then offers to
 * add a passkey on this device so they won't need a link next time.
 */
export function SignInLinkPage() {
  const { isSignedIn, signIn } = useAuth()
  const currentUserQuery = useCurrentUser()
  const { hash } = useLocation()
  const [linkToken] = useState(() => signInLinkToken(hash))
  const [linkSignIn, setLinkSignIn] = useState<LinkSignIn>(() =>
    linkToken === null
      ? { status: 'failed', message: INCOMPLETE_LINK_MESSAGE, retryable: false }
      : { status: 'pending' },
  )
  // A user who is already signed in keeps their session and leaves the link unused, since an
  // expired link would sign them out. Their stored access token is checked first: if the API
  // rejects it, it's cleared, and the link signs them in as it would anyone signed out.
  const shouldRedeemLink = linkSignIn.status === 'pending' && !isSignedIn
  // The link works once, so it's redeemed once even when React runs the effect twice.
  const hasRedeemedLinkRef = useRef(false)

  useEffect(() => {
    if (!shouldRedeemLink || linkToken === null || hasRedeemedLinkRef.current) return
    hasRedeemedLinkRef.current = true
    signInWithLink(linkToken).then(
      (accessToken) => {
        signIn(accessToken)
        setLinkSignIn({ status: 'signed-in' })
      },
      (signInError: Error) =>
        setLinkSignIn({
          status: 'failed',
          message: signInWithLinkErrorMessage(signInError),
          retryable: isSignInLinkStillUsable(signInError),
        }),
    )
  }, [shouldRedeemLink, linkToken, signIn])

  if (linkSignIn.status === 'pending') {
    // RequireAuth handles an account that fails to load for any other reason.
    if (!shouldRedeemLink && !currentUserQuery.isPending) return <Navigate to="/" replace />
    return <p className="text-center text-muted-foreground">Signing you in…</p>
  }
  if (linkSignIn.status === 'failed') {
    const retryLink = () => {
      hasRedeemedLinkRef.current = false
      setLinkSignIn({ status: 'pending' })
    }
    return (
      <SignInLinkFailed
        message={linkSignIn.message}
        onRetry={linkSignIn.retryable ? retryLink : undefined}
      />
    )
  }
  // Signed out since, e.g. in another tab: adding a passkey needs a signed-in account.
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  if (!browserSupportsWebAuthn()) return <Navigate to="/" replace />
  return <AddPasskeyOffer />
}

interface SignInLinkFailedProps {
  message: string
  /** Tries the same link again; left out when the link can't work. */
  onRetry?: () => void
}

function SignInLinkFailed({ message, onRetry }: SignInLinkFailedProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Couldn't sign you in</h1>
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      </div>
      <div className="space-y-2">
        {onRetry && (
          <Button className="w-full" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button asChild variant={onRetry ? 'outline' : 'default'} className="w-full">
          <Link to="/sign-in/email">Email me a new link</Link>
        </Button>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/sign-in" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </section>
  )
}

/** Offers a user who signed in by link to add a passkey on this device. */
function AddPasskeyOffer() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const addPasskeyMutation = useMutation({
    mutationFn: addPasskey,
    onSuccess: (freshAccessToken) => {
      signIn(freshAccessToken)
      showSavedToast('Passkey added')
      void navigate('/', { replace: true })
    },
  })

  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">You're signed in</h1>
        <p className="text-sm text-muted-foreground">
          Add a passkey on this device to sign in with your fingerprint, face or PIN next time,
          without waiting for an email.
        </p>
      </div>
      {addPasskeyMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {passkeyErrorMessage(addPasskeyMutation.error)}
        </p>
      )}
      <div className="space-y-2">
        <Button
          className="w-full"
          disabled={addPasskeyMutation.isPending}
          onClick={() => addPasskeyMutation.mutate()}
        >
          <KeyRound />
          {addPasskeyMutation.isPending ? 'Waiting for your passkey…' : 'Add a passkey'}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={addPasskeyMutation.isPending}
          onClick={() => void navigate('/', { replace: true })}
        >
          Not now
        </Button>
      </div>
    </section>
  )
}
