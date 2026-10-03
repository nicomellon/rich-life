import {
  browserSupportsWebAuthn,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/browser'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  errorResponse,
  issuedAccessToken,
  jsonResponse,
  mockApi,
  sentJsonBody,
  signedInUser,
  wasSent,
} from '@/test/api-mock'
import { renderApp } from '@/test/render-app'

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))

const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
  rp: { id: 'localhost', name: 'Rich Life' },
  user: { id: 'dXNlci1oYW5kbGU', name: 'ada@example.com', displayName: 'ada@example.com' },
  challenge: 'cmVnaXN0cmF0aW9uLWNoYWxsZW5nZQ',
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

const INVALID_EMAIL_MESSAGE = 'Enter an email address like you@example.com'
const SERVER_EMAIL_ERROR_MESSAGE = 'value is not a valid email address'

function emailRejectedResponse(): Response {
  return errorResponse(422, 'validation_failed', 'Some fields are invalid.', [
    { field: 'email', message: SERVER_EMAIL_ERROR_MESSAGE },
  ])
}

function mockRegistrationApi(registerChallengeResponder = () => jsonResponse(registrationOptions)) {
  return mockApi({
    'POST /auth/register-challenge': registerChallengeResponder,
    'POST /auth/verify-registration': () => jsonResponse(issuedAccessToken, 201),
    'GET /auth/me': () => jsonResponse(signedInUser),
    'GET /months': () => jsonResponse([]),
  })
}

async function registerAs(email: string) {
  if (email) await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.click(screen.getByRole('button', { name: 'Create a passkey' }))
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true)
    vi.mocked(startRegistration).mockResolvedValue(newPasskey)
  })

  it('creates an account with a passkey and opens the dashboard', async () => {
    mockRegistrationApi()
    renderApp('/register')

    await registerAs('ada@example.com')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('asks the backend for a challenge for the entered email', async () => {
    const fetchMock = mockRegistrationApi()
    renderApp('/register')

    await registerAs('ada@example.com')

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(sentJsonBody(fetchMock, 'POST /auth/register-challenge')).toEqual({
      email: 'ada@example.com',
    })
  })

  it('sends the new passkey to the backend', async () => {
    const fetchMock = mockRegistrationApi()
    renderApp('/register')

    await registerAs('ada@example.com')

    await screen.findByRole('heading', { name: 'Dashboard' })
    expect(sentJsonBody(fetchMock, 'POST /auth/verify-registration')).toEqual(newPasskey)
  })

  it('explains that the email is already registered', async () => {
    mockRegistrationApi(() =>
      errorResponse(409, 'email_already_registered', 'Email already registered'),
    )
    renderApp('/register')

    await registerAs('ada@example.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists. Sign in instead.',
    )
  })

  it('explains that the passkey prompt was cancelled', async () => {
    mockRegistrationApi()
    vi.mocked(startRegistration).mockRejectedValue(
      new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'),
    )
    renderApp('/register')

    await registerAs('ada@example.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The passkey prompt was cancelled or timed out. Please try again.',
    )
  })

  it('shows no email error before the form is first submitted', async () => {
    mockRegistrationApi()
    renderApp('/register')

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email')

    expect(screen.getByLabelText('Email')).not.toHaveAccessibleDescription()
  })

  it.each([
    ['an invalid email', 'not-an-email'],
    ['an empty email', ''],
  ])('flags %s on submit', async (_, typedEmail) => {
    mockRegistrationApi()
    renderApp('/register')

    await registerAs(typedEmail)

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(INVALID_EMAIL_MESSAGE)
  })

  it('marks an invalid email as invalid on submit', async () => {
    mockRegistrationApi()
    renderApp('/register')

    await registerAs('not-an-email')

    expect(screen.getByLabelText('Email')).toBeInvalid()
  })

  it('does not ask for a challenge for an invalid email', async () => {
    const fetchMock = mockRegistrationApi()
    renderApp('/register')

    await registerAs('not-an-email')

    await screen.findByText(INVALID_EMAIL_MESSAGE)
    expect(wasSent(fetchMock, 'POST /auth/register-challenge')).toBe(false)
  })

  it('keeps the button enabled while the email is invalid', async () => {
    mockRegistrationApi()
    renderApp('/register')

    await registerAs('not-an-email')

    await screen.findByText(INVALID_EMAIL_MESSAGE)
    expect(screen.getByRole('button', { name: 'Create a passkey' })).toBeEnabled()
  })

  it('clears the email error as the user corrects it', async () => {
    mockRegistrationApi()
    renderApp('/register')
    await registerAs('ada')
    await screen.findByText(INVALID_EMAIL_MESSAGE)

    await userEvent.type(screen.getByLabelText('Email'), '@example.com')

    expect(screen.getByLabelText('Email')).not.toHaveAccessibleDescription()
  })

  it("shows the server's error about the email under the email field", async () => {
    mockRegistrationApi(emailRejectedResponse)
    renderApp('/register')

    await registerAs('ada@example.com')

    expect(await screen.findByText(SERVER_EMAIL_ERROR_MESSAGE)).toBeInTheDocument()
  })

  it("shows no alert for the server's error about the email", async () => {
    mockRegistrationApi(emailRejectedResponse)
    renderApp('/register')

    await registerAs('ada@example.com')

    await screen.findByText(SERVER_EMAIL_ERROR_MESSAGE)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("disables registering when the browser doesn't support passkeys", () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false)

    renderApp('/register')

    expect(screen.getByRole('button', { name: 'Create a passkey' })).toBeDisabled()
  })
})
