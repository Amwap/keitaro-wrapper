import { apiRequest } from './client'

export type Option = { id: number; name: string }
export type DomainOption = Option & { url: string }
export type OfferOption = Option & { group: string | null; countries: string[] }

export type FormOptions = {
  domains: DomainOption[]
  groups: Option[]
  traffic_sources: Option[]
  defaults: { domain_id: number | null; group_id: number | null; traffic_source_id: number | null }
}

export type CampaignCreate = {
  name: string
  geo: string[]
  offer_id: number
  domain_id?: number
  group_id?: number
  traffic_source_id?: number
}

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

export type StreamOffer = {
  offer_id: number
  /** null when the offer is not visible to the API key. */
  name: string | null
  share: number
  state: string
  stats: Stats
}

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
  offers: StreamOffer[]
  stats: Stats
}

export type CampaignSummary = { id: number; name: string; alias: string; url: string; created_at: string }

export type CampaignDetail = {
  id: number
  name: string
  alias: string
  url: string
  state: string
  group_id: number | null
  traffic_source_id: number | null
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

export const searchOffers = (q: string, signal?: AbortSignal) =>
  apiRequest<OfferOption[]>(`/offers?${new URLSearchParams({ q, limit: '20' })}`, { signal })

export const listCampaigns = (signal?: AbortSignal) =>
  apiRequest<CampaignSummary[]>('/campaigns', { signal })

export const createCampaign = (data: CampaignCreate) =>
  apiRequest<CampaignSummary>('/campaigns', json('POST', data))

export const getCampaign = (id: number, period: Period, signal?: AbortSignal) =>
  apiRequest<CampaignDetail>(`/campaigns/${id}?${new URLSearchParams({ period })}`, { signal })

export const addStreamOffer = (campaignId: number, streamId: number, offerId: number) =>
  apiRequest<void>(
    `/campaigns/${campaignId}/streams/${streamId}/offers`,
    json('POST', { offer_id: offerId }),
  )

export const removeStreamOffer = (campaignId: number, streamId: number, offerId: number) =>
  apiRequest<void>(`/campaigns/${campaignId}/streams/${streamId}/offers/${offerId}`, {
    method: 'DELETE',
  })
