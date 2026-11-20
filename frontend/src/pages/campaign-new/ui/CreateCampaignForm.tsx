import { useState, type FormEvent } from 'react'
import { GeoInput, RefSelect, fieldLabel } from '@/entities/campaign'
import { offerSearch } from '@/entities/offer'
import { createCampaign, type CampaignSummary, type FormOptions } from '@/shared/api'
import { countryName, parseGeo } from '@/shared/lib'
import { Alert, Button, Combobox, Input } from '@/shared/ui'

const search = offerSearch()

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

      <GeoInput value={geoText} onChange={setGeoText} geo={geo} invalid={invalidGeo} />

      <div>
        <span className={fieldLabel}>Offer</span>
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
        <RefSelect
          title="Domain"
          options={options.domains}
          value={domain}
          onChange={setDomain}
          emptyLabel="Server default"
        />
        <RefSelect
          title="Group"
          options={options.groups}
          value={group}
          onChange={setGroup}
          emptyLabel="Server default"
        />
        <RefSelect
          title="Traffic source"
          options={options.traffic_sources}
          value={source}
          onChange={setSource}
          emptyLabel="Server default"
        />
      </div>

      {error && <Alert>{error}</Alert>}

      <Button type="submit" loading={pending}>
        {pending ? 'Creating…' : 'Create'}
      </Button>
    </form>
  )
}
