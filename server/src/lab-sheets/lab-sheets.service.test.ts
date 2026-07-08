import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyInputs, defaultLabParameters } from '../common/lab'
import { todayInBeijing } from '../common/date'
import { LabSheetsService } from './lab-sheets.service'

function makeBlock(index: number, inputs: Record<string, unknown> = {}) {
  const nextInputs = { ...createEmptyInputs(index), ...inputs }
  return {
    id: `block-${index}`,
    index,
    readonly: false,
    inputs: nextInputs,
    results: {},
    parameterSnapshot: defaultLabParameters
  }
}

function makeSheet(date: string, blocks = [makeBlock(1)]) {
  return {
    id: `sheet-${date}`,
    frontendUserId: 'front-1',
    date,
    readonly: date !== todayInBeijing(),
    parameters: defaultLabParameters,
    sampleBlocks: blocks
  }
}

describe('LabSheetsService default sheet selection', () => {
  const prisma = {
    labSheet: {
      findUnique: vi.fn(),
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
    prisma.cellChangeLog.findMany.mockResolvedValue([])
    prisma.cellChangeLog.findFirst.mockResolvedValue(null)
    prisma.cellChangeLog.create.mockResolvedValue({})
    prisma.abnormalRecord.deleteMany.mockResolvedValue({})
  })

  it('returns today sheet when today already has visible data', async () => {
    const today = todayInBeijing()
    const todaySheet = makeSheet(today, [makeBlock(1, { sampleNumber: 'A-001' })])
    prisma.labSheet.findUnique.mockResolvedValue(todaySheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(today)
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>).sampleNumber).toBe('A-001')
    expect(prisma.labSheet.findMany).not.toHaveBeenCalled()
  })

  it('returns today sheet when today is empty even if history has data', async () => {
    const today = todayInBeijing()
    const emptyTodaySheet = makeSheet(today, [makeBlock(1)])
    prisma.labSheet.findUnique.mockResolvedValue(emptyTodaySheet)

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe(today)
    expect(prisma.labSheet.findMany).not.toHaveBeenCalled()
  })

  it('creates today sheet when no sheet has visible data', async () => {
    const today = todayInBeijing()
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

  it('keeps today sheet editable even when it was stored readonly before today', async () => {
    const today = todayInBeijing()
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
    const today = todayInBeijing()
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
    const today = todayInBeijing()
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
        changedFields: { sampleNumber: 'NEW' }
      },
      'client-1'
    )

    expect(prisma.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        inputs: expect.objectContaining({
          sampleNumber: 'NEW',
          customerText: '保留客户'
        })
      })
    }))
    expect((result.inputs as Record<string, unknown>).sampleNumber).toBe('NEW')
  })

  it('rejects stale same-field saves instead of overwriting newer data', async () => {
    const today = todayInBeijing()
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
})
