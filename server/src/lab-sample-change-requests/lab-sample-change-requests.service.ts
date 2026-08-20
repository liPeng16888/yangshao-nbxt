import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { LabSampleChangeRequestStatus, MonthlySettlementStatus, Prisma, ReminderType, UserRole } from '@prisma/client'
import { AdminAccessService } from '../admin/admin-access.service'
import type { CurrentUser } from '../auth/current-user'
import { AuthService } from '../auth/auth.service'
import { businessDateInBeijing } from '../common/date'
import { calculateResults, hasVisibleSampleBlockInput } from '../common/lab'
import { samplePayerName } from '../common/sample-payer'
import { LabCellChangeService } from '../lab-sheets/lab-cell-change.service'
import { PrismaService } from '../prisma/prisma.service'
import { applyRequestedChanges, diffChangedInputs, normalizeRequestedChanges, type RequestedLabSampleChanges } from './lab-sample-change-fields'
import type {
  AdminLabSampleChangeRequestQueryDto,
  ApproveLabSampleChangeRequestDto,
  CreateLabSampleChangeRequestDto,
  FrontendLabSampleChangeRequestQueryDto,
  RejectLabSampleChangeRequestDto
} from './dto'

type FrontendGrants = { historical?: string; completedData?: string }
type CanonicalCustomer = { id: string; name: string; phone: string | null; wechat: string | null; wechatNickname: string | null }
type CanonicalRequestedChanges = RequestedLabSampleChanges & {
  payerCustomer?: NonNullable<RequestedLabSampleChanges['payerCustomer']> & { customers: CanonicalCustomer[] }
}
type RequestRow = {
  id: string
  frontendUserId: string
  requestedById: string
  sheetId: string
  blockId: string
  date: string
  blockIndex: number
  baseBlockUpdatedAt: Date
  sourceSnapshot: unknown
  requestedChanges: unknown
  previewResults: unknown
  reason: string
  status: LabSampleChangeRequestStatus
  reviewRemark: string | null
  reviewedById: string | null
  reviewedAt: Date | null
  withdrawnAt: Date | null
  settlementEffects: unknown
  createdAt: Date
  updatedAt: Date
}

type ReviewDto<T> = Partial<T> & { reviewRemark?: string; remark?: string }

type MonthlySettlementRow = {
  id: string
  month: string
  frontendUserId: string
  customer: string
  status: MonthlySettlementStatus
  paidAmount: unknown
  remark: string | null
  updatedAt: Date
}

type SettlementEffect = {
  recordId: string
  month: string
  customer: string
  oldStatus: MonthlySettlementStatus
  oldPaidAmount: number | null
  oldRemark: string | null
  newStatus: MonthlySettlementStatus
}

const FIELD_LABELS: Record<string, string> = {
  sampleNumber: '样品编号', payerCustomer: '付款客户', price: '价格', paymentStatus: '付款状态', elementNote: '元素备注',
  ironRaw: '铁', siliconRaw: '硅', siliconAdjust: '硅调整', aluminumRaw: '铝', aluminumAdjust: '铝调整',
  sulfur: '硫', densityRaw: '密度', whiteness: '白度', calciumRaw: '钙', magnesiumRaw: '镁', carbon: '碳',
  titaniumRaw: '钛', waterSample: '水样', bottleWater: '瓶水', bottleWaterSample: '瓶水样', moisture: '水分',
  crucible: '坩埚', sampleWeight: '样品重量', burnedCrucibleSample: '灼烧后坩埚样品'
}

