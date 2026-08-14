import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma, type FrontendPreferenceSection } from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'
import type { SaveFrontendPreferenceDto } from './frontend-preferences.dto'
import {
  accessiblePreferenceSections,
  canAccessPreferenceSection
} from './frontend-preferences.permissions'
import { normalizeFrontendPreferenceValue } from './frontend-preferences.validation'

const safePreferenceSelect = {
  section: true,
  value: true,
  version: true,
  updatedAt: true,
  updatedBy: { select: { id: true, username: true } }
} as const

type PreferenceDb = PrismaService | Prisma.TransactionClient

@Injectable()
export class FrontendPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: TenantRealtimeService
  ) {}

  async list(user: CurrentUser) {
    const sections = accessiblePreferenceSections(user)
    if (!sections.length) return []

    const rows = await this.prisma.frontendBusinessPreference.findMany({
      where: { frontendUserId: user.dataOwnerId, section: { in: sections } },
      select: safePreferenceSelect
    })
    const sectionOrder = new Map(sections.map((section, index) => [section, index]))
    return rows.sort((left, right) => (
      (sectionOrder.get(left.section) ?? Number.MAX_SAFE_INTEGER) -
      (sectionOrder.get(right.section) ?? Number.MAX_SAFE_INTEGER)
    ))
  }

  async save(
    user: CurrentUser,
    section: FrontendPreferenceSection,
    dto: SaveFrontendPreferenceDto
  ) {
    if (!canAccessPreferenceSection(user, section)) {
      throw new ForbiddenException('子账号没有该配置分区的访问权限')
    }

    const value = normalizeFrontendPreferenceValue(section, dto.value) as Prisma.InputJsonValue
    let result: { saved: Awaited<ReturnType<FrontendPreferencesService['findCurrent']>>; existing: boolean }

    try {
      result = await this.prisma.$transaction(async (tx) => {
        if (dto.baseVersion === 0) {
          const saved = await tx.frontendBusinessPreference.create({
            data: {
              frontendUserId: user.dataOwnerId,
              section,
              value,
              version: 1,
              updatedById: user.id
            },
            select: safePreferenceSelect
          })
          return { saved, existing: false }
        }

        const updated = await tx.frontendBusinessPreference.updateMany({
          where: { frontendUserId: user.dataOwnerId, section, version: dto.baseVersion },
          data: { value, updatedById: user.id, version: { increment: 1 } }
        })
        if (updated.count === 0) {
          throw this.versionConflict(await this.findCurrent(tx, user.dataOwnerId, section))
        }

        const saved = await this.findCurrent(tx, user.dataOwnerId, section)
        if (!saved) throw this.versionConflict(null)
        return { saved, existing: true }
      })
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error
      throw this.versionConflict(await this.findCurrent(this.prisma, user.dataOwnerId, section))
    }

    const saved = result.saved
    if (!saved) throw this.versionConflict(null)
    this.realtime.publish({
      dataOwnerId: user.dataOwnerId,
      module: 'frontend-preferences',
      entityId: section,
      operation: result.existing ? 'update' : 'create',
      changedById: user.id,
      updatedAt: saved.updatedAt.toISOString()
    })
    return saved
  }

  private findCurrent(db: PreferenceDb, dataOwnerId: string, section: FrontendPreferenceSection) {
    return db.frontendBusinessPreference.findUnique({
      where: { frontendUserId_section: { frontendUserId: dataOwnerId, section } },
      select: safePreferenceSelect
    })
  }

  private versionConflict(current: Awaited<ReturnType<FrontendPreferencesService['findCurrent']>>) {
    return new ConflictException({ code: 'PREFERENCE_VERSION_CONFLICT', current })
  }

  private isUniqueConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
  }
}
