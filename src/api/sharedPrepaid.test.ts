import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMocks,
  useMocks: false
}))

import {
  cancelPrepaidSettlement,
  confirmPrepaidSettlement,
  createPrepaidRecharge,
  createPrepaidSettlement,
  createSharedPrepaidEventSource,
  createSharedPrepaidStreamTicket,
  getPrepaidMemberDetail,
  getPrepaidMembers,
  getPrepaidConsumptions,
  getPrepaidConsumptionFilterOptions,
  getPrepaidRecharges,
  isSharedPrepaidTerminalAuthError,
  lookupPrepaidMember,
  previewPrepaidSettlement,
  rejectPrepaidSettlement,
  reversePrepaidConsumption,
  reversePrepaidRecharge,
  submitPrepaidSettlementPayment
} from './sharedPrepaid'
import type {
  CreatePrepaidRechargePayload,
  PrepaidMemberDetail,
  PrepaidMemberRechargeRow
} from '@/types/sharedPrepaid'

describe('shared prepaid realtime transport', () => {
  beforeEach(() => {
    requestMocks.get.mockReset()
    requestMocks.post.mockReset()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
    window.localStorage.setItem('ys_token', 'long-lived.raw.jwt')
  })

  it('uses only the authoritative member, recharge, and consumption read routes', async () => {
    requestMocks.get.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 })

    await getPrepaidMembers({ page: 2, pageSize: 10, phone: '138' })
    await lookupPrepaidMember('138 0000-0000')
    await getPrepaidMemberDetail('member-1')
    await getPrepaidRecharges({ ownerFrontendUserId: 'front-1', isOpeningBalance: false })
    await getPrepaidConsumptions({
      page: 3,
      phone: '138 0000-0000',
      sourceOwnerId: 'front-1',
      consumingFrontendUserId: 'front-2',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'ACTIVE',
      payableStatus: 'PENDING'
    })
    await getPrepaidConsumptionFilterOptions()

    expect(requestMocks.get.mock.calls).toEqual([
      ['/shared-prepaid/members', { params: { page: 2, pageSize: 10, phone: '138' } }],
      ['/shared-prepaid/members/lookup', { params: { phone: '138 0000-0000' } }],
      ['/shared-prepaid/members/member-1'],
      ['/shared-prepaid/recharges', { params: { ownerFrontendUserId: 'front-1', isOpeningBalance: false } }],
      ['/shared-prepaid/consumptions', { params: {
        page: 3,
        phone: '138 0000-0000',
        sourceOwnerId: 'front-1',
        consumingFrontendUserId: 'front-2',
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        status: 'ACTIVE',
        payableStatus: 'PENDING'
      } }],
      ['/shared-prepaid/consumptions/filter-options']
    ])
  })

  it('accepts the server member-detail recharge shape without a duplicated phone', async () => {
    const detailRecharge: PrepaidMemberRechargeRow = {
      id: 'recharge-1', memberId: 'member-1', ownerFrontendUserId: 'front-1',
      ownerAccount: 'front-1', ownerUsername: '主账号', actorUserId: 'front-1',
      actorAccount: 'front-1', actorUsername: '主账号', rechargeDate: '2026-08-12',
      paidAmount: 1000, giftAmount: 100, totalAmount: 1100, remainingAmount: 1100,
      isOpeningBalance: false, remark: null, reversedAt: null, reversedByLedgerId: null,
      createdAt: '2026-08-12T08:00:00.000Z', updatedAt: '2026-08-12T08:00:00.000Z'
    }
    const serverDetail = {
      id: 'member-1', phone: '13800000000', paidTotal: 1000, giftTotal: 100,
      consumedTotal: 0, balance: 1100, version: 1, ownerComposition: [],
      latestRechargeTime: '2026-08-12T08:00:00.000Z', latestConsumptionTime: null,
      createdAt: '2026-08-12T08:00:00.000Z', updatedAt: '2026-08-12T08:00:00.000Z',
      recharges: [detailRecharge], consumptions: [], ledgerEntries: []
    } satisfies PrepaidMemberDetail
    requestMocks.get.mockResolvedValue(serverDetail)

    await expect(getPrepaidMemberDetail('member-1')).resolves.toEqual(serverDetail)
    expect(serverDetail.recharges[0]).not.toHaveProperty('phone')
  })

  it('creates one idempotency key per mutation and keeps an explicit retry key stable', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    vi.spyOn(crypto, 'randomUUID').mockImplementation(randomUUID)
    requestMocks.post.mockResolvedValue({ id: 'saved' })
    const payload: CreatePrepaidRechargePayload = {
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: '首次充值'
    }

    await createPrepaidRecharge(payload)
    await reversePrepaidRecharge('recharge-1', { reason: '金额录错' }, 'retry-key')
    await reversePrepaidConsumption('consumption-1', { reason: '样品作废' })

    expect(requestMocks.post.mock.calls).toEqual([
      ['/shared-prepaid/recharges', payload, {
        headers: { 'X-Idempotency-Key': '00000000-0000-4000-8000-000000000001' }
      }],
      ['/shared-prepaid/recharges/recharge-1/reversal', { reason: '金额录错' }, {
        headers: { 'X-Idempotency-Key': 'retry-key' }
      }],
      ['/shared-prepaid/consumptions/consumption-1/reversal', { reason: '样品作废' }, {
        headers: { 'X-Idempotency-Key': '00000000-0000-4000-8000-000000000002' }
      }]
    ])
    expect(randomUUID).toHaveBeenCalledTimes(2)
  })

  it('maps every settlement mutation to the server route and keeps bodies exact', async () => {
    requestMocks.post.mockResolvedValue({ id: 'settlement-1' })
    const key = 'stable-action-key'

    await previewPrepaidSettlement({ payableIds: ['payable-1', 'payable-2'] })
    await createPrepaidSettlement({ payableIds: ['payable-1', 'payable-2'] }, key)
    await submitPrepaidSettlementPayment('settlement-1', {
      actualTransferredAt: '2026-08-12T16:00:00+08:00',
      proofUrls: ['/uploads/prepaid/proof.png'], remark: '已转账'
    }, key)
    await confirmPrepaidSettlement('settlement-1', key)
    await rejectPrepaidSettlement('settlement-1', { reason: '金额不符' }, key)
    await cancelPrepaidSettlement('settlement-1', key)

    expect(requestMocks.post.mock.calls).toEqual([
      ['/shared-prepaid/settlements/preview', { payableIds: ['payable-1', 'payable-2'] }],
      ['/shared-prepaid/settlements', { payableIds: ['payable-1', 'payable-2'] }, {
        headers: { 'X-Idempotency-Key': key }
      }],
      ['/shared-prepaid/settlements/settlement-1/payment', {
        actualTransferredAt: '2026-08-12T16:00:00+08:00',
        proofUrls: ['/uploads/prepaid/proof.png'], remark: '已转账'
      }, { headers: { 'X-Idempotency-Key': key } }],
      ['/shared-prepaid/settlements/settlement-1/confirm', undefined, {
        headers: { 'X-Idempotency-Key': key }
      }],
      ['/shared-prepaid/settlements/settlement-1/reject', { reason: '金额不符' }, {
        headers: { 'X-Idempotency-Key': key }
      }],
      ['/shared-prepaid/settlements/settlement-1/cancel', undefined, {
        headers: { 'X-Idempotency-Key': key }
      }]
    ])
  })

  it('obtains a short-lived ticket through the authenticated request client', async () => {
    requestMocks.post.mockResolvedValue({ ticket: 'opaque-ticket', expiresAt: 1234 })

    await expect(createSharedPrepaidStreamTicket()).resolves.toEqual({
      ticket: 'opaque-ticket', expiresAt: 1234
    })
    expect(requestMocks.post).toHaveBeenCalledWith('/shared-prepaid/stream-ticket')
  })

  it('puts only the opaque ticket in the EventSource URL and never the bearer token', () => {
    const EventSourceMock = vi.fn(function (this: { url: string }, url: string) {
      this.url = url
    })
    vi.stubGlobal('EventSource', EventSourceMock)

    createSharedPrepaidEventSource('opaque-ticket')

    const url = new URL(EventSourceMock.mock.calls[0][0])
    expect(url.pathname).toBe('/api/shared-prepaid/stream')
    expect(url.searchParams.get('ticket')).toBe('opaque-ticket')
    expect(url.searchParams.has('token')).toBe(false)
    expect(url.toString()).not.toContain('long-lived.raw.jwt')
  })

  it('classifies only 401 and 403 preflight responses as terminal authorization failures', () => {
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 401 } })).toBe(true)
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 403 } })).toBe(true)
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 503 } })).toBe(false)
    expect(isSharedPrepaidTerminalAuthError(new Error('offline'))).toBe(false)
  })
})
