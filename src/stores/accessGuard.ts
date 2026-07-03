import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAccessGuardSettings, updateAccessGuardSettings } from '@/api/accessGuard'

const SETTINGS_STORAGE_KEY = 'ys_sensitive_access_guard_settings'
const UNLOCKED_UNTIL_STORAGE_KEY = 'ys_sensitive_access_unlocked_until'
const DEFAULT_TTL_MINUTES = 5

export interface AccessGuardSettings {
  enabled: boolean
  ttlMinutes: number
  password: string
  recoveryPrompt: string
  recoveryAnswer: string
}

interface SaveSettingsPayload {
  enabled: boolean
  ttlMinutes: number
  password: string
  confirmPassword: string
  disablePassword?: string
  recoveryPrompt: string
  recoveryAnswer: string
}

interface RecoveryResetPayload {
  recoveryAnswer: string
  newPassword: string
  confirmPassword: string
}

interface AccessRequestOptions {
  title: string
  message: string
  onSuccess: () => void | Promise<void>
}

interface ActionResult {
  ok: boolean
  message: string
}

type PendingAction = (() => void | Promise<void>) | null

const defaultSettings: AccessGuardSettings = {
  enabled: false,
  ttlMinutes: DEFAULT_TTL_MINUTES,
  password: '',
  recoveryPrompt: '',
  recoveryAnswer: ''
}

function hasWindow() {
  return typeof window !== 'undefined'
}

function normalizeSettings(value: Partial<AccessGuardSettings> | null): AccessGuardSettings {
  return {
    enabled: Boolean(value?.enabled),
    ttlMinutes: clampTtlMinutes(value?.ttlMinutes ?? DEFAULT_TTL_MINUTES),
    password: (value as Partial<AccessGuardSettings> & { passwordHash?: string })?.password || '',
    recoveryPrompt: value?.recoveryPrompt || '',
    recoveryAnswer: (value as Partial<AccessGuardSettings> & { recoveryAnswerHash?: string })?.recoveryAnswer || ''
  }
}

function readSettings() {
  if (!hasWindow()) return { ...defaultSettings }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return { ...defaultSettings }
    return normalizeSettings(JSON.parse(raw) as Partial<AccessGuardSettings>)
  } catch {
    return { ...defaultSettings }
  }
}

function readUnlockedUntil() {
  if (!hasWindow()) return 0
  const raw = Number(window.localStorage.getItem(UNLOCKED_UNTIL_STORAGE_KEY) || 0)
  return Number.isFinite(raw) ? raw : 0
}

function clampTtlMinutes(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_TTL_MINUTES
  return Math.min(1440, Math.max(1, Math.round(value)))
}

function normalizeSecret(value: string) {
  return value.trim()
}

