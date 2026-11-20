const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })

/** Splits `mx, au;RO` into unique upper-case codes, keeping the order. */
export function parseGeo(text: string): string[] {
  const codes = text
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
  return [...new Set(codes)]
}

/** Country name of an ISO 3166-1 alpha-2 code, or null for an unknown code. */
export function countryName(code: string): string | null {
  if (!/^[A-Z]{2}$/.test(code)) return null
  try {
    return regionNames.of(code) ?? null
  } catch {
    return null
  }
}
