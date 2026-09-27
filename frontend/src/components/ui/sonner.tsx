import { CircleCheck, CircleX } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * Sonner's toaster in the app's colours: toasts read the theme tokens, so they follow the `.dark`
 * class like the rest of the UI.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" />,
        error: <CircleX className="size-4" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
