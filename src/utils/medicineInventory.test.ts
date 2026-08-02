import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMedicineOutbound,
  getMedicineItems,
  getMedicineMovements
} from '@/api/medicineInventory'
import { formatMedicineQuantity, validateMedicineQuantity } from './medicineInventory'

const requestMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn()
}))

vi.mock('@/utils/request', () => ({ default: requestMock }))

describe('medicine inventory quantity utilities', () => {
  it('accepts positive integer bottle quantities', () => {
    expect(validateMedicineQuantity('BOTTLE', 1)).toEqual({ ok: true, value: '1' })
    expect(validateMedicineQuantity('BOTTLE', '12')).toEqual({ ok: true, value: '12' })
  })

  it('rejects fractional bottle quantities', () => {
    expect(validateMedicineQuantity('BOTTLE', 1.5)).toEqual({ ok: false, message: '瓶数量必须是正整数' })
  })

  it('allows at most three decimal places for non-bottle quantities', () => {
    expect(validateMedicineQuantity('GRAM', '1.234')).toEqual({ ok: true, value: '1.234' })
    expect(validateMedicineQuantity('GRAM', '1.2345').ok).toBe(false)
  })

  it('rejects zero and negative quantities', () => {
    expect(validateMedicineQuantity('LITER', 0).ok).toBe(false)
    expect(validateMedicineQuantity('LITER', -1).ok).toBe(false)
  })

  it('formats quantities without meaningless trailing zeroes', () => {
    expect(formatMedicineQuantity('12.3000')).toBe('12.3')
    expect(formatMedicineQuantity('12.000')).toBe('12')
    expect(formatMedicineQuantity(0.125)).toBe('0.125')
  })
})

describe('medicine inventory API wrappers', () => {
  beforeEach(() => {
    requestMock.get.mockReset()
    requestMock.post.mockReset()
  })

  it('encodes multiple medicine item IDs as a comma-separated query parameter', async () => {
    requestMock.get.mockResolvedValueOnce([])

    await getMedicineItems(['item-1', 'item-2'])

    expect(requestMock.get).toHaveBeenCalledWith('/medicine-inventory/items', {
      params: { medicineItemIds: 'item-1,item-2' }
    })
  })

  it('encodes movement item IDs together with the date range', async () => {
    requestMock.get.mockResolvedValueOnce([])

    await getMedicineMovements('inbound', {
      medicineItemIds: ['item-1', 'item-2'],
      startDate: '2026-08-01',
      endDate: '2026-08-02'
    })

    expect(requestMock.get).toHaveBeenCalledWith('/medicine-inventory/inbounds', {
      params: {
        medicineItemIds: 'item-1,item-2',
        startDate: '2026-08-01',
        endDate: '2026-08-02'
      }
    })
  })

  it('propagates a 409 from outbound creation to the page handler', async () => {
    const conflict = { response: { status: 409 } }
    requestMock.post.mockRejectedValueOnce(conflict)

    await expect(
      createMedicineOutbound({
        occurredOn: '2026-08-02',
        medicineItemId: 'item-1',
        quantity: 2,
        remark: '出库'
      })
    ).rejects.toBe(conflict)
  })
})
