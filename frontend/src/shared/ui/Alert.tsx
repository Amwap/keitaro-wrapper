import type { ReactNode } from 'react'

export function Alert({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={`rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300 ${className}`}
    >
      {children}
    </p>
  )
}
