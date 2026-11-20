import { useState } from 'react'
import { offerLabel } from '@/entities/offer'
import {
  addStreamOffer,
  pushStreamOffers,
  removeStreamOffer,
  resetStreamOffers,
  restoreStreamOffer,
  updateStreamOffer,
  type DraftOffer,
  type OfferStats,
  type Stats,
  type StreamDraft,
} from '@/shared/api'
import { Alert, Badge, Button } from '@/shared/ui'
import { exactShare, isFullShare } from '../lib/share'
import { AddOfferForm } from './AddOfferForm'
import { IconButton, PinIcon, TrashIcon } from './IconButton'
import { RemovedOffers } from './RemovedOffers'
import { ShareInput } from './ShareInput'
import { STAT_COLUMNS, StatsCells } from './StatsCells'

const th = 'px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'
const NO_STATS: Stats = { clicks: 0, unique_clicks: 0, bots: 0 }

type OffersEditorProps = {
  campaignId: number
  streamId: number
  streamName: string
  draft: StreamDraft
  offerStats: OfferStats[]
  onDraft: (draft: StreamDraft) => void
  busy: boolean
}

function SyncBadge({ offer }: { offer: DraftOffer }) {
  if (offer.sync === 'new') {
    return (
      <Badge tone="amber" title="Not in the Keitaro flow yet: it is added on push">
        Not synced · new
      </Badge>
    )
  }
  if (offer.sync === 'changed') {
    return (
      <Badge tone="amber" title={`Keitaro has ${offer.keitaro_share}%; the new share is set on push`}>
        Not synced · {offer.keitaro_share}% in KT
      </Badge>
    )
  }
  return null
}

/**
 * Offers of a flow as a draft: adding, removing, restoring and manual shares stay in the wrapper
 * until "Push to KT". Unpinned offers split what pinned ones leave of 100% evenly.
 */
export function OffersEditor({
  campaignId,
  streamId,
  streamName,
  draft,
  offerStats,
  onDraft,
  busy,
}: OffersEditorProps) {
  // Which action is in flight, e.g. `pin-3749`: its button shows a spinner, the rest wait
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const locked = busy || pending !== null
  const stats = new Map(offerStats.map((s) => [s.offer_id, s.stats]))
  const offers = draft.offers
  const valid = isFullShare(draft.total_share) && offers.length > 0

  const run = async (key: string, action: () => Promise<StreamDraft>) => {
    setPending(key)
    setError(null)
    try {
      onDraft(await action())
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setPending(null)
    }
  }

  const push = () => run('push', () => pushStreamOffers(campaignId, streamId))
  const reset = () => {
    if (!confirm('Drop the changes that are not pushed to Keitaro?')) return
    void run('reset', () => resetStreamOffers(campaignId, streamId))
  }
  const remove = (offerId: number) =>
    run(`remove-${offerId}`, () => removeStreamOffer(campaignId, streamId, offerId))
  const setShare = (offerId: number, share: number) =>
    run(`share-${offerId}`, () => updateStreamOffer(campaignId, streamId, offerId, { share }))
  const togglePin = (o: DraftOffer) =>
    run(`pin-${o.offer_id}`, () => updateStreamOffer(campaignId, streamId, o.offer_id, { pinned: !o.pinned }))

  return (
    <>
      <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <AddOfferForm
          streamName={streamName}
          exclude={offers.map((o) => o.offer_id)}
          disabled={locked}
          onAdd={(offerId) => run('add', () => addStreamOffer(campaignId, streamId, offerId))}
        />
        {error && <Alert>{error}</Alert>}
      </div>

      {(draft.dirty || !valid) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10">
          <Button onClick={push} loading={pending === 'push'} disabled={locked || !valid} className="py-1.5">
            Push to KT
          </Button>
          <Button variant="secondary" onClick={reset} loading={pending === 'reset'} disabled={locked} className="py-1.5">
            Cancel
          </Button>
          <span className="text-sm text-amber-900 dark:text-amber-200">
            {valid
              ? 'Changes are saved in the wrapper and reach Keitaro on push.'
              : `Shares sum to ${exactShare(draft.total_share)}%: they have to sum to 100% to push. Edit or unpin a share.`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className={`${th} text-left`}>Offer</th>
              <th className={`${th} w-64 text-left`}>Share</th>
              {STAT_COLUMNS.map(({ key, label }) => (
                <th key={key} className={`${th} w-20 text-right`}>
                  {label}
                </th>
              ))}
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-300">
            {offers.map((o) => (
              <tr key={o.offer_id} className={o.sync === 'synced' ? '' : 'bg-amber-50/60 dark:bg-amber-500/5'}>
                <td className="max-w-md px-3 py-2.5 text-sm">
                  <div className="truncate" title={o.name ?? undefined}>
                    {offerLabel(o.offer_id, o.name)}
                  </div>
                  {(o.sync !== 'synced' || o.offer_deleted) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <SyncBadge offer={o} />
                      {o.offer_deleted && (
                        <Badge tone="red" title="The offer is deleted or archived in Keitaro">
                          Deleted in Keitaro
                        </Badge>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${o.pinned ? 'bg-indigo-700 dark:bg-indigo-400' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(o.share, 100)}%` }}
                      />
                    </div>
                    <ShareInput
                      key={o.share}
                      offerId={o.offer_id}
                      share={o.share}
                      disabled={locked || o.pinned}
                      title={o.pinned ? 'Pinned: unpin to change the share' : 'Set the share manually, it gets pinned'}
                      onCommit={(share) => setShare(o.offer_id, share)}
                    />
                    <IconButton
                      label={o.pinned ? `Unpin offer ${o.offer_id}` : `Pin the share of offer ${o.offer_id}`}
                      title={
                        o.pinned
                          ? 'Pinned: locked and kept when shares are recalculated. Click to unpin and edit'
                          : 'Pin: keep this share when shares are recalculated'
                      }
                      icon={<PinIcon filled={o.pinned} />}
                      active={o.pinned}
                      aria-pressed={o.pinned}
                      pending={pending === `pin-${o.offer_id}`}
                      disabled={locked}
                      onClick={() => void togglePin(o)}
                    />
                  </div>
                </td>
                <StatsCells stats={stats.get(o.offer_id) ?? NO_STATS} />
                <td className="px-2 py-1 text-right">
                  <IconButton
                    label={`Remove offer ${o.offer_id}`}
                    title={offers.length <= 1 ? 'The last offer of a flow cannot be removed' : 'Remove offer'}
                    icon={<TrashIcon />}
                    tone="danger"
                    pending={pending === `remove-${o.offer_id}`}
                    disabled={locked || offers.length <= 1}
                    onClick={() => void remove(o.offer_id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 text-sm dark:border-slate-800">
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Total</td>
              <td
                className={`px-3 py-2 font-medium tabular-nums ${
                  isFullShare(draft.total_share) ? 'text-slate-700 dark:text-slate-300' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {exactShare(draft.total_share)}%
              </td>
              <td colSpan={STAT_COLUMNS.length + 1} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="border-t border-slate-200 p-4 empty:hidden dark:border-slate-800">
        <RemovedOffers
          offers={draft.removed}
          pending={pending}
          disabled={locked}
          onRestore={(offerId) =>
            void run(`restore-${offerId}`, () => restoreStreamOffer(campaignId, streamId, offerId))
          }
        />
      </div>
    </>
  )
}
