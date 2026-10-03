import type { FieldPath, FieldValues, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/lib/api'
import { showSaveFailedToast } from '@/lib/save-toasts'

/** A message from the API about one of the form's fields. */
interface ServerFieldError<FieldName extends string> {
  field: FieldName
  message: string
}

/**
 * The field errors of a 422 `saveError`, when each names one of `formFields`, whose names match
 * the API's. Null for any other error, and for a 422 about a value the form doesn't have, so that
 * it's reported as a whole.
 */
export function formFieldErrors<FieldName extends string>(
  saveError: unknown,
  formFields: readonly FieldName[],
): ServerFieldError<FieldName>[] | null {
  if (!(saveError instanceof ApiError) || saveError.fieldErrors.length === 0) return null
  const serverFieldErrors: ServerFieldError<FieldName>[] = []
  for (const { field, message } of saveError.fieldErrors) {
    const formField = formFields.find((formFieldName) => formFieldName === field)
    if (formField === undefined) return null
    serverFieldErrors.push({ field: formField, message })
  }
  return serverFieldErrors
}

/**
 * Shows the field errors of a 422 `saveError` under the form's fields, when each names one of
 * `formFields`. Returns whether it did.
 */
export function showServerFieldErrors<FormValues extends FieldValues>(
  saveError: unknown,
  formFields: readonly FieldPath<FormValues>[],
  setError: UseFormSetError<FormValues>,
): boolean {
  const serverFieldErrors = formFieldErrors(saveError, formFields)
  for (const { field, message } of serverFieldErrors ?? []) {
    setError(field, { type: 'server', message })
  }
  return serverFieldErrors !== null
}

/** Reports a failed save: under the form's fields when the API named them, or else in a toast. */
export function showSaveError<FormValues extends FieldValues>(
  saveError: unknown,
  formFields: readonly FieldPath<FormValues>[],
  setError: UseFormSetError<FormValues>,
): void {
  if (!showServerFieldErrors(saveError, formFields, setError)) showSaveFailedToast(saveError)
}

/** The attributes that mark a field invalid and link it to the error shown under it. */
export function invalidFieldProps(errorId: string, errorMessage: string | undefined) {
  return {
    'aria-invalid': errorMessage !== undefined,
    'aria-describedby': errorMessage !== undefined ? errorId : undefined,
  }
}
