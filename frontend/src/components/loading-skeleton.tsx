import type { ReactNode } from 'react'

interface LoadingSkeletonProps {
  /** What's loading, for screen readers, e.g. "Loading your entries…". */
  label: string
  /** The skeletons, laid out like the content they stand in for. They are empty, so screen
   * readers skip them. */
  children: ReactNode
  className?: string
}

/**
 * Skeletons that stand in for content while it loads, marked busy and labelled for screen readers
 * so the page doesn't jump when the content arrives.
 */
export function LoadingSkeleton({ label, children, className }: LoadingSkeletonProps) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}
