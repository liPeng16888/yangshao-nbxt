import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import {
  Prisma,
  SharedPrepaidConsumptionKind,
  SharedPrepaidLedgerKind,
  SharedPrepaidPayableStatus
} from '@prisma/client'
import { createHash } from 'node:crypto'

import type { CurrentUser } from '../auth/current-user'
import { labDetectionInputFields } from '../common/lab'
import { PrismaService } from '../prisma/prisma.service'
import { allocatePrepaidLots, normalizePrepaidPhone } from './shared-prepaid-money'
import { SharedPrepaidRealtimeService } from './shared-prepaid-realtime.service'

export interface SyncSampleConsumptionInput {
  sheetId: string
  sampleBlockId: string
  sampleIndex: number
  sheetDate: string
  consumingFrontendUserId: string
  actorUserId: string
  oldInputs: Record<string, unknown>
  nextInputs: Record<string, unknown>
  idempotencyKey: string
}

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

export interface SharedPrepaidConsumptionReversalResult {
  id: string
  reversalOfId: string
  memberId: string
  consumingFrontendUserId: string
  actorUserId: string
  amount: number
  balance: number
  reason: string
  createdAt: Date
}

export interface SharedPrepaidSampleMutation {
  memberId: string
  consumptionId: string
  operation: 'create' | 'update'
}

