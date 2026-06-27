import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { UserRole } from '@prisma/client'
import jwt from 'jsonwebtoken'
import { PrismaService } from '../prisma/prisma.service'
import { PasswordService } from './password.service'
import { LoginDto, RegisterDto } from './dto'

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

  sign(userId: string) {
    return jwt.sign({ sub: userId }, this.config.get<string>('JWT_SECRET') || 'dev-secret', { expiresIn: '7d' })
  }
}
