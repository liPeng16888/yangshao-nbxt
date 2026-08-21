import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { MonthlySettlementStatus, ReminderType } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyInputs, defaultLabParameters } from '../common/lab'
import { AdminLabSampleChangeRequestQueryDto, ApproveLabSampleChangeRequestDto, RejectLabSampleChangeRequestDto } from './dto'
import { LabSampleChangeRequestStatus } from './lab-sample-change-request.types'
import { LabSampleChangeRequestsService } from './lab-sample-change-requests.service'

const frontendUser = { id: 'front-1', account: 'front', username: '前台', role: 'FRONTEND_USER' as const }
const rootAdmin = { id: 'admin-1', account: 'root', username: '超级管理员', role: 'ROOT_ADMIN' as const }
const subAdmin = { id: 'sub-1', account: 'sub', username: '子管理员', role: 'SUB_ADMIN' as const }
const grants = { historical: 'history-grant', completedData: 'completed-grant' }
const historicalDate = '2026-08-19'
const requestedByIdentity = { id: 'front-1', account: 'front', username: '前台' }
const reviewedByIdentity = { id: 'admin-1', account: 'root', username: '超级管理员' }
const adminIdentityInclude = {
  requestedBy: { select: { id: true, account: true, username: true } },
  reviewedBy: { select: { id: true, account: true, username: true } }
}

function makeHistoricalBlock(overrides: Record<string, unknown> = {}) {
  const inputs = {
    ...createEmptyInputs(1),
    sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1,
    ...((overrides.inputs || {}) as Record<string, unknown>)
  }
  return {
    id: 'block-1', sheetId: 'sheet-1', index: 1, inputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters,
    updatedAt: new Date('2026-08-19T08:00:00.000Z'),
    sheet: { id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate },
    ...overrides
  }
}

function makeCurrentBlock() {
  return makeHistoricalBlock({ sheet: { id: 'sheet-current', frontendUserId: 'front-1', date: '2026-08-20' } })
}

function validCreateDto() {
  return {
    blockId: 'block-1', baseUpdatedAt: '2026-08-19T08:00:00.000Z',
    changes: { sampleNumber: '新样品' }, reason: '客户要求更正'
  }
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1', frontendUserId: 'front-1', requestedById: 'front-1', sheetId: 'sheet-1', blockId: 'block-1',
    date: historicalDate, blockIndex: 1, baseBlockUpdatedAt: new Date('2026-08-19T08:00:00.000Z'),
    sourceSnapshot: { inputs: makeHistoricalBlock().inputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters },
    requestedChanges: { sampleNumber: '新样品' }, previewResults: { iron: 57.036 }, reason: '客户要求更正',
    status: LabSampleChangeRequestStatus.PENDING, reviewRemark: null, reviewedById: null, reviewedAt: null,
    withdrawnAt: null, settlementEffects: null,
    createdAt: new Date('2026-08-20T01:00:00.000Z'), updatedAt: new Date('2026-08-20T01:00:00.000Z'),
    ...overrides
  }
}

function makeAdminRequest(overrides: Record<string, unknown> = {}) {
  const request = makeRequest(overrides)
  return {
    ...request,
    requestedBy: requestedByIdentity,
    reviewedBy: request.reviewedById ? reviewedByIdentity : null
  }
}

function sqlText(value: unknown) {
  const sql = value as { strings?: string[] }
  return Array.isArray(sql?.strings) ? sql.strings.join('?') : String(value || '')
}

