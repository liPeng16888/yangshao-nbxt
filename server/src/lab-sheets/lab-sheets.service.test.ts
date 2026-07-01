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
    }
  }
  const realtime = { publish: vi.fn() }
  let service: LabSheetsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new LabSheetsService(prisma as never, realtime as never)
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

  it('returns latest filled historical sheet when today is empty', async () => {
    const today = todayInBeijing()
    const emptyTodaySheet = makeSheet(today, [makeBlock(1)])
    const latestFilledSheet = makeSheet('2026-06-30', [makeBlock(1, { sampleNumber: 'OLD-001' })])
    const olderFilledSheet = makeSheet('2026-06-29', [makeBlock(1, { sampleNumber: 'OLD-000' })])
    prisma.labSheet.findUnique.mockResolvedValue(emptyTodaySheet)
    prisma.labSheet.findMany.mockResolvedValue([emptyTodaySheet, latestFilledSheet, olderFilledSheet])

    const result = await service.getDefaultSheetForFrontendUser('front-1')

    expect(result.date).toBe('2026-06-30')
    expect((result.sampleBlocks[0].inputs as Record<string, unknown>).sampleNumber).toBe('OLD-001')
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
})
