import { useState } from 'react'
import { deleteCampaign } from '@/shared/api'
import { Alert, Button, Modal } from '@/shared/ui'

type DeleteCampaignButtonProps = {
  campaign: { id: number; name: string }
  onDeleted: () => void
  /** A small text link for table rows instead of a full button. */
  compact?: boolean
}

/** Asks for confirmation, then moves the campaign to the Keitaro archive. */
export function DeleteCampaignButton({ campaign, onDeleted, compact = false }: DeleteCampaignButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (pending) return
    setOpen(false)
    setError(null)
  }

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      await deleteCampaign(campaign.id)
      setOpen(false)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Delete
        </button>
      ) : (
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete
        </Button>
      )}

      <Modal open={open} onClose={close} title="Delete campaign?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{campaign.name}</span>{' '}
            <span className="text-slate-500 dark:text-slate-400">#{campaign.id}</span> is moved to the Keitaro
            archive and removed from the wrapper together with its offer drafts. Its URL stops working.
          </p>
          {error && <Alert>Could not delete the campaign: {error}</Alert>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={confirm} loading={pending}>
              {pending ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
