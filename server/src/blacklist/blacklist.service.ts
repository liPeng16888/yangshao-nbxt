import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { toMoney } from '../common/money'
import { requiredBaseUpdatedAt, staleWrite } from '../common/optimistic-concurrency'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'

type BlacklistMutationPayload = {
  phone?: string; wechat?: string; wechatNickname?: string; amount?: number | null
  images?: string[]; other?: string; note?: string; baseUpdatedAt?: string
}

@Injectable()
export class BlacklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: TenantRealtimeService
  ) {}

  async search(keyword = '') {
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
    return rows.map((row) => this.dto(row))
  }

  async check(keyword: string) {
    const records = keyword.trim() ? await this.search(keyword) : []
    return { hit: records.length > 0, records }
  }

  async create(frontendUserId: string, actorUserId: string, payload: BlacklistMutationPayload) {
    const images = payload.images || []
    const hasContent = [payload.phone, payload.wechat, payload.wechatNickname, payload.other, payload.note].some((value) => String(value || '').trim())
    if (!hasContent) throw new BadRequestException('请至少填写一项黑名单信息')
    if (images.length > 2) throw new BadRequestException('黑名单图片最多上传 2 张')
    const row = await this.prisma.blacklistRecord.create({
      data: {
        uploadedById: frontendUserId,
        phone: payload.phone || null,
        wechat: payload.wechat || null,
        wechatNickname: payload.wechatNickname || null,
        amount: payload.amount === null || payload.amount === undefined ? null : toMoney(payload.amount),
        images,
        other: payload.other || null,
        note: payload.note || null
      },
      include: { uploadedBy: { select: { username: true, account: true } } }
    })
    const dto = this.dto(row)
    this.publish(frontendUserId, actorUserId, row.id, 'create', row.updatedAt)
    return dto
  }

  async update(frontendUserId: string, actorUserId: string, id: string, payload: BlacklistMutationPayload) {
    const current = await this.prisma.blacklistRecord.findUnique({ where: { id } })
    if (!current) throw new NotFoundException('黑名单记录不存在')
    if (current.uploadedById !== frontendUserId) throw new ForbiddenException('只能补充自己上传的黑名单')
    const images = payload.images || []
    if (images.length > 2) throw new BadRequestException('黑名单图片最多上传 2 张')
    const next = {
      phone: payload.phone?.trim() || null,
      wechat: payload.wechat?.trim() || null,
      wechatNickname: payload.wechatNickname?.trim() || null,
      amount: payload.amount === null || payload.amount === undefined ? null : toMoney(payload.amount),
      images,
      other: payload.other?.trim() || null,
      note: payload.note?.trim() || null
    }
    const hasContent = [next.phone, next.wechat, next.wechatNickname, next.other, next.note].some((value) => String(value || '').trim()) || next.amount !== null
    if (!hasContent) throw new BadRequestException('请至少填写一项黑名单信息')
    const baseUpdatedAt = requiredBaseUpdatedAt(payload.baseUpdatedAt)
    const result = await this.prisma.blacklistRecord.updateMany({
      where: { id, uploadedById: frontendUserId, updatedAt: baseUpdatedAt },
      data: next
    })
    const row = await this.prisma.blacklistRecord.findUnique({
      where: { id }, include: { uploadedBy: { select: { username: true, account: true } } }
    })
    if (!result.count) staleWrite(row ? this.dto(row) : null)
    if (!row) throw new NotFoundException('黑名单记录不存在')
    const dto = this.dto(row)
    this.publish(frontendUserId, actorUserId, id, 'update', row.updatedAt)
    return dto
  }

  async delete(frontendUserId: string, actorUserId: string, id: string, baseUpdatedAtInput?: string) {
    const row = await this.prisma.blacklistRecord.findUnique({ where: { id }, include: { uploadedBy: { select: { username: true, account: true } } } })
    if (!row) throw new NotFoundException('黑名单记录不存在')
    if (row.uploadedById !== frontendUserId) throw new ForbiddenException('只能删除自己上传的黑名单')
    const baseUpdatedAt = requiredBaseUpdatedAt(baseUpdatedAtInput)
    const result = await this.prisma.blacklistRecord.deleteMany({ where: { id, uploadedById: frontendUserId, updatedAt: baseUpdatedAt } })
    if (!result.count) {
      const latest = await this.prisma.blacklistRecord.findUnique({
        where: { id }, include: { uploadedBy: { select: { username: true, account: true } } }
      })
      staleWrite(latest ? this.dto(latest) : null)
    }
    this.publish(frontendUserId, actorUserId, id, 'delete', new Date())
    return this.dto(row)
  }

  private dto(row: {
    id: string
    uploadedAt: Date
    updatedAt: Date
    uploadedBy?: { username: string; account: string }
    phone: string | null
    wechat: string | null
    wechatNickname: string | null
    amount: unknown
    images: unknown
    other: string | null
    note: string | null
  }) {
    return {
      id: row.id,
      uploadedAt: row.uploadedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      uploadedBy: row.uploadedBy?.username || row.uploadedBy?.account || '无信息',
      phone: row.phone || '',
      wechat: row.wechat || '',
      wechatNickname: row.wechatNickname || '',
      amount: row.amount === null ? undefined : toMoney(row.amount),
      images: Array.isArray(row.images) ? row.images : [],
      other: row.other || '',
      note: row.note || ''
    }
  }

  private publish(dataOwnerId: string, changedById: string, entityId: string, operation: 'create' | 'update' | 'delete', updatedAt: Date) {
    this.realtime?.publish({ dataOwnerId, module: 'blacklist', entityId, operation, changedById, updatedAt: updatedAt.toISOString() })
  }
}
