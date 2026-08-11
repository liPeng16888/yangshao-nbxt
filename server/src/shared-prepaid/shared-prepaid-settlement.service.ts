import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import {
  Prisma,
  SharedPrepaidPayableStatus,
  SharedPrepaidSettlementStatus
} from '@prisma/client'

import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'

export interface SubmitSettlementPaymentPayload {
  actualTransferredAt?: unknown
  proofUrls?: unknown
  remark?: unknown
}

interface ValidatedPaymentPayload {
  actualTransferredAt: Date
  proofUrls: string[]
  remark: string | null
}

type PayableRow = Prisma.SharedPrepaidPayableGetPayload<{
  include: {
    settlementLines: {
      where: { releasedAt: null }
      select: { id: true }
    }
  }
}>

type SettlementRow = Prisma.SharedPrepaidSettlementGetPayload<{
  include: {
    lines: {
      include: { payable: true }
      orderBy: { payableId: 'asc' }
    }
  }
}>

interface SettlementSelection {
  accountAId: string
  accountBId: string
  aToBAmount: Prisma.Decimal
  bToAAmount: Prisma.Decimal
  netAmount: Prisma.Decimal
  payerFrontendUserId: string | null
  receiverFrontendUserId: string | null
  payables: PayableRow[]
}

const payableSelectionInclude = {
  settlementLines: {
    where: { releasedAt: null },
    select: { id: true }
  }
} satisfies Prisma.SharedPrepaidPayableInclude

const settlementReadInclude = {
  lines: {
    include: { payable: true },
    orderBy: { payableId: 'asc' as const }
  }
} satisfies Prisma.SharedPrepaidSettlementInclude

