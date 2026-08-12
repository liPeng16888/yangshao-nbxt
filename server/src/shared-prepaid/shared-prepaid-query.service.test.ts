import { ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import { Prisma, SharedPrepaidConsumptionKind, SharedPrepaidPayableStatus, UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { FrontendPermissionGuard } from '../auth/frontend-permission.guard'
import { SharedPrepaidController } from './shared-prepaid.controller'
import { SharedPrepaidQueryService } from './shared-prepaid-query.service'

describe('SharedPrepaidQueryService consumption list', () => {
  it('applies normalized global filters, stable pagination, and returns full allocation detail', async () => {
    const createdAt = new Date('2026-08-12T03:04:05.000Z')
    const row = {
      id: 'consumption-1',
      memberId: 'member-1',
      consumingFrontendUserId: 'front-2',
      actorUserId: 'sub-2',
      kind: SharedPrepaidConsumptionKind.CONSUMPTION,
      amount: new Prisma.Decimal(100),
      sheetId: 'sheet-1',
      sampleBlockId: 'block-1',
      sampleIndex: 0,
      sampleNumberSnapshot: 'A-001',
      sampleCountSnapshot: 3,
      elementsSnapshot: ['Au', 'Ag'],
      phoneSnapshot: '13800000000',
      sheetDate: '2026-08-12',
      active: true,
      reversalOfId: null,
      idempotencyKey: 'consume-1',
      createdAt,
      member: { id: 'member-1', phone: '13800000000' },
      consumingFrontendUser: { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null },
      actorUser: { id: 'sub-2', account: 'sub-b', username: '子账号 B', displayRemark: null },
      allocations: [{
        id: 'allocation-1', consumptionId: 'consumption-1', rechargeId: 'recharge-1',
        sourceOwnerId: 'front-1', allocatedAmount: new Prisma.Decimal(100),
        paidRatio: new Prisma.Decimal('0.9090909091'), exactTransferAmount: new Prisma.Decimal('90.90909091'),
        createdAt, sourceOwner: { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null },
        recharge: {
          id: 'recharge-1', memberId: 'member-1', ownerFrontendUserId: 'front-1', actorUserId: 'front-1',
          rechargeDate: '2026-08-01', paidAmount: new Prisma.Decimal(1000), giftAmount: new Prisma.Decimal(100),
          totalAmount: new Prisma.Decimal(1100), remainingAmount: new Prisma.Decimal(1000),
          isOpeningBalance: false, remark: null, idempotencyKey: 'recharge-1', reversedAt: null,
          reversedByLedgerId: null, createdAt, updatedAt: createdAt
        }
      }],
      payables: [{
        id: 'payable-1', consumptionId: 'consumption-1', sourceOwnerId: 'front-1', consumerOwnerId: 'front-2',
        exactAmount: new Prisma.Decimal('90.90909091'), amount: new Prisma.Decimal('90.9'),
        status: SharedPrepaidPayableStatus.COMPLETED, reversalOfId: null, createdAt, updatedAt: createdAt,
        sourceOwner: { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null },
        consumerOwner: { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
      }]
    }
    const findMany = vi.fn().mockResolvedValue([row])
    const count = vi.fn().mockResolvedValue(1)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidConsumption: { findMany, count }
    } as never)

    const result = await service.listConsumptions({
      page: 2,
      pageSize: 10,
      phone: '138 0000-0000',
      sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'ACTIVE',
      payableStatus: 'COMPLETED'
    })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        member: { phone: { contains: '13800000000' } },
        consumingFrontendUserId: 'front-2',
        sheetDate: { gte: '2026-08-01', lte: '2026-08-31' },
        kind: SharedPrepaidConsumptionKind.CONSUMPTION,
        active: true,
        AND: [
          { OR: [
            { allocations: { some: { sourceOwnerId: 'front-1' } } },
            { reversalOf: { allocations: { some: { sourceOwnerId: 'front-1' } } } }
          ] },
          { OR: [
            { payables: { some: { status: SharedPrepaidPayableStatus.COMPLETED } } },
            { reversalOf: { payables: { some: { status: SharedPrepaidPayableStatus.COMPLETED } } } }
          ] }
        ]
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10
    }))
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10 })
    expect(result.items[0]).toMatchObject({
      phoneSnapshot: '13800000000',
      sampleCountSnapshot: 3,
      createdAt,
      allocations: [{ allocatedAmount: 100, paidRatio: 0.9090909091, exactTransferAmount: 90.90909091 }],
      payables: [{ exactAmount: 90.90909091, amount: 90.9, status: SharedPrepaidPayableStatus.COMPLETED }]
    })
    const publicItem = result.items[0] as { allocations: Array<{ recharge: Record<string, unknown> }> }
    expect(publicItem).not.toHaveProperty('member')
    expect(publicItem).not.toHaveProperty('idempotencyKey')
    expect(publicItem.allocations[0].recharge).not.toHaveProperty('idempotencyKey')
    expect(publicItem.allocations[0].recharge).not.toHaveProperty('remark')
  })

  it('exposes consumption reads only under the consumption leaf permission', async () => {
    const queryService = {
      listConsumptions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listConsumptionFilterOptions: vi.fn().mockResolvedValue({ sourceOwners: [], consumingOwners: [] })
    }
    const controller = new SharedPrepaidController({} as never, queryService as never, {} as never)
    const query = { phone: '138' }

    await controller.listConsumptions(query as never)
    const filterHandler = (SharedPrepaidController.prototype as unknown as {
      listConsumptionFilterOptions: () => unknown
    }).listConsumptionFilterOptions
    expect(typeof filterHandler).toBe('function')
    await (controller as unknown as { listConsumptionFilterOptions: () => unknown }).listConsumptionFilterOptions()

    const handler = SharedPrepaidController.prototype.listConsumptions
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('consumptions')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['PREPAID_CONSUMPTIONS'])
    expect(queryService.listConsumptions).toHaveBeenCalledWith(query)
    expect(Reflect.getMetadata(PATH_METADATA, filterHandler)).toBe('consumptions/filter-options')
    expect(Reflect.getMetadata(METHOD_METADATA, filterHandler)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, filterHandler)).toEqual(['PREPAID_CONSUMPTIONS'])
    expect(queryService.listConsumptionFilterOptions).toHaveBeenCalledOnce()
  })

  it('exposes a dedicated minimal lab lookup to DATA_MAIN only', async () => {
    const queryService = {
      getLabMemberByPhone: vi.fn().mockResolvedValue({
        id: 'member-1',
        phone: '13800000000',
        currentBalance: 100
      })
    }
    const controller = new SharedPrepaidController({} as never, queryService as never, {} as never)
    const handler = (SharedPrepaidController.prototype as unknown as {
      lookupLabMember: (phone: string) => unknown
    }).lookupLabMember
    const lookupLabMember = (controller as unknown as {
      lookupLabMember: (phone: string) => Promise<unknown>
    }).lookupLabMember.bind(controller)

    const result = await lookupLabMember('138 0000-0000')

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('lab-members/lookup')
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['DATA_MAIN'])
    expect(queryService.getLabMemberByPhone).toHaveBeenCalledWith('138 0000-0000')
    expect(result).toEqual({ id: 'member-1', phone: '13800000000', currentBalance: 100 })
    expect(Object.keys(result as object).sort()).toEqual(['currentBalance', 'id', 'phone'])

    const guard = new FrontendPermissionGuard(new Reflector())
    const contextFor = (permissions: string[]) => ({
      getHandler: () => handler,
      getClass: () => SharedPrepaidController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'sub-1',
            role: UserRole.FRONTEND_SUB_USER,
            permissions
          }
        })
      })
    })
    expect(guard.canActivate(contextFor(['DATA_MAIN']) as never)).toBe(true)
    expect(() => guard.canActivate(contextFor(['PREPAID_CUSTOMERS']) as never)).toThrow(ForbiddenException)

    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, SharedPrepaidController.prototype.lookupMember))
      .toEqual(['PREPAID_CUSTOMERS'])
  })

  it('normalizes the lab phone and selects no member fields beyond the picker contract', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'member-1',
      phone: '13800000000',
      cachedBalance: new Prisma.Decimal('12.34')
    })
    const service = new SharedPrepaidQueryService({
      sharedPrepaidMember: { findUnique }
    } as never)

    const result = await service.getLabMemberByPhone('138 0000-0000')

    expect(findUnique).toHaveBeenCalledWith({
      where: { phone: '13800000000' },
      select: { id: true, phone: true, cachedBalance: true }
    })
    expect(result).toEqual({ id: 'member-1', phone: '13800000000', currentBalance: 12.34 })
  })

  it('matches reversed rows through their original allocation and projects original detail without double counting', async () => {
    const createdAt = new Date('2026-08-13T03:04:05.000Z')
    const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
    const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
    const recharge = {
      id: 'recharge-1', ownerFrontendUserId: 'front-1', rechargeDate: '2026-08-01',
      paidAmount: new Prisma.Decimal(1000), giftAmount: new Prisma.Decimal(100),
      totalAmount: new Prisma.Decimal(1100), remainingAmount: new Prisma.Decimal(1100),
      isOpeningBalance: false, reversedAt: null, createdAt
    }
    const originalAllocation = {
      id: 'allocation-1', consumptionId: 'consumption-1', rechargeId: 'recharge-1', sourceOwnerId: 'front-1',
      allocatedAmount: new Prisma.Decimal(100), paidRatio: new Prisma.Decimal('0.9090909091'),
      exactTransferAmount: new Prisma.Decimal('90.90909091'), createdAt, recharge, sourceOwner: accountA
    }
    const originalPayable = {
      id: 'payable-1', consumptionId: 'consumption-1', sourceOwnerId: 'front-1', consumerOwnerId: 'front-2',
      exactAmount: new Prisma.Decimal('90.90909091'), amount: new Prisma.Decimal('90.9'),
      status: SharedPrepaidPayableStatus.REVERSED, reversalOfId: null, createdAt, updatedAt: createdAt,
      sourceOwner: accountA, consumerOwner: accountB
    }
    const reversal = {
      id: 'reversal-1', memberId: 'member-1', consumingFrontendUserId: 'front-2', actorUserId: 'front-2',
      kind: SharedPrepaidConsumptionKind.REVERSAL, amount: new Prisma.Decimal(100), sheetId: 'sheet-1',
      sampleBlockId: 'block-1', sampleIndex: 0, sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 3,
      elementsSnapshot: ['Au'], phoneSnapshot: '13800000000', sheetDate: '2026-08-12', active: false,
      reversalOfId: 'consumption-1', createdAt, consumingFrontendUser: accountB, actorUser: accountB,
      allocations: [], payables: [],
      reversalOf: { id: 'consumption-1', allocations: [originalAllocation], payables: [originalPayable] }
    }
    const findMany = vi.fn().mockResolvedValue([reversal])
    const service = new SharedPrepaidQueryService({
      sharedPrepaidConsumption: { findMany, count: vi.fn().mockResolvedValue(1) }
    } as never)

    const result = await service.listConsumptions({ status: 'REVERSED', sourceOwnerId: 'front-1' })

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [
          { OR: [
            { allocations: { some: { sourceOwnerId: 'front-1' } } },
            { reversalOf: { allocations: { some: { sourceOwnerId: 'front-1' } } } }
          ] },
          { OR: [
            { kind: SharedPrepaidConsumptionKind.REVERSAL },
            { kind: SharedPrepaidConsumptionKind.CONSUMPTION, active: false }
          ] }
        ]
      })
    }))
    expect(result.items).toEqual([expect.objectContaining({
      id: 'reversal-1',
      reversalOfId: 'consumption-1',
      allocationOrigin: 'REVERSAL_TARGET',
      allocationSourceConsumptionId: 'consumption-1',
      allocations: [expect.objectContaining({ id: 'allocation-1', allocatedAmount: 100 })],
      payables: [],
      originalPayables: [expect.objectContaining({ id: 'payable-1', amount: 90.9 })]
    })])
    expect((result.items[0] as { allocations: unknown[] }).allocations).toHaveLength(1)
  })

  it('returns only account options that can match the list predicates after a completed-payable reversal', async () => {
    const accountA = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: '北京店' }
    const accountB = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
    type FilterWhere = {
      consumingFrontendUserId?: string
      AND?: Array<{
        OR?: Array<{ allocations?: { some?: { sourceOwnerId?: string } } }>
      }>
    }
    const countMatches = (where: FilterWhere) => {
      const sourceOwnerId = where.AND
        ?.flatMap((clause) => clause.OR ?? [])
        .find((clause) => clause.allocations)
        ?.allocations?.some?.sourceOwnerId
      if (sourceOwnerId && sourceOwnerId !== accountA.id) return 0
      if (where.consumingFrontendUserId && where.consumingFrontendUserId !== accountB.id) return 0
      return 2
    }
    const consumptionFindMany = vi.fn().mockImplementation((args: { distinct?: string[] }) => (
      args.distinct ? [{ consumingFrontendUser: accountB }] : []
    ))
    const service = new SharedPrepaidQueryService({
      sharedPrepaidAllocation: { findMany: vi.fn().mockResolvedValue([
        { sourceOwner: accountA }
      ]) },
      sharedPrepaidConsumption: {
        findMany: consumptionFindMany,
        count: vi.fn().mockImplementation(({ where }: { where: FilterWhere }) => countMatches(where))
      },
      sharedPrepaidPayable: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ sourceOwner: accountB }])
          .mockResolvedValueOnce([{ consumerOwner: accountA }])
      }
    } as never)

    const options = await service.listConsumptionFilterOptions()
    const sourceMatchTotals = await Promise.all(options.sourceOwners.map(async (option) => (
      (await service.listConsumptions({ sourceOwnerId: option.id })).total
    )))
    const consumerMatchTotals = await Promise.all(options.consumingOwners.map(async (option) => (
      (await service.listConsumptions({ consumingFrontendUserId: option.id })).total
    )))

    expect(sourceMatchTotals).toEqual([2])
    expect(consumerMatchTotals).toEqual([2])
    expect(options).toEqual({
      sourceOwners: [{ id: 'front-1', account: 'owner-a', label: '北京店（owner-a）' }],
      consumingOwners: [{ id: 'front-2', account: 'owner-b', label: '主账号 B（owner-b）' }]
    })
  })
})

