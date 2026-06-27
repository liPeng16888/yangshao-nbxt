import { ForbiddenException, Injectable } from '@nestjs/common'
import { ReminderType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  createPaymentReminder(input: {
    frontendUserId: string
    createdById: string
    type: ReminderType
    title: string
    content: string
    sourceType: string
    sourceId: string
  }) {
    return this.prisma.reminder.create({ data: input })
  }

  listForFrontendUser(frontendUserId: string) {
    return this.prisma.reminder.findMany({
      where: { frontendUserId },
      orderBy: { createdAt: 'desc' },
      take: 50
    })
  }

  async markRead(frontendUserId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } })
    if (!reminder || reminder.frontendUserId !== frontendUserId) throw new ForbiddenException('没有访问权限')
    return this.prisma.reminder.update({ where: { id }, data: { readAt: new Date() } })
  }
}
