import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { signInWithPasskey } from '@/auth/auth-api'
import { useAuth } from '@/auth/auth-context'
import { PASSKEYS_UNSUPPORTED_MESSAGE, passkeyErrorMessage } from '@/auth/passkey-errors'
import { Button } from '@/components/ui/button'

export function SignInPage() {
  const { signIn } = useAuth()
  // Passed on to the register page, so a new user also lands where they were headed.
  const { state: redirectState } = useLocation()
  const passkeysSupported = browserSupportsWebAuthn()
  const signInMutation = useMutation({ mutationFn: signInWithPasskey, onSuccess: signIn })

  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Use the passkey on this device, your phone or your password manager.
        </p>
      </div>
      {!passkeysSupported && (
        <p role="alert" className="text-sm text-destructive">
          {PASSKEYS_UNSUPPORTED_MESSAGE}
        </p>
      )}
      {signInMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {passkeyErrorMessage(signInMutation.error)}
        </p>
      )}
      <Button
        className="w-full"
        disabled={!passkeysSupported || signInMutation.isPending}
        onClick={() => signInMutation.mutate()}
      >
        <KeyRound />
        {signInMutation.isPending ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New to Rich Life?{' '}
        <Link to="/register" state={redirectState} className="text-foreground underline">
          Create an account
        </Link>
      </p>
    </section>
  )
}
