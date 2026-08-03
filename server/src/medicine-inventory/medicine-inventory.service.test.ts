import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { MedicineMovementType, MedicineUnit, Prisma } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CreateMedicineCorrectionDto,
  CreateMedicineInboundDto,
  MedicineMovementQueryDto
} from './medicine-inventory.dto'
import { MedicineInventoryService } from './medicine-inventory.service'
import { validateMedicineQuantity } from './medicine-inventory.types'

const createdAt = new Date('2026-08-02T08:00:00.000Z')

function medicineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    frontendUserId: 'front-1',
    name: '盐酸',
    unit: MedicineUnit.GRAM,
    currentQuantity: new Prisma.Decimal('5'),
    createdAt,
    updatedAt: createdAt,
    ...overrides
  }
}

function medicineMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'movement-1',
    frontendUserId: 'front-1',
    medicineItemId: 'item-1',
    type: MedicineMovementType.INBOUND,
    occurredOn: '2026-08-02',
    quantity: new Prisma.Decimal('1.5'),
    nameSnapshot: '盐酸',
    unitSnapshot: MedicineUnit.GRAM,
    remark: null,
    correctionOfId: null,
    createdAt,
    ...overrides
  }
}

describe('validateMedicineQuantity', () => {
  it('rejects fractional bottle quantities', () => {
    expect(validateMedicineQuantity(MedicineUnit.BOTTLE, 1.5)).toEqual({
      ok: false,
      message: '瓶数量必须是正整数'
    })
  })

  it('accepts gram quantities with three decimal places', () => {
    expect(validateMedicineQuantity(MedicineUnit.GRAM, 1.234)).toEqual({
      ok: true,
      value: '1.234'
    })
  })

  it('rejects quantities with more than three decimal places', () => {
    expect(validateMedicineQuantity(MedicineUnit.GRAM, 1.2345).ok).toBe(false)
  })

  it.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])('rejects non-positive or non-finite quantity %s', (quantity) => {
    expect(validateMedicineQuantity(MedicineUnit.GRAM, quantity).ok).toBe(false)
  })

  it.each([MedicineUnit.LITER, MedicineUnit.MILLILITER, MedicineUnit.GRAM])(
    'enforces three decimal places for %s',
    (unit) => {
      expect(validateMedicineQuantity(unit, '0.001')).toEqual({ ok: true, value: '0.001' })
      expect(validateMedicineQuantity(unit, '0.0001')).toEqual({
        ok: false,
        message: '数量最多保留 3 位小数'
      })
    }
  )

  it('enforces the Decimal(14, 3) upper boundary', () => {
    expect(validateMedicineQuantity(MedicineUnit.GRAM, '99999999999.999')).toEqual({
      ok: true,
      value: '99999999999.999'
    })
    expect(validateMedicineQuantity(MedicineUnit.GRAM, '100000000000')).toEqual({
      ok: false,
      message: '数量超出允许范围'
    })
  })
})

describe('medicine inventory DTO normalization', () => {
  it('trims inbound names and remarks without coercing decimal input through binary floats', () => {
    const dto = plainToInstance(CreateMedicineInboundDto, {
      occurredOn: ' 2026-08-02 ',
      name: ' 盐酸 ',
      unit: MedicineUnit.GRAM,
      quantity: '99999999999.999',
      remark: ' 批次 A '
    })

    expect(dto).toMatchObject({
      occurredOn: '2026-08-02',
      name: '盐酸',
      unit: MedicineUnit.GRAM,
      quantity: '99999999999.999',
      remark: '批次 A'
    })
  })

  it('parses comma-separated multi-value query parameters and removes blanks and duplicates', () => {
    const dto = plainToInstance(MedicineMovementQueryDto, {
      frontendUserIds: [' front-1,front-2 ', 'front-1'],
      medicineItemIds: ' item-1, item-2,,item-1 '
    })

    expect(dto.frontendUserIds).toEqual(['front-1', 'front-2'])
    expect(dto.medicineItemIds).toEqual(['item-1', 'item-2'])
  })

  it('trims correction reasons', () => {
    const dto = plainToInstance(CreateMedicineCorrectionDto, { reason: ' 盘点录入错误 ' })

    expect(dto.reason).toBe('盘点录入错误')
  })
})

