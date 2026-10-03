import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { requestSignInLink } from '@/auth/auth-api'
import { signInLinkRequestErrorMessage } from '@/auth/sign-in-link-errors'
import {
  SIGN_IN_LINK_REQUEST_FORM_FIELDS,
  signInLinkRequestSchema,
  type TypedSignInLinkRequest,
  type ValidSignInLinkRequest,
} from '@/auth/sign-in-link-schema'
import { FormFieldError } from '@/components/form-field-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formFieldErrors, invalidFieldProps, showServerFieldErrors } from '@/lib/form-errors'

/** Asks for a sign-in link by email, for a user without a passkey on this device. */
export function RequestSignInLinkPage() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TypedSignInLinkRequest, unknown, ValidSignInLinkRequest>({
    resolver: zodResolver(signInLinkRequestSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '' },
  })
  const signInLinkRequestMutation = useMutation({
    mutationFn: requestSignInLink,
    onError: (requestError) =>
      showServerFieldErrors(requestError, SIGN_IN_LINK_REQUEST_FORM_FIELDS, setError),
  })

  if (signInLinkRequestMutation.isSuccess) {
    return (
      <SignInLinkSent
        email={signInLinkRequestMutation.variables}
        onStartOver={signInLinkRequestMutation.reset}
      />
    )
  }

  // A failure the API pinned on the email shows under it instead.
  const showsRequestAlert =
    signInLinkRequestMutation.isError &&
    formFieldErrors(signInLinkRequestMutation.error, SIGN_IN_LINK_REQUEST_FORM_FIELDS) === null
  const emailErrorMessage = errors.email?.message

  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Email me a sign-in link</h1>
        <p className="text-sm text-muted-foreground">
          No passkey on this device? We'll email you a link that signs you in.
        </p>
      </div>
      {showsRequestAlert && (
        <p role="alert" className="text-sm text-destructive">
          {signInLinkRequestErrorMessage(signInLinkRequestMutation.error)}
        </p>
      )}
      <form
        className="space-y-4"
        onSubmit={(submitEvent) =>
          void handleSubmit(({ email }) => signInLinkRequestMutation.mutate(email))(submitEvent)
        }
        noValidate
      >
        <div className="space-y-2">
          <Label htmlFor="sign-in-link-email">Email</Label>
          <Input
            id="sign-in-link-email"
            type="email"
            autoComplete="email"
            required
            {...invalidFieldProps('sign-in-link-email-error', emailErrorMessage)}
            {...register('email')}
          />
          <FormFieldError id="sign-in-link-email-error" message={emailErrorMessage} />
        </div>
        <Button type="submit" className="w-full" disabled={signInLinkRequestMutation.isPending}>
          {signInLinkRequestMutation.isPending ? 'Sending…' : 'Email me a link'}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Have a passkey?{' '}
        <Link to="/sign-in" className="text-foreground underline">
          Sign in with it
        </Link>
      </p>
    </section>
  )
}

interface SignInLinkSentProps {
  email: string
  onStartOver: () => void
}

/** Confirms the request, without saying whether an account uses the address. */
function SignInLinkSent({ email, onStartOver }: SignInLinkSentProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-2 text-center">
        <MailCheck className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          If an account uses <span className="font-medium text-foreground">{email}</span>, we've
          sent it a sign-in link. The link works once and expires in 15 minutes.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={onStartOver}>
        Use a different email
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/sign-in" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </section>
  )
}
