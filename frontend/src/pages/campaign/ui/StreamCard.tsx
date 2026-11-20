import { useState } from 'react'
import { offerLabel } from '@/entities/offer'
import type { Stream } from '@/shared/api'
import { countryName, formatNumber } from '@/shared/lib'
import { Alert, Badge, Card } from '@/shared/ui'
import { AddOfferForm } from './AddOfferForm'
import { RemoveOfferButton } from './RemoveOfferButton'
import { STAT_COLUMNS, StatsCells } from './StatsCells'

const OFFERS_SCHEMA = 'landings'
const th = 'px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'

type StreamCardProps = {
  campaignId: number
  stream: Stream
  /** Reloads the campaign after its offers changed. */
  onChanged: () => void
  /** A reload is in flight: buttons wait for the fresh shares. */
  busy: boolean
}

export function StreamCard({ campaignId, stream, onChanged, busy }: StreamCardProps) {
  const [error, setError] = useState<string | null>(null)
  const editable = stream.schema === OFFERS_SCHEMA
  const changed = () => {
    setError(null)
    onChanged()
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {stream.position}
        </span>
        <h2 className="font-semibold text-slate-900 dark:text-white">{stream.name || `Flow ${stream.id}`}</h2>
        <Badge tone={editable ? 'indigo' : 'sky'}>{editable ? 'Offers' : 'Redirect'}</Badge>
        {stream.state !== 'active' && <Badge>{stream.state}</Badge>}
        <span className="ml-auto text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {STAT_COLUMNS.map(({ key, label }) => `${label} ${formatNumber(stream.stats[key])}`).join(' · ')}
        </span>
      </div>

      {stream.countries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-sm text-slate-600 dark:text-slate-400">
          Countries:
          {stream.countries.map((c) => (
            <Badge key={c} tone="indigo">
              <span title={countryName(c) ?? undefined}>{c}</span>
            </Badge>
          ))}
        </div>
      )}

      {stream.redirect_url && (
        <p className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
          Redirect to{' '}
          <a href={stream.redirect_url} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            {stream.redirect_url}
          </a>
        </p>
      )}

      {editable && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className={`${th} text-left`}>Offer</th>
                  <th className={`${th} w-48 text-left`}>Share</th>
                  {STAT_COLUMNS.map(({ key, label }) => (
                    <th key={key} className={`${th} w-20 text-right`}>
                      {label}
                    </th>
                  ))}
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 dark:divide-slate-800 dark:text-slate-300">
                {stream.offers.map((o) => (
                  <tr key={o.offer_id}>
                    <td className="max-w-md truncate px-3 py-2.5 text-sm" title={o.name ?? undefined}>
                      {offerLabel(o.offer_id, o.name)}
                      {o.state !== 'active' && (
                        <span className="ml-2">
                          <Badge>{o.state}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${o.share}%` }} />
                        </div>
                        <span className="w-10 text-right text-sm font-medium tabular-nums">{o.share}%</span>
                      </div>
                    </td>
                    <StatsCells stats={o.stats} />
                    <td className="px-2 py-1 text-right">
                      <RemoveOfferButton
                        campaignId={campaignId}
                        streamId={stream.id}
                        offerId={o.offer_id}
                        disabled={busy || stream.offers.length <= 1}
                        onRemoved={changed}
                        onError={setError}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-800">
            {error && <Alert>{error}</Alert>}
            <AddOfferForm campaignId={campaignId} stream={stream} onAdded={changed} />
          </div>
        </>
      )}
    </Card>
  )
}
