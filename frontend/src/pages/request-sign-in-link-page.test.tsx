import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  acceptedResponse,
  errorResponse,
  mockApi,
  networkFailure,
  sentJsonBody,
  wasSent,
  type ApiResponder,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

const INVALID_EMAIL_MESSAGE = 'Enter an email address like you@example.com'
const SERVER_EMAIL_ERROR_MESSAGE = 'value is not a valid email address'

function mockSignInLinkApi(magicLinkResponder: ApiResponder = acceptedResponse) {
  return mockApi({ 'POST /auth/magic-link': magicLinkResponder })
}

async function askForLinkAs(email: string) {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.click(screen.getByRole('button', { name: 'Email me a link' }))
}

describe('RequestSignInLinkPage', () => {
  it('opens from the sign-in page', async () => {
    renderApp('/sign-in')

    await userEvent.click(screen.getByRole('link', { name: 'Email me a sign-in link' }))

    expect(screen.getByRole('heading', { name: 'Email me a sign-in link' })).toBeInTheDocument()
  })

  it('asks the backend to email a link to the entered address', async () => {
    const fetchMock = mockSignInLinkApi()
    renderApp('/sign-in/email')

    await askForLinkAs(' ada@example.com ')

    await screen.findByRole('heading', { name: 'Check your email' })
    expect(sentJsonBody(fetchMock, 'POST /auth/magic-link')).toEqual({ email: 'ada@example.com' })
  })

  it('confirms the link is on its way to the entered address', async () => {
    mockSignInLinkApi()
    renderApp('/sign-in/email')

    await askForLinkAs('ada@example.com')

    expect(await screen.findByText(/If an account uses/)).toHaveTextContent(
      "If an account uses ada@example.com, we've sent it a sign-in link.",
    )
  })

  it('goes back to the form to use a different email', async () => {
    mockSignInLinkApi()
    renderApp('/sign-in/email')
    await askForLinkAs('ada@example.com')

    await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }))

    expect(screen.getByRole('heading', { name: 'Email me a sign-in link' })).toBeInTheDocument()
  })

  it('flags an invalid email on submit', async () => {
    mockSignInLinkApi()
    renderApp('/sign-in/email')

    await askForLinkAs('not-an-email')

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(INVALID_EMAIL_MESSAGE)
  })

  it('does not ask for a link for an invalid email', async () => {
    const fetchMock = mockSignInLinkApi()
    renderApp('/sign-in/email')

    await askForLinkAs('not-an-email')

    await screen.findByText(INVALID_EMAIL_MESSAGE)
    expect(wasSent(fetchMock, 'POST /auth/magic-link')).toBe(false)
  })

  it("shows the server's error about the email under the email field", async () => {
    mockSignInLinkApi(() =>
      errorResponse(422, 'validation_failed', 'Some fields are invalid.', [
        { field: 'email', message: SERVER_EMAIL_ERROR_MESSAGE },
      ]),
    )
    renderApp('/sign-in/email')

    await askForLinkAs('ada@example.com')

    expect(await screen.findByLabelText('Email')).toHaveAccessibleDescription(
      SERVER_EMAIL_ERROR_MESSAGE,
    )
  })

  it('explains that the user asked for too many links', async () => {
    mockSignInLinkApi(() =>
      errorResponse(429, 'rate_limited', 'Too many requests. Please try again later.'),
    )
    renderApp('/sign-in/email')

    await askForLinkAs('ada@example.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a few minutes and try again.',
    )
  })

  it("explains that the server couldn't be reached", async () => {
    mockSignInLinkApi(networkFailure)
    renderApp('/sign-in/email')

    await askForLinkAs('ada@example.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't reach the server. Check your connection and try again.",
    )
  })
})
