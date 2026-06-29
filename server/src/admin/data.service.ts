import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from '../auth/current-user'
import { todayInBeijing } from '../common/date'
import { hasLabDetectionInput } from '../common/lab'
import { toMoney } from '../common/money'
import { AdminAccessService } from './admin-access.service'

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
            inputs: block.inputs,
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
    return this.prisma.cellChangeLog.findMany({
      where: { blockId: block.id, field: { in: fields } },
      orderBy: [{ changedAt: 'asc' }, { field: 'asc' }],
      include: { sheet: { include: { frontendUser: { select: { username: true, account: true, displayRemark: true } } } } }
    })
  }

  private parseHistoryFields(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value.join(',') : value || ''
    return Array.from(new Set(raw.split(',').map((field) => field.trim()).filter(Boolean)))
  }

  private displayName(user: { account: string; username: string; displayRemark?: string | null }) {
    return user.displayRemark?.trim() || user.username || user.account
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
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      frontendUserId: row.frontendUserId,
      name: this.displayName(row.sheet.frontendUser),
      sheetId: row.sheetId,
      blockId: row.blockId,
      sequence: String(((row.block.inputs as Record<string, unknown>)?.sequence || row.block.index)).padStart(3, '0'),
      field: row.field,
      changeCount: row.changeCount,
      remark: row.remark || '',
      updatedAt: row.updatedAt
    }))
  }

  async updateAbnormalRemark(admin: CurrentUser, id: string, remark = '') {
    const row = await this.prisma.abnormalRecord.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('异常记录不存在')
    await this.access.getAllowedFrontendUserIds(admin, [row.frontendUserId])
    return this.prisma.abnormalRecord.update({ where: { id }, data: { remark } })
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
