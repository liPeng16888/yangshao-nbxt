import request, { useMocks } from '@/utils/request'
import type { AccessGuardFeature } from '@/router/guards'

export interface AccessGuardGroup {
  id: string
  name: string
  enabled: boolean
  ttlMinutes: number
  grantVersion: number
  password: string
  recoveryPrompt: string
  recoveryAnswer: string
  features: AccessGuardFeature[]
}

export type AccessGuardGroupPayload = Omit<AccessGuardGroup, 'id' | 'grantVersion'>

export interface AccessGuardVerification {
  expiresAt: number
  token: string
  groupId: string
  grantVersion: number
  features: AccessGuardFeature[]
}

const STORAGE_KEY = 'ys_mock_access_guard_groups'
export const ACCESS_GUARD_SESSION_KEY = 'ys_access_guard_group_sessions'

export interface StoredAccessGuardSession {
  expiresAt?: number
  token?: string
  groupId?: string
  grantVersion?: number
  features?: string[]
}

export type StoredAccessGuardSessions = Record<string, StoredAccessGuardSession>

export function readAccessGuardSessions(): StoredAccessGuardSessions {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ACCESS_GUARD_SESSION_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, session]) =>
      Boolean(session) && typeof session === 'object' && !Array.isArray(session)
    )) as StoredAccessGuardSessions
  } catch { return {} }
}

export function writeAccessGuardSessions(sessions: StoredAccessGuardSessions) {
  window.localStorage.setItem(ACCESS_GUARD_SESSION_KEY, JSON.stringify(sessions))
}

export function removeAccessGuardSession(groupId: string) {
  const sessions = readAccessGuardSessions()
  if (!(groupId in sessions)) return false
  delete sessions[groupId]
  writeAccessGuardSessions(sessions)
  return true
}

export function selectAccessGuardGrant(sessions: StoredAccessGuardSessions, feature: AccessGuardFeature, now = Date.now()) {
  return Object.entries(sessions).find(([groupId, session]) =>
    session.groupId === groupId && Number.isInteger(session.grantVersion) && Number(session.grantVersion) > 0 &&
    (session.expiresAt || 0) > now && Boolean(session.token) && session.features?.includes(feature)
  )?.[1].token
}

function normalizeGroup(group: AccessGuardGroup): AccessGuardGroup {
  return {
    ...group,
    password: typeof group.password === 'string' ? group.password : '',
    recoveryPrompt: typeof group.recoveryPrompt === 'string' ? group.recoveryPrompt : '',
    recoveryAnswer: typeof group.recoveryAnswer === 'string' ? group.recoveryAnswer : '',
    grantVersion: Number.isInteger(group.grantVersion) && group.grantVersion > 0 ? group.grantVersion : 1
  }
}

function readGroups(): AccessGuardGroup[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? (value as AccessGuardGroup[]).map(normalizeGroup) : []
  } catch {
    return []
  }
}

function writeGroups(groups: AccessGuardGroup[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

export async function getAccessGuardGroups(): Promise<AccessGuardGroup[]> {
  if (useMocks) return readGroups()
  return request.get<unknown, AccessGuardGroup[]>('/auth/access-groups').then((groups) => groups.map(normalizeGroup))
}

export async function createAccessGuardGroup(payload: AccessGuardGroupPayload): Promise<AccessGuardGroup> {
  if (!useMocks) return request.post<unknown, AccessGuardGroup>('/auth/access-groups', payload).then(normalizeGroup)
  const groups = readGroups()
  const duplicate = payload.features.find((feature) => groups.some((group) => group.features.includes(feature)))
  if (duplicate) throw new Error('该功能已加入其他访问组合')
  const group = { ...payload, id: `access-group-${Date.now()}-${Math.random().toString(16).slice(2)}`, grantVersion: 1 }
  writeGroups([...groups, group])
  return group
}

export async function updateAccessGuardGroup(id: string, payload: AccessGuardGroupPayload): Promise<AccessGuardGroup> {
  if (!useMocks) return request.patch<unknown, AccessGuardGroup>(`/auth/access-groups/${encodeURIComponent(id)}`, payload).then(normalizeGroup)
  const groups = readGroups()
  const duplicate = payload.features.find((feature) => groups.some((group) => group.id !== id && group.features.includes(feature)))
  if (duplicate) throw new Error('该功能已加入其他访问组合')
  const existing = groups.find((item) => item.id === id)
  if (!existing) throw new Error('访问组合不存在')
  const group = { ...payload, id, grantVersion: existing.grantVersion + 1 }
  writeGroups(groups.map((item) => item.id === id ? group : item))
  return group
}

export async function deleteAccessGuardGroup(id: string): Promise<void> {
  if (!useMocks) return request.delete(`/auth/access-groups/${encodeURIComponent(id)}`)
  writeGroups(readGroups().filter((group) => group.id !== id))
}

export async function verifyAccessGuardGroup(id: string, password: string, ttlMinutes: number, expectedPassword?: string): Promise<AccessGuardVerification> {
  if (!useMocks) return request.post(`/auth/access-groups/${encodeURIComponent(id)}/verify`, { password })
  const group = readGroups().find((item) => item.id === id)
  if (group && !group.enabled) throw new Error('访问组合不存在或未启用')
  if (password.trim() !== (group?.password ?? expectedPassword)) throw new Error('访问密码不正确')
  const grantVersion = group?.grantVersion ?? 1
  const features = group?.features ?? []
  return {
    expiresAt: Date.now() + (group?.ttlMinutes ?? ttlMinutes) * 60_000,
    token: `mock-access-grant:${id}:${grantVersion}`,
    groupId: id,
    grantVersion,
    features
  }
}
