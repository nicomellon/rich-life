import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '@/routes'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('AppShell', () => {
  it('shows the navigation and the dashboard by default', () => {
    renderAt('/')

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  })

  it('navigates between pages', async () => {
    const router = renderAt('/')

    await userEvent.click(screen.getByRole('link', { name: 'Spending plan' }))

    expect(router.state.location.pathname).toBe('/plan')
    expect(screen.getByRole('heading', { name: 'Spending plan' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', () => {
    renderAt('/nope')

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
