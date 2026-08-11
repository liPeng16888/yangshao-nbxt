import { beforeEach, describe, expect, it } from 'vitest'

import {
  mockCreatePrepaidRecharge,
  mockCreatePrepaidSettlement,
  mockConfirmPrepaidSettlement,
  mockGetPrepaidMemberDetail,
  mockGetPrepaidMembers,
  mockGetPrepaidConsumptions,
  mockGetPrepaidConsumptionFilterOptions,
  mockLookupPrepaidMember,
  mockPreviewPrepaidSettlement,
  mockRecordPrepaidConsumption,
  mockRejectPrepaidSettlement,
  mockReversePrepaidConsumption,
  mockReversePrepaidRecharge,
  mockSubmitPrepaidSettlementPayment,
  resetSharedPrepaidMock,
  type MockSharedPrepaidIdentity
} from './sharedPrepaid'

const ownerA: MockSharedPrepaidIdentity = {
  actorUserId: 'A', ownerFrontendUserId: 'A', account: 'account-a', username: '主账号 A',
  isFrontendMainAccount: true
}
const ownerB: MockSharedPrepaidIdentity = {
  actorUserId: 'B', ownerFrontendUserId: 'B', account: 'account-b', username: '主账号 B',
  isFrontendMainAccount: true
}
const ownerC: MockSharedPrepaidIdentity = {
  actorUserId: 'C', ownerFrontendUserId: 'C', account: 'account-c', username: '主账号 C',
  isFrontendMainAccount: true
}

