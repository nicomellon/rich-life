import { screen } from '@testing-library/react'

/** The busy element around the skeleton labelled `loadingLabel`, once it's shown. */
export async function findLoadingSkeleton(loadingLabel: string): Promise<Element | null> {
  const hiddenLabel = await screen.findByText(loadingLabel)
  return hiddenLabel.closest('[aria-busy="true"]')
}
