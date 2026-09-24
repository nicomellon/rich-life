import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getAccessToken } from '@/lib/auth-token'
import { jsonResponse, mockApi, signedInUser, signInBeforeRender } from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

describe('AppShell', () => {
  beforeEach(() => {
    signInBeforeRender()
    mockApi({ 'GET /auth/me': () => jsonResponse(signedInUser) })
  })

  it('shows the main navigation', async () => {
    renderApp('/')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })

  it('opens the dashboard by default', async () => {
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('marks the dashboard link as the current page', async () => {
    renderApp('/')

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('navigates between pages', async () => {
    const router = renderApp('/')

    await userEvent.click(await screen.findByRole('link', { name: 'Spending plan' }))

    expect(router.state.location.pathname).toBe('/plan')
    expect(screen.getByRole('heading', { name: 'Spending plan' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/nope')

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it("shows the signed-in user's email", async () => {
    renderApp('/')

    expect(await screen.findByText('ada@example.com')).toBeInTheDocument()
  })

  it('signing out goes to the sign-in page', async () => {
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signing out forgets the access token', async () => {
    renderApp('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(getAccessToken()).toBeNull()
  })
})
