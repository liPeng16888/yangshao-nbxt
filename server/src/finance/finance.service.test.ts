import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '../common/lab'
import { FinanceService } from './finance.service'

function getElementCounts(elementNote: string) {
  const service = new FinanceService({} as never, {} as never, {} as never)
  return (service as unknown as {
    getMonthlyElementCounts(inputs: Record<string, unknown>): Array<{ key: string; label: string; count: number }>
  }).getMonthlyElementCounts({ elementNote })
}

describe('FinanceService monthly element counts', () => {
  it('collapses aluminum, silicon and their ratio into the ratio item', () => {
    expect(getElementCounts('铝、硅、铝硅比、硫')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 },
      { key: 'sulfur', label: '硫', count: 1 }
    ])
  })

  it('keeps aluminum or silicon when they are selected separately', () => {
    expect(getElementCounts('铝')).toEqual([{ key: 'aluminum', label: '铝', count: 1 }])
    expect(getElementCounts('硅')).toEqual([{ key: 'silicon', label: '硅', count: 1 }])
  })

  it('counts a standalone aluminum-silicon ratio selection as the combined ratio item', () => {
    expect(getElementCounts('铝硅比')).toEqual([
      { key: 'aluminumSiliconRatio', label: '铝硅比', count: 1 }
    ])
  })
})

describe('FinanceService batch sample payment', () => {
  const transaction = {
    $queryRaw: vi.fn(),
    sampleBlock: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    cellChangeLog: {
      create: vi.fn()
    }
  }
  const prisma = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) => operation(transaction))
  }
  let service: FinanceService

  function makeBlock(id: string, frontendUserId = 'front-1', paymentStatus = '未结款') {
    return {
      id,
      sheetId: 'sheet-1',
      index: id === 'block-1' ? 1 : 2,
      readonly: false,
      inputs: { paymentStatus },
      results: {},
      parameterSnapshot: defaultLabParameters,
      sheet: {
        id: 'sheet-1',
        frontendUserId,
        parameters: defaultLabParameters
      }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    service = new FinanceService(prisma as never, {} as never, {} as never)
    transaction.$queryRaw.mockResolvedValue([])
    transaction.sampleBlock.update.mockImplementation(async ({ where, data }: any) => {
      const block = [makeBlock('block-1'), makeBlock('block-2')].find((item) => item.id === where.id)!
      return { ...block, ...data }
    })
    transaction.cellChangeLog.create.mockResolvedValue({})
  })

  it('marks unique unsettled samples as paid in one transaction and logs every block', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-2'), makeBlock('block-1')])

    const result = await service.markFrontendSamplesPaid('front-1', ['block-1', 'block-1', 'block-2'])

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(transaction.sampleBlock.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['block-1', 'block-2'] } },
      include: { sheet: true }
    })
    expect(transaction.sampleBlock.update).toHaveBeenCalledTimes(2)
    expect(transaction.cellChangeLog.create).toHaveBeenCalledTimes(2)
    expect(result.map((block) => block.id)).toEqual(['block-1', 'block-2'])
    expect(result.every((block) => (block.inputs as Record<string, unknown>).paymentStatus === '已结款')).toBe(true)
  })

  it('locks owning sheets before rereading blocks and calculates from the latest snapshot', async () => {
    const stale = {
      ...makeBlock('block-1'),
      inputs: { paymentStatus: '未结款', ironRaw: 2 },
      parameterSnapshot: { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    }
    const latest = {
      ...stale,
      parameterSnapshot: { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    }
    let visibleBlock = stale
    transaction.$queryRaw.mockImplementation(async () => {
      visibleBlock = latest
      return [{ id: 'sheet-1' }]
    })
    transaction.sampleBlock.findMany.mockImplementation(async () => [visibleBlock])

    await service.markFrontendSamplesPaid('front-1', ['block-1'])

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1)
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.sampleBlock.findMany.mock.invocationCallOrder[0]
    )
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ results: expect.objectContaining({ iron: 50 }) })
    }))
  })

  it('rejects an empty batch before opening a transaction', async () => {
    await expect(service.markFrontendSamplesPaid('front-1', [])).rejects.toThrow('请选择需要结款的样品')

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('rejects missing or unauthorized samples before updating anything', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-1', 'front-2')])

    await expect(service.markFrontendSamplesPaid('front-1', ['block-1', 'block-2'])).rejects.toThrow('部分样品不存在或无权操作')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
  })

  it('rejects samples that are no longer unsettled before updating anything', async () => {
    transaction.sampleBlock.findMany.mockResolvedValue([makeBlock('block-1', 'front-1', '已结款')])

    await expect(service.markFrontendSamplesPaid('front-1', ['block-1'])).rejects.toThrow('部分样品已不是未结款状态')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
  })
})
