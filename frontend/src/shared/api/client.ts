import { API_BASE_URL } from '@/shared/config'
import { getAccessToken, refreshAccessToken } from './token'

export class ApiError extends Error {
  readonly status: number
  /** Messages by request field, for forms to highlight. */
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

function send(path: string, init: RequestInit) {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers })
}

async function toError(res: Response): Promise<ApiError> {
  const text = await res.text()
  try {
    const { detail, fields } = JSON.parse(text) as { detail?: unknown; fields?: Record<string, string> }
    if (typeof detail === 'string') return new ApiError(res.status, detail, fields)
    // FastAPI validation errors: [{loc, msg, type}, ...]
    if (Array.isArray(detail)) {
      const byField: Record<string, string> = {}
      const message = detail
        .map((d: { loc?: unknown[]; msg?: string }) => {
          const path = d.loc?.filter((p) => p !== 'body') ?? []
          const msg = (d.msg ?? '').replace(/^Value error, /, '')
          if (path.length) byField[String(path[0])] ??= msg
          return path.length ? `${path.join('.')}: ${msg}` : msg
        })
        .join('; ')
      return new ApiError(res.status, message, byField)
    }
  } catch {
    // not JSON
  }
  return new ApiError(res.status, text || res.statusText)
}

/** Field errors of a failed request; empty for other errors. */
export const fieldErrors = (e: unknown): Record<string, string> => (e instanceof ApiError ? e.fields : {})

/** Fetch wrapper: attaches the access token and retries once after refreshing it on 401. */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await send(path, init)
  if (res.status === 401 && getAccessToken() && (await refreshAccessToken())) {
    res = await send(path, init)
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiGet = <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, init)
