import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { todayInBeijing } from '../common/date'
import { hasLabDetectionInput } from '../common/lab'
import { toMoney } from '../common/money'
import { AdminAccessService } from './admin-access.service'
import { collapseConsecutiveFieldChanges } from '../common/change-log'

@Injectable()
export class AdminDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AdminAccessService
  ) {}

  async frontendOptions(admin: CurrentUser) {
    const ids = await this.access.getAllowedFrontendUserIds(admin)
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, account: true, username: true, displayRemark: true, disabled: true }
    })
    return users.map((user) => ({
      id: user.id,
      account: user.account,
      name: this.displayName(user),
      disabled: user.disabled
    }))
  }

  async labSheets(admin: CurrentUser, query: { frontendUserIds?: string | string[]; date?: string }) {
    const ids = await this.access.getAllowedFrontendUserIds(admin, this.access.parseFrontendUserIds(query.frontendUserIds))
    const date = query.date || todayInBeijing()
    const sheets = await this.prisma.labSheet.findMany({
      where: { frontendUserId: { in: ids }, date },
      include: {
        frontendUser: { select: { account: true, username: true, displayRemark: true } },
        sampleBlocks: { orderBy: { index: 'asc' } }
      },
      orderBy: { updatedAt: 'desc' }
    })
    const customersById = await this.loadCustomersById(ids, sheets)
    return sheets
      .map((sheet) => ({
        id: sheet.id,
        frontendUserId: sheet.frontendUserId,
        name: this.displayName(sheet.frontendUser),
        date: sheet.date,
        readonly: true,
        parameters: sheet.parameters,
        sampleBlocks: sheet.sampleBlocks
          .filter((block) => hasLabDetectionInput(block.inputs as Record<string, unknown>))
          .map((block) => ({
            id: block.id,
            index: block.index,
            readonly: true,
            inputs: this.enrichCustomerInputs(block.inputs as Record<string, unknown>, customersById),
            results: block.results,
            parameterSnapshot: block.parameterSnapshot
          }))
      }))
      .filter((sheet) => sheet.sampleBlocks.length)
  }

  async cellHistory(admin: CurrentUser, query: { blockId?: string; field?: string; fields?: string | string[] }) {
    const fields = this.parseHistoryFields(query.fields ?? query.field)
    if (!query.blockId || !fields.length) throw new ForbiddenException('缺少样品和字段')
    const block = await this.prisma.sampleBlock.findUnique({ where: { id: query.blockId }, include: { sheet: true } })
    if (!block) throw new NotFoundException('未找到样品')
    await this.access.getAllowedFrontendUserIds(admin, [block.sheet.frontendUserId])
    const rows = await this.prisma.cellChangeLog.findMany({
      where: { blockId: block.id },
      orderBy: [{ changedAt: 'asc' }, { field: 'asc' }],
      include: { sheet: { include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } } } }
    })
    return collapseConsecutiveFieldChanges(rows, { windowMs: 2000 }).filter((row) => fields.includes(row.field))
  }

  private parseHistoryFields(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value.join(',') : value || ''
    return Array.from(new Set(raw.split(',').map((field) => field.trim()).filter(Boolean)))
  }

  private displayName(user: { account: string; username: string; displayRemark?: string | null }) {
    return user.displayRemark?.trim() || user.username || user.account
  }

  private async loadCustomersById(frontendUserIds: string[], sheets: Array<{ sampleBlocks: Array<{ inputs: unknown }> }>) {
    const customerIds = Array.from(
      new Set(
        sheets.flatMap((sheet) =>
          sheet.sampleBlocks.flatMap((block) => {
            const inputs = (block.inputs || {}) as Record<string, unknown>
            const ids = Array.isArray(inputs.customerIds) ? inputs.customerIds : []
            return [...ids, inputs.customerId].filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
          })
        )
      )
    )
    if (!customerIds.length) return new Map<string, { id: string; name: string; phone: string | null; wechat: string | null; wechatNickname: string | null }>()
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds }, frontendUserId: { in: frontendUserIds } },
      select: { id: true, name: true, phone: true, wechat: true, wechatNickname: true }
    })
    return new Map(customers.map((customer) => [customer.id, customer]))
  }

  private enrichCustomerInputs(
    rawInputs: Record<string, unknown>,
    customersById: Map<string, { id: string; name: string; phone: string | null; wechat: string | null; wechatNickname: string | null }>
  ) {
    const inputs = { ...rawInputs }
    const selectedIds = Array.from(
      new Set(
        [
          ...(Array.isArray(inputs.customerIds) ? inputs.customerIds : []),
          inputs.customerId
        ].filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      )
    )
    if (!selectedIds.length && !Array.isArray(inputs.customers)) return inputs

    const existingCustomers = Array.isArray(inputs.customers) ? (inputs.customers.filter(Boolean) as Array<Record<string, unknown>>) : []
    const existingById = new Map(
      existingCustomers
        .map((customer) => [typeof customer.id === 'string' ? customer.id : '', customer] as const)
        .filter(([id]) => Boolean(id))
    )
    const merged = selectedIds.map((id) => customersById.get(id) || existingById.get(id)).filter(Boolean)
    const extraExisting = existingCustomers.filter((customer) => typeof customer.id !== 'string' || !selectedIds.includes(customer.id))
    const customers = [...merged, ...extraExisting]
    if (customers.length) inputs.customers = customers
    return inputs
  }

  async abnormalRecords(admin: CurrentUser, query: { frontendUserIds?: string | string[]; startDate?: string; endDate?: string }) {
    const ids = await this.access.getAllowedFrontendUserIds(admin, this.access.parseFrontendUserIds(query.frontendUserIds))
    const rows = await this.prisma.abnormalRecord.findMany({
      where: {
        frontendUserId: { in: ids },
        ...(query.startDate && query.endDate ? { date: { gte: query.startDate, lte: query.endDate } } : {})
      },
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
      include: {
        sheet: { include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } } },
        block: true
      }
    })
    const collapsedCache = new Map<string, Awaited<ReturnType<AdminDataService['collapsedBlockLogs']>>>()
    const result = []
    for (const row of rows) {
      let collapsed = collapsedCache.get(row.blockId)
      if (!collapsed) {
        collapsed = await this.collapsedBlockLogs(row.blockId)
        collapsedCache.set(row.blockId, collapsed)
      }
      const changeCount = collapsed.filter((log) => log.field === row.field).length
      if (changeCount < 3) continue
      result.push({
        id: row.id,
        date: row.date,
        frontendUserId: row.frontendUserId,
        name: this.displayName(row.sheet.frontendUser),
        sheetId: row.sheetId,
        blockId: row.blockId,
        sequence: String(((row.block.inputs as Record<string, unknown>)?.sequence || row.block.index)).padStart(3, '0'),
        field: row.field,
        changeCount,
        remark: row.remark || '',
        updatedAt: row.updatedAt
      })
    }
    return result
  }

  async updateAbnormalRemark(admin: CurrentUser, id: string, remark = '') {
    const row = await this.prisma.abnormalRecord.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('异常记录不存在')
    await this.access.getAllowedFrontendUserIds(admin, [row.frontendUserId])
    return this.prisma.abnormalRecord.update({ where: { id }, data: { remark } })
  }

  private async collapsedBlockLogs(blockId: string) {
    const rows = await this.prisma.cellChangeLog.findMany({
      where: { blockId },
      orderBy: [{ changedAt: 'asc' }, { field: 'asc' }]
    })
    return collapseConsecutiveFieldChanges(rows, { windowMs: 2000 })
  }

  async blacklist(admin: CurrentUser, keyword = '') {
    await this.access.getAllowedFrontendUserIds(admin)
    const query = keyword.trim()
    const rows = await this.prisma.blacklistRecord.findMany({
      where: query
        ? {
            OR: [
              { phone: { contains: query, mode: 'insensitive' } },
              { wechat: { contains: query, mode: 'insensitive' } },
              { wechatNickname: { contains: query, mode: 'insensitive' } },
              { other: { contains: query, mode: 'insensitive' } },
              { note: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {},
      include: { uploadedBy: { select: { username: true, account: true } } },
      orderBy: { uploadedAt: 'desc' }
    })
    return rows.map((row) => ({
      id: row.id,
      uploadedAt: row.uploadedAt,
      uploadedBy: row.uploadedBy.username || row.uploadedBy.account,
      phone: row.phone || '无信息',
      wechat: row.wechat || '无信息',
      wechatNickname: row.wechatNickname || '无信息',
      amount: row.amount === null ? null : toMoney(row.amount),
      images: Array.isArray(row.images) ? row.images : [],
      other: row.other || '无信息',
      note: row.note || '无信息'
    }))
  }
}
