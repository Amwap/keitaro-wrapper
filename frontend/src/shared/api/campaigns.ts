import { apiRequest } from './client'

export type Option = { id: number; name: string }
export type DomainOption = Option & { url: string }
export type OfferOption = Option & {
  group: string | null
  countries: string[]
  /** Affiliate network. */
  network: string | null
  /** In a group closed to the API key: only the id is known, found by the exact id. */
  hidden: boolean
}

export type FormOptions = {
  domains: DomainOption[]
  groups: Option[]
  /** Prefix Keitaro adds to the name of a new group: `test_{username}_`. */
  group_prefix: string
  traffic_sources: Option[]
  defaults: { domain_id: number | null; group_id: number | null; traffic_source_id: number | null }
}

export type CampaignCreate = {
  name: string
  geo: string[]
  /** Offers of the offers flow; the shares are split evenly. */
  offer_ids: number[]
  domain_id?: number
  group_id?: number
  traffic_source_id?: number
}

/** The creation form fields except the offer; a missing field is left as is. */
export type CampaignUpdate = Partial<Omit<CampaignCreate, 'offer_ids'>>

/** Keitaro report intervals the editor's stats are built for. */
export type Period =
  | 'today'
  | 'yesterday'
  | '7_days_ago'
  | 'first_day_of_this_week'
  | '1_month_ago'
  | 'first_day_of_this_month'
  | '1_year_ago'
  | 'first_day_of_this_year'
  | 'all_time'

export type Stats = { clicks: number; unique_clicks: number; bots: number }

/** `synced`, or what a push will do with the offer: add it, change its share, remove it. */
export type SyncStatus = 'synced' | 'new' | 'changed' | 'removed'

export type DraftOffer = {
  offer_id: number
  /** null when the offer is not visible to the API key. */
  name: string | null
  /** Share in the wrapper; reaches Keitaro on push. */
  share: number
  /** Share in Keitaro, null when the offer is not in the Keitaro flow. */
  keitaro_share: number | null
  /** Kept as is when the other shares are recalculated. */
  pinned: boolean
  /** `removed` by the user, `deleted` from the flow in Keitaro directly. */
  state: 'active' | 'removed' | 'deleted'
  sync: SyncStatus
  /** The offer itself is deleted or archived in Keitaro. */
  offer_deleted: boolean
  removed_at: string | null
}

/** Offers of a flow as edited in the wrapper; Keitaro gets them on push. */
export type StreamDraft = {
  stream_id: number
  offers: DraftOffer[]
  /** Removed offers that can be restored. */
  removed: DraftOffer[]
  /** There are changes not pushed to Keitaro. */
  dirty: boolean
  /** Sum of the active shares; a push needs 100. */
  total_share: number
}

export type OfferStats = { offer_id: number; stats: Stats }

export type Stream = {
  id: number
  name: string
  type: string
  /** `redirect` for the geo flow, `landings` for the offers flow. */
  schema: string
  position: number
  state: string
  action_type: string | null
  redirect_url: string | null
  countries: string[]
  /** Editable offers; only for the offers flow. */
  draft: StreamDraft | null
  offer_stats: OfferStats[]
  stats: Stats
}

export type CampaignSummary = {
  id: number
  name: string
  alias: string
  url: string
  created_at: string
  /** Campaign page in the Keitaro admin; null when the tracker URL is not set. */
  keitaro_link: string | null
}

export type CampaignDetail = {
  id: number
  name: string
  alias: string
  url: string
  /** `url` plus the campaign parameters with their source macros, e.g. `?sub_id_1={zoneid}`. */
  tracking_url: string
  /** Campaign token for the Click API. */
  token: string | null
  /** Tracker postback URL for the Tracking Script; null until KEITARO_POSTBACK_SECRET is set. */
  postback_url: string | null
  /** Campaign page in the Keitaro admin; null when the tracker URL is not set. */
  keitaro_link: string | null
  state: string
  domain_id: number | null
  group_id: number | null
  traffic_source_id: number | null
  /** Countries of the flow that goes to Google. */
  geo: string[]
  period: Period
  stats: Stats
  streams: Stream[]
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const getFormOptions = (signal?: AbortSignal) =>
  apiRequest<FormOptions>('/campaigns/form-options', { signal })

export const searchOffers = (q: string, signal?: AbortSignal, limit = 20) =>
  apiRequest<OfferOption[]>(`/offers?${new URLSearchParams({ q, limit: String(limit) })}`, { signal })

export const listCampaigns = (signal?: AbortSignal) =>
  apiRequest<CampaignSummary[]>('/campaigns', { signal })

export const createCampaign = (data: CampaignCreate) =>
  apiRequest<CampaignSummary>('/campaigns', json('POST', data))

/** The alias stays, so only a new domain changes the URL. */
export const updateCampaign = (id: number, data: CampaignUpdate) =>
  apiRequest<CampaignSummary>(`/campaigns/${id}`, json('PATCH', data))

/** Moves the campaign to the Keitaro archive and removes it from the wrapper. */
export const deleteCampaign = (id: number) => apiRequest<void>(`/campaigns/${id}`, { method: 'DELETE' })

export const getCampaign = (id: number, period: Period, signal?: AbortSignal) =>
  apiRequest<CampaignDetail>(`/campaigns/${id}?${new URLSearchParams({ period })}`, { signal })

const flow = (campaignId: number, streamId: number) => `/campaigns/${campaignId}/streams/${streamId}`

// Draft edits: they stay in the wrapper until `pushStreamOffers`

export const addStreamOffer = (campaignId: number, streamId: number, offerId: number) =>
  apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/offers`, json('POST', { offer_id: offerId }))

export const removeStreamOffer = (campaignId: number, streamId: number, offerId: number) =>
  apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/offers/${offerId}`, { method: 'DELETE' })

export const restoreStreamOffer = (campaignId: number, streamId: number, offerId: number) =>
  apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/offers/${offerId}/restore`, { method: 'POST' })

/** A manual share pins the offer; unpinning gives it back to the even split. */
export const updateStreamOffer = (
  campaignId: number,
  streamId: number,
  offerId: number,
  data: { share: number } | { pinned: boolean },
) => apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/offers/${offerId}`, json('PATCH', data))

export const pushStreamOffers = (campaignId: number, streamId: number) =>
  apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/push`, { method: 'POST' })

/** Drops the changes not pushed yet. */
export const resetStreamOffers = (campaignId: number, streamId: number) =>
  apiRequest<StreamDraft>(`${flow(campaignId, streamId)}/reset`, { method: 'POST' })
