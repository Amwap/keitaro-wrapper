import type { ReactNode } from 'react'

/** Validation message under a form field. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-xs text-red-600 dark:text-red-400">
      {children}
    </p>
  )
}
