import { useState } from 'react'
import { deleteGroup, type GroupsInfo } from '@/shared/api'
import { Alert, Button, Modal } from '@/shared/ui'

type DeleteGroupButtonProps = {
  group: { id: number; name: string }
  /** The updated list of the groups open to the user. */
  onDeleted: (info: GroupsInfo) => void
}

/** Asks for confirmation, then deletes the group in Keitaro. */
export function DeleteGroupButton({ group, onDeleted }: DeleteGroupButtonProps) {
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
      const info = await deleteGroup(group.id)
      setOpen(false)
      onDeleted(info)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-sm font-medium text-red-600 hover:underline dark:text-red-400"
      >
        Delete
      </button>

      <Modal open={open} onClose={close} title="Delete group?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{group.name}</span>{' '}
            <span className="text-slate-500 dark:text-slate-400">#{group.id}</span> is deleted in Keitaro. A group
            with campaigns in it can't be deleted.
          </p>
          {error && <Alert>Could not delete the group: {error}</Alert>}
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
