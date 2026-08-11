export type PrepaidConsumptionKind = 'CONSUMPTION' | 'REVERSAL'
export type PrepaidPayableStatus = 'PENDING' | 'HELD' | 'COMPLETED' | 'REVERSED'
export type PrepaidSettlementStatus =
  | 'AWAITING_PAYMENT'
  | 'AWAITING_RECEIPT'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
export type PrepaidLedgerKind =
  | 'RECHARGE'
  | 'CONSUMPTION'
  | 'CONSUMPTION_REVERSAL'
  | 'RECHARGE_REVERSAL'

export interface PrepaidAccountRow {
  id: string
  account: string
  username: string
  displayRemark: string | null
}

export interface PrepaidAccountFilterOption {
  id: string
  account: string
  label: string
}

export interface PrepaidConsumptionFilterOptions {
  sourceOwners: PrepaidAccountFilterOption[]
  consumingOwners: PrepaidAccountFilterOption[]
}

export interface PrepaidOwnerCompositionRow {
  ownerFrontendUserId: string
  ownerAccount: string
  ownerUsername: string
  ownerDisplayName: string
  balance: number
}

export interface PrepaidMemberRow {
  id: string
  phone: string
  paidTotal: number
  giftTotal: number
  consumedTotal: number
  balance: number
  version: number
  ownerComposition: PrepaidOwnerCompositionRow[]
  latestRechargeTime: string | null
  latestConsumptionTime: string | null
  createdAt: string
  updatedAt: string
}

export interface PrepaidRechargeBaseRow {
  id: string
  memberId: string
  ownerFrontendUserId: string
  ownerAccount: string
  ownerUsername: string
  actorUserId: string
  actorAccount: string
  actorUsername: string
  rechargeDate: string
  paidAmount: number
  giftAmount: number
  totalAmount: number
  remainingAmount: number
  isOpeningBalance: boolean
  remark: string | null
  reversedAt: string | null
  reversedByLedgerId: string | null
  createdAt: string
  updatedAt: string
}

export interface PrepaidRechargeRow extends PrepaidRechargeBaseRow {
  phone: string
}

// The member-detail endpoint already scopes recharges to one member and omits phone.
export interface PrepaidMemberRechargeRow extends PrepaidRechargeBaseRow {}

export interface PrepaidRechargeLotRow {
  id: string
  memberId: string
  ownerFrontendUserId: string
  actorUserId: string
  rechargeDate: string
  paidAmount: number
  giftAmount: number
  totalAmount: number
  remainingAmount: number
  isOpeningBalance: boolean
  remark: string | null
  idempotencyKey: string
  reversedAt: string | null
  reversedByLedgerId: string | null
  createdAt: string
  updatedAt: string
}

export interface PrepaidAllocationRow {
  id: string
  consumptionId: string
  rechargeId: string
  sourceOwnerId: string
  allocatedAmount: number
  paidRatio: number
  exactTransferAmount: number
  createdAt: string
  recharge: PrepaidRechargeLotRow
  sourceOwner: PrepaidAccountRow
}

export interface PrepaidPayableRow {
  id: string
  consumptionId: string
  sourceOwnerId: string
  consumerOwnerId: string
  exactAmount: number
  amount: number
  status: PrepaidPayableStatus
  reversalOfId: string | null
  createdAt: string
  updatedAt: string
  sourceOwner: PrepaidAccountRow
  consumerOwner: PrepaidAccountRow
}

export interface PrepaidConsumptionRow {
  id: string
  memberId: string
  consumingFrontendUserId: string
  actorUserId: string
  kind: PrepaidConsumptionKind
  amount: number
  sheetId: string
  sampleBlockId: string
  sampleIndex: number
  sampleNumberSnapshot: string | null
  sampleCountSnapshot: number
  elementsSnapshot: unknown
  phoneSnapshot: string
  sheetDate: string
  active: boolean
  reversalOfId: string | null
  idempotencyKey: string
  createdAt: string
  consumingFrontendUser: PrepaidAccountRow
  actorUser: PrepaidAccountRow
  allocations: PrepaidAllocationRow[]
  payables: PrepaidPayableRow[]
}

export type PrepaidConsumptionListRechargeRow = Pick<PrepaidRechargeLotRow,
  'id' | 'ownerFrontendUserId' | 'rechargeDate' | 'paidAmount' | 'giftAmount' | 'totalAmount' |
  'remainingAmount' | 'isOpeningBalance' | 'reversedAt' | 'createdAt'>

export interface PrepaidConsumptionListAllocationRow extends Omit<PrepaidAllocationRow, 'recharge'> {
  recharge: PrepaidConsumptionListRechargeRow
}

