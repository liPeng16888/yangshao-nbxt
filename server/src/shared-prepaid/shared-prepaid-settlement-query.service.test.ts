import { BadRequestException, NotFoundException, RequestMethod, ValidationPipe } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Prisma, SharedPrepaidPayableStatus, SharedPrepaidSettlementStatus, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import type { CurrentUser } from '../auth/current-user'
import { SharedPrepaidController } from './shared-prepaid.controller'
import * as dto from './shared-prepaid.dto'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'

const mainA: CurrentUser = {
  id: 'front-1', account: 'owner-a', username: '主账号 A', role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [],
  requiresAccessGuardPassword: true, isFrontendMainAccount: true, isFrontendSubAccount: false
}

const subA: CurrentUser = {
  ...mainA,
  id: 'sub-1', account: 'sub-a', username: '子账号 A', role: UserRole.FRONTEND_SUB_USER,
  permissions: ['PREPAID_SETTLEMENTS'], isFrontendMainAccount: false, isFrontendSubAccount: true
}

const createdAt = new Date('2026-08-12T03:04:05.000Z')
const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
const actorA = { id: 'sub-1', account: 'sub-a', username: '子账号 A', displayRemark: null }

function payableDatabaseRow() {
  return {
    id: 'payable-1', consumptionId: 'consumption-1', sourceOwnerId: 'front-1', consumerOwnerId: 'front-2',
    exactAmount: new Prisma.Decimal('90.90909091'), amount: new Prisma.Decimal('90.9'),
    status: SharedPrepaidPayableStatus.HELD, reversalOfId: null, createdAt, updatedAt: createdAt,
    sourceOwner: accountA, consumerOwner: accountB,
    consumption: {
      id: 'consumption-1', memberId: 'member-1', phoneSnapshot: '13800000000',
      sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 3, elementsSnapshot: ['Au', 'Ag'],
      sheetDate: '2026-08-12', createdAt,
      allocations: [{
        id: 'allocation-1', sourceOwnerId: 'front-1', rechargeId: 'recharge-1',
        recharge: { id: 'recharge-1', rechargeDate: '2026-08-01', isOpeningBalance: false }
      }]
    },
    _count: { settlementLines: 1 },
    settlementLines: [{
      id: 'line-1', settlementId: 'settlement-1', direction: 'A_TO_B',
      amount: new Prisma.Decimal('90.9'), releasedAt: null, createdAt,
      settlement: { id: 'settlement-1', status: SharedPrepaidSettlementStatus.AWAITING_PAYMENT, createdAt }
    }]
  }
}

function settlementRechargeBatchRows(...payables: Array<{
  consumptionId: string
  sourceOwnerId: string
  consumption: {
    allocations: Array<{
      id: string
      sourceOwnerId: string
      recharge: { id: string; rechargeDate: string; isOpeningBalance: boolean }
    }>
  }
}>) {
  return payables.flatMap((payable) => payable.consumption.allocations
    .filter((allocation) => allocation.sourceOwnerId === payable.sourceOwnerId)
    .slice(0, 101)
    .map((allocation) => ({
      consumptionId: payable.consumptionId,
      sourceOwnerId: payable.sourceOwnerId,
      allocationId: allocation.id,
      rechargeId: allocation.recharge.id,
      rechargeDate: allocation.recharge.rechargeDate,
      isOpeningBalance: allocation.recharge.isOpeningBalance
    })))
}

function settlementDatabaseRow() {
  return {
    id: 'settlement-1', accountAId: 'front-1', accountBId: 'front-2',
    aToBAmount: new Prisma.Decimal('90.9'), bToAAmount: new Prisma.Decimal('40.4'),
    netAmount: new Prisma.Decimal('50.5'), payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2',
    status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT,
    actualTransferredAt: createdAt, proofUrls: ['/uploads/proof.jpg'], remark: '银行转账',
    createdById: 'front-1', paymentSubmittedById: 'sub-1', paymentSubmittedAt: createdAt,
    receiptConfirmedById: null, receiptConfirmedAt: null, rejectedById: null, rejectedAt: null,
    rejectionReason: null, cancelledById: null, cancelledAt: null, version: 2,
    idempotencyKey: 'secret-create-key', createdAt, updatedAt: createdAt,
    accountA, accountB, payerFrontendUser: accountA, receiverFrontendUser: accountB,
    createdBy: accountA, paymentSubmittedBy: actorA, receiptConfirmedBy: null,
    rejectedBy: null, cancelledBy: null,
    lines: [{
      id: 'line-1', settlementId: 'settlement-1', payableId: 'payable-1', direction: 'A_TO_B',
      amount: new Prisma.Decimal('90.9'), releasedAt: null, createdAt,
      payable: payableDatabaseRow()
    }],
    actions: [{
      id: 'action-1', settlementId: 'settlement-1', operation: 'SUBMIT_PAYMENT',
      actorUserId: 'sub-1', actorFrontendUserId: 'front-1', idempotencyKey: 'secret-action-key',
      requestFingerprint: 'secret-fingerprint', responseSnapshot: { private: true }, createdAt,
      actorUser: actorA, actorFrontendUser: accountA
    }]
  }
}

