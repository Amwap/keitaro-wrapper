import type { ReactNode } from 'react'
import type { Option } from '@/shared/api'
import { countryName, listCountries } from '@/shared/lib'
import { Combobox, FieldError, Select, type ComboSearch } from '@/shared/ui'

export const fieldLabel = 'block text-sm font-medium text-slate-700 dark:text-slate-300'

type RefSelectProps = {
  title: string
  options: (Option & { url?: string })[]
  value: string
  onChange: (value: string) => void
  /** Label of the empty option; without it a value has to be chosen once one is set. */
  emptyLabel?: string
  /** Highlights the field and shows the message under it. */
  error?: string
  /** Shown next to the title, e.g. a button that creates an option. */
  action?: ReactNode
}

/** Domain, group or traffic source. */
export function RefSelect({ title, options, value, onChange, emptyLabel, error, action }: RefSelectProps) {
  const items = options.map((o) => ({ value: String(o.id), label: o.url ?? o.name, title: o.name }))
  const empty = emptyLabel ?? (value ? undefined : '—')
  // The current value may be gone from the list (archived in Keitaro): keep it visible
  if (value && !options.some((o) => String(o.id) === value)) {
    items.unshift({ value, label: `#${value}`, title: '' })
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className={fieldLabel}>{title}</span>
        {action}
      </div>
      <Select
        label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full py-2.5"
        options={empty === undefined ? items : [{ value: '', label: empty }, ...items]}
        aria-invalid={error ? true : undefined}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

const geoLabel = (code: string) => `${code} · ${countryName(code) ?? 'unknown'}`

/** Countries whose code starts with the query first, then those whose name contains it. */
const searchCountries: ComboSearch = async (query) => {
  const q = query.toLowerCase()
  const countries = listCountries()
  const byCode = countries.filter((c) => c.code.toLowerCase().startsWith(q))
  const byName = countries.filter((c) => !byCode.includes(c) && c.name.toLowerCase().includes(q))
  return [...byCode, ...byName].map((c) => ({ value: c.code, label: geoLabel(c.code) }))
}

type GeoSelectProps = {
  value: string[]
  onChange: (value: string[]) => void
  /** Highlights the field and shows the message under it. */
  error?: string
}

/** Countries of the flow that goes to Google, picked from the list as chips. */
export function GeoSelect({ value, onChange, error }: GeoSelectProps) {
  return (
    <div>
      <span className={fieldLabel}>Geo</span>
      <Combobox
        label="Geo"
        value={value}
        onChange={onChange}
        search={searchCountries}
        labelOf={(code) => ({ label: geoLabel(code) })}
        multiple
        placeholder="Search by code or name"
        invalid={!!error}
        className="mt-1.5"
      />
      {error ? (
        <FieldError>{error}</FieldError>
      ) : (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Visitors from these countries go to Google.
        </p>
      )}
    </div>
  )
}
