import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { registerWithPasskey } from '@/auth/auth-api'
import { useAuth } from '@/auth/auth-context'
import { PASSKEYS_UNSUPPORTED_MESSAGE, passkeyErrorMessage } from '@/auth/passkey-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function RegisterPage() {
  const { signIn } = useAuth()
  const { state: redirectState } = useLocation()
  const [email, setEmail] = useState('')
  const passkeysSupported = browserSupportsWebAuthn()
  const registerMutation = useMutation({ mutationFn: registerWithPasskey, onSuccess: signIn })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    registerMutation.mutate(email)
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-muted-foreground">
          No password: you'll sign in with a passkey, unlocked by your fingerprint, face or PIN.
        </p>
      </div>
      {!passkeysSupported && (
        <p role="alert" className="text-sm text-destructive">
          {PASSKEYS_UNSUPPORTED_MESSAGE}
        </p>
      )}
      {registerMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {passkeyErrorMessage(registerMutation.error)}
        </p>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={!passkeysSupported || registerMutation.isPending}
        >
          {registerMutation.isPending ? 'Waiting for your passkey…' : 'Create a passkey'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/sign-in" state={redirectState} className="text-foreground underline">
          Sign in
        </Link>
      </p>
    </section>
  )
}