export const useAccessGuardStore = defineStore('accessGuard', () => {
  const settings = ref<AccessGuardSettings>(readSettings())
  const unlockedUntil = ref(readUnlockedUntil())
  const dialogVisible = ref(false)
  const settingsVisible = ref(false)
  const accessTitle = ref('访问验证')
  const accessMessage = ref('请输入访问密码后继续')
  const loaded = ref(false)
  let pendingAction: PendingAction = null

  const isProtectionActive = computed(() => settings.value.enabled && Boolean(settings.value.password))
  const hasRecovery = computed(() => Boolean(settings.value.recoveryPrompt && settings.value.recoveryAnswer))

  function persistSettings() {
    if (!hasWindow()) return
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings.value))
  }

  function persistUnlockedUntil() {
    if (!hasWindow()) return
    window.localStorage.setItem(UNLOCKED_UNTIL_STORAGE_KEY, String(unlockedUntil.value))
  }

  function openSettings() {
    settingsVisible.value = true
  }

  async function loadSettings() {
    if (loaded.value) return settings.value
    try {
      settings.value = normalizeSettings(await getAccessGuardSettings())
      persistSettings()
    } catch {
      // Keep the local cache available if the network request fails during app startup.
    } finally {
      loaded.value = true
    }
    return settings.value
  }

  function cancelAccess() {
    pendingAction = null
    dialogVisible.value = false
  }

  function isProtectedPath(path: string) {
    return path.startsWith('/finance') || path.startsWith('/reports') || path.startsWith('/blacklist')
  }

  function hasValidSession() {
    if (!isProtectionActive.value) return true
    return Date.now() < unlockedUntil.value
  }

  function shouldAskForAccess() {
    return isProtectionActive.value && !hasValidSession()
  }

  function requiresAccessForPath(path: string) {
    return isProtectedPath(path) && shouldAskForAccess()
  }

  function requestAccess(options: AccessRequestOptions) {
    if (!shouldAskForAccess()) return true
    accessTitle.value = options.title
    accessMessage.value = options.message
    pendingAction = options.onSuccess
    dialogVisible.value = true
    return false
  }

  function grantSession() {
    unlockedUntil.value = Date.now() + settings.value.ttlMinutes * 60 * 1000
    persistUnlockedUntil()
  }

  async function runPendingAction() {
    const action = pendingAction
    pendingAction = null
    dialogVisible.value = false
    if (action) await action()
  }

  async function verifyPassword(password: string): Promise<ActionResult> {
    if (!normalizeSecret(password)) return { ok: false, message: '请输入访问密码' }
    if (!settings.value.password) return { ok: false, message: '当前还没有设置访问密码' }
    if (normalizeSecret(password) !== settings.value.password) return { ok: false, message: '访问密码不正确' }
    grantSession()
    await runPendingAction()
    return { ok: true, message: '已通过访问验证' }
  }

  async function resetPasswordWithRecovery(payload: RecoveryResetPayload): Promise<ActionResult> {
    if (!hasRecovery.value) return { ok: false, message: '当前还没有设置找回提示词和答案' }
    if (!normalizeSecret(payload.recoveryAnswer)) return { ok: false, message: '请输入找回答案' }
    if (normalizeSecret(payload.newPassword).length < 4) return { ok: false, message: '新访问密码至少 4 位' }
    if (normalizeSecret(payload.newPassword) !== normalizeSecret(payload.confirmPassword)) return { ok: false, message: '两次新访问密码不一致' }

    if (normalizeSecret(payload.recoveryAnswer) !== settings.value.recoveryAnswer) return { ok: false, message: '找回答案不正确' }

    settings.value = normalizeSettings(
      await updateAccessGuardSettings({
        enabled: true,
        ttlMinutes: settings.value.ttlMinutes,
        password: normalizeSecret(payload.newPassword),
        recoveryPrompt: settings.value.recoveryPrompt,
        recoveryAnswer: settings.value.recoveryAnswer
      })
    )
    persistSettings()
    grantSession()
    await runPendingAction()
    return { ok: true, message: '访问密码已重置' }
  }

  async function saveSettings(payload: SaveSettingsPayload): Promise<ActionResult> {
    const nextSettings: AccessGuardSettings = {
      ...settings.value,
      enabled: payload.enabled,
      ttlMinutes: clampTtlMinutes(payload.ttlMinutes)
    }

    const password = normalizeSecret(payload.password)
    const confirmPassword = normalizeSecret(payload.confirmPassword)
    const disablePassword = normalizeSecret(payload.disablePassword || '')
    if (settings.value.enabled && !payload.enabled && settings.value.password) {
      if (!disablePassword) return { ok: false, message: '请输入访问密码后关闭访问密码' }
      if (disablePassword !== settings.value.password) return { ok: false, message: '访问密码不正确，无法关闭' }
    }
    if (payload.enabled) {
      if (password || confirmPassword) {
        if (password.length < 4) return { ok: false, message: '访问密码至少 4 位' }
        if (password !== confirmPassword) return { ok: false, message: '两次访问密码不一致' }
        nextSettings.password = password
      }
      if (!nextSettings.password) return { ok: false, message: '开启访问密码时请先设置密码' }

      const recoveryPrompt = normalizeSecret(payload.recoveryPrompt)
      const recoveryAnswer = normalizeSecret(payload.recoveryAnswer)
      if (recoveryPrompt) nextSettings.recoveryPrompt = recoveryPrompt
      if (recoveryAnswer) nextSettings.recoveryAnswer = recoveryAnswer
      if (!nextSettings.recoveryPrompt || !nextSettings.recoveryAnswer) {
        return { ok: false, message: '开启访问密码时请设置找回提示词和答案' }
      }
    }

    settings.value = normalizeSettings(
      await updateAccessGuardSettings({
        enabled: nextSettings.enabled,
        ttlMinutes: nextSettings.ttlMinutes,
        ...(password ? { password } : {}),
        ...(!nextSettings.enabled && disablePassword ? { disablePassword } : {}),
        recoveryPrompt: nextSettings.recoveryPrompt,
        ...(normalizeSecret(payload.recoveryAnswer) ? { recoveryAnswer: nextSettings.recoveryAnswer } : {})
      })
    )
    persistSettings()
    return { ok: true, message: payload.enabled ? '访问密码设置已保存' : '访问密码已关闭' }
  }

  return {
    settings,
    dialogVisible,
    settingsVisible,
    accessTitle,
    accessMessage,
    isProtectionActive,
    hasRecovery,
    loadSettings,
    openSettings,
    cancelAccess,
    isProtectedPath,
    hasValidSession,
    shouldAskForAccess,
    requiresAccessForPath,
    requestAccess,
    verifyPassword,
    resetPasswordWithRecovery,
    saveSettings
  }
})
