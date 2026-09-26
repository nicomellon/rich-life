import type { BucketStatus } from '@/summary/summary-api'

export const BUCKET_STATUS_LABELS: Record<BucketStatus, string> = {
  under: 'Under target',
  on_track: 'On track',
  over: 'Over budget',
}

/** The Tailwind classes of a status badge, in the status's colour. */
export const BUCKET_STATUS_BADGE_CLASSES: Record<BucketStatus, string> = {
  under: 'bg-status-under/10 text-status-under',
  on_track: 'bg-status-on-track/10 text-status-on-track',
  over: 'bg-status-over/10 text-status-over',
}

/** The Tailwind class that fills a bucket's progress bar in its status's colour. */
export const BUCKET_STATUS_FILL_CLASSES: Record<BucketStatus, string> = {
  under: 'bg-status-under',
  on_track: 'bg-status-on-track',
  over: 'bg-status-over',
}

/** The status's colour as a CSS value, for chart marks that can't take a class. */
export const BUCKET_STATUS_COLORS: Record<BucketStatus, string> = {
  under: 'var(--status-under)',
  on_track: 'var(--status-on-track)',
  over: 'var(--status-over)',
}
