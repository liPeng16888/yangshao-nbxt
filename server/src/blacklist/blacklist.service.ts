import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { toMoney } from '../common/money'

@Injectable()
export class BlacklistService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(frontendUserId: string, payload: { phone?: string; wechat?: string; wechatNickname?: string; amount?: number | null; images?: string[]; other?: string; note?: string }) {
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
    return this.dto(row)
  }

  async update(frontendUserId: string, id: string, payload: { phone?: string; wechat?: string; wechatNickname?: string; amount?: number | null; images?: string[]; other?: string; note?: string }) {
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
    const row = await this.prisma.blacklistRecord.update({
      where: { id },
      data: next,
      include: { uploadedBy: { select: { username: true, account: true } } }
    })
    return this.dto(row)
  }

  async delete(frontendUserId: string, id: string) {
    const row = await this.prisma.blacklistRecord.findUnique({ where: { id }, include: { uploadedBy: { select: { username: true, account: true } } } })
    if (!row) throw new NotFoundException('黑名单记录不存在')
    if (row.uploadedById !== frontendUserId) throw new ForbiddenException('只能删除自己上传的黑名单')
    await this.prisma.blacklistRecord.delete({ where: { id } })
    return this.dto(row)
  }

  private dto(row: {
    id: string
    uploadedAt: Date
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
}
