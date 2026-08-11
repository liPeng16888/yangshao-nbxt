import type { AuthUser } from '@/types/auth'
import type {
  CreatePrepaidRechargePayload,
  PrepaidAccountRow,
  PrepaidAllocationRow,
  PrepaidConsumptionQuery,
  PrepaidConsumptionFilterOptions,
  PrepaidConsumptionListRow,
  PrepaidConsumptionReversalResult,
  PrepaidConsumptionRow,
  PrepaidLedgerEntryRow,
  PrepaidMemberDetail,
  PrepaidMemberQuery,
  PrepaidMemberRechargeRow,
  PrepaidMemberRow,
  PrepaidPage,
  PrepaidPayableRow,
  PrepaidReasonPayload,
  PrepaidRechargeLotRow,
  PrepaidRechargeMutationResult,
  PrepaidRechargeQuery,
  PrepaidRechargeRow,
  PrepaidSettlementPaymentPayload,
  PrepaidSettlementPreview,
  PrepaidSettlementRow,
  PrepaidSettlementSelectionPayload
} from '@/types/sharedPrepaid'

export interface MockSharedPrepaidIdentity {
  actorUserId: string
  ownerFrontendUserId: string
  account: string
  username: string
  displayRemark?: string | null
  isFrontendMainAccount: boolean
}

export interface MockPrepaidConsumptionPayload {
  phone: string
  amount: string | number
  sheetId: string
  sampleBlockId: string
  sampleIndex: number
  sampleNumberSnapshot?: string | null
  sampleCountSnapshot?: number
  elementsSnapshot?: unknown
  sheetDate: string
}

interface MockMember {
  id: string
  phone: string
  version: number
  createdAt: string
  updatedAt: string
}

interface MockRecharge extends PrepaidRechargeRow {
  idempotencyKey: string
  paidCents: number
  giftCents: number
  totalCents: number
  remainingCents: number
}

interface MockSettlement extends PrepaidSettlementRow {
  creatorOwnerId: string
}

interface IdempotentRecord {
  fingerprint: string
  response: unknown
}

const accounts = new Map<string, PrepaidAccountRow>()
const members: MockMember[] = []
const recharges: MockRecharge[] = []
const consumptions: PrepaidConsumptionRow[] = []
const payables: PrepaidPayableRow[] = []
const ledgerEntries: PrepaidLedgerEntryRow[] = []
const settlements: MockSettlement[] = []
const idempotentRecords = new Map<string, IdempotentRecord>()
let sequence = 1
let clockTick = 0

const MOCK_EPOCH = Date.parse('2026-08-12T08:00:00.000Z')

export function resetSharedPrepaidMock() {
  accounts.clear()
  members.splice(0)
  recharges.splice(0)
  consumptions.splice(0)
  payables.splice(0)
  ledgerEntries.splice(0)
  settlements.splice(0)
  idempotentRecords.clear()
  sequence = 1
  clockTick = 0
}

export function normalizeSharedPrepaidPhone(value: unknown) {
  const phone = String(value ?? '').replace(/\D/g, '')
  if (!/^1[3-9]\d{9}$/.test(phone)) throw mockError(400, '会员手机号格式错误')
  return phone
}

export async function mockGetPrepaidMembers(
  query: PrepaidMemberQuery = {}
): Promise<PrepaidPage<PrepaidMemberRow>> {
  const phone = String(query.phone ?? '').replace(/\D/g, '')
  const rows = members
    .filter((member) => !phone || member.phone.includes(phone))
    .sort((left, right) => left.phone.localeCompare(right.phone))
    .map(toMemberRow)
  return paginate(rows, query.page, query.pageSize)
}

export async function mockLookupPrepaidMember(phone: string): Promise<PrepaidMemberRow | null> {
  const normalized = normalizeSharedPrepaidPhone(phone)
  const member = members.find((row) => row.phone === normalized)
  return member ? clone(toMemberRow(member)) : null
}

export async function mockGetPrepaidMemberDetail(id: string): Promise<PrepaidMemberDetail> {
  const member = members.find((row) => row.id === id)
  if (!member) throw mockError(404, '预存款会员不存在')
  return clone({
    ...toMemberRow(member),
    recharges: recharges
      .filter((row) => row.memberId === id)
      .sort(descendingCreatedAt)
      .map(toMemberRechargeRow),
    consumptions: consumptions
      .filter((row) => row.memberId === id)
      .sort(descendingCreatedAt)
      .map((row) => ({
        ...row,
        allocations: row.allocations.map((allocation) => {
          const recharge = recharges.find((item) => item.id === allocation.rechargeId)
          return recharge ? { ...allocation, recharge: toRechargeLotRow(recharge) } : allocation
        })
      })),
    ledgerEntries: ledgerEntries
      .filter((row) => row.memberId === id)
      .sort(descendingCreatedAt)
  })
}

