import { offerLabel } from '@/entities/offer'
import type { DraftOffer } from '@/shared/api'
import { formatDateTime } from '@/shared/lib'
import { Badge, Button } from '@/shared/ui'

type RemovedOffersProps = {
  offers: DraftOffer[]
  /** Key of the action in flight, `restore-<id>` shows a spinner on that row. */
  pending: string | null
  disabled: boolean
  onRestore: (offerId: number) => void
}

/** Offers removed from the flow here or in Keitaro; any of them can be brought back. */
export function RemovedOffers({ offers, pending, disabled, onRestore }: RemovedOffersProps) {
  if (!offers.length) return null

  return (
    <details className="group rounded-lg border border-slate-200 dark:border-slate-800">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-600 select-none hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        Removed offers ({offers.length})
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {offers.map((o) => (
          <li key={o.offer_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300" title={o.name ?? undefined}>
              {offerLabel(o.offer_id, o.name)}
            </span>
            {o.state === 'deleted' ? (
              <Badge tone="red" title="Removed from the flow right in Keitaro">
                Deleted in Keitaro
              </Badge>
            ) : (
              <Badge>Removed</Badge>
            )}
            {o.offer_deleted && o.state !== 'deleted' && (
              <Badge tone="red" title="The offer is deleted or archived in Keitaro">
                Offer deleted in Keitaro
              </Badge>
            )}
            {o.sync === 'removed' && (
              <Badge tone="amber" title="Keitaro still has the offer: it is removed on push">
                Not synced · {o.keitaro_share}% in KT
              </Badge>
            )}
            {o.removed_at && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(o.removed_at)}</span>
            )}
            <Button
              variant="secondary"
              className="px-3 py-1"
              loading={pending === `restore-${o.offer_id}`}
              disabled={disabled || o.offer_deleted}
              title={o.offer_deleted ? 'The offer is deleted in Keitaro' : 'Put the offer back into the flow'}
              onClick={() => onRestore(o.offer_id)}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  )
}
