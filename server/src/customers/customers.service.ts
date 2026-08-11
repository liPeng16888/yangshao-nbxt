import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { requiredBaseUpdatedAt, staleWrite } from '../common/optimistic-concurrency'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: TenantRealtimeService
  ) {}

  list(frontendUserId: string, keyword = '') {
    const query = keyword.trim()
    return this.prisma.customer.findMany({
      where: {
        frontendUserId,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
                { wechat: { contains: query, mode: 'insensitive' } },
                { wechatNickname: { contains: query, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    })
  }

  async create(frontendUserId: string, actorUserId: string, payload: { name?: string; phone?: string; wechat?: string; wechatNickname?: string }) {
    const name = this.resolveCustomerName(payload)
    if (!name) throw new BadRequestException('请至少填写一项客户信息')
    const phone = payload.phone?.trim() || null
    const wechat = payload.wechat?.trim() || null
    const wechatNickname = payload.wechatNickname?.trim() || null
    const row = await this.prisma.customer.upsert({
      where: { frontendUserId_name: { frontendUserId, name } },
      create: {
        frontendUserId,
        name,
        phone,
        wechat,
        wechatNickname
      },
      update: {
        phone,
        wechat,
        wechatNickname
      }
    })
    this.realtime?.publish({ dataOwnerId: frontendUserId, module: 'customers', entityId: row.id, operation: 'create', changedById: actorUserId, updatedAt: row.updatedAt.toISOString() })
    return row
  }

  async remove(frontendUserId: string, actorUserId: string, id: string, baseUpdatedAtInput?: string) {
    const current = await this.prisma.customer.findFirst({ where: { id, frontendUserId } })
    if (!current) throw new NotFoundException('客户信息不存在')
    const baseUpdatedAt = requiredBaseUpdatedAt(baseUpdatedAtInput)
    const result = await this.prisma.customer.deleteMany({
      where: { id, frontendUserId, updatedAt: baseUpdatedAt }
    })
    if (!result.count) {
      const latest = await this.prisma.customer.findFirst({ where: { id, frontendUserId } })
      staleWrite(latest)
    }
    this.realtime?.publish({ dataOwnerId: frontendUserId, module: 'customers', entityId: id, operation: 'delete', changedById: actorUserId, updatedAt: new Date().toISOString() })
    return { id }
  }

  private resolveCustomerName(payload: { name?: string; phone?: string; wechat?: string; wechatNickname?: string }) {
    return payload.name?.trim() || payload.phone?.trim() || payload.wechat?.trim() || payload.wechatNickname?.trim() || ''
  }
}
