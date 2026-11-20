import { useId, type InputHTMLAttributes } from 'react'
import { FieldError } from './FieldError'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Highlights the field and shows the message under it. */
  error?: string
}

export function Input({ label, id, error, className = '', ...props }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <input
        id={inputId}
        className="mt-1.5 block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none disabled:opacity-60 aria-invalid:ring-red-500 dark:bg-slate-950 dark:text-white dark:ring-slate-700 dark:focus:ring-indigo-500"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error && <FieldError id={`${inputId}-error`}>{error}</FieldError>}
    </div>
  )
}