describe('SharedPrepaidQueryService admin reads', () => {
  it('aggregates scoped consumption totals in SQL without loading qualifying rows into memory', async () => {
    const createdAt = new Date('2026-08-12T03:04:05.000Z')
    const rechargeGroupBy = vi.fn().mockResolvedValue([{
      memberId: 'member-1', ownerFrontendUserId: 'front-1',
      _sum: { paidAmount: new Prisma.Decimal(100), giftAmount: new Prisma.Decimal(10), remainingAmount: new Prisma.Decimal(80) },
      _max: { createdAt }
    }])
    const consumptionFindMany = vi.fn().mockResolvedValue([])
    const aggregateQuery = vi.fn().mockResolvedValue([{
      memberId: 'member-1',
      // Hand-derived: allowed consumer contributes 100 once; source-only row contributes its allowed allocation 10.
      consumedTotal: new Prisma.Decimal(110),
      latestConsumptionTime: createdAt
    }])
    const service = new SharedPrepaidQueryService({
      $queryRaw: aggregateQuery,
      sharedPrepaidMember: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'member-1', phone: '13800000000', cachedBalance: new Prisma.Decimal(999),
          version: 1, createdAt, updatedAt: createdAt
        }]),
        count: vi.fn().mockResolvedValue(1)
      },
      sharedPrepaidRecharge: { groupBy: rechargeGroupBy },
      sharedPrepaidConsumption: {
        findMany: consumptionFindMany,
        groupBy: vi.fn().mockResolvedValue([])
      },
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null }]) }
    } as never)

    const result = await service.listAdminMembers(['front-1'])

    expect(rechargeGroupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { memberId: { in: ['member-1'] }, ownerFrontendUserId: { in: ['front-1'] }, reversedAt: null }
    }))
    expect(consumptionFindMany).not.toHaveBeenCalled()
    expect(aggregateQuery).toHaveBeenCalledOnce()
    const aggregateStatement = aggregateQuery.mock.calls[0]?.[0] as Prisma.Sql
    const aggregateSql = aggregateStatement.strings.join(' ')
    expect(aggregateSql).toContain('CASE')
    expect(aggregateSql).toContain('c."consumingFrontendUserId"')
    expect(aggregateSql).toContain('SUM(a."allocatedAmount") FILTER')
    expect(aggregateSql).toMatch(/GROUP BY\s+c\."id"/)
    expect(aggregateSql).toContain('GROUP BY "memberId"')
    expect(aggregateStatement.values).toEqual(expect.arrayContaining(['front-1', 'member-1']))
    expect(result.items[0]).toMatchObject({ paidTotal: 100, giftTotal: 10, consumedTotal: 110, balance: 80 })
  })

  it('caps source identities per consumption without starving later collection rows', async () => {
    const createdAt = new Date('2026-08-12T03:04:05.000Z')
    const sourceOwner = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null }
    const consumer = { id: 'front-2', account: 'owner-b', username: '主账号 B', displayRemark: null }
    const consumptionFindMany = vi.fn().mockResolvedValue([
      {
        id: 'consumption-1', memberId: 'member-1', consumingFrontendUserId: 'front-2', actorUserId: 'front-2',
        kind: SharedPrepaidConsumptionKind.CONSUMPTION, amount: new Prisma.Decimal(100),
        sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 2, elementsSnapshot: ['Au'],
        phoneSnapshot: '13800000000', sheetDate: '2026-08-12', active: true,
        reversalOfId: null, createdAt, consumingFrontendUser: consumer, actorUser: consumer
      },
      {
        id: 'consumption-2', memberId: 'member-2', consumingFrontendUserId: 'front-2', actorUserId: 'front-2',
        kind: SharedPrepaidConsumptionKind.CONSUMPTION, amount: new Prisma.Decimal(50),
        sampleNumberSnapshot: 'A-002', sampleCountSnapshot: 1, elementsSnapshot: ['Ag'],
        phoneSnapshot: '13900000000', sheetDate: '2026-08-12', active: true,
        reversalOfId: null, createdAt, consumingFrontendUser: consumer, actorUser: consumer
      }
    ])
    const rawSources = [
      ...Array.from({ length: 101 }, (_, index) => ({
        consumptionId: 'consumption-1', sourceOwnerId: `source-${String(index).padStart(3, '0')}`,
        id: `source-${String(index).padStart(3, '0')}`,
        account: `owner-${index}`, username: `来源 ${index}`, displayRemark: null
      })),
      { consumptionId: 'consumption-2', sourceOwnerId: sourceOwner.id, id: sourceOwner.id, account: sourceOwner.account,
        username: sourceOwner.username, displayRemark: sourceOwner.displayRemark }
    ]
    const sourceQuery = vi.fn().mockResolvedValue(rawSources)
    const allocationFindMany = vi.fn().mockResolvedValue(rawSources.map((row) => ({
      consumptionId: row.consumptionId,
      sourceOwnerId: row.sourceOwnerId,
      sourceOwner: { id: row.sourceOwnerId, account: row.account, username: row.username, displayRemark: row.displayRemark }
    })))
    const service = new SharedPrepaidQueryService({
      $queryRaw: sourceQuery,
      sharedPrepaidConsumption: { findMany: consumptionFindMany, count: vi.fn().mockResolvedValue(1) },
      sharedPrepaidAllocation: { findMany: allocationFindMany }
    } as never)

    const result = await service.listAdminConsumptions(['front-1'])
    const collectionSelect = consumptionFindMany.mock.calls[0]?.[0]?.select as Record<string, unknown>

    expect(collectionSelect).not.toHaveProperty('allocations')
    expect(collectionSelect).not.toHaveProperty('payables')
    expect(collectionSelect).not.toHaveProperty('reversalOf')
    expect(collectionSelect).not.toHaveProperty('sheetId')
    expect(collectionSelect).not.toHaveProperty('sampleBlockId')
    expect(collectionSelect).not.toHaveProperty('sampleIndex')
    expect(allocationFindMany).not.toHaveBeenCalled()
    expect(sourceQuery).toHaveBeenCalledOnce()
    const sourceStatement = sourceQuery.mock.calls[0]?.[0] as Prisma.Sql
    const sourceSql = sourceStatement.strings.join(' ')
    expect(sourceSql).toContain('ROW_NUMBER() OVER')
    expect(sourceSql).toContain('PARTITION BY "consumptionId"')
    expect(sourceStatement.values).toEqual(expect.arrayContaining(['consumption-1', 'consumption-2', 101]))
    expect(result.items[0]).toMatchObject({
      id: 'consumption-1', sourceOwnersTruncated: true
    })
    expect((result.items[0] as Record<string, unknown>).sourceOwners).toHaveLength(100)
    expect(result.items[1]).toMatchObject({
      id: 'consumption-2', sourceOwners: [sourceOwner], sourceOwnersTruncated: false
    })
    expect(result.items[0]).not.toHaveProperty('allocations')
    expect(result.items[0]).not.toHaveProperty('payables')
    expect(result.items[0]).not.toHaveProperty('originalPayables')
  })

  it('caps every expanded consumption detail relation and reports truncation', async () => {
    const createdAt = new Date('2026-08-12T03:04:05.000Z')
    const account = { id: 'front-1', account: 'owner-a', username: '主账号 A', displayRemark: null }
    const allocations = Array.from({ length: 101 }, (_, index) => ({
      id: `allocation-${index}`, consumptionId: 'consumption-1', rechargeId: `recharge-${index}`,
      sourceOwnerId: 'front-1', allocatedAmount: new Prisma.Decimal(1), paidRatio: new Prisma.Decimal(1),
      exactTransferAmount: new Prisma.Decimal(1), createdAt, sourceOwner: account,
      recharge: {
        id: `recharge-${index}`, ownerFrontendUserId: 'front-1', rechargeDate: '2026-08-01',
        paidAmount: new Prisma.Decimal(1), giftAmount: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal(1),
        remainingAmount: new Prisma.Decimal(0), isOpeningBalance: false, reversedAt: null, createdAt
      }
    }))
    const payables = Array.from({ length: 101 }, (_, index) => ({
      id: `payable-${index}`, consumptionId: 'consumption-1', sourceOwnerId: 'front-1',
      consumerOwnerId: 'front-2', exactAmount: new Prisma.Decimal(1), amount: new Prisma.Decimal(1),
      status: SharedPrepaidPayableStatus.PENDING, reversalOfId: null, createdAt, updatedAt: createdAt,
      sourceOwner: account, consumerOwner: { ...account, id: 'front-2', account: 'owner-b' }
    }))
    const consumptionFindFirst = vi.fn().mockResolvedValue({
      id: 'reversal-1', memberId: 'member-1', consumingFrontendUserId: 'front-2', actorUserId: 'front-2',
      kind: SharedPrepaidConsumptionKind.REVERSAL, amount: new Prisma.Decimal(-101), sheetId: 'sheet-1',
      sampleBlockId: 'block-1', sampleIndex: 0, sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 2,
      elementsSnapshot: ['Au'], phoneSnapshot: '13800000000', sheetDate: '2026-08-12', active: false,
      reversalOfId: 'consumption-1', createdAt, consumingFrontendUser: account, actorUser: account,
      allocations, payables, reversal: null,
      reversalOf: { id: 'consumption-1', allocations, payables }
    })
    const service = new SharedPrepaidQueryService({
      sharedPrepaidConsumption: { findFirst: consumptionFindFirst },
      sharedPrepaidLedgerEntry: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never)

    const result = await service.getAdminConsumptionDetail(['front-1'], 'reversal-1') as Record<string, any>
    const detailSelect = consumptionFindFirst.mock.calls[0]?.[0]?.select

    expect(detailSelect.allocations.take).toBe(101)
    expect(detailSelect.payables.take).toBe(101)
    expect(detailSelect.reversalOf.select.allocations.take).toBe(101)
    expect(detailSelect.reversalOf.select.payables.take).toBe(101)
    expect(result.allocations).toHaveLength(100)
    expect(result.payables).toHaveLength(100)
    expect(result.originalPayables).toHaveLength(100)
    expect(result.relationTruncated).toEqual({
      allocations: true,
      payables: true,
      originalAllocations: true,
      originalPayables: true
    })
    expect(result).toMatchObject({
      relationLimit: 100,
      reversalOfId: 'consumption-1',
      allocationSourceConsumptionId: 'consumption-1'
    })
  })

  it('applies the allowed account scope inside every paged collection query', async () => {
    const memberFindMany = vi.fn().mockResolvedValue([])
    const rechargeFindMany = vi.fn().mockResolvedValue([])
    const consumptionFindMany = vi.fn().mockResolvedValue([])
    const settlementFindMany = vi.fn().mockResolvedValue([])
    const service = new SharedPrepaidQueryService({
      sharedPrepaidMember: { findMany: memberFindMany, count: vi.fn().mockResolvedValue(0) },
      sharedPrepaidRecharge: { findMany: rechargeFindMany, count: vi.fn().mockResolvedValue(0) },
      sharedPrepaidConsumption: { findMany: consumptionFindMany, count: vi.fn().mockResolvedValue(0) },
      sharedPrepaidSettlement: { findMany: settlementFindMany, count: vi.fn().mockResolvedValue(0) }
    } as never)
    const allowedIds = ['front-1']

    await service.listAdminMembers(allowedIds, { phone: '138', page: 2, pageSize: 10 })
    await service.listAdminRecharges(allowedIds, {
      phone: '138', startDate: '2026-08-01', endDate: '2026-08-31', isOpeningBalance: false,
      status: 'REVERSED'
    })
    await service.listAdminConsumptions(allowedIds, {
      sourceOwnerId: 'front-2', status: 'REVERSED', payableStatus: 'COMPLETED'
    })
    await service.listAdminSettlements(allowedIds, {
      counterpartyFrontendUserId: 'front-2', status: 'REJECTED',
      startDate: '2026-08-01', endDate: '2026-08-31'
    })

    const participation = [
      { recharges: { some: { ownerFrontendUserId: { in: allowedIds } } } },
      { consumptions: { some: { OR: [
        { consumingFrontendUserId: { in: allowedIds } },
        { allocations: { some: { sourceOwnerId: { in: allowedIds } } } },
        { reversalOf: { allocations: { some: { sourceOwnerId: { in: allowedIds } } } } }
      ] } } },
      { consumptions: { some: { payables: { some: { settlementLines: { some: {
        settlement: { OR: [{ accountAId: { in: allowedIds } }, { accountBId: { in: allowedIds } }] }
      } } } } } } }
    ]
    expect(memberFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phone: { contains: '138' }, OR: participation },
      skip: 10,
      take: 10
    }))
    expect(rechargeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        member: { phone: { contains: '138' } },
        ownerFrontendUserId: { in: allowedIds },
        rechargeDate: { gte: '2026-08-01', lte: '2026-08-31' },
        isOpeningBalance: false,
        reversedAt: { not: null }
      }
    }))
    expect(consumptionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { OR: [
            { consumingFrontendUserId: { in: allowedIds } },
            { allocations: { some: { sourceOwnerId: { in: allowedIds } } } },
            { reversalOf: { allocations: { some: { sourceOwnerId: { in: allowedIds } } } } }
          ] },
          { OR: [
            { allocations: { some: { sourceOwnerId: 'front-2' } } },
            { reversalOf: { allocations: { some: { sourceOwnerId: 'front-2' } } } }
          ] }
        ])
      })
    }))
    expect(settlementFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [{ accountAId: { in: allowedIds } }, { accountBId: { in: allowedIds } }],
        AND: [{ OR: [{ accountAId: 'front-2' }, { accountBId: 'front-2' }] }],
        status: 'REJECTED',
        createdAt: {
          gte: new Date('2026-08-01T00:00:00.000+08:00'),
          lte: new Date('2026-08-31T23:59:59.999+08:00')
        }
      }
    }))
  })

  it('returns not found for every detail outside the allowed account relationships', async () => {
    const rechargeFindFirst = vi.fn().mockResolvedValue(null)
    const memberFindFirst = vi.fn().mockResolvedValue(null)
    const consumptionFindFirst = vi.fn().mockResolvedValue(null)
    const settlementFindFirst = vi.fn().mockResolvedValue(null)
    const service = new SharedPrepaidQueryService({
      sharedPrepaidRecharge: { findFirst: rechargeFindFirst },
      sharedPrepaidMember: { findFirst: memberFindFirst },
      sharedPrepaidConsumption: { findFirst: consumptionFindFirst },
      sharedPrepaidSettlement: { findFirst: settlementFindFirst }
    } as never)
    const allowedIds = ['front-1']

    await expect(service.getAdminRechargeDetail(allowedIds, 'recharge-2')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.getAdminMemberDetail(allowedIds, 'member-2')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.getAdminConsumptionDetail(allowedIds, 'consumption-2')).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.getAdminSettlementDetail(allowedIds, 'settlement-2')).rejects.toBeInstanceOf(NotFoundException)

    expect(rechargeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'recharge-2', ownerFrontendUserId: { in: allowedIds } }
    }))
    expect(memberFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'member-2', OR: expect.any(Array) }
    }))
    expect(consumptionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'consumption-2', OR: expect.any(Array) }
    }))
    expect(settlementFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'settlement-2',
        OR: [{ accountAId: { in: allowedIds } }, { accountBId: { in: allowedIds } }]
      }
    }))
  })
})
