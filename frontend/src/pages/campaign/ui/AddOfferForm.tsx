import { useMemo, useState, type FormEvent } from 'react'
import { offerSearch } from '@/entities/offer'
import { Button, SearchSelect } from '@/shared/ui'

type AddOfferFormProps = {
  streamName: string
  /** Offers already in the flow. */
  exclude: number[]
  disabled: boolean
  /** Adds the offer to the draft; resolves to false when it failed. */
  onAdd: (offerId: number) => Promise<boolean>
}

// Offers listed when the select opens; typing narrows them down
const LIST_SIZE = 10

/** Picks an offer from the whole Keitaro base; the free shares are then split evenly. */
export function AddOfferForm({ streamName, exclude, disabled, onAdd }: AddOfferFormProps) {
  const [offer, setOffer] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const ids = exclude.join(',')
  const search = useMemo(() => offerSearch(ids ? ids.split(',').map(Number) : [], LIST_SIZE), [ids])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (offer === null) return
    setPending(true)
    if (await onAdd(Number(offer))) setOffer(null)
    setPending(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <SearchSelect
        key={ids}
        label={`Add an offer to ${streamName}`}
        value={offer}
        onChange={setOffer}
        search={search}
        limit={LIST_SIZE}
        placeholder="Select an offer to add"
        searchPlaceholder="Id, name, group, country or network"
        disabled={disabled}
        className="flex-1"
      />
      <Button type="submit" loading={pending} disabled={disabled || offer === null} className="py-2">
        Add offer
      </Button>
    </form>
  )
}
