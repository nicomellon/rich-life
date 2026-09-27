import { act, render, screen } from '@testing-library/react'
import { Toaster } from '@/components/ui/sonner'
import { showSaveFailedToast } from '@/lib/save-toasts'

describe('showSaveFailedToast', () => {
  it('shows a generic message for an error that is not from the API', async () => {
    render(<Toaster />)

    act(() => showSaveFailedToast(new SyntaxError('Unexpected token < in JSON')))

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument()
  })
})
