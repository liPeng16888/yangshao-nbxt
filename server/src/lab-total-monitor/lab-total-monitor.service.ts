import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { AdminAccessService } from '../admin/admin-access.service'
import type { CurrentUser } from '../auth/current-user'
import { appendLabTotalRules, validateLabTotalBulkRequest, validateLabTotalRules, type LabTotalMonitorBulkResult, type LabTotalMonitorConfig } from '../common/lab-total-monitor'
import { PrismaService } from '../prisma/prisma.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'

const select = { frontendUserId: true, rules: true, version: true, updatedAt: true } as const

@Injectable()
export class LabTotalMonitorService {
  constructor(private readonly prisma: PrismaService, private readonly adminAccess: AdminAccessService,
    private readonly realtime: TenantRealtimeService) {}

  async frontendConfig(user: CurrentUser) {
    return this.read(user.dataOwnerId)
  }

  async adminConfig(user: CurrentUser, frontendUserId: string) {
    await this.assertOwner(user, frontendUserId)
    return this.read(frontendUserId)
  }

  async bulkAppend(user: CurrentUser, body: unknown): Promise<LabTotalMonitorBulkResult[]> {
    let dto
    try { dto = validateLabTotalBulkRequest(body) } catch (error) { throw new BadRequestException((error as Error).message) }
    // Reject the whole request before any write if any source/target is outside the actor's scope.
    await this.adminAccess.getAllowedFrontendUserIds(user, [dto.sourceFrontendUserId, ...dto.frontendUserIds])
    const source = await this.adminConfig(user, dto.sourceFrontendUserId)
    if (source.version !== dto.sourceVersion) throw new ConflictException('来源账号的监测规则已更新，请重新加载后再批量添加')
    const sourceRules = source.rules.filter((rule) => dto.ruleIds.includes(rule.id))
    if (sourceRules.length !== dto.ruleIds.length) throw new BadRequestException('部分来源规则不存在，请重新加载')
    const results: LabTotalMonitorBulkResult[] = []
    for (const frontendUserId of dto.frontendUserIds) {
      try {
        await this.assertOwner(user, frontendUserId)
        const current = await this.read(frontendUserId)
        let merged
        try { merged = appendLabTotalRules(current.rules, sourceRules, randomUUID) } catch (error) {
          results.push({ frontendUserId, status: 'skipped', addedCount: 0, duplicateCount: 0, message: (error as Error).message }); continue
        }
        if (!merged.addedCount) {
          results.push({ frontendUserId, status: 'unchanged', addedCount: 0, duplicateCount: merged.duplicateCount, message: '已有相同指标，无需重复添加' }); continue
        }
        await this.save(user, frontendUserId, { rules: merged.rules, baseVersion: current.version })
        results.push({ frontendUserId, status: 'applied', addedCount: merged.addedCount, duplicateCount: merged.duplicateCount, message: `已追加 ${merged.addedCount} 条规则${merged.duplicateCount ? `，忽略 ${merged.duplicateCount} 条相同指标` : ''}` })
      } catch (error) {
        const conflict = error instanceof ConflictException
        results.push({ frontendUserId, status: conflict ? 'conflict' : error instanceof NotFoundException ? 'skipped' : 'failed', addedCount: 0, duplicateCount: 0,
          message: conflict ? '该账号规则已被其他管理员修改，请重试' : error instanceof NotFoundException ? '该前台主账号不存在或已删除' : '该账号保存失败，请检查权限或稍后重试' })
      }
    }
    return results
  }

  async save(user: CurrentUser, frontendUserId: string, body: unknown) {
    await this.assertOwner(user, frontendUserId)
    const dto = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    if (!Number.isSafeInteger(dto.baseVersion) || (dto.baseVersion as number) < 0) throw new BadRequestException('配置版本无效，请重新加载')
    let rules
    try { rules = validateLabTotalRules(dto.rules) } catch (error) { throw new BadRequestException((error as Error).message) }
    const baseVersion = dto.baseVersion as number
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const data = { rules: rules as unknown as Prisma.InputJsonValue, updatedById: user.id }
        if (baseVersion === 0) return tx.labTotalMonitorSetting.create({ data: { frontendUserId, ...data }, select })
        const updated = await tx.labTotalMonitorSetting.updateMany({ where: { frontendUserId, version: baseVersion },
          data: { ...data, version: { increment: 1 } } })
        if (!updated.count) throw new ConflictException('监测规则已被其他管理员修改，请重新加载后再保存')
        return tx.labTotalMonitorSetting.findUniqueOrThrow({ where: { frontendUserId }, select })
      })
      this.realtime.publish({ dataOwnerId: frontendUserId, module: 'lab-total-monitor', entityId: frontendUserId,
        operation: baseVersion === 0 ? 'create' : 'update', changedById: user.id, updatedAt: saved.updatedAt.toISOString() })
      return this.toConfig(saved)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('监测规则已被其他管理员创建，请重新加载后再保存')
      }
      throw error
    }
  }

  private async assertOwner(user: CurrentUser, frontendUserId: string) {
    await this.adminAccess.getAllowedFrontendUserIds(user, [frontendUserId])
    const owner = await this.prisma.user.findUnique({ where: { id: frontendUserId }, select: { role: true, deletedAt: true } })
    if (!owner || owner.role !== UserRole.FRONTEND_USER || owner.deletedAt) throw new NotFoundException('前台主账号不存在')
  }

  private async read(frontendUserId: string): Promise<LabTotalMonitorConfig> {
    const row = await this.prisma.labTotalMonitorSetting.findUnique({ where: { frontendUserId }, select })
    return row ? this.toConfig(row) : { frontendUserId, version: 0, rules: [], updatedAt: null }
  }

  private toConfig(row: { frontendUserId: string; rules: unknown; version: number; updatedAt: Date }): LabTotalMonitorConfig {
    return { frontendUserId: row.frontendUserId, rules: validateLabTotalRules(row.rules), version: row.version, updatedAt: row.updatedAt.toISOString() }
  }
}
