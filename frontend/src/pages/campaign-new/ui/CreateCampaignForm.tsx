import { useState, type FormEvent } from 'react'
import { offerSearch } from '@/entities/offer'
import { createCampaign, type CampaignSummary, type FormOptions, type Option } from '@/shared/api'
import { countryName, parseGeo } from '@/shared/lib'
import { Alert, Badge, Button, Combobox, Input, Select } from '@/shared/ui'

const label = 'block text-sm font-medium text-slate-700 dark:text-slate-300'
const search = offerSearch()

type RefSelectProps = {
  title: string
  options: (Option & { url?: string })[]
  value: string
  onChange: (value: string) => void
}

function RefSelect({ title, options, value, onChange }: RefSelectProps) {
  return (
    <label className="block">
      <span className={label}>{title}</span>
      <Select
        label={title}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full py-2.5"
        options={[
          { value: '', label: 'Server default' },
          ...options.map((o) => ({ value: String(o.id), label: o.url ?? o.name, title: o.name })),
        ]}
      />
    </label>
  )
}

const initial = (id: number | null) => (id === null ? '' : String(id))
const optional = (value: string) => (value ? Number(value) : undefined)

type CreateCampaignFormProps = {
  options: FormOptions
  onCreated: (campaign: CampaignSummary) => void
}

/** Name, geo and offer, plus the domain, group and source preset from the server settings. */
export function CreateCampaignForm({ options, onCreated }: CreateCampaignFormProps) {
  const { defaults } = options
  const [name, setName] = useState('')
  const [geoText, setGeoText] = useState('')
  const [offer, setOffer] = useState<string[]>([])
  const [domain, setDomain] = useState(initial(defaults.domain_id))
  const [group, setGroup] = useState(initial(defaults.group_id))
  const [source, setSource] = useState(initial(defaults.traffic_source_id))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geo = parseGeo(geoText)
  const invalidGeo = geo.filter((c) => !countryName(c))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!geo.length) return setError('Enter at least one country code.')
    if (invalidGeo.length) return setError(`Unknown country codes: ${invalidGeo.join(', ')}.`)
    if (!offer.length) return setError('Choose an offer.')
    setError(null)
    setPending(true)
    try {
      onCreated(
        await createCampaign({
          name: name.trim(),
          geo,
          offer_id: Number(offer[0]),
          domain_id: optional(domain),
          group_id: optional(group),
          traffic_source_id: optional(source),
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={255}
        required
        autoFocus
      />

      <div>
        <Input
          label="Geo"
          value={geoText}
          onChange={(e) => setGeoText(e.target.value)}
          placeholder="MX,AU,RO"
          aria-invalid={invalidGeo.length ? true : undefined}
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

      <div>
        <span className={label}>Offer</span>
        <Combobox
          label="Offer"
          value={offer}
          onChange={setOffer}
          search={search}
          placeholder="Search by id or name"
          className="mt-1.5"
        />
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Everyone else is sent to this offer.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <RefSelect title="Domain" options={options.domains} value={domain} onChange={setDomain} />
        <RefSelect title="Group" options={options.groups} value={group} onChange={setGroup} />
        <RefSelect
          title="Traffic source"
          options={options.traffic_sources}
          value={source}
          onChange={setSource}
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" loading={pending}>
        {pending ? 'Creating…' : 'Create'}
      </Button>
    </form>
  )
}
