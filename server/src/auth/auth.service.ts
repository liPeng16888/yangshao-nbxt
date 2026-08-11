import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AccessGuardFeature, Prisma, UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import { PasswordService } from './password.service'
import { AccessGuardGroupDto, AccessGuardSettingsDto, LoginDto, RegisterDto, UpdateAdminProfileDto, UpdatePasswordDto } from './dto'
import type { CurrentUser } from './current-user'
import { resolveCurrentUserIdentity } from './current-user'

interface AccessGrantClaims {
  sub?: string
  type?: string
  groupId?: string
  grantVersion?: number
  features?: AccessGuardFeature[]
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService
  ) {}

  async login(dto: LoginDto, allowedRoles: UserRole[]) {
    const user = await this.prisma.user.findUnique({ where: { account: dto.account } })
    if (!user || user.deletedAt || !allowedRoles.includes(user.role)) throw new UnauthorizedException('账号或密码错误')
    if (user.disabled) {
      throw new UnauthorizedException({
        code: 'ACCOUNT_DISABLED',
        message: user.disabledReason || '已禁止登录，请联系管理员解除'
      })
    }
    const valid = await this.passwords.verify(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException('账号或密码错误')
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    const identity = await resolveCurrentUserIdentity(this.prisma, user.id, user.permissionVersion)
    return {
      token: this.sign(user.id, user.permissionVersion),
      user: identity
    }
  }

  async registerFrontendUser(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) throw new BadRequestException('两次密码不一致')
    const invite = await this.prisma.inviteCode.findUnique({ where: { code: dto.inviteCode } })
    if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt.getTime() < Date.now())) {
      throw new BadRequestException('一次性注册码无效、已使用或已过期')
    }
    const exists = await this.prisma.user.findUnique({ where: { account: dto.account } })
    if (exists) throw new BadRequestException('账号已存在')
    const passwordHash = await this.passwords.hash(dto.password)
    const passwordCipher = this.passwords.encryptForDisplay(dto.password)
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          account: dto.account,
          username: dto.username,
          role: UserRole.FRONTEND_USER,
          passwordHash,
          passwordCipher
        }
      })
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          usedById: created.id
        }
      })
      return created
    })
    return {
      token: this.sign(user.id, user.permissionVersion),
      user: await resolveCurrentUserIdentity(this.prisma, user.id, user.permissionVersion)
    }
  }

  async updateAdminProfile(currentUser: CurrentUser, dto: UpdateAdminProfileDto) {
    if (currentUser.role !== UserRole.ROOT_ADMIN && currentUser.role !== UserRole.SUB_ADMIN) throw new ForbiddenException('无权修改后台账号')

    const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } })
    if (!user || user.deletedAt) throw new UnauthorizedException('账号不存在或已失效')

    const account = dto.account?.trim()
    if (!account) throw new BadRequestException('登录账号不能为空')

    const username = dto.username?.trim()
    if (!username) throw new BadRequestException('账号名称不能为空')

    if (account !== user.account) {
      const exists = await this.prisma.user.findUnique({ where: { account } })
      if (exists && exists.id !== user.id) throw new BadRequestException('登录账号已存在')
    }

    const data: { account: string; username: string; passwordHash?: string; passwordCipher?: string } = { account, username }
    const wantsPasswordChange = Boolean(dto.currentPassword || dto.newPassword || dto.confirmPassword)
    if (wantsPasswordChange) {
      Object.assign(data, await this.buildPasswordUpdate(user.passwordHash, dto as UpdatePasswordDto))
    }

    const updated = await this.prisma.user.update({ where: { id: user.id }, data })
    return {
      id: updated.id,
      account: updated.account,
      username: updated.username,
      role: updated.role
    }
  }

  async updateFrontendPassword(currentUser: CurrentUser, dto: UpdatePasswordDto) {
    if (currentUser.role !== UserRole.FRONTEND_USER && currentUser.role !== UserRole.FRONTEND_SUB_USER) {
      throw new ForbiddenException('无权修改前台账号')
    }
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } })
    if (!user || user.deletedAt) throw new UnauthorizedException('账号不存在或已失效')
    await this.prisma.user.update({
      where: { id: user.id },
      data: await this.buildPasswordUpdate(user.passwordHash, dto)
    })
    return { ok: true }
  }

  async getAccessGuardSettings(currentUser: CurrentUser) {
    if (currentUser.role !== UserRole.FRONTEND_USER) throw new ForbiddenException('无权查看访问设置')
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } })
    if (!user || user.deletedAt) throw new UnauthorizedException('账号不存在或已失效')
    return this.accessGuardDto(user)
  }

  async updateAccessGuardSettings(currentUser: CurrentUser, dto: AccessGuardSettingsDto) {
    if (currentUser.role !== UserRole.FRONTEND_USER) throw new ForbiddenException('无权修改访问设置')
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.id } })
    if (!user || user.deletedAt) throw new UnauthorizedException('账号不存在或已失效')

    const enabled = Boolean(dto.enabled)
    const password = dto.password?.trim() || ''
    const disablePassword = dto.disablePassword?.trim() || ''
    const recoveryPrompt = dto.recoveryPrompt?.trim() || ''
    const recoveryAnswer = dto.recoveryAnswer?.trim() || ''
    const ttlMinutes = this.normalizeAccessGuardTtl(dto.ttlMinutes)
    if (user.accessGuardEnabled && !enabled && user.accessGuardPassword) {
      if (!disablePassword) throw new BadRequestException('请输入访问密码后关闭访问密码')
      if (disablePassword !== user.accessGuardPassword) throw new BadRequestException('访问密码不正确，无法关闭')
    }
    if (enabled) {
      if (!password && !user.accessGuardPassword) throw new BadRequestException('开启访问密码时请先设置密码')
      if (!recoveryPrompt && !user.accessGuardRecoveryPrompt) throw new BadRequestException('开启访问密码时请设置找回提示词')
      if (!recoveryAnswer && !user.accessGuardRecoveryAnswer) throw new BadRequestException('开启访问密码时请设置找回答案')
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        accessGuardEnabled: enabled,
        accessGuardTtlMinutes: ttlMinutes,
        ...(password ? { accessGuardPassword: password } : {}),
        ...(recoveryPrompt ? { accessGuardRecoveryPrompt: recoveryPrompt } : {}),
        ...(recoveryAnswer ? { accessGuardRecoveryAnswer: recoveryAnswer } : {})
      }
    })
    return this.accessGuardDto(updated)
  }

  async getAccessGuardGroups(currentUser: CurrentUser) {
    this.assertFrontendUser(currentUser)
    const groups = await this.prisma.accessGuardGroup.findMany({
      where: { frontendUserId: currentUser.id },
      include: { features: { orderBy: { feature: 'asc' } } },
      orderBy: { createdAt: 'asc' }
    })
    return groups.map((group) => this.accessGuardGroupDto(group))
  }

  async createAccessGuardGroup(currentUser: CurrentUser, dto: AccessGuardGroupDto) {
    this.assertFrontendUser(currentUser)
    const data = this.normalizeAccessGuardGroup(dto)
    await this.ensureNoGroupFeatureConflict(currentUser.id, data.features)
    try {
      const group = await this.prisma.accessGuardGroup.create({
        data: {
          frontendUserId: currentUser.id,
          name: data.name,
          enabled: data.enabled,
          ttlMinutes: data.ttlMinutes,
          password: data.password,
          recoveryPrompt: data.recoveryPrompt,
          recoveryAnswer: data.recoveryAnswer,
          features: { create: data.features.map((feature) => ({ frontendUserId: currentUser.id, feature })) }
        },
        include: { features: { orderBy: { feature: 'asc' } } }
      })
      return this.accessGuardGroupDto(group)
    } catch (error) { this.rethrowGroupConflict(error) }
  }

  async updateAccessGuardGroup(currentUser: CurrentUser, id: string, dto: AccessGuardGroupDto) {
    this.assertFrontendUser(currentUser)
    const data = this.normalizeAccessGuardGroup(dto)
    const existing = await this.prisma.accessGuardGroup.findFirst({ where: { id, frontendUserId: currentUser.id } })
    if (!existing) throw new ForbiddenException('访问组合不存在或无权修改')
    await this.ensureNoGroupFeatureConflict(currentUser.id, data.features, id)
    try {
      const group = await this.prisma.$transaction(async (tx) => {
        await tx.accessGuardGroupFeature.deleteMany({ where: { groupId: id } })
        return tx.accessGuardGroup.update({
          where: { id },
          data: {
            name: data.name, enabled: data.enabled, ttlMinutes: data.ttlMinutes, password: data.password,
            recoveryPrompt: data.recoveryPrompt, recoveryAnswer: data.recoveryAnswer,
            grantVersion: { increment: 1 },
            features: { create: data.features.map((feature) => ({ frontendUserId: currentUser.id, feature })) }
          },
          include: { features: { orderBy: { feature: 'asc' } } }
        })
      })
      return this.accessGuardGroupDto(group)
    } catch (error) { this.rethrowGroupConflict(error) }
  }

  async deleteAccessGuardGroup(currentUser: CurrentUser, id: string) {
    this.assertFrontendUser(currentUser)
    const result = await this.prisma.accessGuardGroup.deleteMany({ where: { id, frontendUserId: currentUser.id } })
    if (!result.count) throw new ForbiddenException('访问组合不存在或无权删除')
    return { ok: true }
  }

  async verifyAccessGuardGroup(currentUser: CurrentUser, id: string, password: string) {
    this.assertFrontendUser(currentUser)
    const group = await this.prisma.accessGuardGroup.findFirst({ where: { id, frontendUserId: currentUser.id }, include: { features: true } })
    if (!group || !group.enabled) throw new ForbiddenException('访问组合不存在或未启用')
    if (password.trim() !== group.password) throw new ForbiddenException('访问密码不正确')
    const features = group.features.map((item) => item.feature)
    const expiresAt = Date.now() + group.ttlMinutes * 60_000
    const token = jwt.sign({
      sub: currentUser.id, type: 'access-guard', groupId: group.id, grantVersion: group.grantVersion,
      features, exp: Math.floor(expiresAt / 1000)
    }, this.config.get<string>('JWT_SECRET') || 'dev-secret')
    return { expiresAt, token, groupId: group.id, grantVersion: group.grantVersion, features }
  }

  async hasAccessGrant(currentUserId: string, token: string | undefined, feature: AccessGuardFeature) {
    if (!token) return false
    let payload: AccessGrantClaims
    try {
      const verified = jwt.verify(token, this.config.get<string>('JWT_SECRET') || 'dev-secret')
      if (typeof verified === 'string') return false
      payload = verified as AccessGrantClaims
    } catch { return false }
    if (
      payload.sub !== currentUserId || payload.type !== 'access-guard' || !payload.groupId ||
      !Number.isInteger(payload.grantVersion) || Number(payload.grantVersion) < 1 ||
      !Array.isArray(payload.features) || !payload.features.includes(feature)
    ) return false
    const currentGroup = await this.prisma.accessGuardGroup.findFirst({
      where: {
        id: payload.groupId,
        frontendUserId: currentUserId,
        enabled: true,
        grantVersion: payload.grantVersion,
        features: { some: { frontendUserId: currentUserId, feature } }
      },
      select: { id: true }
    })
    return Boolean(currentGroup)
  }

  async isFeatureProtected(currentUserId: string, feature: AccessGuardFeature) {
    const membership = await this.prisma.accessGuardGroupFeature.findFirst({
      where: { frontendUserId: currentUserId, feature, group: { enabled: true } },
      select: { id: true }
    })
    return Boolean(membership)
  }

  async assertAccessGrant(currentUserId: string, token: string | undefined, feature: AccessGuardFeature, alwaysRequire = false) {
    const protectedFeature = alwaysRequire || await this.isFeatureProtected(currentUserId, feature)
    if (protectedFeature && !(await this.hasAccessGrant(currentUserId, token, feature))) {
      throw new ForbiddenException({ code: 'ACCESS_GRANT_INVALID', message: '访问授权无效或已过期' })
    }
  }

  private async buildPasswordUpdate(passwordHash: string, dto: UpdatePasswordDto) {
    if (!dto.currentPassword || !dto.newPassword || !dto.confirmPassword) throw new BadRequestException('请完整填写当前密码、新密码和确认密码')
    if (dto.newPassword !== dto.confirmPassword) throw new BadRequestException('两次新密码不一致')
    if (dto.newPassword.length < 6) throw new BadRequestException('新密码至少 6 位')
    const valid = await this.passwords.verify(dto.currentPassword, passwordHash)
    if (!valid) throw new BadRequestException('当前密码不正确')
    return {
      passwordHash: await this.passwords.hash(dto.newPassword),
      passwordCipher: this.passwords.encryptForDisplay(dto.newPassword)
    }
  }

  private accessGuardDto(user: {
    accessGuardEnabled: boolean
    accessGuardPassword: string | null
    accessGuardTtlMinutes: number
    accessGuardRecoveryPrompt: string | null
    accessGuardRecoveryAnswer: string | null
  }) {
    return {
      enabled: user.accessGuardEnabled,
      ttlMinutes: user.accessGuardTtlMinutes || 5,
      password: user.accessGuardPassword || '',
      recoveryPrompt: user.accessGuardRecoveryPrompt || '',
      recoveryAnswer: user.accessGuardRecoveryAnswer || ''
    }
  }

  private accessGuardGroupDto(group: {
    id: string
    name: string
    enabled: boolean
    ttlMinutes: number
    password: string
    recoveryPrompt: string
    recoveryAnswer: string
    grantVersion: number
    features: Array<{ feature: AccessGuardFeature }>
  }) {
    return {
      id: group.id,
      name: group.name,
      enabled: group.enabled,
      ttlMinutes: group.ttlMinutes,
      grantVersion: group.grantVersion,
      password: group.password,
      recoveryPrompt: group.recoveryPrompt,
      recoveryAnswer: group.recoveryAnswer,
      features: group.features.map((feature) => feature.feature)
    }
  }

  private assertFrontendUser(currentUser: CurrentUser) {
    if (currentUser.role !== UserRole.FRONTEND_USER) throw new ForbiddenException('无权管理访问组合')
  }

  private normalizeAccessGuardGroup(dto: AccessGuardGroupDto) {
    const name = dto.name?.trim()
    const password = dto.password?.trim()
    const recoveryPrompt = dto.recoveryPrompt?.trim()
    const recoveryAnswer = dto.recoveryAnswer?.trim()
    const features = Array.from(new Set(dto.features || []))
    if (!name || !password || password.length < 4 || !recoveryPrompt || !recoveryAnswer || !features.length) throw new BadRequestException('请完整填写访问组合信息')
    return { name, password, recoveryPrompt, recoveryAnswer, enabled: Boolean(dto.enabled), ttlMinutes: this.normalizeAccessGuardTtl(dto.ttlMinutes), features }
  }

  private async ensureNoGroupFeatureConflict(frontendUserId: string, features: AccessGuardFeature[], excludingGroupId?: string) {
    const conflict = await this.prisma.accessGuardGroupFeature.findFirst({
      where: { frontendUserId, feature: { in: features }, ...(excludingGroupId ? { groupId: { not: excludingGroupId } } : {}) }
    })
    if (conflict) throw new BadRequestException('所选功能已加入其他访问组合')
  }

  private rethrowGroupConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BadRequestException('组合名称或所选功能已存在')
    throw error
  }

  private normalizeAccessGuardTtl(value: unknown) {
    const numeric = Number(value || 5)
    if (!Number.isFinite(numeric)) return 5
    return Math.min(1440, Math.max(1, Math.round(numeric)))
  }

  sign(userId: string, permissionVersion = 1) {
    return jwt.sign({ sub: userId, permissionVersion }, this.config.get<string>('JWT_SECRET') || 'dev-secret', { expiresIn: '7d' })
  }
}
