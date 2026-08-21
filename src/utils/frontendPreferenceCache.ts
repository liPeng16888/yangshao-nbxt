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
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    removeFrontendPreferenceCache(ownerId, section)
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const cached = parsed as Partial<CachedFrontendPreference>
  if (cached.ownerId !== ownerId || cached.section !== section) return null
  return cached as CachedFrontendPreference
}

export function writeFrontendPreferenceCache(entry: CachedFrontendPreference) {
  try {
    window.localStorage.setItem(
      preferenceCacheKey(entry.ownerId, entry.section),
      JSON.stringify(entry)
    )
  } catch {
    // The server remains authoritative when local storage is full or unavailable.
  }
}

export function removeFrontendPreferenceCache(
  ownerId: string,
  section: FrontendPreferenceSection
) {
  try {
    window.localStorage.removeItem(preferenceCacheKey(ownerId, section))
  } catch {
    // Cache cleanup is best-effort and must not block live server data.
  }
}
