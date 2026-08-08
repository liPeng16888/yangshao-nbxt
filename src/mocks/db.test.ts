import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

let db: typeof import('./db')

describe('segmented parameter mock database validation', () => {
  beforeEach(async () => {
    vi.resetModules()
    db = await import('./db')
  })

  it.each([0, -1, 1.5, Number.NaN, '1', true, [1]])(
    'rejects a non-positive-integer start index without mutating the mock sheet: %s',
    async (startIndex) => {
      const before = await db.mockCurrentLabSheet()

      await expect(db.mockApplyParametersFromIndex(defaultLabParameters, startIndex as never))
        .rejects.toThrow('起始样品编号必须是正整数')

      expect(await db.mockCurrentLabSheet()).toEqual(before)
    }
  )

  it.each([
    null,
    { ...defaultLabParameters, ironFactor: Number.NaN },
    { ...defaultLabParameters, ironFactor: Number.POSITIVE_INFINITY },
    { ...defaultLabParameters, ironFactor: '25' },
    Object.fromEntries(Object.entries(defaultLabParameters).filter(([key]) => key !== 'ironFactor'))
  ])('rejects incomplete or non-finite parameter payloads without mutation', async (parameters) => {
    const before = await db.mockCurrentLabSheet()

    await expect(db.mockApplyParametersFromIndex(parameters as never, 1))
      .rejects.toThrow('参数必须是有限数值')

    expect(await db.mockCurrentLabSheet()).toEqual(before)
  })

  it('rejects a missing boundary atomically', async () => {
    const before = await db.mockCurrentLabSheet()
    const changed = { ...defaultLabParameters, ironFactor: 99 }

    await expect(db.mockApplyParametersFromIndex(changed, 999))
      .rejects.toThrow('起始样品不存在，请刷新后重新选择')

    expect(await db.mockCurrentLabSheet()).toEqual(before)
  })

  it('marks only the inclusive applied range while keeping sheet parameters unmarked', async () => {
    const changed = { ...defaultLabParameters, ironFactor: 99 }

    const result = await db.mockApplyParametersFromIndex(changed, 3)

    expect(result.parameters).not.toHaveProperty('segmentedApplication')
    expect(result.sampleBlocks[1].parameterSnapshot).not.toHaveProperty('segmentedApplication')
    expect(result.sampleBlocks[2].parameterSnapshot).toMatchObject({
      ironFactor: 99,
      segmentedApplication: true
    })
  })
})
