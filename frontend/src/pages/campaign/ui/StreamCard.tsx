import type { Stream, StreamDraft } from '@/shared/api'
import { countryName, formatNumber } from '@/shared/lib'
import { Badge, Card } from '@/shared/ui'
import { OffersEditor } from './OffersEditor'
import { STAT_COLUMNS } from './StatsCells'

type StreamCardProps = {
  campaignId: number
  stream: Stream
  /** The latest draft of the offers flow; edits return a fresh one. */
  draft: StreamDraft | null
  onDraft: (draft: StreamDraft) => void
  /** A reload is in flight: edits wait for it. */
  busy: boolean
}

export function StreamCard({ campaignId, stream, draft, onDraft, busy }: StreamCardProps) {
  const dirty = draft?.dirty ?? false

  return (
    <Card className={dirty ? 'ring-2 ring-amber-400 dark:ring-amber-500/60' : ''}>
      <div
        className={`flex flex-wrap items-center gap-2 border-b px-4 py-3 ${
          dirty
            ? 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {stream.position}
        </span>
        <h2 className="font-semibold text-slate-900 dark:text-white">{stream.name || `Flow ${stream.id}`}</h2>
        <Badge tone={draft ? 'indigo' : 'sky'}>{draft ? 'Offers' : 'Redirect'}</Badge>
        {stream.state !== 'active' && <Badge>{stream.state}</Badge>}
        {dirty && <Badge tone="amber">Not pushed to Keitaro</Badge>}
        <span className="ml-auto text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {STAT_COLUMNS.map(({ key, label }) => `${label} ${formatNumber(stream.stats[key])}`).join(' · ')}
        </span>
      </div>

      {stream.countries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3 text-sm text-slate-600 dark:text-slate-400">
          Countries:
          {stream.countries.map((c) => (
            <Badge key={c} tone="indigo" title={countryName(c) ?? undefined}>
              {c}
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

      {draft && (
        <OffersEditor
          campaignId={campaignId}
          streamId={stream.id}
          streamName={stream.name}
          draft={draft}
          offerStats={stream.offer_stats}
          onDraft={onDraft}
          busy={busy}
        />
      )}
    </Card>
  )
}
