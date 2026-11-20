import { useMemo, useState } from 'react'
import type { CampaignDetail } from '@/shared/api'
import { Card, CopyButton, ExternalLink, SegmentedControl } from '@/shared/ui'
import { buildIntegrations, randomDivId, type IntegrationKind } from '../lib/integration'

/** What goes into the traffic source or the site, each value with a copy button. */
export function TrackingCard({ campaign }: { campaign: CampaignDetail }) {
  const rows = [
    { label: 'Campaign URL', value: campaign.tracking_url },
    ...(campaign.tracking_url !== campaign.url ? [{ label: 'URL without parameters', value: campaign.url }] : []),
    { label: 'Alias', value: campaign.alias },
    { label: 'Campaign ID', value: String(campaign.id) },
    ...(campaign.token ? [{ label: 'Token', value: campaign.token }] : []),
  ]

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-white">Tracking</h2>
      <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
            <dt className="shrink-0 text-slate-500 sm:w-44 dark:text-slate-400">{label}</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-slate-800 dark:text-slate-200" title={value}>
                {value}
              </code>
              <CopyButton value={value} label={label.toLowerCase()} />
            </dd>
          </div>
        ))}
      </dl>
      <IntegrationCode campaign={campaign} />
    </Card>
  )
}

function IntegrationCode({ campaign }: { campaign: CampaignDetail }) {
  // Kept for the page's life, so the code does not change between renders
  const [divId] = useState(randomDivId)
  const integrations = useMemo(() => buildIntegrations(campaign, divId), [campaign, divId])
  const [kind, setKind] = useState<IntegrationKind>('tracking_script')
  const current = integrations.find((i) => i.kind === kind) ?? integrations[0]

  return (
    <div className="mt-6 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Code for the site</h3>
        <SegmentedControl
          label="Integration"
          value={current.kind}
          options={integrations.map((i) => ({ value: i.kind, label: i.label }))}
          onChange={setKind}
        />
      </div>
      <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">{current.hint}</p>
      {current.kind === 'tracking_script' && !campaign.postback_url && (
        <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
          Conversions will not be reported: set KEITARO_POSTBACK_SECRET on the backend.
        </p>
      )}
      <div className="relative">
        <textarea
          readOnly
          value={current.code}
          rows={Math.min(14, current.code.split('\n').length + 1)}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`${current.label} code`}
          className="block w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 pr-11 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <CopyButton value={current.code} label="code" className="absolute top-2 right-2" />
      </div>
      {campaign.keitaro_link && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Other options (KClient JS, iframe, banners, WordPress) are on the Tracking tab in{' '}
          <ExternalLink href={campaign.keitaro_link}>Keitaro</ExternalLink>.
        </p>
      )}
    </div>
  )
}
