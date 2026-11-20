import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useDebounced } from '@/shared/lib/useDebounced'
import { useRequest } from '@/shared/lib/useRequest'
import { Spinner } from './Button'
import type { ComboOption, ComboSearch } from './Combobox'

type SearchSelectProps = {
  /** Accessible name of the field. */
  label: string
  value: string | null
  onChange: (value: string | null) => void
  /** Options matching the typed text; called with '' for the list shown on opening. */
  search: ComboSearch
  /** At most this many options are listed. */
  limit?: number
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}

const DEBOUNCE_MS = 200
// Panel: gap to the field, margin to the viewport edge, height limits
const GAP = 4
const EDGE = 8
const MAX_HEIGHT = 360
const MIN_ROOM = 200

const field =
  'flex w-full cursor-pointer items-center gap-2 rounded-md bg-white px-2.5 py-2 text-left text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950 dark:ring-slate-700 dark:focus:ring-indigo-500'

/**
 * A select in the spirit of select2: the field opens a panel with a search box on top and the
 * first `limit` options under it; typing filters them right away. Arrows and Enter pick,
 * Escape or a click outside closes.
 */
export function SearchSelect({
  label,
  value,
  onChange,
  search,
  limit = 10,
  placeholder = 'Select…',
  searchPlaceholder = 'Search',
  disabled = false,
  className = '',
}: SearchSelectProps) {
  const id = useId()
  const listId = `${id}-list`
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // Label of the picked option, so the field keeps it after the list has moved on
  const [picked, setPicked] = useState<ComboOption | null>(null)

  const debounced = useDebounced(query.trim(), DEBOUNCE_MS)
  const { data, loading, error } = useRequest(`search-select|${id}|${open}|${debounced}`, (signal) =>
    open ? search(debounced, signal) : Promise.resolve([]),
  )
  const options = (data ?? []).slice(0, limit)
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))
  const selected = value !== null && picked?.value === value ? picked : null

  // The panel sits in the top layer (popover API), so cards with hidden overflow don't clip it;
  // it follows the field on scroll and opens upwards when there's no room below
  useLayoutEffect(() => {
    const panel = panelRef.current
    const trigger = triggerRef.current
    if (!open || !panel || !trigger) return
    const place = () => {
      const r = trigger.getBoundingClientRect()
      const below = innerHeight - r.bottom - GAP - EDGE
      const above = r.top - GAP - EDGE
      const up = below < MIN_ROOM && above > below
      panel.style.left = `${r.left}px`
      panel.style.width = `${r.width}px`
      panel.style.maxHeight = `${Math.min(MAX_HEIGHT, up ? above : below)}px`
      panel.style.top = up ? 'auto' : `${r.bottom + GAP}px`
      panel.style.bottom = up ? `${innerHeight - r.top + GAP}px` : 'auto'
    }
    place()
    addEventListener('scroll', place, true)
    addEventListener('resize', place)
    return () => {
      removeEventListener('scroll', place, true)
      removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open'
      setOpen(isOpen)
      setQuery('')
      setActive(0)
    }
    panel.addEventListener('toggle', onToggle)
    return () => panel.removeEventListener('toggle', onToggle)
  }, [])

  // Keep the option picked with the arrow keys in view
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, listId])

  const close = () => {
    panelRef.current?.hidePopover()
    triggerRef.current?.focus()
  }

  const pick = (option: ComboOption) => {
    setPicked(option)
    onChange(option.value)
    close()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length) {
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive((i) => (i + step + options.length) % options.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (options[activeIndex]) pick(options[activeIndex])
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={id}
        disabled={disabled}
        aria-label={selected ? `${label}: ${selected.label}` : label}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected?.title}
        className={`${field} ${selected ? 'pr-12' : ''}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${selected ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}
        >
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden="true" className="text-xs text-slate-400">
          ▾
        </span>
      </button>
      {selected && !disabled && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange(null)}
          className="absolute top-1/2 right-7 -translate-y-1/2 cursor-pointer rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          ×
        </button>
      )}

      <div
        ref={panelRef}
        id={id}
        popover="auto"
        className="m-0 flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-sm text-slate-700 shadow-lg open:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        {open && (
          <>
            <div className="flex items-center gap-2 border-b border-slate-200 p-2 dark:border-slate-700">
              <input
                type="text"
                role="combobox"
                aria-label={`Search: ${label}`}
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={options.length ? `${listId}-${activeIndex}` : undefined}
                autoFocus
                autoComplete="off"
                maxLength={100}
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onKeyDown}
                className="w-full rounded border-0 bg-white px-2 py-1.5 text-slate-900 ring-1 ring-slate-300 ring-inset outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 dark:bg-slate-950 dark:text-white dark:ring-slate-700 dark:focus:ring-indigo-500"
              />
              {loading && <Spinner className="size-3.5 shrink-0 text-slate-400" />}
            </div>
            <ul id={listId} role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto p-1">
              {options.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  title={o.title}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 ${i === activeIndex ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint !== undefined && (
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-slate-400 dark:text-slate-500">
                      {o.hint}
                    </span>
                  )}
                </li>
              ))}
              {!loading && !error && options.length === 0 && (
                <li className="px-2 py-1.5 text-slate-500">{debounced ? 'No matches' : 'No options'}</li>
              )}
              {error && <li className="px-2 py-1.5 text-red-600 dark:text-red-400">{error.message}</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
