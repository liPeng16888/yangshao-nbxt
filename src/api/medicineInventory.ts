import request from '@/utils/request'
import type {
  CreateMedicineCorrectionPayload,
  CreateMedicineInboundPayload,
  CreateMedicineOutboundPayload,
  MedicineInventoryItem,
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
  const params = medicineItemIds?.length ? { medicineItemIds: medicineItemIds.join(',') } : undefined
  return params
    ? request.get('/medicine-inventory/items', { params })
    : request.get('/medicine-inventory/items')
}

export async function getMedicineMovements(
  kind: MedicineMovementKind,
  query: MedicineMovementQuery = {}
): Promise<MedicineInventoryMovement[]> {
  return request.get(`/medicine-inventory/${kind}s`, { params: queryParams(query) })
}

export async function createMedicineInbound(
  payload: CreateMedicineInboundPayload
): Promise<MedicineInventoryMutationResponse> {
  return request.post('/medicine-inventory/inbounds', payload)
}

export async function createMedicineOutbound(
  payload: CreateMedicineOutboundPayload
): Promise<MedicineInventoryMutationResponse> {
  return request.post('/medicine-inventory/outbounds', payload)
}

export async function correctMedicineMovement(
  movementId: string,
  payload: CreateMedicineCorrectionPayload
): Promise<MedicineInventoryMutationResponse> {
  return request.post(`/medicine-inventory/movements/${encodeURIComponent(movementId)}/corrections`, payload)
}
