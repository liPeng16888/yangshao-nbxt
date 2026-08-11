import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, SharedPrepaidConsumptionKind } from '@prisma/client'

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
