// Where the JWT access token lives. localStorage is enough for the MVP; the login flow (#7)
// writes it and the API client reads it.
const STORAGE_KEY = 'rich-life.access-token'

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
}

export function clearAccessToken(): void {
  localStorage.removeItem(STORAGE_KEY)
}