function makeStatefulApprovalHarness(options: {
  monthly?: boolean
  failReminder?: boolean
  subPermission?: boolean
  holdFirstRequestForConcurrency?: boolean
  holdPermissionShare?: boolean
} = {}) {
  const oldInputs = {
    ...makeHistoricalBlock().inputs,
    ...(options.monthly ? {
      customerId: 'c-old', customerIds: ['c-old'], customers: [{ id: 'c-old', name: '旧客户' }],
      customerText: '旧客户', paymentStatus: '月结款', price: 80
    } : {})
  }
  let state = {
    request: makeAdminRequest({
      sourceSnapshot: { inputs: oldInputs, results: { iron: 1 }, parameterSnapshot: defaultLabParameters },
      requestedChanges: options.monthly ? { price: 100 } : { sampleNumber: '新样品' }
    }) as any,
    block: makeHistoricalBlock({ inputs: oldInputs }) as any,
    settlement: options.monthly ? {
      id: 'settle-old', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户',
      status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清', updatedAt: new Date('2026-08-20T01:30:00.000Z')
    } as any : null,
    reminders: [] as any[],
    logs: [] as any[],
    permission: options.subPermission ?? true
  }
  const counters = { transactionsStarted: 0, requestLockWaits: 0, sampleUpdates: 0, monthlyUpdates: 0 }
  const events: string[] = []

  let requestTail = Promise.resolve()
  let requestQueueDepth = 0
  const acquireRequestLock = async () => {
    const previous = requestTail
    let releaseCurrent!: () => void
    requestTail = new Promise<void>((resolve) => { releaseCurrent = resolve })
    if (requestQueueDepth > 0) counters.requestLockWaits += 1
    requestQueueDepth += 1
    await previous
    return () => {
      requestQueueDepth -= 1
      releaseCurrent()
    }
  }

  let resolveSecondTransaction!: () => void
  const secondTransactionStarted = new Promise<void>((resolve) => { resolveSecondTransaction = resolve })
  let permissionReaders = 0
  const permissionReleaseWaiters: Array<() => void> = []
  let resolvePermissionShare!: () => void
  const permissionShareAcquired = new Promise<void>((resolve) => { resolvePermissionShare = resolve })
  let continuePermissionShare!: () => void
  const permissionShareGate = new Promise<void>((resolve) => { continuePermissionShare = resolve })

  const prisma = {
    labSampleChangeRequest: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (operation: (tx: any) => Promise<unknown>) => {
      counters.transactionsStarted += 1
      const transactionNumber = counters.transactionsStarted
      if (transactionNumber >= 2) resolveSecondTransaction()
      const releases: Array<() => void> = []
      let snapshot: typeof state | undefined
      const tx = {
        $queryRaw: async (query: unknown) => {
          const text = sqlText(query)
          if (text.includes('"LabSampleChangeRequest"') && text.includes('FOR UPDATE')) {
            const release = await acquireRequestLock()
            releases.push(release)
            snapshot = structuredClone(state)
            events.push(`request-lock-${transactionNumber}`)
            if (transactionNumber === 1 && options.holdFirstRequestForConcurrency) await secondTransactionStarted
          } else if (text.includes('"SubAdminFrontendPermission"') && text.includes('FOR SHARE')) {
            permissionReaders += 1
            releases.push(() => {
              permissionReaders -= 1
              events.push('permission-share-released')
              if (!permissionReaders) permissionReleaseWaiters.splice(0).forEach((resolve) => resolve())
            })
            events.push('permission-share-acquired')
            resolvePermissionShare()
            if (options.holdPermissionShare) await permissionShareGate
            return state.permission ? [{ id: 'permission-1' }] : []
          }
          return []
        },
        labSampleChangeRequest: {
          findUnique: async () => structuredClone(state.request),
          update: async ({ where, data }: any) => {
            if (where.status && state.request.status !== where.status) throw { code: 'P2025' }
            state.request = {
              ...state.request,
              ...structuredClone(data),
              reviewedBy: data.reviewedById ? reviewedByIdentity : state.request.reviewedBy,
              updatedAt: new Date('2026-08-20T02:00:00.000Z')
            }
            return structuredClone(state.request)
          }
        },
        labSheet: {
          findUnique: async () => ({ id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate })
        },
        sampleBlock: {
          findUnique: async () => structuredClone(state.block),
          update: async ({ data }: any) => {
            counters.sampleUpdates += 1
            state.block = { ...state.block, ...structuredClone(data) }
            return structuredClone(state.block)
          }
        },
        customer: { findMany: async () => [] },
        monthlySettlementRecord: {
          findMany: async () => state.settlement ? [structuredClone(state.settlement)] : [],
          updateMany: async ({ where, data }: any) => {
            const statuses = where.status?.in || []
            const versionMatches = !where.updatedAt || state.settlement?.updatedAt?.getTime() === where.updatedAt.getTime()
            if (!state.settlement || state.settlement.id !== where.id || !statuses.includes(state.settlement.status) || !versionMatches) return { count: 0 }
            counters.monthlyUpdates += 1
            state.settlement = { ...state.settlement, ...structuredClone(data) }
            return { count: 1 }
          }
        },
        reminder: {
          create: async ({ data }: any) => {
            if (options.failReminder) throw new Error('reminder write failed')
            state.reminders.push(structuredClone(data))
            return structuredClone(data)
          }
        }
      }
      try {
        const result = await operation(tx)
        events.push(`transaction-committed-${transactionNumber}`)
        return result
      } catch (error) {
        if (snapshot) state = snapshot
        events.push(`transaction-rolled-back-${transactionNumber}`)
        throw error
      } finally {
        releases.reverse().forEach((release) => release())
      }
    })
  }
  const adminAccess = {
    getAllowedFrontendUserIds: vi.fn(async () => state.permission ? ['front-1'] : []),
    parseFrontendUserIds: vi.fn((value?: string | string[]) => Array.isArray(value) ? value : value ? value.split(',').map((id) => id.trim()).filter(Boolean) : [])
  }
  const cellChanges = {
    record: vi.fn(async (_tx: unknown, input: unknown) => { state.logs.push(structuredClone(input)) })
  }
  const service = new LabSampleChangeRequestsService(prisma as never, { assertAccessGrant: vi.fn() } as never, adminAccess as never, cellChanges as never)

  return {
    service,
    get state() { return state },
    counters,
    events,
    permissionShareAcquired,
    continuePermissionShare,
    async revokePermission() {
      events.push('permission-revoke-started')
      if (permissionReaders) await new Promise<void>((resolve) => permissionReleaseWaiters.push(resolve))
      state.permission = false
      events.push('permission-revoked')
    }
  }
}

