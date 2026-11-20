import { useState, type FormEvent } from 'react'
import { GeoSelect, RefSelect } from '@/entities/campaign'
import { fieldErrors, getFormOptions, updateCampaign, type CampaignDetail, type CampaignUpdate } from '@/shared/api'
import { countryName, useFieldErrors, useRequest } from '@/shared/lib'
import { Alert, Button, Card, Input, Spinner } from '@/shared/ui'

const initial = (id: number | null) => (id === null ? '' : String(id))
const sameGeo = (a: string[], b: string[]) => a.join(',') === b.join(',')

type EditCampaignFormProps = {
  campaign: CampaignDetail
  onSaved: () => void
}

/**
 * The fields of the creation form except the offer: the offers flow has its own editor.
 * Always shown on the campaign page; only the changed fields are sent, Cancel drops the changes.
 * The alias stays, so only a new domain changes the URL.
 */
export function EditCampaignForm({ campaign, onSaved }: EditCampaignFormProps) {
  const { data: options, error: optionsError } = useRequest('form-options', getFormOptions)
  const [name, setName] = useState(campaign.name)
  const [geo, setGeo] = useState(campaign.geo)
  const [domain, setDomain] = useState(initial(campaign.domain_id))
  const [group, setGroup] = useState(initial(campaign.group_id))
  const [source, setSource] = useState(initial(campaign.traffic_source_id))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { errorOf, setErrors, tracked } = useFieldErrors()

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
  const dirty = Object.keys(changes()).length > 0

  const reset = () => {
    setName(campaign.name)
    setGeo(campaign.geo)
    setDomain(initial(campaign.domain_id))
    setGroup(initial(campaign.group_id))
    setSource(initial(campaign.traffic_source_id))
    setError(null)
    setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const geoError = !hasGeoFlow
      ? null
      : !geo.length
        ? 'Choose at least one country.'
        : invalidGeo.length
          ? `Unknown country codes: ${invalidGeo.join(', ')}.`
          : null
    if (geoError) {
      setError(null)
      return setErrors({ geo: geoError })
    }
    const data = changes()
    if (!Object.keys(data).length) return
    setError(null)
    setPending(true)
    try {
      await updateCampaign(campaign.id, data)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setErrors(fieldErrors(e))
    } finally {
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
            onChange={(e) => tracked('name', setName)(e.target.value)}
            error={errorOf('name')}
            maxLength={255}
            required
          />

          {hasGeoFlow ? (
            <GeoSelect value={geo} onChange={tracked('geo', setGeo)} error={errorOf('geo')} />
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The campaign has no geo flow, so there are no countries to edit.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <RefSelect
              title="Domain"
              options={options.domains}
              value={domain}
              onChange={tracked('domain_id', setDomain)}
              error={errorOf('domain_id')}
            />
            <RefSelect
              title="Group"
              options={options.groups}
              value={group}
              onChange={tracked('group_id', setGroup)}
              error={errorOf('group_id')}
            />
            <RefSelect
              title="Traffic source"
              options={options.traffic_sources}
              value={source}
              onChange={tracked('traffic_source_id', setSource)}
              error={errorOf('traffic_source_id')}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            The campaign path stays the same; a new domain changes the campaign URL.
          </p>

          {error && <Alert>{error}</Alert>}

          <div className="flex gap-2">
            <Button type="submit" loading={pending} disabled={!dirty}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} disabled={pending || !dirty}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}
