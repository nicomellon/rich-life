import { defineConfig, devices } from '@playwright/test'

// The web app's origin, which must match the backend's WEBAUTHN_ORIGIN for passkeys to work.
const WEB_APP_URL = 'http://localhost:5173'
const isCi = Boolean(process.env.CI)

// End-to-end tests drive the real web app and API in Chromium. Twelve-factor: this config reads
// nothing from .env files. The servers below inherit Playwright's environment, which `make e2e`
// fills from the root .env and CI sets directly (DATABASE_URL, JWT_SECRET, ...).
export default defineConfig({
  testDir: './e2e',
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB_APP_URL,
    // Amounts are formatted for the browser's locale, so the tests pin it.
    locale: 'en-US',
    // With the tests' pinned clock, this fixes the date the app sees.
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  // Passkeys run on Chromium's virtual authenticator, a DevTools Protocol feature.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Outside CI, servers already running (e.g. from `make dev`) are reused.
  webServer: [
    {
      command: 'uv run uvicorn app.main:app --port 8000',
      cwd: '../backend',
      url: 'http://localhost:8000/health',
      reuseExistingServer: !isCi,
    },
    {
      command: 'npm run dev',
      url: WEB_APP_URL,
      reuseExistingServer: !isCi,
    },
  ],
})