describe('LabSampleChangeRequestsService frontend lifecycle', () => {
  const prisma = {
    $transaction: vi.fn(),
    sampleBlock: { findUnique: vi.fn() },
    customer: { findMany: vi.fn() },
    labSampleChangeRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() }
  }
  const transaction = {
    $queryRaw: vi.fn(),
    labSampleChangeRequest: { findUnique: vi.fn(), update: vi.fn() },
    labSheet: { findUnique: vi.fn() },
    sampleBlock: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() },
    monthlySettlementRecord: { findMany: vi.fn(), updateMany: vi.fn() },
    reminder: { create: vi.fn() }
  }
  const auth = { assertAccessGrant: vi.fn() }
  const adminAccess = { getAllowedFrontendUserIds: vi.fn(), parseFrontendUserIds: vi.fn() }
  const cellChanges = { record: vi.fn() }
  let service: LabSampleChangeRequestsService

  beforeEach(() => {
    vi.clearAllMocks()
    auth.assertAccessGrant.mockResolvedValue(undefined)
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    prisma.customer.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(null)
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 'request-1', ...data, status: LabSampleChangeRequestStatus.PENDING,
      reviewRemark: null, reviewedAt: null, withdrawnAt: null, createdAt: new Date(), updatedAt: new Date(),
      requestedBy: requestedByIdentity, reviewedBy: null
    }))
    prisma.labSampleChangeRequest.updateMany.mockResolvedValue({ count: 1 })
    prisma.$transaction.mockImplementation(async (operation: any) => operation(transaction))
    transaction.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('"SubAdminFrontendPermission"') ? [{ id: 'permission-1' }] : [])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    transaction.labSampleChangeRequest.update.mockImplementation(async ({ data }: any) => ({
      ...makeRequest(), ...data, updatedAt: new Date('2026-08-20T02:00:00.000Z')
    }))
    transaction.labSheet.findUnique.mockResolvedValue({ id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate })
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    transaction.sampleBlock.update.mockResolvedValue(makeHistoricalBlock())
    transaction.customer.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.updateMany.mockResolvedValue({ count: 1 })
    transaction.reminder.create.mockResolvedValue({})
    adminAccess.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
    adminAccess.parseFrontendUserIds.mockImplementation((value?: string | string[]) => Array.isArray(value) ? value : value ? value.split(',') : [])
    cellChanges.record.mockResolvedValue(undefined)
    service = new LabSampleChangeRequestsService(prisma as never, auth as never, adminAccess as never, cellChanges as never)
  })

  it('creates a server-normalized pending request for a historical sample', async () => {
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({
      inputs: { ...makeHistoricalBlock().inputs, customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1 }
    }))
    prisma.customer.findMany.mockResolvedValue([{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }])

    const row = await service.createForFrontend(frontendUser, {
      blockId: 'block-1', baseUpdatedAt: '2026-08-19T08:00:00.000Z',
      changes: { sampleNumber: '新样品', payerCustomer: { customerIds: ['c-1'], customerText: '伪造客户名' }, ironRaw: 2 },
      reason: '  客户要求更正  '
    }, grants)

    expect(row.status).toBe(LabSampleChangeRequestStatus.PENDING)
    expect(row).toMatchObject({ id: 'request-1', blockId: 'block-1' })
    expect(prisma.labSampleChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestedById: 'front-1', frontendUserId: 'front-1', blockId: 'block-1', reason: '客户要求更正',
      requestedChanges: expect.objectContaining({ sampleNumber: '新样品', ironRaw: 2 }),
      sourceSnapshot: expect.objectContaining({ inputs: expect.objectContaining({ customerIds: ['c-old'] }) }),
      previewResults: expect.objectContaining({ iron: expect.any(Number) })
    }) })
    const data = prisma.labSampleChangeRequest.create.mock.calls[0][0].data
    expect((data.sourceSnapshot as any).inputs.customers).toEqual([])
    expect((data.requestedChanges as any).payerCustomer).toEqual({ customerIds: ['c-1'], customerText: '王总' })
    expect(row).not.toHaveProperty('requestedBy')
    expect(row).not.toHaveProperty('reviewedBy')
  })

  it('rejects today, empty diffs, foreign customers, forbidden keys, and an existing pending request', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-08-20T03:00:00.000Z'))
      prisma.sampleBlock.findUnique.mockResolvedValue(makeCurrentBlock())
      await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toThrow('仅支持申请修改历史日期样品')
    } finally {
      vi.useRealTimers()
    }

    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: {} }, grants)).rejects.toThrow('请至少修改一项内容')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { sampleNumber: '旧样品' } }, grants)).rejects.toThrow('请至少修改一项内容')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { payerCustomer: { customerIds: ['foreign'], customerText: '外部' } } }, grants)).rejects.toThrow('付款客户无效')
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), changes: { completed: true } }, grants)).rejects.toThrow('不允许修改字段: completed')

    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest())
    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toBeInstanceOf(ConflictException)
  })

  it('requires historical access grant when creating a protected historical request', async () => {
    auth.assertAccessGrant.mockRejectedValue(new ForbiddenException('访问授权无效或已过期'))
    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toBeInstanceOf(ForbiddenException)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'history-grant', 'HISTORICAL_DATES')
  })

  it('requires completed-data access only when a completed sample is created or detailed', async () => {
    prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: { ...makeHistoricalBlock().inputs, completed: true } }))
    await service.createForFrontend(frontendUser, validCreateDto(), grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'completed-grant', 'COMPLETED_SAMPLE_DATA')

    vi.clearAllMocks()
    auth.assertAccessGrant.mockResolvedValue(undefined)
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest())
    await service.getForFrontend(frontendUser, 'request-1', grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledTimes(0)

    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ sourceSnapshot: { inputs: { completed: true } } }))
    await service.getForFrontend(frontendUser, 'request-1', grants)
    expect(auth.assertAccessGrant).toHaveBeenCalledWith('front-1', 'completed-grant', 'COMPLETED_SAMPLE_DATA')
  })

  it('returns settlement effects in frontend detail but not summaries', async () => {
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeAdminRequest({
      settlementEffects: [{ recordId: 'settle-1', oldStatus: MonthlySettlementStatus.PAID }]
    }))

    const detail = await service.getForFrontend(frontendUser, 'request-1', grants)

    expect(detail.settlementEffects).toEqual([expect.objectContaining({ recordId: 'settle-1' })])
    expect(detail).not.toHaveProperty('requestedBy')
    expect(detail).not.toHaveProperty('reviewedBy')
  })

  it('scopes frontend lists and hides source snapshots from summaries', async () => {
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([makeAdminRequest()])
    const rows = await service.listForFrontend(frontendUser, { date: historicalDate, status: LabSampleChangeRequestStatus.PENDING }, grants)

    expect(prisma.labSampleChangeRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      frontendUserId: 'front-1', date: historicalDate, status: LabSampleChangeRequestStatus.PENDING
    } }))
    expect(rows[0]).not.toHaveProperty('sourceSnapshot')
    expect(rows[0]).not.toHaveProperty('settlementEffects')
    expect(rows[0]).not.toHaveProperty('frontendUserId')
    expect(rows[0]).not.toHaveProperty('requestedBy')
    expect(rows[0]).not.toHaveProperty('reviewedBy')
    expect(prisma.labSampleChangeRequest.findMany.mock.calls[0][0]).not.toHaveProperty('include')
    expect(rows[0]).toMatchObject({ id: 'request-1', blockId: 'block-1', sampleName: '旧样品', changedFieldLabels: ['样品编号'] })
  })

  it('rejects a blank reason after trimming it', async () => {
    await expect(service.createForFrontend(frontendUser, { ...validCreateDto(), reason: '  ' }, grants)).rejects.toThrow('请填写申请原因')
  })

  it('translates a pending-index race conflict with the existing request summary', async () => {
    prisma.labSampleChangeRequest.create.mockRejectedValue({ code: 'P2002' })
    prisma.labSampleChangeRequest.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(makeRequest())

    await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toMatchObject({
      response: expect.objectContaining({ request: expect.objectContaining({ id: 'request-1' }) })
    })
  })

  it('allows only the owner to withdraw a pending request and preserves its record', async () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-20T03:04:05.000Z')
    vi.setSystemTime(now)
    try {
      prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeAdminRequest({ status: LabSampleChangeRequestStatus.PENDING }))
      const withdrawn = await service.withdrawForFrontend(frontendUser, 'request-1', grants)
      expect(prisma.labSampleChangeRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'request-1', frontendUserId: 'front-1', status: LabSampleChangeRequestStatus.PENDING },
        data: { status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt: now, updatedAt: now }
      })

      expect(withdrawn).toMatchObject({ withdrawnAt: now, updatedAt: now })
      expect(withdrawn).not.toHaveProperty('requestedBy')
      expect(withdrawn).not.toHaveProperty('reviewedBy')
      expect(prisma.labSampleChangeRequest.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: {
        id: 'request-1', frontendUserId: 'front-1', status: LabSampleChangeRequestStatus.PENDING
      } }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a withdrawal race when its pending compare-and-set updates no row', async () => {
    prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ status: LabSampleChangeRequestStatus.PENDING }))
    prisma.labSampleChangeRequest.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.withdrawForFrontend(frontendUser, 'request-1', grants)).rejects.toBeInstanceOf(ConflictException)
    expect(prisma.labSampleChangeRequest.updateMany).toHaveBeenCalledTimes(1)
  })
})