describe('shared prepaid focused mock', () => {
  beforeEach(() => resetSharedPrepaidMock())

  it('normalizes one phone globally and maintains paid plus gift balance history', async () => {
    const first = await mockCreatePrepaidRecharge({
      phone: '138 0000-0000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false, remark: 'A 充值'
    }, 'recharge-a', ownerA)
    await mockCreatePrepaidRecharge({
      phone: '138-0000-0000', rechargeDate: '2026-08-12', paidAmount: 200,
      giftAmount: 0, isOpeningBalance: false, remark: 'B 充值'
    }, 'recharge-b', ownerB)

    const lookup = await mockLookupPrepaidMember('13800000000')
    const page = await mockGetPrepaidMembers({ phone: '8000' })
    const detail = await mockGetPrepaidMemberDetail(first.memberId)

    expect(lookup).toMatchObject({ id: first.memberId, phone: '13800000000', paidTotal: 1200, giftTotal: 100, balance: 1300 })
    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 20 })
    expect(detail.recharges).toHaveLength(2)
    expect(detail.recharges[0]).not.toHaveProperty('phone')
    expect(detail.ledgerEntries.map((row) => row.balanceDelta)).toEqual([200, 1100])
  })

  it('uses the same mainland-phone normalization boundary as the server', async () => {
    await expect(mockLookupPrepaidMember('+86 13800000000')).rejects.toThrow('会员手机号格式错误')
    await expect(mockLookupPrepaidMember('12800000000')).rejects.toThrow('会员手机号格式错误')
  })

  it('allocates FIFO and creates 90.9 payable only for the cross-owner paid share', async () => {
    const recharge = await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000,
      giftAmount: 100, isOpeningBalance: false
    }, 'recharge-a', ownerA)

    const crossOwner = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    const selfOwner = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 50, sheetId: 'sheet-2', sampleBlockId: 'block-2',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-a', ownerA)
    const detail = await mockGetPrepaidMemberDetail(recharge.memberId)

    expect(crossOwner.payables).toEqual([
      expect.objectContaining({ sourceOwnerId: 'A', consumerOwnerId: 'B', exactAmount: 90.90909091, amount: 90.9, status: 'PENDING' })
    ])
    expect(selfOwner.payables).toEqual([])
    expect(detail).toMatchObject({ consumedTotal: 150, balance: 950 })
    expect(detail.recharges[0].remainingAmount).toBe(950)
    expect(detail.consumptions.flatMap((row) => row.allocations).every((allocation) => (
      allocation.recharge.remainingAmount === 950
    ))).toBe(true)
  })

  it('filters and paginates global consumption rows independently from customer detail permission', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)
    await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 3,
      elementsSnapshot: ['Au', 'Ag'], sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)

    const page = await mockGetPrepaidConsumptions({
      page: 1,
      pageSize: 10,
      phone: '138 0000-0000',
      sourceOwnerId: 'A',
      consumingFrontendUserId: 'B',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'ACTIVE',
      payableStatus: 'PENDING'
    })

    expect(page).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    expect(page.items[0]).toMatchObject({
      phoneSnapshot: '13800000000',
      sampleNumberSnapshot: 'A-001',
      sampleCountSnapshot: 3,
      elementsSnapshot: ['Au', 'Ag'],
      allocations: [expect.objectContaining({ sourceOwnerId: 'A', allocatedAmount: 100 })],
      payables: [expect.objectContaining({ consumerOwnerId: 'B', amount: 90.9, status: 'PENDING' })]
    })
    expect(page.items[0]).not.toHaveProperty('idempotencyKey')
    expect(page.items[0].allocations[0].recharge).not.toHaveProperty('idempotencyKey')
  })

  it('finds reversed rows by original source owner and keeps original allocation/payable audit detail separate', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)
    const original = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sampleNumberSnapshot: 'A-001', sampleCountSnapshot: 3,
      elementsSnapshot: ['Au'], sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    await mockReversePrepaidConsumption(original.id, { reason: '样品作废' }, 'reverse-b', ownerB)

    const page = await mockGetPrepaidConsumptions({ status: 'REVERSED', sourceOwnerId: 'A' })
    const reversal = page.items.find((row) => row.kind === 'REVERSAL')

    expect(page.total).toBe(2)
    expect(reversal).toMatchObject({
      reversalOfId: original.id,
      allocationOrigin: 'REVERSAL_TARGET',
      allocationSourceConsumptionId: original.id,
      allocations: [expect.objectContaining({ sourceOwnerId: 'A', allocatedAmount: 100 })],
      payables: [],
      originalPayables: [expect.objectContaining({ sourceOwnerId: 'A', consumerOwnerId: 'B', status: 'REVERSED' })]
    })
  })

  it('offers only accounts whose source and consumer filters match rows after a completed-payable reversal', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)
    const original = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    const settlement = await mockCreatePrepaidSettlement({
      payableIds: [original.payables[0].id]
    }, 'settlement-options', ownerA)
    const submitted = await mockSubmitPrepaidSettlementPayment(settlement.id, {
      actualTransferredAt: '2026-08-12T16:00:00+08:00'
    }, 'submit-options', ownerA)
    await mockConfirmPrepaidSettlement(submitted.id, 'confirm-options', ownerB)
    await mockReversePrepaidConsumption(original.id, { reason: '样品作废' }, 'reverse-options', ownerB)

    const options = await mockGetPrepaidConsumptionFilterOptions()
    const sourceMatches = await Promise.all(options.sourceOwners.map((option) => (
      mockGetPrepaidConsumptions({ sourceOwnerId: option.id })
    )))
    const consumerMatches = await Promise.all(options.consumingOwners.map((option) => (
      mockGetPrepaidConsumptions({ consumingFrontendUserId: option.id })
    )))

    expect(sourceMatches.map((page) => page.total)).toEqual([2])
    expect(consumerMatches.map((page) => page.total)).toEqual([2])
    expect(options).toEqual({
      sourceOwners: [{ id: 'A', account: 'account-a', label: '主账号 A（account-a）' }],
      consumingOwners: [{ id: 'B', account: 'account-b', label: '主账号 B（account-b）' }]
    })
  })

  it('spends the consuming owner own lot before older cross-owner FIFO lots', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-10', paidAmount: 100, giftAmount: 0
    }, 'older-a', ownerA)
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-11', paidAmount: 100, giftAmount: 0
    }, 'newer-b', ownerB)

    const consumption = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 50, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-own-first', ownerB)

    expect(consumption.allocations).toEqual([
      expect.objectContaining({ sourceOwnerId: 'B', allocatedAmount: 50 })
    ])
    expect(consumption.payables).toEqual([])
  })

  it('returns the authoritative insufficient-balance code and message', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 10, giftAmount: 0
    }, 'small-recharge', ownerA)

    await expect(mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 11, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'too-large', ownerA)).rejects.toMatchObject({
      message: '会员预付余额不足',
      response: { status: 409, data: { code: 'PREPAID_BALANCE_INSUFFICIENT', message: '会员预付余额不足' } }
    })
  })

  it('keeps the unused historical lot amount intact when a recharge is reversed', async () => {
    const recharge = await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)

    const reversed = await mockReversePrepaidRecharge(
      recharge.id,
      { reason: '金额录错' },
      'reverse-a',
      ownerA
    )
    const detail = await mockGetPrepaidMemberDetail(recharge.memberId)

    expect(reversed).toMatchObject({ remainingAmount: 1100, balance: 0 })
    expect(detail).toMatchObject({ paidTotal: 0, giftTotal: 0, balance: 0 })
    expect(detail.recharges[0]).toMatchObject({ remainingAmount: 1100, reversedAt: expect.any(String) })
  })

  it('nets opposite pending payables and freezes exactly those lines', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)
    const aToB = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    await mockCreatePrepaidRecharge({
      phone: '13900000000', rechargeDate: '2026-08-12', paidAmount: 60, giftAmount: 0
    }, 'recharge-b', ownerB)
    const bToA = await mockRecordPrepaidConsumption({
      phone: '13900000000', amount: 60, sheetId: 'sheet-2', sampleBlockId: 'block-2',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-a', ownerA)
    const payableIds = [aToB.payables[0].id, bToA.payables[0].id]

    await expect(mockPreviewPrepaidSettlement({ payableIds }, ownerA)).resolves.toMatchObject({
      accountAId: 'A', accountBId: 'B', aToBAmount: 90.9, bToAAmount: 60,
      payerFrontendUserId: 'A', receiverFrontendUserId: 'B', netAmount: 30.9
    })
    const settlement = await mockCreatePrepaidSettlement({ payableIds }, 'settlement-a-b', ownerA)
    const retry = await mockCreatePrepaidSettlement({ payableIds }, 'settlement-a-b', ownerA)

    expect(settlement.status).toBe('AWAITING_PAYMENT')
    expect(settlement.lines.map((line) => line.payableStatus)).toEqual(['HELD', 'HELD'])
    expect(retry).toEqual(settlement)
  })

  it('appends a reversal consumption and attaches its compensating payable to that row', async () => {
    const recharge = await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 1000, giftAmount: 100
    }, 'recharge-a', ownerA)
    const original = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 100, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    const settlement = await mockCreatePrepaidSettlement({
      payableIds: [original.payables[0].id]
    }, 'settlement-a-b', ownerA)
    const submitted = await mockSubmitPrepaidSettlementPayment(settlement.id, {
      actualTransferredAt: '2026-08-12T16:00:00+08:00'
    }, 'submit-a-b', ownerA)
    await mockConfirmPrepaidSettlement(submitted.id, 'confirm-a-b', ownerB)

    const reversal = await mockReversePrepaidConsumption(
      original.id,
      { reason: '样品作废' },
      'reverse-consumption',
      ownerB
    )
    const detail = await mockGetPrepaidMemberDetail(recharge.memberId)
    const persistedReversal = detail.consumptions.find((row) => row.id === reversal.id)

    expect(detail.consumptions).toHaveLength(2)
    expect(detail.consumptions.find((row) => row.id === original.id)).toMatchObject({ active: false })
    expect(persistedReversal).toMatchObject({
      kind: 'REVERSAL', active: false, reversalOfId: original.id,
      idempotencyKey: 'reverse-consumption'
    })
    expect(persistedReversal?.payables).toEqual([
      expect.objectContaining({
        consumptionId: reversal.id,
        sourceOwnerId: 'B', consumerOwnerId: 'A',
        reversalOfId: original.payables[0].id, status: 'PENDING'
      })
    ])
  })

  it('allows rejection only by the final receiver and forbids payer or unrelated owners', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 100, giftAmount: 0
    }, 'recharge-a', ownerA)
    const consumption = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 60, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    const settlement = await mockCreatePrepaidSettlement({
      payableIds: [consumption.payables[0].id]
    }, 'settlement-a-b', ownerA)
    await mockSubmitPrepaidSettlementPayment(settlement.id, {
      actualTransferredAt: '2026-08-12T16:00:00+08:00'
    }, 'submit-a-b', ownerA)

    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: 'payer cannot reject' }, 'reject-a', ownerA
    )).rejects.toMatchObject({ response: { status: 403 } })
    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: 'unrelated cannot reject' }, 'reject-c', ownerC
    )).rejects.toMatchObject({ response: { status: 403 } })
    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: '金额不符' }, 'reject-b', ownerB
    )).resolves.toMatchObject({ status: 'REJECTED', rejectedById: 'B' })
  })

  it('allows zero-net rejection only by a participating main account other than the creator', async () => {
    await mockCreatePrepaidRecharge({
      phone: '13800000000', rechargeDate: '2026-08-12', paidAmount: 60, giftAmount: 0
    }, 'recharge-a', ownerA)
    const aToB = await mockRecordPrepaidConsumption({
      phone: '13800000000', amount: 60, sheetId: 'sheet-1', sampleBlockId: 'block-1',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-b', ownerB)
    await mockCreatePrepaidRecharge({
      phone: '13900000000', rechargeDate: '2026-08-12', paidAmount: 60, giftAmount: 0
    }, 'recharge-b', ownerB)
    const bToA = await mockRecordPrepaidConsumption({
      phone: '13900000000', amount: 60, sheetId: 'sheet-2', sampleBlockId: 'block-2',
      sampleIndex: 0, sheetDate: '2026-08-12'
    }, 'consume-a', ownerA)
    const settlement = await mockCreatePrepaidSettlement({
      payableIds: [aToB.payables[0].id, bToA.payables[0].id]
    }, 'settlement-zero', ownerA)
    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: 'creator cannot reject' }, 'reject-zero-a', ownerA
    )).rejects.toMatchObject({ response: { status: 403 } })
    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: 'unrelated cannot reject' }, 'reject-zero-c', ownerC
    )).rejects.toMatchObject({ response: { status: 403 } })
    await expect(mockRejectPrepaidSettlement(
      settlement.id, { reason: '另一参与方驳回' }, 'reject-zero-b', ownerB
    )).resolves.toMatchObject({ status: 'REJECTED', rejectedById: 'B' })
  })
})
