import { cn } from '@/lib/utils'

interface FormFieldErrorProps {
  /** Referenced by the field's `aria-describedby`. */
  id: string
  /** The error to show; nothing is shown without one. */
  message: string | undefined
  className?: string
}

/** The error under a form field, which the field links to while it's invalid. */
export function FormFieldError({ id, message, className }: FormFieldErrorProps) {
  if (!message) return null
  return (
    <p id={id} className={cn('text-sm text-destructive', className)}>
      {message}
    </p>
  )
}
