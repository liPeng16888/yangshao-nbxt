import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { LabSampleChangeRequestStatus, Prisma } from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { AuthService } from '../auth/auth.service'
import { businessDateInBeijing } from '../common/date'
import { calculateResults, hasVisibleSampleBlockInput } from '../common/lab'
import { PrismaService } from '../prisma/prisma.service'
import { applyRequestedChanges, diffChangedInputs, normalizeRequestedChanges, type RequestedLabSampleChanges } from './lab-sample-change-fields'
import type { CreateLabSampleChangeRequestDto, FrontendLabSampleChangeRequestQueryDto } from './dto'

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
  reviewedAt: Date | null
  withdrawnAt: Date | null
  createdAt: Date
  updatedAt: Date
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
  constructor(private readonly prisma: PrismaService, private readonly auth: AuthService) {}

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
    const updated = await this.prisma.labSampleChangeRequest.update({
      where: { id: request.id },
      data: { status: LabSampleChangeRequestStatus.WITHDRAWN, withdrawnAt: new Date() },
      include: {}
    })
    return this.toSummary(updated as RequestRow)
  }

  private async canonicalizePayerCustomers(frontendUserId: string, changes: RequestedLabSampleChanges): Promise<CanonicalRequestedChanges> {
    if (!changes.payerCustomer) return changes as CanonicalRequestedChanges
    const ids = changes.payerCustomer.customerIds
    const customers = ids.length ? await this.prisma.customer.findMany({
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
      id: row.id, date: row.date, blockIndex: row.blockIndex, sampleName: String(sourceInputs.sampleNumber || ''),
      changedFieldLabels: Object.keys(requestedChanges).map((field) => FIELD_LABELS[field] || field),
      reason: row.reason, status: row.status,
      review: row.reviewRemark || row.reviewedAt ? { remark: row.reviewRemark, reviewedAt: row.reviewedAt } : null,
      withdrawnAt: row.withdrawnAt, createdAt: row.createdAt, updatedAt: row.updatedAt
    }
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
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }
}
