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
    parameterSnapshot: parameters,
    retests: [] as Array<Record<string, unknown>>
  }
}

function makeRetest(sequence: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `retest-${sequence}`,
    sampleBlockId: 'block-1',
    sequence,
    inputs: { ironRaw: sequence },
    results: { iron: 999 },
    parameterSnapshot: { ...defaultLabParameters, ironFactor: 10 },
    everFilled: true,
    status: 'ACTIVE',
    voidReason: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    voidedById: null,
    createdAt: new Date('2026-08-20T00:00:00.000Z'),
    updatedAt: new Date('2026-08-20T00:00:00.000Z'),
    voidedAt: null,
    ...overrides
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
  const labSaveRequests = new Map<string, {
    idempotencyKey: string
    requestFingerprint: string
    sheetId: string
    sampleBlockId: string
    responseSnapshot: unknown
  }>()
  const transaction = {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    labSheet: {
      findUnique: vi.fn(),
      update: vi.fn()
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
    },
    labSampleSaveRequest: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  }
  const prisma = {
    labSheet: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    sampleBlock: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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
    },
    labSampleSaveRequest: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction))
  }
  const realtime = { publish: vi.fn() }
  const prepaid = { syncSampleConsumption: vi.fn() }
  const prepaidRealtime = { publish: vi.fn() }
  let service: LabSheetsService

  beforeEach(() => {
    vi.clearAllMocks()
    labSaveRequests.clear()
    transaction.labSheet.findUnique.mockReset()
    transaction.labSheet.findUnique.mockImplementation((argument) => prisma.labSheet.findUnique(argument))
    transaction.labSheet.update.mockReset()
    transaction.$executeRaw.mockReset()
    transaction.$executeRaw.mockResolvedValue(0)
    transaction.$queryRaw.mockReset()
    transaction.$queryRaw.mockResolvedValue([])
    transaction.sampleBlock.findUnique.mockReset()
    transaction.sampleBlock.findUnique.mockImplementation((argument) => prisma.sampleBlock.findUnique(argument))
    transaction.sampleBlock.update.mockReset()
    transaction.sampleBlock.update.mockImplementation((argument) => prisma.sampleBlock.update(argument))
    transaction.sampleBlock.createMany.mockReset()
    transaction.sampleBlock.createMany.mockImplementation((argument) => prisma.sampleBlock.createMany(argument))
    transaction.cellChangeLog.findFirst.mockReset()
    transaction.cellChangeLog.findFirst.mockImplementation((argument) => prisma.cellChangeLog.findFirst(argument))
    transaction.cellChangeLog.update.mockReset()
    transaction.cellChangeLog.update.mockImplementation((argument) => prisma.cellChangeLog.update(argument))
    transaction.cellChangeLog.create.mockReset()
    transaction.cellChangeLog.create.mockImplementation((argument) => prisma.cellChangeLog.create(argument))
    transaction.cellChangeLog.findMany.mockReset()
    transaction.cellChangeLog.findMany.mockImplementation((argument) => prisma.cellChangeLog.findMany(argument))
    transaction.abnormalRecord.deleteMany.mockReset()
    transaction.abnormalRecord.deleteMany.mockImplementation((argument) => prisma.abnormalRecord.deleteMany(argument))
    transaction.abnormalRecord.upsert.mockReset()
    transaction.abnormalRecord.upsert.mockImplementation((argument) => prisma.abnormalRecord.upsert(argument))
    transaction.labSampleSaveRequest.findUnique.mockReset()
    transaction.labSampleSaveRequest.findUnique.mockImplementation(async ({ where }) => (
      labSaveRequests.get(where.idempotencyKey) || null
    ))
    transaction.labSampleSaveRequest.create.mockReset()
    transaction.labSampleSaveRequest.create.mockImplementation(async ({ data }) => {
      if (labSaveRequests.has(data.idempotencyKey)) {
        throw Object.assign(new Error('unique constraint'), { code: 'P2002' })
      }
      labSaveRequests.set(data.idempotencyKey, data)
      return data
    })
    prisma.labSampleSaveRequest.findUnique.mockReset()
    prisma.labSampleSaveRequest.findUnique.mockImplementation(async ({ where }) => (
      labSaveRequests.get(where.idempotencyKey) || null
    ))
    transaction.labSheet.update.mockImplementation(async ({ data }) => {
      const sheet = await transaction.labSheet.findUnique.mock.results[0]?.value
      if (sheet) Object.assign(sheet, data)
      return sheet
    })
    prisma.sampleBlock.update.mockImplementation(async ({ where, data }) => {
      const sheet = await transaction.labSheet.findUnique.mock.results[0]?.value
      const block = sheet?.sampleBlocks.find((item: { id: string }) => item.id === where.id)
      if (block) Object.assign(block, data)
      return { ...makeBlock(Number(String(where.id).replace('block-', ''))), ...block, ...data }
    })
    prepaid.syncSampleConsumption.mockReset()
    prepaid.syncSampleConsumption.mockResolvedValue(undefined)
    service = new LabSheetsService(
      prisma as never,
      realtime as never,
      prepaid as never,
      prepaidRealtime as never
    )
    prisma.labSheet.findFirst.mockResolvedValue(null)
    prisma.cellChangeLog.findMany.mockResolvedValue([])
    prisma.cellChangeLog.findFirst.mockResolvedValue(null)
    prisma.cellChangeLog.create.mockResolvedValue({})
    prisma.abnormalRecord.deleteMany.mockResolvedValue({})
    transaction.cellChangeLog.findMany.mockResolvedValue([])
    transaction.cellChangeLog.findFirst.mockResolvedValue(null)
    transaction.cellChangeLog.create.mockResolvedValue({})
    transaction.abnormalRecord.deleteMany.mockResolvedValue({})
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

  it('includes active and void retests in sequence order when reading a customer sheet', async () => {
    const today = businessDateInBeijing()
    const block = makeBlock(1)
    block.retests = [
      makeRetest(1),
      makeRetest(2, { status: 'VOID', voidReason: 'duplicate' })
    ]
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))

    const result = await service.getSheetForFrontendUser('front-1', today, true)

    expect(result.sampleBlocks[0].retests.map((retest: { sequence: number }) => retest.sequence)).toEqual([1, 2])
    expect(result.sampleBlocks[0].retests[1]).toMatchObject({ status: 'VOID', readonly: true })
    expect(prisma.labSheet.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { sampleBlocks: { orderBy: { index: 'asc' }, include: { retests: { orderBy: { sequence: 'asc' } } } } }
    }))
  })

  it('marks all retests readonly when reading a historical sheet', async () => {
    const block = makeBlock(1)
    block.retests = [makeRetest(1)]
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet('2026-06-30', [block]))

    const result = await service.getSheetForFrontendUser('front-1', '2026-06-30', true)

    expect(result.sampleBlocks[0].retests[0]).toMatchObject({ readonly: true })
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
      prepaidMemberId: 'member-sensitive',
      prepaidMemberPhone: '13800000000',
      note: '保留备注'
    })]))

    const result = await service.getSheetForFrontendUser('front-1', today, false)
    const block = result.sampleBlocks[0]

    expect(block.sensitiveFieldsHidden).toBe(true)
    expect((block.inputs as Record<string, unknown>)).toMatchObject({
      sampleNumber: 'KEEP-001',
      customerText: '保留客户',
      note: '保留备注',
      ironRaw: null,
      price: null,
      paymentStatus: null,
      prepaidMemberId: null,
      prepaidMemberPhone: null
    })
  })

  it('redacts nested retests for a completed parent without a completed-data grant', async () => {
    const today = businessDateInBeijing()
    const block = makeBlock(1, { completed: true })
    block.retests = [makeRetest(1, { inputs: { ironRaw: 1 }, results: { iron: 999 } })]
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))

    const result = await service.getSheetForFrontendUser('front-1', today, false)

    expect(result.sampleBlocks[0].retests[0]).toMatchObject({ sensitiveFieldsHidden: true })
    expect(result.sampleBlocks[0].retests[0].inputs.ironRaw).toBeNull()
    expect(result.sampleBlocks[0].retests[0].results.iron).toBeNull()
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

  it('redacts completed samples in add-block responses when the caller has no grant', async () => {
    const today = businessDateInBeijing()
    const completed = makeBlock(1, {
      completed: true,
      ironRaw: 1,
      price: 88,
      paymentStatus: '已结款'
    })
    const before = makeSheet(today, [completed])
    const after = makeSheet(today, [completed, makeBlock(2)])
    prisma.labSheet.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    prisma.sampleBlock.createMany.mockResolvedValue({})

    const result = await service.addSampleBlocks('front-1', before.id, 1, 'client-1', false)

    expect(result.sampleBlocks[0].sensitiveFieldsHidden).toBe(true)
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>)).toMatchObject({
      ironRaw: null,
      price: null,
      paymentStatus: null
    })
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
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: 'block-1',
        idempotencyKey: 'merge-fields-1',
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

  it('returns ordered retests when saving a parent sample', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, { note: 'old' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-20T00:00:00.000Z'),
      retests: [makeRetest(1), makeRetest(2)]
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockImplementation(async ({ include }) => (
      include ? block : { ...block, retests: undefined }
    ))
    prisma.sampleBlock.update.mockImplementation(async ({ data, include }) => {
      Object.assign(block, data)
      return include ? block : { ...block, retests: undefined }
    })

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: 'save-retests-1', changedFields: { note: 'new' } }
    )

    expect((result.retests as Array<{ sequence: number }>).map((retest) => retest.sequence)).toEqual([1, 2])
    expect(prisma.sampleBlock.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { retests: { orderBy: { sequence: 'asc' } } }
    }))
    expect(prisma.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      include: { retests: { orderBy: { sequence: 'asc' } } }
    }))
  })

  it('atomically synchronizes a new prepaid consumption before saving the sample', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, { sampleNumber: 'A-001' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({ ...block, ...data }))

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'cell-save-1',
        changedFields: {
          paymentStatus: '预存款',
          price: 100,
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '138-0000-0000'
        }
      }
    )

    expect(prepaid.syncSampleConsumption).toHaveBeenCalledWith(transaction, expect.objectContaining({
      sheetId: `sheet-${today}`,
      sampleBlockId: 'block-1',
      sampleIndex: 1,
      sheetDate: today,
      consumingFrontendUserId: 'front-1',
      actorUserId: 'sub-1',
      idempotencyKey: 'cell-save-1',
      nextInputs: expect.objectContaining({
        paymentStatus: '预存款',
        price: 100,
        prepaidMemberId: 'member-1',
        prepaidMemberPhone: '138-0000-0000'
      })
    }))
    expect(prepaid.syncSampleConsumption.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.sampleBlock.update.mock.invocationCallOrder[0]
    )
  })

  it.each([
    ['amount', { price: 125.5 }],
    ['member', { prepaidMemberId: 'member-2', prepaidMemberPhone: '13900000000' }],
    ['payment status', {
      paymentStatus: '已结款',
      prepaidMemberId: null,
      prepaidMemberPhone: null
    }]
  ])('synchronizes prepaid consumption when the %s changes', async (_label, changedFields) => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, {
        paymentStatus: '预存款',
        price: 100,
        prepaidMemberId: 'member-1',
        prepaidMemberPhone: '13800000000'
      }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({ ...block, ...data }))

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: `change-${_label}`, changedFields }
    )

    expect(prepaid.syncSampleConsumption).toHaveBeenCalledTimes(1)
    expect(prepaid.syncSampleConsumption).toHaveBeenCalledWith(transaction, expect.objectContaining({
      oldInputs: expect.objectContaining({
        paymentStatus: '预存款',
        price: 100,
        prepaidMemberId: 'member-1'
      }),
      nextInputs: expect.objectContaining(changedFields)
    }))
  })

  it('does not invoke the prepaid ledger for an unrelated field change', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, {
        paymentStatus: '预存款',
        price: 100,
        prepaidMemberId: 'member-1',
        prepaidMemberPhone: '13800000000'
      }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({ ...block, ...data }))

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: 'unrelated-1', changedFields: { note: '复核通过' } }
    )

    expect(prepaid.syncSampleConsumption).not.toHaveBeenCalled()
  })

  it('does not save a sample or its change log when prepaid balance is insufficient', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prepaid.syncSampleConsumption.mockRejectedValueOnce(new Error('PREPAID_BALANCE_INSUFFICIENT'))

    await expect(service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'insufficient-1',
        changedFields: {
          paymentStatus: '预存款',
          price: 100,
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        }
      }
    )).rejects.toThrow('PREPAID_BALANCE_INSUFFICIENT')
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.update).not.toHaveBeenCalled()
  })

  it('treats a response-loss retry as already saved without duplicating consumption', async () => {
    const today = businessDateInBeijing()
    const savedInputs = {
      ...createEmptyInputs(1),
      paymentStatus: '预存款',
      price: 100,
      prepaidMemberId: 'member-1',
      prepaidMemberPhone: '13800000000'
    }
    const block = {
      ...makeBlock(1, savedInputs),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)

    const result = await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'cell-save-retry',
        baseUpdatedAt: '2026-08-11T00:00:00.000Z',
        baseInputs: { paymentStatus: '', price: null, prepaidMemberId: null, prepaidMemberPhone: null },
        changedFields: {
          paymentStatus: '预存款',
          price: 100,
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        }
      }
    )

    expect(result.inputs).toMatchObject(savedInputs)
    expect(prepaid.syncSampleConsumption).not.toHaveBeenCalled()
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('reserves a no-op save and returns its immutable response snapshot after later changes', async () => {
    const today = businessDateInBeijing()
    const original = {
      ...makeBlock(1, { sampleNumber: 'UNCHANGED', note: 'original' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    let current: Omit<typeof original, 'inputs'> & { inputs: Record<string, unknown> } = original
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [original]))
    prisma.sampleBlock.findUnique.mockImplementation(async () => current)
    const payload = {
      id: original.id,
      idempotencyKey: 'noop-save-1',
      baseUpdatedAt: original.updatedAt.toISOString(),
      baseInputs: { sampleNumber: 'UNCHANGED' },
      changedFields: { sampleNumber: 'UNCHANGED' }
    }

    const first = await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      payload
    )
    current = {
      ...original,
      updatedAt: new Date('2026-08-11T00:05:00.000Z'),
      inputs: { ...(original.inputs as Record<string, unknown>), note: 'later change' }
    }
    const retry = await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      payload
    )

    expect(retry).toEqual(first)
    expect((retry.inputs as Record<string, unknown>).note).toBe('original')
    expect(transaction.labSampleSaveRequest.create).toHaveBeenCalledTimes(1)
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('covers note-only saves and rejects reusing their key for a different request', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, { note: 'before' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }))

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: 'note-save-1', changedFields: { note: 'first request' } }
    )

    await expect(service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: 'note-save-1', changedFields: { note: 'different request' } }
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LAB_SAVE_IDEMPOTENCY_CONFLICT' }) })
    expect(prisma.sampleBlock.update).toHaveBeenCalledTimes(1)
  })

  it('rejects one idempotency key reused for a different sample before mutating it', async () => {
    const today = businessDateInBeijing()
    const firstBlock = {
      ...makeBlock(1, { note: 'before' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    const secondBlock = {
      ...makeBlock(2, { note: 'before' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [firstBlock, secondBlock]))
    prisma.sampleBlock.findUnique.mockImplementation(async ({ where }) => (
      where.id === firstBlock.id ? firstBlock : secondBlock
    ))
    prisma.sampleBlock.update.mockImplementation(async ({ where, data }) => ({
      ...(where.id === firstBlock.id ? firstBlock : secondBlock),
      ...data,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }))

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: firstBlock.id, idempotencyKey: 'cross-sample-key', changedFields: { note: 'first' } }
    )
    await expect(service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: secondBlock.id, idempotencyKey: 'cross-sample-key', changedFields: { note: 'second' } }
    )).rejects.toMatchObject({ response: expect.objectContaining({ code: 'LAB_SAVE_IDEMPOTENCY_CONFLICT' }) })

    expect(prisma.sampleBlock.update).toHaveBeenCalledTimes(1)
  })

  it('settles concurrent cross-sheet key reuse with one winner and one stable 409 loser', async () => {
    const today = businessDateInBeijing()
    const firstSheetId = `sheet-${today}`
    const secondSheetId = `${firstSheetId}-other`
    const firstBlock = {
      ...makeBlock(1),
      sheetId: firstSheetId,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    const secondBlock = {
      ...makeBlock(2),
      sheetId: secondSheetId,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockImplementation(async ({ where }) => (
      where.id === firstSheetId
        ? { ...makeSheet(today, [firstBlock]), id: firstSheetId }
        : { ...makeSheet(today, [secondBlock]), id: secondSheetId }
    ))
    prisma.sampleBlock.findUnique.mockImplementation(async ({ where }) => (
      where.id === firstBlock.id ? firstBlock : secondBlock
    ))
    prisma.sampleBlock.update.mockImplementation(async ({ where, data }) => ({
      ...(where.id === firstBlock.id ? firstBlock : secondBlock),
      ...data,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }))

    const outcomes = await Promise.allSettled([
      service.saveSampleBlock(
        { id: 'sub-1', dataOwnerId: 'front-1' } as never,
        firstSheetId,
        { id: firstBlock.id, idempotencyKey: 'concurrent-cross-sheet', changedFields: { note: 'winner-a' } }
      ),
      service.saveSampleBlock(
        { id: 'sub-1', dataOwnerId: 'front-1' } as never,
        secondSheetId,
        { id: secondBlock.id, idempotencyKey: 'concurrent-cross-sheet', changedFields: { note: 'winner-b' } }
      )
    ])

    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const loser = outcomes.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(loser.reason).toMatchObject({ response: expect.objectContaining({ code: 'LAB_SAVE_IDEMPOTENCY_CONFLICT' }) })
    expect(realtime.publish).toHaveBeenCalledTimes(1)
  })

  it('returns the committed winner snapshot when an identical concurrent insert reports P2002', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1, { note: 'before' }),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }))
    transaction.labSampleSaveRequest.create.mockImplementationOnce(async ({ data }) => {
      labSaveRequests.set(data.idempotencyKey, {
        ...data,
        responseSnapshot: { ...(data.responseSnapshot as Record<string, unknown>), updatedAt: 'winner-snapshot' }
      })
      throw Object.assign(new Error('concurrent unique constraint'), { code: 'P2002' })
    })

    const result = await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      { id: block.id, idempotencyKey: 'same-request-race', changedFields: { note: 'saved' } }
    )

    expect(result.updatedAt).toBe('winner-snapshot')
    expect((result.inputs as Record<string, unknown>).note).toBe('saved')
    expect(realtime.publish).not.toHaveBeenCalled()
  })

  it('rolls back a prepaid ledger mutation when the later sample update fails', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    const committedLedgerMutations: string[] = []
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prepaid.syncSampleConsumption.mockImplementationOnce(async () => {
      committedLedgerMutations.push('consumption-created')
    })
    prisma.sampleBlock.update.mockRejectedValueOnce(new Error('sample update failed'))
    prisma.$transaction.mockImplementationOnce(async (operation: (tx: typeof transaction) => unknown) => {
      const ledgerSnapshot = [...committedLedgerMutations]
      try {
        return await operation(transaction)
      } catch (error) {
        committedLedgerMutations.splice(0, committedLedgerMutations.length, ...ledgerSnapshot)
        labSaveRequests.clear()
        throw error
      }
    })

    await expect(service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'rollback-after-ledger',
        changedFields: {
          paymentStatus: '预存款',
          price: 100,
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        }
      }
    )).rejects.toThrow('sample update failed')

    expect(committedLedgerMutations).toEqual([])
    expect(labSaveRequests.size).toBe(0)
    expect(block.inputs.paymentStatus).toBe('')
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
    expect(prepaidRealtime.publish).not.toHaveBeenCalled()
  })

  it('publishes prepaid invalidations only after the enclosing sample transaction commits', async () => {
    const today = businessDateInBeijing()
    const block = {
      ...makeBlock(1),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-11T00:00:01.000Z')
    }))
    prepaid.syncSampleConsumption.mockResolvedValueOnce({
      memberId: 'member-1',
      consumptionId: 'consumption-1',
      operation: 'create'
    })

    await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'committed-prepaid-signal',
        changedFields: {
          paymentStatus: '预存款',
          price: 100,
          prepaidMemberId: 'member-1',
          prepaidMemberPhone: '13800000000'
        }
      }
    )

    expect(prepaidRealtime.publish.mock.calls).toEqual([
      [expect.objectContaining({
        module: 'consumptions', entityId: 'consumption-1', operation: 'create', changedById: 'sub-1'
      })],
      [expect.objectContaining({
        module: 'members', entityId: 'member-1', operation: 'update', changedById: 'sub-1'
      })],
      [expect.objectContaining({
        module: 'settlements', entityId: 'consumption-1', operation: 'update', changedById: 'sub-1'
      })]
    ])
  })

  it('returns granted saved data to the caller but publishes only a metadata refresh signal', async () => {
    const today = businessDateInBeijing()
    const updatedAt = new Date('2026-08-08T00:00:00.000Z')
    const block = {
      ...makeBlock(1, { completed: true, ironRaw: 2, price: 88, paymentStatus: '已结款' }),
      sheetId: `sheet-${today}`,
      updatedAt
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block]))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-08T00:00:01.000Z')
    }))

    const result = await service.saveSampleBlock(
      { id: 'sub-1', dataOwnerId: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'granted-save-1',
        baseUpdatedAt: updatedAt.toISOString(),
        baseInputs: { note: null },
        changedFields: { note: '已复核' }
      },
      'client-1',
      true
    )

    expect((result.inputs as Record<string, unknown>)).toMatchObject({
      ironRaw: 2,
      price: 88,
      paymentStatus: '已结款'
    })
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'block-saved',
      sheetId: `sheet-${today}`,
      frontendUserId: 'front-1',
      changedById: 'sub-1'
    }))
    expect(realtime.publish).toHaveBeenCalledWith(expect.not.objectContaining({ block: expect.anything() }))
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
        idempotencyKey: 'recipient-save-1',
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
          idempotencyKey: 'stale-save-1',
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
        idempotencyKey: 'repeated-save-1',
        baseUpdatedAt: '2026-07-03T00:00:00.000Z',
        baseInputs: { sampleNumber: 'OLD' },
        changedFields: { sampleNumber: 'ALREADY-SAVED' }
      },
      'client-1'
    )

    expect((result.inputs as Record<string, unknown>).sampleNumber).toBe('ALREADY-SAVED')
    expect(prisma.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('applies new parameters from the selected sample and recalculates only that range', async () => {
    const today = businessDateInBeijing()
    const oldParameters = { ...defaultLabParameters, ironBlank: 0.04, ironFactor: 10 }
    const newParameters = { ...defaultLabParameters, ironBlank: 0.1, ironFactor: 20 }
    const blocks = [1, 2, 3, 4].map((index) => makeBlock(index, { ironRaw: 1 }, oldParameters))
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, blocks, oldParameters))
    transaction.labSheet.findUnique.mockResolvedValue(makeSheet(today, blocks, oldParameters))

    const result = await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: newParameters, startIndex: 3 },
      'client-1'
    )

    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(2)
    expect(transaction.sampleBlock.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'block-1' } })
    )
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-3' },
      data: expect.objectContaining({
        parameterSnapshot: expect.objectContaining({ ironBlank: 0.1, ironFactor: 20 }),
        results: expect.objectContaining({ iron: 18 })
      })
    }))
    expect(result.parameters).toMatchObject({ ironBlank: 0.1, ironFactor: 20 })
    expect(realtime.publish).toHaveBeenCalledTimes(1)
  })

  it('does not rewrite an existing retest snapshot when applying parameters by segment', async () => {
    const today = businessDateInBeijing()
    const previousParameters = { ...defaultLabParameters, ironFactor: 10 }
    const nextParameters = { ...defaultLabParameters, ironFactor: 25 }
    const block = makeBlock(1, { ironRaw: 1 }, previousParameters)
    block.retests = [makeRetest(1, { parameterSnapshot: previousParameters })]
    const current = makeSheet(today, [block], previousParameters)
    prisma.labSheet.findUnique.mockResolvedValue(current)
    transaction.labSheet.findUnique.mockResolvedValue(current)

    const result = await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: nextParameters, startIndex: 1 }
    )

    expect((result.sampleBlocks[0].retests[0].parameterSnapshot as Record<string, unknown>).ironFactor).toBe(10)
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.not.objectContaining({ retests: expect.anything() })
    }))
  })

  it('redacts completed sample data in apply responses without a grant and publishes only a safe refresh signal', async () => {
    const today = businessDateInBeijing()
    const completed = makeBlock(1, {
      completed: true,
      ironRaw: 1,
      price: 88,
      paymentStatus: '已结款'
    })
    const current = makeSheet(today, [completed])
    prisma.labSheet.findUnique.mockResolvedValue(current)
    transaction.labSheet.findUnique.mockResolvedValue(current)

    const result = await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: defaultLabParameters, startIndex: 1 },
      'client-1',
      false
    )

    expect(result.sampleBlocks[0].sensitiveFieldsHidden).toBe(true)
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>)).toMatchObject({
      ironRaw: null,
      price: null,
      paymentStatus: null
    })
    expect((result.sampleBlocks[0].results as Record<string, unknown>).iron).toBeNull()
    expect(realtime.publish).toHaveBeenCalledTimes(1)
    expect(realtime.publish).toHaveBeenCalledWith(expect.not.objectContaining({ sheet: expect.anything() }))
  })

  it('returns completed sample data in apply responses when the grant is accepted', async () => {
    const today = businessDateInBeijing()
    const completed = makeBlock(1, {
      completed: true,
      ironRaw: 1,
      price: 88,
      paymentStatus: '已结款'
    })
    const current = makeSheet(today, [completed])
    prisma.labSheet.findUnique.mockResolvedValue(current)
    transaction.labSheet.findUnique.mockResolvedValue(current)

    const result = await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: defaultLabParameters, startIndex: 1 },
      'client-1',
      true
    )

    expect(result.sampleBlocks[0].sensitiveFieldsHidden).toBe(false)
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>)).toMatchObject({
      ironRaw: 1,
      price: 88,
      paymentStatus: '已结款'
    })
  })

  it('fixes blank snapshots before the first boundary without recalculating them', async () => {
    const today = businessDateInBeijing()
    const originalParameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const before = makeSheet(today, [1, 2, 3, 4].map((index) => ({
      ...makeBlock(index, index >= 3 ? { ironRaw: 2 } : {}, originalParameters),
      sheetId: `sheet-${today}`
    })), originalParameters)
    prisma.labSheet.findUnique.mockResolvedValue(before)
    prisma.sampleBlock.findUnique.mockImplementation(async ({ where }) => before.sampleBlocks.find((block) => block.id === where.id))

    await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: parametersA, startIndex: 3 },
      'client-1'
    )

    const applyUpdates = transaction.sampleBlock.update.mock.calls.map(([argument]) => argument)
    expect(applyUpdates.map((argument) => argument.where.id)).toEqual(['block-1', 'block-2', 'block-3', 'block-4'])
    expect(applyUpdates[0].data).toEqual({
      parameterSnapshot: { ...originalParameters, segmentedApplication: true }
    })
    expect(applyUpdates[1].data).toEqual({
      parameterSnapshot: { ...originalParameters, segmentedApplication: true }
    })
    applyUpdates.slice(2).forEach((argument) => {
      expect(argument.data).toEqual(expect.objectContaining({
        parameterSnapshot: expect.objectContaining({ ironFactor: 25, segmentedApplication: true }),
        results: expect.any(Object)
      }))
    })

    const saved = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      before.id,
      { id: 'block-2', idempotencyKey: 'blank-before-boundary-1', changedFields: { ironRaw: 2 } }
    )

    expect((saved.parameterSnapshot as Record<string, unknown>)).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect((saved.results as Record<string, unknown>).iron).toBe(20)
  })

  it('fixes a newly added blank block from an older segment before a later boundary', async () => {
    const today = businessDateInBeijing()
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const before = makeSheet(today, Array.from({ length: 10 }, (_, offset) => makeBlock(offset + 1, { ironRaw: 2 })), defaultLabParameters)
    prisma.labSheet.findUnique.mockResolvedValue(before)
    prisma.sampleBlock.findUnique.mockImplementation(async ({ where }) => before.sampleBlocks.find((block) => block.id === where.id))
    prisma.sampleBlock.createMany.mockImplementation(async ({ data }) => {
      before.sampleBlocks.push(...data.map((block: Record<string, unknown>) => ({ ...block, id: `block-${block.index}` })))
    })

    await service.applyCurrentParametersFromIndex('front-1', { parameters: parametersA, startIndex: 3 })
    await service.addSampleBlocks('front-1', before.id, 2)
    transaction.sampleBlock.update.mockClear()

    await service.applyCurrentParametersFromIndex('front-1', { parameters: parametersB, startIndex: 12 })

    const boundaryUpdates = transaction.sampleBlock.update.mock.calls.map(([argument]) => argument)
    expect(boundaryUpdates.map((argument) => argument.where.id)).toEqual(['block-11', 'block-12'])
    expect(boundaryUpdates[0].data).toEqual({
      parameterSnapshot: expect.objectContaining({ ironFactor: 10, segmentedApplication: true })
    })
    expect(boundaryUpdates[1].data).toEqual(expect.objectContaining({
      parameterSnapshot: expect.objectContaining({ ironFactor: 25, segmentedApplication: true }),
      results: expect.any(Object)
    }))

    const saved = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      before.id,
      { id: 'block-11', idempotencyKey: 'added-blank-before-boundary-1', changedFields: { ironRaw: 2 } }
    )

    expect((saved.parameterSnapshot as Record<string, unknown>)).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect((saved.results as Record<string, unknown>).iron).toBe(20)
  })

  it('overwrites every snapshot from a later boundary including empty blocks', async () => {
    const today = businessDateInBeijing()
    const parametersA = { ...defaultLabParameters, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironFactor: 25 }
    const blocks = Array.from({ length: 10 }, (_, offset) => {
      const index = offset + 1
      return makeBlock(index, index === 10 ? {} : { ironRaw: 1 }, parametersA)
    })
    const before = makeSheet(today, blocks, parametersA)
    const after = makeSheet(today, blocks.map((block) => block.index >= 8
      ? { ...block, parameterSnapshot: parametersB }
      : block), parametersB)
    prisma.labSheet.findUnique.mockResolvedValue(before)
    transaction.labSheet.findUnique.mockResolvedValueOnce(before).mockResolvedValueOnce(after)

    await service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: parametersB, startIndex: 8 },
      'client-1'
    )

    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(3)
    expect(transaction.sampleBlock.update.mock.calls.map(([argument]) => argument.where.id))
      .toEqual(['block-8', 'block-9', 'block-10'])
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-10' },
      data: expect.objectContaining({
        parameterSnapshot: expect.objectContaining({
          ironFactor: 25,
          segmentedApplication: true
        })
      })
    }))
  })

  it('keeps an explicitly segmented blank snapshot when that older segment receives its first detection input', async () => {
    const today = businessDateInBeijing()
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const segmentedSnapshot = { ...parametersA, segmentedApplication: true }
    const block = {
      ...makeBlock(5, {}, segmentedSnapshot),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-08T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block], parametersB))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-08T00:00:01.000Z')
    }))

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'segmented-first-input-1',
        baseUpdatedAt: block.updatedAt.toISOString(),
        baseInputs: { ironRaw: null },
        changedFields: { ironRaw: 2 }
      }
    )

    expect((result.parameterSnapshot as Record<string, unknown>)).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect((result.results as Record<string, unknown>).iron).toBe(20)
  })

  it('uses the latest sheet parameters for an ordinary unmarked blank snapshot on first detection input', async () => {
    const today = businessDateInBeijing()
    const ordinarySnapshot = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const latestParameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const block = {
      ...makeBlock(5, {}, ordinarySnapshot),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-08T00:00:00.000Z')
    }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [block], latestParameters))
    prisma.sampleBlock.findUnique.mockResolvedValue(block)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({
      ...block,
      ...data,
      updatedAt: new Date('2026-08-08T00:00:01.000Z')
    }))

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: block.id,
        idempotencyKey: 'ordinary-first-input-1',
        baseUpdatedAt: block.updatedAt.toISOString(),
        baseInputs: { ironRaw: null },
        changedFields: { ironRaw: 2 }
      }
    )

    expect((result.parameterSnapshot as Record<string, unknown>)).toMatchObject({
      ironFactor: 25
    })
    expect((result.parameterSnapshot as Record<string, unknown>)).not.toHaveProperty('segmentedApplication')
    expect((result.results as Record<string, unknown>).iron).toBe(50)
  })

  it('locks before apply rereads and calculates from the latest sample inputs', async () => {
    const today = businessDateInBeijing()
    const parameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const stale = makeSheet(today, [makeBlock(1, { ironRaw: 1 })])
    const latest = makeSheet(today, [makeBlock(1, { ironRaw: 2 })])
    prisma.labSheet.findUnique.mockResolvedValue(stale)
    transaction.$queryRaw.mockResolvedValue([{ id: stale.id }])
    transaction.labSheet.findUnique.mockResolvedValue(latest)

    await service.applyCurrentParametersFromIndex('front-1', { parameters, startIndex: 1 })

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.labSheet.findUnique.mock.invocationCallOrder[0]
    )
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ results: expect.objectContaining({ iron: 20 }) })
    }))
  })

  it('locks before save rereads and preserves the latest segmented snapshot', async () => {
    const today = businessDateInBeijing()
    const staleParameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const latestSnapshot = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10, segmentedApplication: true }
    const staleBlock = {
      ...makeBlock(1, {}, staleParameters),
      sheetId: `sheet-${today}`,
      updatedAt: new Date('2026-08-08T00:00:00.000Z')
    }
    const latestBlock = { ...staleBlock, parameterSnapshot: latestSnapshot }
    prisma.labSheet.findUnique.mockResolvedValue(makeSheet(today, [staleBlock], staleParameters))
    prisma.sampleBlock.findUnique.mockResolvedValue(staleBlock)
    prisma.sampleBlock.update.mockImplementation(async ({ data }) => ({ ...staleBlock, ...data }))
    transaction.$queryRaw.mockImplementation(async (query: { strings?: readonly string[] }) => {
      if (query.strings?.join('').includes('pg_advisory_xact_lock')) {
        throw new Error("Failed to deserialize column of type 'void'")
      }
      return [{ id: `sheet-${today}` }]
    })
    transaction.labSheet.findUnique.mockResolvedValue(makeSheet(today, [latestBlock], staleParameters))
    transaction.sampleBlock.findUnique.mockResolvedValue(latestBlock)
    transaction.sampleBlock.update.mockImplementation(async ({ data }) => ({ ...latestBlock, ...data }))

    const result = await service.saveSampleBlock(
      { id: 'front-1' } as never,
      `sheet-${today}`,
      {
        id: latestBlock.id,
        idempotencyKey: 'locked-save-1',
        baseUpdatedAt: latestBlock.updatedAt.toISOString(),
        baseInputs: { ironRaw: null },
        changedFields: { ironRaw: 2 }
      }
    )

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.$queryRaw.mock.invocationCallOrder[0]
    )
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.sampleBlock.findUnique.mock.invocationCallOrder[0]
    )
    expect((result.parameterSnapshot as Record<string, unknown>).ironFactor).toBe(10)
    expect((result.results as Record<string, unknown>).iron).toBe(20)
  })

  it('locks before add rereads the latest parameters and highest sample index', async () => {
    const today = businessDateInBeijing()
    const staleParameters = { ...defaultLabParameters, ironFactor: 10 }
    const latestParameters = { ...defaultLabParameters, ironFactor: 25 }
    const stale = makeSheet(today, [makeBlock(1)], staleParameters)
    const latest = makeSheet(today, [makeBlock(1), makeBlock(2)], latestParameters)
    prisma.labSheet.findUnique.mockResolvedValue(stale)
    prisma.sampleBlock.createMany.mockResolvedValue({})
    transaction.$queryRaw.mockResolvedValue([{ id: stale.id }])
    transaction.labSheet.findUnique.mockResolvedValue(latest)
    transaction.sampleBlock.createMany.mockResolvedValue({})

    await service.addSampleBlocks('front-1', stale.id, 1)

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.labSheet.findUnique.mock.invocationCallOrder[0]
    )
    expect(transaction.sampleBlock.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        index: 3,
        parameterSnapshot: expect.objectContaining({ ironFactor: 25 })
      })]
    }))
  })

  it.each([
    [{ ...defaultLabParameters }, 0, '起始样品编号必须是正整数'],
    [{ ...defaultLabParameters }, '1', '起始样品编号必须是正整数'],
    [{ ...defaultLabParameters }, true, '起始样品编号必须是正整数'],
    [{ ...defaultLabParameters }, [1], '起始样品编号必须是正整数'],
    [{ ...defaultLabParameters, ironFactor: Number.NaN }, 1, '参数必须是有限数值']
  ] as Array<[Record<string, unknown>, unknown, string]>)('rejects invalid segmented parameter applications', async (parameters, startIndex, message) => {
    await expect(service.applyCurrentParametersFromIndex('front-1', { parameters, startIndex }))
      .rejects.toThrow(message)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([null, [], 'invalid'])('rejects a non-object segmented parameter payload with a controlled bad request', async (payload) => {
    await expect(service.applyCurrentParametersFromIndex('front-1', payload as never))
      .rejects.toThrow('请求格式不正确')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a start index that is not present in the current sheet', async () => {
    const today = businessDateInBeijing()
    const sheet = makeSheet(today, [1, 2, 3, 4].map((index) => makeBlock(index)))
    prisma.labSheet.findUnique.mockResolvedValue(sheet)
    transaction.labSheet.findUnique.mockResolvedValue(sheet)

    await expect(service.applyCurrentParametersFromIndex(
      'front-1',
      { parameters: defaultLabParameters, startIndex: 8 }
    )).rejects.toThrow('起始样品不存在，请刷新后重新选择')

    expect(transaction.labSheet.update).not.toHaveBeenCalled()
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })
})
