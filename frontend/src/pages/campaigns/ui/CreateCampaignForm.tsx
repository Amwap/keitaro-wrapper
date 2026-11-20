import { useState, type FormEvent } from 'react'
import { GeoSelect, RefSelect, fieldLabel } from '@/entities/campaign'
import { offerSearch } from '@/entities/offer'
import { CreateGroupModal } from '@/features/create-group'
import { createCampaign, fieldErrors, type CampaignSummary, type FormOptions } from '@/shared/api'
import { useFieldErrors } from '@/shared/lib'
import { Alert, Button, Combobox, FieldError, Input } from '@/shared/ui'

const search = offerSearch()

const initial = (id: number | null) => (id === null ? '' : String(id))
const optional = (value: string) => (value ? Number(value) : undefined)

type CreateCampaignFormProps = {
  options: FormOptions
  onCreated: (campaign: CampaignSummary) => void
}

/** Name, geo and offers, plus the domain, group and source preset from the server settings. */
export function CreateCampaignForm({ options, onCreated }: CreateCampaignFormProps) {
  const { defaults } = options
  const [name, setName] = useState('')
  const [geo, setGeo] = useState<string[]>([])
  const [offers, setOffers] = useState<string[]>([])
  const [domain, setDomain] = useState(initial(defaults.domain_id))
  const [group, setGroup] = useState(initial(defaults.group_id))
  const [source, setSource] = useState(initial(defaults.traffic_source_id))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Groups created from the form are added to the list and picked
  const [groups, setGroups] = useState(options.groups)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const { errorOf, setErrors, tracked } = useFieldErrors()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const missing = {
      ...(!geo.length && { geo: 'Choose at least one country.' }),
      ...(!offers.length && { offer_ids: 'Choose at least one offer.' }),
    }
    setErrors(missing)
    if (Object.keys(missing).length) return setError(null)
    setError(null)
    setPending(true)
    try {
      onCreated(
        await createCampaign({
          name: name.trim(),
          geo,
          offer_ids: offers.map(Number),
          domain_id: optional(domain),
          group_id: optional(group),
          traffic_source_id: optional(source),
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setErrors(fieldErrors(e))
      setPending(false)
    }
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        <Input
          label="Name"
          value={name}
          onChange={(e) => tracked('name', setName)(e.target.value)}
          error={errorOf('name')}
          maxLength={255}
          required
          autoFocus
        />

        <GeoSelect value={geo} onChange={tracked('geo', setGeo)} error={errorOf('geo')} />

        <div>
          <span className={fieldLabel}>Offers</span>
          <Combobox
            label="Offers"
            value={offers}
            onChange={tracked('offer_ids', setOffers)}
            search={search}
            multiple
            placeholder="Search by id or name"
            invalid={!!errorOf('offer_ids')}
            className="mt-1.5"
          />
          {errorOf('offer_ids') ? (
            <FieldError>{errorOf('offer_ids')}</FieldError>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Everyone else is sent to these offers, the traffic is split evenly.
            </p>
          )}
        </div>

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
            options={groups}
            value={group}
            onChange={tracked('group_id', setGroup)}
            error={errorOf('group_id')}
            action={
              <button
                type="button"
                onClick={() => setCreatingGroup(true)}
                className="cursor-pointer text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                + New
              </button>
            }
          />
          <RefSelect
            title="Traffic source"
            options={options.traffic_sources}
            value={source}
            onChange={tracked('traffic_source_id', setSource)}
            error={errorOf('traffic_source_id')}
          />
        </div>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" loading={pending}>
          {pending ? 'Creating…' : 'Create'}
        </Button>
      </form>

      {/* Outside the campaign form: forms can't be nested */}
      <CreateGroupModal
        open={creatingGroup}
        onClose={() => setCreatingGroup(false)}
        prefix={options.group_prefix}
        onCreated={(created) => {
          setGroups((list) => [...list, { id: created.id, name: created.name }])
          tracked('group_id', setGroup)(String(created.id))
          setCreatingGroup(false)
        }}
      />
    </>
  )
}
