import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { FrontendMenuPermission, Prisma, UserRole } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { CurrentUser } from './current-user'
import type {
  CreateFrontendSubAccountDto,
  ResetFrontendSubAccountPasswordDto,
  SetFrontendSubAccountStatusDto,
  UpdateFrontendSubAccountDto
} from './dto'
import { isFrontendMenuPermission } from './frontend-menu-permissions'
import { PasswordService } from './password.service'

const safeSubAccountSelect = {
  id: true,
  account: true,
  username: true,
  disabled: true,
  disabledReason: true,
  requiresAccessGuardPassword: true,
  permissionVersion: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  frontendSubAccountPermissions: {
    select: { permission: true },
    orderBy: { permission: 'asc' as const }
  }
} satisfies Prisma.UserSelect

type SafeSubAccount = Prisma.UserGetPayload<{ select: typeof safeSubAccountSelect }>

@Injectable()
export class FrontendSubAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService
  ) {}

  async list(owner: CurrentUser) {
    this.assertMain(owner)
    const rows = await this.prisma.user.findMany({
      where: {
        role: UserRole.FRONTEND_SUB_USER,
        parentFrontendUserId: owner.id,
        deletedAt: null
      },
      select: safeSubAccountSelect,
      orderBy: [{ createdAt: 'asc' }, { account: 'asc' }]
    })
    return rows.map((row) => this.toDto(row))
  }

  async create(owner: CurrentUser, dto: CreateFrontendSubAccountDto) {
    this.assertMain(owner)
    const account = dto.account?.trim()
    const username = dto.username?.trim()
    if (!account || account.length < 3 || account.length > 64) throw new BadRequestException('登录账号长度应为 3 至 64 个字符')
    if (!username || username.length > 40) throw new BadRequestException('账号名称不能为空且不能超过 40 个字符')
    this.assertPassword(dto.password, dto.confirmPassword)
    const permissions = this.normalizePermissions(dto.permissions)
    if (await this.prisma.user.findUnique({ where: { account } })) throw new BadRequestException('登录账号已存在')
    const passwordHash = await this.passwords.hash(dto.password)

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          account,
          username,
          role: UserRole.FRONTEND_SUB_USER,
          parentFrontendUserId: owner.id,
          passwordHash,
          passwordCipher: null,
          requiresAccessGuardPassword: dto.requiresAccessGuardPassword
        },
        select: safeSubAccountSelect
      })
      await tx.frontendSubAccountPermission.createMany({
        data: permissions.map((permission) => ({ subAccountId: created.id, permission }))
      })
      return this.toDto({
        ...created,
        frontendSubAccountPermissions: permissions.map((permission) => ({ permission }))
      })
    })
  }

  async update(owner: CurrentUser, id: string, dto: UpdateFrontendSubAccountDto) {
    this.assertMain(owner)
    const username = dto.username?.trim()
    if (!username || username.length > 40) throw new BadRequestException('账号名称不能为空且不能超过 40 个字符')
    const permissions = this.normalizePermissions(dto.permissions)

    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, owner.id, id)
      await tx.frontendSubAccountPermission.deleteMany({ where: { subAccountId: id } })
      const updated = await tx.user.update({
        where: { id },
        data: {
          username,
          requiresAccessGuardPassword: dto.requiresAccessGuardPassword,
          permissionVersion: { increment: 1 }
        },
        select: safeSubAccountSelect
      })
      await tx.frontendSubAccountPermission.createMany({
        data: permissions.map((permission) => ({ subAccountId: id, permission }))
      })
      return this.toDto({
        ...updated,
        frontendSubAccountPermissions: permissions.map((permission) => ({ permission }))
      })
    })
  }

  async setStatus(owner: CurrentUser, id: string, dto: SetFrontendSubAccountStatusDto) {
    this.assertMain(owner)
    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, owner.id, id)
      await tx.user.update({
        where: { id },
        data: {
          disabled: dto.disabled,
          disabledReason: dto.disabled ? dto.disabledReason?.trim() || '已由主账号停用' : null,
          permissionVersion: { increment: 1 }
        }
      })
      return { ok: true }
    })
  }

  async resetPassword(owner: CurrentUser, id: string, dto: ResetFrontendSubAccountPasswordDto) {
    this.assertMain(owner)
    this.assertPassword(dto.newPassword, dto.confirmPassword)
    const mainAccount = await this.prisma.user.findUnique({
      where: { id: owner.id },
      select: { id: true, passwordHash: true, deletedAt: true, disabled: true }
    })
    if (!mainAccount || mainAccount.deletedAt || mainAccount.disabled) throw new UnauthorizedException('主账号已失效')
    if (!await this.passwords.verify(dto.currentPassword, mainAccount.passwordHash)) {
      throw new UnauthorizedException('主账号当前密码错误')
    }
    const passwordHash = await this.passwords.hash(dto.newPassword)
    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, owner.id, id)
      await tx.user.update({
        where: { id },
        data: { passwordHash, passwordCipher: null, permissionVersion: { increment: 1 } }
      })
      return { ok: true }
    })
  }

  async softDelete(owner: CurrentUser, id: string) {
    this.assertMain(owner)
    return this.prisma.$transaction(async (tx) => {
      await this.findOwned(tx, owner.id, id)
      await tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          disabled: true,
          disabledReason: '已由主账号删除',
          permissionVersion: { increment: 1 }
        }
      })
      return { ok: true }
    })
  }

  private assertMain(user: CurrentUser) {
    if (user.role !== UserRole.FRONTEND_USER || user.dataOwnerId !== user.id || !user.isFrontendMainAccount) {
      throw new ForbiddenException('只有主账号可以管理子账号')
    }
  }

  private async findOwned(tx: Prisma.TransactionClient, ownerId: string, id: string) {
    const row = await tx.user.findFirst({
      where: { id, role: UserRole.FRONTEND_SUB_USER, parentFrontendUserId: ownerId, deletedAt: null }
    })
    if (!row) throw new NotFoundException('子账号不存在')
    return row
  }

  private normalizePermissions(values: FrontendMenuPermission[]) {
    const permissions = Array.from(new Set(values || []))
    if (!permissions.length || permissions.some((permission) => !isFrontendMenuPermission(permission))) {
      throw new BadRequestException('请选择有效的菜单权限')
    }
    return permissions
  }

  private assertPassword(password: string, confirmation: string) {
    if (!password || password.length < 6 || password.length > 72) throw new BadRequestException('密码长度应为 6 至 72 个字符')
    if (password !== confirmation) throw new BadRequestException('两次密码不一致')
  }

  private toDto(row: SafeSubAccount) {
    return {
      id: row.id,
      account: row.account,
      username: row.username,
      disabled: row.disabled,
      disabledReason: row.disabledReason,
      requiresAccessGuardPassword: row.requiresAccessGuardPassword,
      permissionVersion: row.permissionVersion,
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      permissions: row.frontendSubAccountPermissions.map((item) => item.permission)
    }
  }
}
