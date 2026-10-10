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
import { card, digest, markdown, minutes, opaque, siteUrl, type FeishuInput, type Outbound, type Peer, type Scope } from './feishu.types'
import type { AiChannelContext } from '../ai-channel'
import type { Grants } from '../ai.catalog'
import type { Preview } from '../ai-business.service'

const proofSchema = z.object({ proof: z.string().min(20).max(100) }).strict()
const configSchema = z.object({ appId: z.string().trim().max(100), appSecret: z.string().trim().max(500).optional(), publicSiteUrl: z.string().trim().max(300), enabled: z.boolean() }).strict()
type Db = PrismaService | Prisma.TransactionClient

@Injectable()
export class FeishuService {
  constructor(private readonly prisma: PrismaService, private readonly config: AiConfigService, private readonly access: AiAccessService, private readonly ai: AiService, private readonly auth: AuthService) {}
  async settings(db: Db = this.prisma) {
    return await db.aiFeishuConfig.findUnique({ where: { id: 'global' } }) || { id: 'global', appId: '', appSecretCipher: '', publicSiteUrl: '', enabled: false, revision: 1 }
  }
  async getConfig(user: CurrentUser) {
    this.config.assertRoot(user)
    const c = await this.settings()
    return { appId: c.appId, publicSiteUrl: c.publicSiteUrl, enabled: c.enabled, hasSecret: !!c.appSecretCipher, revision: c.revision }
  }
  async saveConfig(user: CurrentUser, input: unknown) {
    this.config.assertRoot(user)
    const b = configSchema.parse(input), old = await this.settings()
    const publicSiteUrl = b.publicSiteUrl ? siteUrl(b.publicSiteUrl) : ''
    const changedApp = old.appId !== b.appId
    const appSecretCipher = b.appSecret ? encryptAiKey(b.appSecret) : changedApp ? '' : old.appSecretCipher
    if (b.enabled && (!b.appId || !appSecretCipher || !publicSiteUrl)) throw new BadRequestException('启用前请填写 App ID、App Secret 和网站 HTTPS 地址')
    await this.prisma.$transaction(async tx => {
      // Shares the same lock order as confirmation and invitation consumption.
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = 'global' FOR UPDATE`
      await tx.aiFeishuConfig.upsert({ where: { id: 'global' }, create: { id: 'global', appId: b.appId, appSecretCipher, publicSiteUrl, enabled: b.enabled, revision: 2 }, update: { appId: b.appId, appSecretCipher, publicSiteUrl, enabled: b.enabled, revision: { increment: 1 } } })
      await tx.aiFeishuSession.updateMany({ data: { revision: { increment: 1 }, conversationId: null, grantsCipher: null, authorityHash: null, accessProofHash: null } })
      await tx.aiFeishuInvitation.updateMany({ where: { usedAt: null }, data: { usedAt: new Date() } })
      if (changedApp) await tx.aiFeishuBinding.updateMany({ data: { enabled: false, revokedAt: new Date(), revision: { increment: 1 } } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_CONFIG_SAVED', detail: { appId: b.appId, enabled: b.enabled, changedApp } } })
    })
    return this.getConfig(user)
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
  async invitations(user: CurrentUser, input: unknown) {
    this.config.assertRoot(user)
    const b = z.object({ userId: z.string().min(1), defaultModelId: z.string().min(1) }).strict().parse(input)
    await this.eligible(b.userId, b.defaultModelId)
    const c = await this.settings()
    if (!c.enabled) throw new BadRequestException('请先启用飞书接入')
    const bound = await this.prisma.aiFeishuBinding.findUnique({ where: { userId: b.userId } })
    if (bound && !bound.revokedAt) throw new ConflictException('此网站账号已绑定，请先解绑再邀请')
    const code = opaque(), expiresAt = minutes(10)
    await this.prisma.$transaction(async tx => {
      await tx.aiFeishuInvitation.updateMany({ where: { userId: b.userId, usedAt: null }, data: { usedAt: new Date() } })
      await tx.aiFeishuInvitation.create({ data: { ...b, appId: c.appId, codeHash: digest(code), expiresAt } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_INVITED', detail: { userId: b.userId } } })
    })
    return { command: `绑定 ${code}`, expiresAt }
  }
  async bindings(user: CurrentUser) {
    this.config.assertRoot(user)
    const rows = await this.prisma.aiFeishuBinding.findMany({ orderBy: { updatedAt: 'desc' } })
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map(r => r.userId) } }, select: { id: true, account: true, username: true, role: true, disabled: true, deletedAt: true } })
    return rows.map(r => ({ ...r, user: users.find(u => u.id === r.userId) || null }))
  }
  async editBinding(user: CurrentUser, id: string, input: unknown) {
    this.config.assertRoot(user)
    const b = z.object({ enabled: z.boolean(), defaultModelId: z.string().min(1) }).strict().parse(input)
    const row = await this.prisma.aiFeishuBinding.findUnique({ where: { id } })
    if (!row || row.revokedAt) throw new NotFoundException('绑定已解除，请重新邀请')
    if (b.enabled) await this.eligible(row.userId, b.defaultModelId)
    await this.mutateBinding(user, id, b, 'FEISHU_BINDING_UPDATED')
    return { ok: true }
  }
  async unbind(user: CurrentUser, id: string) {
    this.config.assertRoot(user)
    await this.mutateBinding(user, id, { enabled: false, revokedAt: new Date() }, 'FEISHU_UNBOUND')
    return { ok: true }
  }
  private async mutateBinding(user: CurrentUser, id: string, data: Prisma.AiFeishuBindingUpdateInput, action: string) {
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = 'global' FOR SHARE`
      await tx.aiFeishuBinding.update({ where: { id }, data: { ...data, revision: { increment: 1 } } })
      await tx.aiFeishuSession.updateMany({ where: { bindingId: id }, data: { revision: { increment: 1 }, conversationId: null, authorityHash: null, grantsCipher: null, accessProofHash: null } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action, detail: { bindingId: id } } })
    })
  }
  private async claim(peer: Peer, code: string): Promise<Outbound[]> {
    const proof = opaque()
    const invitation = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = 'global' FOR SHARE`
      const c = await this.settings(tx)
      if (!c.enabled || c.appId !== peer.appId) throw new ForbiddenException('飞书接入已停用')
      const i = await tx.aiFeishuInvitation.findUnique({ where: { codeHash: digest(code) } })
      if (!i || i.appId !== peer.appId || i.usedAt || i.claimedAt || i.expiresAt <= new Date()) throw new BadRequestException('绑定指令已失效或已被领取，请联系管理员重新生成')
      const changed = await tx.aiFeishuInvitation.updateMany({ where: { id: i.id, claimedAt: null, usedAt: null }, data: { claimedAt: new Date(), proofHash: digest(proof), tenantKey: peer.tenantKey, openId: peer.openId, chatId: peer.chatId } })
      if (!changed.count) throw new ConflictException('绑定指令已被领取')
      return i
    })
    const user = await this.currentUser(invitation.userId), c = await this.settings()
    const path = this.access.isAdmin(user) ? '/admin/ai/feishu/bind' : '/ai/feishu/bind'
    return [{ type: 'text', content: `请登录指定的网站账号确认绑定（10 分钟内）：\n${c.publicSiteUrl}${path}#proof=${proof}\n请从当前机器人私聊打开此链接。` }]
  }
  private async invitation(user: CurrentUser, input: unknown, db: Db = this.prisma) {
    const { proof } = proofSchema.parse(input), c = await this.settings(db)
    const i = await db.aiFeishuInvitation.findUnique({ where: { proofHash: digest(proof) } })
    if (!c.enabled || !i || i.appId !== c.appId || i.usedAt || !i.openId || !i.tenantKey || !i.chatId || i.expiresAt <= new Date()) throw new BadRequestException('绑定链接已失效，请重新邀请')
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
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = 'global' FOR SHARE`
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR SHARE`
      const verified = await this.currentUser(user.id, tx)
      if (verified.permissionVersion !== user.permissionVersion || verified.role !== actor.role || verified.dataOwnerId !== actor.dataOwnerId) throw new ConflictException('网站账号身份已变化，请重新登录后绑定')
      await tx.$queryRaw`SELECT "id" FROM "AiFeishuInvitation" WHERE "id" = ${invitation.id} FOR UPDATE`
      const i = await this.invitation(user, input, tx)
      const existing = await tx.aiFeishuBinding.findUnique({ where: { userId: user.id } })
      if (existing && !existing.revokedAt) throw new ConflictException('此网站账号已绑定，请联系管理员核对')
      const data = { userId: user.id, appId: i.appId, tenantKey: i.tenantKey!, openId: i.openId!, chatId: i.chatId!, defaultModelId: i.defaultModelId, roleSnapshot: actor.role, ownerSnapshot: actor.dataOwnerId, enabled: true, revokedAt: null }
      const b = await tx.aiFeishuBinding.upsert({ where: { userId: user.id }, create: data, update: { ...data, revision: { increment: 1 } } })
      await tx.aiFeishuInvitation.update({ where: { id: i.id }, data: { usedAt: new Date(), proofHash: null } })
      const key = { appId: i.appId, tenantKey: i.tenantKey!, openId: i.openId!, chatId: i.chatId! }
      const session = await tx.aiFeishuSession.upsert({ where: { appId_tenantKey_openId_chatId: key }, create: key, update: {} })
      if (!session.bindingId) await tx.aiFeishuSession.update({ where: { id: session.id }, data: { bindingId: b.id, ownerId: this.access.isAdmin(actor) ? null : actor.dataOwnerId, revision: { increment: 1 } } })
      await tx.aiAuditLog.create({ data: { actorId: user.id, action: 'FEISHU_BOUND', detail: { bindingId: b.id, openId: i.openId } } })
      await this.notice(tx, key, `网站账号 ${user.username}（${user.account}）绑定成功。发送“状态”查看当前身份，发送“切换身份”选择账号。`)
      return b
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return { ok: true, bindingId: binding.id }
  }
  private async notice(db: Db, peer: Peer, content: string) {
    const c = await this.settings(db)
    await db.aiFeishuEvent.create({ data: { ...peer, configRevision: c.revision, eventKey: `notice:${opaque()}`, inputCipher: encryptAiKey('{}'), outputCipher: encryptAiKey(JSON.stringify([{ type: 'text', content }])), status: 'READY' } })
  }
  async session(peer: Peer) {
    return this.prisma.aiFeishuSession.upsert({ where: { appId_tenantKey_openId_chatId: peer }, create: peer, update: {} })
  }
  private async binding(session: AiFeishuSession, db: Db = this.prisma) {
    const b = session.bindingId ? await db.aiFeishuBinding.findUnique({ where: { id: session.bindingId } }) : null
    if (!b?.enabled || b.revokedAt || b.appId !== session.appId || b.tenantKey !== session.tenantKey || b.openId !== session.openId || b.chatId !== session.chatId) throw new ForbiddenException('当前身份未绑定或已停用，请联系管理员或发送“切换身份”')
    const user = await this.currentUser(b.userId, db)
    if (user.role !== b.roleSnapshot || user.dataOwnerId !== b.ownerSnapshot) throw new ForbiddenException('网站账号归属已变化，请管理员重新绑定')
    return { b, user }
  }
  private grants(s: AiFeishuSession): Grants { return s.grantsCipher ? JSON.parse(decryptAiKey(s.grantsCipher)) as Grants : {} }
  private async hash(s: AiFeishuSession, b: AiFeishuBinding, user: CurrentUser, db: Db = this.prisma) {
    const settings = await this.config.settings(db as Prisma.TransactionClient)
    return digest(JSON.stringify({ settings: settings.revision, model: b.defaultModelId, authorization: await this.access.authorizationHash(user, s.ownerId || user.dataOwnerId, this.grants(s), db as Prisma.TransactionClient) }))
  }
  private async context(s: AiFeishuSession) {
    const { b, user } = await this.binding(s)
    await this.eligible(b.userId, b.defaultModelId)
    const ownerId = await this.access.owner(user, s.ownerId || undefined)
    let hash = await this.hash(s, b, user)
    if (s.authorityHash && s.authorityHash !== hash) {
      s = await this.reset(s.id, { ownerId })
      hash = await this.hash(s, b, user)
    }
    if (!s.authorityHash) s = await this.prisma.aiFeishuSession.update({ where: { id: s.id }, data: { authorityHash: hash } })
    const c = await this.settings()
    const scope: Scope = { sessionId: s.id, revision: s.revision, bindingId: b.id, bindingRevision: b.revision, configRevision: c.revision, hash }
    const channel: AiChannelContext = { assertCurrent: tx => this.assertScope(scope, tx), audit: { source: 'FEISHU', bindingId: b.id, sessionId: s.id, openId: s.openId, appId: s.appId } }
    return { s, b, user, ownerId, scope, channel, grants: this.grants(s) }
  }
  async assertScope(scope: Scope, transaction?: Prisma.TransactionClient) {
    const db = transaction || this.prisma
    if (transaction) {
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuConfig" WHERE "id" = 'global' FOR SHARE`
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuBinding" WHERE "id" = ${scope.bindingId} FOR SHARE`
      await transaction.$queryRaw`SELECT "id" FROM "AiFeishuSession" WHERE "id" = ${scope.sessionId} FOR SHARE`
    }
    const c = await this.settings(db), s = await db.aiFeishuSession.findUnique({ where: { id: scope.sessionId } })
    if (!c.enabled || c.revision !== scope.configRevision || !s || s.revision !== scope.revision || s.bindingId !== scope.bindingId || s.appId !== c.appId) throw new ConflictException('飞书身份或会话已变化，旧卡片已失效')
    const { b, user } = await this.binding(s, db)
    if (b.revision !== scope.bindingRevision || await this.hash(s, b, user, db) !== scope.hash) throw new ConflictException('账号权限或访问授权已变化，请新建对话')
    const model = await db.aiModel.findUnique({ where: { id: b.defaultModelId } }), policy = await this.config.policy(user.id, transaction)
    if (!policy.enabled || !(await this.config.settings(transaction)).enabled || !model?.enabled || !(model.allowedUserIds as string[]).includes(user.id) && (model.allowedUserIds as string[]).length) throw new ForbiddenException('当前账号的 AI 或模型授权已停用')
    await this.access.owner(user, s.ownerId || undefined, transaction)
  }
  private reset(id: string, data: Prisma.AiFeishuSessionUpdateInput = {}) {
    return this.prisma.aiFeishuSession.update({ where: { id }, data: { ...data, conversationId: null, authorityHash: null, grantsCipher: null, accessProofHash: null, accessProofExpiresAt: null, revision: { increment: 1 } } })
  }
  private async action(s: AiFeishuSession, kind: string, targetId?: string) {
    const token = opaque(), c = await this.settings(), b = s.bindingId ? await this.prisma.aiFeishuBinding.findUnique({ where: { id: s.bindingId } }) : null
    await this.prisma.aiFeishuAction.create({ data: { tokenHash: digest(token), sessionId: s.id, sessionRevision: s.revision, bindingId: s.bindingId, bindingRevision: b?.revision, configRevision: c.revision, kind, targetId, expiresAt: minutes(15) } })
    return token
  }
  private async menu(s: AiFeishuSession, kind: 'identity' | 'owner', offset = 0): Promise<Outbound[]> {
    let rows: { id: string; label: string }[]
    if (kind === 'identity') {
      const bindings = await this.prisma.aiFeishuBinding.findMany({ where: { appId: s.appId, tenantKey: s.tenantKey, openId: s.openId, chatId: s.chatId, enabled: true, revokedAt: null }, orderBy: { createdAt: 'asc' } })
      const users = await this.prisma.user.findMany({ where: { id: { in: bindings.map(b => b.userId) }, disabled: false, deletedAt: null }, select: { id: true, username: true, account: true, role: true } })
      rows = bindings.flatMap(b => { const u = users.find(u => u.id === b.userId); return u ? [{ id: b.id, label: `${u.username}（${u.account} · ${u.role.includes('ADMIN') ? '后台' : '前台'}）` }] : [] })
    } else {
      const { user } = await this.binding(s)
      rows = (await this.ai.bootstrap(user)).owners.map(u => ({ id: u.id, label: `${u.username}（${u.account}）` }))
    }
    if (!rows.length) return [{ type: 'text', content: kind === 'identity' ? '尚无可用绑定，请联系管理员生成绑定指令。' : '当前账号没有可访问的数据账号，请联系管理员授权。' }]
    const buttons = await Promise.all(rows.slice(offset, offset + 12).map(async r => ({ label: r.label, token: await this.action(s, kind, r.id) })))
    if (offset > 0) buttons.push({ label: '上一页', token: await this.action(s, `${kind}-page`, String(Math.max(0, offset - 12))) })
    if (rows.length > offset + 12) buttons.push({ label: '下一页', token: await this.action(s, `${kind}-page`, String(offset + 12)) })
    return [card(kind === 'identity' ? '选择网站身份' : '选择数据账号', '切换后创建新会话，旧写入确认卡片失效。', buttons)]
  }
  private async accessLink(s: AiFeishuSession): Promise<Outbound[]> {
    const { user } = await this.binding(s)
    if (this.access.isAdmin(user)) return [{ type: 'text', content: '后台身份按已授权的数据账号访问，无需前台访问密码。' }]
    const proof = opaque(), c = await this.settings()
    await this.prisma.aiFeishuSession.update({ where: { id: s.id }, data: { accessProofHash: digest(proof), accessProofExpiresAt: minutes(10) } })
    return [{ type: 'text', content: `请登录当前网站账号验证访问密码，验证后返回飞书重新发送请求：\n${c.publicSiteUrl}/ai/feishu/access#proof=${proof}\n密码只能在网站验证页面输入。` }]
  }
  private async accessSession(user: CurrentUser, proof: string) {
    const s = await this.prisma.aiFeishuSession.findUnique({ where: { accessProofHash: digest(proof) } }), c = await this.settings()
    if (!s || !c.enabled || s.appId !== c.appId || !s.accessProofExpiresAt || s.accessProofExpiresAt <= new Date()) throw new BadRequestException('验证链接已失效，请在飞书重新发送“访问验证”')
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
  private async title(user: CurrentUser, ownerId: string, modelId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { username: true, account: true } }), model = await this.prisma.aiModel.findUnique({ where: { id: modelId }, select: { name: true } })
    return `身份：${user.username}（${user.account} · ${this.access.isAdmin(user) ? '后台' : user.isFrontendSubAccount ? '前台子账号' : '前台主账号'}）\n数据账号：${owner?.username}（${owner?.account}）\n模型：${model?.name}\n`
  }
  async handle(peer: Peer, input: FeishuInput, image?: () => Promise<{ bytes: Buffer; mime: string }>): Promise<Outbound[]> {
    const c = await this.settings()
    if (!c.enabled || c.appId !== peer.appId) throw new ForbiddenException('飞书接入已停用')
    let s = await this.session(peer)
    if (input.kind === 'card') return this.click(s, input.actionToken || '')
    const text = (input.text || '').trim()
    const binding = /^绑定\s+([A-Za-z0-9_-]{20,100})$/.exec(text)
    if (binding) return this.claim(peer, binding[1])
    if (text === '切换身份') return this.menu(s, 'identity')
    if (text === '帮助' || text === '绑定') return [{ type: 'text', content: '请让主管理员在“AI API 配置 → 飞书接入”生成绑定指令。绑定后可私聊查询或发送图片；写入须核对卡片并确认。命令：状态、切换身份、切换账号、新建对话、访问验证。请勿在聊天中发送访问密码。' }]
    if (!s.bindingId) return this.menu(s, 'identity')
    const { b, user } = await this.binding(s)
    if (text === '切换账号' && this.access.isAdmin(user)) return this.menu(s, 'owner')
    if (text === '新建对话') { s = await this.reset(s.id); return [{ type: 'text', content: '已新建对话，旧确认卡片及访问授权失效。' }] }
    if (text === '访问验证') return this.accessLink(s)
    if (this.access.isAdmin(user) && !s.ownerId) return this.menu(s, 'owner')
    const ctx = await this.context(s)
    const title = await this.title(user, ctx.ownerId, b.defaultModelId)
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
    const response = await this.ai.chat(user, { modelId: b.defaultModelId, ownerId: ctx.ownerId, conversationId: ctx.s.conversationId || undefined, text, attachmentIds, grants: ctx.grants }, ctx.channel)
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
    const a = await this.prisma.aiFeishuAction.findUnique({ where: { tokenHash: digest(token) } }), c = await this.settings()
    if (!a || a.sessionId !== s.id || a.sessionRevision !== s.revision || a.configRevision !== c.revision || a.expiresAt <= new Date()) throw new ForbiddenException('卡片已失效或不属于当前使用者，请重新发送请求')
    if (a.bindingId) { const b = await this.prisma.aiFeishuBinding.findUnique({ where: { id: a.bindingId } }); if (!b || b.revision !== a.bindingRevision) throw new ConflictException('绑定已变化，请重新发送请求') }
    if (a.kind === 'identity-page' || a.kind === 'owner-page') return this.menu(s, a.kind === 'identity-page' ? 'identity' : 'owner', Number(a.targetId) || 0)
    if (a.kind === 'identity') {
      const b = await this.prisma.aiFeishuBinding.findUnique({ where: { id: a.targetId! } })
      if (!b?.enabled || b.revokedAt || b.appId !== s.appId || b.tenantKey !== s.tenantKey || b.openId !== s.openId || b.chatId !== s.chatId) throw new ForbiddenException('无权切换到此身份')
      const user = await this.eligible(b.userId, b.defaultModelId)
      s = await this.reset(s.id, { bindingId: b.id, ownerId: this.access.isAdmin(user) ? null : user.dataOwnerId })
      return this.access.isAdmin(user) ? this.menu(s, 'owner') : [{ type: 'text', content: await this.title(user, user.dataOwnerId, b.defaultModelId) + '\n已创建新会话。' }]
    }
    if (a.kind === 'owner') {
      const { b, user } = await this.binding(s)
      if (!this.access.isAdmin(user)) throw new ForbiddenException('此身份不能选择其他数据账号')
      const ownerId = await this.access.owner(user, a.targetId!)
      s = await this.reset(s.id, { ownerId })
      return [{ type: 'text', content: await this.title(user, ownerId, b.defaultModelId) + '\n已创建新会话。' }]
    }
    if (a.kind !== 'confirm' && a.kind !== 'reject') throw new BadRequestException('不支持的卡片操作')
    const ctx = await this.context(s)
    // context() may have reset after an authorization change; never carry an old action forward.
    if (ctx.s.revision !== a.sessionRevision) throw new ConflictException('权限已变化，旧草稿卡片已失效')
    const proposal = await this.prisma.aiProposal.findFirst({ where: { id: a.targetId!, conversationId: ctx.s.conversationId || '', actorId: ctx.user.id, ownerId: ctx.ownerId } })
    if (!proposal) throw new ForbiddenException('草稿不属于当前身份或会话')
    const result = await this.ai.confirm(ctx.user, proposal.id, { decision: a.kind, grants: ctx.grants }, ctx.channel)
    return [{ type: 'text', content: (await this.title(ctx.user, ctx.ownerId, ctx.b.defaultModelId)) + `\n草稿状态：${result.status === 'APPLIED' ? '已确认写入' : result.status === 'REJECTED' ? '已取消' : result.status}。`, scope: ctx.scope }]
  }
}
