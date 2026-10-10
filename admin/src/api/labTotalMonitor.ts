import { request, useAdminMocks } from '../api'
import type { LabTotalMonitorBulkRequest, LabTotalMonitorBulkResult, LabTotalMonitorConfig, LabTotalMonitorRule } from '../../../server/src/common/lab-total-monitor'

async function mockRequest(ownerId: string, body?: unknown): Promise<LabTotalMonitorConfig> {
  const response = await fetch(`/__lab-total-monitor-mock/${encodeURIComponent(ownerId)}`, {
    method: body === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.message || '监测规则请求失败')
  return value
}
export function getAdminLabTotalMonitorConfig(ownerId: string): Promise<LabTotalMonitorConfig> {
  return useAdminMocks ? mockRequest(ownerId) : request.get(`/admin/lab-total-monitor/${encodeURIComponent(ownerId)}`)
}
export function saveAdminLabTotalMonitorConfig(ownerId: string, rules: LabTotalMonitorRule[], baseVersion: number): Promise<LabTotalMonitorConfig> {
  return useAdminMocks ? mockRequest(ownerId, { rules, baseVersion })
    : request.put(`/admin/lab-total-monitor/${encodeURIComponent(ownerId)}`, { rules, baseVersion })
}

export async function bulkAppendAdminLabTotalMonitorRules(payload: LabTotalMonitorBulkRequest): Promise<LabTotalMonitorBulkResult[]> {
  if (!useAdminMocks) return request.post('/admin/lab-total-monitor/bulk', payload)
  const response = await fetch('/__lab-total-monitor-mock/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.message || '批量添加失败')
  return value
}
