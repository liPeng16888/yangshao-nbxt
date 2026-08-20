import type { LabSampleChangeRawField, LabSampleChangeRequestStatus } from '@/types/labSampleChangeRequest'

export const LAB_SAMPLE_CHANGE_RAW_FIELDS: LabSampleChangeRawField[] = [
  'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
  'sulfur', 'densityRaw', 'whiteness', 'calciumRaw', 'magnesiumRaw', 'carbon',
  'titaniumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample', 'moisture',
  'crucible', 'sampleWeight', 'burnedCrucibleSample'
]

export const labSampleChangeFieldLabels: Record<string, string> = {
  sampleNumber: '样品编号', payerCustomer: '付款客户', price: '价格', paymentStatus: '付款状态', elementNote: '元素备注',
  ironRaw: '铁', siliconRaw: '硅', siliconAdjust: '硅调整', aluminumRaw: '铝', aluminumAdjust: '铝调整',
  sulfur: '硫', densityRaw: '密度', whiteness: '白度', calciumRaw: '钙', magnesiumRaw: '镁', carbon: '碳',
  titaniumRaw: '钛', waterSample: '水样', bottleWater: '瓶水', bottleWaterSample: '瓶水样', moisture: '水分',
  crucible: '坩埚', sampleWeight: '样品重量', burnedCrucibleSample: '灼烧后坩埚样品'
}

export const labSampleChangeRequestStatusLabels: Record<LabSampleChangeRequestStatus, string> = {
  PENDING: '待审批', APPROVED: '已通过', REJECTED: '已驳回', WITHDRAWN: '已撤回'
}
