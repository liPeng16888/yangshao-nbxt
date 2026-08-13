import type {
  CachedFrontendPreference,
  FrontendPreferenceSection
} from '@/types/frontendPreference'

const CACHE_PREFIX = 'ys_frontend_preferences:v1'

export function preferenceCacheKey(ownerId: string, section: FrontendPreferenceSection) {
  return `${CACHE_PREFIX}:${ownerId}:${section}`
}

export function readFrontendPreferenceCache(
  ownerId: string,
  section: FrontendPreferenceSection
): CachedFrontendPreference | null {
  const key = preferenceCacheKey(ownerId, section)
  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    window.localStorage.removeItem(key)
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const cached = parsed as Partial<CachedFrontendPreference>
  if (cached.ownerId !== ownerId || cached.section !== section) return null
  return cached as CachedFrontendPreference
}

export function writeFrontendPreferenceCache(entry: CachedFrontendPreference) {
  window.localStorage.setItem(
    preferenceCacheKey(entry.ownerId, entry.section),
    JSON.stringify(entry)
  )
}

export function removeFrontendPreferenceCache(
  ownerId: string,
  section: FrontendPreferenceSection
) {
  window.localStorage.removeItem(preferenceCacheKey(ownerId, section))
}
