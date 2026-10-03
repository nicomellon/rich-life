import { z } from 'zod'

export const EMAIL_INVALID_MESSAGE = 'Enter an email address like you@example.com'

/** The registration form's values. */
export const registerSchema = z.object({
  // Unicode, like the backend's `EmailStr`, so the app never rejects an address it accepts.
  email: z
    .string()
    .trim()
    .pipe(z.email({ pattern: z.regexes.unicodeEmail, message: EMAIL_INVALID_MESSAGE })),
})

export type TypedRegistration = z.input<typeof registerSchema>

export type ValidRegistration = z.output<typeof registerSchema>

/** The registration form's fields, named like the API's. */
export const REGISTER_FORM_FIELDS = registerSchema.keyof().options
