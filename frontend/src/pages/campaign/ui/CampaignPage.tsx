import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { DeleteCampaignButton } from '@/features/delete-campaign'
import { ApiError, getCampaign, type CampaignDetail, type Stream, type StreamDraft } from '@/shared/api'
import { useRequest } from '@/shared/lib'
import { Alert, Badge, Button, ExternalLink, PageHeader, Spinner, tabPanelProps, Tabs } from '@/shared/ui'
import { EditCampaignForm } from './EditCampaignForm'
import { StreamCard } from './StreamCard'
import { TrackingCard } from './TrackingCard'

const settingsKey = (c: CampaignDetail) =>
  [c.name, c.geo.join(','), c.domain_id, c.group_id, c.traffic_source_id].join('|')

/** Schema of the flow that sends the campaign geo to Google. */
const REDIRECT_SCHEMA = 'redirect'

type Tab = 'campaign' | 'tracking' | 'offers'
const TABS: { value: Tab; label: string }[] = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'offers', label: 'Offers' },
]

/**
 * The campaign's flows with their offers, shares and stats. Offer edits are kept as a draft
 * in the wrapper and reach Keitaro on "Push to KT".
 */
export function CampaignPage() {
  const navigate = useNavigate()
  const id = Number(useParams().id)
  // Bumped after an edit to fetch the recalculated shares
  const [version, setVersion] = useState(0)
  const { data, error, loading } = useRequest(`campaign|${id}|${version}`, (signal) =>
    getCampaign(id, 'all_time', signal),
  )
  const reload = () => setVersion((v) => v + 1)
  // In the URL, so a reload or a shared link opens the same tab
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.value === params.get('tab'))?.value ?? 'campaign'
  const setTab = (next: Tab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'campaign') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true },
    )
  const campaign = data?.id === id ? data : undefined
  // Drafts returned by edits, until the next load brings them anyway
  const [edited, setEdited] = useState<{ source?: CampaignDetail; drafts: Record<number, StreamDraft> }>({
    drafts: {},
  })
  const drafts = edited.source === campaign ? edited.drafts : {}
  const setDraft = (draft: StreamDraft) =>
    setEdited((prev) => ({
      source: campaign,
      drafts: { ...(prev.source === campaign ? prev.drafts : {}), [draft.stream_id]: draft },
    }))

  if (error && (!campaign || (error instanceof ApiError && error.status === 404))) {
    return (
      <>
        <PageHeader title="Campaign" />
        <Alert className="mb-4">
          {error instanceof ApiError && error.status === 404
            ? 'Campaign not found. Only campaigns created through the wrapper can be edited.'
            : `Could not load the campaign: ${error.message}`}
        </Alert>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}>
            Retry
          </Button>
          <Link to="/campaigns" className="self-center text-sm text-indigo-600 hover:underline dark:text-indigo-400">
            Back to campaigns
          </Link>
        </div>
      </>
    )
  }

  if (!campaign) {
    return (
      <div className="flex justify-center py-16 text-indigo-600">
        <Spinner />
      </div>
    )
  }

  // The geo flow is part of the campaign settings; the rest carry offers
  const geoStreams = campaign.streams.filter((s) => s.schema === REDIRECT_SCHEMA)
  const offerStreams = campaign.streams.filter((s) => s.schema !== REDIRECT_SCHEMA)
  const streamCard = (s: Stream) => (
    <StreamCard
      key={s.id}
      campaignId={campaign.id}
      stream={s}
      draft={drafts[s.id] ?? s.draft}
      onDraft={setDraft}
      busy={loading}
    />
  )

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {campaign.name}
            <Badge>#{campaign.id}</Badge>
            {campaign.state !== 'active' && <Badge tone="sky">{campaign.state}</Badge>}
            {loading && <Spinner className="size-4 text-indigo-600" />}
          </span>
        }
        description={
          campaign.keitaro_link && <ExternalLink href={campaign.keitaro_link}>Open in Keitaro</ExternalLink>
        }
        actions={
          <DeleteCampaignButton campaign={campaign} onDeleted={() => navigate('/campaigns')} />
        }
      />

      {error && <Alert className="mb-4">Could not refresh the campaign: {error.message}</Alert>}

      <Tabs label="Campaign sections" value={tab} tabs={TABS} onChange={setTab} />

      <div {...tabPanelProps(tab)} className="space-y-4">
        {tab === 'campaign' && (
          <>
            {/* Remounts with the saved values once a reload brings them */}
            <EditCampaignForm key={settingsKey(campaign)} campaign={campaign} onSaved={reload} />
            {geoStreams.map(streamCard)}
          </>
        )}
        {tab === 'tracking' && <TrackingCard campaign={campaign} />}
        {tab === 'offers' &&
          (offerStreams.length ? (
            offerStreams.map(streamCard)
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">The campaign has no offer flows.</p>
          ))}
      </div>
    </>
  )
}
