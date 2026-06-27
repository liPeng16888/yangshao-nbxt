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

  async create(frontendUserId: string, payload: { name: string; phone?: string; wechat?: string; wechatNickname?: string }) {
    if (!payload.name?.trim()) throw new BadRequestException('客户名称不能为空')
    return this.prisma.customer.upsert({
      where: { frontendUserId_name: { frontendUserId, name: payload.name.trim() } },
      create: {
        frontendUserId,
        name: payload.name.trim(),
        phone: payload.phone || null,
        wechat: payload.wechat || null,
        wechatNickname: payload.wechatNickname || null
      },
      update: {
        phone: payload.phone || null,
        wechat: payload.wechat || null,
        wechatNickname: payload.wechatNickname || null
      }
    })
  }
}
