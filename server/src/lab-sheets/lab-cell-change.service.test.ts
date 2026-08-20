import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LabCellChangeService } from './lab-cell-change.service'

describe('LabCellChangeService', () => {
  const transaction = {
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
    labSheet: {
      findUnique: vi.fn()
    }
  }
  const service = new LabCellChangeService()

  beforeEach(() => {
    vi.clearAllMocks()
    transaction.cellChangeLog.findFirst.mockResolvedValue(null)
    transaction.cellChangeLog.create.mockResolvedValue({})
    transaction.cellChangeLog.findMany.mockResolvedValue([])
    transaction.abnormalRecord.deleteMany.mockResolvedValue({})
  })

  it('creates request-linked logs for explicit approved fields', async () => {
    await service.record(transaction as never, {
      sheetId: 'sheet-1', blockId: 'block-1', frontendUserId: 'front-1', changedById: 'admin-1',
      oldInputs: { price: 80 }, nextInputs: { price: 100 },
      committedFields: [{ field: 'price', oldValue: 80, newValue: 100 }],
      changeRequestId: 'request-1'
    })

    expect(transaction.cellChangeLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      field: 'price', oldValue: 80, newValue: 100, changedById: 'admin-1', changeRequestId: 'request-1'
    }) })
  })

  it('keeps existing autosave coalescing when no explicit fields are supplied', async () => {
    transaction.cellChangeLog.findFirst.mockResolvedValue({ id: 'log-1', field: 'price' })

    await service.record(transaction as never, {
      sheetId: 'sheet-1', blockId: 'block-1', frontendUserId: 'front-1', changedById: 'front-1',
      oldInputs: { price: 80 }, nextInputs: { price: 81 }
    })

    expect(transaction.cellChangeLog.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'log-1' } }))
    expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
  })
})