export async function mockGetPrepaidRecharges(
  query: PrepaidRechargeQuery = {}
): Promise<PrepaidPage<PrepaidRechargeRow>> {
  const phone = String(query.phone ?? '').replace(/\D/g, '')
  const rows = recharges
    .filter((row) => (
      (!phone || row.phone.includes(phone)) &&
      (!query.ownerFrontendUserId || row.ownerFrontendUserId === query.ownerFrontendUserId) &&
      (!query.startDate || row.rechargeDate >= query.startDate) &&
      (!query.endDate || row.rechargeDate <= query.endDate) &&
      (query.isOpeningBalance === undefined || row.isOpeningBalance === query.isOpeningBalance)
    ))
    .sort(descendingCreatedAt)
    .map(toRechargeRow)
  return paginate(rows, query.page, query.pageSize)
}

export async function mockGetPrepaidConsumptions(
  query: PrepaidConsumptionQuery = {}
): Promise<PrepaidPage<PrepaidConsumptionListRow>> {
  const phone = String(query.phone ?? '').replace(/\D/g, '')
  const rows = consumptions
    .filter((row) => (
      (!phone || row.phoneSnapshot.includes(phone)) &&
      (!query.sourceOwnerId || effectiveAllocations(row).some((allocation) => allocation.sourceOwnerId === query.sourceOwnerId)) &&
      (!query.consumingFrontendUserId || row.consumingFrontendUserId === query.consumingFrontendUserId) &&
      (!query.startDate || row.sheetDate >= query.startDate) &&
      (!query.endDate || row.sheetDate <= query.endDate) &&
      (query.status !== 'ACTIVE' || (row.kind === 'CONSUMPTION' && row.active)) &&
      (query.status !== 'REVERSED' || row.kind === 'REVERSAL' || !row.active) &&
      (!query.payableStatus || [...row.payables, ...originalPayables(row)].some((payable) => payable.status === query.payableStatus))
    ))
    .sort(descendingCreatedAt)
  return paginate(rows.map(toConsumptionListRow), query.page, query.pageSize)
}

export async function mockGetPrepaidConsumptionFilterOptions(): Promise<PrepaidConsumptionFilterOptions> {
  const sourceIds = new Set([
    ...consumptions.flatMap((row) => effectiveAllocations(row).map((allocation) => allocation.sourceOwnerId)),
    ...payables.map((payable) => payable.sourceOwnerId)
  ])
  const consumingIds = new Set([
    ...consumptions.map((row) => row.consumingFrontendUserId),
    ...payables.map((payable) => payable.consumerOwnerId)
  ])
  const options = (ids: Set<string>) => [...ids]
    .map((id) => accounts.get(id))
    .filter((account): account is PrepaidAccountRow => Boolean(account))
    .map((account) => ({ id: account.id, account: account.account, label: accountOptionLabel(account) }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id))
  return { sourceOwners: options(sourceIds), consumingOwners: options(consumingIds) }
}

function toConsumptionListRow(row: PrepaidConsumptionRow): PrepaidConsumptionListRow {
  const { idempotencyKey: _consumptionKey, ...consumption } = row
  const allocations = effectiveAllocations(row)
  const original = row.kind === 'REVERSAL' ? consumptions.find((item) => item.id === row.reversalOfId) : undefined
  return clone({
    ...consumption,
    allocationOrigin: original ? 'REVERSAL_TARGET' : 'DIRECT',
    allocationSourceConsumptionId: original?.id ?? row.id,
    allocations: allocations.map((allocation) => {
      const { recharge, ...publicAllocation } = allocation
      return {
        ...publicAllocation,
        recharge: {
          id: recharge.id,
          ownerFrontendUserId: recharge.ownerFrontendUserId,
          rechargeDate: recharge.rechargeDate,
          paidAmount: recharge.paidAmount,
          giftAmount: recharge.giftAmount,
          totalAmount: recharge.totalAmount,
          remainingAmount: recharge.remainingAmount,
          isOpeningBalance: recharge.isOpeningBalance,
          reversedAt: recharge.reversedAt,
          createdAt: recharge.createdAt
        }
      }
    }),
    originalPayables: original?.payables ?? []
  })
}

function effectiveAllocations(row: PrepaidConsumptionRow) {
  if (row.kind !== 'REVERSAL') return row.allocations
  return consumptions.find((item) => item.id === row.reversalOfId)?.allocations ?? []
}

function originalPayables(row: PrepaidConsumptionRow) {
  if (row.kind !== 'REVERSAL') return []
  return consumptions.find((item) => item.id === row.reversalOfId)?.payables ?? []
}

function accountOptionLabel(account: PrepaidAccountRow) {
  const display = account.displayRemark || account.username || account.account
  return display && display !== account.account ? `${display}（${account.account}）` : account.account
}

