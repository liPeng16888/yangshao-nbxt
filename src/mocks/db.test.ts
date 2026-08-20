import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultLabParameters } from '@/constants/labSheetTemplate'

let db: typeof import('./db')

describe('segmented parameter mock database validation', () => {
  beforeEach(async () => {
    vi.resetModules()
    db = await import('./db')
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('marks blank snapshots before the boundary while keeping sheet parameters unmarked', async () => {
    const changed = { ...defaultLabParameters, ironFactor: 99 }

    const result = await db.mockApplyParametersFromIndex(changed, 3)

    expect(result.parameters).not.toHaveProperty('segmentedApplication')
    expect(result.sampleBlocks[1].parameterSnapshot).toMatchObject({
      ironFactor: defaultLabParameters.ironFactor,
      segmentedApplication: true
    })
    expect(result.sampleBlocks[2].parameterSnapshot).toMatchObject({
      ironFactor: 99,
      segmentedApplication: true
    })
  })

  it('keeps an initial blank block on its original parameters after a later boundary', async () => {
    const before = await db.mockCurrentLabSheet()
    const originalBlock = before.sampleBlocks[1]
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }

    const applied = await db.mockApplyParametersFromIndex(parametersA, 3)

    expect(applied.sampleBlocks[1].parameterSnapshot).toEqual({
      ...originalBlock.parameterSnapshot,
      segmentedApplication: true
    })
    expect(applied.sampleBlocks[1].inputs).toEqual(originalBlock.inputs)
    expect(applied.sampleBlocks[1].results).toEqual(originalBlock.results)

    const saved = await db.mockSaveSampleBlock(applied.id, {
      id: applied.sampleBlocks[1].id,
      changedFields: { ironRaw: 2 }
    })

    expect(saved.parameterSnapshot).toMatchObject({
      ironFactor: defaultLabParameters.ironFactor,
      segmentedApplication: true
    })
    expect(saved.results.iron).toBe(57.036)
  })

  it('keeps an added blank block on parameters A after applying parameters B from the next boundary', async () => {
    const parametersA = { ...defaultLabParameters, ironBlank: 0, ironFactor: 10 }
    const parametersB = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }

    await db.mockApplyParametersFromIndex(parametersA, 3)
    const withAddedBlocks = await db.mockAddSampleBlocks((await db.mockCurrentLabSheet()).id, 2)
    const originalBlock11 = withAddedBlocks.sampleBlocks[10]

    const applied = await db.mockApplyParametersFromIndex(parametersB, 12)

    expect(applied.sampleBlocks[10].parameterSnapshot).toEqual({
      ...originalBlock11.parameterSnapshot,
      segmentedApplication: true
    })
    expect(applied.sampleBlocks[10].inputs).toEqual(originalBlock11.inputs)
    expect(applied.sampleBlocks[10].results).toEqual(originalBlock11.results)
    expect(applied.sampleBlocks[11].parameterSnapshot).toMatchObject({
      ironFactor: 25,
      segmentedApplication: true
    })

    const saved = await db.mockSaveSampleBlock(applied.id, {
      id: applied.sampleBlocks[10].id,
      changedFields: { ironRaw: 2 }
    })

    expect(saved.parameterSnapshot).toMatchObject({
      ironFactor: 10,
      segmentedApplication: true
    })
    expect(saved.results.iron).toBe(20)
  })

  it('matches server request lifecycle validation, canonical customers, filtering, and immutable details', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    const resolve = async <T>(promise: Promise<T>) => {
      await vi.runAllTimersAsync()
      return promise
    }
    const current = await resolve(db.mockCurrentLabSheet())
    const seeded = await resolve(db.mockSaveSampleBlock(current.id, {
      id: current.sampleBlocks[0].id,
      changedFields: { sampleNumber: '旧样品', price: 80, ironRaw: 1 }
    }))
    vi.setSystemTime(new Date('2026-08-21T04:00:00.000Z'))
    const basePayload = {
      blockId: seeded.id, baseUpdatedAt: seeded.updatedAt!, reason: ' 原始记录更正 ',
      changes: { payerCustomer: { customerIds: [' c-2 ', '', 'c-1', 'c-2'], customerText: '伪造名称' }, sampleNumber: ' 新样品 ' }
    }

    await expect(db.mockCreateLabSampleChangeRequest({ ...basePayload, changes: { ironRaw: Number.NaN } })).rejects.toThrow()
    await expect(db.mockCreateLabSampleChangeRequest({ ...basePayload, changes: { paymentStatus: '非法状态' as never } })).rejects.toThrow()
    await expect(db.mockCreateLabSampleChangeRequest({ ...basePayload, changes: { payerCustomer: { customerIds: 'c-1', customerText: '' } as never } })).rejects.toThrow()

    const created = await resolve(db.mockCreateLabSampleChangeRequest(basePayload))
    expect(created).toMatchObject({ status: 'PENDING', reason: '原始记录更正', sampleName: '旧样品' })
    const detail = await resolve(db.mockGetLabSampleChangeRequest(created.id))
    expect(detail.requestedChanges).toMatchObject({
      sampleNumber: '新样品', payerCustomer: { customerIds: ['c-2', 'c-1'], customerText: '三门峡选矿厂、洛阳矿业样品 001' }
    })
    detail.sourceSnapshot.inputs.sampleNumber = '篡改'
    expect((await resolve(db.mockGetLabSampleChangeRequest(created.id))).sourceSnapshot.inputs.sampleNumber).toBe('旧样品')
    await expect(db.mockCreateLabSampleChangeRequest(basePayload)).rejects.toThrow('样品已有待处理修改申请')
    expect(await resolve(db.mockListLabSampleChangeRequests({ date: '2026-08-20', status: 'PENDING' }))).toHaveLength(1)

    const withdrawn = await resolve(db.mockWithdrawLabSampleChangeRequest(created.id))
    expect(withdrawn.status).toBe('WITHDRAWN')
    expect(await resolve(db.mockListLabSampleChangeRequests({ status: 'WITHDRAWN' }))).toHaveLength(1)
    await expect(db.mockWithdrawLabSampleChangeRequest(created.id)).rejects.toThrow('未找到待撤回的修改申请')
    expect((await resolve(db.mockCreateLabSampleChangeRequest(basePayload)).then((row) => row.status))).toBe('PENDING')
  })

  it('scopes customer search, deletion, and payer canonicalization to the current mock account', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T04:00:00.000Z'))
    const resolve = async <T>(promise: Promise<T>) => {
      const handled = promise.then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error })
      )
      await vi.runAllTimersAsync()
      const result = await handled
      if (!result.ok) throw result.error
      return result.value
    }
    const firstCustomer = await resolve(db.mockCreateCustomer({ name: '第一账号客户' }))
    await resolve(db.mockRegister({
      username: '第二账号', account: 'second-account', password: 'password', confirmPassword: 'password', inviteCode: 'YANGSHAO-2026'
    }))

    expect((await resolve(db.mockSearchCustomers(''))).map((customer) => customer.id)).not.toContain(firstCustomer.id)
    await expect(resolve(db.mockDeleteCustomer(firstCustomer.id))).rejects.toThrow('客户信息不存在')
    const ownCustomer = await resolve(db.mockCreateCustomer({ name: '第二账号客户' }))
    expect(ownCustomer).not.toHaveProperty('frontendUserId')

    const sheet = await resolve(db.mockCurrentLabSheet())
    const block = await resolve(db.mockSaveSampleBlock(sheet.id, {
      id: sheet.sampleBlocks[0].id, changedFields: { sampleNumber: '跨账号样品', ironRaw: 1 }
    }))
    vi.setSystemTime(new Date('2026-08-21T04:00:00.000Z'))
    const basePayload = { blockId: block.id, baseUpdatedAt: block.updatedAt!, reason: '客户更正' }
    await expect(resolve(db.mockCreateLabSampleChangeRequest({
      ...basePayload, changes: { payerCustomer: { customerIds: [firstCustomer.id], customerText: '第一账号客户' } }
    }))).rejects.toThrow('付款客户无效')

    const created = await resolve(db.mockCreateLabSampleChangeRequest({
      ...basePayload, changes: { payerCustomer: { customerIds: [ownCustomer.id], customerText: '伪造文本' } }
    }))
    const detail = await resolve(db.mockGetLabSampleChangeRequest(created.id))
    expect(detail.requestedChanges).toMatchObject({
      payerCustomer: { customerIds: [ownCustomer.id], customerText: '第二账号客户' }
    })
  })
})
