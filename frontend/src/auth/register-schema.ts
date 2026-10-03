import { z } from 'zod'
import { emailAddressSchema } from '@/auth/email-schema'

/** The registration form's values. */
export const registerSchema = z.object({ email: emailAddressSchema })

export type TypedRegistration = z.input<typeof registerSchema>

export type ValidRegistration = z.output<typeof registerSchema>

/** The registration form's fields, named like the API's. */
export const REGISTER_FORM_FIELDS = registerSchema.keyof().options
