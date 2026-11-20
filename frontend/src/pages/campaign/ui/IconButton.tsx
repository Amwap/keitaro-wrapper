import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from '@/shared/ui'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  /** Accessible name, also the tooltip unless `title` is given. */
  label: string
  icon: ReactNode
  tone?: 'default' | 'danger'
  /** Toggle buttons: shown highlighted when on. */
  active?: boolean
  pending?: boolean
}

const tones = {
  default:
    'hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400',
  danger: 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400',
}

export function IconButton({
  label,
  icon,
  tone = 'default',
  active = false,
  pending = false,
  disabled,
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={title ?? label}
      aria-label={label}
      className={`inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'
      } ${tones[tone]}`}
      {...props}
    >
      {pending ? <Spinner className="size-4" /> : icon}
    </button>
  )
}

const svg = {
  className: 'size-4',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export const TrashIcon = () => (
  <svg {...svg}>
    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
)

export const PinIcon = ({ filled = false }: { filled?: boolean }) => (
  <svg {...svg} fill={filled ? 'currentColor' : 'none'}>
    <path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
    <path d="M12 15v5" />
  </svg>
)
