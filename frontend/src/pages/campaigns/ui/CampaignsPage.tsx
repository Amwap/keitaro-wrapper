import { Link } from 'react-router'
import { listCampaigns } from '@/shared/api'
import { formatDateTime, useRequest } from '@/shared/lib'
import { Alert, buttonClass, Card, PageHeader, Spinner } from '@/shared/ui'

const th = 'px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'
const td = 'px-4 py-3 text-sm text-slate-700 dark:text-slate-300'

export function CampaignsPage() {
  const { data, error, loading } = useRequest('campaigns', listCampaigns)

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
                    <td className={`${td} max-w-xs truncate`}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline" title={c.url}>
                        {c.url}
                      </a>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{formatDateTime(c.created_at)}</td>
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
