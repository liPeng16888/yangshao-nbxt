import { describe, expect, it, vi } from 'vitest'

vi.mock('@/utils/request', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  useMocks: true
}))

import {
  createMedicineInbound,
  createMedicineCommonName,
  deleteMedicineCommonName,
  getMedicineCommonNames,
  getMedicineItems,
  getMedicineMovements
} from './medicineInventory'

describe('medicine inventory mock API', () => {
  it('stores an inbound record and personal common name without an HTTP request', async () => {
    const commonName = await createMedicineCommonName({ name: '盐酸' })
    const inbound = await createMedicineInbound({
      occurredOn: '2026-08-03',
      name: '盐酸',
      unit: 'BOTTLE',
      quantity: '10',
      remark: ''
    })

    await expect(getMedicineCommonNames()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: commonName.id, name: '盐酸' })
    ]))
    await expect(getMedicineItems()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: inbound.item.id, name: '盐酸', currentQuantity: 10 })
    ]))
    await expect(getMedicineMovements('inbound')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: inbound.movement.id, type: 'INBOUND', quantity: 10 })
    ]))
  })

  it('removes a personal common name without throwing', async () => {
    const commonName = await createMedicineCommonName({ name: '可移除药品' })

    await expect(deleteMedicineCommonName(commonName.id)).resolves.toBeUndefined()
    await expect(getMedicineCommonNames()).resolves.not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: commonName.id })
    ]))
  })
})
