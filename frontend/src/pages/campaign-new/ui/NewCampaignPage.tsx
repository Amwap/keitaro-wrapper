import { Link, useNavigate } from 'react-router'
import { getFormOptions } from '@/shared/api'
import { useRequest } from '@/shared/lib'
import { Alert, Card, PageHeader, Spinner } from '@/shared/ui'
import { CreateCampaignForm } from './CreateCampaignForm'

export function NewCampaignPage() {
  const navigate = useNavigate()
  const { data, error } = useRequest('form-options', getFormOptions)

  return (
    <>
      <PageHeader
        title="New campaign"
        description={
          <>
            Creates two flows: visitors from the chosen countries are redirected to Google, everyone
            else goes to the offer. <Link to="/campaigns" className="text-indigo-600 hover:underline dark:text-indigo-400">Back to campaigns</Link>
          </>
        }
      />
      <Card className="max-w-2xl p-6">
        {error ? (
          <Alert>Could not load domains, groups and sources: {error.message}</Alert>
        ) : !data ? (
          <div className="flex justify-center py-8 text-indigo-600">
            <Spinner />
          </div>
        ) : (
          <CreateCampaignForm options={data} onCreated={(c) => navigate(`/campaigns/${c.id}`)} />
        )}
      </Card>
    </>
  )
}