describe('MedicineInventoryService listItems', () => {
  const prisma = {
    medicineInventoryItem: {
      findMany: vi.fn()
    }
  }
  let service: MedicineInventoryService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.medicineInventoryItem.findMany.mockResolvedValue([])
    service = new MedicineInventoryService(prisma as never)
  })

  it('always limits inventory items to the supplied frontend accounts', async () => {
    await service.listItems(['front-1'])

    expect(prisma.medicineInventoryItem.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: { in: ['front-1'] } },
      orderBy: [{ name: 'asc' }, { unit: 'asc' }]
    })
  })

  it('combines medicine item filters with the frontend account scope', async () => {
    await service.listItems(['front-1'], ['item-1', 'item-2'])

    expect(prisma.medicineInventoryItem.findMany).toHaveBeenCalledWith({
      where: {
        frontendUserId: { in: ['front-1'] },
        id: { in: ['item-1', 'item-2'] }
      },
      orderBy: [{ name: 'asc' }, { unit: 'asc' }]
    })
  })
})

describe('MedicineInventoryService common names', () => {
  const prisma = {
    medicineCommonName: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn()
    }
  }
  let service: MedicineInventoryService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new MedicineInventoryService(prisma as never)
  })

  it('keeps common-name listing and deletion within the current frontend account', async () => {
    prisma.medicineCommonName.findMany.mockResolvedValue([])
    prisma.medicineCommonName.deleteMany.mockResolvedValue({ count: 1 })

    await service.listCommonNames(['front-1'])
    await service.deleteCommonName('front-1', 'common-1')

    expect(prisma.medicineCommonName.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: { in: ['front-1'] } },
      orderBy: { name: 'asc' }
    })
    expect(prisma.medicineCommonName.deleteMany).toHaveBeenCalledWith({
      where: { id: 'common-1', frontendUserId: 'front-1' }
    })
  })

  it('normalizes common names before creating or reusing them', async () => {
    prisma.medicineCommonName.upsert.mockResolvedValue({ id: 'common-1', frontendUserId: 'front-1', name: '盐酸' })

    await service.createCommonName('front-1', ' 盐酸 ')

    expect(prisma.medicineCommonName.upsert).toHaveBeenCalledWith({
      where: { frontendUserId_name: { frontendUserId: 'front-1', name: '盐酸' } },
      create: { frontendUserId: 'front-1', name: '盐酸' },
      update: {}
    })
  })
})

