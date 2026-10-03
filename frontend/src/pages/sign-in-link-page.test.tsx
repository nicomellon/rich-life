import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser'
import { screen } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import type { AccessToken } from '@/auth/auth-api'
import { getAccessToken } from '@/lib/auth-token'
import {
  errorResponse,
  inSequence,
  internalErrorResponse,
  issuedAccessToken,
  jsonResponse,
  mockApi,
  networkFailure,
  sentHeaders,
  sentJsonBody,
  signedInUser,
  signInBeforeRender,
  timesSent,
  wasSent,
  type ApiResponder,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'
import { findToast } from '@/test/toasts'

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

const SIGN_IN_LINK_PATH = '/sign-in/link#token=bGluay10b2tlbg'

const addPasskeyOptions: PublicKeyCredentialCreationOptionsJSON = {
  rp: { id: 'localhost', name: 'Rich Life' },
  user: { id: 'dXNlci1oYW5kbGU', name: 'ada@example.com', displayName: 'ada@example.com' },
  challenge: 'YWRkLXBhc3NrZXktY2hhbGxlbmdl',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  excludeCredentials: [],
  authenticatorSelection: {
    residentKey: 'required',
    requireResidentKey: true,
    userVerification: 'required',
  },
  attestation: 'none',
}

const newPasskey: RegistrationResponseJSON = {
  id: 'cGFzc2tleS1pZA',
  rawId: 'cGFzc2tleS1pZA',
  type: 'public-key',
  response: {
    clientDataJSON: 'Y2xpZW50LWRhdGE',
    attestationObject: 'YXR0ZXN0YXRpb24tb2JqZWN0',
    transports: ['internal'],
  },
  clientExtensionResults: {},
}

/** The token the backend issues once the passkey is added. */
const tokenAfterAddingPasskey: AccessToken = {
  access_token: 'token-after-adding-passkey',
  token_type: 'bearer',
}

interface SignInLinkApiResponders {
  verifyLinkResponder?: ApiResponder
  currentUserResponder?: ApiResponder
}

function mockSignInLinkApi({
  verifyLinkResponder = () => jsonResponse(issuedAccessToken),
  currentUserResponder = () => jsonResponse(signedInUser),
}: SignInLinkApiResponders = {}) {
  return mockApi({
    'POST /auth/magic-link/verify': verifyLinkResponder,
    'POST /auth/register-challenge': () => jsonResponse(addPasskeyOptions),
    'POST /auth/verify-registration': () => jsonResponse(tokenAfterAddingPasskey, 201),
    'GET /auth/me': currentUserResponder,
    'GET /months': () => jsonResponse([]),
  })
}

function invalidLinkResponse(): Response {
  return errorResponse(
    401,
    'magic_link_invalid',
    'This sign-in link is invalid, expired or already used.',
  )
}

async function addPasskeyAfterSigningIn() {
  await userEvent.click(await screen.findByRole('button', { name: 'Add a passkey' }))
}

describe('SignInLinkPage', () => {
  beforeEach(() => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true)
    vi.mocked(startRegistration).mockResolvedValue(newPasskey)
  })

  it("sends the link's token to the backend", async () => {
    const fetchMock = mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('heading', { name: "You're signed in" })
    expect(sentJsonBody(fetchMock, 'POST /auth/magic-link/verify')).toEqual({
      token: 'bGluay10b2tlbg',
    })
  })

  it('redeems the link once when React runs effects twice', async () => {
    const fetchMock = mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH, undefined, { strictMode: true })

    await screen.findByRole('heading', { name: "You're signed in" })
    expect(timesSent(fetchMock, 'POST /auth/magic-link/verify')).toBe(1)
  })

  it('stores the access token so the user is signed in', async () => {
    mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('heading', { name: "You're signed in" })
    expect(getAccessToken()).toBe('new-token')
  })

  it('offers to add a passkey on this device', async () => {
    mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    expect(await screen.findByRole('button', { name: 'Add a passkey' })).toBeInTheDocument()
  })

  it('opens the dashboard when the user declines a passkey', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it("opens the dashboard without an offer when the browser doesn't support passkeys", async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false)
    mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('asks the backend to add a passkey to the signed-in account', async () => {
    const fetchMock = mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(sentHeaders(fetchMock, 'POST /auth/register-challenge').get('Authorization')).toBe(
      'Bearer new-token',
    )
  })

  it('passes the backend options to the browser', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: addPasskeyOptions })
  })

  it('sends the new passkey to the backend', async () => {
    const fetchMock = mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(sentJsonBody(fetchMock, 'POST /auth/verify-registration')).toEqual(newPasskey)
  })

  it('opens the dashboard once the passkey is added', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('confirms the passkey was added', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    expect(await findToast('Passkey added')).toBeInTheDocument()
  })

  it('keeps the fresh access token from adding the passkey', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(getAccessToken()).toBe('token-after-adding-passkey')
  })

  it('explains that the passkey prompt was cancelled', async () => {
    mockSignInLinkApi()
    vi.mocked(startRegistration).mockRejectedValue(
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
    )
    renderApp(SIGN_IN_LINK_PATH)

    await addPasskeyAfterSigningIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The passkey prompt was cancelled or timed out. Please try again.',
    )
  })

  it('explains that the link is invalid, expired or used', async () => {
    mockSignInLinkApi({ verifyLinkResponder: invalidLinkResponse })

    renderApp(SIGN_IN_LINK_PATH)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This sign-in link is invalid, has expired or has already been used.',
    )
  })

  it('offers a new link when the link is invalid', async () => {
    mockSignInLinkApi({ verifyLinkResponder: invalidLinkResponse })
    renderApp(SIGN_IN_LINK_PATH)

    await userEvent.click(await screen.findByRole('link', { name: 'Email me a new link' }))

    expect(screen.getByRole('heading', { name: 'Email me a sign-in link' })).toBeInTheDocument()
  })

  it('signs in when the user tries the link again after a network failure', async () => {
    mockSignInLinkApi({
      verifyLinkResponder: inSequence(networkFailure, () => jsonResponse(issuedAccessToken)),
    })
    renderApp(SIGN_IN_LINK_PATH)

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: "You're signed in" })).toBeInTheDocument()
  })

  it('offers no retry for an invalid link', async () => {
    mockSignInLinkApi({ verifyLinkResponder: invalidLinkResponse })

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('explains that the user tried too many links', async () => {
    mockSignInLinkApi({
      verifyLinkResponder: () =>
        errorResponse(429, 'rate_limited', 'Too many requests. Please try again later.'),
    })

    renderApp(SIGN_IN_LINK_PATH)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a few minutes and try again.',
    )
  })

  it('explains that a link without a token is incomplete', () => {
    mockSignInLinkApi()

    renderApp('/sign-in/link')

    expect(screen.getByRole('alert')).toHaveTextContent('This sign-in link is incomplete.')
  })

  it('sends nothing to the backend for a link without a token', () => {
    const fetchMock = mockSignInLinkApi()

    renderApp('/sign-in/link')

    expect(wasSent(fetchMock, 'POST /auth/magic-link/verify')).toBe(false)
  })

  it('opens the dashboard for a user who is already signed in', async () => {
    signInBeforeRender()
    mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('leaves the link unused for a user who is already signed in', async () => {
    signInBeforeRender()
    const fetchMock = mockSignInLinkApi()

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(wasSent(fetchMock, 'POST /auth/magic-link/verify')).toBe(false)
  })

  it('signs in with the link when the stored access token has expired', async () => {
    signInBeforeRender()
    const fetchMock = mockSignInLinkApi({
      currentUserResponder: inSequence(
        () => errorResponse(401, 'not_authenticated', 'Not authenticated'),
        () => jsonResponse(signedInUser),
      ),
    })

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('heading', { name: "You're signed in" })
    expect(wasSent(fetchMock, 'POST /auth/magic-link/verify')).toBe(true)
  })

  it('leaves the link unused when the account fails to load', async () => {
    signInBeforeRender()
    const fetchMock = mockSignInLinkApi({
      verifyLinkResponder: invalidLinkResponse,
      currentUserResponder: internalErrorResponse,
    })

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('button', { name: 'Try again' })
    expect(wasSent(fetchMock, 'POST /auth/magic-link/verify')).toBe(false)
  })

  it('keeps the stored access token when the account fails to load', async () => {
    signInBeforeRender()
    mockSignInLinkApi({
      verifyLinkResponder: invalidLinkResponse,
      currentUserResponder: internalErrorResponse,
    })

    renderApp(SIGN_IN_LINK_PATH)

    await screen.findByRole('button', { name: 'Try again' })
    expect(getAccessToken()).toBe('stored-token')
  })

  it('sends the user to sign in when they sign out in another tab before adding a passkey', async () => {
    mockSignInLinkApi()
    renderApp(SIGN_IN_LINK_PATH)
    await screen.findByRole('heading', { name: "You're signed in" })

    localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'rich-life.access-token' }))
    })

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
