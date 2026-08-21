import request from '@/utils/request'
import type {
  FrontendPreferenceRecord,
  FrontendPreferenceSection
} from '@/types/frontendPreference'

export function listFrontendPreferences(): Promise<FrontendPreferenceRecord[]> {
  return request.get('/frontend-preferences')
}

export function saveFrontendPreference(
  section: FrontendPreferenceSection,
  value: unknown,
  baseVersion: number
): Promise<FrontendPreferenceRecord> {
  return request.put(`/frontend-preferences/${section}`, { value, baseVersion })
}