describe('MedicineInventoryService inventory transactions', () => {
  const tx = {
    medicineInventoryItem: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn()
    },
    medicineInventoryMovement: {
      create: vi.fn()
    }
  }
  const prisma = {
    medicineInventoryItem: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  }
  let service: MedicineInventoryService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (callback) => callback(tx))
    service = new MedicineInventoryService(prisma as never)
  })

  it('upserts normalized inbound stock and creates its movement in one transaction', async () => {
    tx.medicineInventoryItem.upsert.mockResolvedValue(
      medicineItem({ currentQuantity: new Prisma.Decimal('6.5') })
    )
    tx.medicineInventoryMovement.create.mockResolvedValue(medicineMovement())

    const result = await service.createInbound('front-1', {
      occurredOn: '2026-08-02',
      name: '  盐酸  ',
      unit: MedicineUnit.GRAM,
      quantity: '1.500',
      remark: '  首批  '
    })

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(tx.medicineInventoryItem.upsert).toHaveBeenCalledWith({
      where: {
        frontendUserId_name_unit: {
          frontendUserId: 'front-1',
          name: '盐酸',
          unit: MedicineUnit.GRAM
        }
      },
      create: {
        frontendUserId: 'front-1',
        name: '盐酸',
        unit: MedicineUnit.GRAM,
        currentQuantity: expect.any(Prisma.Decimal)
      },
      update: {
        currentQuantity: { increment: expect.any(Prisma.Decimal) }
      }
    })
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledWith({
      data: {
        frontendUserId: 'front-1',
        medicineItemId: 'item-1',
        type: MedicineMovementType.INBOUND,
        occurredOn: '2026-08-02',
        quantity: expect.any(Prisma.Decimal),
        nameSnapshot: '盐酸',
        unitSnapshot: MedicineUnit.GRAM,
        remark: '首批'
      }
    })
    const upsertInput = tx.medicineInventoryItem.upsert.mock.calls[0][0]
    expect(upsertInput.create.currentQuantity.toString()).toBe('1.5')
    expect(upsertInput.update.currentQuantity.increment.toString()).toBe('1.5')
    expect(result.item.currentQuantity).toBe(6.5)
    expect(result.movement.quantity).toBe(1.5)
  })

  it('uses different item keys for the same normalized name with different units', async () => {
    tx.medicineInventoryItem.upsert
      .mockResolvedValueOnce(medicineItem({ unit: MedicineUnit.BOTTLE }))
      .mockResolvedValueOnce(medicineItem({ id: 'item-2', unit: MedicineUnit.MILLILITER }))
    tx.medicineInventoryMovement.create
      .mockResolvedValueOnce(medicineMovement({ unitSnapshot: MedicineUnit.BOTTLE, quantity: new Prisma.Decimal('1') }))
      .mockResolvedValueOnce(medicineMovement({ medicineItemId: 'item-2', unitSnapshot: MedicineUnit.MILLILITER }))

    await service.createInbound('front-1', {
      occurredOn: '2026-08-02',
      name: ' 盐酸 ',
      unit: MedicineUnit.BOTTLE,
      quantity: 1
    })
    await service.createInbound('front-1', {
      occurredOn: '2026-08-02',
      name: '盐酸',
      unit: MedicineUnit.MILLILITER,
      quantity: 1.5
    })

    expect(tx.medicineInventoryItem.upsert.mock.calls.map(([input]) => input.where)).toEqual([
      {
        frontendUserId_name_unit: {
          frontendUserId: 'front-1',
          name: '盐酸',
          unit: MedicineUnit.BOTTLE
        }
      },
      {
        frontendUserId_name_unit: {
          frontendUserId: 'front-1',
          name: '盐酸',
          unit: MedicineUnit.MILLILITER
        }
      }
    ])
  })

  it('maps aggregate Decimal overflow to a clear conflict instead of leaking a Prisma error', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2020' })

    const error = await service.createInbound('front-1', {
      occurredOn: '2026-08-02',
      name: '盐酸',
      unit: MedicineUnit.GRAM,
      quantity: 1
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getStatus()).toBe(409)
    expect(error.message).toContain('库存数量超出允许范围')
  })

  it('conditionally decrements outbound stock before creating the movement', async () => {
    tx.medicineInventoryItem.findFirst
      .mockResolvedValueOnce(medicineItem({ unit: MedicineUnit.BOTTLE, currentQuantity: new Prisma.Decimal('5') }))
      .mockResolvedValueOnce(medicineItem({ unit: MedicineUnit.BOTTLE, currentQuantity: new Prisma.Decimal('2') }))
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 1 })
    tx.medicineInventoryMovement.create.mockResolvedValue(
      medicineMovement({ type: MedicineMovementType.OUTBOUND, unitSnapshot: MedicineUnit.BOTTLE, quantity: new Prisma.Decimal('3') })
    )

    const result = await service.createOutbound('front-1', {
      occurredOn: '2026-08-02',
      medicineItemId: ' item-1 ',
      quantity: 3,
      remark: ' 生产领用 '
    })

    expect(tx.medicineInventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'item-1',
        frontendUserId: 'front-1',
        currentQuantity: { gte: expect.any(Prisma.Decimal) }
      },
      data: { currentQuantity: { decrement: expect.any(Prisma.Decimal) } }
    })
    expect(tx.medicineInventoryItem.findFirst.mock.calls[0][0]).toEqual({
      where: { id: 'item-1', frontendUserId: 'front-1' }
    })
    expect(tx.medicineInventoryItem.findFirst.mock.calls[1][0]).toEqual({
      where: { id: 'item-1', frontendUserId: 'front-1' }
    })
    const updateInput = tx.medicineInventoryItem.updateMany.mock.calls[0][0]
    expect(updateInput.where.currentQuantity.gte.toString()).toBe('3')
    expect(updateInput.data.currentQuantity.decrement.toString()).toBe('3')
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledTimes(1)
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        frontendUserId: 'front-1',
        medicineItemId: 'item-1',
        type: MedicineMovementType.OUTBOUND,
        remark: '生产领用'
      })
    })
    expect(result.item.currentQuantity).toBe(2)
    expect(result.movement.quantity).toBe(3)
  })

  it('returns a conflict with latest stock and creates no movement when conditional outbound fails', async () => {
    tx.medicineInventoryItem.findFirst
      .mockResolvedValueOnce(medicineItem({ unit: MedicineUnit.BOTTLE, currentQuantity: new Prisma.Decimal('2') }))
      .mockResolvedValueOnce(medicineItem({ unit: MedicineUnit.BOTTLE, currentQuantity: new Prisma.Decimal('2') }))
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 0 })

    const promise = service.createOutbound('front-1', {
      occurredOn: '2026-08-02',
      medicineItemId: 'item-1',
      quantity: 3
    })

    await expect(promise).rejects.toBeInstanceOf(ConflictException)
    await expect(promise).rejects.toThrow('库存不足，当前库存为 2 瓶')
    expect(tx.medicineInventoryMovement.create).not.toHaveBeenCalled()
    expect(tx.medicineInventoryItem.findFirst).toHaveBeenLastCalledWith({
      where: { id: 'item-1', frontendUserId: 'front-1' }
    })
  })

  it('allows only one of two competing outbounds when their combined quantity exceeds stock', async () => {
    let stock = new Prisma.Decimal('5')
    tx.medicineInventoryItem.findFirst.mockImplementation(async () =>
      medicineItem({ unit: MedicineUnit.BOTTLE, currentQuantity: stock })
    )
    tx.medicineInventoryItem.updateMany.mockImplementation(async ({ where }) => {
      const quantity = where.currentQuantity.gte as Prisma.Decimal
      if (stock.lessThan(quantity)) return { count: 0 }
      stock = stock.minus(quantity)
      return { count: 1 }
    })
    tx.medicineInventoryMovement.create.mockImplementation(async ({ data }) =>
      medicineMovement({
        id: `movement-${tx.medicineInventoryMovement.create.mock.calls.length}`,
        type: MedicineMovementType.OUTBOUND,
        unitSnapshot: MedicineUnit.BOTTLE,
        quantity: data.quantity
      })
    )

    const attempts = await Promise.allSettled([
      service.createOutbound('front-1', {
        occurredOn: '2026-08-02',
        medicineItemId: 'item-1',
        quantity: 3
      }),
      service.createOutbound('front-1', {
        occurredOn: '2026-08-02',
        medicineItemId: 'item-1',
        quantity: 3
      })
    ])

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1)
    expect(stock.toString()).toBe('2')
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledTimes(1)
  })
})

