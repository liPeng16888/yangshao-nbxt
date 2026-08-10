import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createAccessGuardGroup, deleteAccessGuardGroup, getAccessGuardGroups, updateAccessGuardGroup, verifyAccessGuardGroup, type AccessGuardGroup, type AccessGuardGroupPayload } from '@/api/accessGuard'
import { featureForPath, type AccessGuardFeature } from '@/router/guards'

interface AccessRequestOptions { title: string; message: string; onSuccess: () => void | Promise<void> }
type PendingAction = (() => void | Promise<void>) | null

const SESSION_KEY = 'ys_access_guard_group_sessions'

export interface AccessGuardSession { expiresAt: number; token?: string; features?: AccessGuardFeature[] }

function readSessions(): Record<string, AccessGuardSession> {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SESSION_KEY) || '{}') as Record<string, AccessGuardSession | number>
    return Object.fromEntries(Object.entries(stored).map(([id, value]) => [id, typeof value === 'number' ? { expiresAt: value } : value]))
  } catch { return {} }
}

function writeSessions(value: Record<string, AccessGuardSession>) { window.localStorage.setItem(SESSION_KEY, JSON.stringify(value)) }

export const useAccessGuardStore = defineStore('accessGuard', () => {
  const groups = ref<AccessGuardGroup[]>([])
  const loaded = ref(false)
  const settingsVisible = ref(false)
  const dialogVisible = ref(false)
  const accessTitle = ref('访问验证')
  const accessMessage = ref('请输入访问密码后继续')
  const activeGroupId = ref('')
  const accessSessionRevision = ref(0)
  let pendingAction: PendingAction = null

  const activeGroup = computed(() => groups.value.find((group) => group.id === activeGroupId.value) || null)
  const settings = computed(() => activeGroup.value || { enabled: false, ttlMinutes: 5, password: '', recoveryPrompt: '', recoveryAnswer: '' })
  const isProtectionActive = computed(() => groups.value.some((group) => group.enabled && group.features.length))
  const hasRecovery = computed(() => Boolean(activeGroup.value?.recoveryPrompt && activeGroup.value?.recoveryAnswer))

  async function loadGroups(force = false) {
    if (loaded.value && !force) return groups.value
    groups.value = await getAccessGuardGroups()
    loaded.value = true
    return groups.value
  }

  function groupForFeature(feature: AccessGuardFeature) { return groups.value.find((group) => group.enabled && group.features.includes(feature)) || null }
  function hasFeatureAccess(feature: AccessGuardFeature) {
    const group = groupForFeature(feature)
    if (!group) return true
    return (readSessions()[group.id]?.expiresAt || 0) > Date.now()
  }
  function hasValidSession() { return Boolean(activeGroup.value && hasFeatureAccess(activeGroup.value.features[0])) }
  function isProtectedPath(path: string) { return featureForPath(path) !== null }
  function requiresAccessForPath(path: string) { const feature = featureForPath(path); return Boolean(feature && !hasFeatureAccess(feature)) }
  function requestFeatureAccess(feature: AccessGuardFeature, options: AccessRequestOptions) {
    const group = groupForFeature(feature)
    if (!group || hasFeatureAccess(feature)) return true
    activeGroupId.value = group.id
    accessTitle.value = options.title
    accessMessage.value = options.message
    pendingAction = options.onSuccess
    dialogVisible.value = true
    return false
  }
  function requestAccess(options: AccessRequestOptions) {
    const feature = featureForPath(location.pathname)
    return feature ? requestFeatureAccess(feature, options) : true
  }
  function cancelAccess() { pendingAction = null; dialogVisible.value = false }
  async function verifyPassword(password: string) {
    const group = activeGroup.value
    if (!group) return { ok: false, message: '未找到访问组合' }
    if (!password.trim()) return { ok: false, message: '请输入访问密码' }
    try {
      const verification = await verifyAccessGuardGroup(group.id, password.trim(), group.ttlMinutes, group.password)
      const sessions = readSessions(); sessions[group.id] = { ...verification, features: [...group.features] }; writeSessions(sessions); accessSessionRevision.value += 1
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '访问密码不正确' }
    }
    const action = pendingAction; pendingAction = null; dialogVisible.value = false; if (action) await action()
    return { ok: true, message: `已通过“${group.name}”访问验证` }
  }
  async function resetPasswordWithRecovery(payload: { recoveryAnswer: string; newPassword: string; confirmPassword: string }) {
    const group = activeGroup.value
    if (!group || payload.recoveryAnswer.trim() !== group.recoveryAnswer) return { ok: false, message: '找回答案不正确' }
    if (payload.newPassword.trim().length < 4 || payload.newPassword.trim() !== payload.confirmPassword.trim()) return { ok: false, message: '新访问密码至少 4 位且两次输入一致' }
    await updateAccessGuardGroup(group.id, { ...group, password: payload.newPassword.trim() }); await loadGroups(true)
    return verifyPassword(payload.newPassword)
  }
  async function saveGroup(payload: AccessGuardGroupPayload, id?: string) { const result = id ? await updateAccessGuardGroup(id, payload) : await createAccessGuardGroup(payload); await loadGroups(true); return result }
  async function removeGroup(id: string) { await deleteAccessGuardGroup(id); await loadGroups(true) }
  function openSettings() { settingsVisible.value = true; void loadGroups() }

  return { groups, settings, activeGroup, settingsVisible, dialogVisible, accessTitle, accessMessage, accessSessionRevision, isProtectionActive, hasRecovery, loadGroups, openSettings, cancelAccess, isProtectedPath, hasValidSession, requiresAccessForPath, requestAccess, requestFeatureAccess, hasFeatureAccess, verifyPassword, resetPasswordWithRecovery, saveGroup, removeGroup }
})
