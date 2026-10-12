import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type AiFeishuBinding, type AiFeishuSession } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { resolveCurrentUserIdentity, type CurrentUser } from '../../auth/current-user'
import { AuthService } from '../../auth/auth.service'
import { AiConfigService } from '../ai-config.service'
import { AiAccessService } from '../ai-access.service'
import { AiService } from '../ai.service'
import { decryptAiKey, encryptAiKey } from '../ai.security'
import { card, digest, feishuBot, markdown, minutes, opaque, siteUrl, type FeishuBot, type FeishuInput, type Outbound, type Peer, type Scope } from './feishu.types'
import type { AiChannelContext } from '../ai-channel'
import type { Grants } from '../ai.catalog'
import type { Preview } from '../ai-business.service'
import { MAX_AI_OWNERS, normalizedOwners } from '../ai-owner-scope'
import { feishuOwners } from './feishu-owner-scope'

const proofSchema = z.object({ proof: z.string().min(20).max(100) }).strict()
const configSchema = z.object({ appId: z.string().trim().max(100), appSecret: z.string().trim().max(500).optional(), publicSiteUrl: z.string().trim().max(300), enabled: z.boolean() }).strict()
type Db = PrismaService | Prisma.TransactionClient

@Injectable()
export class FeishuService {
  constructor(private readonly prisma: PrismaService, private readonly config: AiConfigService, private readonly access: AiAccessService, private readonly ai: AiService, private readonly auth: AuthService) {}
  async settings(bot: FeishuBot, db: Db = this.prisma) {
    feishuBot(bot)
    return await db.aiFeishuConfig.findUnique({ where: { id: bot } }) || { id: bot, appId: '', appSecretCipher: '', publicSiteUrl: '', enabled: false, revision: 1 }
  }
  private botFor(user: CurrentUser): FeishuBot { return this.access.isAdmin(user) ? 'admin' : 'frontend' }
  private assertAudience(bot: FeishuBot, user: CurrentUser) {
    if (this.botFor(user) !== bot) throw new ForbiddenException('前端机器人只能绑定前端账号，后台机器人只能绑定后台账号')
  }
  async getConfig(user: CurrentUser, bot: FeishuBot) {
    this.config.assertRoot(user)
    const c = await this.settings(bot)
    return { bot, appId: c.appId, publicSiteUrl: c.publicSiteUrl, enabled: c.enabled, hasSecret: !!c.appSecretCipher, revision: c.revision }
  }
  async saveConfig(user: CurrentUser, bot: FeishuBot, input: unknown) {
    this.config.assertRoot(user)
    feishuBot(bot)
    const b = configSchema.parse(input)
    const publicSiteUrl = b.publicSiteUrl ? siteUrl(b.publicSiteUrl) : ''
    await this.prisma.$transaction(async tx => {
      // Serialize App ID uniqueness checks; all other operations lock only their own bot.
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" IN ('frontend', 'admin') ORDER BY "id" FOR UPDATE`
      const old = await this.settings(bot, tx), other = await this.settings(bot === 'admin' ? 'frontend' : 'admin', tx)
      if (b.appId && b.appId === other.appId) throw new BadRequestException('两台机器人必须使用不同的 App ID，避免长连接争抢消息')
      const changedApp = old.appId !== b.appId
      const appSecretCipher = b.appSecret ? encryptAiKey(b.appSecret) : changedApp ? '' : old.appSecretCipher
      if (b.enabled && (!b.appId || !appSecretCipher || !publicSiteUrl)) throw new BadRequestException('启用前请填写 App ID、App Secret 和网站 HTTPS 地址')
      await tx.aiFeishuConfig.upsert({ where: { id: bot }, create: { id: bot, appId: b.appId, appSecretCipher, publicSiteUrl, enabled: b.enabled, revision: 2 }, update: { appId: b.appId, appSecretCipher, publicSiteUrl, enabled: b.enabled, revision: { increment: 1 } } })
      await tx.aiFeishuSession.updateMany({ where: { configId: bot }, data: { revision: { increment: 1 }, conversationId: null, grantsCipher: null, authorityHash: null, accessProofHash: null } })
      await tx.aiFeishuInvitation.updateMany({ where: { configId: bot, usedAt: null }, data: { usedAt: new Date() } })
      if (changedApp) await tx.aiFeishuBinding.updateMany({ where: { configId: bot }, data: { enabled: false, revokedAt: new Date(), revision: { increment: 1 } } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_CONFIG_SAVED', detail: { bot, appId: b.appId, enabled: b.enabled, changedApp } } })
    })
    return this.getConfig(user, bot)
  }
  private async currentUser(id: string, db: Db = this.prisma) {
    const row = await db.user.findUnique({ where: { id }, select: { permissionVersion: true } })
    if (!row) throw new ForbiddenException('网站账号已不存在')
    return resolveCurrentUserIdentity(db as PrismaService, id, row.permissionVersion)
  }
  private async eligible(userId: string, modelId: string) {
    const user = await this.currentUser(userId), boot = await this.ai.bootstrap(user)
    if (!boot.enabled || !boot.models.some(m => m.id === modelId && m.tools)) throw new BadRequestException('请先启用此账号的 AI，并选择已授权且支持业务工具的模型')
    return user
  }
  async invitations(user: CurrentUser, bot: FeishuBot, input: unknown) {
    this.config.assertRoot(user)
    const b = z.object({ userId: z.string().min(1), defaultModelId: z.string().min(1) }).strict().parse(input)
    const actor = await this.eligible(b.userId, b.defaultModelId)
    this.assertAudience(bot, actor)
    const c = await this.settings(bot)
    if (!c.enabled) throw new BadRequestException('请先启用飞书接入')
    const bound = await this.prisma.aiFeishuBinding.findUnique({ where: { userId: b.userId } })
    if (bound && !bound.revokedAt) throw new ConflictException('此网站账号已绑定，请先解绑再邀请')
    const code = opaque(), expiresAt = minutes(10)
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${bot} FOR SHARE`
      const latest = await this.settings(bot, tx)
      if (!latest.enabled || latest.revision !== c.revision || latest.appId !== c.appId) throw new ConflictException('机器人配置已变化，请重新生成邀请')
      await tx.aiFeishuInvitation.updateMany({ where: { userId: b.userId, usedAt: null }, data: { usedAt: new Date() } })
      await tx.aiFeishuInvitation.create({ data: { ...b, configId: bot, appId: c.appId, codeHash: digest(code), expiresAt } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_INVITED', detail: { bot, userId: b.userId } } })
    })
    return { command: `绑定 ${code}`, expiresAt }
  }
  async bindings(user: CurrentUser, bot: FeishuBot) {
    this.config.assertRoot(user)
    feishuBot(bot)
    const rows = await this.prisma.aiFeishuBinding.findMany({ where: { configId: bot }, orderBy: { updatedAt: 'desc' } })
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map(r => r.userId) } }, select: { id: true, account: true, username: true, role: true, disabled: true, deletedAt: true } })
    return rows.map(r => ({ ...r, user: users.find(u => u.id === r.userId) || null }))
  }
  async editBinding(user: CurrentUser, bot: FeishuBot, id: string, input: unknown) {
    this.config.assertRoot(user)
    const b = z.object({ enabled: z.boolean(), defaultModelId: z.string().min(1) }).strict().parse(input)
    const row = await this.prisma.aiFeishuBinding.findUnique({ where: { id } })
    if (!row || row.configId !== bot || row.revokedAt) throw new NotFoundException('绑定已解除或不属于此机器人，请重新邀请')
    if (b.enabled) this.assertAudience(bot, await this.eligible(row.userId, b.defaultModelId))
    await this.mutateBinding(user, bot, id, b, 'FEISHU_BINDING_UPDATED')
    return { ok: true }
  }
  async unbind(user: CurrentUser, bot: FeishuBot, id: string) {
    this.config.assertRoot(user)
    await this.mutateBinding(user, bot, id, { enabled: false, revokedAt: new Date() }, 'FEISHU_UNBOUND')
    return { ok: true }
  }
  private async mutateBinding(user: CurrentUser, bot: FeishuBot, id: string, data: Prisma.AiFeishuBindingUpdateInput, action: string) {
    feishuBot(bot)
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${bot} FOR SHARE`
      const row = await tx.aiFeishuBinding.findUnique({ where: { id } })
      if (!row || row.configId !== bot) throw new NotFoundException('绑定不属于此机器人')
      await tx.aiFeishuBinding.update({ where: { id }, data: { ...data, revision: { increment: 1 } } })
      await tx.aiFeishuSession.updateMany({ where: { bindingId: id }, data: { revision: { increment: 1 }, conversationId: null, authorityHash: null, grantsCipher: null, accessProofHash: null } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action, detail: { bot, bindingId: id } } })
    })
  }
  private async claim(peer: Peer, code: string): Promise<Outbound[]> {
    const proof = opaque()
    const invitation = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${peer.configId} FOR SHARE`
      const c = await this.settings(peer.configId, tx)
      if (!c.enabled || c.appId !== peer.appId) throw new ForbiddenException('飞书接入已停用')
      const i = await tx.aiFeishuInvitation.findUnique({ where: { codeHash: digest(code) } })
      if (!i || i.configId !== peer.configId || i.appId !== peer.appId || i.usedAt || i.claimedAt || i.expiresAt <= new Date()) throw new BadRequestException('绑定指令不属于此机器人、已失效或已被领取，请联系管理员重新生成')
      this.assertAudience(peer.configId, await this.currentUser(i.userId, tx))
      const changed = await tx.aiFeishuInvitation.updateMany({ where: { id: i.id, claimedAt: null, usedAt: null }, data: { claimedAt: new Date(), proofHash: digest(proof), tenantKey: peer.tenantKey, openId: peer.openId, chatId: peer.chatId } })
      if (!changed.count) throw new ConflictException('绑定指令已被领取')
      return i
    })
    const user = await this.currentUser(invitation.userId), c = await this.settings(peer.configId)
    const path = this.access.isAdmin(user) ? '/admin/ai/feishu/bind' : '/ai/feishu/bind'
    return [{ type: 'text', content: `请登录指定的网站账号确认绑定（10 分钟内）：\n${c.publicSiteUrl}${path}#proof=${proof}\n请从当前机器人私聊打开此链接。` }]
  }
  private async invitation(user: CurrentUser, input: unknown, db: Db = this.prisma) {
    const { proof } = proofSchema.parse(input), bot = this.botFor(user), c = await this.settings(bot, db)
    const i = await db.aiFeishuInvitation.findUnique({ where: { proofHash: digest(proof) } })
    if (!c.enabled || !i || i.configId !== bot || i.appId !== c.appId || i.usedAt || !i.openId || !i.tenantKey || !i.chatId || i.expiresAt <= new Date()) throw new BadRequestException('绑定链接已失效或不属于当前前后台身份，请重新邀请')
    if (i.userId !== user.id) throw new ForbiddenException('请登录管理员指定的网站账号确认绑定')
    return i
  }
  async resolveBinding(user: CurrentUser, input: unknown) {
    const i = await this.invitation(user, input)
    const model = await this.prisma.aiModel.findUnique({ where: { id: i.defaultModelId }, select: { name: true } })
    return { account: user.account, username: user.username, role: user.role, feishuUser: i.openId, model: model?.name || '模型已失效', expiresAt: i.expiresAt }
  }
  async confirmBinding(user: CurrentUser, input: unknown) {
    const invitation = await this.invitation(user, input)
    const actor = await this.eligible(user.id, invitation.defaultModelId)
    const binding = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${invitation.configId} FOR SHARE`
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR SHARE`
      const verified = await this.currentUser(user.id, tx)
      if (verified.permissionVersion !== user.permissionVersion || verified.role !== actor.role || verified.dataOwnerId !== actor.dataOwnerId) throw new ConflictException('网站账号身份已变化，请重新登录后绑定')
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuInvitation" WHERE "id" = ${invitation.id} FOR UPDATE`
      const i = await this.invitation(user, input, tx)
      this.assertAudience(feishuBot(i.configId), verified)
      const existing = await tx.aiFeishuBinding.findUnique({ where: { userId: user.id } })
      if (existing && !existing.revokedAt) throw new ConflictException('此网站账号已绑定，请联系管理员核对')
      const data = { configId: i.configId, userId: user.id, appId: i.appId, tenantKey: i.tenantKey!, openId: i.openId!, chatId: i.chatId!, defaultModelId: i.defaultModelId, roleSnapshot: actor.role, ownerSnapshot: actor.dataOwnerId, enabled: true, revokedAt: null }
      const b = await tx.aiFeishuBinding.upsert({ where: { userId: user.id }, create: data, update: { ...data, revision: { increment: 1 } } })
      await tx.aiFeishuInvitation.update({ where: { id: i.id }, data: { usedAt: new Date(), proofHash: null } })
      const key: Peer = { configId: feishuBot(i.configId), appId: i.appId, tenantKey: i.tenantKey!, openId: i.openId!, chatId: i.chatId! }
      const session = await tx.aiFeishuSession.upsert({ where: { configId_appId_tenantKey_openId_chatId: key }, create: key, update: {} })
      if (!session.bindingId) await tx.aiFeishuSession.update({ where: { id: session.id }, data: { bindingId: b.id, ownerId: this.access.isAdmin(actor) ? null : actor.dataOwnerId, ownerIds: this.access.isAdmin(actor) ? [] : [actor.dataOwnerId], revision: { increment: 1 } } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_BOUND', detail: { bot: i.configId, bindingId: b.id, openId: i.openId } } })
      await this.notice(tx, key, `网站账号 ${user.username}（${user.account}）绑定成功。发送“状态”查看当前身份，发送“切换身份”选择账号。`)
      return b
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return { ok: true, bindingId: binding.id }
  }
  private async notice(db: Db, peer: Peer, content: string) {
    const c = await this.settings(peer.configId, db)
    await db.aiFeishuEvent.create({ data: { ...peer, configRevision: c.revision, eventKey: `notice:${opaque()}`, inputCipher: encryptAiKey('{}'), outputCipher: encryptAiKey(JSON.stringify([{ type: 'text', content }])), status: 'READY' } })
  }
  async session(peer: Peer) {
    return this.prisma.aiFeishuSession.upsert({ where: { configId_appId_tenantKey_openId_chatId: peer }, create: peer, update: {} })
  }
  private async binding(session: AiFeishuSession, db: Db = this.prisma) {
    const b = session.bindingId ? await db.aiFeishuBinding.findUnique({ where: { id: session.bindingId } }) : null
    if (!b?.enabled || b.revokedAt || b.configId !== session.configId || b.appId !== session.appId || b.tenantKey !== session.tenantKey || b.openId !== session.openId || b.chatId !== session.chatId) throw new ForbiddenException('当前身份未绑定或已停用，请联系管理员或发送“切换身份”')
    const user = await this.currentUser(b.userId, db)
    this.assertAudience(feishuBot(session.configId), user)
    if (user.role !== b.roleSnapshot || user.dataOwnerId !== b.ownerSnapshot) throw new ForbiddenException('网站账号归属已变化，请管理员重新绑定')
    return { b, user }
  }
  private grants(s: AiFeishuSession): Grants { return s.grantsCipher ? JSON.parse(decryptAiKey(s.grantsCipher)) as Grants : {} }
  private selectedOwners(s: AiFeishuSession, user: CurrentUser) { return feishuOwners(s, this.access.isAdmin(user) ? undefined : user.dataOwnerId) }
  private async hash(s: AiFeishuSession, b: AiFeishuBinding, user: CurrentUser, db: Db = this.prisma) {
    const settings = await this.config.settings(db as Prisma.TransactionClient)
    return digest(JSON.stringify({ settings: settings.revision, model: b.defaultModelId, authorization: await this.access.ownersAuthorizationHash(user, this.selectedOwners(s, user), this.grants(s), db as Prisma.TransactionClient) }))
  }
  private async context(s: AiFeishuSession) {
    const { b, user } = await this.binding(s)
    await this.eligible(b.userId, b.defaultModelId)
    const selected = this.selectedOwners(s, user)
    if (!selected.length) throw new BadRequestException('请先选择数据账号')
    const ownerIds = await this.access.owners(user, selected), ownerId = ownerIds[0]
    let hash = await this.hash(s, b, user)
    if (s.authorityHash && s.authorityHash !== hash) {
      s = await this.reset(s.id, { ownerId, ownerIds })
      hash = await this.hash(s, b, user)
    }
    if (!s.authorityHash) s = await this.prisma.aiFeishuSession.update({ where: { id: s.id }, data: { authorityHash: hash } })
    const bot = feishuBot(s.configId), c = await this.settings(bot)
    const scope: Scope = { configId: bot, sessionId: s.id, revision: s.revision, bindingId: b.id, bindingRevision: b.revision, configRevision: c.revision, hash }
    const channel: AiChannelContext = { assertCurrent: tx => this.assertScope(scope, tx), selectedOwnerIds: Object.freeze([...ownerIds]), audit: { source: 'FEISHU', bindingId: b.id, sessionId: s.id, openId: s.openId, appId: s.appId, ownerIds } }
    return { s, b, user, ownerId, ownerIds, scope, channel, grants: this.grants(s) }
  }
  async assertScope(scope: Scope, transaction?: Prisma.TransactionClient) {
    const db = transaction || this.prisma
    if (transaction) {
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${scope.configId} FOR SHARE`
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuBinding" WHERE "id" = ${scope.bindingId} FOR SHARE`
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuSession" WHERE "id" = ${scope.sessionId} FOR SHARE`
    }
    const c = await this.settings(scope.configId, db), s = await db.aiFeishuSession.findUnique({ where: { id: scope.sessionId } })
    if (!c.enabled || c.revision !== scope.configRevision || !s || s.configId !== scope.configId || s.revision !== scope.revision || s.bindingId !== scope.bindingId || s.appId !== c.appId) throw new ConflictException('飞书身份或会话已变化，旧卡片已失效')
    const { b, user } = await this.binding(s, db)
    const ownerIds = this.selectedOwners(s, user)
    if (!ownerIds.length) throw new ConflictException('数据账号范围已清空，请重新选择')
    await this.access.owners(user, ownerIds, transaction)
    if (b.revision !== scope.bindingRevision || await this.hash(s, b, user, db) !== scope.hash) throw new ConflictException('账号权限或访问授权已变化，请新建对话')
    const model = await db.aiModel.findUnique({ where: { id: b.defaultModelId } }), policy = await this.config.policy(user.id, transaction)
    if (!policy.enabled || !(await this.config.settings(transaction)).enabled || !model?.enabled || !(model.allowedUserIds as string[]).includes(user.id) && (model.allowedUserIds as string[]).length) throw new ForbiddenException('当前账号的 AI 或模型授权已停用')
  }
  private reset(id: string, data: Prisma.AiFeishuSessionUpdateInput = {}, db: Db = this.prisma) {
    return db.aiFeishuSession.update({ where: { id }, data: { ...data, conversationId: null, authorityHash: null, grantsCipher: null, accessProofHash: null, accessProofExpiresAt: null, revision: { increment: 1 } } })
  }
  private async selectOwners(s: AiFeishuSession, requested: string[], expectedRevision?: number) {
    const { b, user } = await this.binding(s)
    if (!this.access.isAdmin(user)) throw new ForbiddenException('前端机器人不能跨账号选择数据')
    const ids = requested.length ? normalizedOwners(requested) : []
    const bot = feishuBot(s.configId), expected = expectedRevision ?? (await this.settings(bot)).revision
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = ${bot} FOR SHARE`
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuBinding" WHERE "id" = ${b.id} FOR SHARE`
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuSession" WHERE "id" = ${s.id} FOR UPDATE`
      const c = await this.settings(bot, tx), latest = await tx.aiFeishuSession.findUnique({ where: { id: s.id } })
      if (!c.enabled || c.appId !== s.appId || c.revision !== expected || !latest || latest.revision !== s.revision || latest.bindingId !== s.bindingId) throw new ConflictException('机器人或会话已变化，请重新选择账号')
      const current = await this.binding(latest, tx)
      if (current.b.revision !== b.revision || !this.access.isAdmin(current.user)) throw new ForbiddenException('身份或绑定已变化，请重新选择')
      if (ids.length) await this.access.owners(current.user, ids, tx)
      const updated = await this.reset(s.id, { ownerId: ids[0] || null, ownerIds: ids }, tx)
      await tx.aiAuditLog.create({ data: { actorId: current.user.id, action: 'FEISHU_OWNER_SCOPE_UPDATED', detail: { bot, bindingId: b.id, sessionId: s.id, ownerIds: ids, readOnly: ids.length > 1 } } })
      return updated
    })
  }
  private async action(s: AiFeishuSession, kind: string, targetId?: string) {
    const token = opaque(), c = await this.settings(feishuBot(s.configId)), b = s.bindingId ? await this.prisma.aiFeishuBinding.findUnique({ where: { id: s.bindingId } }) : null
    await this.prisma.aiFeishuAction.create({ data: { tokenHash: digest(token), sessionId: s.id, sessionRevision: s.revision, bindingId: s.bindingId, bindingRevision: b?.revision, configRevision: c.revision, kind, targetId, expiresAt: minutes(15) } })
    return token
  }
  private async menu(s: AiFeishuSession, kind: 'identity' | 'owner', offset = 0): Promise<Outbound[]> {
    let rows: { id: string; label: string }[]
    if (kind === 'identity') {
      const bindings = await this.prisma.aiFeishuBinding.findMany({ where: { configId: s.configId, appId: s.appId, tenantKey: s.tenantKey, openId: s.openId, chatId: s.chatId, enabled: true, revokedAt: null }, orderBy: { createdAt: 'asc' } })
      const users = await this.prisma.user.findMany({ where: { id: { in: bindings.map(b => b.userId) }, disabled: false, deletedAt: null }, select: { id: true, username: true, account: true, role: true } })
      rows = bindings.flatMap(b => { const u = users.find(u => u.id === b.userId); return u && (u.role.includes('ADMIN') ? 'admin' : 'frontend') === s.configId ? [{ id: b.id, label: `${u.username}（${u.account} · ${u.role.includes('ADMIN') ? '后台' : '前台'}）` }] : [] })
    } else {
      const { user } = await this.binding(s)
      rows = (await this.ai.bootstrap(user)).owners.map(u => ({ id: u.id, label: `${u.username}（${u.account}）` }))
    }
    if (!rows.length) return [{ type: 'text', content: kind === 'identity' ? '尚无可用绑定，请联系管理员生成绑定指令。' : '当前账号没有可访问的数据账号，请联系管理员授权。' }]
    const buttons = await Promise.all(rows.slice(offset, offset + 12).map(async r => ({ label: r.label, token: await this.action(s, kind, r.id) })))
    if (offset > 0) buttons.push({ label: '上一页', token: await this.action(s, `${kind}-page`, String(Math.max(0, offset - 12))) })
    if (rows.length > offset + 12) buttons.push({ label: '下一页', token: await this.action(s, `${kind}-page`, String(offset + 12)) })
    if (kind === 'owner') buttons.push({ label: '多账号查询（可全选）', token: await this.action(s, 'owner-multi-menu') })
    return [card(kind === 'identity' ? '选择网站身份' : '选择数据账号', '切换后创建新会话，旧写入确认卡片失效。', buttons)]
  }
  private async multiMenu(s: AiFeishuSession, offset = 0): Promise<Outbound[]> {
    const { user } = await this.binding(s)
    if (!this.access.isAdmin(user)) throw new ForbiddenException('前端机器人不支持多账号读取')
    const rows = (await this.ai.bootstrap(user)).owners, selected = this.selectedOwners(s, user)
    if (!rows.length) return [{ type: 'text', content: '当前没有可读取的授权数据账号，请联系管理员。' }]
    const invalid = selected.some(id => !rows.some(row => row.id === id))
    const buttons = await Promise.all(rows.slice(offset, offset + 12).map(async row => ({ label: `${selected.includes(row.id) ? '☑' : '☐'} ${row.username}（${row.account}）`, token: await this.action(s, 'owner-toggle', JSON.stringify({ id: row.id, offset })) })))
    if (offset > 0) buttons.push({ label: '上一页', token: await this.action(s, 'owner-multi-page', String(Math.max(0, offset - 12))) })
    if (rows.length > offset + 12) buttons.push({ label: '下一页', token: await this.action(s, 'owner-multi-page', String(offset + 12)) })
    if (rows.length <= MAX_AI_OWNERS) buttons.push({ label: `全选授权账号（${rows.length} 个）`, token: await this.action(s, 'owner-all', JSON.stringify(rows.map(row => row.id))) })
    buttons.push({ label: '清空选择', token: await this.action(s, 'owner-clear') }, { label: '完成选择', token: await this.action(s, 'owner-finish') })
    return [card('选择读取账号（可多选）', `当前已选 ${selected.length} 个账号；最多 ${MAX_AI_OWNERS} 个。\n点击账号即可选中或取消，每次更新会发送新卡片，请继续操作最新卡片。切换范围会清空对话并使旧确认卡片失效。多账号只读；写入请发送“切换账号”选择一个账号。${invalid ? '\n原范围中有账号已失去授权，请先清空或重新全选。' : ''}${rows.length > MAX_AI_OWNERS ? '\n授权账号超过上限，请分批选择；不会自动截取前 20 个充当全部账号。' : ''}`, buttons)]
  }
  private async allOwners(s: AiFeishuSession) {
    const { user } = await this.binding(s)
    if (!this.access.isAdmin(user)) throw new ForbiddenException('前端机器人不支持多账号读取')
    const rows = (await this.ai.bootstrap(user)).owners
    if (!rows.length) throw new BadRequestException('当前没有可读取的授权数据账号')
    if (rows.length > MAX_AI_OWNERS) throw new BadRequestException(`当前有 ${rows.length} 个授权账号，超过 ${MAX_AI_OWNERS} 个上限，请发送“多账号查询”分批选择；未改变原读取范围`)
    return this.selectOwners(s, rows.map(row => row.id))
  }
  private async selectionStatus(s: AiFeishuSession): Promise<Outbound[]> {
    const ctx = await this.context(s)
    return [{ type: 'text', content: await this.title(ctx.user, ctx.ownerIds, ctx.b.defaultModelId) + '\n已选择读取范围并创建新会话，请发送查询需求。', scope: ctx.scope }]
  }
  private async accessLink(s: AiFeishuSession): Promise<Outbound[]> {
    const { user } = await this.binding(s)
    if (this.access.isAdmin(user)) return [{ type: 'text', content: '后台身份按已授权的数据账号访问，无需前台访问密码。' }]
    const proof = opaque(), c = await this.settings(feishuBot(s.configId))
    await this.prisma.aiFeishuSession.update({ where: { id: s.id }, data: { accessProofHash: digest(proof), accessProofExpiresAt: minutes(10) } })
    return [{ type: 'text', content: `请登录当前网站账号验证访问密码，验证后返回飞书重新发送请求：\n${c.publicSiteUrl}/ai/feishu/access#proof=${proof}\n密码只能在网站验证页面输入。` }]
  }
  private async accessSession(user: CurrentUser, proof: string) {
    const s = await this.prisma.aiFeishuSession.findUnique({ where: { accessProofHash: digest(proof) } }), bot = this.botFor(user), c = await this.settings(bot)
    if (!s || s.configId !== bot || !c.enabled || s.appId !== c.appId || !s.accessProofExpiresAt || s.accessProofExpiresAt <= new Date()) throw new BadRequestException('验证链接已失效，请在飞书重新发送“访问验证”')
    const { b, user: current } = await this.binding(s)
    if (b.userId !== user.id || current.permissionVersion !== user.permissionVersion) throw new ForbiddenException('请登录当前飞书身份对应的网站账号')
    return s
  }
  async resolveAccess(user: CurrentUser, input: unknown) {
    const { proof } = proofSchema.parse(input), s = await this.accessSession(user, proof)
    const groups = await this.prisma.accessGuardGroup.findMany({ where: { frontendUserId: user.dataOwnerId, enabled: true }, select: { id: true, name: true, ttlMinutes: true, features: { select: { feature: true } } } })
    return { account: user.account, username: user.username, sessionId: s.id, groups: groups.map(g => ({ ...g, features: g.features.map(f => f.feature) })) }
  }
  async confirmAccess(user: CurrentUser, input: unknown) {
    const b = z.object({ proof: z.string().min(20).max(100), groupId: z.string().min(1), password: z.string().min(1).max(200) }).strict().parse(input)
    const s = await this.accessSession(user, b.proof)
    const grant = await this.auth.verifyAccessGuardGroup(user, b.groupId, b.password)
    const grants = { ...this.grants(s), ...Object.fromEntries(grant.features.map(f => [f, grant.token])) }
    // CAS prevents a verification racing with an identity switch from carrying a grant across identities.
    const changed = await this.prisma.aiFeishuSession.updateMany({ where: { id: s.id, revision: s.revision, bindingId: s.bindingId, accessProofHash: digest(b.proof) }, data: { grantsCipher: encryptAiKey(JSON.stringify(grants)), conversationId: null, authorityHash: null, revision: { increment: 1 } } })
    if (!changed.count) throw new ConflictException('身份已切换，请重新验证')
    await this.prisma.aiAuditLog.create({ data: { actorId: user.id, ownerId: user.dataOwnerId, action: 'FEISHU_ACCESS_VERIFIED', detail: { sessionId: s.id, features: grant.features } } })
    return { ok: true, expiresAt: grant.expiresAt, features: grant.features }
  }
  private async title(user: CurrentUser, ownerIds: string[], modelId: string) {
    const owners = await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, username: true, account: true } }), model = await this.prisma.aiModel.findUnique({ where: { id: modelId }, select: { name: true } })
    const names = ownerIds.map(id => { const owner = owners.find(row => row.id === id); return ownerIds.length > 1 ? owner?.username : `${owner?.username}（${owner?.account}）` })
    return `身份：${user.username}（${user.account} · ${this.access.isAdmin(user) ? '后台' : user.isFrontendSubAccount ? '前台子账号' : '前台主账号'}）\n数据账号${ownerIds.length > 1 ? `（已选 ${ownerIds.length} 个）` : ''}：${names.join('、')}\n模型：${model?.name}\n${ownerIds.length > 1 ? '多账号只读：明细标明所属账号，统计区分各账号及合计；写入请切换为单账号。\n' : ''}`
  }
  async handle(peer: Peer, input: FeishuInput, image?: () => Promise<{ bytes: Buffer; mime: string }>): Promise<Outbound[]> {
    const c = await this.settings(peer.configId)
    if (!c.enabled || c.appId !== peer.appId) throw new ForbiddenException('飞书接入已停用')
    let s = await this.session(peer)
    if (input.kind === 'card') return this.click(s, input.actionToken || '')
    const text = (input.text || '').trim()
    const binding = /^绑定\s+([A-Za-z0-9_-]{20,100})$/.exec(text)
    if (binding) return this.claim(peer, binding[1])
    if (text === '切换身份') return this.menu(s, 'identity')
    if (text === '帮助' || text === '绑定') return [{ type: 'text', content: '请让主管理员在“AI API 配置 → 飞书接入”生成绑定指令。绑定后可私聊查询或发送图片；写入须核对卡片并确认。命令：状态、切换身份、切换账号、多账号查询、全选账号、新建对话、访问验证。后台可选择最多20个授权账号进行只读查询；修改或录入请切换为单账号。请勿在聊天中发送访问密码。' }]
    if (!s.bindingId) return this.menu(s, 'identity')
    const { b, user } = await this.binding(s)
    if ((text === '切换账号' || text === '单账号查询') && this.access.isAdmin(user)) return this.menu(s, 'owner')
    if (text === '多账号查询' || text === '选择多个账号') return this.multiMenu(s)
    if (text === '全选账号' || text === '全部账号') return this.selectionStatus(await this.allOwners(s))
    if (text === '新建对话') { s = await this.reset(s.id); return [{ type: 'text', content: '已新建对话，旧确认卡片及访问授权失效。' }] }
    if (text === '访问验证') return this.accessLink(s)
    if (this.access.isAdmin(user) && !this.selectedOwners(s, user).length) return this.menu(s, 'owner')
    const ctx = await this.context(s)
    const title = await this.title(user, ctx.ownerIds, b.defaultModelId)
    if (text === '状态') return [{ type: 'text', content: title }]
    let attachmentIds: string[] = []
    if (input.imageKey) {
      const model = await this.prisma.aiModel.findUnique({ where: { id: b.defaultModelId } })
      if (!model?.vision) throw new BadRequestException('后台为此绑定指定的模型不支持图片，请联系管理员调整默认模型')
      if (!image) throw new BadRequestException('图片资源不可用')
      const file = await image(), attachment = await this.ai.attachment(user, file.bytes, file.mime)
      attachmentIds = [attachment.id]
    }
    if (!text && !attachmentIds.length) throw new BadRequestException('首期支持文字和 JPG、PNG、WebP 图片消息')
    ctx.channel.audit = { ...ctx.channel.audit, messageId: input.messageId || '' }
    const response = await this.ai.chat(user, { modelId: b.defaultModelId, ownerIds: ctx.ownerIds, conversationId: ctx.s.conversationId || undefined, text, attachmentIds, grants: ctx.grants }, ctx.channel)
    await this.assertScope(ctx.scope)
    await this.prisma.aiFeishuSession.updateMany({ where: { id: ctx.s.id, revision: ctx.s.revision }, data: { conversationId: response.conversationId } })
    const outputs: Outbound[] = [{ type: 'text', content: title + '\n' + response.answer, scope: ctx.scope }]
    for (const p of response.proposals.filter(p => p.status === 'PENDING' && new Date(p.expiresAt) > new Date())) {
      const preview = p.preview as unknown as Preview
      const content = `${markdown(title)}\n${markdown(preview.account)}\n${markdown(preview.location)}\n\n${preview.fields.map(f => `**${markdown(f.label)}**：${markdown(f.before)} → ${markdown(f.after)}`).join('\n\n')}\n\n${preview.warnings.map(markdown).join('\n')}`
      if (content.length > 20000) { outputs.push({ type: 'text', content: '草稿内容较长，请缩小修改范围后重新生成；当前未执行写入。', scope: ctx.scope }); continue }
      outputs.push({ ...card(preview.title, content, [{ label: '确认写入', token: await this.action(ctx.s, 'confirm', p.id) }, { label: '取消', token: await this.action(ctx.s, 'reject', p.id) }]), scope: ctx.scope })
    }
    // Tools can report an access failure without throwing out of the model turn.
    if (!this.access.isAdmin(user) && user.requiresAccessGuardPassword) {
      const protectedGroups = await this.prisma.accessGuardGroupFeature.findMany({ where: { frontendUserId: user.dataOwnerId, group: { enabled: true } }, select: { feature: true } })
      if ((await Promise.all(protectedGroups.map(g => this.auth.hasAccessGrant(user, ctx.grants[g.feature], g.feature)))).some(v => !v)) outputs.push(...await this.accessLink(ctx.s))
    }
    return outputs
  }
  private async click(s: AiFeishuSession, token: string): Promise<Outbound[]> {
    const a = await this.prisma.aiFeishuAction.findUnique({ where: { tokenHash: digest(token) } }), c = await this.settings(feishuBot(s.configId))
    if (!a || a.sessionId !== s.id || a.sessionRevision !== s.revision || a.configRevision !== c.revision || a.expiresAt <= new Date()) throw new ForbiddenException('卡片已失效或不属于当前使用者，请重新发送请求')
    if (a.bindingId) { const b = await this.prisma.aiFeishuBinding.findUnique({ where: { id: a.bindingId } }); if (!b || b.revision !== a.bindingRevision) throw new ConflictException('绑定已变化，请重新发送请求') }
    if (a.kind === 'identity-page' || a.kind === 'owner-page') return this.menu(s, a.kind === 'identity-page' ? 'identity' : 'owner', Number(a.targetId) || 0)
    if (a.kind === 'owner-multi-menu' || a.kind === 'owner-multi-page') return this.multiMenu(s, Number(a.targetId) || 0)
    if (a.kind === 'owner-finish') return this.selectionStatus(s)
    if (a.kind === 'owner-clear') return this.multiMenu(await this.selectOwners(s, [], c.revision))
    if (a.kind === 'owner-all') {
      let ids: string[]
      try { ids = normalizedOwners(JSON.parse(a.targetId || 'null')) } catch { throw new BadRequestException('账号选择卡片无效，请重新发送“多账号查询”') }
      return this.selectionStatus(await this.selectOwners(s, ids, c.revision))
    }
    if (a.kind === 'owner-toggle') {
      const target = z.object({ id: z.string().min(1).max(100), offset: z.number().int().min(0) }).parse(JSON.parse(a.targetId || '{}'))
      const { user } = await this.binding(s), selected = this.selectedOwners(s, user)
      const ids = selected.includes(target.id) ? selected.filter(id => id !== target.id) : [...selected, target.id]
      return this.multiMenu(await this.selectOwners(s, ids, c.revision), target.offset)
    }
    if (a.kind === 'identity') {
      const b = await this.prisma.aiFeishuBinding.findUnique({ where: { id: a.targetId! } })
      if (!b?.enabled || b.revokedAt || b.configId !== s.configId || b.appId !== s.appId || b.tenantKey !== s.tenantKey || b.openId !== s.openId || b.chatId !== s.chatId) throw new ForbiddenException('无权切换到此身份')
      const user = await this.eligible(b.userId, b.defaultModelId)
      this.assertAudience(feishuBot(s.configId), user)
      s = await this.reset(s.id, { bindingId: b.id, ownerId: this.access.isAdmin(user) ? null : user.dataOwnerId, ownerIds: this.access.isAdmin(user) ? [] : [user.dataOwnerId] })
      return this.access.isAdmin(user) ? this.menu(s, 'owner') : [{ type: 'text', content: await this.title(user, [user.dataOwnerId], b.defaultModelId) + '\n已创建新会话。' }]
    }
    if (a.kind === 'owner') {
      const { b, user } = await this.binding(s)
      if (!this.access.isAdmin(user)) throw new ForbiddenException('此身份不能选择其他数据账号')
      s = await this.selectOwners(s, [a.targetId!], c.revision)
      return this.selectionStatus(s)
    }
    if (a.kind !== 'confirm' && a.kind !== 'reject') throw new BadRequestException('不支持的卡片操作')
    const ctx = await this.context(s)
    if (ctx.ownerIds.length > 1) throw new ForbiddenException('多账号只允许读取，请切换为一个账号并重新生成写入草稿')
    // context() may have reset after an authorization change; never carry an old action forward.
    if (ctx.s.revision !== a.sessionRevision) throw new ConflictException('权限已变化，旧草稿卡片已失效')
    const proposal = await this.prisma.aiProposal.findFirst({ where: { id: a.targetId!, conversationId: ctx.s.conversationId || '', actorId: ctx.user.id, ownerId: ctx.ownerId } })
    if (!proposal) throw new ForbiddenException('草稿不属于当前身份或会话')
    const result = await this.ai.confirm(ctx.user, proposal.id, { decision: a.kind, grants: ctx.grants }, ctx.channel)
    return [{ type: 'text', content: (await this.title(ctx.user, ctx.ownerIds, ctx.b.defaultModelId)) + `\n草稿状态：${result.status === 'APPLIED' ? '已确认写入' : result.status === 'REJECTED' ? '已取消' : result.status}。`, scope: ctx.scope }]
  }
}
