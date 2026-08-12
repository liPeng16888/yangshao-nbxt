import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  Prisma,
  SharedPrepaidConsumptionKind,
  SharedPrepaidLedgerKind,
  SharedPrepaidPayableStatus,
  SharedPrepaidSettlementStatus
} from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { normalizePrepaidPhone, normalizePrepaidPhoneSearch } from './shared-prepaid-money'

export interface SharedPrepaidListQuery {
  page?: number | string
  pageSize?: number | string
  phone?: string
}

export interface SharedPrepaidMemberDetailQuery {
  historyPageSize?: number | string
  rechargePage?: number | string
  consumptionPage?: number | string
  ledgerPage?: number | string
}

export interface SharedPrepaidRechargeQuery extends SharedPrepaidListQuery {
  ownerFrontendUserId?: string
  startDate?: string
  endDate?: string
  isOpeningBalance?: boolean | string
  status?: 'ACTIVE' | 'REVERSED'
}

export interface SharedPrepaidConsumptionQuery extends SharedPrepaidListQuery {
  sourceOwnerId?: string
  consumingFrontendUserId?: string
  startDate?: string
  endDate?: string
  status?: 'ACTIVE' | 'REVERSED'
  payableStatus?: SharedPrepaidPayableStatus
}

export interface SharedPrepaidSettlementPayableQuery extends SharedPrepaidListQuery {
  payableIds?: string[]
  counterpartyFrontendUserId?: string
  direction?: 'OUTGOING' | 'INCOMING'
  status?: SharedPrepaidPayableStatus
  startDate?: string
  endDate?: string
  eligibleOnly?: boolean | string
}

export interface SharedPrepaidSettlementQuery extends SharedPrepaidListQuery {
  counterpartyFrontendUserId?: string
  status?: SharedPrepaidSettlementStatus
  startDate?: string
  endDate?: string
}

export interface AccountRow {
  id: string
  account: string
  username: string
  displayRemark?: string | null
}

interface RechargeRow {
  id: string
  memberId: string
  ownerFrontendUserId: string
  actorUserId: string
  rechargeDate: string
  paidAmount: Prisma.Decimal
  giftAmount: Prisma.Decimal
  totalAmount: Prisma.Decimal
  remainingAmount: Prisma.Decimal
  isOpeningBalance: boolean
  remark: string | null
  reversedAt: Date | null
  reversedByLedgerId: string | null
  createdAt: Date
  updatedAt: Date
  ownerFrontendUser: AccountRow
  actorUser: AccountRow
  member?: { id: string; phone: string }
  reversedByLedger?: {
    id: string
    actorUserId: string
    reason: string | null
    createdAt: Date
    actorUser: AccountRow
  } | null
}

const accountSelect = {
  id: true,
  account: true,
  username: true,
  displayRemark: true
} satisfies Prisma.UserSelect

const publicMemberBaseSelect = {
  id: true,
  phone: true,
  cachedBalance: true,
  version: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.SharedPrepaidMemberSelect

type PublicMemberBaseRow = Prisma.SharedPrepaidMemberGetPayload<{
  select: typeof publicMemberBaseSelect
}>

const publicRechargeSelect = {
  id: true,
  memberId: true,
  ownerFrontendUserId: true,
  actorUserId: true,
  rechargeDate: true,
  paidAmount: true,
  giftAmount: true,
  totalAmount: true,
  remainingAmount: true,
  isOpeningBalance: true,
  remark: true,
  reversedAt: true,
  reversedByLedgerId: true,
  createdAt: true,
  updatedAt: true,
  member: { select: { id: true, phone: true } },
  ownerFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect },
  reversedByLedger: {
    select: {
      id: true,
      actorUserId: true,
      reason: true,
      createdAt: true,
      actorUser: { select: accountSelect }
    }
  }
} satisfies Prisma.SharedPrepaidRechargeSelect

const adminMemberBaseSelect = {
  id: true,
  phone: true,
  cachedBalance: true,
  version: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.SharedPrepaidMemberSelect

const adminLedgerEntrySelect = {
  id: true,
  memberId: true,
  kind: true,
  balanceDelta: true,
  ownerFrontendUserId: true,
  actorUserId: true,
  referenceType: true,
  referenceId: true,
  reason: true,
  createdAt: true,
  ownerFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect }
} satisfies Prisma.SharedPrepaidLedgerEntrySelect

const consumptionRechargeSelect = {
  id: true,
  ownerFrontendUserId: true,
  rechargeDate: true,
  paidAmount: true,
  giftAmount: true,
  totalAmount: true,
  remainingAmount: true,
  isOpeningBalance: true,
  reversedAt: true,
  createdAt: true
} satisfies Prisma.SharedPrepaidRechargeSelect

const consumptionAllocationSelect = {
  id: true,
  consumptionId: true,
  rechargeId: true,
  sourceOwnerId: true,
  allocatedAmount: true,
  paidRatio: true,
  exactTransferAmount: true,
  createdAt: true,
  recharge: { select: consumptionRechargeSelect },
  sourceOwner: { select: accountSelect }
} satisfies Prisma.SharedPrepaidAllocationSelect

const consumptionPayableSelect = {
  id: true,
  consumptionId: true,
  sourceOwnerId: true,
  consumerOwnerId: true,
  exactAmount: true,
  amount: true,
  status: true,
  reversalOfId: true,
  createdAt: true,
  updatedAt: true,
  sourceOwner: { select: accountSelect },
  consumerOwner: { select: accountSelect }
} satisfies Prisma.SharedPrepaidPayableSelect

const consumptionListSelect = {
  id: true,
  memberId: true,
  consumingFrontendUserId: true,
  actorUserId: true,
  kind: true,
  amount: true,
  sheetId: true,
  sampleBlockId: true,
  sampleIndex: true,
  sampleNumberSnapshot: true,
  sampleCountSnapshot: true,
  elementsSnapshot: true,
  phoneSnapshot: true,
  sheetDate: true,
  active: true,
  reversalOfId: true,
  createdAt: true,
  consumingFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect },
  allocations: {
    select: consumptionAllocationSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 101
  },
  payables: {
    select: consumptionPayableSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 101
  },
  reversalOf: {
    select: {
      id: true,
      allocations: {
        select: consumptionAllocationSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 101
      },
      payables: {
        select: consumptionPayableSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 101
      }
    }
  }
} satisfies Prisma.SharedPrepaidConsumptionSelect

const ADMIN_CONSUMPTION_RELATION_LIMIT = 100

const adminConsumptionSummarySelect = {
  id: true,
  memberId: true,
  consumingFrontendUserId: true,
  actorUserId: true,
  kind: true,
  amount: true,
  sampleNumberSnapshot: true,
  sampleCountSnapshot: true,
  elementsSnapshot: true,
  phoneSnapshot: true,
  sheetDate: true,
  active: true,
  reversalOfId: true,
  createdAt: true,
  consumingFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect }
} satisfies Prisma.SharedPrepaidConsumptionSelect

