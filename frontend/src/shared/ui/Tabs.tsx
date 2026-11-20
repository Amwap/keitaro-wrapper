import { useRef, type KeyboardEvent, type ReactNode } from 'react'

type TabsProps<T extends string> = {
  label: string
  value: T
  tabs: { value: T; label: ReactNode }[]
  onChange: (value: T) => void
}

/** Underlined tab bar; the panel is rendered by the caller with `tabPanelProps`. */
export function Tabs<T extends string>({ label, value, tabs, onChange }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + tabs.length) % tabs.length
    onChange(tabs[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
      {tabs.map((tab, index) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            id={`tab-${tab.value}`}
            aria-selected={active}
            aria-controls={`tabpanel-${tab.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
              active
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export const tabPanelProps = (value: string) => ({
  role: 'tabpanel' as const,
  id: `tabpanel-${value}`,
  'aria-labelledby': `tab-${value}`,
})
