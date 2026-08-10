import request, { useMocks } from '@/utils/request'
import type { AccessGuardFeature } from '@/router/guards'

export interface AccessGuardGroup {
  id: string
  name: string
  enabled: boolean
  ttlMinutes: number
  password: string
  recoveryPrompt: string
  recoveryAnswer: string
  features: AccessGuardFeature[]
}

export type AccessGuardGroupPayload = Omit<AccessGuardGroup, 'id'>

export interface AccessGuardVerification {
  expiresAt: number
  token?: string
}

const STORAGE_KEY = 'ys_mock_access_guard_groups'

function readGroups(): AccessGuardGroup[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value as AccessGuardGroup[] : []
  } catch {
    return []
  }
}

function writeGroups(groups: AccessGuardGroup[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
}

export async function getAccessGuardGroups(): Promise<AccessGuardGroup[]> {
  if (useMocks) return readGroups()
  return request.get('/auth/access-groups')
}

export async function createAccessGuardGroup(payload: AccessGuardGroupPayload): Promise<AccessGuardGroup> {
  if (!useMocks) return request.post('/auth/access-groups', payload)
  const groups = readGroups()
  const duplicate = payload.features.find((feature) => groups.some((group) => group.features.includes(feature)))
  if (duplicate) throw new Error('该功能已加入其他访问组合')
  const group = { ...payload, id: `access-group-${Date.now()}-${Math.random().toString(16).slice(2)}` }
  writeGroups([...groups, group])
  return group
}

export async function updateAccessGuardGroup(id: string, payload: AccessGuardGroupPayload): Promise<AccessGuardGroup> {
  if (!useMocks) return request.patch(`/auth/access-groups/${encodeURIComponent(id)}`, payload)
  const groups = readGroups()
  const duplicate = payload.features.find((feature) => groups.some((group) => group.id !== id && group.features.includes(feature)))
  if (duplicate) throw new Error('该功能已加入其他访问组合')
  const group = { ...payload, id }
  writeGroups(groups.map((item) => item.id === id ? group : item))
  return group
}

export async function deleteAccessGuardGroup(id: string): Promise<void> {
  if (!useMocks) return request.delete(`/auth/access-groups/${encodeURIComponent(id)}`)
  writeGroups(readGroups().filter((group) => group.id !== id))
}

export async function verifyAccessGuardGroup(id: string, password: string, ttlMinutes: number, expectedPassword?: string): Promise<AccessGuardVerification> {
  if (!useMocks) return request.post(`/auth/access-groups/${encodeURIComponent(id)}/verify`, { password })
  if (password.trim() !== expectedPassword) throw new Error('访问密码不正确')
  return { expiresAt: Date.now() + ttlMinutes * 60_000, token: `mock-access-grant:${id}` }
}
