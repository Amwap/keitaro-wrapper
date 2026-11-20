import { useEffect, useState } from 'react'

type CopyButtonProps = {
  value: string
  /** What is copied, for the tooltip and screen readers. */
  label?: string
  className?: string
}

/** Copies `value` to the clipboard and shows a check mark for a moment. */
export function CopyButton({ value, label = 'value', className = '' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timer = setTimeout(() => setState('idle'), 1500)
    return () => clearTimeout(timer)
  }, [state])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      // No clipboard API outside a secure context (plain http on a non-localhost host)
      setState(copyWithSelection(value) ? 'copied' : 'failed')
    }
  }

  const title = state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : `Copy ${label}`
  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      aria-label={title}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 ${
        state === 'copied' ? 'text-emerald-600 dark:text-emerald-400' : state === 'failed' ? 'text-red-600' : ''
      } ${className}`}
    >
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {state === 'copied' ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16M5.5 8h9A1.5 1.5 0 0 1 16 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 18.5v-9A1.5 1.5 0 0 1 5.5 8Z" />
        )}
      </svg>
    </button>
  )
}

function copyWithSelection(value: string): boolean {
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
