import request, { useMocks } from '@/utils/request'
import {
  mockCreateMedicineCommonName,
  mockCreateMedicineInbound,
  mockCreateMedicineOutbound,
  mockDeleteMedicineCommonName,
  mockMedicineCommonNames,
  mockMedicineItems,
  mockMedicineMovements
} from '@/mocks/db'
import type {
  CreateMedicineCorrectionPayload,
  CreateMedicineInboundPayload,
  CreateMedicineOutboundPayload,
  MedicineInventoryItem,
  MedicineCommonName,
  MedicineInventoryMovement,
  MedicineInventoryMutationResponse,
  MedicineMovementKind,
  MedicineMovementQuery
} from '@/types/medicineInventory'

function queryParams(query: MedicineMovementQuery = {}) {
  const params: Record<string, string> = {}
  if (query.medicineItemIds?.length) params.medicineItemIds = query.medicineItemIds.join(',')
  if (query.startDate) params.startDate = query.startDate
  if (query.endDate) params.endDate = query.endDate
  return params
}

export async function getMedicineItems(medicineItemIds?: string[]): Promise<MedicineInventoryItem[]> {
  if (useMocks) return mockMedicineItems(medicineItemIds)
  const params = medicineItemIds?.length ? { medicineItemIds: medicineItemIds.join(',') } : undefined
  return params
    ? request.get('/medicine-inventory/items', { params })
    : request.get('/medicine-inventory/items')
}

export async function getMedicineCommonNames(): Promise<MedicineCommonName[]> {
  if (useMocks) return mockMedicineCommonNames()
  return request.get('/medicine-inventory/common-names')
}

export async function createMedicineCommonName(payload: { name: string }): Promise<MedicineCommonName> {
  if (useMocks) return mockCreateMedicineCommonName(payload.name)
  return request.post('/medicine-inventory/common-names', payload)
}

export async function deleteMedicineCommonName(commonNameId: string): Promise<void> {
  if (useMocks) return mockDeleteMedicineCommonName(commonNameId)
  await request.delete(`/medicine-inventory/common-names/${encodeURIComponent(commonNameId)}`)
}

export async function getMedicineMovements(
  kind: MedicineMovementKind,
  query: MedicineMovementQuery = {}
): Promise<MedicineInventoryMovement[]> {
  if (useMocks) return mockMedicineMovements(kind, query)
  return request.get(`/medicine-inventory/${kind}s`, { params: queryParams(query) })
}

export async function createMedicineInbound(
  payload: CreateMedicineInboundPayload
): Promise<MedicineInventoryMutationResponse> {
  if (useMocks) return mockCreateMedicineInbound(payload)
  return request.post('/medicine-inventory/inbounds', payload)
}

export async function createMedicineOutbound(
  payload: CreateMedicineOutboundPayload
): Promise<MedicineInventoryMutationResponse> {
  if (useMocks) return mockCreateMedicineOutbound(payload)
  return request.post('/medicine-inventory/outbounds', payload)
}

export async function correctMedicineMovement(
  movementId: string,
  payload: CreateMedicineCorrectionPayload
): Promise<MedicineInventoryMutationResponse> {
  return request.post(`/medicine-inventory/movements/${encodeURIComponent(movementId)}/corrections`, payload)
}
