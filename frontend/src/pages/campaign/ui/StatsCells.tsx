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

export function StatTiles({ stats }: { stats: Stats }) {
  return (
    <dl className="grid grid-cols-3 gap-3">
      {STAT_COLUMNS.map(({ key, label }) => (
        <div
          key={key}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatNumber(stats[key])}
          </dd>
        </div>
      ))}
    </dl>
  )
}
