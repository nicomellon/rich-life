import { screen } from '@testing-library/react'

/** The busy element around the skeleton labelled `loadingLabel`, once it's shown. */
export async function findLoadingSkeleton(loadingLabel: string): Promise<Element | null> {
  const hiddenLabel = await screen.findByText(loadingLabel)
  return hiddenLabel.closest('[aria-busy="true"]')
}

/**
 * The busy elements without a loading label: skeletons that stand in for part of a query's
 * content while another skeleton of the same query carries the label.
 */
export function unlabelledBusySkeletons(): HTMLElement[] {
  return screen
    .queryAllByRole('generic', { busy: true })
    .filter((busySkeleton) => busySkeleton.textContent === '')
}
