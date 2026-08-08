import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyInputs, defaultLabParameters } from '../common/lab'
import { businessDateInBeijing } from '../common/date'
import { LabSheetsService } from './lab-sheets.service'

function makeBlock(index: number, inputs: Record<string, unknown> = {}, parameters = defaultLabParameters) {
  const nextInputs = { ...createEmptyInputs(index), ...inputs }
  return {
    id: `block-${index}`,
    index,
    readonly: false,
    inputs: nextInputs,
    results: {},
    parameterSnapshot: parameters
  }
}

function makeSheet(date: string, blocks = [makeBlock(1)], parameters = defaultLabParameters) {
  return {
    id: `sheet-${date}`,
    frontendUserId: 'front-1',
    date,
    readonly: date !== businessDateInBeijing(),
    parameters,
    sampleBlocks: blocks
  }
}

describe('LabSheetsService default sheet selection', () => {
  const prisma = {
    labSheet: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn()
    },
    sampleBlock: {
      findUnique: vi.fn(),
      update: vi.fn(),
      createMany: vi.fn()
    },
    cellChangeLog: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn()
    },
    abnormalRecord: {
      deleteMany: vi.fn(),
      upsert: vi.fn()
    }
  }
  const realtime = { publish: vi.fn() }
  let service: LabSheetsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new LabSheetsService(prisma as never, realtime as never)
    prisma.labSheet.findFirst.mockResolvedValue(null)
    prisma.cellChangeLog.findMany.mockResolvedValue([])
    prisma.cellChangeLog.findFirst.mockResolvedValue(null)
    prisma.cellChangeLog.create.mockResolvedValue({})
    prisma.abnormalRecord.deleteMany.mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the previous calendar date before 04:00 Beijing time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    const businessDate = '2026-07-30'
    const createdSheet = makeSheet(businessDate, [makeBlock(1)])
    prisma.labSheet.findUnique.mockResolvedValue(null)
    prisma.labSheet.create.mockResolvedValue(createdSheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(businessDate)
    expect(prisma.labSheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: businessDate })
    }))
  })

  it('locks the previous business date from 04:00 Beijing time', async () => {
    vi.useFakeTimers()
    const previousDate = '2026-07-30'
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(previousDate, [makeBlock(1)]))

    vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
    const beforeBoundary = await service.getSheetForFrontendUser('front-1', previousDate)
    expect(beforeBoundary.readonly).toBe(false)

    vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'))
    const afterBoundary = await service.getSheetForFrontendUser('front-1', previousDate)
    expect(afterBoundary.readonly).toBe(true)
    await expect(service.addSampleBlocks('front-1', `sheet-${previousDate}`, 1)).rejects.toThrow(
      '历史日期表格仅支持查看，不能修改'
    )
  })

  it('returns today sheet when today already has visible data', async () => {
    const today = businessDateInBeijing()
    const todaySheet = makeSheet(today, [makeBlock(1, { sampleNumber: 'A-001' })])
    prisma.labSheet.findUnique.mockResolvedValue(todaySheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(today)
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>).sampleNumber).toBe('A-001')
    expect(prisma.labSheet.findMany).not.toHaveBeenCalled()
  })

  it('recalculates bottle density when reading records saved before that result field existed', async () => {
    const today = businessDateInBeijing()
    const block = makeBlock(1, {
      moisture: 4.268,
      waterSample: 1,
      bottleWater: 2,
      bottleWaterSample: 2.5
    })
    block.results = { moisture: 4.268 }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))

    const result = await service.getSheetForFrontendUser('front-1', today, true)

    expect((result.sampleBlocks[0].results as Record<string, unknown>).moisture).toBe(4.268)
    expect((result.sampleBlocks[0].results as Record<string, unknown>).bottleDensity).toBe(1.9965)
  })

  it('returns today sheet when today is empty even if history has data', async () => {
    const today = businessDateInBeijing()
    const emptyTodaySheet = makeSheet(today, [makeBlock(1)])
    prisma.labSheet.findUnique.mockResolvedValue(emptyTodaySheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(today)
    expect(prisma.labSheet.findMany).not.toHaveBeenCalled()
  })

  it('creates today sheet when no sheet has visible data', async () => {
    const today = businessDateInBeijing()
    const createdSheet = makeSheet(today, [makeBlock(1)])
    prisma.labSheet.findUnique.mockResolvedValue(null)
    prisma.labSheet.findMany.mockResolvedValue([])
    prisma.labSheet.create.mockResolvedValue(createdSheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(today)
    expect(prisma.labSheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        frontendUserId: 'front-1',
        date: today
      })
    }))
  })

  it('copies the latest earlier sheet parameters when creating a new daily sheet', async () => {
    const today = businessDateInBeijing()
    const previousParameters = {
      ...defaultLabParameters,
      ironBlank: 0.11,
      ironFactor: 31.23,
      siliconBlank: 0.055,
      magnesiumFactor: 0.678
    }
    const createdSheet = makeSheet(today, [makeBlock(1, {}, previousParameters)], previousParameters)
    prisma.labSheet.findUnique.mockResolvedValue(null)
    prisma.labSheet.findFirst.mockResolvedValue({ parameters: previousParameters })
    prisma.labSheet.create.mockResolvedValue(createdSheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.parameters).toMatchObject({
      ironBlank: 0.11,
      ironFactor: 31.23,
      siliconBlank: 0.055,
      magnesiumFactor: 0.678
    })
    expect(prisma.labSheet.findFirst).toHaveBeenCalledWith({
      where: {
        frontendUserId: 'front-1',
        date: { lt: today }
      },
      orderBy: { date: 'desc' },
      select: { parameters: true }
    })
    expect(prisma.labSheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        parameters: expect.objectContaining({
          ironBlank: 0.11,
          ironFactor: 31.23,
          siliconBlank: 0.055,
          magnesiumFactor: 0.678
        }),
        sampleBlocks: expect.objectContaining({
          create: expect.arrayContaining([
            expect.objectContaining({
              parameterSnapshot: expect.objectContaining({
                ironFactor: 31.23
              })
            })
          ])
        })
      })
    }))
  })

  it('marks historical sheets readonly even when legacy rows were stored editable', async () => {
    const legacySheet = {
      ...makeSheet('2026-06-30', [{ ...makeBlock(1, { sampleNumber: 'OLD-001' }), readonly: false }]),
      readonly: false
    }
    prisma.labSheet.findUnique.mockResolvedValue(legacySheet)

    const result = await service.getSheetForFrontendUser('front-1', '2026-06-30')

    expect(result.readonly).toBe(true)
    expect(result.sampleBlocks[0].readonly).toBe(true)
  })

  it('redacts only completed sample detection, amount, and payment fields without a completed-data grant', async () => {
    const today = businessDateInBeijing()
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [makeBlock(1, {
      completed: true,
      sampleNumber: 'KEEP-001',
      customerText: '保留客户',
      ironRaw: 1.234,
      price: 88,
      paymentStatus: '已结款',
      note: '保留备注'
    })]))

    const result = await service.getSheetForFrontendUser('front-1', today, false)
    const block = result.sampleBlocks[0]

    expect(block.sensitiveFieldsHidden).toBe(true)
    expect((block.inputs as Record<string, unknown>)).toMatchObject({ sampleNumber: 'KEEP-001', customerText: '保留客户', note: '保留备注', ironRaw: null, price: null, paymentStatus: null })
  })

  it('keeps today sheet editable even when it was stored readonly before today', async () => {
    const today = businessDateInBeijing()
    const storedReadonlySheet = {
      ...makeSheet(today, [{ ...makeBlock(1, { sampleNumber: 'TODAY-001' }), readonly: true }]),
      readonly: true
    }
    prisma.labSheet.findUnique.mockResolvedValue(storedReadonlySheet)

    const result = await service.getSheetForFrontendUser('front-1', today)

    expect(result.readonly).toBe(false)
    expect(result.sampleBlocks[0].readonly).toBe(false)
  })

  it('stores newly created sheets editable and computes historical readonly at response time', async () => {
    const historicalDate = '2026-06-30'
    const createdSheet = {
      ...makeSheet(historicalDate, [{ ...makeBlock(1), readonly: false }]),
      readonly: false
    }
    prisma.labSheet.findUnique.mockResolvedValue(null)
    prisma.labSheet.create.mockResolvedValue(createdSheet)

    const result = await service.getSheetForFrontendUser('front-1', historicalDate)

    expect(result.readonly).toBe(true)
    expect(result.sampleBlocks[0].readonly).toBe(true)
    expect(prisma.labSheet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        readonly: false,
        sampleBlocks: expect.objectContaining({
          create: expect.arrayContaining([
            expect.objectContaining({ readonly: false })
          ])
        })
      })
    }))
  })

  it('rejects adding sample blocks to historical sheets', async () => {
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet('2026-06-30', [makeBlock(1)]))

    await expect(service.addSampleBlocks('front-1', 'sheet-2026-06-30', 1)).rejects.toThrow('历史日期表格仅支持查看，不能修改')
  })

  it('adds sample blocks to today sheet even when it was stored readonly before today', async () => {
    const today = businessDateInBeijing()
    const storedReadonlyToday = {
      ...makeSheet(today, [makeBlock(1)]),
      readonly: true
    }
    prisma.labSheet.findUnique
      .mockResolvedValueOnce(storedReadonlyToday)
      .mockResolvedValueOnce(makeSheet(today, [makeBlock(1), makeBlock(2)]))
    prisma.sampleBlock.createMany.mockResolvedValue({})

    await service.addSampleBlocks('front-1', `sheet-${today}`, 1)

    expect(prisma.sampleBlock.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ readonly: false })
      ])
    }))
  })

  it('merges only changed fields when saving a sample block', async () => {
    const today = businessDateInBeijing()
    const updatedAt = new Date('2026-07-03T00:00:00.000Z')
    const block = {
      id: 'block-1',
      sheetId: `sheet-${today}`,
      index: 1,
      readonly: false,
      updatedAt,
      inputs: { ...createEmptyInputs(1), sampleNumber: 'OLD', customerText: '保留客户' },
      results: {},
      parameterSnapshot: defaultLabParameters
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-07-03T00:00:01.000Z')
    }))

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: 'block-1',
        baseUpdatedAt: updatedAt.toISOString(),
        baseInputs: { sampleNumber: 'OLD' },
        changedFields: { sampleNumber: 'NEW', moisture: 4.268, completed: true }
      },
      'client-1'
    )

    expect(prisma.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inputs: expect.objectContaining({
          sampleNumber: 'NEW',
          moisture: 4.268,
          completed: true,
          customerText: '保留客户'
        })
      })
    }))
    expect((result.inputs as Record<string, unknown>).sampleNumber).toBe('NEW')
    expect((result.inputs as Record<string, unknown>).moisture).toBe(4.268)
    expect((result.inputs as Record<string, unknown>).completed).toBe(true)
  })

  it('saves every recipient customer field through the field-level payload', async () => {
    const today = businessDateInBeijing()
    const updatedAt = new Date('2026-07-03T00:00:00.000Z')
    const block = {
      id: 'block-1',
      sheetId: `sheet-${today}`,
      index: 1,
      readonly: false,
      updatedAt,
      inputs: { ...createEmptyInputs(1), customerText: '付款客户' },
      results: {},
      parameterSnapshot: defaultLabParameters
    }
    const recipient = { id: 'customer-2', name: '李总' }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-07-03T00:00:01.000Z')
    }))

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: 'block-1',
        baseUpdatedAt: updatedAt.toISOString(),
        baseInputs: {
          recipientCustomerId: undefined,
          recipientCustomerIds: [],
          recipientCustomers: [],
          recipientCustomerText: ''
        },
        changedFields: {
          recipientCustomerId: recipient.id,
          recipientCustomerIds: [recipient.id],
          recipientCustomers: [recipient],
          recipientCustomerText: recipient.name
        }
      },
      'client-1'
    )

    expect(prisma.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inputs: expect.objectContaining({
          customerText: '付款客户',
          recipientCustomerId: 'customer-2',
          recipientCustomerIds: ['customer-2'],
          recipientCustomers: [recipient],
          recipientCustomerText: '李总'
        })
      })
    }))
    expect(result.inputs).toMatchObject({
      recipientCustomerId: 'customer-2',
      recipientCustomerIds: ['customer-2'],
      recipientCustomers: [recipient],
      recipientCustomerText: '李总'
    })
  })

  it('rejects stale same-field saves instead of overwriting newer data', async () => {
    const today = businessDateInBeijing()
    const block = {
      id: 'block-1',
      sheetId: `sheet-${today}`,
      index: 1,
      readonly: false,
      updatedAt: new Date('2026-07-03T00:00:05.000Z'),
      inputs: { ...createEmptyInputs(1), sampleNumber: 'REMOTE' },
      results: {},
      parameterSnapshot: defaultLabParameters
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)

    await expect(
      service.saveSampleBlock(
        { id: 'front-1' } as never,
        `sheet-${today}`,
        {
          id: 'block-1',
          baseUpdatedAt: '2026-07-03T00:00:00.000Z',
          baseInputs: { sampleNumber: 'OLD' },
          changedFields: { sampleNumber: 'LOCAL' }
        },
        'client-1'
      )
    ).rejects.toThrow('该样品格已被另一台设备修改，请确认后再保存')
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('treats a repeated save as successful when the requested value is already stored', async () => {
    const today = businessDateInBeijing()
    const block = {
      id: 'block-1',
      sheetId: `sheet-${today}`,
      index: 1,
      readonly: false,
      updatedAt: new Date('2026-07-03T00:00:05.000Z'),
      inputs: { ...createEmptyInputs(1), sampleNumber: 'ALREADY-SAVED' },
      results: {},
      parameterSnapshot: defaultLabParameters
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: 'block-1',
        baseUpdatedAt: '2026-07-03T00:00:00.000Z',
        baseInputs: { sampleNumber: 'OLD' },
        changedFields: { sampleNumber: 'ALREADY-SAVED' }
      },
      'client-1'
    )

    expect((result.inputs as Record<string, unknown>).sampleNumber).toBe('ALREADY-SAVED')
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
  })
})
