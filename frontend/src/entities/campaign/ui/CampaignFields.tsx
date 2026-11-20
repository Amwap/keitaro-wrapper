import type { Option } from '@/shared/api'
import { countryName } from '@/shared/lib'
import { Badge, Input, Select } from '@/shared/ui'

export const fieldLabel = 'block text-sm font-medium text-slate-700 dark:text-slate-300'

type RefSelectProps = {
  title: string
  options: (Option & { url?: string })[]
  value: string
  onChange: (value: string) => void
  /** Label of the empty option; without it a value has to be chosen once one is set. */
  emptyLabel?: string
}

/** Domain, group or traffic source. */
export function RefSelect({ title, options, value, onChange, emptyLabel }: RefSelectProps) {
  const items = options.map((o) => ({ value: String(o.id), label: o.url ?? o.name, title: o.name }))
  const empty = emptyLabel ?? (value ? undefined : '—')
  // The current value may be gone from the list (archived in Keitaro): keep it visible
  if (value && !options.some((o) => String(o.id) === value)) {
    items.unshift({ value, label: `#${value}`, title: '' })
  }
  return (
    <label className="block">
      <span className={fieldLabel}>{title}</span>
      <Select
        label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full py-2.5"
        options={empty === undefined ? items : [{ value: '', label: empty }, ...items]}
      />
    </label>
  )
}

type GeoInputProps = {
  value: string
  onChange: (value: string) => void
  /** Codes parsed from `value`. */
  geo: string[]
  invalid: string[]
}

/** Comma-separated country codes with a badge per recognised country. */
export function GeoInput({ value, onChange, geo, invalid }: GeoInputProps) {
  return (
    <div>
      <Input
        label="Geo"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="MX,AU,RO"
        aria-invalid={invalid.length ? true : undefined}
        aria-describedby="geo-hint"
        required
      />
      <div id="geo-hint" className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5">
        {geo.length ? (
          geo.map((code) => {
            const country = countryName(code)
            return country ? (
              <Badge key={code} tone="indigo">
                {code} · {country}
              </Badge>
            ) : (
              <span
                key={code}
                className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-500/10 dark:text-red-300"
              >
                {code} · unknown
              </span>
            )
          })
        ) : (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ISO country codes separated by commas. Visitors from these countries go to Google.
          </span>
        )}
      </div>
    </div>
  )
}
