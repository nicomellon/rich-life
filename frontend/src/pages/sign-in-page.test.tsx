import {
  browserSupportsWebAuthn,
  startAuthentication,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getAccessToken } from '@/lib/auth-token'
import {
  issuedAccessToken,
  jsonResponse,
  mockApi,
  sentJsonBody,
  signedInUser,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

const signInOptions: PublicKeyCredentialRequestOptionsJSON = {
  challenge: 'c2lnbi1pbi1jaGFsbGVuZ2U',
  timeout: 60000,
  rpId: 'localhost',
  allowCredentials: [],
  userVerification: 'required',
}

const passkeyAssertion: AuthenticationResponseJSON = {
  id: 'cGFzc2tleS1pZA',
  rawId: 'cGFzc2tleS1pZA',
  type: 'public-key',
  response: {
    clientDataJSON: 'Y2xpZW50LWRhdGE',
    authenticatorData: 'YXV0aGVudGljYXRvci1kYXRh',
    signature: 'c2lnbmF0dXJl',
  },
  clientExtensionResults: {},
}

function mockSignInApi(verifyLoginResponder = () => jsonResponse(issuedAccessToken)) {
  return mockApi({
    'POST /auth/login-challenge': () => jsonResponse(signInOptions),
    'POST /auth/verify-login': verifyLoginResponder,
    'GET /auth/me': () => jsonResponse(signedInUser),
  })
}

async function clickSignIn() {
  await userEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
}

describe('SignInPage', () => {
  beforeEach(() => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true)
    vi.mocked(startAuthentication).mockResolvedValue(passkeyAssertion)
  })

  it('signs in with a passkey and opens the dashboard', async () => {
    mockSignInApi()
    renderApp('/sign-in')

    await clickSignIn()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('stores the access token so the user stays signed in', async () => {
    mockSignInApi()
    renderApp('/sign-in')

    await clickSignIn()

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(getAccessToken()).toBe('new-token')
  })

  it('passes the backend options to the browser', async () => {
    mockSignInApi()
    renderApp('/sign-in')

    await clickSignIn()

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: signInOptions })
  })

  it("sends the browser's assertion to the backend", async () => {
    const fetchMock = mockSignInApi()
    renderApp('/sign-in')

    await clickSignIn()

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(sentJsonBody(fetchMock, 'POST /auth/verify-login')).toEqual(passkeyAssertion)
  })

  it('returns to the page the user first asked for', async () => {
    mockSignInApi()
    renderApp('/plan')
    await screen.findByRole('heading', { name: 'Sign in' })

    await clickSignIn()

    expect(await screen.findByRole('heading', { name: 'Spending plan' })).toBeInTheDocument()
  })

  it('explains that the passkey prompt was cancelled', async () => {
    mockSignInApi()
    vi.mocked(startAuthentication).mockRejectedValue(
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
    )
    renderApp('/sign-in')

    await clickSignIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The passkey prompt was cancelled or timed out. Please try again.',
    )
  })

  it('explains that the backend rejected the passkey', async () => {
    mockSignInApi(() => jsonResponse({ detail: 'Passkey verification failed' }, 401))
    renderApp('/sign-in')

    await clickSignIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't verify your passkey. Please try again.",
    )
  })

  it("explains that the browser doesn't support passkeys", () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false)

    renderApp('/sign-in')

    expect(screen.getByRole('alert')).toHaveTextContent("This browser doesn't support passkeys.")
  })

  it("disables signing in when the browser doesn't support passkeys", () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false)

    renderApp('/sign-in')

    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled()
  })
})