const adminConsumptionDetailSelect = {
  ...adminConsumptionSummarySelect,
  sheetId: true,
  sampleBlockId: true,
  sampleIndex: true,
  allocations: {
    select: consumptionAllocationSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: ADMIN_CONSUMPTION_RELATION_LIMIT + 1
  },
  payables: {
    select: consumptionPayableSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: ADMIN_CONSUMPTION_RELATION_LIMIT + 1
  },
  reversalOf: {
    select: {
      id: true,
      allocations: {
        select: consumptionAllocationSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ADMIN_CONSUMPTION_RELATION_LIMIT + 1
      },
      payables: {
        select: consumptionPayableSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ADMIN_CONSUMPTION_RELATION_LIMIT + 1
      }
    }
  },
  reversal: { select: { id: true } }
} satisfies Prisma.SharedPrepaidConsumptionSelect

const settlementConsumptionSelect = {
  id: true,
  memberId: true,
  phoneSnapshot: true,
  sampleNumberSnapshot: true,
  sampleCountSnapshot: true,
  elementsSnapshot: true,
  sheetDate: true,
  createdAt: true,
  allocations: {
    select: {
      id: true,
      sourceOwnerId: true,
      rechargeId: true,
      recharge: {
        select: { id: true, rechargeDate: true, isOpeningBalance: true }
      }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  }
} satisfies Prisma.SharedPrepaidConsumptionSelect

const settlementPayableCoreSelect = {
  id: true,
  consumptionId: true,
  sourceOwnerId: true,
  consumerOwnerId: true,
  exactAmount: true,
  amount: true,
  status: true,
  reversalOfId: true,
  createdAt: true,
  updatedAt: true,
  sourceOwner: { select: accountSelect },
  consumerOwner: { select: accountSelect },
  consumption: { select: settlementConsumptionSelect }
} satisfies Prisma.SharedPrepaidPayableSelect

const settlementPayableListSelect = {
  ...settlementPayableCoreSelect,
  settlementLines: {
    select: {
      id: true,
      settlementId: true,
      direction: true,
      amount: true,
      releasedAt: true,
      createdAt: true,
      settlement: { select: { id: true, status: true, createdAt: true } }
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  }
} satisfies Prisma.SharedPrepaidPayableSelect

const settlementSummarySelect = {
  id: true,
  accountAId: true,
  accountBId: true,
  aToBAmount: true,
  bToAAmount: true,
  netAmount: true,
  payerFrontendUserId: true,
  receiverFrontendUserId: true,
  status: true,
  createdAt: true,
  accountA: { select: accountSelect },
  accountB: { select: accountSelect }
} satisfies Prisma.SharedPrepaidSettlementSelect

const settlementReadSelect = {
  id: true,
  accountAId: true,
  accountBId: true,
  aToBAmount: true,
  bToAAmount: true,
  netAmount: true,
  payerFrontendUserId: true,
  receiverFrontendUserId: true,
  status: true,
  actualTransferredAt: true,
  proofUrls: true,
  remark: true,
  createdById: true,
  paymentSubmittedById: true,
  paymentSubmittedAt: true,
  receiptConfirmedById: true,
  receiptConfirmedAt: true,
  rejectedById: true,
  rejectedAt: true,
  rejectionReason: true,
  cancelledById: true,
  cancelledAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  accountA: { select: accountSelect },
  accountB: { select: accountSelect },
  payerFrontendUser: { select: accountSelect },
  receiverFrontendUser: { select: accountSelect },
  createdBy: { select: accountSelect },
  paymentSubmittedBy: { select: accountSelect },
  receiptConfirmedBy: { select: accountSelect },
  rejectedBy: { select: accountSelect },
  cancelledBy: { select: accountSelect },
  lines: {
    select: {
      id: true,
      payableId: true,
      direction: true,
      amount: true,
      releasedAt: true,
      createdAt: true,
      payable: { select: settlementPayableCoreSelect }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  },
  actions: {
    select: {
      id: true,
      operation: true,
      actorUserId: true,
      actorFrontendUserId: true,
      createdAt: true,
      actorUser: { select: accountSelect },
      actorFrontendUser: { select: accountSelect }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  }
} satisfies Prisma.SharedPrepaidSettlementSelect

type SettlementPayableDatabaseRow = Prisma.SharedPrepaidPayableGetPayload<{
  select: typeof settlementPayableListSelect
}>
type SettlementPayableCoreDatabaseRow = Prisma.SharedPrepaidPayableGetPayload<{
  select: typeof settlementPayableCoreSelect
}>
type SettlementSummaryDatabaseRow = Prisma.SharedPrepaidSettlementGetPayload<{
  select: typeof settlementSummarySelect
}>
type SettlementReadDatabaseRow = Prisma.SharedPrepaidSettlementGetPayload<{
  select: typeof settlementReadSelect
}>

type ConsumptionListDatabaseRow = Prisma.SharedPrepaidConsumptionGetPayload<{
  select: typeof consumptionListSelect
}>
type AdminConsumptionDetailDatabaseRow = Prisma.SharedPrepaidConsumptionGetPayload<{
  select: typeof adminConsumptionDetailSelect
}>
type AdminConsumptionSummaryDatabaseRow = Prisma.SharedPrepaidConsumptionGetPayload<{
  select: typeof adminConsumptionSummarySelect
}>
type AdminConsumptionSourceRow = AccountRow & {
  consumptionId: string
  sourceOwnerId: string
}
type AdminConsumptionAggregateRow = {
  memberId: string
  consumedTotal: Prisma.Decimal
  latestConsumptionTime: Date | null
}
type AdminMemberBaseRow = Prisma.SharedPrepaidMemberGetPayload<{
  select: typeof adminMemberBaseSelect
}>

const ADMIN_DETAIL_HISTORY_LIMIT = 50
const PUBLIC_MEMBER_HISTORY_LIMIT = 100
const PUBLIC_CONSUMPTION_RELATION_LIMIT = 100

const publicMemberLedgerSelect = {
  id: true,
  memberId: true,
  kind: true,
  balanceDelta: true,
  ownerFrontendUserId: true,
  actorUserId: true,
  referenceType: true,
  referenceId: true,
  reason: true,
  createdAt: true
} satisfies Prisma.SharedPrepaidLedgerEntrySelect

@Injectable()
export class SharedPrepaidQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getLabMemberByPhone(phone: unknown) {
    let normalizedPhone: string
    try {
      normalizedPhone = normalizePrepaidPhone(phone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }
    const member = await this.prisma.sharedPrepaidMember.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true, phone: true, cachedBalance: true }
    })
    if (!member) return null
    return {
      id: member.id,
      phone: member.phone,
      currentBalance: member.cachedBalance.toNumber()
    }
  }

  async getMemberByPhone(phone: unknown) {
    let normalizedPhone: string
    try {
      normalizedPhone = normalizePrepaidPhone(phone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }
    const member = await this.prisma.sharedPrepaidMember.findUnique({
      where: { phone: normalizedPhone },
      select: publicMemberBaseSelect
    })
    return member ? (await this.publicMemberSummaries([member]))[0] ?? null : null
  }

  async listMembers(query: SharedPrepaidListQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const phone = this.phoneSearch(query.phone)
    const where: Prisma.SharedPrepaidMemberWhereInput = phone ? { phone: { contains: phone } } : {}
    const [members, total] = await Promise.all([
      this.prisma.sharedPrepaidMember.findMany({
        where,
        select: publicMemberBaseSelect,
        orderBy: [{ phone: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidMember.count({ where })
    ])

    return {
      items: await this.publicMemberSummaries(members),
      total,
      page,
      pageSize
    }
  }

  async listRecharges(query: SharedPrepaidRechargeQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.rechargeWhere(query)

    const [recharges, total] = await Promise.all([
      this.prisma.sharedPrepaidRecharge.findMany({
        where,
        select: publicRechargeSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidRecharge.count({ where })
    ])
    return {
      items: recharges.map((recharge) => this.toRechargeRow(recharge as RechargeRow)),
      total,
      page,
      pageSize
    }
  }

  async listConsumptions(query: SharedPrepaidConsumptionQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.consumptionWhere(query)
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidConsumption.findMany({
        where,
        select: consumptionListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidConsumption.count({ where })
    ])

    return {
      items: rows.map((row) => this.toConsumptionListRow(row)),
      total,
      page,
      pageSize
    }
  }

  async listConsumptionFilterOptions() {
    const [allocationSources, consumptionOwners] = await Promise.all([
      this.prisma.sharedPrepaidAllocation.findMany({
        distinct: ['sourceOwnerId'],
        select: { sourceOwner: { select: accountSelect } },
        orderBy: { sourceOwnerId: 'asc' }
      }),
      this.prisma.sharedPrepaidConsumption.findMany({
        distinct: ['consumingFrontendUserId'],
        select: { consumingFrontendUser: { select: accountSelect } },
        orderBy: { consumingFrontendUserId: 'asc' }
      })
    ])
    return {
      sourceOwners: this.accountOptions(allocationSources.map((row) => row.sourceOwner)),
      consumingOwners: this.accountOptions(consumptionOwners.map((row) => row.consumingFrontendUser))
    }
  }

  async listAdminMembers(allowedFrontendUserIds: string[], query: SharedPrepaidListQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const phone = this.phoneSearch(query.phone)
    const where: Prisma.SharedPrepaidMemberWhereInput = {
      ...(phone ? { phone: { contains: phone } } : {}),
      OR: this.adminMemberParticipation(allowedFrontendUserIds)
    }
    const [members, total] = await Promise.all([
      this.prisma.sharedPrepaidMember.findMany({
        where,
        select: adminMemberBaseSelect,
        orderBy: [{ phone: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidMember.count({ where })
    ])

    return {
      items: await this.adminMemberSummaries(members, allowedFrontendUserIds),
      total,
      page,
      pageSize
    }
  }

  async listAdminRecharges(
    allowedFrontendUserIds: string[],
    query: SharedPrepaidRechargeQuery = {}
  ) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.rechargeWhere(query)
    const requestedOwnerId = String(query.ownerFrontendUserId ?? '').trim()
    where.ownerFrontendUserId = requestedOwnerId
      ? (allowedFrontendUserIds.includes(requestedOwnerId) ? requestedOwnerId : { in: [] })
      : { in: allowedFrontendUserIds }
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidRecharge.findMany({
        where,
        select: publicRechargeSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidRecharge.count({ where })
    ])
    return {
      items: rows.map((row) => this.toRechargeRow(row as RechargeRow)),
      total,
      page,
      pageSize
    }
  }

  async listAdminConsumptions(
    allowedFrontendUserIds: string[],
    query: SharedPrepaidConsumptionQuery = {}
  ) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.consumptionWhere(query, allowedFrontendUserIds)
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidConsumption.findMany({
        where,
        select: adminConsumptionSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidConsumption.count({ where })
    ])
    return {
      items: await this.adminConsumptionSummaries(rows),
      total,
      page,
      pageSize
    }
  }

  async listAdminSettlements(
    allowedFrontendUserIds: string[],
    query: SharedPrepaidSettlementQuery = {}
  ) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.adminSettlementWhere(allowedFrontendUserIds, query)
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidSettlement.findMany({
        where,
        select: settlementSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidSettlement.count({ where })
    ])
    return {
      items: rows.map((row) => this.toSettlementSummaryRow(row)),
      total,
      page,
      pageSize
    }
  }

  async getAdminRechargeDetail(allowedFrontendUserIds: string[], id: string) {
    const row = await this.prisma.sharedPrepaidRecharge.findFirst({
      where: { id, ownerFrontendUserId: { in: allowedFrontendUserIds } },
      select: publicRechargeSelect
    })
    if (!row) throw new NotFoundException('充值记录不存在')
    const recharge = row as RechargeRow
    return {
      ...this.toRechargeRow(recharge),
      reversal: recharge.reversedByLedger ? {
        id: recharge.reversedByLedger.id,
        reason: recharge.reversedByLedger.reason,
        actorUserId: recharge.reversedByLedger.actorUserId,
        actorUser: recharge.reversedByLedger.actorUser,
        createdAt: recharge.reversedByLedger.createdAt
      } : null
    }
  }

  async getAdminMemberDetail(allowedFrontendUserIds: string[], id: string) {
    const member = await this.prisma.sharedPrepaidMember.findFirst({
      where: { id, OR: this.adminMemberParticipation(allowedFrontendUserIds) },
      select: adminMemberBaseSelect
    })
    if (!member) throw new NotFoundException('预存款会员不存在')

    const [summaries, recharges, consumptions, ledgerEntries] = await Promise.all([
      this.adminMemberSummaries([member], allowedFrontendUserIds),
      this.prisma.sharedPrepaidRecharge.findMany({
        where: { memberId: id, ownerFrontendUserId: { in: allowedFrontendUserIds } },
        select: publicRechargeSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_DETAIL_HISTORY_LIMIT + 1
      }),
      this.prisma.sharedPrepaidConsumption.findMany({
        where: { memberId: id, OR: this.adminConsumptionParticipation(allowedFrontendUserIds) },
        select: adminConsumptionSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_DETAIL_HISTORY_LIMIT + 1
      }),
      this.prisma.sharedPrepaidLedgerEntry.findMany({
        where: { memberId: id, ownerFrontendUserId: { in: allowedFrontendUserIds } },
        select: adminLedgerEntrySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_DETAIL_HISTORY_LIMIT + 1
      })
    ])
    const consumptionSummaries = await this.adminConsumptionSummaries(
      consumptions.slice(0, ADMIN_DETAIL_HISTORY_LIMIT)
    )
    return {
      ...summaries[0],
      historyLimit: ADMIN_DETAIL_HISTORY_LIMIT,
      historyTruncated: {
        recharges: recharges.length > ADMIN_DETAIL_HISTORY_LIMIT,
        consumptions: consumptions.length > ADMIN_DETAIL_HISTORY_LIMIT,
        ledgerEntries: ledgerEntries.length > ADMIN_DETAIL_HISTORY_LIMIT
      },
      recharges: recharges.slice(0, ADMIN_DETAIL_HISTORY_LIMIT).map((row) => this.toRechargeRow(row as RechargeRow)),
      consumptions: consumptionSummaries,
      ledgerEntries: ledgerEntries.slice(0, ADMIN_DETAIL_HISTORY_LIMIT).map((row) => this.decimalToNumberDeep(row))
    }
  }

  async getAdminConsumptionDetail(allowedFrontendUserIds: string[], id: string) {
    const row = await this.prisma.sharedPrepaidConsumption.findFirst({
      where: { id, OR: this.adminConsumptionParticipation(allowedFrontendUserIds) },
      select: adminConsumptionDetailSelect
    })
    if (!row) throw new NotFoundException('消费记录不存在')
    const reversalReferenceId = row.kind === SharedPrepaidConsumptionKind.REVERSAL
      ? row.id
      : row.reversal?.id
    const reversalAudit = reversalReferenceId
      ? await this.prisma.sharedPrepaidLedgerEntry.findFirst({
          where: {
            kind: SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL,
            referenceType: 'SharedPrepaidConsumption',
            referenceId: reversalReferenceId
          },
          select: adminLedgerEntrySelect
        })
      : null
    return {
      ...this.toAdminConsumptionDetailRow(row),
      reversalReason: reversalAudit?.reason ?? null,
      reversalAudit: reversalAudit ? this.decimalToNumberDeep(reversalAudit) : null
    }
  }

  async getAdminSettlementDetail(allowedFrontendUserIds: string[], id: string) {
    const row = await this.prisma.sharedPrepaidSettlement.findFirst({
      where: {
        id,
        OR: [
          { accountAId: { in: allowedFrontendUserIds } },
          { accountBId: { in: allowedFrontendUserIds } }
        ]
      },
      select: settlementReadSelect
    })
    if (!row) throw new NotFoundException('结算单不存在')
    return this.toSettlementReadRow(row)
  }

  async listSettlementPayables(user: CurrentUser, query: SharedPrepaidSettlementPayableQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const ownerId = user.dataOwnerId
    const counterpartyId = String(query.counterpartyFrontendUserId ?? '').trim()
    const where: Prisma.SharedPrepaidPayableWhereInput = {}
    if (query.payableIds?.length) where.id = { in: [...query.payableIds] }
    if (counterpartyId === ownerId) where.id = { in: [] }
    if (query.direction === 'OUTGOING') {
      where.sourceOwnerId = ownerId
      if (counterpartyId) where.consumerOwnerId = counterpartyId
    } else if (query.direction === 'INCOMING') {
      where.consumerOwnerId = ownerId
      if (counterpartyId) where.sourceOwnerId = counterpartyId
    } else {
      where.OR = [{ sourceOwnerId: ownerId }, { consumerOwnerId: ownerId }]
      if (counterpartyId) {
        where.AND = [{ OR: [{ sourceOwnerId: counterpartyId }, { consumerOwnerId: counterpartyId }] }]
      }
    }
    if (query.status) where.status = query.status
    if (this.optionalBoolean(query.eligibleOnly) === true) {
      where.status = SharedPrepaidPayableStatus.PENDING
      where.settlementLines = { none: { releasedAt: null } }
    }
    const phone = this.phoneSearch(query.phone)
    if (phone || query.startDate || query.endDate) {
      where.consumption = {
        ...(phone ? { phoneSnapshot: { contains: phone } } : {}),
        ...((query.startDate || query.endDate) ? {
          sheetDate: {
            ...(query.startDate ? { gte: String(query.startDate).trim() } : {}),
            ...(query.endDate ? { lte: String(query.endDate).trim() } : {})
          }
        } : {})
      }
    }
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidPayable.findMany({
        where,
        select: settlementPayableListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidPayable.count({ where })
    ])
    return {
      items: rows.map((row) => this.toSettlementPayableRow(row, ownerId)),
      total,
      page,
      pageSize
    }
  }

  async listSettlements(user: CurrentUser, query: SharedPrepaidSettlementQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const where = this.settlementWhere(user, query)
    const [rows, total] = await Promise.all([
      this.prisma.sharedPrepaidSettlement.findMany({
        where,
        select: settlementSummarySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidSettlement.count({ where })
    ])
    return {
      items: rows.map((row) => this.toSettlementSummaryRow(row)),
      total,
      page,
      pageSize
    }
  }

  async getSettlementDetail(user: CurrentUser, id: string) {
    const row = await this.prisma.sharedPrepaidSettlement.findFirst({
      where: {
        id,
        OR: [{ accountAId: user.dataOwnerId }, { accountBId: user.dataOwnerId }]
      },
      select: settlementReadSelect
    })
    if (!row) throw new NotFoundException('结算单不存在')
    return this.toSettlementReadRow(row)
  }

  async getMemberDetail(id: string, query: SharedPrepaidMemberDetailQuery = {}) {
    const history = this.memberHistoryPagination(query)
    const member = await this.prisma.sharedPrepaidMember.findUnique({
      where: { id },
      select: publicMemberBaseSelect
    })
    if (!member) throw new NotFoundException('预存款会员不存在')
    const [summaries, recharges, consumptions, ledgerEntries] = await Promise.all([
      this.publicMemberSummaries([member]),
      this.prisma.sharedPrepaidRecharge.findMany({
        where: { memberId: id },
        select: publicRechargeSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (history.rechargePage - 1) * history.pageSize,
        take: history.pageSize + 1
      }),
      this.prisma.sharedPrepaidConsumption.findMany({
        where: { memberId: id },
        select: consumptionListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (history.consumptionPage - 1) * history.pageSize,
        take: history.pageSize + 1
      }),
      this.prisma.sharedPrepaidLedgerEntry.findMany({
        where: { memberId: id },
        select: publicMemberLedgerSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (history.ledgerPage - 1) * history.pageSize,
        take: history.pageSize + 1
      })
    ])
    const pageState = (page: number, rows: unknown[]) => ({
      page,
      hasMore: rows.length > history.pageSize,
      nextPage: rows.length > history.pageSize ? page + 1 : null
    })
    return {
      ...summaries[0],
      recharges: recharges.slice(0, history.pageSize).map((recharge) => this.toRechargeRow(recharge as RechargeRow)),
      consumptions: consumptions.slice(0, history.pageSize).map((consumption) => this.toConsumptionListRow(consumption)),
      ledgerEntries: ledgerEntries.slice(0, history.pageSize).map((entry) => this.toPublicLedgerEntry(entry)),
      historyPagination: {
        pageSize: history.pageSize,
        order: 'createdAt_DESC,id_DESC',
        recharges: pageState(history.rechargePage, recharges),
        consumptions: pageState(history.consumptionPage, consumptions),
        ledgerEntries: pageState(history.ledgerPage, ledgerEntries)
      }
    }
  }

  private async publicMemberSummaries(members: PublicMemberBaseRow[]) {
    if (!members.length) return []
    const memberIds = members.map((member) => member.id)
    const [rechargeGroups, consumptionGroups] = await Promise.all([
      this.prisma.sharedPrepaidRecharge.groupBy({
        by: ['memberId', 'ownerFrontendUserId'],
        where: { memberId: { in: memberIds }, reversedAt: null },
        _sum: { paidAmount: true, giftAmount: true, remainingAmount: true },
        _max: { createdAt: true }
      }),
      this.prisma.sharedPrepaidConsumption.groupBy({
        by: ['memberId'],
        where: {
          memberId: { in: memberIds },
          kind: SharedPrepaidConsumptionKind.CONSUMPTION,
          active: true
        },
        _sum: { amount: true },
        _max: { createdAt: true }
      })
    ])
    const ownerIds = [...new Set(rechargeGroups.map((group) => group.ownerFrontendUserId))]
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: accountSelect })
      : []
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]))
    const consumptionByMember = new Map(consumptionGroups.map((group) => [group.memberId, group]))

    return members.map((member) => {
      const groups = rechargeGroups.filter((group) => group.memberId === member.id)
      const sum = (field: 'paidAmount' | 'giftAmount' | 'remainingAmount') => groups.reduce(
        (total, group) => total.add(group._sum[field] ?? 0),
        new Prisma.Decimal(0)
      )
      const latestRechargeTime = groups.reduce<Date | null>((latest, group) => {
        const candidate = group._max.createdAt
        return candidate && (!latest || candidate > latest) ? candidate : latest
      }, null)
      const consumption = consumptionByMember.get(member.id)
      return {
        id: member.id,
        phone: member.phone,
        paidTotal: sum('paidAmount').toNumber(),
        giftTotal: sum('giftAmount').toNumber(),
        consumedTotal: new Prisma.Decimal(consumption?._sum.amount ?? 0).toNumber(),
        balance: member.cachedBalance.toNumber(),
        version: member.version,
        ownerComposition: groups
          .filter((group) => new Prisma.Decimal(group._sum.remainingAmount ?? 0).greaterThan(0))
          .sort((left, right) => left.ownerFrontendUserId.localeCompare(right.ownerFrontendUserId))
          .map((group) => {
            const owner = ownerById.get(group.ownerFrontendUserId)
            return {
              ownerFrontendUserId: group.ownerFrontendUserId,
              ownerAccount: owner?.account ?? group.ownerFrontendUserId,
              ownerUsername: owner?.username ?? group.ownerFrontendUserId,
              ownerDisplayName: owner?.displayRemark || owner?.username || owner?.account || group.ownerFrontendUserId,
              balance: new Prisma.Decimal(group._sum.remainingAmount ?? 0).toNumber()
            }
          }),
        latestRechargeTime,
        latestConsumptionTime: consumption?._max.createdAt ?? null,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt
      }
    })
  }

  private toRechargeRow(recharge: RechargeRow) {
    return {
      id: recharge.id,
      memberId: recharge.memberId,
      phone: recharge.member?.phone,
      ownerFrontendUserId: recharge.ownerFrontendUserId,
      ownerAccount: recharge.ownerFrontendUser.account,
      ownerUsername: recharge.ownerFrontendUser.username,
      actorUserId: recharge.actorUserId,
      actorAccount: recharge.actorUser.account,
      actorUsername: recharge.actorUser.username,
      rechargeDate: recharge.rechargeDate,
      paidAmount: recharge.paidAmount.toNumber(),
      giftAmount: recharge.giftAmount.toNumber(),
      totalAmount: recharge.totalAmount.toNumber(),
      remainingAmount: recharge.remainingAmount.toNumber(),
      isOpeningBalance: recharge.isOpeningBalance,
      remark: recharge.remark,
      reversedAt: recharge.reversedAt,
      reversedByLedgerId: recharge.reversedByLedgerId,
      createdAt: recharge.createdAt,
      updatedAt: recharge.updatedAt
    }
  }

  private toPublicLedgerEntry(entry: Prisma.SharedPrepaidLedgerEntryGetPayload<{
    select: typeof publicMemberLedgerSelect
  }>) {
    return {
      id: entry.id,
      memberId: entry.memberId,
      kind: entry.kind,
      balanceDelta: entry.balanceDelta.toNumber(),
      ownerFrontendUserId: entry.ownerFrontendUserId,
      actorUserId: entry.actorUserId,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      reason: entry.reason,
      createdAt: entry.createdAt
    }
  }

  private toConsumptionListRow(row: ConsumptionListDatabaseRow) {
    const {
      reversalOf,
      allocations: directAllocations,
      payables: directPayables,
      member: _member,
      idempotencyKey: _idempotencyKey,
      ...publicRow
    } = row as ConsumptionListDatabaseRow & { member?: unknown; idempotencyKey?: string }
    const usesReversalTarget = row.kind === SharedPrepaidConsumptionKind.REVERSAL && Boolean(reversalOf)
    const allocationRows = usesReversalTarget ? reversalOf?.allocations ?? [] : directAllocations
    const originalPayables = usesReversalTarget ? reversalOf?.payables ?? [] : []
    const allocations = allocationRows.slice(0, PUBLIC_CONSUMPTION_RELATION_LIMIT).map((allocation) => {
      const {
        idempotencyKey: _rechargeKey,
        remark: _remark,
        ...recharge
      } = allocation.recharge as typeof allocation.recharge & {
        idempotencyKey?: string
        remark?: string | null
      }
      return { ...allocation, recharge }
    })
    return this.decimalToNumberDeep({
      ...publicRow,
      allocationOrigin: usesReversalTarget ? 'REVERSAL_TARGET' : 'DIRECT',
      allocationSourceConsumptionId: usesReversalTarget ? reversalOf?.id ?? row.id : row.id,
      allocations,
      payables: directPayables.slice(0, PUBLIC_CONSUMPTION_RELATION_LIMIT),
      originalPayables: originalPayables.slice(0, PUBLIC_CONSUMPTION_RELATION_LIMIT),
      relationLimit: PUBLIC_CONSUMPTION_RELATION_LIMIT,
      relationTruncated: {
        allocations: allocationRows.length > PUBLIC_CONSUMPTION_RELATION_LIMIT,
        payables: directPayables.length > PUBLIC_CONSUMPTION_RELATION_LIMIT,
        originalPayables: originalPayables.length > PUBLIC_CONSUMPTION_RELATION_LIMIT
      }
    })
  }

  private phoneSearch(value: unknown) {
    try {
      return normalizePrepaidPhoneSearch(value)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }
  }

  private rechargeWhere(query: SharedPrepaidRechargeQuery) {
    const phone = this.phoneSearch(query.phone)
    const where: Prisma.SharedPrepaidRechargeWhereInput = {}
    if (phone) where.member = { phone: { contains: phone } }
    if (query.ownerFrontendUserId) where.ownerFrontendUserId = String(query.ownerFrontendUserId).trim()
    if (query.startDate || query.endDate) {
      where.rechargeDate = {
        ...(query.startDate ? { gte: String(query.startDate).trim() } : {}),
        ...(query.endDate ? { lte: String(query.endDate).trim() } : {})
      }
    }
    const opening = this.optionalBoolean(query.isOpeningBalance)
    if (opening !== undefined) where.isOpeningBalance = opening
    if (query.status === 'ACTIVE') where.reversedAt = null
    if (query.status === 'REVERSED') where.reversedAt = { not: null }
    return where
  }

  private consumptionWhere(
    query: SharedPrepaidConsumptionQuery,
    allowedFrontendUserIds?: string[]
  ) {
    const phone = this.phoneSearch(query.phone)
    const sourceOwnerId = String(query.sourceOwnerId ?? '').trim()
    const consumingFrontendUserId = String(query.consumingFrontendUserId ?? '').trim()
    const where: Prisma.SharedPrepaidConsumptionWhereInput = {}
    const and: Prisma.SharedPrepaidConsumptionWhereInput[] = []
    if (phone) where.member = { phone: { contains: phone } }
    if (allowedFrontendUserIds) {
      and.push({ OR: this.adminConsumptionParticipation(allowedFrontendUserIds) })
    }
    if (sourceOwnerId) {
      and.push({
        OR: [
          { allocations: { some: { sourceOwnerId } } },
          { reversalOf: { allocations: { some: { sourceOwnerId } } } }
        ]
      })
    }
    if (consumingFrontendUserId) where.consumingFrontendUserId = consumingFrontendUserId
    if (query.startDate || query.endDate) {
      where.sheetDate = {
        ...(query.startDate ? { gte: String(query.startDate).trim() } : {}),
        ...(query.endDate ? { lte: String(query.endDate).trim() } : {})
      }
    }
    if (query.status === 'ACTIVE') {
      where.kind = SharedPrepaidConsumptionKind.CONSUMPTION
      where.active = true
    } else if (query.status === 'REVERSED') {
      and.push({
        OR: [
          { kind: SharedPrepaidConsumptionKind.REVERSAL },
          { kind: SharedPrepaidConsumptionKind.CONSUMPTION, active: false }
        ]
      })
    }
    if (query.payableStatus) {
      and.push({
        OR: [
          { payables: { some: { status: query.payableStatus } } },
          { reversalOf: { payables: { some: { status: query.payableStatus } } } }
        ]
      })
    }
    if (and.length) where.AND = and
    return where
  }

  private adminConsumptionParticipation(allowedFrontendUserIds: string[]) {
    return [
      { consumingFrontendUserId: { in: allowedFrontendUserIds } },
      { allocations: { some: { sourceOwnerId: { in: allowedFrontendUserIds } } } },
      { reversalOf: { allocations: { some: { sourceOwnerId: { in: allowedFrontendUserIds } } } } }
    ] satisfies Prisma.SharedPrepaidConsumptionWhereInput[]
  }

  private adminMemberParticipation(allowedFrontendUserIds: string[]) {
    return [
      { recharges: { some: { ownerFrontendUserId: { in: allowedFrontendUserIds } } } },
      { consumptions: { some: { OR: this.adminConsumptionParticipation(allowedFrontendUserIds) } } },
      {
        consumptions: {
          some: {
            payables: {
              some: {
                settlementLines: {
                  some: {
                    settlement: {
                      OR: [
                        { accountAId: { in: allowedFrontendUserIds } },
                        { accountBId: { in: allowedFrontendUserIds } }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    ] satisfies Prisma.SharedPrepaidMemberWhereInput[]
  }

  private adminSettlementWhere(
    allowedFrontendUserIds: string[],
    query: SharedPrepaidSettlementQuery
  ) {
    const counterpartyId = String(query.counterpartyFrontendUserId ?? '').trim()
    const where: Prisma.SharedPrepaidSettlementWhereInput = {
      OR: [
        { accountAId: { in: allowedFrontendUserIds } },
        { accountBId: { in: allowedFrontendUserIds } }
      ]
    }
    if (counterpartyId) {
      where.AND = [{ OR: [{ accountAId: counterpartyId }, { accountBId: counterpartyId }] }]
    }
    if (query.status) where.status = query.status
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: this.beijingDateBoundary(query.startDate, false) } : {}),
        ...(query.endDate ? { lte: this.beijingDateBoundary(query.endDate, true) } : {})
      }
    }
    return where
  }

  private async adminConsumptionSummaries(rows: AdminConsumptionSummaryDatabaseRow[]) {
    if (!rows.length) return []
    const sourceConsumptionIds = [...new Set(rows.map((row) => (
      row.kind === SharedPrepaidConsumptionKind.REVERSAL && row.reversalOfId
        ? row.reversalOfId
        : row.id
    )))]
    const sources = await this.prisma.$queryRaw<AdminConsumptionSourceRow[]>(Prisma.sql`
      WITH "distinctSources" AS (
        SELECT DISTINCT
          a."consumptionId",
          a."sourceOwnerId"
        FROM "SharedPrepaidAllocation" a
        WHERE a."consumptionId" IN (${Prisma.join(sourceConsumptionIds)})
      ),
      "rankedSources" AS (
        SELECT
          "consumptionId",
          "sourceOwnerId",
          ROW_NUMBER() OVER (
            PARTITION BY "consumptionId"
            ORDER BY "sourceOwnerId"
          ) AS "sourceRank"
        FROM "distinctSources"
      )
      SELECT
        ranked."consumptionId",
        ranked."sourceOwnerId",
        owner."id",
        owner."account",
        owner."username",
        owner."displayRemark"
      FROM "rankedSources" ranked
      INNER JOIN "User" owner ON owner."id" = ranked."sourceOwnerId"
      WHERE ranked."sourceRank" <= ${ADMIN_CONSUMPTION_RELATION_LIMIT + 1}
      ORDER BY ranked."consumptionId" ASC, ranked."sourceOwnerId" ASC
    `)
    const sourcesByConsumption = new Map<string, AccountRow[]>()
    for (const source of sources) {
      const current = sourcesByConsumption.get(source.consumptionId) ?? []
      current.push({
        id: source.id,
        account: source.account,
        username: source.username,
        displayRemark: source.displayRemark
      })
      sourcesByConsumption.set(source.consumptionId, current)
    }
    return rows.map((row) => {
      const sourceConsumptionId = row.kind === SharedPrepaidConsumptionKind.REVERSAL && row.reversalOfId
        ? row.reversalOfId
        : row.id
      return this.decimalToNumberDeep({
        id: row.id,
        memberId: row.memberId,
        consumingFrontendUserId: row.consumingFrontendUserId,
        actorUserId: row.actorUserId,
        kind: row.kind,
        amount: row.amount,
        sampleNumberSnapshot: row.sampleNumberSnapshot,
        sampleCountSnapshot: row.sampleCountSnapshot,
        elementsSnapshot: row.elementsSnapshot,
        phoneSnapshot: row.phoneSnapshot,
        sheetDate: row.sheetDate,
        active: row.active,
        reversalOfId: row.reversalOfId,
        createdAt: row.createdAt,
        consumingFrontendUser: row.consumingFrontendUser,
        actorUser: row.actorUser,
        allocationOrigin: sourceConsumptionId === row.id ? 'DIRECT' : 'REVERSAL_TARGET',
        allocationSourceConsumptionId: sourceConsumptionId,
        sourceOwners: (sourcesByConsumption.get(sourceConsumptionId) ?? [])
          .slice(0, ADMIN_CONSUMPTION_RELATION_LIMIT),
        sourceOwnersTruncated: (sourcesByConsumption.get(sourceConsumptionId)?.length ?? 0) >
          ADMIN_CONSUMPTION_RELATION_LIMIT
      })
    })
  }

  private toAdminConsumptionDetailRow(row: AdminConsumptionDetailDatabaseRow) {
    const directAllocations = row.allocations
    const directPayables = row.payables
    const originalAllocations = row.reversalOf?.allocations ?? []
    const originalPayables = row.reversalOf?.payables ?? []
    const boundedRow = {
      ...row,
      allocations: directAllocations.slice(0, ADMIN_CONSUMPTION_RELATION_LIMIT),
      payables: directPayables.slice(0, ADMIN_CONSUMPTION_RELATION_LIMIT),
      reversalOf: row.reversalOf ? {
        ...row.reversalOf,
        allocations: originalAllocations.slice(0, ADMIN_CONSUMPTION_RELATION_LIMIT),
        payables: originalPayables.slice(0, ADMIN_CONSUMPTION_RELATION_LIMIT)
      } : null
    }
    return {
      ...(this.toConsumptionListRow(boundedRow as unknown as ConsumptionListDatabaseRow) as Record<string, unknown>),
      relationLimit: ADMIN_CONSUMPTION_RELATION_LIMIT,
      relationTruncated: {
        allocations: directAllocations.length > ADMIN_CONSUMPTION_RELATION_LIMIT,
        payables: directPayables.length > ADMIN_CONSUMPTION_RELATION_LIMIT,
        originalAllocations: originalAllocations.length > ADMIN_CONSUMPTION_RELATION_LIMIT,
        originalPayables: originalPayables.length > ADMIN_CONSUMPTION_RELATION_LIMIT
      }
    }
  }

  private async adminMemberSummaries(
    members: AdminMemberBaseRow[],
    allowedFrontendUserIds: string[]
  ) {
    if (!members.length) return []
    const memberIds = members.map((member) => member.id)
    const [rechargeGroups, consumptionGroups] = await Promise.all([
      this.prisma.sharedPrepaidRecharge.groupBy({
        by: ['memberId', 'ownerFrontendUserId'],
        where: {
          memberId: { in: memberIds },
          ownerFrontendUserId: { in: allowedFrontendUserIds },
          reversedAt: null
        },
        _sum: { paidAmount: true, giftAmount: true, remainingAmount: true },
        _max: { createdAt: true }
      }),
      this.prisma.$queryRaw<AdminConsumptionAggregateRow[]>(Prisma.sql`
        WITH "scopedConsumptions" AS (
          SELECT
            c."id",
            c."memberId",
            c."createdAt",
            CASE
              WHEN c."consumingFrontendUserId" IN (${Prisma.join(allowedFrontendUserIds)})
                THEN c."amount"
              ELSE COALESCE(
                SUM(a."allocatedAmount") FILTER (
                  WHERE a."sourceOwnerId" IN (${Prisma.join(allowedFrontendUserIds)})
                ),
                0
              )
            END AS "scopedAmount"
          FROM "SharedPrepaidConsumption" c
          LEFT JOIN "SharedPrepaidAllocation" a ON a."consumptionId" = c."id"
          WHERE c."memberId" IN (${Prisma.join(memberIds)})
            AND c."kind" = CAST(${SharedPrepaidConsumptionKind.CONSUMPTION} AS "SharedPrepaidConsumptionKind")
            AND c."active" = TRUE
          GROUP BY
            c."id",
            c."memberId",
            c."createdAt",
            c."consumingFrontendUserId",
            c."amount"
          HAVING
            c."consumingFrontendUserId" IN (${Prisma.join(allowedFrontendUserIds)})
            OR COUNT(a."id") FILTER (
              WHERE a."sourceOwnerId" IN (${Prisma.join(allowedFrontendUserIds)})
            ) > 0
        )
        SELECT
          "memberId",
          SUM("scopedAmount") AS "consumedTotal",
          MAX("createdAt") AS "latestConsumptionTime"
        FROM "scopedConsumptions"
        GROUP BY "memberId"
      `)
    ])
    const ownerIds = [...new Set(rechargeGroups.map((group) => group.ownerFrontendUserId))]
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: accountSelect })
      : []
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]))
    const consumptionByMember = new Map(consumptionGroups.map((group) => [group.memberId, group]))

    return members.map((member) => {
      const memberRecharges = rechargeGroups.filter((group) => group.memberId === member.id)
      const consumption = consumptionByMember.get(member.id)
      const paidTotal = memberRecharges.reduce(
        (sum, group) => sum.add(group._sum.paidAmount ?? 0),
        new Prisma.Decimal(0)
      )
      const giftTotal = memberRecharges.reduce(
        (sum, group) => sum.add(group._sum.giftAmount ?? 0),
        new Prisma.Decimal(0)
      )
      const balance = memberRecharges.reduce(
        (sum, group) => sum.add(group._sum.remainingAmount ?? 0),
        new Prisma.Decimal(0)
      )
      const latestRechargeTime = memberRecharges.reduce<Date | null>((latest, group) => {
        const candidate = group._max.createdAt
        return candidate && (!latest || candidate > latest) ? candidate : latest
      }, null)
      return {
        id: member.id,
        phone: member.phone,
        paidTotal: paidTotal.toNumber(),
        giftTotal: giftTotal.toNumber(),
        consumedTotal: new Prisma.Decimal(consumption?.consumedTotal ?? 0).toNumber(),
        balance: balance.toNumber(),
        version: member.version,
        ownerComposition: memberRecharges
          .filter((group) => group._sum.remainingAmount?.greaterThan(0))
          .map((group) => {
            const owner = ownerById.get(group.ownerFrontendUserId)
            const display = owner?.displayRemark || owner?.username || owner?.account || group.ownerFrontendUserId
            return {
              ownerFrontendUserId: group.ownerFrontendUserId,
              ownerAccount: owner?.account || group.ownerFrontendUserId,
              ownerUsername: owner?.username || owner?.account || group.ownerFrontendUserId,
              ownerDisplayName: display,
              balance: group._sum.remainingAmount?.toNumber() ?? 0
            }
          })
          .sort((left, right) => left.ownerFrontendUserId.localeCompare(right.ownerFrontendUserId)),
        latestRechargeTime,
        latestConsumptionTime: consumption?.latestConsumptionTime ?? null,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt
      }
    })
  }

  private accountOptions(accounts: AccountRow[]) {
    const options = new Map<string, { id: string; account: string; label: string }>()
    for (const account of accounts) {
      const display = account.displayRemark || account.username || account.account
      options.set(account.id, {
        id: account.id,
        account: account.account,
        label: display && display !== account.account ? `${display}（${account.account}）` : account.account
      })
    }
    return [...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'zh-CN') || left.id.localeCompare(right.id))
  }

  private settlementWhere(user: CurrentUser, query: SharedPrepaidSettlementQuery) {
    const counterpartyId = String(query.counterpartyFrontendUserId ?? '').trim()
    const where: Prisma.SharedPrepaidSettlementWhereInput = {
      OR: [{ accountAId: user.dataOwnerId }, { accountBId: user.dataOwnerId }]
    }
    if (counterpartyId === user.dataOwnerId) {
      where.id = { in: [] }
    } else if (counterpartyId) {
      where.AND = [{ OR: [{ accountAId: counterpartyId }, { accountBId: counterpartyId }] }]
    }
    if (query.status) where.status = query.status
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: this.beijingDateBoundary(query.startDate, false) } : {}),
        ...(query.endDate ? { lte: this.beijingDateBoundary(query.endDate, true) } : {})
      }
    }
    return where
  }

  private toSettlementPayableRow(row: SettlementPayableDatabaseRow, ownerId: string) {
    const core = this.toSettlementPayableCore(row)
    return {
      ...core,
      eligible: row.status === SharedPrepaidPayableStatus.PENDING &&
        !row.settlementLines.some((line) => line.releasedAt === null),
      direction: row.sourceOwnerId === ownerId ? 'OUTGOING' as const : 'INCOMING' as const,
      counterpartyFrontendUserId: row.sourceOwnerId === ownerId ? row.consumerOwnerId : row.sourceOwnerId,
      settlementAssociations: row.settlementLines.map((line) => ({
        id: line.id,
        settlementId: line.settlementId,
        direction: line.direction,
        amount: line.amount.toNumber(),
        releasedAt: line.releasedAt,
        createdAt: line.createdAt,
        status: line.settlement.status,
        settlementCreatedAt: line.settlement.createdAt
      }))
    }
  }

  private toSettlementPayableCore(row: SettlementPayableCoreDatabaseRow) {
    return {
      id: row.id,
      consumptionId: row.consumptionId,
      sourceOwnerId: row.sourceOwnerId,
      consumerOwnerId: row.consumerOwnerId,
      exactAmount: row.exactAmount.toNumber(),
      amount: row.amount.toNumber(),
      status: row.status,
      reversalOfId: row.reversalOfId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      sourceOwner: row.sourceOwner,
      consumerOwner: row.consumerOwner,
      consumption: {
        id: row.consumption.id,
        memberId: row.consumption.memberId,
        phoneSnapshot: row.consumption.phoneSnapshot,
        sampleNumberSnapshot: row.consumption.sampleNumberSnapshot,
        sampleCountSnapshot: row.consumption.sampleCountSnapshot,
        elementsSnapshot: row.consumption.elementsSnapshot,
        sheetDate: row.consumption.sheetDate,
        createdAt: row.consumption.createdAt,
        rechargeBatches: row.consumption.allocations
          .filter((allocation) => allocation.sourceOwnerId === row.sourceOwnerId)
          .map((allocation) => allocation.recharge)
      }
    }
  }

  private toSettlementSummaryRow(row: SettlementSummaryDatabaseRow) {
    return {
      id: row.id,
      accountAId: row.accountAId,
      accountBId: row.accountBId,
      aToBAmount: row.aToBAmount.toNumber(),
      bToAAmount: row.bToAAmount.toNumber(),
      grossAmount: row.aToBAmount.add(row.bToAAmount).toNumber(),
      netAmount: row.netAmount.toNumber(),
      payerFrontendUserId: row.payerFrontendUserId,
      receiverFrontendUserId: row.receiverFrontendUserId,
      status: row.status,
      createdAt: row.createdAt,
      accountA: row.accountA,
      accountB: row.accountB
    }
  }

  private toSettlementReadRow(row: SettlementReadDatabaseRow) {
    return {
      id: row.id,
      accountAId: row.accountAId,
      accountBId: row.accountBId,
      aToBAmount: row.aToBAmount.toNumber(),
      bToAAmount: row.bToAAmount.toNumber(),
      grossAmount: row.aToBAmount.add(row.bToAAmount).toNumber(),
      netAmount: row.netAmount.toNumber(),
      payerFrontendUserId: row.payerFrontendUserId,
      receiverFrontendUserId: row.receiverFrontendUserId,
      status: row.status,
      actualTransferredAt: row.actualTransferredAt,
      proofUrls: this.proofUrls(row.proofUrls),
      remark: row.remark,
      createdById: row.createdById,
      paymentSubmittedById: row.paymentSubmittedById,
      paymentSubmittedAt: row.paymentSubmittedAt,
      receiptConfirmedById: row.receiptConfirmedById,
      receiptConfirmedAt: row.receiptConfirmedAt,
      rejectedById: row.rejectedById,
      rejectedAt: row.rejectedAt,
      rejectionReason: row.rejectionReason,
      cancelledById: row.cancelledById,
      cancelledAt: row.cancelledAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      accountA: row.accountA,
      accountB: row.accountB,
      payerFrontendUser: row.payerFrontendUser,
      receiverFrontendUser: row.receiverFrontendUser,
      createdBy: row.createdBy,
      paymentSubmittedBy: row.paymentSubmittedBy,
      receiptConfirmedBy: row.receiptConfirmedBy,
      rejectedBy: row.rejectedBy,
      cancelledBy: row.cancelledBy,
      lines: row.lines.map((line) => ({
        id: line.id,
        payableId: line.payableId,
        consumptionId: line.payable.consumptionId,
        sourceOwnerId: line.payable.sourceOwnerId,
        consumerOwnerId: line.payable.consumerOwnerId,
        direction: line.direction,
        amount: line.amount.toNumber(),
        payableStatus: line.payable.status,
        releasedAt: line.releasedAt,
        createdAt: line.createdAt,
        payable: this.toSettlementPayableCore(line.payable)
      })),
      actions: row.actions.map((action) => ({
        id: action.id,
        operation: action.operation,
        actorUserId: action.actorUserId,
        actorFrontendUserId: action.actorFrontendUserId,
        createdAt: action.createdAt,
        actorUser: action.actorUser,
        actorFrontendUser: action.actorFrontendUser
      }))
    }
  }

  private proofUrls(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private beijingDateBoundary(value: string, end: boolean) {
    return new Date(`${String(value).trim()}T${end ? '23:59:59.999' : '00:00:00.000'}+08:00`)
  }

  private pagination(query: SharedPrepaidListQuery) {
    const rawPage = Number(query.page ?? 1)
    const rawPageSize = Number(query.pageSize ?? 20)
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, 100)
      : 20
    return { page, pageSize, skip: (page - 1) * pageSize }
  }

  private memberHistoryPagination(query: SharedPrepaidMemberDetailQuery) {
    const positiveInteger = (value: number | string | undefined, fallback: number, label: string) => {
      const parsed = Number(value ?? fallback)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new BadRequestException(`${label}必须为正整数`)
      }
      return parsed
    }
    const pageSize = positiveInteger(
      query.historyPageSize,
      PUBLIC_MEMBER_HISTORY_LIMIT,
      '历史每页数量'
    )
    if (pageSize > PUBLIC_MEMBER_HISTORY_LIMIT) {
      throw new BadRequestException(`历史每页最多 ${PUBLIC_MEMBER_HISTORY_LIMIT} 条`)
    }
    return {
      pageSize,
      rechargePage: positiveInteger(query.rechargePage, 1, '充值历史页码'),
      consumptionPage: positiveInteger(query.consumptionPage, 1, '消费历史页码'),
      ledgerPage: positiveInteger(query.ledgerPage, 1, '账本历史页码')
    }
  }

  private optionalBoolean(value: boolean | string | undefined): boolean | undefined {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return undefined
  }

  private decimalToNumberDeep(value: unknown): unknown {
    if (value instanceof Prisma.Decimal) return value.toNumber()
    if (value instanceof Date) return value
    if (Array.isArray(value)) return value.map((item) => this.decimalToNumberDeep(item))
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.decimalToNumberDeep(item)]))
    }
    return value
  }
}
