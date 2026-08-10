import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createAccessGuardGroup, deleteAccessGuardGroup, getAccessGuardGroups, readAccessGuardSessions,
  removeAccessGuardSession, updateAccessGuardGroup, verifyAccessGuardGroup, writeAccessGuardSessions,
  type AccessGuardGroup, type AccessGuardGroupPayload, type StoredAccessGuardSession
} from '@/api/accessGuard'
import { featureForPath, type AccessGuardFeature } from '@/router/guards'

interface AccessRequestOptions { title: string; message: string; onSuccess: () => void | Promise<void> }
type PendingAction = (() => void | Promise<void>) | null

export type AccessGuardSession = StoredAccessGuardSession

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
  const settings = computed(() => activeGroup.value || { enabled: false, ttlMinutes: 5, grantVersion: 0, password: '', recoveryPrompt: '', recoveryAnswer: '' })
  const isProtectionActive = computed(() => groups.value.some((group) => group.enabled && group.features.length))
  const hasRecovery = computed(() => Boolean(activeGroup.value?.recoveryPrompt && activeGroup.value?.recoveryAnswer))

  async function loadGroups(force = false) {
    if (loaded.value && !force) return groups.value
    groups.value = await getAccessGuardGroups()
    const currentGroups = new Map(groups.value.map((group) => [group.id, group]))
    const sessions = readAccessGuardSessions()
    let changed = false
    for (const [id, session] of Object.entries(sessions)) {
      const group = currentGroups.get(id)
      const sameFeatures = group && [...(session.features || [])].sort().join('|') === [...group.features].sort().join('|')
      if (!group || !group.enabled || session.groupId !== id || session.grantVersion !== group.grantVersion || !sameFeatures) {
        delete sessions[id]
        changed = true
      }
    }
    if (changed) { writeAccessGuardSessions(sessions); accessSessionRevision.value += 1 }
    loaded.value = true
    return groups.value
  }

  function groupForFeature(feature: AccessGuardFeature) { return groups.value.find((group) => group.enabled && group.features.includes(feature)) || null }
  function hasFeatureAccess(feature: AccessGuardFeature) {
    const group = groupForFeature(feature)
    if (!group) return true
    const session = readAccessGuardSessions()[group.id]
    return Boolean(
      session?.groupId === group.id && session.grantVersion === group.grantVersion && session.token &&
      (session.expiresAt || 0) > Date.now() && session.features?.includes(feature)
    )
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
      if (verification.groupId !== group.id || !verification.features.length) return { ok: false, message: '访问授权响应无效' }
      group.grantVersion = verification.grantVersion
      group.features = [...verification.features]
      const sessions = readAccessGuardSessions(); sessions[group.id] = verification; writeAccessGuardSessions(sessions); accessSessionRevision.value += 1
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
    await updateAccessGuardGroup(group.id, { ...group, password: payload.newPassword.trim() })
    if (removeAccessGuardSession(group.id)) accessSessionRevision.value += 1
    await loadGroups(true)
    return verifyPassword(payload.newPassword)
  }
  async function saveGroup(payload: AccessGuardGroupPayload, id?: string) {
    const result = id ? await updateAccessGuardGroup(id, payload) : await createAccessGuardGroup(payload)
    if (id && removeAccessGuardSession(id)) accessSessionRevision.value += 1
    await loadGroups(true)
    return result
  }
  async function removeGroup(id: string) {
    await deleteAccessGuardGroup(id)
    if (removeAccessGuardSession(id)) accessSessionRevision.value += 1
    await loadGroups(true)
  }
  function openSettings() { settingsVisible.value = true; void loadGroups() }

  return { groups, settings, activeGroup, settingsVisible, dialogVisible, accessTitle, accessMessage, accessSessionRevision, isProtectionActive, hasRecovery, loadGroups, openSettings, cancelAccess, isProtectedPath, hasValidSession, requiresAccessForPath, requestAccess, requestFeatureAccess, hasFeatureAccess, verifyPassword, resetPasswordWithRecovery, saveGroup, removeGroup }
})
