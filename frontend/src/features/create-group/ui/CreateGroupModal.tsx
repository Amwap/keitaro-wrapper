import { useState, type FormEvent } from 'react'
import { createGroup, type GroupOption, type GroupsInfo } from '@/shared/api'
import { Button, Input, Modal } from '@/shared/ui'

type CreateGroupModalProps = {
  open: boolean
  onClose: () => void
  /** Keitaro adds it to the name: `test_{username}_`. */
  prefix: string
  /** The new group and the updated list of the groups open to the user. */
  onCreated: (group: GroupOption, info: GroupsInfo) => void
}

/** Creates a campaign group of the current user. */
export function CreateGroupModal({ open, onClose, prefix, onCreated }: CreateGroupModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New group"
      description={
        <>
          Keitaro adds the <span className="font-medium">{prefix}</span> prefix to the name.
        </>
      }
    >
      <CreateGroupForm prefix={prefix} onCreated={onCreated} />
    </Modal>
  )
}

function CreateGroupForm({ prefix, onCreated }: Pick<CreateGroupModalProps, 'prefix' | 'onCreated'>) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // The modal may sit inside another form in the React tree: keep its submit from firing
    e.stopPropagation()
    setPending(true)
    setError(null)
    try {
      const info = await createGroup(name.trim())
      const group = info.groups.find((g) => g.own && g.name === name.trim())
      if (group) onCreated(group, info)
      else throw new Error('The group was created but is missing from the list')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-end gap-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="main"
          maxLength={200}
          autoComplete="off"
          autoFocus
          required
          error={error ?? undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" loading={pending} disabled={!name.trim()}>
          {pending ? 'Creating…' : 'Create'}
        </Button>
      </div>
      {name.trim() && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Name in Keitaro:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">{prefix + name.trim()}</span>
        </p>
      )}
    </form>
  )
}