export interface PrepaidConsumptionListRow extends Omit<PrepaidConsumptionRow, 'idempotencyKey' | 'allocations'> {
  allocationOrigin: 'DIRECT' | 'REVERSAL_TARGET'
  allocationSourceConsumptionId: string
  allocations: PrepaidConsumptionListAllocationRow[]
  originalPayables: PrepaidPayableRow[]
}

export interface PrepaidLedgerEntryRow {
  id: string
  memberId: string
  kind: PrepaidLedgerKind
  balanceDelta: number
  ownerFrontendUserId: string
  actorUserId: string
  referenceType: string
  referenceId: string
  idempotencyKey: string
  requestFingerprint: string | null
  responseSnapshot: unknown | null
  reason: string | null
  createdAt: string
}

export interface PrepaidMemberDetail extends PrepaidMemberRow {
  recharges: PrepaidMemberRechargeRow[]
  consumptions: PrepaidConsumptionRow[]
  ledgerEntries: PrepaidLedgerEntryRow[]
}

export interface PrepaidSettlementPreviewLine {
  payableId: string
  consumptionId: string
  sourceOwnerId: string
  consumerOwnerId: string
  direction: 'A_TO_B' | 'B_TO_A'
  amount: number
  status: PrepaidPayableStatus
  createdAt: string
}

export interface PrepaidSettlementPreview {
  accountAId: string
  accountBId: string
  aToBAmount: number
  bToAAmount: number
  netAmount: number
  payerFrontendUserId: string | null
  receiverFrontendUserId: string | null
  lines: PrepaidSettlementPreviewLine[]
}

export interface PrepaidSettlementLineRow {
  id: string
  payableId: string
  consumptionId: string
  sourceOwnerId: string
  consumerOwnerId: string
  direction: 'A_TO_B' | 'B_TO_A'
  amount: number
  payableStatus: PrepaidPayableStatus
  releasedAt: string | null
  createdAt: string
}

export interface PrepaidSettlementRow {
  id: string
  accountAId: string
  accountBId: string
  aToBAmount: number
  bToAAmount: number
  netAmount: number
  payerFrontendUserId: string | null
  receiverFrontendUserId: string | null
  status: PrepaidSettlementStatus
  actualTransferredAt: string | null
  proofUrls: string[]
  remark: string | null
  createdById: string
  paymentSubmittedById: string | null
  paymentSubmittedAt: string | null
  receiptConfirmedById: string | null
  receiptConfirmedAt: string | null
  rejectedById: string | null
  rejectedAt: string | null
  rejectionReason: string | null
  cancelledById: string | null
  cancelledAt: string | null
  version: number
  idempotencyKey: string
  createdAt: string
  updatedAt: string
  lines: PrepaidSettlementLineRow[]
}

export interface PrepaidPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PrepaidMemberQuery {
  page?: number
  pageSize?: number
  phone?: string
}

export interface PrepaidRechargeQuery extends PrepaidMemberQuery {
  ownerFrontendUserId?: string
  startDate?: string
  endDate?: string
  isOpeningBalance?: boolean
}

export type PrepaidConsumptionStatusFilter = 'ACTIVE' | 'REVERSED'

export interface PrepaidConsumptionQuery extends PrepaidMemberQuery {
  sourceOwnerId?: string
  consumingFrontendUserId?: string
  startDate?: string
  endDate?: string
  status?: PrepaidConsumptionStatusFilter
  payableStatus?: PrepaidPayableStatus
}

export interface CreatePrepaidRechargePayload {
  phone: string
  rechargeDate: string
  paidAmount: string | number
  giftAmount: string | number
  isOpeningBalance?: boolean
  remark?: string
}

export interface PrepaidReasonPayload {
  reason: string
}

export interface PrepaidSettlementSelectionPayload {
  payableIds: string[]
}

export interface PrepaidSettlementPaymentPayload {
  actualTransferredAt: string
  proofUrls?: string[]
  remark?: string
}

export interface PrepaidRechargeMutationResult {
  id: string
  memberId: string
  phone: string
  ownerFrontendUserId: string
  actorUserId: string
  rechargeDate: string
  paidAmount: number
  giftAmount: number
  totalAmount: number
  remainingAmount: number
  balance: number
  isOpeningBalance: boolean
  remark: string | null
  reversedAt: string | null
  createdAt: string
}

export interface PrepaidConsumptionReversalResult {
  id: string
  reversalOfId: string
  memberId: string
  consumingFrontendUserId: string
  actorUserId: string
  amount: number
  balance: number
  reason: string
  createdAt: string
}
