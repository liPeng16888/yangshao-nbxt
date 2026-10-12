import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserRole } from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { catalog, modelSchema, policySchema, validateRules, type Rule } from './ai.catalog'
import { encryptAiKey, validateEndpoint } from './ai.security'
import { z } from 'zod'

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}
  assertRoot(user: CurrentUser) {
    if (user.role !== UserRole.ROOT_ADMIN) throw new ForbiddenException('只有主管理员可以管理 AI 配置')
  }
  async settings(transaction?: Prisma.TransactionClient) {
    return await (transaction || this.prisma).aiSettings.findUnique({ where: { id: 'global' } }) || {
      id: 'global', enabled: false, revision: 1, dailyRequestLimit: 50, blockedFields: {}, updatedAt: new Date(0)
    }
  }
  async policy(actorId: string, transaction?: Prisma.TransactionClient) {
    const db = transaction || this.prisma
    const explicit = await db.aiPolicy.findUnique({ where: { subjectId: actorId } })
    if (explicit) return { enabled: explicit.enabled, rules: explicit.rules as unknown as Rule[] }
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { role: true } })
    if (actor?.role === UserRole.SUB_ADMIN || actor?.role === UserRole.FRONTEND_SUB_USER) return { enabled: false, rules: [] as Rule[] }
    const row = await db.aiPolicy.findUnique({ where: { subjectId: '*' } })
    return row ? { enabled: row.enabled, rules: row.rules as unknown as Rule[] } : { enabled: true, rules: [] as Rule[] }
  }
  safeModel(model: { apiKeyCipher: string; [key: string]: unknown }) {
    const { apiKeyCipher, ...safe } = model
    return { ...safe, hasApiKey: Boolean(apiKeyCipher) }
  }
  async getConfig(user: CurrentUser) {
    this.assertRoot(user)
    const [settings, models, policies, accounts] = await Promise.all([
      this.settings(), this.prisma.aiModel.findMany({ orderBy: { createdAt: 'asc' } }), this.prisma.aiPolicy.findMany(),
      this.prisma.user.findMany({ where: { disabled: false, deletedAt: null }, select: { id: true, account: true, username: true, role: true, parentFrontendUserId: true }, orderBy: { account: 'asc' } })
    ])
    return { settings, models: models.map(m => this.safeModel(m)), policies, accounts, catalog }
  }
  async saveSettings(user: CurrentUser, input: unknown) {
    this.assertRoot(user)
    const body = z.object({ enabled: z.boolean(), dailyRequestLimit: z.number().int().min(1).max(500), blockedFields: z.record(z.string(), z.array(z.string()).max(60)) }).strict().parse(input)
    for (const [resource, fields] of Object.entries(body.blockedFields)) {
      const entry = catalog.find(c => c.key === resource)
      if (!entry || fields.some(k => !entry.fields.some(f => f.key === k))) throw new BadRequestException('禁止字段配置无效')
    }
    return this.prisma.$transaction(async tx => {
      const result = await tx.aiSettings.upsert({ where: { id: 'global' }, create: { id: 'global', ...body, revision: 2 }, update: { ...body, revision: { increment: 1 } } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'SETTINGS_UPDATED' } })
      return result
    })
  }
  async savePolicy(user: CurrentUser, subjectId: string, input: unknown) {
    this.assertRoot(user)
    if (subjectId !== '*' && !await this.prisma.user.findFirst({ where: { id: subjectId, deletedAt: null } })) throw new NotFoundException('账号不存在')
    const body = policySchema.parse(input)
    const ownerIds = [...new Set(body.rules.flatMap(r => r.ownerIds || []))]
    if (ownerIds.length && await this.prisma.user.count({ where: { id: { in: ownerIds }, role: UserRole.FRONTEND_USER, disabled: false, deletedAt: null } }) !== ownerIds.length) throw new BadRequestException('请选择有效的前台主账号作为 AI 数据范围')
    try { validateRules(body.rules) } catch (error) { throw new BadRequestException((error as Error).message) }
    return this.prisma.$transaction(async tx => {
      const result = await tx.aiPolicy.upsert({ where: { subjectId }, create: { subjectId, ...body }, update: body })
      await this.bumpRevision(tx)
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'POLICY_UPDATED', detail: { subjectId } } })
      return result
    })
  }
  async saveModel(user: CurrentUser, id: string | undefined, input: unknown) {
    this.assertRoot(user)
    const body = modelSchema.parse(input)
    const previous = id ? await this.prisma.aiModel.findUnique({ where: { id } }) : null
    if (id && !previous) throw new NotFoundException('模型不存在')
    if (!body.apiKey?.trim() && !previous?.apiKeyCipher) throw new BadRequestException('请输入 API 密钥')
    if (body.allowedUserIds.length) {
      const count = await this.prisma.user.count({ where: { id: { in: [...new Set(body.allowedUserIds)] }, deletedAt: null } })
      if (count !== new Set(body.allowedUserIds).size) throw new BadRequestException('模型可用账号配置无效')
    }
    const baseUrl = await validateEndpoint(body.baseUrl)
    const { apiKey, ...rest } = body
    const apiKeyCipher = apiKey?.trim() ? encryptAiKey(apiKey.trim()) : previous!.apiKeyCipher
    const saved = await this.prisma.$transaction(async tx => {
      const row = id ? await tx.aiModel.update({ where: { id }, data: { ...rest, baseUrl, apiKeyCipher } }) : await tx.aiModel.create({ data: { ...rest, baseUrl, apiKeyCipher } })
      await this.bumpRevision(tx)
      await tx.aiAuditLog.create({ data: { actorId: user.id, modelId: row.id, action: 'MODEL_SAVED', detail: { name: row.name } } })
      return row
    })
    return this.safeModel(saved)
  }
  async removeModel(user: CurrentUser, id: string) {
    this.assertRoot(user)
    // Keep the identity for historical audit records; disabled models cannot be selected.
    await this.prisma.$transaction(async tx => {
      await tx.aiModel.update({ where: { id }, data: { enabled: false } })
      await this.bumpRevision(tx)
      await tx.aiAuditLog.create({ data: { actorId: user.id, modelId: id, action: 'MODEL_DISABLED' } })
    })
    return { ok: true }
  }
  async inheritPolicy(user: CurrentUser, subjectId: string) {
    this.assertRoot(user)
    if (subjectId === '*') throw new BadRequestException('不能删除默认权限')
    await this.prisma.$transaction(async tx => {
      await tx.aiPolicy.deleteMany({ where: { subjectId } })
      await this.bumpRevision(tx)
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'POLICY_INHERITED', detail: { subjectId } } })
    })
    return { ok: true }
  }
  async logs(user: CurrentUser, page = 1) {
    this.assertRoot(user)
    const offset = (Math.max(1, Math.min(Number(page) || 1, 10000)) - 1) * 50
    return this.prisma.aiAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50, skip: offset })
  }
  private async bumpRevision(tx: Prisma.TransactionClient) {
    await tx.aiSettings.upsert({ where: { id: 'global' }, create: { id: 'global', revision: 2 }, update: { revision: { increment: 1 } } })
  }
}
