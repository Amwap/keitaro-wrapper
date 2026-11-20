import { useMemo, useState, type FormEvent } from 'react'
import { offerSearch } from '@/entities/offer'
import { addStreamOffer, type Stream } from '@/shared/api'
import { Alert, Button, Combobox } from '@/shared/ui'

type AddOfferFormProps = {
  campaignId: number
  stream: Stream
  /** Called after the offer is added, to reload the campaign. */
  onAdded: () => Promise<void> | void
}

/** Picks an offer that is not in the flow yet; shares are then split evenly by the server. */
export function AddOfferForm({ campaignId, stream, onAdded }: AddOfferFormProps) {
  const [offer, setOffer] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = stream.offers.map((o) => o.offer_id).join(',')
  const search = useMemo(() => offerSearch(ids ? ids.split(',').map(Number) : []), [ids])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!offer.length) return
    setPending(true)
    setError(null)
    try {
      await addStreamOffer(campaignId, stream.id, Number(offer[0]))
      setOffer([])
      await onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Combobox
          key={ids}
          label={`Add an offer to ${stream.name}`}
          value={offer}
          onChange={setOffer}
          search={search}
          placeholder="Add an offer: search by id or name"
          className="flex-1"
        />
        <Button type="submit" loading={pending} disabled={!offer.length} className="py-2">
          Add offer
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  )
}
