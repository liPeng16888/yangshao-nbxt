import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma, SharedPrepaidLedgerKind } from '@prisma/client'

import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { normalizePrepaidPhone } from './shared-prepaid-money'

export interface CreateRechargePayload {
  phone: unknown
  rechargeDate: unknown
  paidAmount: unknown
  giftAmount: unknown
  isOpeningBalance?: boolean
  remark?: unknown
}

interface RechargeReadRow {
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
  idempotencyKey: string
  reversedAt: Date | null
  reversedByLedgerId: string | null
  createdAt: Date
  updatedAt: Date
  member?: {
    phone: string
    cachedBalance: Prisma.Decimal
  }
  ownerFrontendUser?: AccountReadRow
  actorUser?: AccountReadRow
}

interface AccountReadRow {
  id: string
  account: string
  username: string
  displayRemark?: string | null
}

export interface SharedPrepaidRechargeResult {
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
  reversedAt: Date | null
  createdAt: Date
}

interface ValidatedRecharge {
  phone: string
  rechargeDate: string
  paidAmount: Prisma.Decimal
  giftAmount: Prisma.Decimal
  totalAmount: Prisma.Decimal
  isOpeningBalance: boolean
  remark: string | null
}

const accountSelect = {
  id: true,
  account: true,
  username: true,
  displayRemark: true
} satisfies Prisma.UserSelect

const rechargeReadInclude = {
  member: {
    select: {
      phone: true,
      cachedBalance: true
    }
  },
  ownerFrontendUser: { select: accountSelect },
  actorUser: { select: accountSelect },
  reversedByLedger: true
} satisfies Prisma.SharedPrepaidRechargeInclude

