import { screen } from '@testing-library/react'
import { act } from 'react'
import { jsonResponse, mockApi, signedInUser, signInBeforeRender } from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

describe('RequireAuth', () => {
  it('sends a signed-out user to the sign-in page', async () => {
    const router = renderApp('/plan')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('keeps a user signed in across a reload', async () => {
    signInBeforeRender()
    mockApi({ 'GET /auth/me': () => jsonResponse(signedInUser) })

    renderApp('/plan')

    expect(await screen.findByRole('heading', { name: 'Spending plan' })).toBeInTheDocument()
  })

  it('sends the user to sign in when the API rejects their token', async () => {
    signInBeforeRender()
    mockApi({ 'GET /auth/me': () => jsonResponse({ detail: 'Token expired' }, 401) })

    renderApp('/plan')

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('offers to retry when the account fails to load', async () => {
    signInBeforeRender()
    mockApi({ 'GET /auth/me': () => jsonResponse({ detail: 'Internal Server Error' }, 500) })

    renderApp('/plan')

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('signs the user out when another tab signs out', async () => {
    signInBeforeRender()
    mockApi({ 'GET /auth/me': () => jsonResponse(signedInUser) })
    renderApp('/plan')
    await screen.findByRole('heading', { name: 'Spending plan' })

    localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'rich-life.access-token' }))
    })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('RequireSignedOut', () => {
  it('sends a signed-in user from the sign-in page to the dashboard', async () => {
    signInBeforeRender()
    mockApi({
      'GET /auth/me': () => jsonResponse(signedInUser),
      'GET /months': () => jsonResponse([]),
    })

    renderApp('/sign-in')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })
})
