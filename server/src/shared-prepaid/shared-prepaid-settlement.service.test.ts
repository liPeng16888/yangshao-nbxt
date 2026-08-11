import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  ValidationPipe
} from '@nestjs/common'
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA
} from '@nestjs/common/constants'
import {
  Prisma,
  SharedPrepaidPayableStatus,
  SharedPrepaidSettlementStatus,
  UserRole
} from '@prisma/client'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CurrentUser } from '../auth/current-user'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { SharedPrepaidController } from './shared-prepaid.controller'
import {
  SharedPrepaidIdempotencyHeadersDto,
  SharedPrepaidSettlementIdParamsDto,
  SharedPrepaidSettlementPaymentDto,
  SharedPrepaidSettlementRejectDto,
  SharedPrepaidSettlementSelectionDto
} from './shared-prepaid.dto'
import { SharedPrepaidSettlementService } from './shared-prepaid-settlement.service'

const fixedTime = new Date('2026-08-12T08:00:00.000Z')
const transferredAt = '2026-08-12T07:30:00.000Z'

const mainA: CurrentUser = {
  id: 'A',
  account: 'account-a',
  username: '主账号 A',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'A',
  permissionVersion: 1,
  permissions: [],
  requiresAccessGuardPassword: true,
  isFrontendMainAccount: true,
  isFrontendSubAccount: false
}

const mainB: CurrentUser = {
  ...mainA,
  id: 'B',
  account: 'account-b',
  username: '主账号 B',
  dataOwnerId: 'B'
}

const mainC: CurrentUser = {
  ...mainA,
  id: 'C',
  account: 'account-c',
  username: '主账号 C',
  dataOwnerId: 'C'
}

const subA: CurrentUser = {
  ...mainA,
  id: 'sub-a',
  account: 'sub-a',
  username: '子账号 A',
  role: UserRole.FRONTEND_SUB_USER,
  permissions: ['PREPAID_SETTLEMENTS'],
  isFrontendMainAccount: false,
  isFrontendSubAccount: true
}

interface StoredPayable {
  id: string
  consumptionId: string
  sourceOwnerId: string
  consumerOwnerId: string
  exactAmount: Prisma.Decimal
  amount: Prisma.Decimal
  status: SharedPrepaidPayableStatus
  reversalOfId: string | null
  createdAt: Date
  updatedAt: Date
}

interface StoredSettlement {
  id: string
  accountAId: string
  accountBId: string
  aToBAmount: Prisma.Decimal
  bToAAmount: Prisma.Decimal
  netAmount: Prisma.Decimal
  payerFrontendUserId: string | null
  receiverFrontendUserId: string | null
  status: SharedPrepaidSettlementStatus
  actualTransferredAt: Date | null
  proofUrls: unknown
  remark: string | null
  createdById: string
  paymentSubmittedById: string | null
  paymentSubmittedAt: Date | null
  receiptConfirmedById: string | null
  receiptConfirmedAt: Date | null
  rejectedById: string | null
  rejectedAt: Date | null
  rejectionReason: string | null
  cancelledById: string | null
  cancelledAt: Date | null
  version: number
  idempotencyKey: string
  createdAt: Date
  updatedAt: Date
}

interface StoredLine {
  id: string
  settlementId: string
  payableId: string
  direction: string
  amount: Prisma.Decimal
  releasedAt: Date | null
  createdAt: Date
}

interface StoredAction {
  id: string
  settlementId: string
  operation: string
  actorUserId: string
  actorFrontendUserId: string
  idempotencyKey: string
  requestFingerprint: string
  responseSnapshot: unknown
  createdAt: Date
}

class FakeSettlementPrisma {
  payables: StoredPayable[] = []
  settlements: StoredSettlement[] = []
  lines: StoredLine[] = []
  actions: StoredAction[] = []
  lockedPayableIds: string[] = []
  lockedSettlementIds: string[] = []
  failPayableUpdateId: string | null = null
  afterNextPayableLock: (() => Promise<void>) | null = null
  afterNextSettlementLock: (() => Promise<void>) | null = null
  p2002OnNextActiveLineCreate = false
  p2002AfterNextActionCreate: 'same-request' | 'different-request' | null = null
  private preserveNextRollback = false
  private nextId = 1

  readonly sharedPrepaidPayable: any = {}
  readonly sharedPrepaidSettlement: any = {}
  readonly sharedPrepaidSettlementLine: any = {}
  readonly sharedPrepaidSettlementAction: any = {}

