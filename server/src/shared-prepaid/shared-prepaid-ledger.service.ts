import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { Prisma, SharedPrepaidLedgerKind } from '@prisma/client'
import { createHash } from 'node:crypto'

import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { normalizePrepaidPhone } from './shared-prepaid-money'

export interface CreateRechargePayload {
  phone: unknown
  rechargeDate: unknown
  paidAmount: unknown
  giftAmount: unknown
  isOpeningBalance?: unknown
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

interface ExpectedIdempotencyRequest {
  kind: SharedPrepaidLedgerKind
  fingerprint: string
  referenceId?: string
}

type IdempotencyReader = Pick<Prisma.TransactionClient, 'sharedPrepaidLedgerEntry'>

const rechargeReadInclude = {
  member: {
    select: {
      phone: true,
      cachedBalance: true
    }
  }
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
    const expected: ExpectedIdempotencyRequest = {
      kind: SharedPrepaidLedgerKind.RECHARGE,
      fingerprint: this.fingerprint({
        operation: 'CREATE_RECHARGE',
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        phone: input.phone,
        rechargeDate: input.rechargeDate,
        paidAmount: input.paidAmount.toFixed(2),
        giftAmount: input.giftAmount.toFixed(2),
        isOpeningBalance: input.isOpeningBalance,
        remark: input.remark
      })
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => (
          this.createRechargeInTransaction(tx, user, input, key, expected)
        ))
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error
        const duplicate = await this.resolveIdempotentResponse(this.prisma, key, expected)
        if (duplicate) return duplicate
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
    const normalizedRechargeId = String(rechargeId || '').trim()
    if (!normalizedRechargeId) throw new BadRequestException('缺少充值记录编号')
    if (typeof reason !== 'string') throw new BadRequestException('冲正原因必须为文本')
    const normalizedReason = reason.trim()
    if (!normalizedReason) throw new BadRequestException('请填写冲正原因')
    if (normalizedReason.length > 500) throw new BadRequestException('冲正原因不能超过 500 个字符')
    const expected: ExpectedIdempotencyRequest = {
      kind: SharedPrepaidLedgerKind.RECHARGE_REVERSAL,
      referenceId: normalizedRechargeId,
      fingerprint: this.fingerprint({
        operation: 'REVERSE_RECHARGE',
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        rechargeId: normalizedRechargeId,
        reason: normalizedReason
      })
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction((tx) => (
          this.reverseRechargeInTransaction(
            tx,
            user,
            normalizedRechargeId,
            normalizedReason,
            key,
            expected
          )
        ))
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error
        const duplicate = await this.resolveIdempotentResponse(this.prisma, key, expected)
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
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<SharedPrepaidRechargeResult> {
    const duplicate = await this.resolveIdempotentResponse(tx, idempotencyKey, expected)
    if (duplicate) return duplicate

    const orphanRecharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { idempotencyKey }
    })
    if (orphanRecharge) throw this.idempotencyStateInvalid()

    const member = await tx.sharedPrepaidMember.upsert({
      where: { phone: input.phone },
      create: {
        phone: input.phone,
        createdById: user.id
      },
      update: {}
    })
    await tx.$queryRaw`SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${member.id} FOR UPDATE`
    const lockedMember = await tx.sharedPrepaidMember.findUnique({
      where: { id: member.id },
      select: { cachedBalance: true }
    })
    if (!lockedMember) throw new NotFoundException('预存款会员不存在')
    const balanceAfter = lockedMember.cachedBalance.add(input.totalAmount)

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
    const updatedMember = await tx.sharedPrepaidMember.update({
      where: { id: member.id },
      data: {
        cachedBalance: { increment: input.totalAmount },
        version: { increment: 1 }
      }
    })
    if (!updatedMember.cachedBalance.equals(balanceAfter)) {
      throw new ConflictException({
        code: 'PREPAID_BALANCE_VERSION_CONFLICT',
        message: '会员余额已变化，请重试'
      })
    }
    const result = this.buildRechargeResult(recharge, input.phone, balanceAfter)
    await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: member.id,
        kind: SharedPrepaidLedgerKind.RECHARGE,
        balanceDelta: input.totalAmount,
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        referenceType: 'SharedPrepaidRecharge',
        referenceId: recharge.id,
        idempotencyKey,
        requestFingerprint: expected.fingerprint,
        responseSnapshot: this.toResponseSnapshot(result),
        reason: null
      }
    })
    return result
  }

  private async reverseRechargeInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    rechargeId: string,
    reason: string,
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<SharedPrepaidRechargeResult> {
    const duplicate = await this.resolveIdempotentResponse(tx, idempotencyKey, expected)
    if (duplicate) return duplicate

    const initialRecharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!initialRecharge) throw new NotFoundException('充值记录不存在')
    if (initialRecharge.ownerFrontendUserId !== user.dataOwnerId) {
      throw new ForbiddenException('只能冲正本主账号录入的充值')
    }

    await tx.$queryRaw`SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${initialRecharge.memberId} FOR UPDATE`
    const recharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!recharge?.member) throw new NotFoundException('充值记录不存在')
    if (recharge.reversedAt) {
      throw new ConflictException({
        code: 'PREPAID_RECHARGE_ALREADY_REVERSED',
        message: '该充值已冲正'
      })
    }
    if (!recharge.remainingAmount.equals(recharge.totalAmount)) {
      throw new ConflictException({
        code: 'PREPAID_RECHARGE_ALREADY_USED',
        message: '该充值已有消费记录，请先冲正相关消费'
      })
    }

    const reversedAt = new Date()
    const balanceAfter = recharge.member.cachedBalance.sub(recharge.totalAmount)
    const result = this.buildRechargeResult(recharge, recharge.member.phone, balanceAfter, reversedAt)
    const reversal = await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: recharge.memberId,
        kind: SharedPrepaidLedgerKind.RECHARGE_REVERSAL,
        balanceDelta: recharge.totalAmount.negated(),
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        referenceType: 'SharedPrepaidRecharge',
        referenceId: recharge.id,
        idempotencyKey,
        requestFingerprint: expected.fingerprint,
        responseSnapshot: this.toResponseSnapshot(result),
        reason
      }
    })
    await tx.sharedPrepaidRecharge.update({
      where: { id: recharge.id },
      data: {
        reversedAt,
        reversedByLedgerId: reversal.id
      }
    })
    const member = await tx.sharedPrepaidMember.update({
      where: { id: recharge.memberId },
      data: {
        cachedBalance: { decrement: recharge.totalAmount },
        version: { increment: 1 }
      }
    })
    if (!member.cachedBalance.equals(balanceAfter)) {
      throw new ConflictException({
        code: 'PREPAID_BALANCE_VERSION_CONFLICT',
        message: '会员余额已变化，请重试'
      })
    }
    return result
  }

  private async resolveIdempotentResponse(
    reader: IdempotencyReader,
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<SharedPrepaidRechargeResult | null> {
    const ledger = await reader.sharedPrepaidLedgerEntry.findUnique({
      where: { idempotencyKey },
      select: {
        kind: true,
        referenceId: true,
        requestFingerprint: true,
        responseSnapshot: true
      }
    })
    if (!ledger) return null
    if (
      ledger.kind !== expected.kind ||
      ledger.requestFingerprint !== expected.fingerprint ||
      (expected.referenceId !== undefined && ledger.referenceId !== expected.referenceId)
    ) throw this.idempotencyConflict()
    return this.fromResponseSnapshot(ledger.responseSnapshot)
  }

  private validateRecharge(payload: CreateRechargePayload): ValidatedRecharge {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('充值请求体格式错误')
    }
    if (typeof payload.phone !== 'string') throw new BadRequestException('会员手机号必须为文本')
    let phone: string
    try {
      phone = normalizePrepaidPhone(payload.phone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }

    if (typeof payload.rechargeDate !== 'string') throw new BadRequestException('充值日期必须为文本')
    const rechargeDate = payload.rechargeDate.trim()
    if (!this.isCalendarDate(rechargeDate)) throw new BadRequestException('请填写有效的充值日期')
    const paidAmount = this.requireMoney(payload.paidAmount, '充值金额')
    if (paidAmount.lessThanOrEqualTo(0)) throw new BadRequestException('充值金额必须大于 0')
    const giftAmount = this.requireMoney(payload.giftAmount, '赠送金额')
    if (giftAmount.lessThan(0)) throw new BadRequestException('赠送金额不能为负数')
    if (payload.isOpeningBalance !== undefined && typeof payload.isOpeningBalance !== 'boolean') {
      throw new BadRequestException('期初余额标记必须为布尔值')
    }
    if (payload.remark !== undefined && payload.remark !== null && typeof payload.remark !== 'string') {
      throw new BadRequestException('备注必须为文本')
    }
    const remark = typeof payload.remark === 'string' ? payload.remark.trim() || null : null
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
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(`${label}格式错误`)
    }
    let amount: Prisma.Decimal
    try {
      amount = new Prisma.Decimal(value)
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

  private buildRechargeResult(
    row: Omit<RechargeReadRow, 'member'>,
    phone: string,
    balance: Prisma.Decimal,
    reversedAt: Date | null = row.reversedAt
  ): SharedPrepaidRechargeResult {
    return {
      id: row.id,
      memberId: row.memberId,
      phone,
      ownerFrontendUserId: row.ownerFrontendUserId,
      actorUserId: row.actorUserId,
      rechargeDate: row.rechargeDate,
      paidAmount: row.paidAmount.toNumber(),
      giftAmount: row.giftAmount.toNumber(),
      totalAmount: row.totalAmount.toNumber(),
      remainingAmount: row.remainingAmount.toNumber(),
      balance: balance.toNumber(),
      isOpeningBalance: row.isOpeningBalance,
      remark: row.remark,
      reversedAt,
      createdAt: row.createdAt
    }
  }

  private toResponseSnapshot(result: SharedPrepaidRechargeResult): Prisma.InputJsonObject {
    return {
      ...result,
      reversedAt: result.reversedAt?.toISOString() ?? null,
      createdAt: result.createdAt.toISOString()
    }
  }

  private fromResponseSnapshot(value: Prisma.JsonValue | null): SharedPrepaidRechargeResult {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw this.idempotencyStateInvalid()
    const snapshot = value as Record<string, Prisma.JsonValue>
    const stringFields = [
      'id',
      'memberId',
      'phone',
      'ownerFrontendUserId',
      'actorUserId',
      'rechargeDate',
      'createdAt'
    ] as const
    const numberFields = [
      'paidAmount',
      'giftAmount',
      'totalAmount',
      'remainingAmount',
      'balance'
    ] as const
    if (stringFields.some((field) => typeof snapshot[field] !== 'string')) {
      throw this.idempotencyStateInvalid()
    }
    if (numberFields.some((field) => typeof snapshot[field] !== 'number')) {
      throw this.idempotencyStateInvalid()
    }
    if (typeof snapshot.isOpeningBalance !== 'boolean') throw this.idempotencyStateInvalid()
    if (snapshot.remark !== null && typeof snapshot.remark !== 'string') throw this.idempotencyStateInvalid()
    if (snapshot.reversedAt !== null && typeof snapshot.reversedAt !== 'string') {
      throw this.idempotencyStateInvalid()
    }
    const createdAt = new Date(snapshot.createdAt as string)
    const reversedAt = snapshot.reversedAt === null ? null : new Date(snapshot.reversedAt as string)
    if (Number.isNaN(createdAt.getTime()) || (reversedAt && Number.isNaN(reversedAt.getTime()))) {
      throw this.idempotencyStateInvalid()
    }
    return {
      id: snapshot.id as string,
      memberId: snapshot.memberId as string,
      phone: snapshot.phone as string,
      ownerFrontendUserId: snapshot.ownerFrontendUserId as string,
      actorUserId: snapshot.actorUserId as string,
      rechargeDate: snapshot.rechargeDate as string,
      paidAmount: snapshot.paidAmount as number,
      giftAmount: snapshot.giftAmount as number,
      totalAmount: snapshot.totalAmount as number,
      remainingAmount: snapshot.remainingAmount as number,
      balance: snapshot.balance as number,
      isOpeningBalance: snapshot.isOpeningBalance,
      remark: snapshot.remark as string | null,
      reversedAt,
      createdAt
    }
  }

  private fingerprint(value: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
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

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: 'PREPAID_IDEMPOTENCY_CONFLICT',
      message: '幂等请求编号已用于不同的预存款操作'
    })
  }

  private idempotencyStateInvalid(): ConflictException {
    return new ConflictException({
      code: 'PREPAID_IDEMPOTENCY_STATE_INVALID',
      message: '幂等请求记录不完整，请使用新的请求编号'
    })
  }
}