interface TransactionMutation<T> {
  result: T
  changed: boolean
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

interface ValidatedConsumptionTuple {
  memberId: string
  phone: string
  amount: Prisma.Decimal
}

type ActiveConsumptionRow = Prisma.SharedPrepaidConsumptionGetPayload<{
  include: {
    allocations: { include: { recharge: true } }
    payables: true
  }
}>

type IdempotencyReader = Pick<Prisma.TransactionClient, 'sharedPrepaidLedgerEntry'>
type ConsumptionIdempotencyReader = Pick<
  Prisma.TransactionClient,
  'sharedPrepaidLedgerEntry' | 'sharedPrepaidConsumption'
>

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: SharedPrepaidRealtimeService
  ) {}

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
        const outcome = await this.prisma.$transaction((tx) => (
          this.createRechargeInTransaction(tx, user, input, key, expected)
        ))
        if (outcome.changed) this.publishRechargeMutation(outcome.result, user.id, 'create')
        return outcome.result
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
    const normalizedReason = this.requireReversalReason(reason)
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
        const outcome = await this.prisma.$transaction((tx) => (
          this.reverseRechargeInTransaction(
            tx,
            user,
            normalizedRechargeId,
            normalizedReason,
            key,
            expected
          )
        ))
        if (outcome.changed) this.publishRechargeMutation(outcome.result, user.id, 'update')
        return outcome.result
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

  async reverseConsumption(
    user: CurrentUser,
    consumptionId: string,
    reason: unknown,
    idempotencyKey: string
  ): Promise<SharedPrepaidConsumptionReversalResult> {
    if (!user.isFrontendMainAccount) {
      throw new ForbiddenException('只有主账号可以冲正消费')
    }
    const key = this.requireIdempotencyKey(idempotencyKey)
    const normalizedConsumptionId = String(consumptionId || '').trim()
    if (!normalizedConsumptionId) throw new BadRequestException('缺少消费记录编号')
    const normalizedReason = this.requireReversalReason(reason)
    const expected: ExpectedIdempotencyRequest = {
      kind: SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL,
      fingerprint: this.fingerprint({
        operation: 'REVERSE_CONSUMPTION',
        ownerFrontendUserId: user.dataOwnerId,
        actorUserId: user.id,
        consumptionId: normalizedConsumptionId,
        reason: normalizedReason
      })
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const outcome = await this.prisma.$transaction((tx) => (
          this.reverseConsumptionInTransaction(
            tx,
            user,
            normalizedConsumptionId,
            normalizedReason,
            key,
            expected
          )
        ))
        if (outcome.changed) this.publishConsumptionMutation({
          memberId: outcome.result.memberId,
          consumptionId: outcome.result.id,
          operation: 'update'
        }, user.id)
        return outcome.result
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error
        const duplicate = await this.resolveConsumptionReversalResponse(
          this.prisma,
          key,
          normalizedConsumptionId,
          expected
        )
        if (duplicate) return duplicate
        if (attempt === 0) continue
      }
    }

    throw new ConflictException({
      code: 'PREPAID_WRITE_CONFLICT',
      message: '共享预存款已被其他操作更新，请刷新后重试'
    })
  }

  async syncSampleConsumption(
    tx: Prisma.TransactionClient,
    input: SyncSampleConsumptionInput
  ): Promise<SharedPrepaidSampleMutation | null> {
    const nextTuple = this.validateConsumptionTuple(input.nextInputs)
    const initialActive = await this.findActiveConsumption(tx, input.sampleBlockId)
    if (!initialActive && !nextTuple) return null

    const key = this.requireIdempotencyKey(input.idempotencyKey)
    const expectedKind = nextTuple
      ? SharedPrepaidLedgerKind.CONSUMPTION
      : SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL
    const requestFingerprint = this.fingerprint({
      operation: 'SYNC_SAMPLE_CONSUMPTION',
      sheetId: input.sheetId,
      sampleBlockId: input.sampleBlockId,
      consumingFrontendUserId: input.consumingFrontendUserId,
      actorUserId: input.actorUserId,
      oldTuple: this.consumptionTupleFingerprint(input.oldInputs),
      nextTuple: nextTuple
        ? { memberId: nextTuple.memberId, phone: nextTuple.phone, amount: nextTuple.amount.toFixed(2) }
        : null
    })
    if (await this.resolveConsumptionIdempotency(tx, key, expectedKind, requestFingerprint)) return null
    const orphanConsumption = await tx.sharedPrepaidConsumption.findUnique({
      where: { idempotencyKey: key },
      select: { id: true }
    })
    if (orphanConsumption) throw this.idempotencyStateInvalid()

    const nextMember = nextTuple
      ? await tx.sharedPrepaidMember.findUnique({
          where: { phone: nextTuple.phone },
          select: { id: true, phone: true, cachedBalance: true, version: true }
        })
      : null
    if (nextTuple && !nextMember) throw new NotFoundException('预存款会员不存在，请先充值或录入期初余额')
    if (nextTuple && nextMember?.id !== nextTuple.memberId) {
      throw new BadRequestException('预存款会员与手机号不匹配')
    }

    const memberIds = [...new Set([
      initialActive?.memberId,
      nextMember?.id
    ].filter((id): id is string => Boolean(id)))].sort()
    for (const memberId of memberIds) {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${memberId} FOR UPDATE
      `
    }

    const active = await this.findActiveConsumption(tx, input.sampleBlockId)
    if (active && nextTuple && this.consumptionMatches(active, nextTuple, input.consumingFrontendUserId)) return null

    let mutation: SharedPrepaidSampleMutation | null = null
    if (active) {
      const reversalKey = nextTuple
        ? this.derivedIdempotencyKey(key, `reverse:${active.id}`)
        : key
      const reversal = await this.reverseSampleConsumption(
        tx,
        active,
        input.actorUserId,
        reversalKey,
        requestFingerprint,
        '样品预存款信息已修改'
      )
      mutation = {
        memberId: reversal.memberId,
        consumptionId: reversal.id,
        operation: 'update'
      }
    }
    if (nextTuple) {
      mutation = await this.createSampleConsumption(tx, input, nextTuple, key, requestFingerprint)
    }
    return mutation
  }

  private async createRechargeInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    input: ValidatedRecharge,
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<TransactionMutation<SharedPrepaidRechargeResult>> {
    const duplicate = await this.resolveIdempotentResponse(tx, idempotencyKey, expected)
    if (duplicate) return { result: duplicate, changed: false }

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
    return { result, changed: true }
  }

  private async reverseRechargeInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    rechargeId: string,
    reason: string,
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<TransactionMutation<SharedPrepaidRechargeResult>> {
    const duplicate = await this.resolveIdempotentResponse(tx, idempotencyKey, expected)
    if (duplicate) return { result: duplicate, changed: false }

    const initialRecharge = await tx.sharedPrepaidRecharge.findUnique({
      where: { id: rechargeId },
      include: rechargeReadInclude
    })
    if (!initialRecharge) throw new NotFoundException('充值记录不存在')
    if (initialRecharge.ownerFrontendUserId !== user.dataOwnerId) {
      throw new ForbiddenException('只能冲正本主账号录入的充值')
    }

    await tx.$queryRaw`SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${initialRecharge.memberId} FOR UPDATE`
    const lockedDuplicate = await this.resolveIdempotentResponse(tx, idempotencyKey, expected)
    if (lockedDuplicate) return { result: lockedDuplicate, changed: false }
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
    return { result, changed: true }
  }

  private async reverseConsumptionInTransaction(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    consumptionId: string,
    reason: string,
    idempotencyKey: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<TransactionMutation<SharedPrepaidConsumptionReversalResult>> {
    const duplicate = await this.resolveConsumptionReversalResponse(
      tx,
      idempotencyKey,
      consumptionId,
      expected
    )
    if (duplicate) return { result: duplicate, changed: false }

    const orphanReversal = await tx.sharedPrepaidConsumption.findUnique({
      where: { idempotencyKey },
      select: { id: true }
    })
    if (orphanReversal) throw this.idempotencyStateInvalid()

    const initial = await tx.sharedPrepaidConsumption.findUnique({
      where: { id: consumptionId },
      include: {
        allocations: { include: { recharge: true } },
        payables: true
      }
    })
    if (!initial) throw new NotFoundException('消费记录不存在')
    if (initial.consumingFrontendUserId !== user.dataOwnerId) {
      throw new ForbiddenException('只能冲正本主账号的消费')
    }
    if (initial.kind !== SharedPrepaidConsumptionKind.CONSUMPTION) {
      throw new ConflictException({
        code: 'PREPAID_CONSUMPTION_REVERSAL_TARGET_INVALID',
        message: '冲正记录不能再次冲正'
      })
    }

    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${initial.memberId} FOR UPDATE
    `
    const lockedDuplicate = await this.resolveConsumptionReversalResponse(
      tx,
      idempotencyKey,
      consumptionId,
      expected
    )
    if (lockedDuplicate) return { result: lockedDuplicate, changed: false }
    return {
      result: await this.reverseSampleConsumption(
      tx,
      initial,
      user.id,
      idempotencyKey,
      expected.fingerprint,
      reason,
      user.dataOwnerId
      ),
      changed: true
    }
  }

  private async createSampleConsumption(
    tx: Prisma.TransactionClient,
    input: SyncSampleConsumptionInput,
    tuple: ValidatedConsumptionTuple,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<SharedPrepaidSampleMutation> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "SharedPrepaidRecharge"
      WHERE "memberId" = ${tuple.memberId}
        AND "reversedAt" IS NULL
        AND "remainingAmount" > 0
      ORDER BY "rechargeDate" ASC, "createdAt" ASC, "id" ASC
      FOR UPDATE
    `
    const member = await tx.sharedPrepaidMember.findUnique({
      where: { id: tuple.memberId },
      select: { id: true, cachedBalance: true, version: true }
    })
    if (!member) throw new NotFoundException('预存款会员不存在')
    const lots = await tx.sharedPrepaidRecharge.findMany({
      where: {
        memberId: tuple.memberId,
        reversedAt: null,
        remainingAmount: { gt: new Prisma.Decimal(0) }
      },
      orderBy: [{ rechargeDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        ownerFrontendUserId: true,
        rechargeDate: true,
        createdAt: true,
        paidAmount: true,
        giftAmount: true,
        remainingAmount: true
      }
    })
    const allocation = allocatePrepaidLots({
      consumingFrontendUserId: input.consumingFrontendUserId,
      amount: tuple.amount,
      lots
    })
    const consumption = await tx.sharedPrepaidConsumption.create({
      data: {
        memberId: tuple.memberId,
        consumingFrontendUserId: input.consumingFrontendUserId,
        actorUserId: input.actorUserId,
        kind: SharedPrepaidConsumptionKind.CONSUMPTION,
        amount: tuple.amount,
        sheetId: input.sheetId,
        sampleBlockId: input.sampleBlockId,
        sampleIndex: input.sampleIndex,
        sampleNumberSnapshot: this.sampleNumberSnapshot(input.nextInputs),
        sampleCountSnapshot: 1,
        elementsSnapshot: this.elementsSnapshot(input.nextInputs),
        phoneSnapshot: tuple.phone,
        sheetDate: input.sheetDate,
        active: true,
        idempotencyKey
      }
    })

    if (allocation.allocations.length) {
      await tx.sharedPrepaidAllocation.createMany({
        data: allocation.allocations.map((row) => ({
          consumptionId: consumption.id,
          rechargeId: row.rechargeId,
          sourceOwnerId: row.sourceOwnerId,
          allocatedAmount: row.allocatedAmount,
          paidRatio: row.paidRatio.toDecimalPlaces(10, Prisma.Decimal.ROUND_HALF_UP),
          exactTransferAmount: row.exactTransferAmount.toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
        }))
      })
    }
    if (allocation.payables.length) {
      await tx.sharedPrepaidPayable.createMany({
        data: allocation.payables.map((row) => ({
          consumptionId: consumption.id,
          sourceOwnerId: row.sourceOwnerId,
          consumerOwnerId: row.consumerOwnerId,
          exactAmount: row.exactAmount.toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP),
          amount: row.amount
        }))
      })
    }

    for (const row of allocation.allocations) {
      const updated = await tx.sharedPrepaidRecharge.updateMany({
        where: {
          id: row.rechargeId,
          reversedAt: null,
          remainingAmount: { gte: row.allocatedAmount }
        },
        data: { remainingAmount: { decrement: row.allocatedAmount } }
      })
      if (updated.count !== 1) throw this.balanceVersionConflict()
    }
    const balanceAfter = member.cachedBalance.sub(tuple.amount)
    const updatedMember = await tx.sharedPrepaidMember.updateMany({
      where: {
        id: member.id,
        version: member.version,
        cachedBalance: { gte: tuple.amount }
      },
      data: {
        cachedBalance: { decrement: tuple.amount },
        version: { increment: 1 }
      }
    })
    if (updatedMember.count !== 1) throw this.balanceVersionConflict()
    const verifiedMember = await tx.sharedPrepaidMember.findUnique({
      where: { id: member.id },
      select: { cachedBalance: true }
    })
    if (!verifiedMember?.cachedBalance.equals(balanceAfter) || !allocation.remainingBalance.equals(balanceAfter)) {
      throw this.balanceVersionConflict()
    }
    await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: tuple.memberId,
        kind: SharedPrepaidLedgerKind.CONSUMPTION,
        balanceDelta: tuple.amount.negated(),
        ownerFrontendUserId: input.consumingFrontendUserId,
        actorUserId: input.actorUserId,
        referenceType: 'SharedPrepaidConsumption',
        referenceId: consumption.id,
        idempotencyKey,
        requestFingerprint,
        responseSnapshot: Prisma.JsonNull,
        reason: null
      }
    })
    return {
      memberId: tuple.memberId,
      consumptionId: consumption.id,
      operation: 'create'
    }
  }

  private publishRechargeMutation(
    recharge: Pick<SharedPrepaidRechargeResult, 'id' | 'memberId'>,
    changedById: string,
    operation: 'create' | 'update'
  ) {
    const updatedAt = new Date().toISOString()
    this.realtime.publish({
      module: 'recharges',
      entityId: recharge.id,
      operation,
      changedById,
      updatedAt
    })
    this.realtime.publish({
      module: 'members',
      entityId: recharge.memberId,
      operation: 'update',
      changedById,
      updatedAt
    })
  }

  private publishConsumptionMutation(mutation: SharedPrepaidSampleMutation, changedById: string) {
    const updatedAt = new Date().toISOString()
    this.realtime.publish({
      module: 'consumptions',
      entityId: mutation.consumptionId,
      operation: mutation.operation,
      changedById,
      updatedAt
    })
    this.realtime.publish({
      module: 'members',
      entityId: mutation.memberId,
      operation: 'update',
      changedById,
      updatedAt
    })
    this.realtime.publish({
      module: 'settlements',
      entityId: mutation.consumptionId,
      operation: 'update',
      changedById,
      updatedAt
    })
  }

  private async reverseSampleConsumption(
    tx: Prisma.TransactionClient,
    initial: ActiveConsumptionRow,
    actorUserId: string,
    idempotencyKey: string,
    requestFingerprint: string,
    reason: string,
    expectedOwnerFrontendUserId?: string
  ): Promise<SharedPrepaidConsumptionReversalResult> {
    const rechargeIds = initial.allocations.map((row) => row.rechargeId).sort()
    for (const rechargeId of rechargeIds) {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SharedPrepaidRecharge" WHERE "id" = ${rechargeId} FOR UPDATE
      `
    }
    const active = await tx.sharedPrepaidConsumption.findUnique({
      where: { id: initial.id },
      include: {
        allocations: { include: { recharge: true } },
        payables: true
      }
    })
    if (!active) throw new NotFoundException('消费记录不存在')
    if (active.kind !== SharedPrepaidConsumptionKind.CONSUMPTION) {
      throw new ConflictException({
        code: 'PREPAID_CONSUMPTION_REVERSAL_TARGET_INVALID',
        message: '冲正记录不能再次冲正'
      })
    }
    if (expectedOwnerFrontendUserId && active.consumingFrontendUserId !== expectedOwnerFrontendUserId) {
      throw new ForbiddenException('只能冲正本主账号的消费')
    }
    if (!active.active) {
      throw new ConflictException({
        code: 'PREPAID_CONSUMPTION_ALREADY_REVERSED',
        message: '该消费已冲正'
      })
    }
    if (active.payables.some((payable) => payable.status === SharedPrepaidPayableStatus.HELD)) {
      throw new ConflictException({
        code: 'PREPAID_CONSUMPTION_SETTLEMENT_HELD',
        message: '该消费已进入未完成结算，请先取消或驳回结算单'
      })
    }
    if (active.payables.some((payable) => payable.status === SharedPrepaidPayableStatus.REVERSED)) {
      throw new ConflictException({
        code: 'PREPAID_CONSUMPTION_REVERSAL_STATE_INVALID',
        message: '消费冲正状态不完整，请刷新后重试'
      })
    }
    const member = await tx.sharedPrepaidMember.findUnique({
      where: { id: active.memberId },
      select: { id: true, cachedBalance: true, version: true }
    })
    if (!member) throw new NotFoundException('预存款会员不存在')

    const reversal = await tx.sharedPrepaidConsumption.create({
      data: {
        memberId: active.memberId,
        consumingFrontendUserId: active.consumingFrontendUserId,
        actorUserId,
        kind: SharedPrepaidConsumptionKind.REVERSAL,
        amount: active.amount,
        sheetId: active.sheetId,
        sampleBlockId: active.sampleBlockId,
        sampleIndex: active.sampleIndex,
        sampleNumberSnapshot: active.sampleNumberSnapshot,
        sampleCountSnapshot: active.sampleCountSnapshot,
        elementsSnapshot: active.elementsSnapshot as Prisma.InputJsonValue,
        phoneSnapshot: active.phoneSnapshot,
        sheetDate: active.sheetDate,
        active: false,
        reversalOfId: active.id,
        idempotencyKey
      }
    })

    for (const allocation of active.allocations) {
      if (
        !allocation.recharge ||
        allocation.recharge.reversedAt ||
        allocation.recharge.remainingAmount.add(allocation.allocatedAmount).greaterThan(allocation.recharge.totalAmount)
      ) throw this.balanceVersionConflict()
      const restored = await tx.sharedPrepaidRecharge.updateMany({
        where: { id: allocation.rechargeId, reversedAt: null },
        data: { remainingAmount: { increment: allocation.allocatedAmount } }
      })
      if (restored.count !== 1) throw this.balanceVersionConflict()
    }
    const balanceAfter = member.cachedBalance.add(active.amount)
    const updatedMember = await tx.sharedPrepaidMember.updateMany({
      where: { id: member.id, version: member.version },
      data: {
        cachedBalance: { increment: active.amount },
        version: { increment: 1 }
      }
    })
    if (updatedMember.count !== 1) throw this.balanceVersionConflict()
    const verifiedMember = await tx.sharedPrepaidMember.findUnique({
      where: { id: member.id },
      select: { cachedBalance: true }
    })
    if (!verifiedMember?.cachedBalance.equals(balanceAfter)) throw this.balanceVersionConflict()

    for (const payable of active.payables) {
      if (payable.status === SharedPrepaidPayableStatus.PENDING) {
        const reversed = await tx.sharedPrepaidPayable.updateMany({
          where: { id: payable.id, status: SharedPrepaidPayableStatus.PENDING },
          data: { status: SharedPrepaidPayableStatus.REVERSED }
        })
        if (reversed.count !== 1) throw this.balanceVersionConflict()
      } else if (payable.status === SharedPrepaidPayableStatus.COMPLETED) {
        await tx.sharedPrepaidPayable.create({
          data: {
            consumptionId: reversal.id,
            sourceOwnerId: payable.consumerOwnerId,
            consumerOwnerId: payable.sourceOwnerId,
            exactAmount: payable.exactAmount,
            amount: payable.amount,
            status: SharedPrepaidPayableStatus.PENDING,
            reversalOfId: payable.id
          }
        })
      }
    }
    const result: SharedPrepaidConsumptionReversalResult = {
      id: reversal.id,
      reversalOfId: active.id,
      memberId: active.memberId,
      consumingFrontendUserId: active.consumingFrontendUserId,
      actorUserId,
      amount: active.amount.toNumber(),
      balance: balanceAfter.toNumber(),
      reason,
      createdAt: reversal.createdAt
    }
    await tx.sharedPrepaidLedgerEntry.create({
      data: {
        memberId: active.memberId,
        kind: SharedPrepaidLedgerKind.CONSUMPTION_REVERSAL,
        balanceDelta: active.amount,
        ownerFrontendUserId: active.consumingFrontendUserId,
        actorUserId,
        referenceType: 'SharedPrepaidConsumption',
        referenceId: reversal.id,
        idempotencyKey,
        requestFingerprint,
        responseSnapshot: this.toConsumptionReversalSnapshot(result),
        reason
      }
    })
    const deactivated = await tx.sharedPrepaidConsumption.updateMany({
      where: { id: active.id, active: true },
      data: { active: false }
    })
    if (deactivated.count !== 1) throw this.balanceVersionConflict()
    return result
  }

  private async findActiveConsumption(tx: Prisma.TransactionClient, sampleBlockId: string) {
    return tx.sharedPrepaidConsumption.findFirst({
      where: {
        sampleBlockId,
        active: true,
        kind: SharedPrepaidConsumptionKind.CONSUMPTION
      },
      include: {
        allocations: { include: { recharge: true } },
        payables: true
      }
    })
  }

  private validateConsumptionTuple(inputs: Record<string, unknown>): ValidatedConsumptionTuple | null {
    if (inputs.paymentStatus !== '预存款') return null
    const memberId = typeof inputs.prepaidMemberId === 'string' ? inputs.prepaidMemberId.trim() : ''
    if (!memberId) throw new BadRequestException('请选择预存款会员')
    if (typeof inputs.prepaidMemberPhone !== 'string') throw new BadRequestException('请填写预存款会员手机号')
    let phone: string
    try {
      phone = normalizePrepaidPhone(inputs.prepaidMemberPhone)
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '会员手机号格式错误')
    }
    const amount = this.requireMoney(inputs.price, '预存款扣除金额')
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('预存款扣除金额必须大于 0')
    return { memberId, phone, amount }
  }

  private consumptionTupleFingerprint(inputs: Record<string, unknown>) {
    if (inputs.paymentStatus !== '预存款') return null
    let amount = String(inputs.price ?? '')
    try {
      amount = new Prisma.Decimal(amount).toFixed(2)
    } catch { /* keep the raw value for a stable conflict fingerprint */ }
    return {
      memberId: String(inputs.prepaidMemberId ?? '').trim(),
      phone: String(inputs.prepaidMemberPhone ?? '').replace(/\D/g, ''),
      amount
    }
  }

  private consumptionMatches(
    active: ActiveConsumptionRow,
    tuple: ValidatedConsumptionTuple,
    consumingFrontendUserId: string
  ) {
    return active.memberId === tuple.memberId &&
      active.phoneSnapshot === tuple.phone &&
      active.consumingFrontendUserId === consumingFrontendUserId &&
      active.amount.equals(tuple.amount)
  }

  private sampleNumberSnapshot(inputs: Record<string, unknown>) {
    const sampleNumber = typeof inputs.sampleNumber === 'string' ? inputs.sampleNumber.trim() : ''
    return sampleNumber || null
  }

  private elementsSnapshot(inputs: Record<string, unknown>): Prisma.InputJsonValue {
    return labDetectionInputFields.filter((field) => {
      const value = inputs[field]
      return value !== undefined && value !== null && value !== ''
    })
  }

  private async resolveConsumptionReversalResponse(
    reader: ConsumptionIdempotencyReader,
    idempotencyKey: string,
    originalConsumptionId: string,
    expected: ExpectedIdempotencyRequest
  ): Promise<SharedPrepaidConsumptionReversalResult | null> {
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
    if (ledger.kind !== expected.kind || ledger.requestFingerprint !== expected.fingerprint) {
      throw this.idempotencyConflict()
    }
    const result = this.fromConsumptionReversalSnapshot(ledger.responseSnapshot)
    const reversal = await reader.sharedPrepaidConsumption.findUnique({
      where: { id: ledger.referenceId },
      select: {
        id: true,
        kind: true,
        reversalOfId: true,
        idempotencyKey: true
      }
    })
    if (
      !reversal ||
      reversal.kind !== SharedPrepaidConsumptionKind.REVERSAL ||
      reversal.id !== result.id ||
      reversal.reversalOfId !== originalConsumptionId ||
      reversal.reversalOfId !== result.reversalOfId ||
      reversal.idempotencyKey !== idempotencyKey
    ) throw this.idempotencyStateInvalid()
    return result
  }

  private async resolveConsumptionIdempotency(
    tx: Prisma.TransactionClient,
    idempotencyKey: string,
    kind: SharedPrepaidLedgerKind,
    requestFingerprint: string
  ) {
    const ledger = await tx.sharedPrepaidLedgerEntry.findUnique({
      where: { idempotencyKey },
      select: { kind: true, referenceId: true, requestFingerprint: true }
    })
    if (!ledger) return false
    if (ledger.kind !== kind || ledger.requestFingerprint !== requestFingerprint) throw this.idempotencyConflict()
    const consumption = await tx.sharedPrepaidConsumption.findUnique({
      where: { id: ledger.referenceId },
      select: { idempotencyKey: true }
    })
    if (!consumption || consumption.idempotencyKey !== idempotencyKey) throw this.idempotencyStateInvalid()
    return true
  }

  private derivedIdempotencyKey(key: string, suffix: string) {
    return `derived:${createHash('sha256').update(`${key}|${suffix}`).digest('hex')}`
  }

  private balanceVersionConflict() {
    return new ConflictException({
      code: 'PREPAID_BALANCE_VERSION_CONFLICT',
      message: '会员余额已变化，请重试'
    })
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

  private requireReversalReason(reason: unknown): string {
    if (typeof reason !== 'string') throw new BadRequestException('冲正原因必须为文本')
    const normalized = reason.trim()
    if (!normalized) throw new BadRequestException('请填写冲正原因')
    if (normalized.length > 500) throw new BadRequestException('冲正原因不能超过 500 个字符')
    return normalized
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

  private toConsumptionReversalSnapshot(
    result: SharedPrepaidConsumptionReversalResult
  ): Prisma.InputJsonObject {
    return {
      ...result,
      createdAt: result.createdAt.toISOString()
    }
  }

  private fromConsumptionReversalSnapshot(
    value: Prisma.JsonValue | null
  ): SharedPrepaidConsumptionReversalResult {
    if (!value || Array.isArray(value) || typeof value !== 'object') throw this.idempotencyStateInvalid()
    const snapshot = value as Record<string, Prisma.JsonValue>
    const stringFields = [
      'id',
      'reversalOfId',
      'memberId',
      'consumingFrontendUserId',
      'actorUserId',
      'reason',
      'createdAt'
    ] as const
    if (stringFields.some((field) => typeof snapshot[field] !== 'string')) {
      throw this.idempotencyStateInvalid()
    }
    if (typeof snapshot.amount !== 'number' || typeof snapshot.balance !== 'number') {
      throw this.idempotencyStateInvalid()
    }
    const createdAt = new Date(snapshot.createdAt as string)
    if (Number.isNaN(createdAt.getTime())) throw this.idempotencyStateInvalid()
    return {
      id: snapshot.id as string,
      reversalOfId: snapshot.reversalOfId as string,
      memberId: snapshot.memberId as string,
      consumingFrontendUserId: snapshot.consumingFrontendUserId as string,
      actorUserId: snapshot.actorUserId as string,
      amount: snapshot.amount,
      balance: snapshot.balance,
      reason: snapshot.reason as string,
      createdAt
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
