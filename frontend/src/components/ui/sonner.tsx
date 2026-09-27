import { CircleCheck, CircleX } from 'lucide-react'
import { useSyncExternalStore, type CSSProperties } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

type AppTheme = 'light' | 'dark'

/** The app's theme: dark while the page's root element has the `.dark` class. */
function readAppTheme(): AppTheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function watchAppTheme(onThemeChange: () => void): () => void {
  const classObserver = new MutationObserver(onThemeChange)
  classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => classObserver.disconnect()
}

/**
 * Sonner's toaster in the app's colours: toasts read the theme tokens, and Sonner's own styles
 * use the same theme, so both follow the `.dark` class like the rest of the UI.
 */
function Toaster(props: ToasterProps) {
  const appTheme = useSyncExternalStore(watchAppTheme, readAppTheme)
  return (
    <Sonner
      theme={appTheme}
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
