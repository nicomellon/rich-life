import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) won't succeed on a retry; network and server errors might.
        retry: (failureCount, error) => !isClientError(error) && failureCount < 2,
      },
    },
  })
}

function isClientError(error: Error): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500
}
