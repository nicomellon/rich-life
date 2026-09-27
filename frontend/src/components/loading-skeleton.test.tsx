import { render, screen } from '@testing-library/react'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

function renderEntriesSkeleton() {
  render(
    <LoadingSkeleton label="Loading your entries…">
      <Skeleton />
    </LoadingSkeleton>,
  )
}

describe('LoadingSkeleton', () => {
  it('marks its skeletons busy', () => {
    renderEntriesSkeleton()

    expect(screen.getByText('Loading your entries…').parentElement).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('hides its label visually', () => {
    renderEntriesSkeleton()

    expect(screen.getByText('Loading your entries…')).toHaveClass('sr-only')
  })
})