describe('historical sample admin DTO contract', () => {
  it('preserves and trims frontendUserIds from repeated or comma-separated query values under whitelist validation', async () => {
    const repeated = plainToInstance(AdminLabSampleChangeRequestQueryDto, {
      frontendUserIds: [' front-1 ', 'front-2']
    })
    const commaSeparated = plainToInstance(AdminLabSampleChangeRequestQueryDto, {
      frontendUserIds: ' front-1,front-2 '
    })

    expect(await validate(repeated, { whitelist: true })).toHaveLength(0)
    expect(await validate(commaSeparated, { whitelist: true })).toHaveLength(0)
    expect(repeated.frontendUserIds).toEqual(['front-1', 'front-2'])
    expect(commaSeparated.frontendUserIds).toBe('front-1,front-2')
  })

  it('keeps reviewRemark and removes the legacy remark property under whitelist validation', async () => {
    const approve = plainToInstance(ApproveLabSampleChangeRequestDto, {
      reviewRemark: '  已核对  ', remark: '不应保留'
    })
    const reject = plainToInstance(RejectLabSampleChangeRequestDto, {
      reviewRemark: '  原始凭证不足  ', remark: '不应保留'
    })

    expect(await validate(approve, { whitelist: true })).toHaveLength(0)
    expect(await validate(reject, { whitelist: true })).toHaveLength(0)
    expect(approve.reviewRemark).toBe('已核对')
    expect(reject.reviewRemark).toBe('原始凭证不足')
    expect(approve).not.toHaveProperty('remark')
    expect(reject).not.toHaveProperty('remark')

    const blank = plainToInstance(RejectLabSampleChangeRequestDto, { reviewRemark: '   ' })
    expect(await validate(blank, { whitelist: true })).not.toHaveLength(0)
  })
})

