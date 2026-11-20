import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ApiError, getCampaign, type CampaignDetail, type Period, type StreamDraft } from '@/shared/api'
import { useRequest } from '@/shared/lib'
import { Alert, Badge, Button, PageHeader, Select, Spinner } from '@/shared/ui'
import { EditCampaignForm } from './EditCampaignForm'
import { StatTiles } from './StatsCells'
import { StreamCard } from './StreamCard'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '7_days_ago', label: 'Last 7 days' },
  { value: 'first_day_of_this_week', label: 'This week' },
  { value: '1_month_ago', label: 'Last 30 days' },
  { value: 'first_day_of_this_month', label: 'This month' },
  { value: '1_year_ago', label: 'Last year' },
  { value: 'first_day_of_this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
]

const toPeriod = (value: string | null): Period =>
  PERIODS.find((p) => p.value === value)?.value ?? 'all_time'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  return (
    <button
      type="button"
      onClick={copy}
      className="cursor-pointer rounded px-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/**
 * The campaign's flows with their offers, shares and stats. Offer edits are kept as a draft
 * in the wrapper and reach Keitaro on "Push to KT".
 */
export function CampaignPage() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const period = toPeriod(params.get('period'))
  // Bumped after an edit to fetch the recalculated shares
  const [version, setVersion] = useState(0)
  const { data, error, loading } = useRequest(`campaign|${id}|${period}|${version}`, (signal) =>
    getCampaign(id, period, signal),
  )
  const reload = () => setVersion((v) => v + 1)
  const [editing, setEditing] = useState(false)
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
          <span className="flex flex-wrap items-center gap-1">
            <a href={campaign.url} target="_blank" rel="noreferrer" className="break-all hover:underline">
              {campaign.url}
            </a>
            <CopyButton text={campaign.url} />
          </span>
        }
        actions={
          <>
            <Select
              label="Stats period"
              value={period}
              options={PERIODS}
              onChange={(e) =>
                setParams(e.target.value === 'all_time' ? {} : { period: e.target.value }, { replace: true })
              }
            />
            {!editing && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </>
        }
      />

      {error && <Alert className="mb-4">Could not refresh the campaign: {error.message}</Alert>}

      <div className="space-y-4">
        {editing && (
          <EditCampaignForm
            campaign={campaign}
            onSaved={() => {
              setEditing(false)
              reload()
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        <StatTiles stats={campaign.stats} />
        {campaign.streams.map((s) => (
          <StreamCard
            key={s.id}
            campaignId={campaign.id}
            stream={s}
            draft={drafts[s.id] ?? s.draft}
            onDraft={setDraft}
            busy={loading}
          />
        ))}
        {!campaign.streams.length && (
          <p className="text-sm text-slate-500 dark:text-slate-400">The campaign has no flows.</p>
        )}
      </div>
    </>
  )
}
