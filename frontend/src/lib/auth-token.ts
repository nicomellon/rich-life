// Where the JWT access token lives. localStorage is enough for the MVP: the token survives a
// reload and is shared by every tab. The sign-in flow writes it, the API client reads it, and the
// auth context re-renders the app whenever it changes.
const STORAGE_KEY = 'rich-life.access-token'

const tokenListeners = new Set<() => void>()

function notifyTokenListeners(): void {
  tokenListeners.forEach((onChange) => onChange())
}

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token)
  notifyTokenListeners()
}

export function clearAccessToken(): void {
  localStorage.removeItem(STORAGE_KEY)
  notifyTokenListeners()
}

/**
 * Calls `onChange` whenever the token is set or cleared, in this tab or another one. Returns a
 * function that stops listening. Shaped for React's `useSyncExternalStore`.
 */
export function subscribeToAccessToken(onChange: () => void): () => void {
  // Other tabs change localStorage without calling our setters; the browser tells us through a
  // storage event instead. Its key is null when the whole storage was cleared.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange()
  }
  tokenListeners.add(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    tokenListeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}
