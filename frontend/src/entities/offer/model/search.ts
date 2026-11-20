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

/** A hidden offer's name is known only from the click report, otherwise it is just `#id`. */
const nameOf = (o: OfferOption) => (o.hidden && o.name === `#${o.id}` ? null : o.name)

const toOption = (o: OfferOption): ComboOption => ({
  value: String(o.id),
  label: offerLabel(o.id, nameOf(o)),
  title: nameOf(o) ?? undefined,
  hint: hintOf(o),
})

/**
 * Combobox search over the whole Keitaro offer base, without the ids in `exclude`.
 * Every word has to be a part of the id, name, group, country or affiliate network. An offer
 * hidden from the API key is searched by id and name if it ever got clicks, otherwise by its
 * exact id only.
 */
export const offerSearch =
  (exclude: number[] = [], limit = 20): ComboSearch =>
  async (query, signal) =>
    // Ask for the excluded ones on top, so the list still gets `limit` offers without them
    (await searchOffers(query, signal, Math.min(limit + exclude.length, 100)))
      .filter((o) => !exclude.includes(o.id))
      .slice(0, limit)
      .map(toOption)
