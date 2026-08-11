import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, SharedPrepaidConsumptionKind, SharedPrepaidPayableStatus } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { normalizePrepaidPhone } from './shared-prepaid-money'

export interface SharedPrepaidListQuery {
  page?: number | string
  pageSize?: number | string
  phone?: string
}

export interface SharedPrepaidRechargeQuery extends SharedPrepaidListQuery {
  ownerFrontendUserId?: string
  startDate?: string
  endDate?: string
  isOpeningBalance?: boolean | string
}

export interface SharedPrepaidConsumptionQuery extends SharedPrepaidListQuery {
  sourceOwnerId?: string
  consumingFrontendUserId?: string
  startDate?: string
  endDate?: string
  status?: 'ACTIVE' | 'REVERSED'
  payableStatus?: SharedPrepaidPayableStatus
}

interface AccountRow {
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
}

interface ConsumptionRow {
  id: string
  amount: Prisma.Decimal
  active: boolean
  createdAt: Date
  [key: string]: unknown
}

interface LedgerRow {
  id: string
  kind: string
  balanceDelta: Prisma.Decimal
  ownerFrontendUserId: string
  actorUserId: string
  referenceType: string
  referenceId: string
  createdAt: Date
}

interface MemberRow {
  id: string
  phone: string
  cachedBalance: Prisma.Decimal
  version: number
  createdAt: Date
  updatedAt: Date
  recharges: RechargeRow[]
  consumptions: ConsumptionRow[]
  ledgerEntries?: LedgerRow[]
}

const accountSelect = {
  id: true,
  account: true,
  username: true,
  displayRemark: true
} satisfies Prisma.UserSelect

const memberSummaryInclude = {
  recharges: {
    where: { reversedAt: null },
    include: {
      ownerFrontendUser: { select: accountSelect },
      actorUser: { select: accountSelect }
    },
    orderBy: [{ rechargeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  },
  consumptions: {
    where: {
      active: true,
      kind: SharedPrepaidConsumptionKind.CONSUMPTION
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  }
} satisfies Prisma.SharedPrepaidMemberInclude

const rechargeInclude = {
  member: { select: { id: true, phone: true } },
  ownerFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect },
  reversedByLedger: true
} satisfies Prisma.SharedPrepaidRechargeInclude

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
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  },
  payables: {
    select: consumptionPayableSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  },
  reversalOf: {
    select: {
      id: true,
      allocations: {
        select: consumptionAllocationSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      },
      payables: {
        select: consumptionPayableSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
      }
    }
  }
} satisfies Prisma.SharedPrepaidConsumptionSelect

type ConsumptionListDatabaseRow = Prisma.SharedPrepaidConsumptionGetPayload<{
  select: typeof consumptionListSelect
}>

@Injectable()
export class SharedPrepaidQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async getMemberByPhone(phone: unknown) {
    let normalizedPhone: string
    try {
      normalizedPhone = normalizePrepaidPhone(phone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }
    const member = await this.prisma.sharedPrepaidMember.findUnique({
      where: { phone: normalizedPhone },
      include: memberSummaryInclude
    })
    return member ? this.toMemberSummary(member as MemberRow) : null
  }

  async listMembers(query: SharedPrepaidListQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const phone = String(query.phone ?? '').replace(/\D/g, '')
    const where: Prisma.SharedPrepaidMemberWhereInput = phone ? { phone: { contains: phone } } : {}
    const [members, total] = await Promise.all([
      this.prisma.sharedPrepaidMember.findMany({
        where,
        include: memberSummaryInclude,
        orderBy: [{ phone: 'asc' }, { id: 'asc' }],
        skip,
        take: pageSize
      }),
      this.prisma.sharedPrepaidMember.count({ where })
    ])

    return {
      items: members.map((member) => this.toMemberSummary(member as MemberRow)),
      total,
      page,
      pageSize
    }
  }