describe('MedicineInventoryService movement listing', () => {
  const prisma = {
    medicineInventoryItem: { findMany: vi.fn() },
    medicineInventoryMovement: { findMany: vi.fn() }
  }
  let service: MedicineInventoryService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.medicineInventoryMovement.findMany.mockResolvedValue([
      medicineMovement({ quantity: new Prisma.Decimal('1.250') })
    ])
    service = new MedicineInventoryService(prisma as never)
  })

  it('combines inbound movement, account, item and date filters and returns numeric quantities', async () => {
    const rows = await service.listMovements([' front-1 ', 'front-1'], 'inbound', {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      medicineItemIds: [' item-1 ', 'item-2']
    })

    expect(prisma.medicineInventoryMovement.findMany).toHaveBeenCalledWith({
      where: {
        frontendUserId: { in: ['front-1'] },
        type: { in: [MedicineMovementType.INBOUND, MedicineMovementType.CORRECTION_OUT] },
        medicineItemId: { in: ['item-1', 'item-2'] },
        occurredOn: { gte: '2026-08-01', lte: '2026-08-31' }
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }]
    })
    expect(rows[0]).toMatchObject({ quantity: 1.25, unitLabel: '克' })
  })

  it('uses outbound and outbound-correction movement types for outbound history', async () => {
    await service.listMovements(['front-1'], 'outbound', {})

    expect(prisma.medicineInventoryMovement.findMany).toHaveBeenCalledWith({
      where: {
        frontendUserId: { in: ['front-1'] },
        type: { in: [MedicineMovementType.OUTBOUND, MedicineMovementType.CORRECTION_IN] }
      },
      orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }]
    })
  })
})

