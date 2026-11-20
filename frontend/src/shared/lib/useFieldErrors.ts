import { useState } from 'react'

/**
 * Messages by form field (keys as in the request, e.g. `offer_ids`).
 * `tracked` wraps a setter so that editing a field clears its message.
 */
export function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const tracked =
    <T,>(field: string, set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setErrors((e) => (e[field] ? { ...e, [field]: '' } : e))
    }
  /** The message of a field, undefined when there is none. */
  const errorOf = (field: string) => errors[field] || undefined
  return { errorOf, setErrors, tracked }
}
