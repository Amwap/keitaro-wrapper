import { useState, type FormEvent } from 'react'
import { GeoInput, RefSelect } from '@/entities/campaign'
import { getFormOptions, updateCampaign, type CampaignDetail, type CampaignUpdate } from '@/shared/api'
import { countryName, parseGeo, useRequest } from '@/shared/lib'
import { Alert, Button, Card, Input, Spinner } from '@/shared/ui'

const initial = (id: number | null) => (id === null ? '' : String(id))
const sameGeo = (a: string[], b: string[]) => a.join(',') === b.join(',')

type EditCampaignFormProps = {
  campaign: CampaignDetail
  onSaved: () => void
  onCancel: () => void
}

/**
 * The fields of the creation form except the offer: the offers flow has its own editor.
 * Only the changed fields are sent; the alias stays, so only a new domain changes the URL.
 */
export function EditCampaignForm({ campaign, onSaved, onCancel }: EditCampaignFormProps) {
  const { data: options, error: optionsError } = useRequest('form-options', getFormOptions)
  const [name, setName] = useState(campaign.name)
  const [geoText, setGeoText] = useState(campaign.geo.join(','))
  const [domain, setDomain] = useState(initial(campaign.domain_id))
  const [group, setGroup] = useState(initial(campaign.group_id))
  const [source, setSource] = useState(initial(campaign.traffic_source_id))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geo = parseGeo(geoText)
  const invalidGeo = geo.filter((c) => !countryName(c))
  const hasGeoFlow = campaign.geo.length > 0

  const changes = (): CampaignUpdate => {
    const data: CampaignUpdate = {}
    if (name.trim() !== campaign.name) data.name = name.trim()
    if (hasGeoFlow && !sameGeo(geo, campaign.geo)) data.geo = geo
    if (domain !== initial(campaign.domain_id)) data.domain_id = Number(domain)
    if (group !== initial(campaign.group_id)) data.group_id = Number(group)
    if (source !== initial(campaign.traffic_source_id)) data.traffic_source_id = Number(source)
    return data
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (hasGeoFlow && !geo.length) return setError('Enter at least one country code.')
    if (hasGeoFlow && invalidGeo.length) return setError(`Unknown country codes: ${invalidGeo.join(', ')}.`)
    const data = changes()
    if (!Object.keys(data).length) return onCancel()
    setError(null)
    setPending(true)
    try {
      await updateCampaign(campaign.id, data)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Campaign settings</h2>
      {optionsError ? (
        <Alert>Could not load domains, groups and sources: {optionsError.message}</Alert>
      ) : !options ? (
        <div className="flex justify-center py-8 text-indigo-600">
          <Spinner />
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-2xl space-y-5">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
            required
            autoFocus
          />

          {hasGeoFlow ? (
            <GeoInput value={geoText} onChange={setGeoText} geo={geo} invalid={invalidGeo} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The campaign has no geo flow, so there are no countries to edit.
            </p>
          )}

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
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The campaign path stays the same; a new domain changes the campaign URL.
          </p>

          {error && <Alert>{error}</Alert>}

          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
