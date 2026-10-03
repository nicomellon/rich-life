import { ApiError } from '@/lib/api'
import { formFieldErrors } from '@/lib/form-errors'

const ENTRY_FORM_FIELDS = ['amount', 'date'] as const

function validationError(...fieldNames: string[]): ApiError {
  return new ApiError({
    status: 422,
    code: 'validation_failed',
    message: 'Some fields are invalid.',
    fieldErrors: fieldNames.map((field) => ({ field, message: `Bad ${field}` })),
  })
}

describe('formFieldErrors', () => {
  it("returns a 422's errors about the form's fields", () => {
    expect(formFieldErrors(validationError('amount', 'date'), ENTRY_FORM_FIELDS)).toEqual([
      { field: 'amount', message: 'Bad amount' },
      { field: 'date', message: 'Bad date' },
    ])
  })

  it('returns null when a field error names a value the form does not have', () => {
    expect(formFieldErrors(validationError('amount', 'body'), ENTRY_FORM_FIELDS)).toBeNull()
  })

  it('returns null for an API error without field errors', () => {
    const notFoundError = new ApiError({
      status: 404,
      code: 'entry_not_found',
      message: 'Entry not found',
    })

    expect(formFieldErrors(notFoundError, ENTRY_FORM_FIELDS)).toBeNull()
  })

  it('returns null for an error that is not from the API', () => {
    expect(formFieldErrors(new TypeError('Failed to fetch'), ENTRY_FORM_FIELDS)).toBeNull()
  })
})