describe('SharedPrepaidQueryService settlement reads', () => {
  it('scopes gross payable lines to the current owner and returns safe source context plus associations', async () => {
    const row = payableDatabaseRow()
    const findMany = vi.fn().mockResolvedValue([row])
    const count = vi.fn().mockResolvedValue(1)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: { findMany, count },
      $queryRaw: vi.fn().mockResolvedValue(settlementRechargeBatchRows(row))
    } as never)

    const result = await (service as unknown as {
      listSettlementPayables: (user: CurrentUser, query: Record<string, unknown>) => Promise<any>
    }).listSettlementPayables(subA, {
      page: 2, pageSize: 10, counterpartyFrontendUserId: 'front-2', direction: 'OUTGOING',
      status: 'HELD', phone: '138 0000', startDate: '2026-08-01', endDate: '2026-08-31'
    })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: SharedPrepaidPayableStatus.HELD,
        sourceOwnerId: 'front-1',
        consumerOwnerId: 'front-2',
        consumption: {
          phoneSnapshot: { contains: '1380000' },
          sheetDate: { gte: '2026-08-01', lte: '2026-08-31' }
        }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 10, take: 10
    }))
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10 })
    expect(result.items[0]).toMatchObject({
      id: 'payable-1', exactAmount: 90.90909091, amount: 90.9, status: 'HELD', eligible: false,
      direction: 'OUTGOING', counterpartyFrontendUserId: 'front-2',
      consumption: {
        memberId: 'member-1', phoneSnapshot: '13800000000', sampleCountSnapshot: 3,
        elementsSnapshot: ['Au', 'Ag'], rechargeBatches: [{ id: 'recharge-1', rechargeDate: '2026-08-01' }]
      },
      settlementAssociations: [{ settlementId: 'settlement-1', status: 'AWAITING_PAYMENT' }]
    })
    expect(result.items[0]).not.toHaveProperty('idempotencyKey')
    expect(result.items[0].consumption).not.toHaveProperty('sheetId')
  })

  it('lists and reads only participating settlements with complete public audit detail', async () => {
    const row = settlementDatabaseRow()
    const findMany = vi.fn().mockResolvedValue([row])
    const count = vi.fn().mockResolvedValue(1)
    const findFirst = vi.fn().mockResolvedValue(row)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidSettlement: { findMany, count, findFirst },
      $queryRaw: vi.fn().mockResolvedValue(settlementRechargeBatchRows(row.lines[0]!.payable))
    } as never)
    const api = service as unknown as {
      listSettlements: (user: CurrentUser, query: Record<string, unknown>) => Promise<any>
      getSettlementDetail: (user: CurrentUser, id: string) => Promise<any>
    }

    const result = await api.listSettlements(subA, {
      page: 1, pageSize: 20, counterpartyFrontendUserId: 'front-2',
      status: 'AWAITING_RECEIPT', startDate: '2026-08-01', endDate: '2026-08-31'
    })
    const detail = await api.getSettlementDetail(subA, 'settlement-1')

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ accountAId: 'front-1' }, { accountBId: 'front-1' }],
        AND: [{ OR: [{ accountAId: 'front-2' }, { accountBId: 'front-2' }] }],
        status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT,
        createdAt: { gte: new Date('2026-08-01T00:00:00.000+08:00'), lte: new Date('2026-08-31T23:59:59.999+08:00') }
      }
    }))
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'settlement-1', OR: [{ accountAId: 'front-1' }, { accountBId: 'front-1' }] }
    }))
    expect(result.items[0]).toMatchObject({
      id: 'settlement-1', aToBAmount: 90.9, bToAAmount: 40.4, grossAmount: 131.3, netAmount: 50.5,
      status: 'AWAITING_RECEIPT', accountA, accountB, createdAt
    })
    expect(result.items[0]).not.toHaveProperty('proofUrls')
    expect(result.items[0]).not.toHaveProperty('lines')
    expect(result.items[0]).not.toHaveProperty('actions')
    const listSelect = findMany.mock.calls[0]?.[0]?.select as Record<string, unknown>
    expect(listSelect).not.toHaveProperty('proofUrls')
    expect(listSelect).not.toHaveProperty('lines')
    expect(listSelect).not.toHaveProperty('actions')
    expect(detail).toMatchObject({
      id: 'settlement-1', aToBAmount: 90.9, bToAAmount: 40.4, grossAmount: 131.3, netAmount: 50.5,
      createdBy: accountA, paymentSubmittedBy: actorA,
      lines: [{ amount: 90.9, payable: { consumption: { phoneSnapshot: '13800000000' } } }],
      actions: [{ operation: 'SUBMIT_PAYMENT', actorUser: actorA, actorFrontendUser: accountA, createdAt }]
    })
    expect(detail).not.toHaveProperty('idempotencyKey')
    expect(detail.actions[0]).not.toHaveProperty('idempotencyKey')
    expect(detail.actions[0]).not.toHaveProperty('requestFingerprint')
    expect(detail.actions[0]).not.toHaveProperty('responseSnapshot')
  })

  it('returns not found instead of revealing a non-participating settlement', async () => {
    const service = new SharedPrepaidQueryService({
      sharedPrepaidSettlement: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never)

    await expect((service as unknown as {
      getSettlementDetail: (user: CurrentUser, id: string) => Promise<unknown>
    }).getSettlementDetail(subA, 'settlement-outside-tenant')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('can re-read only selected payable IDs after a create conflict', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(0)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: { findMany, count }
    } as never)
    const payableIds = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002'
    ]

    await (service as unknown as {
      listSettlementPayables: (user: CurrentUser, query: Record<string, unknown>) => Promise<unknown>
    }).listSettlementPayables(subA, { payableIds })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: payableIds },
        OR: [{ sourceOwnerId: 'front-1' }, { consumerOwnerId: 'front-1' }]
      }
    }))
  })

  it('treats a pending payable with only released settlement lines as eligible again', async () => {
    const original = payableDatabaseRow()
    const row = {
      ...original,
      status: SharedPrepaidPayableStatus.PENDING,
      _count: { settlementLines: 0 },
      settlementLines: original.settlementLines.map((line) => ({ ...line, releasedAt: createdAt }))
    }
    const findMany = vi.fn().mockResolvedValue([row])
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: { findMany, count: vi.fn().mockResolvedValue(1) },
      $queryRaw: vi.fn().mockResolvedValue(settlementRechargeBatchRows(row))
    } as never)

    const result = await service.listSettlementPayables(subA, { eligibleOnly: true })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: SharedPrepaidPayableStatus.PENDING,
        settlementLines: { none: { releasedAt: null } }
      })
    }))
    expect(result.items[0]).toMatchObject({ eligible: true, settlementAssociations: [
      expect.objectContaining({ releasedAt: createdAt })
    ] })
  })

  it('caps each payable nested projection independently and reports truncation in list and detail reads', async () => {
    const first = payableDatabaseRow()
    first.id = 'payable-first'
    first.consumption.id = 'consumption-first'
    first.consumptionId = 'consumption-first'
    first.consumption.allocations = Array.from({ length: 101 }, (_, index) => ({
      id: `allocation-first-${String(index).padStart(3, '0')}`,
      sourceOwnerId: 'front-1',
      rechargeId: `recharge-first-${index}`,
      recharge: {
        id: `recharge-first-${index}`,
        rechargeDate: '2026-08-01',
        isOpeningBalance: false
      }
    }))
    first.settlementLines = Array.from({ length: 101 }, (_, index) => ({
      id: `line-first-${String(index).padStart(3, '0')}`,
      settlementId: `settlement-first-${index}`,
      direction: 'A_TO_B' as const,
      amount: new Prisma.Decimal('0.1'),
      releasedAt: null,
      createdAt,
      settlement: {
        id: `settlement-first-${index}`,
        status: SharedPrepaidSettlementStatus.AWAITING_PAYMENT,
        createdAt
      }
    }))
    first._count = { settlementLines: 0 }

    const second = payableDatabaseRow()
    second.id = 'payable-second'
    second.consumption.id = 'consumption-second'
    second.consumptionId = 'consumption-second'
    second.consumption.allocations[0] = {
      ...second.consumption.allocations[0]!,
      id: 'allocation-second',
      rechargeId: 'recharge-second',
      recharge: { id: 'recharge-second', rechargeDate: '2026-08-02', isOpeningBalance: false }
    }
    second.settlementLines[0] = {
      ...second.settlementLines[0]!,
      id: 'line-second',
      settlementId: 'settlement-second',
      settlement: {
        id: 'settlement-second', status: SharedPrepaidSettlementStatus.AWAITING_PAYMENT, createdAt
      }
    }

    const payableFindMany = vi.fn().mockResolvedValue([first, second])
    const detailRow = settlementDatabaseRow()
    detailRow.lines[0]!.payable = first
    const settlementFindFirst = vi.fn().mockResolvedValue(detailRow)
    const allocationQuery = vi.fn().mockResolvedValue(settlementRechargeBatchRows(first, second))
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: { findMany: payableFindMany, count: vi.fn().mockResolvedValue(2) },
      sharedPrepaidSettlement: { findFirst: settlementFindFirst },
      $queryRaw: allocationQuery
    } as never)

    const page = await service.listSettlementPayables(subA, {})
    const detail = await service.getSettlementDetail(subA, 'settlement-1')

    const payableSelect = payableFindMany.mock.calls[0]?.[0]?.select
    expect(payableSelect.consumption.select.allocations).toBeUndefined()
    expect(payableSelect.settlementLines.take).toBe(101)
    expect(page.items[0]).toMatchObject({
      relationLimit: 100,
      relationTruncated: { settlementAssociations: true },
      consumption: {
        relationLimit: 100,
        relationTruncated: { allocations: true }
      }
    })
    expect(page.items[0]?.settlementAssociations).toHaveLength(100)
    expect(page.items[0]?.consumption.rechargeBatches).toHaveLength(100)
    expect(page.items[1]).toMatchObject({
      relationTruncated: { settlementAssociations: false },
      consumption: { relationTruncated: { allocations: false } }
    })
    expect(page.items[1]?.settlementAssociations).toHaveLength(1)
    expect(page.items[1]?.consumption.rechargeBatches).toHaveLength(1)

    const detailSelect = settlementFindFirst.mock.calls[0]?.[0]?.select
    expect(detailSelect.lines.select.payable.select.consumption.select.allocations).toBeUndefined()
    expect(allocationQuery).toHaveBeenCalledTimes(2)
    expect(detail.lines[0]?.payable.consumption).toMatchObject({
      relationLimit: 100,
      relationTruncated: { allocations: true }
    })
    expect(detail.lines[0]?.payable.consumption.rechargeBatches).toHaveLength(100)
  })

  it('partitions recharge batches by consumption and source owner before applying the 101-row cap', async () => {
    const accountAFirst101 = Array.from({ length: 101 }, (_, index) => ({
      id: `allocation-a-${String(index).padStart(3, '0')}`,
      sourceOwnerId: 'front-1',
      rechargeId: `recharge-a-${index}`,
      recharge: { id: `recharge-a-${index}`, rechargeDate: '2026-08-01', isOpeningBalance: false }
    }))
    const outgoing = payableDatabaseRow()
    outgoing.id = 'payable-a'
    outgoing.consumptionId = 'shared-consumption'
    outgoing.consumption.id = 'shared-consumption'
    outgoing.consumption.allocations = accountAFirst101
    const incoming = payableDatabaseRow()
    incoming.id = 'payable-b'
    incoming.consumptionId = 'shared-consumption'
    incoming.sourceOwnerId = 'front-2'
    incoming.consumerOwnerId = 'front-1'
    incoming.consumption = { ...outgoing.consumption, allocations: accountAFirst101 }
    const allocationRows = [
      ...Array.from({ length: 101 }, (_, index) => ({
        consumptionId: 'shared-consumption', sourceOwnerId: 'front-1',
        allocationId: `allocation-a-${String(index).padStart(3, '0')}`,
        rechargeId: `recharge-a-${index}`, rechargeDate: '2026-08-01',
        isOpeningBalance: false, allocationCreatedAt: createdAt
      })),
      {
        consumptionId: 'shared-consumption', sourceOwnerId: 'front-2',
        allocationId: 'allocation-b-000', rechargeId: 'recharge-b-0',
        rechargeDate: '2026-08-02', isOpeningBalance: false, allocationCreatedAt: createdAt
      }
    ]
    const allocationQuery = vi.fn().mockResolvedValue(allocationRows)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: {
        findMany: vi.fn().mockResolvedValue([outgoing, incoming]),
        count: vi.fn().mockResolvedValue(2)
      },
      $queryRaw: allocationQuery
    } as never)

    const page = await service.listSettlementPayables(subA, {})

    expect(page.items[0]?.consumption).toMatchObject({
      relationTruncated: { allocations: true },
      rechargeBatches: expect.arrayContaining([{ id: 'recharge-a-0', rechargeDate: '2026-08-01', isOpeningBalance: false }])
    })
    expect(page.items[0]?.consumption.rechargeBatches).toHaveLength(100)
    expect(page.items[1]?.consumption).toMatchObject({
      relationTruncated: { allocations: false },
      rechargeBatches: [{ id: 'recharge-b-0', rechargeDate: '2026-08-02', isOpeningBalance: false }]
    })
    expect(allocationQuery).toHaveBeenCalledTimes(1)
    const query = allocationQuery.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] }
    expect(query.strings.join('?')).toMatch(/ROW_NUMBER\(\) OVER \([\s\S]*PARTITION BY allocation\."consumptionId", allocation\."sourceOwnerId"/)
    expect(query.values).toEqual([
      'shared-consumption', 'front-1',
      'shared-consumption', 'front-2',
      101
    ])
  })

  it('returns an impossible query instead of broadening a self-counterparty filter', async () => {
    const payableFindMany = vi.fn().mockResolvedValue([])
    const settlementFindMany = vi.fn().mockResolvedValue([])
    const service = new SharedPrepaidQueryService({
      sharedPrepaidPayable: { findMany: payableFindMany, count: vi.fn().mockResolvedValue(0) },
      sharedPrepaidSettlement: { findMany: settlementFindMany, count: vi.fn().mockResolvedValue(0) }
    } as never)

    await service.listSettlementPayables(subA, { counterpartyFrontendUserId: subA.dataOwnerId })
    await service.listSettlements(subA, { counterpartyFrontendUserId: subA.dataOwnerId })

    expect(payableFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) }))
    expect(settlementFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [] } }) }))
  })
})

