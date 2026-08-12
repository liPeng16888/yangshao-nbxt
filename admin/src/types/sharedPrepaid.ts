export type AdminSharedPrepaidResource = 'recharges' | 'members' | 'consumptions' | 'settlements'
export type AdminSharedPrepaidStatus =
  | 'ACTIVE'
  | 'REVERSED'
  | 'PENDING'
  | 'HELD'
  | 'COMPLETED'
  | 'AWAITING_PAYMENT'
  | 'AWAITING_RECEIPT'
  | 'REJECTED'
  | 'CANCELLED'

export interface AdminSharedPrepaidAccount {
  id: string
  account: string
  username: string
  displayRemark?: string | null
}

export interface AdminSharedPrepaidQuery {
  frontendUserIds: string[]
  page: number
  pageSize: number
  phone?: string
  ownerFrontendUserId?: string
  sourceOwnerId?: string
  consumingFrontendUserId?: string
  counterpartyFrontendUserId?: string
  startDate?: string
  endDate?: string
  status?: AdminSharedPrepaidStatus
  payableStatus?: AdminSharedPrepaidStatus
  isOpeningBalance?: boolean
}

export interface AdminSharedPrepaidPage<T = AdminSharedPrepaidListRow> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminSharedPrepaidRechargeRow {
  id: string
  phone: string
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
  remark?: string | null
  reversedAt?: string | null
  reversedByLedgerId?: string | null
  createdAt: string
}

export interface AdminSharedPrepaidMemberRow {
  id: string
  phone: string
  paidTotal: number
  giftTotal: number
  consumedTotal: number
  balance: number
  ownerComposition: Array<{
    ownerFrontendUserId: string
    ownerAccount: string
    ownerDisplayName: string
    balance: number
  }>
  latestRechargeTime?: string | null
  latestConsumptionTime?: string | null
}

export interface AdminSharedPrepaidConsumptionRow {
  id: string
  phoneSnapshot: string
  sampleNumberSnapshot?: string | null
  sampleCountSnapshot: number
  elementsSnapshot: unknown
  amount: number
  kind: 'CONSUMPTION' | 'REVERSAL'
  active: boolean
  reversalOfId?: string | null
  consumingFrontendUser: AdminSharedPrepaidAccount
  actorUser: AdminSharedPrepaidAccount
  allocations: Array<{
    id?: string
    sourceOwner: AdminSharedPrepaidAccount
    allocatedAmount?: number
    recharge?: { id: string; rechargeDate: string }
  }>
  payables: Array<{
    id?: string
    status: AdminSharedPrepaidStatus
    amount: number
    sourceOwner?: AdminSharedPrepaidAccount
    consumerOwner?: AdminSharedPrepaidAccount
  }>
  originalPayables?: AdminSharedPrepaidConsumptionRow['payables']
  sheetDate: string
  createdAt: string
}

export interface AdminSharedPrepaidSettlementRow {
  id: string
  accountA: AdminSharedPrepaidAccount
  accountB: AdminSharedPrepaidAccount
  aToBAmount: number
  bToAAmount: number
  grossAmount: number
  netAmount: number
  status: AdminSharedPrepaidStatus
  payerFrontendUserId?: string | null
  receiverFrontendUserId?: string | null
  createdAt: string
}

export type AdminSharedPrepaidListRow =
  | AdminSharedPrepaidRechargeRow
  | AdminSharedPrepaidMemberRow
  | AdminSharedPrepaidConsumptionRow
  | AdminSharedPrepaidSettlementRow

export interface AdminSharedPrepaidDetail extends Record<string, unknown> {
  id: string
  reversal?: {
    reason?: string | null
    actorUser?: AdminSharedPrepaidAccount
    createdAt?: string
  } | null
  reversalReason?: string | null
  proofUrls?: string[]
  rejectionReason?: string | null
  actions?: Array<Record<string, unknown>>
  lines?: Array<Record<string, unknown>>
  recharges?: Array<Record<string, unknown>>
  consumptions?: Array<Record<string, unknown>>
  ledgerEntries?: Array<Record<string, unknown>>
}
