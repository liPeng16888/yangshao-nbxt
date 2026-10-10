import request, { useMocks } from '@/utils/request'
import type { LabTotalMonitorConfig } from '../../server/src/common/lab-total-monitor'

export function getLabTotalMonitorConfig(ownerId: string): Promise<LabTotalMonitorConfig> {
  if (useMocks) return request.get(`/__lab-total-monitor-mock/${encodeURIComponent(ownerId)}`, { baseURL: '' })
  return request.get('/lab-total-monitor')
}
