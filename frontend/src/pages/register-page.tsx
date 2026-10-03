import { zodResolver } from '@hookform/resolvers/zod'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router'
import { registerWithPasskey } from '@/auth/auth-api'
import { useAuth } from '@/auth/auth-context'
import { PASSKEYS_UNSUPPORTED_MESSAGE, passkeyErrorMessage } from '@/auth/passkey-errors'
import {
  REGISTER_FORM_FIELDS,
  registerSchema,
  type TypedRegistration,
  type ValidRegistration,
} from '@/auth/register-schema'
import { FormFieldError } from '@/components/form-field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formFieldErrors, invalidFieldProps, showServerFieldErrors } from '@/lib/form-errors'

export function RegisterPage() {
  const { signIn } = useAuth()
  const { state: redirectState } = useLocation()
  const passkeysSupported = browserSupportsWebAuthn()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TypedRegistration, unknown, ValidRegistration>({
    resolver: zodResolver(registerSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  })
  const registerMutation = useMutation({
    mutationFn: registerWithPasskey,
    onSuccess: signIn,
    onError: (registerError) =>
      showServerFieldErrors(registerError, REGISTER_FORM_FIELDS, setError),
  })
  // A failure the API pinned on the email shows under it instead.
  const showsRegisterAlert =
    registerMutation.isError &&
    formFieldErrors(registerMutation.error, REGISTER_FORM_FIELDS) === null
  const emailErrorMessage = errors.email?.message

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
      {showsRegisterAlert && (
        <p role="alert" className="text-sm text-destructive">
          {passkeyErrorMessage(registerMutation.error)}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(submitEvent) =>
          void handleSubmit(({ email }) => registerMutation.mutate(email))(submitEvent)
        }
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            {...invalidFieldProps('register-email-error', emailErrorMessage)}
            {...register('email')}
          />
          <FormFieldError id="register-email-error" message={emailErrorMessage} />
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