describe('Shared prepaid settlement read routes and DTOs', () => {
  it('binds payable/list/detail reads to PREPAID_SETTLEMENTS and trusted current-user scope', async () => {
    const queryService = {
      listSettlementPayables: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listSettlements: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      getSettlementDetail: vi.fn().mockResolvedValue({ id: 'settlement-1' })
    }
    const controller = new SharedPrepaidController({} as never, queryService as never, {} as never)
    const instance = controller as unknown as Record<string, (...args: any[]) => unknown>

    await instance.listSettlementPayables(subA, { status: 'PENDING' })
    await instance.listSettlements(subA, { status: 'COMPLETED' })
    await instance.getSettlementDetail(subA, { id: 'settlement-1' })

    expect(queryService.listSettlementPayables).toHaveBeenCalledWith(subA, { status: 'PENDING' })
    expect(queryService.listSettlements).toHaveBeenCalledWith(subA, { status: 'COMPLETED' })
    expect(queryService.getSettlementDetail).toHaveBeenCalledWith(subA, 'settlement-1')
    for (const [method, path] of [
      ['listSettlementPayables', 'settlements/payables'],
      ['listSettlements', 'settlements'],
      ['getSettlementDetail', 'settlements/:id']
    ] as const) {
      const handler = (SharedPrepaidController.prototype as unknown as Record<string, object>)[method]!
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)
      expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['PREPAID_SETTLEMENTS'])
    }
  })

  it('validates settlement read filters at runtime', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })
    const payableType = (dto as Record<string, any>).SharedPrepaidSettlementPayableQueryDto
    const settlementType = (dto as Record<string, any>).SharedPrepaidSettlementQueryDto

    await expect(pipe.transform({ page: '2', pageSize: '10', status: 'PENDING', direction: 'OUTGOING' }, {
      type: 'query', metatype: payableType
    })).resolves.toMatchObject({ page: 2, pageSize: 10, status: 'PENDING', direction: 'OUTGOING' })
    await expect(pipe.transform({
      payableIds: '00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002'
    }, {
      type: 'query', metatype: payableType
    })).resolves.toMatchObject({ payableIds: [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002'
    ] })
    await expect(pipe.transform({ status: 'NOT_A_STATUS' }, {
      type: 'query', metatype: settlementType
    })).rejects.toBeInstanceOf(BadRequestException)
    await expect(pipe.transform({ counterpartyFrontendUserId: 'not-a-uuid' }, {
      type: 'query', metatype: payableType
    })).rejects.toBeInstanceOf(BadRequestException)
  })
})
