import { act, screen } from '@testing-library/react'

/** The toast whose message is `toastMessage`, once it's shown. */
export async function findToast(toastMessage: string): Promise<Element | null> {
  const shownMessage = await screen.findByText(toastMessage)
  return shownMessage.closest('[data-sonner-toast]')
}

/** The toasts on screen, once every toast already asked for has had its turn to render. */
export async function shownToasts(): Promise<Element[]> {
  // Sonner renders a new toast in a later task, so let those already queued run first.
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  return Array.from(document.querySelectorAll('[data-sonner-toast]'))
}