@Injectable()
export class LabSampleChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly adminAccess: AdminAccessService,
    private readonly cellChanges: LabCellChangeService
  ) {}

  async createForFrontend(user: CurrentUser, dto: CreateLabSampleChangeRequestDto, grants: FrontendGrants) {
    await this.auth.assertAccessGrant(user.id, grants.historical, 'HISTORICAL_DATES')
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: dto.blockId }, include: { sheet: true } })
    if (!block || block.sheet.frontendUserId !== user.id) throw new NotFoundException('未找到样品')
    if (block.sheet.date >= businessDateInBeijing()) throw new BadRequestException('仅支持申请修改历史日期样品')

    const sourceInputs = this.record(block.inputs)
    if (!hasVisibleSampleBlockInput(sourceInputs)) throw new BadRequestException('样品无可修改数据')
    if (sourceInputs.completed) {
      await this.auth.assertAccessGrant(user.id, grants.completedData, 'COMPLETED_SAMPLE_DATA')
    }

    const reason = this.requiredReason(dto.reason)
    const changes = normalizeRequestedChanges(dto.changes)
    const canonicalChanges = await this.canonicalizePayerCustomers(user.id, changes)
    const nextInputs = applyRequestedChanges(sourceInputs, canonicalChanges, canonicalChanges.payerCustomer?.customers || [])
    const changedFields = diffChangedInputs(sourceInputs, nextInputs).filter((field) => this.isRequestedInputField(field, canonicalChanges))
    if (!Object.keys(canonicalChanges).length || !changedFields.length) throw new BadRequestException('请至少修改一项内容')

    const baseUpdatedAt = new Date(dto.baseUpdatedAt)
    if (Number.isNaN(baseUpdatedAt.getTime()) || baseUpdatedAt.getTime() !== block.updatedAt.getTime()) {
      throw new ConflictException('样品已更新，请刷新后重新申请')
    }

    const existing = await this.prisma.labSampleChangeRequest.findFirst({
      where: { blockId: block.id, status: LabSampleChangeRequestStatus.PENDING }, orderBy: { createdAt: 'desc' }
    })
    if (existing) throw this.pendingConflict(existing as RequestRow)

    const sourceSnapshot = {
      inputs: sourceInputs,
      results: this.record(block.results),
      parameterSnapshot: this.record(block.parameterSnapshot),
      updatedAt: block.updatedAt.toISOString()
    }
    const requestedChanges = this.publicRequestedChanges(canonicalChanges)
    const previewResults = calculateResults(nextInputs, this.record(block.parameterSnapshot) as typeof import('../common/lab').defaultLabParameters)
    const data = {
      frontendUserId: user.id,
      requestedById: user.id,
      sheetId: block.sheetId,
      blockId: block.id,
      date: block.sheet.date,
      blockIndex: block.index,
      baseBlockUpdatedAt: baseUpdatedAt,
      sourceSnapshot: sourceSnapshot as Prisma.InputJsonValue,
      requestedChanges: requestedChanges as Prisma.InputJsonValue,
      previewResults: previewResults as Prisma.InputJsonValue,
      reason
    }

    try {
      return this.toSummary(await this.prisma.labSampleChangeRequest.create({ data }) as unknown as RequestRow)
    } catch (error) {
      if (!this.isPendingIndexConflict(error)) throw error
      const pending = await this.prisma.labSampleChangeRequest.findFirst({
        where: { blockId: block.id, status: LabSampleChangeRequestStatus.PENDING }, orderBy: { createdAt: 'desc' }
      })
      if (pending) throw this.pendingConflict(pending as RequestRow)
      throw new ConflictException('样品已有待处理修改申请')
    }
  }

  async listForFrontend(user: CurrentUser, query: FrontendLabSampleChangeRequestQueryDto, _grants: FrontendGrants) {
    const rows = await this.prisma.labSampleChangeRequest.findMany({
      where: { frontendUserId: user.id, ...(query.date ? { date: query.date } : {}), ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: 'desc' }
    })
    return rows.map((row) => this.toSummary(row as RequestRow))
  }

  async getForFrontend(user: CurrentUser, id: string, grants: FrontendGrants) {
    const row = await this.prisma.labSampleChangeRequest.findFirst({ where: { id, frontendUserId: user.id } })
    if (!row) throw new NotFoundException('未找到修改申请')
    const request = row as RequestRow
    if (this.record(this.record(request.sourceSnapshot).inputs).completed) {
      await this.auth.assertAccessGrant(user.id, grants.completedData, 'COMPLETED_SAMPLE_DATA')
    }
    return { ...this.toSummary(request), sourceSnapshot: request.sourceSnapshot, requestedChanges: request.requestedChanges, previewResults: request.previewResults }
  }

  async withdrawForFrontend(user: CurrentUser, id: string, _grants: FrontendGrants) {
    const request = await this.prisma.labSampleChangeRequest.findFirst({
      where: { id, frontendUserId: user.id, status: LabSampleChangeRequestStatus.PENDING }
    })
    if (!request) throw new NotFoundException('未找到待撤回的修改申请')
    const withdrawnAt = new Date()
    const result = await this.prisma.labSampleChangeRequest.updateMany({
      where: { id: request.id, frontendUserId: user.id, status: LabSampleChangeRequestStatus.PENDING },
      data: { status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt }
    })
    if (!result.count) throw new ConflictException('修改申请状态已变更，请刷新后重试')
    return this.toSummary({ ...request, status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt } as RequestRow)
  }

  async listForAdmin(admin: CurrentUser, query: AdminLabSampleChangeRequestQueryDto) {
    const requestedIds = this.adminAccess.parseFrontendUserIds(query.frontendUserIds)
    const frontendUserIds = await this.adminAccess.getAllowedFrontendUserIds(admin, requestedIds)
    if (!frontendUserIds.length) return []
    const rows = await this.prisma.labSampleChangeRequest.findMany({
      where: {
        frontendUserId: { in: frontendUserIds },
        ...(query.date ? { date: query.date } : {}),
        ...(query.status ? { status: query.status } : {})
      },
      orderBy: { createdAt: 'desc' }
    })
    return rows.map((row) => this.toSummary(row as RequestRow))
  }

  async getForAdmin(admin: CurrentUser, id: string) {
    const row = await this.prisma.labSampleChangeRequest.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('未找到修改申请')
    const request = row as RequestRow
    await this.assertAdminRequestAccess(admin, request.frontendUserId)
    return this.toDetail(request)
  }

  async approveForAdmin(
    admin: CurrentUser,
    id: string,
    dto: ReviewDto<ApproveLabSampleChangeRequestDto>
  ) {
    const reviewRemark = this.optionalReviewRemark(dto)
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockAndLoadRequest(tx, id)
      await this.lockAndAssertReviewAccess(tx, admin, request.frontendUserId)
      this.assertPending(request)

      const block = await this.lockAndLoadSample(tx, request)
      const sourceSnapshot = this.record(request.sourceSnapshot)
      const currentInputs = this.record(block.inputs)
      const currentParameters = this.record(block.parameterSnapshot)
      if (
        block.updatedAt.getTime() !== request.baseBlockUpdatedAt.getTime()
        || !this.jsonEqual(this.record(sourceSnapshot.inputs), currentInputs)
        || !this.jsonEqual(this.record(sourceSnapshot.parameterSnapshot), currentParameters)
      ) {
        throw new ConflictException('样品数据已变化')
      }

      const requestedChanges = normalizeRequestedChanges(request.requestedChanges)
      const canonicalChanges = await this.canonicalizePayerCustomers(request.frontendUserId, requestedChanges, tx)
      const nextInputs = applyRequestedChanges(
        currentInputs,
        canonicalChanges,
        canonicalChanges.payerCustomer?.customers || []
      )
      const results = calculateResults(
        nextInputs,
        currentParameters as typeof import('../common/lab').defaultLabParameters
      )
      const changedFields = diffChangedInputs(currentInputs, nextInputs)
      const committedFields = changedFields.map((field) => ({
        field,
        oldValue: currentInputs[field] ?? null,
        newValue: nextInputs[field] ?? null
      }))

      await tx.sampleBlock.update({
        where: { id: block.id },
        data: {
          inputs: nextInputs as Prisma.InputJsonValue,
          results: results as Prisma.InputJsonValue
        }
      })
      await this.cellChanges.record(tx, {
        sheetId: request.sheetId,
        blockId: request.blockId,
        frontendUserId: request.frontendUserId,
        changedById: admin.id,
        oldInputs: currentInputs,
        nextInputs,
        committedFields,
        changeRequestId: request.id
      })

      const settlementEffects = await this.resetAffectedMonthlySettlements(
        tx,
        request,
        currentInputs,
        nextInputs,
        changedFields
      )
      const reviewedAt = new Date()
      const approved = await this.updatePendingRequest(tx, request.id, {
        status: LabSampleChangeRequestStatus.APPROVED,
        reviewedById: admin.id,
        reviewedAt,
        reviewRemark,
        settlementEffects: settlementEffects as Prisma.InputJsonValue,
        previewResults: results as Prisma.InputJsonValue
      })
      await tx.reminder.create({
        data: {
          frontendUserId: request.frontendUserId,
          createdById: admin.id,
          type: ReminderType.LAB_SAMPLE_CHANGE_APPROVED,
          title: '历史样品修改申请已通过',
          content: this.approvalReminderContent(request, settlementEffects),
          sourceType: 'lab_sample_change_request',
          sourceId: request.id
        }
      })
      return {
        ...this.toDetail(approved as RequestRow),
        previewResults: results,
        actualResults: results,
        settlementEffects
      }
    })
  }

  async rejectForAdmin(
    admin: CurrentUser,
    id: string,
    dto: ReviewDto<RejectLabSampleChangeRequestDto>
  ) {
    const reviewRemark = this.requiredReviewRemark(dto)
    return this.prisma.$transaction(async (tx) => {
      const request = await this.lockAndLoadRequest(tx, id)
      await this.lockAndAssertReviewAccess(tx, admin, request.frontendUserId)
      this.assertPending(request)

      const rejected = await this.updatePendingRequest(tx, request.id, {
        status: LabSampleChangeRequestStatus.REJECTED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewRemark
      })
      await tx.reminder.create({
        data: {
          frontendUserId: request.frontendUserId,
          createdById: admin.id,
          type: ReminderType.LAB_SAMPLE_CHANGE_REJECTED,
          title: '历史样品修改申请已驳回',
          content: `${request.date} 第 ${request.blockIndex} 个样品的修改申请已驳回。原因：${reviewRemark}。`,
          sourceType: 'lab_sample_change_request',
          sourceId: request.id
        }
      })
      return this.toDetail(rejected as RequestRow)
    })
  }

  private async canonicalizePayerCustomers(
    frontendUserId: string,
    changes: RequestedLabSampleChanges,
    db: PrismaService | Prisma.TransactionClient = this.prisma
  ): Promise<CanonicalRequestedChanges> {
    if (!changes.payerCustomer) return changes as CanonicalRequestedChanges
    const ids = changes.payerCustomer.customerIds
    const customers = ids.length ? await db.customer.findMany({
      where: { frontendUserId, id: { in: ids } },
      select: { id: true, name: true, phone: true, wechat: true, wechatNickname: true }
    }) : []
    if (customers.length !== ids.length) throw new BadRequestException('付款客户无效')
    const byId = new Map(customers.map((customer) => [customer.id, customer]))
    const orderedCustomers = ids.map((id) => byId.get(id)!).filter(Boolean)
    return {
      ...changes,
      payerCustomer: { customerIds: ids, customerText: orderedCustomers.map((customer) => customer.name).join('、'), customers: orderedCustomers }
    }
  }

  private publicRequestedChanges(changes: CanonicalRequestedChanges) {
    if (!changes.payerCustomer) return changes
    const { customers: _customers, ...payerCustomer } = changes.payerCustomer
    return { ...changes, payerCustomer }
  }

  private toSummary(row: RequestRow) {
    const sourceInputs = this.record(this.record(row.sourceSnapshot).inputs)
    const requestedChanges = this.record(row.requestedChanges)
    return {
      id: row.id, blockId: row.blockId, date: row.date, blockIndex: row.blockIndex, sampleName: String(sourceInputs.sampleNumber || ''),
      changedFieldLabels: Object.keys(requestedChanges).map((field) => FIELD_LABELS[field] || field),
      reason: row.reason, status: row.status,
      review: row.reviewRemark || row.reviewedAt ? { remark: row.reviewRemark, reviewedAt: row.reviewedAt } : null,
      withdrawnAt: row.withdrawnAt, createdAt: row.createdAt, updatedAt: row.updatedAt
    }
  }

  private toDetail(row: RequestRow) {
    return {
      ...this.toSummary(row),
      sourceSnapshot: row.sourceSnapshot,
      requestedChanges: row.requestedChanges,
      previewResults: row.previewResults,
      settlementEffects: Array.isArray(row.settlementEffects) ? row.settlementEffects : [],
      ...(row.status === LabSampleChangeRequestStatus.APPROVED ? { actualResults: row.previewResults } : {})
    }
  }

  private async assertAdminRequestAccess(admin: CurrentUser, frontendUserId: string) {
    const allowed = await this.adminAccess.getAllowedFrontendUserIds(admin, [frontendUserId])
    if (!allowed.includes(frontendUserId)) throw new ForbiddenException('没有访问该前端账号的权限')
  }

  private async lockAndLoadRequest(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "LabSampleChangeRequest" WHERE "id" = ${id} FOR UPDATE
    `)
    const row = await tx.labSampleChangeRequest.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('未找到修改申请')
    return row as RequestRow
  }

  private async lockAndAssertReviewAccess(
    tx: Prisma.TransactionClient,
    admin: CurrentUser,
    frontendUserId: string
  ) {
    if (admin.role === UserRole.ROOT_ADMIN) return
    if (admin.role !== UserRole.SUB_ADMIN) throw new ForbiddenException('没有后台审批权限')
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SubAdminFrontendPermission"
      WHERE "subAdminId" = ${admin.id} AND "frontendUserId" = ${frontendUserId}
      FOR SHARE
    `)
    if (!rows.length) throw new ForbiddenException('没有访问该前端账号的权限')
  }

  private async lockAndLoadSample(tx: Prisma.TransactionClient, request: RequestRow) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "LabSheet" WHERE "id" = ${request.sheetId} FOR UPDATE
    `)
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SampleBlock" WHERE "id" = ${request.blockId} FOR UPDATE
    `)
    const sheet = await tx.labSheet.findUnique({ where: { id: request.sheetId } })
    const block = await tx.sampleBlock.findUnique({ where: { id: request.blockId } })
    if (!sheet || !block) throw new NotFoundException('未找到样品')
    if (
      sheet.frontendUserId !== request.frontendUserId
      || sheet.date !== request.date
      || block.sheetId !== request.sheetId
      || block.id !== request.blockId
    ) {
      throw new ConflictException('样品数据已变化')
    }
    return block
  }

  private assertPending(request: RequestRow) {
    if (request.status !== LabSampleChangeRequestStatus.PENDING) {
      throw new ConflictException('修改申请状态已变更，请刷新后重试')
    }
  }

  private async updatePendingRequest(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.LabSampleChangeRequestUncheckedUpdateInput
  ) {
    try {
      return await tx.labSampleChangeRequest.update({
        where: { id, status: LabSampleChangeRequestStatus.PENDING },
        data
      })
    } catch (error) {
      if (!this.isPrismaCode(error, 'P2025')) throw error
      throw new ConflictException('修改申请状态已变更，请刷新后重试')
    }
  }

  private async resetAffectedMonthlySettlements(
    tx: Prisma.TransactionClient,
    request: RequestRow,
    oldInputs: Record<string, unknown>,
    nextInputs: Record<string, unknown>,
    changedFields: string[]
  ): Promise<SettlementEffect[]> {
    const oldPayer = samplePayerName(oldInputs)
    const nextPayer = samplePayerName(nextInputs)
    const payerChanged = ['customerId', 'customerIds', 'customers', 'customerText']
      .some((field) => changedFields.includes(field))
    const settlementRelevantChange = changedFields.includes('price')
      || changedFields.includes('paymentStatus')
      || payerChanged
    const oldMonthly = oldInputs.paymentStatus === '月结款'
    const nextMonthly = nextInputs.paymentStatus === '月结款'
    if (!settlementRelevantChange || (!oldMonthly && !nextMonthly)) return []

    const customers = Array.from(new Set([
      ...(oldMonthly ? [oldPayer] : []),
      ...(nextMonthly ? [nextPayer] : [])
    ]))
    if (!customers.length) return []
    const month = request.date.slice(0, 7)
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "MonthlySettlementRecord"
      WHERE "month" = ${month}
        AND "frontendUserId" = ${request.frontendUserId}
        AND "customer" IN (${Prisma.join(customers)})
      ORDER BY "id"
      FOR UPDATE
    `)
    const rows = await tx.monthlySettlementRecord.findMany({
      where: { month, frontendUserId: request.frontendUserId, customer: { in: customers } },
      orderBy: { id: 'asc' }
    })
    const effects: SettlementEffect[] = []
    for (const row of rows as MonthlySettlementRow[]) {
      if (row.status !== MonthlySettlementStatus.PAID && row.status !== MonthlySettlementStatus.PARTIAL) continue
      const updated = await tx.monthlySettlementRecord.updateMany({
        where: {
          id: row.id,
          status: { in: [MonthlySettlementStatus.PAID, MonthlySettlementStatus.PARTIAL] },
          updatedAt: row.updatedAt
        },
        data: {
          status: MonthlySettlementStatus.UNPAID,
          paidAmount: null,
          remark: '因历史样品修改审批，需按新汇总重新核对'
        }
      })
      if (!updated.count) throw new ConflictException('月结记录已变化，请刷新后重试')
      effects.push({
        recordId: row.id,
        month: row.month,
        customer: row.customer,
        oldStatus: row.status,
        oldPaidAmount: row.paidAmount === null || row.paidAmount === undefined ? null : Number(row.paidAmount),
        oldRemark: row.remark,
        newStatus: MonthlySettlementStatus.UNPAID
      })
    }
    return effects
  }

  private approvalReminderContent(request: RequestRow, effects: SettlementEffect[]) {
    const base = `${request.date} 第 ${request.blockIndex} 个样品的修改申请已通过。`
    if (!effects.length) return base
    const affected = Array.from(new Set(effects.map((effect) => `${effect.customer}（${effect.month}）`)))
    return `${base} 已重置月结记录：${affected.join('、')}。`
  }

  private optionalReviewRemark(dto: { remark?: unknown; reviewRemark?: unknown }) {
    const value = dto.reviewRemark ?? dto.remark
    const remark = typeof value === 'string' ? value.trim() : ''
    if (remark.length > 500) throw new BadRequestException('审批备注不能超过 500 个字符')
    return remark || null
  }

  private requiredReviewRemark(dto: { remark?: unknown; reviewRemark?: unknown }) {
    const remark = this.optionalReviewRemark(dto)
    if (!remark) throw new BadRequestException('请填写驳回原因')
    return remark
  }

  private pendingConflict(row: RequestRow) {
    return new ConflictException({ code: 'LAB_SAMPLE_CHANGE_REQUEST_PENDING', message: '样品已有待处理修改申请', request: this.toSummary(row) })
  }

  private requiredReason(value: unknown) {
    const reason = typeof value === 'string' ? value.trim() : ''
    if (!reason) throw new BadRequestException('请填写申请原因')
    if (reason.length > 500) throw new BadRequestException('申请原因不能超过 500 个字符')
    return reason
  }

  private isRequestedInputField(field: string, changes: RequestedLabSampleChanges) {
    if (field === 'customerId' || field === 'customerIds' || field === 'customers' || field === 'customerText') return Boolean(changes.payerCustomer)
    return field in changes
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private isPendingIndexConflict(error: unknown) {
    return this.isPrismaCode(error, 'P2002')
  }

  private isPrismaCode(error: unknown, code: string) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code)
  }

  private jsonEqual(left: unknown, right: unknown) {
    return JSON.stringify(this.canonicalJson(left)) === JSON.stringify(this.canonicalJson(right))
  }

  private canonicalJson(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.canonicalJson(item))
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.canonicalJson(item)])
    )
  }
}
