import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthProvider } from '@/auth/auth-provider'
import { Toaster } from '@/components/ui/sonner'
import { routes } from '@/routes'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

interface RenderAppOptions {
  /** Renders inside StrictMode, as main.tsx does, so React runs effects twice. */
  strictMode?: boolean
}

/**
 * Renders the whole app at `path`, wired like main.tsx. Pass `queryClient` to act on the cache
 * from the test. Returns the router to inspect.
 */
export function renderApp(
  path: string,
  queryClient = createTestQueryClient(),
  { strictMode = false }: RenderAppOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const app = (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  )
  render(strictMode ? <StrictMode>{app}</StrictMode> : app)
  return router
}