describe('MedicineInventoryService correction transactions', () => {
  const tx = {
    medicineInventoryItem: {
      updateMany: vi.fn(),
      findFirst: vi.fn()
    },
    medicineInventoryMovement: {
      findFirst: vi.fn(),
      create: vi.fn()
    }
  }
  const prisma = {
    $transaction: vi.fn()
  }
  let service: MedicineInventoryService

  beforeEach(() => {
    vi.resetAllMocks()
    prisma.$transaction.mockImplementation(async (callback) => callback(tx))
    service = new MedicineInventoryService(prisma as never)
  })

  it('reverses an outbound by incrementing stock and creating CORRECTION_IN with its reason', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'outbound-1',
        type: MedicineMovementType.OUTBOUND,
        quantity: new Prisma.Decimal('3'),
        correctionMovement: null
      })
    )
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 1 })
    tx.medicineInventoryItem.findFirst.mockResolvedValue(
      medicineItem({ currentQuantity: new Prisma.Decimal('8') })
    )
    tx.medicineInventoryMovement.create.mockResolvedValue(
      medicineMovement({
        id: 'correction-1',
        type: MedicineMovementType.CORRECTION_IN,
        quantity: new Prisma.Decimal('3'),
        remark: '出库录入错误',
        correctionOfId: 'outbound-1'
      })
    )

    const result = await service.createCorrection('front-1', ' outbound-1 ', '  出库录入错误  ')

    expect(tx.medicineInventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', frontendUserId: 'front-1' },
      data: { currentQuantity: { increment: expect.any(Prisma.Decimal) } }
    })
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledWith({
      data: {
        frontendUserId: 'front-1',
        medicineItemId: 'item-1',
        type: MedicineMovementType.CORRECTION_IN,
        occurredOn: '2026-08-02',
        quantity: expect.any(Prisma.Decimal),
        nameSnapshot: '盐酸',
        unitSnapshot: MedicineUnit.GRAM,
        remark: '出库录入错误',
        correctionOfId: 'outbound-1'
      }
    })
    expect(result.item.currentQuantity).toBe(8)
    expect(result.movement).toMatchObject({
      type: MedicineMovementType.CORRECTION_IN,
      quantity: 3,
      correctionOfId: 'outbound-1'
    })
  })

  it('reverses an inbound only through a conditional nonnegative decrement', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'inbound-1',
        type: MedicineMovementType.INBOUND,
        quantity: new Prisma.Decimal('4'),
        correctionMovement: null
      })
    )
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 1 })
    tx.medicineInventoryItem.findFirst.mockResolvedValue(
      medicineItem({ currentQuantity: new Prisma.Decimal('1') })
    )
    tx.medicineInventoryMovement.create.mockResolvedValue(
      medicineMovement({
        id: 'correction-1',
        type: MedicineMovementType.CORRECTION_OUT,
        quantity: new Prisma.Decimal('4'),
        correctionOfId: 'inbound-1'
      })
    )

    await service.createCorrection('front-1', 'inbound-1', '入库数量错误')

    expect(tx.medicineInventoryItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'item-1',
        frontendUserId: 'front-1',
        currentQuantity: { gte: expect.any(Prisma.Decimal) }
      },
      data: { currentQuantity: { decrement: expect.any(Prisma.Decimal) } }
    })
    const updateInput = tx.medicineInventoryItem.updateMany.mock.calls[0][0]
    expect(updateInput.where.currentQuantity.gte.toString()).toBe('4')
    expect(tx.medicineInventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: MedicineMovementType.CORRECTION_OUT,
        correctionOfId: 'inbound-1'
      })
    })
  })

  it('rejects an inbound correction that would make stock negative and creates no movement', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'inbound-1',
        type: MedicineMovementType.INBOUND,
        quantity: new Prisma.Decimal('4'),
        correctionMovement: null
      })
    )
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 0 })
    tx.medicineInventoryItem.findFirst.mockResolvedValue(
      medicineItem({ currentQuantity: new Prisma.Decimal('2') })
    )

    const promise = service.createCorrection('front-1', 'inbound-1', '入库数量错误')

    await expect(promise).rejects.toBeInstanceOf(ConflictException)
    await expect(promise).rejects.toThrow('库存不足，当前库存为 2 克，无法更正该入库流水')
    expect(tx.medicineInventoryMovement.create).not.toHaveBeenCalled()
  })

  it('returns 409 when the original movement already has a correction', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'inbound-1',
        type: MedicineMovementType.INBOUND,
        correctionMovement: { id: 'correction-1' }
      })
    )

    const error = await service
      .createCorrection('front-1', 'inbound-1', '重复更正')
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getStatus()).toBe(409)
    expect(error.message).toContain('已更正')
    expect(tx.medicineInventoryItem.updateMany).not.toHaveBeenCalled()
  })

  it('does not allow correction records to be corrected again', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'correction-1',
        type: MedicineMovementType.CORRECTION_IN,
        correctionOfId: 'outbound-1',
        correctionMovement: null
      })
    )

    await expect(
      service.createCorrection('front-1', 'correction-1', '再次更正')
    ).rejects.toThrow('更正流水不能再次更正')
    expect(tx.medicineInventoryItem.updateMany).not.toHaveBeenCalled()
  })

  it('loads correction originals inside the current frontend account scope', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(null)

    await expect(
      service.createCorrection('front-2', 'movement-1', '账号隔离')
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(tx.medicineInventoryMovement.findFirst).toHaveBeenCalledWith({
      where: { id: 'movement-1', frontendUserId: 'front-2' },
      include: { correctionMovement: { select: { id: true } } }
    })
    expect(tx.medicineInventoryItem.updateMany).not.toHaveBeenCalled()
  })

  it('requires a nonblank correction reason before opening a transaction', async () => {
    await expect(
      service.createCorrection('front-1', 'movement-1', '   ')
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.createCorrection('front-1', 'movement-1', '   ')
    ).rejects.toThrow('请填写更正原因')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('converts a concurrent unique-correction conflict into HTTP 409', async () => {
    tx.medicineInventoryMovement.findFirst.mockResolvedValue(
      medicineMovement({
        id: 'outbound-1',
        type: MedicineMovementType.OUTBOUND,
        correctionMovement: null
      })
    )
    tx.medicineInventoryItem.updateMany.mockResolvedValue({ count: 1 })
    tx.medicineInventoryMovement.create.mockRejectedValue({ code: 'P2002' })

    const error = await service
      .createCorrection('front-1', 'outbound-1', '并发更正')
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getStatus()).toBe(409)
    expect(error.message).toContain('已更正')
  })

  it('maps correction aggregate Decimal overflow to a clear conflict', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2020' })

    const error = await service
      .createCorrection('front-1', 'outbound-1', '更正出库')
      .catch((caught) => caught)

    expect(error).toBeInstanceOf(ConflictException)
    expect(error.getStatus()).toBe(409)
    expect(error.message).toContain('库存数量超出允许范围')
  })
})
