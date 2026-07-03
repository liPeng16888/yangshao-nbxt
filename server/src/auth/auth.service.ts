import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import { PasswordService } from './password.service'
import { AccessGuardSettingsDto, LoginDto, RegisterDto, UpdateAdminProfileDto, UpdatePasswordDto } from './dto'
import type { CurrentUser } from './current-user'

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
    return {
      token: this.sign(user.id),
      user: {
        id: user.id,
        account: user.account,
        username: user.username,
        role: user.role
      }
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
      token: this.sign(user.id),
      user: {
        id: user.id,
        account: user.account,
        username: user.username,
        role: user.role
      }
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
    if (currentUser.role !== UserRole.FRONTEND_USER) throw new ForbiddenException('无权修改前台账号')
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

  private normalizeAccessGuardTtl(value: unknown) {
    const numeric = Number(value || 5)
    if (!Number.isFinite(numeric)) return 5
    return Math.min(1440, Math.max(1, Math.round(numeric)))
  }

  sign(userId: string) {
    return jwt.sign({ sub: userId }, this.config.get<string>('JWT_SECRET') || 'dev-secret', { expiresIn: '7d' })
  }
}