  constructor() {
    this.sharedPrepaidPayable.findMany = async (args: any) => {
      let rows = [...this.payables]
      if (args.where?.id?.in) rows = rows.filter((row) => args.where.id.in.includes(row.id))
      if (args.where?.status) rows = rows.filter((row) => row.status === args.where.status)
      if (args.orderBy?.id === 'asc') rows.sort((left, right) => left.id.localeCompare(right.id))
      return rows.map((row) => ({
        ...row,
        settlementLines: args.include?.settlementLines
          ? this.lines.filter((line) => line.payableId === row.id && line.releasedAt === null)
          : undefined
      }))
    }
    this.sharedPrepaidPayable.updateMany = async (args: any) => {
      if (this.failPayableUpdateId === args.where.id) {
        this.failPayableUpdateId = null
        return { count: 0 }
      }
      const rows = this.payables.filter((row) => (
        row.id === args.where.id && (!args.where.status || row.status === args.where.status)
      ))
      rows.forEach((row) => Object.assign(row, args.data, { updatedAt: fixedTime }))
      return { count: rows.length }
    }

    this.sharedPrepaidSettlement.findUnique = async (args: any) => {
      const row = this.settlements.find((candidate) => (
        args.where.id ? candidate.id === args.where.id : candidate.idempotencyKey === args.where.idempotencyKey
      ))
      return row ? this.withLines(row) : null
    }
    this.sharedPrepaidSettlement.create = async (args: any) => {
      if (this.settlements.some((row) => row.idempotencyKey === args.data.idempotencyKey)) {
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
      }
      const row: StoredSettlement = {
        id: `settlement-${this.nextId++}`,
        actualTransferredAt: null,
        paymentSubmittedById: null,
        paymentSubmittedAt: null,
        receiptConfirmedById: null,
        receiptConfirmedAt: null,
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        cancelledById: null,
        cancelledAt: null,
        version: 1,
        createdAt: fixedTime,
        updatedAt: fixedTime,
        ...args.data
      }
      this.settlements.push(row)
      return this.withLines(row)
    }
    this.sharedPrepaidSettlement.updateMany = async (args: any) => {
      const rows = this.settlements.filter((row) => (
        row.id === args.where.id &&
        (!args.where.status || row.status === args.where.status) &&
        (args.where.version === undefined || row.version === args.where.version)
      ))
      rows.forEach((row) => {
        const data = { ...args.data }
        if (data.version?.increment) data.version = row.version + data.version.increment
        Object.assign(row, data, { updatedAt: fixedTime })
      })
      return { count: rows.length }
    }

    this.sharedPrepaidSettlementLine.createMany = async (args: any) => {
      if (this.p2002OnNextActiveLineCreate) {
        this.p2002OnNextActiveLineCreate = false
        throw {
          code: 'P2002',
          meta: { target: 'SharedPrepaidSettlementLine_one_active_per_payable' }
        }
      }
      for (const data of args.data) {
        if (this.lines.some((line) => line.payableId === data.payableId && line.releasedAt === null)) {
          throw { code: 'P2002', meta: { target: ['payableId'] } }
        }
        this.lines.push({
          id: `line-${this.nextId++}`,
          releasedAt: null,
          createdAt: fixedTime,
          ...data
        })
      }
      return { count: args.data.length }
    }
    this.sharedPrepaidSettlementLine.updateMany = async (args: any) => {
      const rows = this.lines.filter((line) => (
        line.settlementId === args.where.settlementId &&
        (args.where.releasedAt === undefined || line.releasedAt === args.where.releasedAt)
      ))
      rows.forEach((line) => Object.assign(line, args.data))
      return { count: rows.length }
    }

    this.sharedPrepaidSettlementAction.findUnique = async (args: any) => {
      const row = this.actions.find((candidate) => candidate.idempotencyKey === args.where.idempotencyKey)
      return row ? { ...row } : null
    }
    this.sharedPrepaidSettlementAction.create = async (args: any) => {
      if (this.actions.some((row) => row.idempotencyKey === args.data.idempotencyKey)) {
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] } }
      }
      const row: StoredAction = {
        id: `action-${this.nextId++}`,
        createdAt: fixedTime,
        ...args.data
      }
      this.actions.push(row)
      const injected = this.p2002AfterNextActionCreate
      this.p2002AfterNextActionCreate = null
      if (injected) {
        if (injected === 'different-request') row.requestFingerprint = 'different-concurrent-request'
        throw { code: 'P2002', meta: { target: ['idempotencyKey'] }, preserveState: true }
      }
      return { ...row }
    }
  }

  addPayable(
    id: string,
    sourceOwnerId: string,
    consumerOwnerId: string,
    amount: string | number,
    status = SharedPrepaidPayableStatus.PENDING
  ) {
    this.payables.push({
      id,
      consumptionId: `consumption-${id}`,
      sourceOwnerId,
      consumerOwnerId,
      exactAmount: new Prisma.Decimal(amount),
      amount: new Prisma.Decimal(amount),
      status,
      reversalOfId: null,
      createdAt: fixedTime,
      updatedAt: fixedTime
    })
  }

  async $transaction<T>(callback: (tx: FakeSettlementPrisma) => Promise<T>): Promise<T> {
    const snapshot = {
      payables: this.payables.map((row) => ({ ...row })),
      settlements: this.settlements.map((row) => ({ ...row })),
      lines: this.lines.map((row) => ({ ...row })),
      actions: this.actions.map((row) => ({ ...row })),
      lockedPayableIds: [...this.lockedPayableIds],
      lockedSettlementIds: [...this.lockedSettlementIds],
      nextId: this.nextId
    }
    try {
      return await callback(this)
    } catch (error) {
      const preserveState = Boolean(
        error && typeof error === 'object' && 'preserveState' in error && error.preserveState
      ) || this.preserveNextRollback
      this.preserveNextRollback = false
      if (preserveState) throw error
      this.payables = snapshot.payables
      this.settlements = snapshot.settlements
      this.lines = snapshot.lines
      this.actions = snapshot.actions
      this.lockedPayableIds = snapshot.lockedPayableIds
      this.lockedSettlementIds = snapshot.lockedSettlementIds
      this.nextId = snapshot.nextId
      throw error
    }
  }

  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    const sql = strings.join('?')
    if (sql.includes('SharedPrepaidPayable')) {
      this.lockedPayableIds.push(String(values[0]))
      const afterLock = this.afterNextPayableLock
      this.afterNextPayableLock = null
      if (afterLock) await afterLock()
    }
    if (sql.includes('SharedPrepaidSettlement')) {
      this.lockedSettlementIds.push(String(values[0]))
      const afterLock = this.afterNextSettlementLock
      this.afterNextSettlementLock = null
      if (afterLock) {
        await afterLock()
        this.preserveNextRollback = true
      }
    }
    return []
  }

  private withLines(row: StoredSettlement) {
    return {
      ...row,
      lines: this.lines
        .filter((line) => line.settlementId === row.id)
        .sort((left, right) => left.payableId.localeCompare(right.payableId))
        .map((line) => ({
          ...line,
          payable: this.payables.find((payable) => payable.id === line.payableId)
        }))
    }
  }
}

