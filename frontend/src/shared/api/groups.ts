import type { Option } from './campaigns'
import { apiRequest } from './client'

/** `name` is shown without the `test_{username}_` prefix Keitaro stores it with. */
export type GroupOption = Option & {
  /** Created by the current user: the Keitaro name starts with `test_{username}_`. */
  own: boolean
}

export type GroupsInfo = {
  /** Campaign groups open to the user: the default one and the user's own ones. */
  groups: GroupOption[]
  /** Prefix Keitaro adds to the name of a new group: `test_{username}_`. */
  prefix: string
}

export const listGroups = (signal?: AbortSignal) => apiRequest<GroupsInfo>('/groups', { signal })

/** `name` goes without the prefix; Keitaro gets `test_{username}_{name}`. */
export const createGroup = (name: string) =>
  apiRequest<GroupsInfo>('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

/** Only the user's own groups without campaigns in them. */
export const deleteGroup = (id: number) => apiRequest<GroupsInfo>(`/groups/${id}`, { method: 'DELETE' })
