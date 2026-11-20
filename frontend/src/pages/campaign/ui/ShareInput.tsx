import { useState, type KeyboardEvent } from 'react'
import { exactShare, shownShare } from '../lib/share'

type ShareInputProps = {
  offerId: number
  share: number
  disabled: boolean
  title?: string
  /** Called with the new share (the offer gets pinned); resolves to false when it failed. */
  onCommit: (share: number) => Promise<boolean>
}

/**
 * Manual share: shown rounded down, the exact value (33.33) while it is edited.
 * Saved on Enter or blur, Escape reverts. Remount on a new `share`.
 */
export function ShareInput({ offerId, share, disabled, title, onCommit }: ShareInputProps) {
  const exact = String(exactShare(share))
  const [value, setValue] = useState(exact)
  const [editing, setEditing] = useState(false)

  const commit = () => {
    setEditing(false)
    const next = Number(value)
    if (value.trim() === '' || !Number.isFinite(next) || next < 0 || next > 100 || value === exact) {
      setValue(exact)
      return
    }
    void onCommit(next).then((ok) => ok || setValue(exact))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      const input = e.currentTarget
      setValue(exact)
      // Blur after the reset renders, so the blur doesn't commit the edited value
      requestAnimationFrame(() => input.blur())
    }
  }

  return (
    <label className="flex items-center gap-0.5 text-sm font-medium tabular-nums">
      <span className="sr-only">Share of offer {offerId}, %</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="any"
        value={editing ? value : shownShare(share)}
        disabled={disabled}
        title={title}
        onFocus={() => {
          setValue(exact)
          setEditing(true)
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-16 rounded-md border-0 bg-white px-1.5 py-1 text-right ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60 dark:bg-slate-950 dark:ring-slate-700 dark:focus:ring-indigo-500 [&::-webkit-inner-spin-button]:appearance-none"
      />
      %
    </label>
  )
}
