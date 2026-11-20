import type { Stats } from '@/shared/api'
import { formatNumber } from '@/shared/lib'

export const STAT_COLUMNS = [
  { key: 'clicks', label: 'Clicks' },
  { key: 'unique_clicks', label: 'Unique' },
  { key: 'bots', label: 'Bots' },
] as const satisfies { key: keyof Stats; label: string }[]

/** Clicks / unique / bots as in Keitaro's flow list. */
export function StatsCells({ stats, className = '' }: { stats: Stats; className?: string }) {
  return STAT_COLUMNS.map(({ key }) => (
    <td key={key} className={`px-3 py-2.5 text-right text-sm tabular-nums ${className}`}>
      {formatNumber(stats[key])}
    </td>
  ))
}
