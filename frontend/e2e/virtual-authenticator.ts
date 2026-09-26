import type { Page } from '@playwright/test'

/**
 * Attaches a virtual passkey authenticator to `page` through the Chrome DevTools Protocol, so
 * registering and signing in need no real device. It behaves like a platform authenticator
 * (Touch ID, Windows Hello) that stores discoverable credentials and verifies the user without a
 * prompt, which is what the backend requires. Chromium only.
 */
export async function addVirtualAuthenticator(page: Page): Promise<void> {
  const devToolsSession = await page.context().newCDPSession(page)
  await devToolsSession.send('WebAuthn.enable')
  await devToolsSession.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}
