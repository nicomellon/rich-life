import { z } from 'zod'

export const EMAIL_INVALID_MESSAGE = 'Enter an email address like you@example.com'

/**
 * A typed email address, trimmed. Unicode, like the backend's `EmailStr`, so the app never rejects
 * an address it accepts.
 */
export const emailAddressSchema = z
  .string()
  .trim()
  .pipe(z.email({ pattern: z.regexes.unicodeEmail, message: EMAIL_INVALID_MESSAGE }))
