import { act, render } from '@testing-library/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { findToast } from '@/test/toasts'

/** The theme Sonner styles its toasts with, read from the list that holds them. */
async function shownToastTheme(): Promise<string | null | undefined> {
  const shownToast = await findToast('Entry added')
  return shownToast?.closest('[data-sonner-theme]')?.getAttribute('data-sonner-theme')
}

describe('Toaster', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('uses the light theme while the app is light', async () => {
    render(<Toaster />)

    act(() => {
      toast.success('Entry added')
    })

    expect(await shownToastTheme()).toBe('light')
  })

  it('switches to the dark theme when the app turns dark', async () => {
    render(<Toaster />)

    act(() => {
      document.documentElement.classList.add('dark')
      toast.success('Entry added')
    })

    expect(await shownToastTheme()).toBe('dark')
  })
})
