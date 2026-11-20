import type { ReactNode } from 'react'

type ExternalLinkProps = { href: string; className?: string; children: ReactNode }

/** Opens in a new tab, marked with an arrow. */
export function ExternalLink({ href, className = '', children }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 font-medium whitespace-nowrap text-indigo-600 hover:underline dark:text-indigo-400 ${className}`}
    >
      {children}
      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13.5 6H18v4.5M18 6l-7.5 7.5M16.5 13.5V18H6V7.5h4.5" />
      </svg>
    </a>
  )
}
