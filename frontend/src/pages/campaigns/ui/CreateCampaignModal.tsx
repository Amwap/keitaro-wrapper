import { getFormOptions, type CampaignSummary } from '@/shared/api'
import { useRequest } from '@/shared/lib'
import { Alert, Modal, Spinner } from '@/shared/ui'
import { CreateCampaignForm } from './CreateCampaignForm'

type CreateCampaignModalProps = {
  open: boolean
  onClose: () => void
  onCreated: (campaign: CampaignSummary) => void
}

export function CreateCampaignModal({ open, onClose, onCreated }: CreateCampaignModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New campaign"
      description="Creates two flows: visitors from the chosen countries are redirected to Google, everyone else goes to the offer."
    >
      <FormLoader onCreated={onCreated} />
    </Modal>
  )
}

/** Mounted while the modal is open, so the options are fresh every time it opens. */
function FormLoader({ onCreated }: Pick<CreateCampaignModalProps, 'onCreated'>) {
  const { data, error } = useRequest('form-options', getFormOptions)
  if (error) return <Alert>Could not load domains, groups and sources: {error.message}</Alert>
  if (!data)
    return (
      <div className="flex justify-center py-8 text-indigo-600">
        <Spinner />
      </div>
    )
  return <CreateCampaignForm options={data} onCreated={onCreated} />
}
