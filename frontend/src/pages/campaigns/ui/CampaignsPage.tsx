import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { DeleteCampaignButton } from '@/features/delete-campaign'
import { listCampaigns } from '@/shared/api'
import { formatDateTime, useRequest } from '@/shared/lib'
import { Alert, buttonClass, Card, CopyButton, ExternalLink, PageHeader, Spinner } from '@/shared/ui'
import { CreateCampaignModal } from './CreateCampaignModal'

const th = 'px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'
const td = 'px-4 py-3 text-sm text-slate-700 dark:text-slate-300'

type CampaignsPageProps = {
  /** `/campaigns/new`: the creation modal is open over the list. */
  creating?: boolean
}

export function CampaignsPage({ creating = false }: CampaignsPageProps) {
  const navigate = useNavigate()
  const request = useRequest('campaigns', listCampaigns)
  const { error, loading } = request
  // Deleted from the list without reloading it
  const [deleted, setDeleted] = useState<number[]>([])
  const data = request.data?.filter((c) => !deleted.includes(c.id))

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Campaigns created through the wrapper. Open one to edit its offers."
        actions={
          <Link to="/campaigns/new" className={buttonClass()}>
            New campaign
          </Link>
        }
      />

      <CreateCampaignModal
        open={creating}
        onClose={() => navigate('/campaigns')}
        onCreated={(c) => navigate(`/campaigns/${c.id}`)}
      />

      {error && <Alert className="mb-4">Could not load campaigns: {error.message}</Alert>}

      <Card>
        {loading && !data ? (
          <div className="flex justify-center py-12 text-indigo-600">
            <Spinner />
          </div>
        ) : !data?.length ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No campaigns yet.{' '}
            <Link to="/campaigns/new" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Create the first one
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className={th}>ID</th>
                  <th className={th}>Name</th>
                  <th className={th}>URL</th>
                  <th className={th}>Created</th>
                  <th className={th}>Keitaro</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className={`${td} tabular-nums text-slate-500 dark:text-slate-400`}>{c.id}</td>
                    <td className={td}>
                      <Link
                        to={`/campaigns/${c.id}`}
                        className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className={`${td} max-w-xs`}>
                      <div className="flex items-center gap-1">
                        <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline" title={c.url}>
                          {c.url}
                        </a>
                        <CopyButton value={c.url} label="URL" />
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(c.created_at)}</td>
                    <td className={td}>
                      {c.keitaro_link && <ExternalLink href={c.keitaro_link}>Open</ExternalLink>}
                    </td>
                    <td className={`${td} text-right`}>
                      <DeleteCampaignButton
                        campaign={c}
                        compact
                        onDeleted={() => setDeleted((ids) => [...ids, c.id])}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