@Injectable()
export class SharedPrepaidLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async createRecharge(
    user: CurrentUser,
    payload: CreateRechargePayload,
    idempotencyKey: string
  ): Promise<SharedPrepaidRechargeResult> {
    const key = this.requireIdempotencyKey(idempotencyKey)
    const input = this.validateRecharge(payload)
    if (input.isOpeningBalance && !user.isFrontendMainAccount) {
      throw new ForbiddenException('只有主账号可以录入期初余额')
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => (
          this.createRechargeInTransaction(tx, user, input, key)
        ))
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error

        const existing = await this.prisma.sharedPrepaidRecharge.findUnique({
          where: { idempotencyKey: key },
          include: rechargeReadInclude
        })
        if (existing) return this.toRechargeResult(existing as RechargeReadRow)
        if (attempt === 0) continue
      }
    }

    throw new ConflictException({
      code: 'PREPAID_WRITE_CONFLICT',
      message: '共享预存款已被其他操作更新，请重试'
    })
  }

  async reverseRecharge(
    user: CurrentUser,
    rechargeId: string,
    reason: unknown,
    idempotencyKey: string
  ): Promise<SharedPrepaidRechargeResult> {
    if (!user.isFrontendMainAccount) {
      throw new ForbiddenException('只有主账号可以冲正充值')
    }
    const key = this.requireIdempotencyKey(idempotencyKey)
    const normalizedReason = String(reason ?? '').trim()
    if (!normalizedReason) throw new BadRequestException('请填写冲正原因')
    if (!String(rechargeId || '').trim()) throw new BadRequestException('缺少充值记录编号')

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => (
          this.reverseRechargeInTransaction(tx, user, rechargeId, normalizedReason, key)
        ))
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error
        const duplicate = await this.loadIdempotentReversal(rechargeId, key)
        if (duplicate) return duplicate
        if (attempt === 0) continue
      }
    }

    throw new ConflictException({
      code: 'PREPAID_WRITE_CONFLICT',
      message: '共享预存款已被其他操作更新，请刷新后重试'
    })
  }

  private async createRechargeInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    input: ValidatedRecharge,
    idempotencyKey: string
  ): Promise<SharedPrepaidRechargeResult> {
    const existing = await tx.sharedPrepaidRecharge.findUnique({
      where: { idempotencyKey },
      include: rechargeReadInclude
    })
    if (existing) return this.toRechargeResult(existing as RechargeReadRow)

    const member = await tx.sharedPrepaidMember.upsert({
      where: { phone: input.phone },
      create: {
        phone: input.phone,
        createdById: user.id
      },
      update: {}
    })
    await tx.$queryRaw`SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${member.id} FOR UPDATE`

    const duplicateAfterLock = await tx.sharedPrepaidRecharge.findUnique({
      where: { idempotencyKey },
      include: rechargeReadInclude
    })
    if (duplicateAfterLock) return this.toRechargeResult(duplicateAfterLock as RechargeReadRow)

    const recharge = await tx.sharedPrepaidRecharge.create({
      data: {
        memberId: member.id,
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        rechargeDate: input.rechargeDate,
        paidAmount: input.paidAmount,
        giftAmount: input.giftAmount,
        totalAmount: input.totalAmount,
        remainingAmount: input.totalAmount,
        isOpeningBalance: input.isOpeningBalance,
        remark: input.remark,
        idempotencyKey
      }
    })
    await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: member.id,
        kind: SharedPrepaidLedgerKind.RECHARGE,
        balanceDelta: input.totalAmount,
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        referenceType: 'SharedPrepaidRecharge',
        referenceId: recharge.id,
        idempotencyKey
      }
    })
    const updatedMember = await tx.sharedPrepaidMember.update({
      where: { id: member.id },
      data: {
        cachedBalance: { increment: input.totalAmount },
        version: { increment: 1 }
      }
    })

    return this.toRechargeResult({
      ...recharge,
      member: {
        phone: input.phone,
        cachedBalance: updatedMember.cachedBalance
      }
    } as RechargeReadRow)
  }

  private async reverseRechargeInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    rechargeId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<SharedPrepaidRechargeResult> {
    const initialRecharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!initialRecharge) throw new NotFoundException('充值记录不存在')
    if (initialRecharge.ownerFrontendUserId !== user.dataOwnerId) {
      throw new ForbiddenException('只能冲正本主账号录入的充值')
    }

    const duplicateLedger = await tx.sharedPrepaidLedgerEntry.findUnique({
      where: { idempotencyKey }
    })
    if (duplicateLedger) {
      if (
        duplicateLedger.kind !== SharedPrepaidLedgerKind.RECHARGE_REVERSAL ||
        duplicateLedger.referenceId !== rechargeId
      ) {
        throw new ConflictException({
          code: 'PREPAID_IDEMPOTENCY_KEY_REUSED',
          message: '幂等请求编号已用于其他操作'
        })
      }
      const duplicateRecharge = await tx.sharedPrepaidRecharge.findUnique({
        where: { id: rechargeId },
        include: rechargeReadInclude
      })
      if (duplicateRecharge?.reversedByLedgerId === duplicateLedger.id) {
        return this.toRechargeResult(duplicateRecharge as RechargeReadRow)
      }
    }

    await tx.$queryRaw`SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${initialRecharge.memberId} FOR UPDATE`
    const recharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!recharge) throw new NotFoundException('充值记录不存在')
    if (recharge.reversedAt) {
      throw new ConflictException({
        code: 'PREPAID_RECHARGE_ALREADY_REVERSED',
        message: '该充值已冲正'
      })
    }
    if (!recharge.remainingAmount.equals(recharge.totalAmount)) {
      throw new ConflictException({
        code: 'PREPAID_RECHARGE_ALREADY_USED',
        message: '该充值额度已被消费，不能直接冲正'
      })
    }

    const reversal = await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: recharge.memberId,
        kind: SharedPrepaidLedgerKind.RECHARGE_REVERSAL,
        balanceDelta: recharge.totalAmount.negated(),
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        referenceType: 'SharedPrepaidRecharge',
        referenceId: recharge.id,
        idempotencyKey
      }
    })
    const reversedAt = new Date()
    const reversedRecharge = await tx.sharedPrepaidRecharge.update({
      where: { id: recharge.id },
      data: {
        reversedAt,
        reversedByLedgerId: reversal.id,
        remark: recharge.remark
          ? `${recharge.remark}\n[冲正原因] ${reason}`
          : `[冲正原因] ${reason}`
      },
      include: rechargeReadInclude
    })
    const member = await tx.sharedPrepaidMember.update({
      where: { id: recharge.memberId },
      data: {
        cachedBalance: { decrement: recharge.totalAmount },
        version: { increment: 1 }
      }
    })

    return this.toRechargeResult({
      ...reversedRecharge,
      member: {
        phone: reversedRecharge.member.phone,
        cachedBalance: member.cachedBalance
      }
    } as RechargeReadRow)
  }

  private async loadIdempotentReversal(
    rechargeId: string,
    idempotencyKey: string
  ): Promise<SharedPrepaidRechargeResult | null> {
    const ledger = await this.prisma.sharedPrepaidLedgerEntry.findUnique({
      where: { idempotencyKey }
    })
    if (
      !ledger ||
      ledger.kind !== SharedPrepaidLedgerKind.RECHARGE_REVERSAL ||
      ledger.referenceId !== rechargeId
    ) return null

    const recharge = await this.prisma.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!recharge || recharge.reversedByLedgerId !== ledger.id) return null
    return this.toRechargeResult(recharge as RechargeReadRow)
  }

  private validateRecharge(payload: CreateRechargePayload): ValidatedRecharge {
    let phone: string
    try {
      phone = normalizePrepaidPhone(payload.phone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }

    const rechargeDate = String(payload.rechargeDate ?? '').trim()
    if (!this.isCalendarDate(rechargeDate)) throw new BadRequestException('请填写有效的充值日期')
    const paidAmount = this.requireMoney(payload.paidAmount, '充值金额')
    if (paidAmount.lessThanOrEqualTo(0)) throw new BadRequestException('充值金额必须大于 0')
    const giftAmount = this.requireMoney(payload.giftAmount, '赠送金额')
    if (giftAmount.lessThan(0)) throw new BadRequestException('赠送金额不能为负数')
    const remark = payload.remark === undefined || payload.remark === null
      ? null
      : String(payload.remark).trim() || null
    if (remark && remark.length > 500) throw new BadRequestException('备注不能超过 500 个字符')

    return {
      phone,
      rechargeDate,
      paidAmount,
      giftAmount,
      totalAmount: paidAmount.add(giftAmount),
      isOpeningBalance: payload.isOpeningBalance === true,
      remark
    }
  }

  private requireMoney(value: unknown, label: string): Prisma.Decimal {
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new BadRequestException(`${label}必填`)
    }
    let amount: Prisma.Decimal
    try {
      amount = new Prisma.Decimal(value as Prisma.Decimal.Value)
    } catch {
      throw new BadRequestException(`${label}格式错误`)
    }
    if (!amount.isFinite()) throw new BadRequestException(`${label}格式错误`)
    if (amount.decimalPlaces() > 2) throw new BadRequestException(`${label}最多保留 2 位小数`)
    if (amount.abs().greaterThan('999999999999.99')) {
      throw new BadRequestException(`${label}超出允许范围`)
    }
    return amount
  }

  private isCalendarDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }

  private requireIdempotencyKey(value: string): string {
    const key = String(value || '').trim()
    if (!key) throw new BadRequestException('缺少幂等请求编号')
    if (key.length > 200) throw new BadRequestException('幂等请求编号过长')
    return key
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }

  private toRechargeResult(row: RechargeReadRow): SharedPrepaidRechargeResult {
    if (!row.member) throw new Error('充值读模型缺少会员信息')
    return {
      id: row.id,
      memberId: row.memberId,
      phone: row.member.phone,
      ownerFrontendUserId: row.ownerFrontendUserId,
      actorUserId: row.actorUserId,
      rechargeDate: row.rechargeDate,
      paidAmount: row.paidAmount.toNumber(),
      giftAmount: row.giftAmount.toNumber(),
      totalAmount: row.totalAmount.toNumber(),
      remainingAmount: row.remainingAmount.toNumber(),
      balance: row.member.cachedBalance.toNumber(),
      isOpeningBalance: row.isOpeningBalance,
      remark: row.remark,
      reversedAt: row.reversedAt,
      createdAt: row.createdAt
    }
  }
}
