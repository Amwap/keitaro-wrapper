import { useState } from 'react'
import { CreateGroupModal } from '@/features/create-group'
import { DeleteGroupButton } from '@/features/delete-group'
import { listGroups, type GroupsInfo } from '@/shared/api'
import { useRequest } from '@/shared/lib'
import { Alert, Badge, Button, Card, PageHeader, Spinner } from '@/shared/ui'

const th = 'px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'
const td = 'px-4 py-3 text-sm text-slate-700 dark:text-slate-300'

export function GroupsPage() {
  const request = useRequest('groups', listGroups)
  const [updated, setUpdated] = useState<GroupsInfo | null>(null)
  const [creating, setCreating] = useState(false)
  const data = updated ?? request.data

  return (
    <>
      <PageHeader
        title="Groups"
        description="Campaign groups available for your campaigns: the default one and the ones you created."
        actions={
          <Button onClick={() => setCreating(true)} disabled={!data}>
            New group
          </Button>
        }
      />

      {data && (
        <CreateGroupModal
          open={creating}
          onClose={() => setCreating(false)}
          prefix={data.prefix}
          onCreated={(_group, info) => {
            setUpdated(info)
            setCreating(false)
          }}
        />
      )}

      {request.error && <Alert className="mb-4">Could not load groups: {request.error.message}</Alert>}

      <Card>
        {request.loading && !data ? (
          <div className="flex justify-center py-12 text-indigo-600">
            <Spinner />
          </div>
        ) : !data?.groups.length ? (
          <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No groups available.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className={th}>ID</th>
                  <th className={th}>Name</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.groups.map((g) => (
                  <tr key={g.id}>
                    <td className={`${td} tabular-nums text-slate-500 dark:text-slate-400`}>{g.id}</td>
                    <td className={`${td} font-medium`}>
                      <span className="flex items-center gap-2">
                        {g.name}
                        {g.own ? <Badge tone="indigo">Own</Badge> : <Badge>Default</Badge>}
                      </span>
                    </td>
                    <td className={`${td} text-right`}>
                      {g.own && <DeleteGroupButton group={g} onDeleted={setUpdated} />}
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
