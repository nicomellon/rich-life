import { registerSchema } from '@/auth/register-schema'

/** The error messages for the typed email, or none when it's valid. */
function emailErrors(typedEmail: string): string[] {
  return (
    registerSchema.safeParse({ email: typedEmail }).error?.issues.map((issue) => issue.message) ??
    []
  )
}

describe('registerSchema', () => {
  it.each([
    ['an ASCII address', 'ada@example.com'],
    ['an address with an accented name', 'josé@example.com'],
    ['an address with an accented domain', 'ada@exämple.de'],
  ])('accepts %s', (_, typedEmail) => {
    expect(emailErrors(typedEmail)).toEqual([])
  })

  it.each([
    ['text without an @', 'not-an-email'],
    ['an empty email', ''],
    ['an address without a domain', 'ada@'],
  ])('rejects %s', (_, typedEmail) => {
    expect(emailErrors(typedEmail)).toEqual(['Enter an email address like you@example.com'])
  })
})
