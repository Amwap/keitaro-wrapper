const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })

// Regions Intl names that are not countries: unions, pseudo-locales, exceptional reservations
const NOT_COUNTRIES = new Set(['AC', 'CP', 'CQ', 'DG', 'EA', 'EU', 'EZ', 'IC', 'QO', 'TA', 'UN', 'XA', 'XB'])

/** Country name of an ISO 3166-1 alpha-2 code, or null for an unknown code. */
export function countryName(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null
  try {
    return regionNames.of(code) ?? null
  } catch {
    return null
  }
}

/** A deprecated code (SU, YU, UK…) is canonicalised to another region or none. */
const isCurrent = (code: string) => {
  try {
    const locale = new Intl.Locale(`und-${code}`).maximize()
    return locale.region === code && locale.language !== 'und'
  } catch {
    return false
  }
}

export type Country = { code: string; name: string }

let countries: Country[] | null = null

/** Current countries by name, built from Intl on first use. */
export function listCountries(): Country[] {
  if (countries) return countries
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const list: Country[] = []
  for (const a of letters)
    for (const b of letters) {
      const code = a + b
      const name = countryName(code)
      if (name && !NOT_COUNTRIES.has(code) && isCurrent(code)) list.push({ code, name })
    }
  countries = list.sort((x, y) => x.name.localeCompare(y.name))
  return countries
}
