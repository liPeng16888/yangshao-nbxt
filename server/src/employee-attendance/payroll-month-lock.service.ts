import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PayrollMonthLockService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(frontendUserId: string, requestedMonths: string[], operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    const months = Array.from(new Set(requestedMonths.map((value) => value.slice(0, 7)))).sort()
    if (!months.length || months.some((month) => !/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12)) {
      throw new BadRequestException('工资锁定月份无效')
    }
    return this.transact(frontendUserId, months, operation)
  }

  runConfiguration<T>(frontendUserId: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.transact(frontendUserId, [], operation)
  }

  private async transact<T>(frontendUserId: string, months: string[], operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            `employee-payroll-config:${frontendUserId}`
          )
          for (const month of months) {
            await tx.$executeRawUnsafe(
              'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
              `employee-payroll:${frontendUserId}:${month}`
            )
          }
          return operation(tx)
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034') throw error
        if (attempt === 2) throw new ConflictException('工资数据发生并发冲突，请刷新后重试')
      }
    }
    throw new ConflictException('工资数据发生并发冲突，请刷新后重试')
  }
}
