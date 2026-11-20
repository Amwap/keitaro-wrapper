import { useState } from 'react'
import { removeStreamOffer } from '@/shared/api'
import { Spinner } from '@/shared/ui'

type RemoveOfferButtonProps = {
  campaignId: number
  streamId: number
  offerId: number
  /** The last offer of a flow can't be removed. */
  disabled?: boolean
  onRemoved: () => Promise<void> | void
  onError: (message: string) => void
}

export function RemoveOfferButton({
  campaignId,
  streamId,
  offerId,
  disabled = false,
  onRemoved,
  onError,
}: RemoveOfferButtonProps) {
  const [pending, setPending] = useState(false)

  const remove = async () => {
    if (!confirm(`Remove offer ${offerId} from the flow? Shares of the rest are split evenly.`)) return
    setPending(true)
    try {
      await removeStreamOffer(campaignId, streamId, offerId)
      await onRemoved()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={disabled || pending}
      title={disabled ? 'The last offer of a flow cannot be removed' : 'Remove offer'}
      aria-label={`Remove offer ${offerId}`}
      className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
    >
      {pending ? (
        <Spinner className="size-4" />
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      )}
    </button>
  )
}
