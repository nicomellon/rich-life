import '@testing-library/jest-dom/vitest'
import { toast } from 'sonner'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  // Sonner keeps its toasts in a module-wide store and shows the undismissed ones to the next
  // Toaster, so a toast from one test would appear in the next.
  toast.dismiss()
})
