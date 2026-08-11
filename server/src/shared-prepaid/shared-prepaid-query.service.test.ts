import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Prisma, SharedPrepaidConsumptionKind, SharedPrepaidPayableStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
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
        allocations: { some: { sourceOwnerId: 'front-1' } },
        consumingFrontendUserId: 'front-2',
        sheetDate: { gte: '2026-08-01', lte: '2026-08-31' },
        kind: SharedPrepaidConsumptionKind.CONSUMPTION,
        active: true,
        payables: { some: { status: SharedPrepaidPayableStatus.COMPLETED } }
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
    const queryService = { listConsumptions: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }) }
    const controller = new SharedPrepaidController({} as never, queryService as never, {} as never)
    const query = { phone: '138' }

    await controller.listConsumptions(query as never)

    const handler = SharedPrepaidController.prototype.listConsumptions
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('consumptions')
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, handler)).toEqual(['PREPAID_CONSUMPTIONS'])
    expect(queryService.listConsumptions).toHaveBeenCalledWith(query)
  })
})
