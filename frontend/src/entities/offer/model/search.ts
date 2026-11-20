import { searchOffers, type OfferOption } from '@/shared/api'
import type { ComboOption, ComboSearch } from '@/shared/ui'

export const offerLabel = (id: number, name: string | null) => `[${id}] ${name ?? 'Unknown offer'}`

const toOption = (o: OfferOption): ComboOption => ({
  value: String(o.id),
  label: offerLabel(o.id, o.name),
  title: o.name,
  hint: o.countries.length ? o.countries.slice(0, 3).join(', ') : o.group ?? undefined,
})

/** Combobox search over Keitaro offers, without the ids in `exclude`. */
export const offerSearch =
  (exclude: number[] = []): ComboSearch =>
  async (query, signal) =>
    (await searchOffers(query, signal)).filter((o) => !exclude.includes(o.id)).map(toOption)
