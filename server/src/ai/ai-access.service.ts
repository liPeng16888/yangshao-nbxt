import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { AccessGuardFeature, Prisma, UserRole, type FrontendMenuPermission } from '@prisma/client'
import { createHash } from 'node:crypto'
import type { CurrentUser } from '../auth/current-user'
import { AuthService } from '../auth/auth.service'
import { AdminAccessService } from '../admin/admin-access.service'
import { PrismaService } from '../prisma/prisma.service'
import { AiConfigService } from './ai-config.service'
import { catalog, type Grants, type Resource } from './ai.catalog'
import { fieldIsDenied } from './ai-menu-catalog'
import { normalizedOwners } from './ai-owner-scope'

@Injectable()
export class AiAccessService {
  constructor(private readonly prisma: PrismaService, private readonly config: AiConfigService, private readonly auth: AuthService, private readonly admin: AdminAccessService) {}
  isAdmin(user: CurrentUser) { return user.role === UserRole.ROOT_ADMIN || user.role === UserRole.SUB_ADMIN }
  async owners(user:CurrentUser,requested?:string[],transaction?:Prisma.TransactionClient) {
    if(!requested)return[await this.owner(user,undefined,transaction)]
    const ids=normalizedOwners(requested)
    if(!this.isAdmin(user)&&ids.length!==1)throw new ForbiddenException('前台账号不能跨账号读取数据')
    for(const id of ids)await this.owner(user,id,transaction)
    return ids
  }
  async ownersAuthorizationHash(user:CurrentUser,ownerIds:string[],grants:Grants,transaction?:Prisma.TransactionClient) {
    const ids=normalizedOwners(ownerIds)
    if(ids.length===1)return this.authorizationHash(user,ids[0],grants,transaction)
    const hashes=[]
    for(const id of ids)hashes.push([id,await this.authorizationHash(user,id,grants,transaction)])
    return createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
  }
  async owner(user: CurrentUser, requested?: string, transaction?: Prisma.TransactionClient) {
    if (!this.isAdmin(user)) {
      if (requested && requested !== user.dataOwnerId) throw new ForbiddenException('不能跨账号操作数据')
      return user.dataOwnerId
    }
    if (!requested) throw new ForbiddenException('请先选择已授权的前台账号')
    if (user.role === UserRole.SUB_ADMIN) {
      const policy = await this.config.policy(user.id, transaction)
      if (!policy.enabled || !policy.rules.some(rule => rule.ownerIds?.includes(requested))) throw new ForbiddenException('子管理员的 AI 未单独授权此数据账号')
    }
    if (transaction) {
      if (user.role === UserRole.SUB_ADMIN && !await transaction.subAdminFrontendPermission.findFirst({ where: { subAdminId: user.id, frontendUserId: requested } })) throw new ForbiddenException('没有该账号的数据权限')
    } else await this.admin.getAllowedFrontendUserIds(user, [requested])
    const owner = await (transaction || this.prisma).user.findFirst({ where: { id: requested, role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null }, select: { id: true } })
    if (!owner) throw new NotFoundException('账号不存在或已停用')
    return requested
  }
  async fields(user: CurrentUser, resource: Resource, mode: 'read' | 'write', grants: Grants = {}, transaction?: Prisma.TransactionClient, ownerId?: string) {
    const entry = catalog.find(c => c.key === resource)
    if (!entry) throw new ForbiddenException('不支持的业务菜单')
    const audience = this.isAdmin(user) ? 'admin' : 'frontend'
    if (!entry[audience] || entry.rootOnly && user.role !== UserRole.ROOT_ADMIN) throw new ForbiddenException('没有该菜单权限')
    if (mode === 'write' && !entry.writeAudiences.includes(audience)) throw new ForbiddenException('该菜单对当前账号只读，请使用原有业务流程')
    if (user.role === UserRole.FRONTEND_SUB_USER && !entry.permissions.some(p => user.permissions.includes(p as FrontendMenuPermission))) throw new ForbiddenException('子账号没有该菜单权限')
    if (!this.isAdmin(user) && entry.protection) {
      if (transaction) await this.auth.assertAccessGrant(user, grants[entry.protection], entry.protection as AccessGuardFeature, false, transaction)
      else await this.auth.assertAccessGrant(user, grants[entry.protection], entry.protection as AccessGuardFeature)
    }
    const policy = await this.config.policy(user.id, transaction)
    if (!policy.enabled) throw new ForbiddenException('此账号的 AI 已被管理员停用')
    const settings = await this.config.settings(transaction)
    const deniedGuards = new Set(catalog.flatMap(c => c.fields.filter(f => ((settings.blockedFields as Record<string, string[]>)[c.key] || []).includes(f.key)).map(f => f.guard)))
    const rule = policy.rules.find(r => r.resource === resource)
    if (user.role === UserRole.SUB_ADMIN && (!ownerId || !rule?.ownerIds?.includes(ownerId))) throw new ForbiddenException('此菜单未单独授权给当前数据账号')
    const chosen = mode === 'read' ? rule?.readFields : rule?.writeFields
    const allowed = (chosen || []).filter(k => entry.fields.some(f => f.key === k && !fieldIsDenied(f,deniedGuards) && (mode === 'read' || f.writable && f.writeAudiences?.includes(audience))))
    if (!allowed.length) throw new ForbiddenException('AI 没有该菜单的读取或写入权限')
    return allowed
  }
  async sampleProtection(user: CurrentUser, date: string, completed: boolean, grants: Grants) {
    if (this.isAdmin(user)) return
    const { businessDateInBeijing } = await import('../common/date')
    if (date !== businessDateInBeijing()) await this.auth.assertAccessGrant(user, grants.HISTORICAL_DATES, 'HISTORICAL_DATES')
    if (completed) await this.auth.assertAccessGrant(user, grants.COMPLETED_SAMPLE_DATA, 'COMPLETED_SAMPLE_DATA')
  }
  async authorizationHash(user: CurrentUser, ownerId: string, grants: Grants, transaction?: Prisma.TransactionClient) {
    const memberships = this.isAdmin(user) ? [] : await (transaction || this.prisma).accessGuardGroupFeature.findMany({
      where: { frontendUserId: ownerId, group: { enabled: true } }, select: { feature: true, group: { select: { id: true, grantVersion: true } } }
    })
    const valid: string[] = []
    for (const { feature } of memberships) {
      if (await this.auth.hasAccessGrant(user, grants[feature], feature, transaction)) valid.push(feature)
    }
    const protectedGroups = memberships.map(m => `${m.feature}:${m.group?.id || ''}:${m.group?.grantVersion || 0}`).sort()
    return createHash('sha256').update(JSON.stringify({ ownerId, role: user.role, permissions: [...user.permissions].sort(), permissionVersion: user.permissionVersion, requiresPassword: user.requiresAccessGuardPassword, protectedGroups, valid: valid.sort() })).digest('hex')
  }
}