export async function mockCreatePrepaidRecharge(
  payload: CreatePrepaidRechargePayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidRechargeMutationResult> {
  const phone = normalizeSharedPrepaidPhone(payload.phone)
  const paidCents = moneyToCents(payload.paidAmount, '充值金额', true)
  const giftCents = moneyToCents(payload.giftAmount, '赠送金额')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.rechargeDate)) throw mockError(400, '充值日期格式错误')
  if (payload.isOpeningBalance && !identity.isFrontendMainAccount) throw mockError(403, '只有主账号可以录入期初余额')
  const normalizedPayload = {
    phone,
    rechargeDate: payload.rechargeDate,
    paidCents,
    giftCents,
    isOpeningBalance: Boolean(payload.isOpeningBalance),
    remark: optionalText(payload.remark)
  }

  return runIdempotent(idempotencyKey, ['CREATE_RECHARGE', identity, normalizedPayload], () => {
    registerAccount(identity)
    const member = findOrCreateMember(phone)
    const createdAt = nextTimestamp()
    const recharge: MockRecharge = {
      id: nextId(),
      memberId: member.id,
      phone,
      ownerFrontendUserId: identity.ownerFrontendUserId,
      ownerAccount: identity.account,
      ownerUsername: identity.username,
      actorUserId: identity.actorUserId,
      actorAccount: identity.account,
      actorUsername: identity.username,
      rechargeDate: payload.rechargeDate,
      paidAmount: fromCents(paidCents),
      giftAmount: fromCents(giftCents),
      totalAmount: fromCents(paidCents + giftCents),
      remainingAmount: fromCents(paidCents + giftCents),
      isOpeningBalance: Boolean(payload.isOpeningBalance),
      remark: optionalText(payload.remark),
      idempotencyKey,
      reversedAt: null,
      reversedByLedgerId: null,
      createdAt,
      updatedAt: createdAt,
      paidCents,
      giftCents,
      totalCents: paidCents + giftCents,
      remainingCents: paidCents + giftCents
    }
    recharges.push(recharge)
    touchMember(member)
    appendLedger(member.id, 'RECHARGE', recharge.totalAmount, identity, 'SharedPrepaidRecharge', recharge.id, idempotencyKey)
    return rechargeMutationResult(recharge, member)
  })
}