describe('SharedPrepaidSettlementService', () => {
  let prisma: FakeSettlementPrisma
  let service: SharedPrepaidSettlementService

  beforeEach(() => {
    prisma = new FakeSettlementPrisma()
    prisma.addPayable('a-to-b-100', 'A', 'B', 100)
    prisma.addPayable('b-to-a-60', 'B', 'A', 60)
    service = new SharedPrepaidSettlementService(prisma as never)
  })

  it('previews both gross directions, source lines, and the Decimal net without mutation', async () => {
    await expect(service.previewSettlement(mainA, ['a-to-b-100', 'b-to-a-60'])).resolves.toMatchObject({
      accountAId: 'A',
      accountBId: 'B',
      aToBAmount: 100,
      bToAAmount: 60,
      payerFrontendUserId: 'A',
      receiverFrontendUserId: 'B',
      netAmount: 40,
      lines: [
        { payableId: 'a-to-b-100', direction: 'A_TO_B', amount: 100 },
        { payableId: 'b-to-a-60', direction: 'B_TO_A', amount: 60 }
      ]
    })
    expect(prisma.payables.every((row) => row.status === SharedPrepaidPayableStatus.PENDING)).toBe(true)
    expect(prisma.settlements).toHaveLength(0)
  })

  it('lets an authorized subaccount preview for its owner but not create or perform money actions', async () => {
    await expect(service.previewSettlement(subA, ['a-to-b-100'])).resolves.toMatchObject({
      accountAId: 'A',
      payerFrontendUserId: 'A'
    })
    await expect(service.createSettlement(subA, ['a-to-b-100'], 'sub-create'))
      .rejects.toBeInstanceOf(ForbiddenException)

    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'main-create')
    await expect(service.submitPayment(subA, settlement.id, { actualTransferredAt: transferredAt }, 'sub-pay'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.confirmReceipt({ ...subA, dataOwnerId: 'B' }, settlement.id, 'sub-confirm'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.rejectSettlement({ ...subA, dataOwnerId: 'B' }, settlement.id, '未收到', 'sub-reject'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.cancelSettlement(subA, settlement.id, 'sub-cancel'))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it.each([
    ['duplicate payable IDs', ['a-to-b-100', 'a-to-b-100'], BadRequestException],
    ['missing payable', ['missing'], NotFoundException]
  ])('rejects %s', async (_label, ids, errorType) => {
    await expect(service.previewSettlement(mainA, ids)).rejects.toBeInstanceOf(errorType)
  })

  it('rejects a payable unrelated to the owner and more than one counterparty', async () => {
    prisma.addPayable('b-to-c-20', 'B', 'C', 20)
    prisma.addPayable('a-to-c-30', 'A', 'C', 30)

    await expect(service.previewSettlement(mainA, ['b-to-c-20']))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.previewSettlement(mainA, ['a-to-b-100', 'a-to-c-30']))
      .rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects already-held payables', async () => {
    prisma.payables[0]!.status = SharedPrepaidPayableStatus.HELD

    await expect(service.previewSettlement(mainA, ['a-to-b-100']))
      .rejects.toBeInstanceOf(ConflictException)
  })

  it('atomically freezes sorted payables, creates source lines, and returns an idempotent retry', async () => {
    const first = await service.createSettlement(
      mainA,
      ['b-to-a-60', 'a-to-b-100'],
      'create-settlement-1'
    )
    const retry = await service.createSettlement(
      mainA,
      ['a-to-b-100', 'b-to-a-60'],
      'create-settlement-1'
    )

    expect(first).toMatchObject({
      status: SharedPrepaidSettlementStatus.AWAITING_PAYMENT,
      aToBAmount: 100,
      bToAAmount: 60,
      netAmount: 40
    })
    expect(retry).toEqual(first)
    expect(prisma.lockedPayableIds).toEqual(['a-to-b-100', 'b-to-a-60'])
    expect(prisma.payables.map((row) => row.status)).toEqual([
      SharedPrepaidPayableStatus.HELD,
      SharedPrepaidPayableStatus.HELD
    ])
    expect(prisma.lines.map((line) => [line.payableId, line.direction])).toEqual([
      ['a-to-b-100', 'A_TO_B'],
      ['b-to-a-60', 'B_TO_A']
    ])
  })

  it('returns a matching concurrent idempotency winner that commits while the payable lock is pending', async () => {
    prisma.afterNextPayableLock = async () => {
      await service.createSettlement(mainA, ['a-to-b-100'], 'concurrent-create')
    }

    const result = await service.createSettlement(mainA, ['a-to-b-100'], 'concurrent-create')

    expect(result).toMatchObject({ id: 'settlement-1', idempotencyKey: 'concurrent-create' })
    expect(prisma.settlements).toHaveLength(1)
    expect(prisma.lines).toHaveLength(1)
  })

  it('rolls back the settlement and every freeze when one conditional freeze loses a race', async () => {
    prisma.failPayableUpdateId = 'b-to-a-60'

    await expect(service.createSettlement(
      mainA,
      ['a-to-b-100', 'b-to-a-60'],
      'atomic-freeze-failure'
    )).rejects.toBeInstanceOf(ConflictException)

    expect(prisma.settlements).toHaveLength(0)
    expect(prisma.lines).toHaveLength(0)
    expect(prisma.payables.every((row) => row.status === SharedPrepaidPayableStatus.PENDING)).toBe(true)
  })

  it('maps the active-line partial unique index race to a payable conflict and rolls back freezes', async () => {
    prisma.p2002OnNextActiveLineCreate = true

    await expect(service.createSettlement(
      mainA,
      ['a-to-b-100'],
      'active-line-index-race'
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_SETTLEMENT_PAYABLE_CONFLICT' })
    })
    expect(prisma.settlements).toHaveLength(0)
    expect(prisma.lines).toHaveLength(0)
    expect(prisma.payables[0]!.status).toBe(SharedPrepaidPayableStatus.PENDING)
  })

  it('requires the final payer main account and an actual transfer time while keeping proof optional', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'payment-source')

    await expect(service.submitPayment(mainB, settlement.id, { actualTransferredAt: transferredAt }, 'wrong-payer'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.submitPayment(mainA, settlement.id, {}, 'missing-time'))
      .rejects.toBeInstanceOf(BadRequestException)
    await expect(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: '2026-08-12T07:30:00' },
      'timezone-required'
    )).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: '2026-02-30T07:30:00.000Z' },
      'valid-calendar-date-required'
    )).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, proofUrls: ['proof://one'] },
      'invalid-proof-url'
    )).rejects.toBeInstanceOf(BadRequestException)

    const submitted = await service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, remark: '已转账' },
      'submit-payment'
    )
    expect(submitted).toMatchObject({
      status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT,
      paymentSubmittedById: 'A',
      proofUrls: [],
      remark: '已转账'
    })
    expect(submitted.actualTransferredAt).toEqual(new Date(transferredAt))
  })

  it('only lets the receiver confirm and completes every held payable exactly once', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'confirm-source')
    const submitted = await service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'confirm-payment'
    )

    await expect(service.confirmReceipt(mainA, settlement.id, 'wrong-receiver'))
      .rejects.toBeInstanceOf(ForbiddenException)
    const completed = await service.confirmReceipt(mainB, settlement.id, 'confirm-receipt')
    const retry = await service.confirmReceipt(mainB, settlement.id, 'confirm-receipt')
    const delayedPaymentRetry = await service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'confirm-payment'
    )

    expect(completed).toMatchObject({
      status: SharedPrepaidSettlementStatus.COMPLETED,
      receiptConfirmedById: 'B',
      proofUrls: ['/uploads/2026-08/proof.jpg']
    })
    expect(retry).toEqual(completed)
    expect(delayedPaymentRetry).toEqual(submitted)
    expect(prisma.actions).toMatchObject([
      {
        settlementId: settlement.id,
        operation: 'SUBMIT_PAYMENT',
        actorUserId: 'A',
        actorFrontendUserId: 'A',
        idempotencyKey: 'confirm-payment'
      },
      {
        settlementId: settlement.id,
        operation: 'CONFIRM_RECEIPT',
        actorUserId: 'B',
        actorFrontendUserId: 'B',
        idempotencyKey: 'confirm-receipt'
      }
    ])
    expect(prisma.payables[0]!.status).toBe(SharedPrepaidPayableStatus.COMPLETED)
  })

  it('requires the other main account to finish a zero-net settlement without transfer metadata', async () => {
    prisma.payables[1]!.amount = new Prisma.Decimal(100)
    prisma.payables[1]!.exactAmount = new Prisma.Decimal(100)
    const settlement = await service.createSettlement(
      mainA,
      ['a-to-b-100', 'b-to-a-60'],
      'zero-net'
    )

    expect(settlement).toMatchObject({
      status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT,
      netAmount: 0,
      payerFrontendUserId: null,
      receiverFrontendUserId: null,
      actualTransferredAt: null,
      createdById: 'A'
    })
    await expect(service.submitPayment(mainA, settlement.id, {}, 'zero-pay'))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.confirmReceipt(mainA, settlement.id, 'zero-self-confirm'))
      .rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.confirmReceipt(mainC, settlement.id, 'zero-third-confirm'))
      .rejects.toBeInstanceOf(ForbiddenException)

    await expect(service.confirmReceipt(mainB, settlement.id, 'zero-counterparty-confirm')).resolves.toMatchObject({
      status: SharedPrepaidSettlementStatus.COMPLETED,
      receiptConfirmedById: 'B',
      actualTransferredAt: null
    })
  })

  it('rejection retains its actor and reason while releasing all held lines and payables', async () => {
    const settlement = await service.createSettlement(
      mainA,
      ['a-to-b-100', 'b-to-a-60'],
      'reject-source'
    )
    await service.submitPayment(mainA, settlement.id, { actualTransferredAt: transferredAt }, 'reject-payment')

    const rejected = await service.rejectSettlement(mainB, settlement.id, '未收到转账', 'reject-receipt')
    const retry = await service.rejectSettlement(mainB, settlement.id, '未收到转账', 'reject-receipt')

    expect(rejected).toMatchObject({
      status: SharedPrepaidSettlementStatus.REJECTED,
      rejectedById: 'B',
      rejectionReason: '未收到转账'
    })
    expect(retry).toEqual(rejected)
    expect(prisma.actions.at(-1)).toMatchObject({
      operation: 'REJECT',
      idempotencyKey: 'reject-receipt',
      actorUserId: 'B',
      responseSnapshot: expect.any(Object)
    })
    expect(prisma.payables.every((row) => row.status === SharedPrepaidPayableStatus.PENDING)).toBe(true)
    expect(prisma.lines.every((line) => line.releasedAt instanceof Date)).toBe(true)
  })

  it('only lets the creating payer cancel before payment and releases its payables', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'cancel-source')

    await expect(service.cancelSettlement(mainB, settlement.id, 'wrong-canceller'))
      .rejects.toBeInstanceOf(ForbiddenException)
    const cancelled = await service.cancelSettlement(mainA, settlement.id, 'cancel-settlement')
    const retry = await service.cancelSettlement(mainA, settlement.id, 'cancel-settlement')

    expect(cancelled).toMatchObject({
      status: SharedPrepaidSettlementStatus.CANCELLED,
      cancelledById: 'A'
    })
    expect(retry).toEqual(cancelled)
    expect(prisma.actions.at(-1)).toMatchObject({
      operation: 'CANCEL',
      idempotencyKey: 'cancel-settlement',
      actorUserId: 'A',
      responseSnapshot: expect.any(Object)
    })
    expect(prisma.payables[0]!.status).toBe(SharedPrepaidPayableStatus.PENDING)
    expect(prisma.lines[0]!.releasedAt).toBeInstanceOf(Date)
  })

  it('keeps completed settlements and source rows immutable under later actions', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'immutable-source')
    await service.submitPayment(mainA, settlement.id, { actualTransferredAt: transferredAt }, 'immutable-payment')
    await service.confirmReceipt(mainB, settlement.id, 'immutable-confirm')
    const completed = await prisma.sharedPrepaidSettlement.findUnique({ where: { id: settlement.id } })

    await expect(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: '2026-08-12T07:31:00.000Z' },
      'late-payment'
    ))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.rejectSettlement(mainB, settlement.id, '重新驳回', 'late-reject'))
      .rejects.toBeInstanceOf(ConflictException)
    await expect(service.cancelSettlement(mainA, settlement.id, 'late-cancel'))
      .rejects.toBeInstanceOf(ConflictException)

    expect(await prisma.sharedPrepaidSettlement.findUnique({ where: { id: settlement.id } })).toEqual(completed)
    expect(prisma.payables[0]!.status).toBe(SharedPrepaidPayableStatus.COMPLETED)
    expect(prisma.lines[0]!.releasedAt).toBeNull()
  })

  it('conflicts when an action key is reused with a different payload, action, actor, or settlement', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'reuse-source-1')
    await service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'globally-reused-action-key'
    )

    const expectIdempotencyConflict = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_IDEMPOTENCY_CONFLICT' })
    })
    await expectIdempotencyConflict(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: '2026-08-12T07:31:00.000Z', proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'globally-reused-action-key'
    ))
    await expectIdempotencyConflict(service.confirmReceipt(
      mainB,
      settlement.id,
      'globally-reused-action-key'
    ))
    await expectIdempotencyConflict(service.submitPayment(
      mainB,
      settlement.id,
      { actualTransferredAt: transferredAt, proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'globally-reused-action-key'
    ))

    prisma.addPayable('a-to-b-20', 'A', 'B', 20)
    const second = await service.createSettlement(mainA, ['a-to-b-20'], 'reuse-source-2')
    await expectIdempotencyConflict(service.submitPayment(
      mainA,
      second.id,
      { actualTransferredAt: transferredAt, proofUrls: ['/uploads/2026-08/proof.jpg'] },
      'globally-reused-action-key'
    ))
  })

  it('recovers a matching action P2002 winner and rejects a different concurrent winner deterministically', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'p2002-source')
    prisma.p2002AfterNextActionCreate = 'same-request'

    const recovered = await service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt },
      'action-p2002-same'
    )

    expect(recovered).toMatchObject({ status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT })
    expect(prisma.actions).toHaveLength(1)
    expect(prisma.lockedSettlementIds).toContain(settlement.id)

    prisma.addPayable('a-to-b-20', 'A', 'B', 20)
    const second = await service.createSettlement(mainA, ['a-to-b-20'], 'p2002-source-2')
    prisma.p2002AfterNextActionCreate = 'different-request'
    await expect(service.submitPayment(
      mainA,
      second.id,
      { actualTransferredAt: transferredAt },
      'action-p2002-different'
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_IDEMPOTENCY_CONFLICT' })
    })
  })

  it('rechecks a reused action key after waiting for the settlement row lock', async () => {
    const settlement = await service.createSettlement(mainA, ['a-to-b-100'], 'lock-recheck-source')
    prisma.afterNextSettlementLock = async () => {
      await service.submitPayment(
        mainA,
        settlement.id,
        { actualTransferredAt: transferredAt, remark: '赛跑赢家' },
        'lock-recheck-action'
      )
    }

    await expect(service.submitPayment(
      mainA,
      settlement.id,
      { actualTransferredAt: transferredAt, remark: '赛跑输家' },
      'lock-recheck-action'
    )).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PREPAID_IDEMPOTENCY_CONFLICT' })
    })
    expect(prisma.actions).toHaveLength(1)
    expect(prisma.actions[0]).toMatchObject({ requestFingerprint: expect.any(String) })
  })
})

