import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthProvider } from '@/auth/auth-provider'
import { routes } from '@/routes'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

/**
 * Renders the whole app at `path`, wired like main.tsx. Pass `queryClient` to act on the cache
 * from the test. Returns the router to inspect.
 */
export function renderApp(path: string, queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}
