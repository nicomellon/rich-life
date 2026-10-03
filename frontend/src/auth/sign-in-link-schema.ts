import { z } from 'zod'
import { emailAddressSchema } from '@/auth/email-schema'

/** The values of the form that asks for a sign-in link by email. */
export const signInLinkRequestSchema = z.object({ email: emailAddressSchema })

export type TypedSignInLinkRequest = z.input<typeof signInLinkRequestSchema>

export type ValidSignInLinkRequest = z.output<typeof signInLinkRequestSchema>

/** The form's fields, named like the API's. */
export const SIGN_IN_LINK_REQUEST_FORM_FIELDS = signInLinkRequestSchema.keyof().options