describe('shared prepaid settlement runtime DTOs', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })
  const payableId = '11111111-1111-4111-8111-111111111111'
  const settlementId = '22222222-2222-4222-8222-222222222222'

  async function transform(value: unknown, metatype: new () => object, type: 'body' | 'param' = 'body') {
    return pipe.transform(value, { type, metatype }) as Promise<Record<string, unknown>>
  }

  it('validates selection, payment, params, and idempotency headers while stripping unknown fields', async () => {
    const selection = await transform({ payableIds: [` ${payableId} `], ownerId: 'forged' }, SharedPrepaidSettlementSelectionDto)
    const payment = await transform({
      actualTransferredAt: '2026-08-12T07:30:00.000Z',
      proofUrls: ['/uploads/2026-08/proof.jpg', 'https://files.example.com/proof.png'],
      remark: ' 已转账 ',
      paymentSubmittedById: 'forged'
    }, SharedPrepaidSettlementPaymentDto)
    const params = await transform({ id: settlementId, accountAId: 'forged' }, SharedPrepaidSettlementIdParamsDto, 'param')
    const headers = await transform({
      'x-idempotency-key': ' action-key ',
      authorization: 'secret'
    }, SharedPrepaidIdempotencyHeadersDto)

    expect(selection).toEqual({ payableIds: [payableId] })
    expect(payment).toEqual({
      actualTransferredAt: '2026-08-12T07:30:00.000Z',
      proofUrls: ['/uploads/2026-08/proof.jpg', 'https://files.example.com/proof.png'],
      remark: '已转账'
    })
    expect(params).toEqual({ id: settlementId })
    expect(headers).toEqual({ 'x-idempotency-key': 'action-key' })
  })

  it.each([
    ['null selection', null, SharedPrepaidSettlementSelectionDto],
    ['string payable list', { payableIds: payableId }, SharedPrepaidSettlementSelectionDto],
    ['empty payable list', { payableIds: [] }, SharedPrepaidSettlementSelectionDto],
    ['duplicate payable IDs', { payableIds: [payableId, payableId] }, SharedPrepaidSettlementSelectionDto],
    ['malformed payable ID', { payableIds: ['payable-1'] }, SharedPrepaidSettlementSelectionDto],
    ['null payment', null, SharedPrepaidSettlementPaymentDto],
    ['missing transfer time', {}, SharedPrepaidSettlementPaymentDto],
    ['object transfer time', { actualTransferredAt: { value: transferredAt } }, SharedPrepaidSettlementPaymentDto],
    ['transfer time without timezone', { actualTransferredAt: '2026-08-12T07:30:00' }, SharedPrepaidSettlementPaymentDto],
    ['impossible transfer date', { actualTransferredAt: '2026-02-30T07:30:00.000Z' }, SharedPrepaidSettlementPaymentDto],
    ['proof scalar', { actualTransferredAt: transferredAt, proofUrls: '/uploads/proof.jpg' }, SharedPrepaidSettlementPaymentDto],
    ['unsupported proof scheme', { actualTransferredAt: transferredAt, proofUrls: ['proof://one'] }, SharedPrepaidSettlementPaymentDto],
    ['non-upload relative proof', { actualTransferredAt: transferredAt, proofUrls: ['/private/proof.jpg'] }, SharedPrepaidSettlementPaymentDto],
    ['upload traversal proof', { actualTransferredAt: transferredAt, proofUrls: ['/uploads/../secret.jpg'] }, SharedPrepaidSettlementPaymentDto],
    ['object payment remark', { actualTransferredAt: transferredAt, remark: { text: '备注' } }, SharedPrepaidSettlementPaymentDto],
    ['oversized payment remark', { actualTransferredAt: transferredAt, remark: 'x'.repeat(501) }, SharedPrepaidSettlementPaymentDto],
    ['null rejection', null, SharedPrepaidSettlementRejectDto],
    ['empty rejection', { reason: ' ' }, SharedPrepaidSettlementRejectDto],
    ['object rejection', { reason: { text: '原因' } }, SharedPrepaidSettlementRejectDto],
    ['oversized rejection', { reason: 'x'.repeat(501) }, SharedPrepaidSettlementRejectDto],
    ['malformed settlement param', { id: 'settlement-1' }, SharedPrepaidSettlementIdParamsDto],
    ['missing idempotency header', {}, SharedPrepaidIdempotencyHeadersDto],
    ['object idempotency header', { 'x-idempotency-key': { value: 'key' } }, SharedPrepaidIdempotencyHeadersDto],
    ['oversized idempotency header', { 'x-idempotency-key': 'x'.repeat(201) }, SharedPrepaidIdempotencyHeadersDto]
  ])('rejects %s', async (_label, value, metatype) => {
    await expect(transform(value, metatype)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('SharedPrepaidController settlement routes', () => {
  it('uses a runtime validation pipe for the idempotency header custom parameter', async () => {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      SharedPrepaidController,
      'createSettlement'
    ) as Record<string, { index: number, pipes: ValidationPipe[] }>
    const headerArgument = Object.entries(routeArguments).find(([key, value]) => (
      key.includes(CUSTOM_ROUTE_ARGS_METADATA) && value.index === 1
    ))?.[1]

    expect(headerArgument?.pipes).toHaveLength(1)
    await expect(headerArgument!.pipes[0]!.transform({}, {
      type: 'custom',
      metatype: SharedPrepaidIdempotencyHeadersDto
    })).rejects.toBeInstanceOf(BadRequestException)
    await expect(headerArgument!.pipes[0]!.transform({
      'x-idempotency-key': ' action-key ',
      authorization: 'secret'
    }, {
      type: 'custom',
      metatype: SharedPrepaidIdempotencyHeadersDto
    })).resolves.toEqual({ 'x-idempotency-key': 'action-key' })
  })

  it('exposes settlement write routes with settlement permission and trusted user context', async () => {
    const calls: unknown[][] = []
    const settlement = {
      previewSettlement: (...args: unknown[]) => { calls.push(['preview', ...args]) },
      createSettlement: (...args: unknown[]) => { calls.push(['create', ...args]) },
      submitPayment: (...args: unknown[]) => { calls.push(['payment', ...args]) },
      confirmReceipt: (...args: unknown[]) => { calls.push(['confirm', ...args]) },
      rejectSettlement: (...args: unknown[]) => { calls.push(['reject', ...args]) },
      cancelSettlement: (...args: unknown[]) => { calls.push(['cancel', ...args]) }
    }
    const controller = new SharedPrepaidController({} as never, {} as never, settlement as never)
    const createHeaders = { 'x-idempotency-key': 'create-key' }
    const payHeaders = { 'x-idempotency-key': 'pay-key' }
    const confirmHeaders = { 'x-idempotency-key': 'confirm-key' }
    const rejectHeaders = { 'x-idempotency-key': 'reject-key' }
    const cancelHeaders = { 'x-idempotency-key': 'cancel-key' }
    const params = { id: 's-1' }

    controller.previewSettlement(mainA, { payableIds: ['p-1'] })
    controller.createSettlement(mainA, createHeaders, { payableIds: ['p-1'] })
    controller.submitSettlementPayment(mainA, params, payHeaders, { actualTransferredAt: transferredAt })
    controller.confirmSettlementReceipt(mainB, params, confirmHeaders)
    controller.rejectSettlement(mainB, params, rejectHeaders, { reason: '未收到' })
    controller.cancelSettlement(mainA, params, cancelHeaders)

    expect(calls).toEqual([
      ['preview', mainA, ['p-1']],
      ['create', mainA, ['p-1'], 'create-key'],
      ['payment', mainA, 's-1', { actualTransferredAt: transferredAt }, 'pay-key'],
      ['confirm', mainB, 's-1', 'confirm-key'],
      ['reject', mainB, 's-1', '未收到', 'reject-key'],
      ['cancel', mainA, 's-1', 'cancel-key']
    ])

    const routes = [
      ['previewSettlement', 'settlements/preview'],
      ['createSettlement', 'settlements'],
      ['submitSettlementPayment', 'settlements/:id/payment'],
      ['confirmSettlementReceipt', 'settlements/:id/confirm'],
      ['rejectSettlement', 'settlements/:id/reject'],
      ['cancelSettlement', 'settlements/:id/cancel']
    ] as const
    for (const [method, path] of routes) {
      const handler = SharedPrepaidController.prototype[method]
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST)
      expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['PREPAID_SETTLEMENTS'])
    }
  })
})
