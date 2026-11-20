/**
 * Shares are exact in the wrapper (3 offers: 100/3 each). The table shows them rounded down,
 * as Keitaro gets them; the exact value shows up while a share is edited.
 */
export const shownShare = (share: number) => Math.floor(share + 1e-6)

/** Exact share, up to 2 decimals: 33.33. */
export const exactShare = (share: number) => Math.round(share * 100) / 100

/** A push needs the shares to sum to 100%. */
export const isFullShare = (total: number) => Math.abs(total - 100) <= 0.01