export async function mockRecordPrepaidConsumption(
  payload: MockPrepaidConsumptionPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidConsumptionRow> {
  const phone = normalizeSharedPrepaidPhone(payload.phone)
  const amountCents = moneyToCents(payload.amount, '消费金额', true)
  const member = members.find((row) => row.phone === phone)
  if (!member) throw mockError(404, '预存款会员不存在')

  return runIdempotent(idempotencyKey, ['CREATE_CONSUMPTION', identity, payload, phone, amountCents], () => {
    registerAccount(identity)
    const lots = recharges
      .filter((row) => row.memberId === member.id && !row.reversedAt && row.remainingCents > 0)
      .sort((left, right) => (
        Number(left.ownerFrontendUserId !== identity.ownerFrontendUserId) -
        Number(right.ownerFrontendUserId !== identity.ownerFrontendUserId) ||
        left.rechargeDate.localeCompare(right.rechargeDate) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
      ))
    if (lots.reduce((sum, row) => sum + row.remainingCents, 0) < amountCents) {
      throw mockError(409, '会员预付余额不足', 'PREPAID_BALANCE_INSUFFICIENT')
    }

    const createdAt = nextTimestamp()
    const consumptionId = nextId()
    const allocations: PrepaidAllocationRow[] = []
    let unallocated = amountCents
    for (const lot of lots) {
      if (!unallocated) break
      const allocatedCents = Math.min(lot.remainingCents, unallocated)
      lot.remainingCents -= allocatedCents
      lot.remainingAmount = fromCents(lot.remainingCents)
      lot.updatedAt = createdAt
      unallocated -= allocatedCents
      const paidRatio = lot.paidCents / lot.totalCents
      allocations.push({
        id: nextId(),
        consumptionId,
        rechargeId: lot.id,
        sourceOwnerId: lot.ownerFrontendUserId,
        allocatedAmount: fromCents(allocatedCents),
        paidRatio: round(paidRatio, 10),
        exactTransferAmount: round(fromCents(allocatedCents) * paidRatio, 8),
        createdAt,
        recharge: toRechargeLotRow(lot),
        sourceOwner: accountFor(lot.ownerFrontendUserId)
      })
    }

    const payableRows: PrepaidPayableRow[] = []
    const exactBySource = new Map<string, number>()
    for (const allocation of allocations) {
      if (allocation.sourceOwnerId === identity.ownerFrontendUserId) continue
      exactBySource.set(
        allocation.sourceOwnerId,
        (exactBySource.get(allocation.sourceOwnerId) ?? 0) + allocation.exactTransferAmount
      )
    }
    for (const [sourceOwnerId, exact] of exactBySource) {
      const payable: PrepaidPayableRow = {
        id: nextId(),
        consumptionId,
        sourceOwnerId,
        consumerOwnerId: identity.ownerFrontendUserId,
        exactAmount: round(exact, 8),
        amount: round(exact, 1),
        status: 'PENDING',
        reversalOfId: null,
        createdAt,
        updatedAt: createdAt,
        sourceOwner: accountFor(sourceOwnerId),
        consumerOwner: accountFor(identity.ownerFrontendUserId)
      }
      payables.push(payable)
      payableRows.push(payable)
    }

    const account = accountFor(identity.ownerFrontendUserId)
    const actor = actorAccount(identity)
    const row: PrepaidConsumptionRow = {
      id: consumptionId,
      memberId: member.id,
      consumingFrontendUserId: identity.ownerFrontendUserId,
      actorUserId: identity.actorUserId,
      kind: 'CONSUMPTION',
      amount: fromCents(amountCents),
      sheetId: payload.sheetId,
      sampleBlockId: payload.sampleBlockId,
      sampleIndex: payload.sampleIndex,
      sampleNumberSnapshot: payload.sampleNumberSnapshot ?? null,
      sampleCountSnapshot: payload.sampleCountSnapshot ?? 1,
      elementsSnapshot: payload.elementsSnapshot ?? {},
      phoneSnapshot: phone,
      sheetDate: payload.sheetDate,
      active: true,
      reversalOfId: null,
      idempotencyKey,
      createdAt,
      consumingFrontendUser: account,
      actorUser: actor,
      allocations,
      payables: payableRows
    }
    consumptions.push(row)
    touchMember(member)
    appendLedger(member.id, 'CONSUMPTION', -row.amount, identity, 'SharedPrepaidConsumption', row.id, idempotencyKey)
    return clone(row)
  })
}

export async function mockReversePrepaidRecharge(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidRechargeMutationResult> {
  return runIdempotent(idempotencyKey, ['REVERSE_RECHARGE', identity, id, payload], () => {
    const recharge = recharges.find((row) => row.id === id)
    if (!recharge) throw mockError(404, '充值记录不存在')
    if (!identity.isFrontendMainAccount || recharge.ownerFrontendUserId !== identity.ownerFrontendUserId) {
      throw mockError(403, '只有充值归属主账号可以冲正充值')
    }
    requireReason(payload.reason)
    if (recharge.reversedAt) throw mockError(409, '该充值已冲正')
    if (recharge.remainingCents !== recharge.totalCents) throw mockError(409, '该充值已有消费记录，请先冲正相关消费')
    const member = requireMember(recharge.memberId)
    const reversedAt = nextTimestamp()
    recharge.reversedAt = reversedAt
    recharge.updatedAt = reversedAt
    const ledger = appendLedger(member.id, 'RECHARGE_REVERSAL', -recharge.totalAmount, identity, 'SharedPrepaidRecharge', id, idempotencyKey, payload.reason)
    recharge.reversedByLedgerId = ledger.id
    touchMember(member)
    return rechargeMutationResult(recharge, member)
  })
}

export async function mockReversePrepaidConsumption(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidConsumptionReversalResult> {
  return runIdempotent(idempotencyKey, ['REVERSE_CONSUMPTION', identity, id, payload], () => {
    const original = consumptions.find((row) => row.id === id && row.kind === 'CONSUMPTION')
    if (!original) throw mockError(404, '消费记录不存在')
    if (!identity.isFrontendMainAccount || original.consumingFrontendUserId !== identity.ownerFrontendUserId) {
      throw mockError(403, '只有消费归属主账号可以冲正消费')
    }
    requireReason(payload.reason)
    if (!original.active) throw mockError(409, '该消费已冲正')
    if (original.payables.some((row) => row.status === 'HELD')) throw mockError(409, '该消费正在结算，不能冲正')
    const member = requireMember(original.memberId)
    const createdAt = nextTimestamp()
    registerAccount(identity)
    const reversalId = nextId()
    const reversalPayables: PrepaidPayableRow[] = []
    const reversal: PrepaidConsumptionRow = {
      id: reversalId,
      memberId: original.memberId,
      consumingFrontendUserId: original.consumingFrontendUserId,
      actorUserId: identity.actorUserId,
      kind: 'REVERSAL',
      amount: original.amount,
      sheetId: original.sheetId,
      sampleBlockId: original.sampleBlockId,
      sampleIndex: original.sampleIndex,
      sampleNumberSnapshot: original.sampleNumberSnapshot,
      sampleCountSnapshot: original.sampleCountSnapshot,
      elementsSnapshot: clone(original.elementsSnapshot),
      phoneSnapshot: original.phoneSnapshot,
      sheetDate: original.sheetDate,
      active: false,
      reversalOfId: original.id,
      idempotencyKey,
      createdAt,
      consumingFrontendUser: clone(original.consumingFrontendUser),
      actorUser: actorAccount(identity),
      allocations: [],
      payables: reversalPayables
    }
    for (const allocation of original.allocations) {
      const recharge = recharges.find((row) => row.id === allocation.rechargeId)
      if (recharge) {
        recharge.remainingCents += Math.round(allocation.allocatedAmount * 100)
        recharge.remainingAmount = fromCents(recharge.remainingCents)
        recharge.updatedAt = createdAt
      }
    }
    for (const payable of original.payables) {
      if (payable.status === 'PENDING') payable.status = 'REVERSED'
      else if (payable.status === 'COMPLETED') {
        const opposite: PrepaidPayableRow = {
          ...payable,
          id: nextId(),
          consumptionId: reversalId,
          sourceOwnerId: payable.consumerOwnerId,
          consumerOwnerId: payable.sourceOwnerId,
          status: 'PENDING',
          reversalOfId: payable.id,
          createdAt,
          updatedAt: createdAt,
          sourceOwner: payable.consumerOwner,
          consumerOwner: payable.sourceOwner
        }
        payables.push(opposite)
        reversalPayables.push(opposite)
      }
      payable.updatedAt = createdAt
    }
    original.active = false
    consumptions.push(reversal)
    touchMember(member)
    appendLedger(member.id, 'CONSUMPTION_REVERSAL', original.amount, identity, 'SharedPrepaidConsumption', reversalId, idempotencyKey, payload.reason)
    return {
      id: reversalId,
      reversalOfId: original.id,
      memberId: member.id,
      consumingFrontendUserId: original.consumingFrontendUserId,
      actorUserId: identity.actorUserId,
      amount: original.amount,
      balance: memberBalance(member.id),
      reason: payload.reason.trim(),
      createdAt
    }
  })
}

export async function mockPreviewPrepaidSettlement(
  payload: PrepaidSettlementSelectionPayload,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementPreview> {
  return clone(selectSettlement(payload.payableIds, identity))
}

export async function mockCreatePrepaidSettlement(
  payload: PrepaidSettlementSelectionPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementRow> {
  if (!identity.isFrontendMainAccount) throw mockError(403, '只有主账号可以创建结算单')
  return runIdempotent(idempotencyKey, ['CREATE_SETTLEMENT', identity, [...payload.payableIds].sort()], () => {
    const preview = selectSettlement(payload.payableIds, identity)
    if (preview.payerFrontendUserId && preview.payerFrontendUserId !== identity.ownerFrontendUserId) {
      throw mockError(403, '只有最终付款主账号可以创建该结算单')
    }
    const createdAt = nextTimestamp()
    preview.lines.forEach((line) => {
      const payable = requirePayable(line.payableId)
      payable.status = 'HELD'
      payable.updatedAt = createdAt
    })
    const row: MockSettlement = {
      id: nextId(),
      accountAId: preview.accountAId,
      accountBId: preview.accountBId,
      aToBAmount: preview.aToBAmount,
      bToAAmount: preview.bToAAmount,
      netAmount: preview.netAmount,
      payerFrontendUserId: preview.payerFrontendUserId,
      receiverFrontendUserId: preview.receiverFrontendUserId,
      status: preview.netAmount === 0 ? 'AWAITING_RECEIPT' : 'AWAITING_PAYMENT',
      actualTransferredAt: null,
      proofUrls: [],
      remark: null,
      createdById: identity.actorUserId,
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
      idempotencyKey,
      createdAt,
      updatedAt: createdAt,
      creatorOwnerId: identity.ownerFrontendUserId,
      lines: preview.lines.map((line) => ({
        id: nextId(),
        payableId: line.payableId,
        consumptionId: line.consumptionId,
        sourceOwnerId: line.sourceOwnerId,
        consumerOwnerId: line.consumerOwnerId,
        direction: line.direction,
        amount: line.amount,
        payableStatus: 'HELD',
        releasedAt: null,
        createdAt
      }))
    }
    settlements.push(row)
    return settlementResult(row)
  })
}

export async function mockSubmitPrepaidSettlementPayment(
  id: string,
  payload: PrepaidSettlementPaymentPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementRow> {
  return settlementAction(id, idempotencyKey, identity, ['SUBMIT_PAYMENT', payload], (row, now) => {
    if (!identity.isFrontendMainAccount || row.payerFrontendUserId !== identity.ownerFrontendUserId) throw mockError(403, '只有付款主账号可以提交转账')
    if (row.status !== 'AWAITING_PAYMENT') throw mockError(409, '结算单状态已变化')
    if (!payload.actualTransferredAt || Number.isNaN(Date.parse(payload.actualTransferredAt))) throw mockError(400, '实际转账时间格式错误')
    row.status = 'AWAITING_RECEIPT'
    row.actualTransferredAt = new Date(payload.actualTransferredAt).toISOString()
    row.proofUrls = [...(payload.proofUrls ?? [])]
    row.remark = optionalText(payload.remark)
    row.paymentSubmittedById = identity.actorUserId
    row.paymentSubmittedAt = now
  })
}

export async function mockConfirmPrepaidSettlement(
  id: string,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementRow> {
  return settlementAction(id, idempotencyKey, identity, ['CONFIRM'], (row, now) => {
    assertSettlementReceiptActor(row, identity)
    if (row.status !== 'AWAITING_RECEIPT') throw mockError(409, '结算单状态已变化')
    row.status = 'COMPLETED'
    row.receiptConfirmedById = identity.actorUserId
    row.receiptConfirmedAt = now
    for (const line of row.lines) requirePayable(line.payableId).status = 'COMPLETED'
  })
}

export async function mockRejectPrepaidSettlement(
  id: string,
  payload: PrepaidReasonPayload,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementRow> {
  requireReason(payload.reason)
  return settlementAction(id, idempotencyKey, identity, ['REJECT', payload.reason.trim()], (row, now) => {
    assertSettlementReceiptActor(row, identity)
    if (row.status !== 'AWAITING_RECEIPT') throw mockError(409, '结算单状态已变化')
    row.status = 'REJECTED'
    row.rejectedById = identity.actorUserId
    row.rejectedAt = now
    row.rejectionReason = payload.reason.trim()
    releaseSettlement(row, now)
  })
}

export async function mockCancelPrepaidSettlement(
  id: string,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity = readIdentity()
): Promise<PrepaidSettlementRow> {
  return settlementAction(id, idempotencyKey, identity, ['CANCEL'], (row, now) => {
    if (!identity.isFrontendMainAccount || identity.ownerFrontendUserId !== row.creatorOwnerId) throw mockError(403, '只有创建主账号可以取消结算')
    if (row.status !== 'AWAITING_PAYMENT' && !(row.netAmount === 0 && row.status === 'AWAITING_RECEIPT')) {
      throw mockError(409, '当前结算单不能取消')
    }
    row.status = 'CANCELLED'
    row.cancelledById = identity.actorUserId
    row.cancelledAt = now
    releaseSettlement(row, now)
  })
}

async function settlementAction(
  id: string,
  idempotencyKey: string,
  identity: MockSharedPrepaidIdentity,
  fingerprint: unknown,
  mutate: (row: MockSettlement, now: string) => void
) {
  return runIdempotent<PrepaidSettlementRow>(idempotencyKey, [id, identity, fingerprint], () => {
    const row = settlements.find((item) => item.id === id)
    if (!row) throw mockError(404, '结算单不存在')
    const now = nextTimestamp()
    mutate(row, now)
    row.version += 1
    row.updatedAt = now
    return settlementResult(row)
  })
}

function selectSettlement(payableIds: string[], identity: MockSharedPrepaidIdentity): PrepaidSettlementPreview {
  if (!payableIds.length || new Set(payableIds).size !== payableIds.length) throw mockError(400, '请选择不重复的待结算明细')
  const rows = payableIds.map(requirePayable).sort((left, right) => left.id.localeCompare(right.id))
  if (rows.some((row) => row.status !== 'PENDING')) throw mockError(409, '部分应转款已被其他结算单占用')
  const accountAId = identity.ownerFrontendUserId
  const counterparties = new Set<string>()
  rows.forEach((row) => {
    if (row.sourceOwnerId === accountAId) counterparties.add(row.consumerOwnerId)
    else if (row.consumerOwnerId === accountAId) counterparties.add(row.sourceOwnerId)
    else throw mockError(403, '不能结算与当前主账号无关的应转款')
  })
  if (counterparties.size !== 1) throw mockError(400, '一张结算单只能包含同一对主账号')
  const accountBId = [...counterparties][0]
  const aToBAmount = round(rows.filter((row) => row.sourceOwnerId === accountAId).reduce((sum, row) => sum + row.amount, 0), 1)
  const bToAAmount = round(rows.filter((row) => row.sourceOwnerId === accountBId).reduce((sum, row) => sum + row.amount, 0), 1)
  const signedNet = round(aToBAmount - bToAAmount, 1)
  return {
    accountAId,
    accountBId,
    aToBAmount,
    bToAAmount,
    netAmount: Math.abs(signedNet),
    payerFrontendUserId: signedNet > 0 ? accountAId : signedNet < 0 ? accountBId : null,
    receiverFrontendUserId: signedNet > 0 ? accountBId : signedNet < 0 ? accountAId : null,
    lines: rows.map((row) => ({
      payableId: row.id,
      consumptionId: row.consumptionId,
      sourceOwnerId: row.sourceOwnerId,
      consumerOwnerId: row.consumerOwnerId,
      direction: row.sourceOwnerId === accountAId ? 'A_TO_B' : 'B_TO_A',
      amount: row.amount,
      status: row.status,
      createdAt: row.createdAt
    }))
  }
}

function settlementResult(row: MockSettlement): PrepaidSettlementRow {
  const result = clone(row) as MockSettlement
  delete (result as Partial<MockSettlement>).creatorOwnerId
  result.lines.forEach((line) => {
    line.payableStatus = requirePayable(line.payableId).status
  })
  return result
}

function releaseSettlement(row: MockSettlement, now: string) {
  row.lines.forEach((line) => {
    const payable = requirePayable(line.payableId)
    payable.status = 'PENDING'
    payable.updatedAt = now
    line.releasedAt = now
  })
}

function assertSettlementReceiptActor(row: MockSettlement, identity: MockSharedPrepaidIdentity) {
  if (!identity.isFrontendMainAccount) throw mockError(403, '只有收款主账号可以处理到账')
  if (row.receiverFrontendUserId) {
    if (identity.ownerFrontendUserId !== row.receiverFrontendUserId) {
      throw mockError(403, '只有收款主账号可以处理到账')
    }
    return
  }
  const isParticipant = identity.ownerFrontendUserId === row.accountAId ||
    identity.ownerFrontendUserId === row.accountBId
  if (!isParticipant || identity.actorUserId === row.createdById) {
    throw mockError(403, '零差额结算只能由另一参与主账号处理到账')
  }
}

function toMemberRow(member: MockMember): PrepaidMemberRow {
  const activeRecharges = recharges.filter((row) => row.memberId === member.id && !row.reversedAt)
  const activeConsumptions = consumptions.filter((row) => row.memberId === member.id && row.active && row.kind === 'CONSUMPTION')
  const ownerBalances = new Map<string, number>()
  activeRecharges.forEach((row) => {
    if (row.remainingCents > 0) ownerBalances.set(row.ownerFrontendUserId, (ownerBalances.get(row.ownerFrontendUserId) ?? 0) + row.remainingCents)
  })
  return clone({
    id: member.id,
    phone: member.phone,
    paidTotal: fromCents(activeRecharges.reduce((sum, row) => sum + row.paidCents, 0)),
    giftTotal: fromCents(activeRecharges.reduce((sum, row) => sum + row.giftCents, 0)),
    consumedTotal: round(activeConsumptions.reduce((sum, row) => sum + row.amount, 0), 2),
    balance: memberBalance(member.id),
    version: member.version,
    ownerComposition: [...ownerBalances]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([ownerFrontendUserId, cents]) => {
        const account = accountFor(ownerFrontendUserId)
        return {
          ownerFrontendUserId,
          ownerAccount: account.account,
          ownerUsername: account.username,
          ownerDisplayName: account.displayRemark || account.username,
          balance: fromCents(cents)
        }
      }),
    latestRechargeTime: latestTime(activeRecharges),
    latestConsumptionTime: latestTime(activeConsumptions),
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  })
}

function toRechargeRow(row: MockRecharge): PrepaidRechargeRow {
  const { idempotencyKey: _key, paidCents: _paid, giftCents: _gift, totalCents: _total, remainingCents: _remaining, ...result } = row
  return clone(result)
}

function toMemberRechargeRow(row: MockRecharge): PrepaidMemberRechargeRow {
  const { phone: _phone, ...result } = toRechargeRow(row)
  return result
}

function toRechargeLotRow(row: MockRecharge): PrepaidRechargeLotRow {
  return {
    id: row.id,
    memberId: row.memberId,
    ownerFrontendUserId: row.ownerFrontendUserId,
    actorUserId: row.actorUserId,
    rechargeDate: row.rechargeDate,
    paidAmount: row.paidAmount,
    giftAmount: row.giftAmount,
    totalAmount: row.totalAmount,
    remainingAmount: row.remainingAmount,
    isOpeningBalance: row.isOpeningBalance,
    remark: row.remark,
    idempotencyKey: row.idempotencyKey,
    reversedAt: row.reversedAt,
    reversedByLedgerId: row.reversedByLedgerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function rechargeMutationResult(row: MockRecharge, member: MockMember): PrepaidRechargeMutationResult {
  return clone({
    id: row.id,
    memberId: row.memberId,
    phone: row.phone,
    ownerFrontendUserId: row.ownerFrontendUserId,
    actorUserId: row.actorUserId,
    rechargeDate: row.rechargeDate,
    paidAmount: row.paidAmount,
    giftAmount: row.giftAmount,
    totalAmount: row.totalAmount,
    remainingAmount: row.remainingAmount,
    balance: memberBalance(member.id),
    isOpeningBalance: row.isOpeningBalance,
    remark: row.remark,
    reversedAt: row.reversedAt,
    createdAt: row.createdAt
  })
}

function appendLedger(
  memberId: string,
  kind: PrepaidLedgerEntryRow['kind'],
  balanceDelta: number,
  identity: MockSharedPrepaidIdentity,
  referenceType: string,
  referenceId: string,
  idempotencyKey: string,
  reason: string | null = null
) {
  const row: PrepaidLedgerEntryRow = {
    id: nextId(),
    memberId,
    kind,
    balanceDelta,
    ownerFrontendUserId: identity.ownerFrontendUserId,
    actorUserId: identity.actorUserId,
    referenceType,
    referenceId,
    idempotencyKey,
    requestFingerprint: null,
    responseSnapshot: null,
    reason,
    createdAt: nextTimestamp()
  }
  ledgerEntries.push(row)
  return row
}

function findOrCreateMember(phone: string) {
  const existing = members.find((row) => row.phone === phone)
  if (existing) return existing
  const createdAt = nextTimestamp()
  const member = { id: nextId(), phone, version: 1, createdAt, updatedAt: createdAt }
  members.push(member)
  return member
}

function requireMember(id: string) {
  const member = members.find((row) => row.id === id)
  if (!member) throw mockError(404, '预存款会员不存在')
  return member
}

function requirePayable(id: string) {
  const payable = payables.find((row) => row.id === id)
  if (!payable) throw mockError(404, '应转款明细不存在')
  return payable
}

function registerAccount(identity: MockSharedPrepaidIdentity) {
  if (!accounts.has(identity.ownerFrontendUserId)) {
    accounts.set(identity.ownerFrontendUserId, {
      id: identity.ownerFrontendUserId,
      account: identity.account,
      username: identity.username,
      displayRemark: identity.displayRemark ?? null
    })
  }
}

function accountFor(id: string): PrepaidAccountRow {
  return clone(accounts.get(id) ?? { id, account: id, username: id, displayRemark: null })
}

function actorAccount(identity: MockSharedPrepaidIdentity): PrepaidAccountRow {
  return {
    id: identity.actorUserId,
    account: identity.account,
    username: identity.username,
    displayRemark: identity.displayRemark ?? null
  }
}

function readIdentity(): MockSharedPrepaidIdentity {
  let user: Partial<AuthUser> | null = null
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem('ys_user')
    if (raw) user = JSON.parse(raw) as AuthUser
  } catch {
    user = null
  }
  const actorUserId = user?.id || 'u-admin'
  return {
    actorUserId,
    ownerFrontendUserId: user?.dataOwnerId || actorUserId,
    account: user?.account || 'demo-account',
    username: user?.username || '演示主账号',
    isFrontendMainAccount: user?.isFrontendMainAccount !== false && user?.role !== 'FRONTEND_SUB_USER'
  }
}

function touchMember(member: MockMember) {
  member.version += 1
  member.updatedAt = nextTimestamp()
}

function memberBalance(memberId: string) {
  return fromCents(recharges
    .filter((row) => row.memberId === memberId && !row.reversedAt)
    .reduce((sum, row) => sum + row.remainingCents, 0))
}

function paginate<T>(rows: T[], pageValue?: number, pageSizeValue?: number): PrepaidPage<T> {
  const page = Number.isInteger(pageValue) && Number(pageValue) > 0 ? Number(pageValue) : 1
  const pageSize = Number.isInteger(pageSizeValue) && Number(pageSizeValue) > 0
    ? Math.min(Number(pageSizeValue), 100)
    : 20
  return clone({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize })
}

function runIdempotent<T>(key: string, input: unknown, create: () => T): T {
  if (!key) throw mockError(400, '缺少幂等请求编号')
  const fingerprint = JSON.stringify(input)
  const existing = idempotentRecords.get(key)
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw mockError(409, '幂等请求编号已用于其他操作', 'PREPAID_IDEMPOTENCY_CONFLICT')
    return clone(existing.response as T)
  }
  const result = create()
  idempotentRecords.set(key, { fingerprint, response: clone(result) })
  return clone(result)
}

function moneyToCents(value: unknown, label: string, positive = false) {
  const text = String(value ?? '').trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw mockError(400, `${label}必须是最多两位小数`)
  const cents = Math.round(Number(text) * 100)
  if (!Number.isSafeInteger(cents) || (positive ? cents <= 0 : cents < 0)) throw mockError(400, `${label}数值无效`)
  return cents
}

function requireReason(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw mockError(400, '请填写冲正或驳回原因')
}

function optionalText(value: unknown) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

function nextId() {
  const suffix = String(sequence++).padStart(12, '0')
  return `00000000-0000-4000-8000-${suffix}`
}

function nextTimestamp() {
  return new Date(MOCK_EPOCH + clockTick++ * 1000).toISOString()
}

function fromCents(value: number) {
  return value / 100
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function latestTime(rows: Array<{ createdAt: string }>) {
  return rows.reduce<string | null>((latest, row) => !latest || row.createdAt > latest ? row.createdAt : latest, null)
}

function descendingCreatedAt(left: { createdAt: string; id: string }, right: { createdAt: string; id: string }) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function mockError(status: number, message: string, code?: string) {
  const error = new Error(message) as Error & { response: { status: number; data: { message: string; code?: string } } }
  error.response = { status, data: { message, ...(code ? { code } : {}) } }
  return error
}
