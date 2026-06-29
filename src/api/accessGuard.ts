import request, { useMocks } from '@/utils/request'

export interface AccessGuardSettingsResponse {
  enabled: boolean
  ttlMinutes: number
  password: string
  recoveryPrompt: string
  recoveryAnswer: string
}

export interface AccessGuardSettingsPayload {
  enabled: boolean
  ttlMinutes: number
  password?: string
  recoveryPrompt?: string
  recoveryAnswer?: string
}

const MOCK_ACCESS_GUARD_STORAGE_KEY = 'ys_mock_access_guard_settings'

const defaultSettings: AccessGuardSettingsResponse = {
  enabled: false,
  ttlMinutes: 5,
  password: '',
  recoveryPrompt: '',
  recoveryAnswer: ''
}

function readMockSettings() {
  try {
    const raw = window.localStorage.getItem(MOCK_ACCESS_GUARD_STORAGE_KEY)
    return raw ? { ...defaultSettings, ...(JSON.parse(raw) as Partial<AccessGuardSettingsResponse>) } : { ...defaultSettings }
  } catch {
    return { ...defaultSettings }
  }
}

function writeMockSettings(settings: AccessGuardSettingsResponse) {
  window.localStorage.setItem(MOCK_ACCESS_GUARD_STORAGE_KEY, JSON.stringify(settings))
}

export async function getAccessGuardSettings() {
  if (useMocks) return readMockSettings()
  return request.get<unknown, AccessGuardSettingsResponse>('/auth/access-guard')
}

export async function updateAccessGuardSettings(payload: AccessGuardSettingsPayload) {
  if (useMocks) {
    const current = readMockSettings()
    const next = {
      enabled: payload.enabled,
      ttlMinutes: payload.ttlMinutes,
      password: payload.password ?? current.password,
      recoveryPrompt: payload.recoveryPrompt ?? current.recoveryPrompt,
      recoveryAnswer: payload.recoveryAnswer ?? current.recoveryAnswer
    }
    writeMockSettings(next)
    return next
  }
  return request.patch<unknown, AccessGuardSettingsResponse>('/auth/access-guard', payload)
}