  async listRecharges(query: SharedPrepaidRechargeQuery = {}) {
    const { page, pageSize, skip } = this.pagination(query)
    const phone = String(query.phone ?? '').replace(/\D/g, '')
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

    const [recharges, total] = await Promise.all([
      this.prisma.sharedPrepaidRecharge.findMany({
        where,
        include: rechargeInclude,
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
    const phone = String(query.phone ?? '').replace(/\D/g, '')
    const sourceOwnerId = String(query.sourceOwnerId ?? '').trim()
    const consumingFrontendUserId = String(query.consumingFrontendUserId ?? '').trim()
    const where: Prisma.SharedPrepaidConsumptionWhereInput = {}
    const and: Prisma.SharedPrepaidConsumptionWhereInput[] = []
    if (phone) where.member = { phone: { contains: phone } }
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

  async getMemberDetail(id: string) {
    const member = await this.prisma.sharedPrepaidMember.findUnique({
      where: { id },
      include: {
        recharges: {
          include: {
            ownerFrontendUser: { select: accountSelect },
            actorUser: { select: accountSelect },
            reversedByLedger: true
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        },
        consumptions: {
          include: {
            consumingFrontendUser: { select: accountSelect },
            actorUser: { select: accountSelect },
            allocations: {
              include: {
                recharge: true,
                sourceOwner: { select: accountSelect }
              },
              orderBy: { createdAt: 'asc' }
            },
            payables: {
              include: {
                sourceOwner: { select: accountSelect },
                consumerOwner: { select: accountSelect }
              },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        },
        ledgerEntries: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        }
      }
    })
    if (!member) throw new NotFoundException('预存款会员不存在')

    const row = member as unknown as MemberRow
    const activeSummaryRow = {
      ...row,
      recharges: row.recharges.filter((recharge) => !recharge.reversedAt),
      consumptions: row.consumptions.filter((consumption) => consumption.active)
    }
    return {
      ...this.toMemberSummary(activeSummaryRow),
      recharges: row.recharges.map((recharge) => this.toRechargeRow(recharge)),
      consumptions: row.consumptions.map((consumption) => this.decimalToNumberDeep(consumption)),
      ledgerEntries: (row.ledgerEntries ?? []).map((entry) => ({
        ...entry,
        balanceDelta: entry.balanceDelta.toNumber()
      }))
    }
  }

  private toMemberSummary(member: MemberRow) {
    const paidTotal = member.recharges.reduce(
      (sum, recharge) => sum.add(recharge.paidAmount),
      new Prisma.Decimal(0)
    )
    const giftTotal = member.recharges.reduce(
      (sum, recharge) => sum.add(recharge.giftAmount),
      new Prisma.Decimal(0)
    )
    const consumedTotal = member.consumptions.reduce(
      (sum, consumption) => sum.add(consumption.amount),
      new Prisma.Decimal(0)
    )
    const ownerBalances = new Map<string, { owner: AccountRow; balance: Prisma.Decimal }>()
    for (const recharge of member.recharges) {
      if (recharge.remainingAmount.lessThanOrEqualTo(0)) continue
      const current = ownerBalances.get(recharge.ownerFrontendUserId)
      ownerBalances.set(recharge.ownerFrontendUserId, {
        owner: recharge.ownerFrontendUser,
        balance: (current?.balance ?? new Prisma.Decimal(0)).add(recharge.remainingAmount)
      })
    }
    const latestRechargeTime = member.recharges.reduce<Date | null>((latest, recharge) => (
      !latest || recharge.createdAt > latest ? recharge.createdAt : latest
    ), null)
    const latestConsumptionTime = member.consumptions.reduce<Date | null>((latest, consumption) => (
      !latest || consumption.createdAt > latest ? consumption.createdAt : latest
    ), null)

    return {
      id: member.id,
      phone: member.phone,
      paidTotal: paidTotal.toNumber(),
      giftTotal: giftTotal.toNumber(),
      consumedTotal: consumedTotal.toNumber(),
      balance: member.cachedBalance.toNumber(),
      version: member.version,
      ownerComposition: [...ownerBalances.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([ownerFrontendUserId, value]) => ({
          ownerFrontendUserId,
          ownerAccount: value.owner.account,
          ownerUsername: value.owner.username,
          ownerDisplayName: value.owner.displayRemark || value.owner.username,
          balance: value.balance.toNumber()
        })),
      latestRechargeTime,
      latestConsumptionTime,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt
    }
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

  private toConsumptionListRow(row: ConsumptionListDatabaseRow) {
    const {
      reversalOf,
      member: _member,
      idempotencyKey: _idempotencyKey,
      ...publicRow
    } = row as ConsumptionListDatabaseRow & { member?: unknown; idempotencyKey?: string }
    const usesReversalTarget = row.kind === SharedPrepaidConsumptionKind.REVERSAL && Boolean(reversalOf)
    const allocationRows = usesReversalTarget ? reversalOf?.allocations ?? [] : row.allocations
    const allocations = allocationRows.map((allocation) => {
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
      originalPayables: usesReversalTarget ? reversalOf?.payables ?? [] : []
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

  private pagination(query: SharedPrepaidListQuery) {
    const rawPage = Number(query.page ?? 1)
    const rawPageSize = Number(query.pageSize ?? 20)
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
    const pageSize = Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, 100)
      : 20
    return { page, pageSize, skip: (page - 1) * pageSize }
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
