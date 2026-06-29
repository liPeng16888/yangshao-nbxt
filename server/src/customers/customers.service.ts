import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(frontendUserId: string, payload: { name?: string; phone?: string; wechat?: string; wechatNickname?: string }) {
    const name = this.resolveCustomerName(payload)
    if (!name) throw new BadRequestException('请至少填写一项客户信息')
    const phone = payload.phone?.trim() || null
    const wechat = payload.wechat?.trim() || null
    const wechatNickname = payload.wechatNickname?.trim() || null
    return this.prisma.customer.upsert({
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
  }

  private resolveCustomerName(payload: { name?: string; phone?: string; wechat?: string; wechatNickname?: string }) {
    return payload.name?.trim() || payload.phone?.trim() || payload.wechat?.trim() || payload.wechatNickname?.trim() || ''
  }
}
