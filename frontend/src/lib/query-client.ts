import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) won't succeed on a retry; network and server errors might.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
    },
  })
}
