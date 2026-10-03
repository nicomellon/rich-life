import { signInLinkRequestSchema } from '@/auth/sign-in-link-schema'

/** The error messages for the typed email, or none when it's valid. */
function emailErrors(typedEmail: string): string[] {
  return (
    signInLinkRequestSchema
      .safeParse({ email: typedEmail })
      .error?.issues.map((issue) => issue.message) ?? []
  )
}

describe('signInLinkRequestSchema', () => {
  it('accepts an email address', () => {
    expect(emailErrors('ada@example.com')).toEqual([])
  })

  it('trims the typed email', () => {
    expect(signInLinkRequestSchema.parse({ email: '  ada@example.com ' })).toEqual({
      email: 'ada@example.com',
    })
  })

  it('rejects text without an @', () => {
    expect(emailErrors('not-an-email')).toEqual(['Enter an email address like you@example.com'])
  })
})
