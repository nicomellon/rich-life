import { toast } from 'sonner'
import { ApiError, UNKNOWN_ERROR_MESSAGE } from '@/lib/api'

/** Confirms a save that succeeded, e.g. "Entry added". */
export function showSavedToast(confirmation: string): void {
  toast.success(confirmation)
}

/** Tells the user a save failed: the API's message, or a generic one for any other error. */
export function showSaveFailedToast(saveError: Error): void {
  toast.error(saveError instanceof ApiError ? saveError.message : UNKNOWN_ERROR_MESSAGE)
}