@Injectable()
export class SharedPrepaidSettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async previewSettlement(user: CurrentUser, payableIds: unknown) {
    this.assertCanView(user)
    const ids = this.normalizePayableIds(payableIds)
    const payables = await this.readPayables(this.prisma, ids)
    return this.toPreview(this.selectSettlement(user, ids, payables))
  }

  async createSettlement(
    user: CurrentUser,
    payableIds: unknown,
    idempotencyKey: string
  ) {
    this.assertMainAccount(user, '只有主账号可以创建结算单')
    const ids = this.normalizePayableIds(payableIds)
    const key = this.requireIdempotencyKey(idempotencyKey)

    try {
      return await this.prisma.$transaction(async (tx) => {
        const duplicate = await tx.sharedPrepaidSettlement.findUnique({
          where: { idempotencyKey: key },
          include: settlementReadInclude
        })
        if (duplicate) return this.resolveCreateRetry(duplicate, user, ids)

        await this.lockPayables(tx, ids)
        const committedWhileWaiting = await tx.sharedPrepaidSettlement.findUnique({
          where: { idempotencyKey: key },
          include: settlementReadInclude
        })
        if (committedWhileWaiting) return this.resolveCreateRetry(committedWhileWaiting, user, ids)

        const payables = await this.readPayables(tx, ids)
        const selection = this.selectSettlement(user, ids, payables)
        if (
          selection.payerFrontendUserId &&
          selection.payerFrontendUserId !== user.dataOwnerId
        ) {
          throw new ForbiddenException('只有最终付款主账号可以创建该结算单')
        }

        const settlement = await tx.sharedPrepaidSettlement.create({
          data: {
            accountAId: selection.accountAId,
            accountBId: selection.accountBId,
            aToBAmount: selection.aToBAmount,
            bToAAmount: selection.bToAAmount,
            netAmount: selection.netAmount,
            payerFrontendUserId: selection.payerFrontendUserId,
            receiverFrontendUserId: selection.receiverFrontendUserId,
            status: selection.netAmount.isZero()
              ? SharedPrepaidSettlementStatus.AWAITING_RECEIPT
              : SharedPrepaidSettlementStatus.AWAITING_PAYMENT,
            proofUrls: [],
            remark: null,
            createdById: user.id,
            idempotencyKey: key
          }
        })

        for (const payable of selection.payables) {
          const frozen = await tx.sharedPrepaidPayable.updateMany({
            where: {
              id: payable.id,
              status: SharedPrepaidPayableStatus.PENDING
            },
            data: { status: SharedPrepaidPayableStatus.HELD }
          })
          if (frozen.count !== 1) throw this.payableConflict()
        }

        await tx.sharedPrepaidSettlementLine.createMany({
          data: selection.payables.map((payable) => ({
            settlementId: settlement.id,
            payableId: payable.id,
            direction: this.directionOf(selection, payable),
            amount: payable.amount
          }))
        })

        return this.requireSettlement(tx, settlement.id)
      })
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error
      const duplicate = await this.prisma.sharedPrepaidSettlement.findUnique({
        where: { idempotencyKey: key },
        include: settlementReadInclude
      })
      if (duplicate) return this.resolveCreateRetry(duplicate, user, ids)
      throw this.payableConflict()
    }
  }

  async submitPayment(
    user: CurrentUser,
    settlementId: string,
    payload: SubmitSettlementPaymentPayload,
    idempotencyKey: string
  ) {
    this.assertMainAccount(user, '只有主账号可以提交转账')
    const id = this.requireSettlementId(settlementId)
    this.requireIdempotencyKey(idempotencyKey)

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockAndReadSettlement(tx, id)
      if (settlement.netAmount.isZero()) {
        throw this.stateConflict('零净额结算不需要提交转账')
      }
      if (settlement.payerFrontendUserId !== user.dataOwnerId) {
        throw new ForbiddenException('只有最终付款主账号可以提交转账')
      }
      const input = this.validatePaymentPayload(payload)
      if (this.samePayment(settlement, user, input)) return this.toResult(settlement)
      if (settlement.status === SharedPrepaidSettlementStatus.COMPLETED) {
        throw this.completedImmutable()
      }
      if (settlement.status !== SharedPrepaidSettlementStatus.AWAITING_PAYMENT) {
        throw this.stateConflict('当前结算单不能提交转账')
      }

      await this.updateSettlement(tx, settlement, {
        status: SharedPrepaidSettlementStatus.AWAITING_RECEIPT,
        actualTransferredAt: input.actualTransferredAt,
        proofUrls: input.proofUrls,
        remark: input.remark,
        paymentSubmittedById: user.id,
        paymentSubmittedAt: new Date()
      })
      return this.requireSettlement(tx, id)
    })
  }

  async confirmReceipt(
    user: CurrentUser,
    settlementId: string,
    idempotencyKey: string
  ) {
    this.assertMainAccount(user, '只有主账号可以确认到账')
    const id = this.requireSettlementId(settlementId)
    this.requireIdempotencyKey(idempotencyKey)

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockAndReadSettlement(tx, id)
      this.assertReceiptActor(settlement, user)
      if (
        settlement.status === SharedPrepaidSettlementStatus.COMPLETED &&
        settlement.receiptConfirmedById === user.id
      ) {
        return this.toResult(settlement)
      }
      if (settlement.status === SharedPrepaidSettlementStatus.COMPLETED) {
        throw this.completedImmutable()
      }
      if (settlement.status !== SharedPrepaidSettlementStatus.AWAITING_RECEIPT) {
        throw this.stateConflict('当前结算单不能确认到账')
      }

      const activeLines = this.activeLines(settlement)
      await this.lockPayables(tx, activeLines.map((line) => line.payableId))
      for (const line of activeLines) {
        const completed = await tx.sharedPrepaidPayable.updateMany({
          where: {
            id: line.payableId,
            status: SharedPrepaidPayableStatus.HELD
          },
          data: { status: SharedPrepaidPayableStatus.COMPLETED }
        })
        if (completed.count !== 1) throw this.payableConflict()
      }

      await this.updateSettlement(tx, settlement, {
        status: SharedPrepaidSettlementStatus.COMPLETED,
        receiptConfirmedById: user.id,
        receiptConfirmedAt: new Date()
      })
      return this.requireSettlement(tx, id)
    })
  }

  async rejectSettlement(
    user: CurrentUser,
    settlementId: string,
    reason: unknown,
    idempotencyKey: string
  ) {
    this.assertMainAccount(user, '只有主账号可以驳回结算')
    const id = this.requireSettlementId(settlementId)
    const normalizedReason = this.requireReason(reason)
    this.requireIdempotencyKey(idempotencyKey)

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockAndReadSettlement(tx, id)
      this.assertReceiptActor(settlement, user)
      if (
        settlement.status === SharedPrepaidSettlementStatus.REJECTED &&
        settlement.rejectedById === user.id &&
        settlement.rejectionReason === normalizedReason
      ) {
        return this.toResult(settlement)
      }
      if (settlement.status === SharedPrepaidSettlementStatus.COMPLETED) {
        throw this.completedImmutable()
      }
      if (settlement.status !== SharedPrepaidSettlementStatus.AWAITING_RECEIPT) {
        throw this.stateConflict('当前结算单不能驳回')
      }

      await this.releasePayables(tx, settlement)
      await this.updateSettlement(tx, settlement, {
        status: SharedPrepaidSettlementStatus.REJECTED,
        rejectedById: user.id,
        rejectedAt: new Date(),
        rejectionReason: normalizedReason
      })
      return this.requireSettlement(tx, id)
    })
  }

  async cancelSettlement(
    user: CurrentUser,
    settlementId: string,
    idempotencyKey: string
  ) {
    this.assertMainAccount(user, '只有主账号可以取消结算')
    const id = this.requireSettlementId(settlementId)
    this.requireIdempotencyKey(idempotencyKey)

    return this.prisma.$transaction(async (tx) => {
      const settlement = await this.lockAndReadSettlement(tx, id)
      if (settlement.createdById !== user.id) {
        throw new ForbiddenException('只有创建该结算单的主账号可以取消')
      }
      if (
        settlement.status === SharedPrepaidSettlementStatus.CANCELLED &&
        settlement.cancelledById === user.id
      ) {
        return this.toResult(settlement)
      }
      if (settlement.status === SharedPrepaidSettlementStatus.COMPLETED) {
        throw this.completedImmutable()
      }
      const cancellable = settlement.status === SharedPrepaidSettlementStatus.AWAITING_PAYMENT || (
        settlement.netAmount.isZero() &&
        settlement.status === SharedPrepaidSettlementStatus.AWAITING_RECEIPT
      )
      if (!cancellable) throw this.stateConflict('当前结算单不能取消')

      await this.releasePayables(tx, settlement)
      await this.updateSettlement(tx, settlement, {
        status: SharedPrepaidSettlementStatus.CANCELLED,
        cancelledById: user.id,
        cancelledAt: new Date()
      })
      return this.requireSettlement(tx, id)
    })
  }

  private async readPayables(
    reader: Pick<Prisma.TransactionClient, 'sharedPrepaidPayable'>,
    ids: string[]
  ): Promise<PayableRow[]> {
    return reader.sharedPrepaidPayable.findMany({
      where: { id: { in: ids } },
      include: payableSelectionInclude,
      orderBy: { id: 'asc' }
    })
  }

  private selectSettlement(
    user: CurrentUser,
    ids: string[],
    payables: PayableRow[]
  ): SettlementSelection {
    if (payables.length !== ids.length) throw new NotFoundException('部分应转款明细不存在')
    if (payables.some((payable) => (
      payable.status !== SharedPrepaidPayableStatus.PENDING || payable.settlementLines.length > 0
    ))) throw this.payableConflict()

    const accountAId = user.dataOwnerId
    const counterparties = new Set<string>()
    for (const payable of payables) {
      if (payable.sourceOwnerId === payable.consumerOwnerId) {
        throw new BadRequestException('结算明细必须是跨主账号应转款')
      }
      if (payable.sourceOwnerId === accountAId) counterparties.add(payable.consumerOwnerId)
      else if (payable.consumerOwnerId === accountAId) counterparties.add(payable.sourceOwnerId)
      else throw new ForbiddenException('不能结算与当前主账号无关的应转款')
    }
    if (counterparties.size !== 1) {
      throw new BadRequestException('一张结算单只能包含同一对主账号')
    }
    const accountBId = [...counterparties][0]!
    const zero = new Prisma.Decimal(0)
    const aToBAmount = payables.reduce((sum, payable) => (
      payable.sourceOwnerId === accountAId ? sum.add(payable.amount) : sum
    ), zero).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    const bToAAmount = payables.reduce((sum, payable) => (
      payable.sourceOwnerId === accountBId ? sum.add(payable.amount) : sum
    ), zero).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
    const signedNet = aToBAmount.sub(bToAAmount)
    const payerFrontendUserId = signedNet.gt(0) ? accountAId : signedNet.lt(0) ? accountBId : null
    const receiverFrontendUserId = signedNet.gt(0) ? accountBId : signedNet.lt(0) ? accountAId : null
    const netAmount = signedNet.abs().toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)

    return {
      accountAId,
      accountBId,
      aToBAmount,
      bToAAmount,
      netAmount,
      payerFrontendUserId,
      receiverFrontendUserId,
      payables
    }
  }

  private toPreview(selection: SettlementSelection) {
    return {
      accountAId: selection.accountAId,
      accountBId: selection.accountBId,
      aToBAmount: selection.aToBAmount.toNumber(),
      bToAAmount: selection.bToAAmount.toNumber(),
      netAmount: selection.netAmount.toNumber(),
      payerFrontendUserId: selection.payerFrontendUserId,
      receiverFrontendUserId: selection.receiverFrontendUserId,
      lines: selection.payables.map((payable) => ({
        payableId: payable.id,
        consumptionId: payable.consumptionId,
        sourceOwnerId: payable.sourceOwnerId,
        consumerOwnerId: payable.consumerOwnerId,
        direction: this.directionOf(selection, payable),
        amount: payable.amount.toNumber(),
        status: payable.status,
        createdAt: payable.createdAt
      }))
    }
  }

  private directionOf(
    selection: Pick<SettlementSelection, 'accountAId'>,
    payable: Pick<PayableRow, 'sourceOwnerId'>
  ) {
    return payable.sourceOwnerId === selection.accountAId ? 'A_TO_B' : 'B_TO_A'
  }

  private async lockPayables(tx: Prisma.TransactionClient, payableIds: string[]) {
    for (const payableId of [...payableIds].sort()) {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "SharedPrepaidPayable" WHERE "id" = ${payableId} FOR UPDATE
      `
    }
  }

  private async lockAndReadSettlement(tx: Prisma.TransactionClient, id: string): Promise<SettlementRow> {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "SharedPrepaidSettlement" WHERE "id" = ${id} FOR UPDATE
    `
    const settlement = await tx.sharedPrepaidSettlement.findUnique({
      where: { id },
      include: settlementReadInclude
    })
    if (!settlement) throw new NotFoundException('结算单不存在')
    return settlement
  }

  private async requireSettlement(
    reader: Pick<Prisma.TransactionClient, 'sharedPrepaidSettlement'>,
    id: string
  ) {
    const settlement = await reader.sharedPrepaidSettlement.findUnique({
      where: { id },
      include: settlementReadInclude
    })
    if (!settlement) throw new NotFoundException('结算单不存在')
    return this.toResult(settlement)
  }

  private toResult(settlement: SettlementRow) {
    return {
      id: settlement.id,
      accountAId: settlement.accountAId,
      accountBId: settlement.accountBId,
      aToBAmount: settlement.aToBAmount.toNumber(),
      bToAAmount: settlement.bToAAmount.toNumber(),
      netAmount: settlement.netAmount.toNumber(),
      payerFrontendUserId: settlement.payerFrontendUserId,
      receiverFrontendUserId: settlement.receiverFrontendUserId,
      status: settlement.status,
      actualTransferredAt: settlement.actualTransferredAt,
      proofUrls: this.readProofUrls(settlement.proofUrls),
      remark: settlement.remark,
      createdById: settlement.createdById,
      paymentSubmittedById: settlement.paymentSubmittedById,
      paymentSubmittedAt: settlement.paymentSubmittedAt,
      receiptConfirmedById: settlement.receiptConfirmedById,
      receiptConfirmedAt: settlement.receiptConfirmedAt,
      rejectedById: settlement.rejectedById,
      rejectedAt: settlement.rejectedAt,
      rejectionReason: settlement.rejectionReason,
      cancelledById: settlement.cancelledById,
      cancelledAt: settlement.cancelledAt,
      version: settlement.version,
      idempotencyKey: settlement.idempotencyKey,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      lines: settlement.lines.map((line) => ({
        id: line.id,
        payableId: line.payableId,
        consumptionId: line.payable.consumptionId,
        sourceOwnerId: line.payable.sourceOwnerId,
        consumerOwnerId: line.payable.consumerOwnerId,
        direction: line.direction,
        amount: line.amount.toNumber(),
        payableStatus: line.payable.status,
        releasedAt: line.releasedAt,
        createdAt: line.createdAt
      }))
    }
  }

  private resolveCreateRetry(settlement: SettlementRow, user: CurrentUser, payableIds: string[]) {
    const storedIds = settlement.lines.map((line) => line.payableId).sort()
    if (
      settlement.createdById !== user.id ||
      settlement.accountAId !== user.dataOwnerId ||
      storedIds.length !== payableIds.length ||
      storedIds.some((id, index) => id !== payableIds[index])
    ) throw this.idempotencyConflict()
    return this.toResult(settlement)
  }

  private async updateSettlement(
    tx: Prisma.TransactionClient,
    settlement: SettlementRow,
    data: Prisma.SharedPrepaidSettlementUncheckedUpdateManyInput
  ) {
    const updated = await tx.sharedPrepaidSettlement.updateMany({
      where: {
        id: settlement.id,
        status: settlement.status,
        version: settlement.version
      },
      data: {
        ...data,
        version: { increment: 1 }
      }
    })
    if (updated.count !== 1) throw this.stateConflict('结算单已被其他操作更新，请刷新后重试')
  }

  private activeLines(settlement: SettlementRow) {
    const activeLines = settlement.lines.filter((line) => line.releasedAt === null)
    if (activeLines.length !== settlement.lines.length || activeLines.length === 0) {
      throw this.stateConflict('结算明细状态异常')
    }
    return activeLines
  }

  private async releasePayables(tx: Prisma.TransactionClient, settlement: SettlementRow) {
    const activeLines = this.activeLines(settlement)
    await this.lockPayables(tx, activeLines.map((line) => line.payableId))
    for (const line of activeLines) {
      const released = await tx.sharedPrepaidPayable.updateMany({
        where: {
          id: line.payableId,
          status: SharedPrepaidPayableStatus.HELD
        },
        data: { status: SharedPrepaidPayableStatus.PENDING }
      })
      if (released.count !== 1) throw this.payableConflict()
    }
    const releasedLines = await tx.sharedPrepaidSettlementLine.updateMany({
      where: { settlementId: settlement.id, releasedAt: null },
      data: { releasedAt: new Date() }
    })
    if (releasedLines.count !== activeLines.length) throw this.payableConflict()
  }

  private assertReceiptActor(settlement: SettlementRow, user: CurrentUser) {
    if (!settlement.netAmount.isZero()) {
      if (settlement.receiverFrontendUserId !== user.dataOwnerId) {
        throw new ForbiddenException('只有最终收款主账号可以确认或驳回')
      }
      return
    }
    const isParticipant = user.dataOwnerId === settlement.accountAId || user.dataOwnerId === settlement.accountBId
    if (!isParticipant || settlement.createdById === user.id) {
      throw new ForbiddenException('零净额结算必须由另一参与主账号确认或驳回')
    }
  }

  private validatePaymentPayload(payload: SubmitSettlementPaymentPayload): ValidatedPaymentPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('转账信息格式错误')
    }
    const rawTransferredAt = payload.actualTransferredAt
    if (!(typeof rawTransferredAt === 'string' || rawTransferredAt instanceof Date)) {
      throw new BadRequestException('请填写实际转账时间')
    }
    const actualTransferredAt = new Date(rawTransferredAt)
    if (Number.isNaN(actualTransferredAt.getTime())) {
      throw new BadRequestException('实际转账时间格式错误')
    }
    const proofUrls = payload.proofUrls === undefined ? [] : this.validateProofUrls(payload.proofUrls)
    const remark = this.optionalText(payload.remark, '备注', 500)
    return { actualTransferredAt, proofUrls, remark }
  }

  private validateProofUrls(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 20) {
      throw new BadRequestException('转账凭证格式错误')
    }
    return value.map((item) => {
      if (typeof item !== 'string' || !item.trim() || item.trim().length > 2000) {
        throw new BadRequestException('转账凭证地址格式错误')
      }
      return item.trim()
    })
  }

  private samePayment(
    settlement: SettlementRow,
    user: CurrentUser,
    input: ValidatedPaymentPayload
  ) {
    return settlement.paymentSubmittedById === user.id &&
      settlement.actualTransferredAt?.getTime() === input.actualTransferredAt.getTime() &&
      JSON.stringify(this.readProofUrls(settlement.proofUrls)) === JSON.stringify(input.proofUrls) &&
      settlement.remark === input.remark
  }

  private readProofUrls(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  }

  private normalizePayableIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('请选择待结算的应转款明细')
    }
    if (value.length > 1000) throw new BadRequestException('单次最多结算 1000 条明细')
    const ids = value.map((item) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException('应转款明细编号格式错误')
      }
      return item.trim()
    }).sort()
    if (new Set(ids).size !== ids.length) throw new BadRequestException('应转款明细不能重复')
    return ids
  }

  private assertCanView(user: CurrentUser) {
    if (user.isFrontendMainAccount) return
    if (user.isFrontendSubAccount && user.permissions.includes('PREPAID_SETTLEMENTS')) return
    throw new ForbiddenException('没有查看转账结算的权限')
  }

  private assertMainAccount(user: CurrentUser, message: string) {
    if (!user.isFrontendMainAccount || user.id !== user.dataOwnerId) {
      throw new ForbiddenException(message)
    }
  }

  private requireSettlementId(value: string) {
    const id = String(value || '').trim()
    if (!id) throw new BadRequestException('缺少结算单编号')
    return id
  }

  private requireIdempotencyKey(value: string) {
    const key = String(value || '').trim()
    if (!key) throw new BadRequestException('缺少幂等请求编号')
    if (key.length > 200) throw new BadRequestException('幂等请求编号过长')
    return key
  }

  private requireReason(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('请填写驳回原因')
    const reason = value.trim()
    if (reason.length > 500) throw new BadRequestException('驳回原因不能超过 500 个字符')
    return reason
  }

  private optionalText(value: unknown, fieldName: string, maxLength: number) {
    if (value === undefined || value === null || value === '') return null
    if (typeof value !== 'string') throw new BadRequestException(`${fieldName}必须为文本`)
    const normalized = value.trim()
    if (normalized.length > maxLength) throw new BadRequestException(`${fieldName}不能超过 ${maxLength} 个字符`)
    return normalized || null
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }

  private payableConflict() {
    return new ConflictException({
      code: 'PREPAID_SETTLEMENT_PAYABLE_CONFLICT',
      message: '部分应转款已被其他结算单占用，请刷新后重试'
    })
  }

  private stateConflict(message: string) {
    return new ConflictException({ code: 'PREPAID_SETTLEMENT_STATE_CONFLICT', message })
  }

  private completedImmutable() {
    return this.stateConflict('已完成结算不可修改，请通过冲正进入新一期结算')
  }

  private idempotencyConflict() {
    return new ConflictException({
      code: 'PREPAID_IDEMPOTENCY_CONFLICT',
      message: '幂等请求编号已用于不同的结算操作'
    })
  }
}