describe('LabSampleChangeRequestsService admin review', () => {
  const prisma = {
    $transaction: vi.fn(),
    labSampleChangeRequest: { findMany: vi.fn(), findUnique: vi.fn() }
  }
  const transaction = {
    $queryRaw: vi.fn(),
    labSampleChangeRequest: { findUnique: vi.fn(), update: vi.fn() },
    labSheet: { findUnique: vi.fn() },
    sampleBlock: { findUnique: vi.fn(), update: vi.fn() },
    customer: { findMany: vi.fn() },
    monthlySettlementRecord: { findMany: vi.fn(), updateMany: vi.fn() },
    reminder: { create: vi.fn() }
  }
  const auth = { assertAccessGrant: vi.fn() }
  const adminAccess = { getAllowedFrontendUserIds: vi.fn(), parseFrontendUserIds: vi.fn() }
  const cellChanges = { record: vi.fn() }
  let service: LabSampleChangeRequestsService

  beforeEach(() => {
    vi.clearAllMocks()
    prisma.$transaction.mockImplementation(async (operation: any) => operation(transaction))
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([])
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeAdminRequest())
    transaction.$queryRaw.mockImplementation(async (query: unknown) =>
      sqlText(query).includes('"SubAdminFrontendPermission"') ? [{ id: 'permission-1' }] : [])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeAdminRequest())
    transaction.labSampleChangeRequest.update.mockImplementation(async ({ data }: any) => ({
      ...makeAdminRequest(), ...data,
      reviewedBy: data.reviewedById ? reviewedByIdentity : null,
      updatedAt: new Date('2026-08-20T02:00:00.000Z')
    }))
    transaction.labSheet.findUnique.mockResolvedValue({ id: 'sheet-1', frontendUserId: 'front-1', date: historicalDate })
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock())
    transaction.sampleBlock.update.mockResolvedValue(makeHistoricalBlock())
    transaction.customer.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([])
    transaction.monthlySettlementRecord.updateMany.mockResolvedValue({ count: 1 })
    transaction.reminder.create.mockResolvedValue({})
    adminAccess.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
    adminAccess.parseFrontendUserIds.mockImplementation((value?: string | string[]) => Array.isArray(value) ? value : value ? value.split(',') : [])
    cellChanges.record.mockResolvedValue(undefined)
    service = new LabSampleChangeRequestsService(prisma as never, auth as never, adminAccess as never, cellChanges as never)
  })

  it('approves one request atomically, recalculates from the sample snapshot, links logs, and reminds the owner', async () => {
    const snapshotParameters = { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 }
    const currentInputs = { ...makeHistoricalBlock().inputs, ironRaw: 1, price: 80 }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeAdminRequest({
      requestedChanges: { ironRaw: 2, price: 100 },
      sourceSnapshot: { inputs: currentInputs, results: {}, parameterSnapshot: snapshotParameters }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({
      inputs: currentInputs, results: {}, parameterSnapshot: snapshotParameters
    }))

    const approved = await service.approveForAdmin(rootAdmin, 'request-1', { reviewRemark: '已核对原始记录' })

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(3)
    expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'block-1' },
      data: expect.objectContaining({ inputs: expect.objectContaining({ ironRaw: 2, price: 100 }), results: expect.objectContaining({ iron: 50 }) })
    }))
    expect(cellChanges.record).toHaveBeenCalledWith(transaction, expect.objectContaining({
      changedById: 'admin-1', changeRequestId: 'request-1',
      committedFields: expect.arrayContaining([expect.objectContaining({ field: 'ironRaw', oldValue: 1, newValue: 2 })])
    }))
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', status: LabSampleChangeRequestStatus.PENDING }),
      data: expect.objectContaining({ status: LabSampleChangeRequestStatus.APPROVED, reviewedById: 'admin-1', reviewRemark: '已核对原始记录' })
    }))
    expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: ReminderType.LAB_SAMPLE_CHANGE_APPROVED, sourceType: 'lab_sample_change_request', sourceId: 'request-1'
    }) })
    expect(transaction.reminder.create.mock.calls[0][0].data.content)
      .toBe('2026-08-19 第 1 个样品的修改申请已通过。')
    expect(approved).toMatchObject({
      frontendUserId: 'front-1',
      requestedBy: requestedByIdentity,
      reviewedBy: reviewedByIdentity,
      status: LabSampleChangeRequestStatus.APPROVED,
      previewResults: expect.objectContaining({ iron: 50 }),
      actualResults: expect.objectContaining({ iron: 50 })
    })
    expect(transaction.labSampleChangeRequest.update.mock.calls[0][0].include).toEqual(adminIdentityInclude)
  })

  it('resets affected paid and partial monthly records and snapshots their old state', async () => {
    const oldInputs = {
      ...makeHistoricalBlock().inputs,
      customerId: 'c-old', customerIds: ['c-old'], customers: [{ id: 'c-old', name: '旧客户' }],
      customerText: '旧客户', paymentStatus: '月结款', price: 80
    }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { payerCustomer: { customerIds: ['c-new'], customerText: '新客户' }, price: 100 }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.customer.findMany.mockResolvedValue([
      { id: 'c-new', name: '新客户', phone: null, wechat: null, wechatNickname: null }
    ])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([
      { id: 'settle-old', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户', status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清', updatedAt: new Date('2026-08-20T01:30:00.000Z') },
      { id: 'settle-new', month: '2026-08', frontendUserId: 'front-1', customer: '新客户', status: MonthlySettlementStatus.PARTIAL, paidAmount: 20, remark: '部分结款', updatedAt: new Date('2026-08-20T01:31:00.000Z') }
    ])

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    const monthlyLockCall = transaction.$queryRaw.mock.calls.findIndex(([query]) => sqlText(query).includes('"MonthlySettlementRecord"'))
    expect(monthlyLockCall).toBeGreaterThanOrEqual(0)
    expect(transaction.$queryRaw.mock.invocationCallOrder[monthlyLockCall])
      .toBeLessThan(transaction.monthlySettlementRecord.findMany.mock.invocationCallOrder[0])
    expect(transaction.monthlySettlementRecord.findMany).toHaveBeenCalledWith({
      where: { month: '2026-08', frontendUserId: 'front-1', customer: { in: ['旧客户', '新客户'] } },
      orderBy: { id: 'asc' }
    })
    expect(transaction.monthlySettlementRecord.updateMany).toHaveBeenCalledTimes(2)
    expect(transaction.monthlySettlementRecord.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'settle-old', status: { in: [MonthlySettlementStatus.PAID, MonthlySettlementStatus.PARTIAL] },
        updatedAt: new Date('2026-08-20T01:30:00.000Z')
      },
      data: { status: MonthlySettlementStatus.UNPAID, paidAmount: null, remark: '因历史样品修改审批，需按新汇总重新核对' }
    })
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementEffects: expect.arrayContaining([
        expect.objectContaining({ recordId: 'settle-old', oldStatus: MonthlySettlementStatus.PAID, oldPaidAmount: 80, oldRemark: '已结清', newStatus: MonthlySettlementStatus.UNPAID }),
        expect.objectContaining({ recordId: 'settle-new', oldStatus: MonthlySettlementStatus.PARTIAL })
      ]) })
    }))
    expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      frontendUserId: 'front-1', type: ReminderType.LAB_SAMPLE_CHANGE_APPROVED,
      sourceType: 'lab_sample_change_request', sourceId: 'request-1',
      content: expect.stringMatching(/旧客户.*2026-08.*新客户.*2026-08/)
    }) })
  })

  it('aborts approval when a locked monthly settlement CAS loses to a concurrent payment update', async () => {
    const oldInputs = {
      ...makeHistoricalBlock().inputs,
      customerText: '旧客户', paymentStatus: '月结款', price: 80
    }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { price: 100 }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([{
      id: 'settle-old', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户',
      status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清', updatedAt: new Date('2026-08-20T01:30:00.000Z')
    }])
    transaction.monthlySettlementRecord.updateMany.mockResolvedValue({ count: 0 })

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toBeInstanceOf(ConflictException)

    expect(transaction.labSampleChangeRequest.update).not.toHaveBeenCalled()
    expect(transaction.reminder.create).not.toHaveBeenCalled()
  })

  it('resets monthly settlement when the payer identity changes but its display name stays the same', async () => {
    const oldInputs = {
      ...makeHistoricalBlock().inputs,
      customerId: 'c-old', customerIds: ['c-old'], customers: [{ id: 'c-old', name: '同名客户' }],
      customerText: '同名客户', paymentStatus: '月结款', price: 80
    }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { payerCustomer: { customerIds: ['c-new'], customerText: '同名客户' } }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.customer.findMany.mockResolvedValue([
      { id: 'c-new', name: '同名客户', phone: null, wechat: null, wechatNickname: null }
    ])
    transaction.monthlySettlementRecord.findMany.mockResolvedValue([{
      id: 'settle-same-name', month: '2026-08', frontendUserId: 'front-1', customer: '同名客户',
      status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清', updatedAt: new Date('2026-08-20T01:30:00.000Z')
    }])

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    expect(transaction.monthlySettlementRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'settle-same-name' })
    }))
  })

  it.each([
    ['base timestamp', makeHistoricalBlock({ updatedAt: new Date('2026-08-20T00:00:00.000Z') })],
    ['source inputs', makeHistoricalBlock({ inputs: { ...makeHistoricalBlock().inputs, price: 81 } })],
    ['parameter snapshot', makeHistoricalBlock({ parameterSnapshot: { ...defaultLabParameters, ironFactor: 30 } })]
  ])('rolls back on %s conflict before any sample or settlement update', async (_kind, block) => {
    transaction.sampleBlock.findUnique.mockResolvedValue(block)

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toThrow('样品数据已变化')

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.monthlySettlementRecord.updateMany).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).not.toHaveBeenCalled()
  })

  it('locks and reloads sub-admin permission inside approval and rejects a missing permission before writes', async () => {
    await service.approveForAdmin(subAdmin, 'request-1', { reviewRemark: '授权审批' })
    const permissionLockCall = transaction.$queryRaw.mock.calls.findIndex(([query]) => {
      const text = sqlText(query)
      return text.includes('"SubAdminFrontendPermission"') && text.includes('FOR SHARE')
    })
    expect(permissionLockCall).toBeGreaterThanOrEqual(0)
    expect(adminAccess.getAllowedFrontendUserIds).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewRemark: '授权审批' })
    }))

    vi.clearAllMocks()
    transaction.$queryRaw.mockResolvedValue([])
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest())
    await expect(service.approveForAdmin(subAdmin, 'request-1', {})).rejects.toBeInstanceOf(ForbiddenException)
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('rejects a sub-admin rejection when its locked permission row is missing', async () => {
    transaction.$queryRaw.mockResolvedValue([])

    await expect(service.rejectForAdmin(subAdmin, 'request-1', { reviewRemark: '凭证不足' }))
      .rejects.toBeInstanceOf(ForbiddenException)

    expect(transaction.labSampleChangeRequest.update).not.toHaveBeenCalled()
    expect(transaction.reminder.create).not.toHaveBeenCalled()
  })

  it('holds the sub-admin permission share lock until approval commits before a concurrent revocation', async () => {
    const harness = makeStatefulApprovalHarness({ subPermission: true, holdPermissionShare: true })

    const approval = harness.service.approveForAdmin(subAdmin, 'request-1', {})
    const firstOutcome = await Promise.race([
      harness.permissionShareAcquired.then(() => 'permission-share-locked'),
      approval.then(() => 'approval-completed', () => 'approval-failed')
    ])

    expect(firstOutcome).toBe('permission-share-locked')
    let revocationCompleted = false
    const revocation = harness.revokePermission().then(() => { revocationCompleted = true })
    await Promise.resolve()
    expect(revocationCompleted).toBe(false)

    harness.continuePermissionShare()
    await approval
    await revocation

    expect(harness.state.request.status).toBe(LabSampleChangeRequestStatus.APPROVED)
    expect(harness.state.permission).toBe(false)
    expect(harness.events.indexOf('transaction-committed-1'))
      .toBeLessThan(harness.events.indexOf('permission-revoked'))
  })

  it('returns 409 for a terminal request', async () => {
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({ status: LabSampleChangeRequestStatus.REJECTED }))

    await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toBeInstanceOf(ConflictException)
    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  })

  it('serializes two concurrent approvals and commits side effects only once', async () => {
    const harness = makeStatefulApprovalHarness({ holdFirstRequestForConcurrency: true })

    const outcomes = await Promise.allSettled([
      harness.service.approveForAdmin(rootAdmin, 'request-1', {}),
      harness.service.approveForAdmin(rootAdmin, 'request-1', {})
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1)
    expect((outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult).reason)
      .toBeInstanceOf(ConflictException)
    expect(harness.counters.transactionsStarted).toBe(2)
    expect(harness.counters.requestLockWaits).toBe(1)
    expect(harness.counters.sampleUpdates).toBe(1)
    expect(harness.state.logs).toHaveLength(1)
    expect(harness.state.reminders).toHaveLength(1)
    expect(harness.state.request.status).toBe(LabSampleChangeRequestStatus.APPROVED)
  })

  it('rejects the whole request with a trimmed required reason and one transactional reminder', async () => {
    await expect(service.rejectForAdmin(rootAdmin, 'request-1', { remark: '  ' })).rejects.toBeInstanceOf(BadRequestException)

    const rejected = await service.rejectForAdmin(rootAdmin, 'request-1', { reviewRemark: '  原始凭证不足  ' })

    expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-1', status: LabSampleChangeRequestStatus.PENDING }),
      data: expect.objectContaining({ status: LabSampleChangeRequestStatus.REJECTED, reviewedById: 'admin-1', reviewRemark: '原始凭证不足' })
    }))
    expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: ReminderType.LAB_SAMPLE_CHANGE_REJECTED, sourceType: 'lab_sample_change_request', sourceId: 'request-1'
    }) })
    expect(rejected).toMatchObject({
      frontendUserId: 'front-1', requestedBy: requestedByIdentity, reviewedBy: reviewedByIdentity,
      status: LabSampleChangeRequestStatus.REJECTED
    })
    expect(transaction.labSampleChangeRequest.update.mock.calls[0][0].include).toEqual(adminIdentityInclude)
  })

  it('filters the admin list to AdminAccessService-authorized frontend accounts', async () => {
    prisma.labSampleChangeRequest.findMany.mockResolvedValue([makeAdminRequest()])

    adminAccess.parseFrontendUserIds.mockReturnValue(['front-1'])
    const rows = await service.listForAdmin(subAdmin, {
      frontendUserIds: ['front-1'], date: historicalDate, status: LabSampleChangeRequestStatus.PENDING
    })

    expect(adminAccess.parseFrontendUserIds).toHaveBeenCalledWith(['front-1'])
    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(prisma.labSampleChangeRequest.findMany).toHaveBeenCalledWith({
      where: { frontendUserId: { in: ['front-1'] }, date: historicalDate, status: LabSampleChangeRequestStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: adminIdentityInclude
    })
    expect(rows[0]).not.toHaveProperty('sourceSnapshot')
    expect(rows[0]).toMatchObject({
      id: 'request-1', blockId: 'block-1', frontendUserId: 'front-1',
      requestedBy: requestedByIdentity, reviewedBy: null
    })
  })

  it('returns authorized admin detail with snapshots and settlement effects', async () => {
    prisma.labSampleChangeRequest.findUnique.mockResolvedValue(makeAdminRequest({
      settlementEffects: [{ recordId: 'settle-1', oldStatus: MonthlySettlementStatus.PAID }]
    }))

    const detail = await service.getForAdmin(subAdmin, 'request-1')

    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1'])
    expect(prisma.labSampleChangeRequest.findUnique).toHaveBeenCalledWith({
      where: { id: 'request-1' }, include: adminIdentityInclude
    })
    expect(detail).toMatchObject({
      id: 'request-1', frontendUserId: 'front-1', sourceSnapshot: expect.any(Object), requestedChanges: expect.any(Object), previewResults: expect.any(Object),
      settlementEffects: [expect.objectContaining({ recordId: 'settle-1' })],
      requestedBy: requestedByIdentity, reviewedBy: null
    })
  })

  it.each([
    ['nonexistent', []],
    ['already unpaid', [{
      id: 'settle-unpaid', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户',
      status: MonthlySettlementStatus.UNPAID, paidAmount: null, remark: null, updatedAt: new Date('2026-08-20T01:30:00.000Z')
    }]]
  ])('does not reset %s monthly records', async (_kind, rows) => {
    const oldInputs = { ...makeHistoricalBlock().inputs, customerText: '旧客户', paymentStatus: '月结款', price: 80 }
    transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
      sourceSnapshot: { inputs: oldInputs, results: {}, parameterSnapshot: defaultLabParameters },
      requestedChanges: { price: 100 }
    }))
    transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ inputs: oldInputs }))
    transaction.monthlySettlementRecord.findMany.mockResolvedValue(rows)

    await service.approveForAdmin(rootAdmin, 'request-1', {})

    expect(transaction.monthlySettlementRecord.updateMany).not.toHaveBeenCalled()
    expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settlementEffects: [] })
    }))
  })

  it('restores sample, monthly settlement, request, logs, and reminders when a late reminder write fails', async () => {
    const harness = makeStatefulApprovalHarness({ monthly: true, failReminder: true })
    const before = structuredClone(harness.state)

    await expect(harness.service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toThrow('reminder write failed')

    expect(harness.state).toEqual(before)
    expect(harness.state.block.inputs.price).toBe(80)
    expect(harness.state.settlement).toMatchObject({ status: MonthlySettlementStatus.PAID, paidAmount: 80, remark: '已结清' })
    expect(harness.state.request).toMatchObject({ status: LabSampleChangeRequestStatus.PENDING, settlementEffects: null })
    expect(harness.state.logs).toEqual([])
    expect(harness.state.reminders).toEqual([])
    expect(harness.events).toContain('transaction-rolled-back-1')
  })
})
