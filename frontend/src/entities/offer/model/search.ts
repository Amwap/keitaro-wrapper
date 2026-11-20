import { searchOffers, type OfferOption } from '@/shared/api'
import type { ComboOption, ComboSearch } from '@/shared/ui'

/** `name` is null for offers hidden from the API key. */
export const offerLabel = (id: number, name: string | null) => `[${id}] ${name ?? 'Hidden offer'}`

const hintOf = (o: OfferOption) =>
  o.hidden
    ? 'Not visible to the API key, goes into the flow by id'
    : [o.countries.slice(0, 3).join(', '), o.group, o.network && `net ${o.network}`]
        .filter(Boolean)
        .join(' · ') || undefined

const toOption = (o: OfferOption): ComboOption => ({
  value: String(o.id),
  label: offerLabel(o.id, o.hidden ? null : o.name),
  title: o.hidden ? undefined : o.name,
  hint: hintOf(o),
})

/**
 * Combobox search over the whole Keitaro offer base, without the ids in `exclude`.
 * Every word has to match the id, name, group, country or affiliate network; an offer hidden from
 * the API key is found by its exact id only.
 */
export const offerSearch =
  (exclude: number[] = [], limit = 20): ComboSearch =>
  async (query, signal) =>
    // Ask for the excluded ones on top, so the list still gets `limit` offers without them
    (await searchOffers(query, signal, Math.min(limit + exclude.length, 100)))
      .filter((o) => !exclude.includes(o.id))
      .slice(0, limit)
      .map(toOption)
