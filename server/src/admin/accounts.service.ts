import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { PasswordService } from '../auth/password.service'
import type { CurrentUser } from '../auth/current-user'

export interface CreateSubAdminPayload {
  account: string
  username: string
  password: string
  frontendUserIds?: string[]
}

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService
  ) {}

  async listFrontendUsers() {
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.FRONTEND_USER, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        frontendSheets: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true }
        }
      }
    })
    return users.map((user) => ({
      id: user.id,
      account: user.account,
      username: user.username,
      role: user.role,
      disabled: user.disabled,
      disabledReason: user.disabledReason || '',
      password: this.safeDecrypt(user.passwordCipher),
      createdAt: user.createdAt,
      lastDataUpdatedAt: user.frontendSheets[0]?.updatedAt || null
    }))
  }

  async createInviteCode(currentUser: CurrentUser, payload: { note?: string; expiresAt?: string }) {
    const code = `YS-${randomBytes(4).toString('hex').toUpperCase()}`
    return this.prisma.inviteCode.create({
      data: {
        code,
        note: payload.note || null,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        createdById: currentUser.id
      }
    })
  }

  async setFrontendDisabled(id: string, disabled: boolean, disabledReason?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.FRONTEND_USER, deletedAt: null }
    })
    if (!user) throw new NotFoundException('前端账号不存在')
    return this.prisma.user.update({
      where: { id },
      data: {
        disabled,
        disabledReason: disabled ? disabledReason || '已禁止登录，请联系管理员解除' : null
      },
      select: { id: true, account: true, username: true, disabled: true, disabledReason: true }
    })
  }

  async deleteFrontendUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.FRONTEND_USER, deletedAt: null }
    })
    if (!user) throw new NotFoundException('前端账号不存在')
    await this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        disabled: true,
        disabledReason: '账号已删除'
      }
    })
    return { ok: true }
  }

  async listSubAdmins() {
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.SUB_ADMIN, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        subAdminPerms: {
          include: {
            frontendUser: {
              select: { id: true, account: true, username: true, disabled: true }
            }
          }
        }
      }
    })
    return users.map((user) => ({
      id: user.id,
      account: user.account,
      username: user.username,
      disabled: user.disabled,
      password: this.safeDecrypt(user.passwordCipher),
      createdAt: user.createdAt,
      permissions: user.subAdminPerms.map((permission) => permission.frontendUser)
    }))
  }

  async createSubAdmin(currentUser: CurrentUser, payload: CreateSubAdminPayload) {
    if (!payload.account || !payload.username || !payload.password) throw new BadRequestException('账号、名称和密码不能为空')
    const exists = await this.prisma.user.findUnique({ where: { account: payload.account } })
    if (exists) throw new BadRequestException('账号已存在')
    const passwordHash = await this.passwords.hash(payload.password)
    const passwordCipher = this.passwords.encryptForDisplay(payload.password)
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          account: payload.account,
          username: payload.username,
          role: UserRole.SUB_ADMIN,
          passwordHash,
          passwordCipher
        }
      })
      await this.replaceSubAdminPermissions(tx, currentUser.id, created.id, payload.frontendUserIds || [])
      return this.subAdminDto(created.id, tx)
    })
  }

  async updateSubAdminPermissions(currentUser: CurrentUser, subAdminId: string, frontendUserIds: string[]) {
    const subAdmin = await this.prisma.user.findFirst({
      where: { id: subAdminId, role: UserRole.SUB_ADMIN, deletedAt: null }
    })
    if (!subAdmin) throw new NotFoundException('子账号不存在')
    return this.prisma.$transaction(async (tx) => {
      await this.replaceSubAdminPermissions(tx, currentUser.id, subAdminId, frontendUserIds)
      return this.subAdminDto(subAdminId, tx)
    })
  }

  private async replaceSubAdminPermissions(tx: Prisma.TransactionClient, createdById: string, subAdminId: string, frontendUserIds: string[]) {
    await tx.subAdminFrontendPermission.deleteMany({ where: { subAdminId } })
    const uniqueIds = Array.from(new Set(frontendUserIds.filter(Boolean)))
    if (!uniqueIds.length) return
    const frontendCount = await tx.user.count({
      where: { id: { in: uniqueIds }, role: UserRole.FRONTEND_USER, deletedAt: null }
    })
    if (frontendCount !== uniqueIds.length) throw new BadRequestException('包含无效的前端账号授权')
    await tx.subAdminFrontendPermission.createMany({
      data: uniqueIds.map((frontendUserId) => ({
        subAdminId,
        frontendUserId,
        createdById
      }))
    })
  }

  private async subAdminDto(subAdminId: string, tx: Prisma.TransactionClient | PrismaService) {
    const user = await tx.user.findUnique({
      where: { id: subAdminId },
      include: {
        subAdminPerms: {
          include: {
            frontendUser: {
              select: { id: true, account: true, username: true, disabled: true }
            }
          }
        }
      }
    })
    if (!user) throw new NotFoundException('子账号不存在')
    return {
      id: user.id,
      account: user.account,
      username: user.username,
      disabled: user.disabled,
      password: this.safeDecrypt(user.passwordCipher),
      createdAt: user.createdAt,
      permissions: user.subAdminPerms.map((permission) => permission.frontendUser)
    }
  }

  private safeDecrypt(value?: string | null) {
    try {
      return this.passwords.decryptForDisplay(value)
    } catch {
      return ''
    }
  }
}
