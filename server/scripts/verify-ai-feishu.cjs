// Disposable PostgreSQL verification. Never reads the business DATABASE_URL.
// FEISHU_TEST_DB_RUNTIME=/private/tmp/yangshao-ai-db.*/node_modules node server/scripts/verify-ai-feishu.cjs
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { execFileSync, spawn } = require('node:child_process')
const { resolve } = require('node:path')
async function main() {
  const runtimePath = process.env.FEISHU_TEST_DB_RUNTIME
  if (!runtimePath || !runtimePath.startsWith('/private/tmp/yangshao-ai-db.')) throw new Error('Use a disposable PGlite runtime')
  const { PGlite } = require(resolve(runtimePath, '@electric-sql/pglite'))
  const { PGLiteSocketServer } = require(resolve(runtimePath, '@electric-sql/pglite-socket'))
  const root = resolve(__dirname, '../..')
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55442/postgres?connection_limit=1&pool_timeout=30'
  process.env.JWT_SECRET = 'isolated-feishu-jwt-secret'
  process.env.AI_API_KEY_SECRET = 'isolated-feishu-cipher-secret-at-least-32-bytes'
  const sql = execFileSync(resolve(root, 'server/node_modules/.bin/prisma'), ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', resolve(root, 'server/prisma/schema.prisma'), '--script'], { env: process.env, encoding: 'utf8' })
  const migration = readFileSync(resolve(root, 'server/prisma/migrations/20261010010000_add_ai_feishu/migration.sql'), 'utf8')
  assert(!/\bDROP\b|\bALTER TABLE\b|\bUPDATE\b|\bDELETE FROM\b/.test(migration))
  const db = await PGlite.create()
  let socket, app, worker, prisma
  let passed = 0
  const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`) }
  try {
    await db.exec(sql.split(';').filter(s => !s.includes('"AiFeishu')).join(';'))
    await db.exec(migration)
    await db.exec(`INSERT INTO "User" ("id", "account", "username", "passwordHash", "role", "updatedAt") VALUES ('legacy-root', 'legacy-root', '旧管理员', 'fixture', 'ROOT_ADMIN', CURRENT_TIMESTAMP);
      INSERT INTO "AiFeishuConfig" ("id", "appId", "appSecretCipher", "publicSiteUrl", "enabled", "revision", "updatedAt") VALUES ('global', 'legacy-app', 'legacy-ciphertext', 'https://ys.ysjc.art', FALSE, 7, CURRENT_TIMESTAMP);
      INSERT INTO "AiFeishuBinding" ("id", "userId", "appId", "tenantKey", "openId", "chatId", "defaultModelId", "roleSnapshot", "ownerSnapshot", "updatedAt") VALUES ('legacy-binding', 'legacy-root', 'legacy-app', 'legacy-tenant', 'legacy-operator', 'legacy-chat', 'legacy-model', 'ROOT_ADMIN', 'legacy-root', CURRENT_TIMESTAMP);`)
    const splitMigration = readFileSync(resolve(root, 'server/prisma/migrations/20261011010000_split_ai_feishu_bots/migration.sql'), 'utf8')
    await db.exec(splitMigration)
    await db.exec(`INSERT INTO "AiFeishuSession" ("id", "configId", "appId", "tenantKey", "openId", "chatId", "bindingId", "ownerId", "revision", "updatedAt") VALUES ('legacy-session', 'admin', 'legacy-app', 'legacy-tenant', 'legacy-operator', 'legacy-chat', 'legacy-binding', 'a', 9, CURRENT_TIMESTAMP);`)
    await db.exec(readFileSync(resolve(root, 'server/prisma/migrations/20261011020000_add_feishu_owner_scope/migration.sql'), 'utf8'))
    socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55442 })
    await socket.start()
    const { NestFactory } = require('@nestjs/core')
    const { AppModule } = require('../dist/src/app.module')
    const { PrismaService } = require('../dist/src/prisma/prisma.service')
    const { AiService } = require('../dist/src/ai/ai.service')
    const { AiBusinessService } = require('../dist/src/ai/ai-business.service')
    const { AiAccessService } = require('../dist/src/ai/ai-access.service')
    const { AiConfigService } = require('../dist/src/ai/ai-config.service')
    const { FeishuService } = require('../dist/src/ai/feishu/feishu.service')
    const { FeishuRuntime } = require('../dist/src/ai/feishu/feishu.runtime')
    const { resolveCurrentUserIdentity } = require('../dist/src/auth/current-user')
    const { encryptAiKey, decryptAiKey } = require('../dist/src/ai/ai.security')
    const { digest } = require('../dist/src/ai/feishu/feishu.types')
    const { businessDateInBeijing } = require('../dist/src/common/date')
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    app.setGlobalPrefix('api'); await app.init()
    // The fixture never connects to a real Feishu application/provider.
    await app.get(FeishuRuntime).beforeApplicationShutdown()
    prisma = app.get(PrismaService)
    const service = app.get(FeishuService), ai = app.get(AiService), business = app.get(AiBusinessService), access = app.get(AiAccessService)
    for (const [id, role, extra] of [['root', 'ROOT_ADMIN', {}], ['a', 'FRONTEND_USER', {}], ['b', 'FRONTEND_USER', {}], ['sub', 'FRONTEND_SUB_USER', { parentFrontendUserId: 'a', requiresAccessGuardPassword: false }], ['admin', 'SUB_ADMIN', {}]]) await prisma.user.create({ data: { id, account: id, username: `验收-${id}`, passwordHash: 'synthetic-password-hash', role, ...extra } })
    await prisma.frontendSubAccountPermission.create({ data: { subAccountId: 'sub', permission: 'FINANCE_EXPENSES' } })
    await prisma.subAdminFrontendPermission.create({ data: { subAdminId: 'admin', frontendUserId: 'a', createdById: 'root' } })
    const actor = id => resolveCurrentUserIdentity(prisma, id, 1)
    const rootUser = await actor('root'), a = await actor('a'), b = await actor('b'), sub = await actor('sub'), admin = await actor('admin')
    await prisma.aiSettings.create({ data: { id: 'global', enabled: true } })
    await prisma.aiPolicy.create({ data: { subjectId: '*', enabled: true, rules: [{ resource: 'expenses', readFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'], writeFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'] }] } })
    const model = await prisma.aiModel.create({ data: { id: 'model', name: '测试模型', modelId: 'fixture', baseUrl: 'https://model.example.com/v1', apiKeyCipher: encryptAiKey('fixture-key'), vision: true } })
    await check('subaccounts need independent AI policies and keep the original owner boundary', async () => {
      const config = app.get(AiConfigService)
      assert.equal((await config.policy('sub')).enabled, false)
      assert.equal((await config.policy('admin')).enabled, false)
      const expenses = { resource: 'expenses', readFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'], writeFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'] }
      await prisma.aiPolicy.create({ data: { subjectId: 'sub', enabled: true, rules: [expenses] } })
      // Both AI and original admin assignments must permit an owner; b is not
      // originally assigned until the later joint-read verification.
      await prisma.aiPolicy.create({ data: { subjectId: 'admin', enabled: true, rules: [
        { ...expenses, ownerIds: ['a', 'b'] },
        { resource: 'customers', readFields: ['name'], writeFields: [], ownerIds: ['a', 'b'] }
      ] } })
      assert.equal((await config.policy('sub')).enabled, true)
      assert.equal((await config.policy('admin')).enabled, true)
      assert.deepEqual((await ai.bootstrap(admin)).owners.map(owner => owner.id), ['a'])
    })
    const peer = { configId: 'frontend', appId: 'test-app', tenantKey: 'test-tenant', openId: 'operator', chatId: 'private-chat' }
    const adminPeer = { ...peer, configId: 'admin', appId: 'test-admin-app' }
    await check('default off, root-only management and encrypted masked secret', async () => {
      assert.equal((await service.getConfig(rootUser, 'frontend')).enabled, false)
      await assert.rejects(() => service.getConfig(a, 'frontend'))
      await assert.rejects(() => service.saveConfig(a, 'frontend', {}))
      await assert.rejects(() => service.saveConfig(rootUser, 'frontend', { appId: 'test-app', appSecret: 'fixture-secret', publicSiteUrl: 'http://localhost:5173', enabled: true }))
      const config = await service.saveConfig(rootUser, 'frontend', { appId: 'test-app', appSecret: 'fixture-secret', publicSiteUrl: 'https://lab.example.com', enabled: true })
      assert(config.hasSecret); assert(!JSON.stringify(config).includes('fixture-secret')); assert(!JSON.stringify(config).includes('Cipher'))
      assert.notEqual((await prisma.aiFeishuConfig.findUnique({ where: { id: 'frontend' } })).appSecretCipher, 'fixture-secret')
    })
    await check('split migration preserves existing admin credential, revision and valid binding', async () => {
      const old = await prisma.aiFeishuConfig.findUnique({ where: { id: 'admin' } })
      assert.equal(old.appId, 'legacy-app'); assert.equal(old.appSecretCipher, 'legacy-ciphertext'); assert.equal(old.revision, 7)
      const binding = await prisma.aiFeishuBinding.findUnique({ where: { id: 'legacy-binding' } })
      assert.equal(binding.configId, 'admin'); assert.equal(binding.revokedAt, null); assert.equal(binding.enabled, true)
      assert.equal(await prisma.aiFeishuConfig.count(), 2)
      const session = await prisma.aiFeishuSession.findUnique({ where: { id: 'legacy-session' } })
      assert.equal(session.ownerId, 'a'); assert.deepEqual(session.ownerIds, []); assert.equal(session.revision, 9)
    })
    await check('front-only, mixed and empty legacy configurations migrate without changing business rows', async () => {
      for (const scenario of ['front-only', 'mixed', 'empty']) {
        const legacy = await PGlite.create()
        try {
          await legacy.exec(sql.split(';').filter(s => !s.includes('"AiFeishu')).join(';'))
          await legacy.exec(migration)
          await legacy.exec(`INSERT INTO "User" ("id", "account", "username", "passwordHash", "role", "updatedAt") VALUES ('migration-front', 'migration-front', '保留的业务账号', 'fixture', 'FRONTEND_USER', CURRENT_TIMESTAMP), ('migration-admin', 'migration-admin', '旧管理员', 'fixture', 'ROOT_ADMIN', CURRENT_TIMESTAMP);`)
          if (scenario !== 'empty') {
            await legacy.exec(`INSERT INTO "AiFeishuConfig" ("id", "appId", "appSecretCipher", "publicSiteUrl", "enabled", "revision", "updatedAt") VALUES ('global', 'old-front-app', 'original-ciphertext', 'https://front.example.com', TRUE, 9, CURRENT_TIMESTAMP);
              INSERT INTO "AiFeishuBinding" ("id", "userId", "appId", "tenantKey", "openId", "chatId", "defaultModelId", "roleSnapshot", "ownerSnapshot", "updatedAt") VALUES ('front-binding', 'migration-front', 'old-front-app', 'tenant', 'operator', 'chat', 'model', 'FRONTEND_USER', 'migration-front', CURRENT_TIMESTAMP);`)
            if (scenario === 'mixed') await legacy.exec(`INSERT INTO "AiFeishuBinding" ("id", "userId", "appId", "tenantKey", "openId", "chatId", "defaultModelId", "roleSnapshot", "ownerSnapshot", "updatedAt") VALUES ('back-binding', 'migration-admin', 'old-front-app', 'tenant', 'operator', 'chat', 'model', 'ROOT_ADMIN', 'migration-admin', CURRENT_TIMESTAMP);`)
          }
          const before = await legacy.query('SELECT * FROM "User" ORDER BY "id"')
          await legacy.exec(splitMigration)
          assert.deepEqual((await legacy.query('SELECT * FROM "User" ORDER BY "id"')).rows, before.rows)
          const configs = (await legacy.query('SELECT * FROM "AiFeishuConfig" ORDER BY "id"')).rows
          assert.equal(configs.length, 2)
          if (scenario === 'empty') assert(configs.every(c => !c.enabled && !c.appId))
          else {
            const c = configs.find(c => c.id === 'frontend')
            assert.equal(c.appId, 'old-front-app'); assert.equal(c.appSecretCipher, 'original-ciphertext'); assert.equal(c.revision, 9)
            assert.equal((await legacy.query('SELECT "revokedAt" FROM "AiFeishuBinding" WHERE "id" = \'front-binding\'')).rows[0].revokedAt, null)
            if (scenario === 'mixed') assert((await legacy.query('SELECT "revokedAt" FROM "AiFeishuBinding" WHERE "id" = \'back-binding\'')).rows[0].revokedAt)
          }
        } finally { await legacy.close() }
      }
    })
    await service.saveConfig(rootUser, 'admin', { appId: 'test-admin-app', appSecret: 'fixture-admin-secret', publicSiteUrl: 'https://admin.example.com', enabled: true })
    await check('duplicate App IDs and wrong-audience invitations cannot overwrite either robot', async () => {
      const front = await service.getConfig(rootUser, 'frontend'), back = await service.getConfig(rootUser, 'admin')
      await assert.rejects(() => service.saveConfig(rootUser, 'admin', { appId: 'test-app', appSecret: 'fixture', publicSiteUrl: 'https://admin.example.com', enabled: true }))
      await assert.rejects(() => service.invitations(rootUser, 'frontend', { userId: 'root', defaultModelId: model.id }))
      await assert.rejects(() => service.invitations(rootUser, 'admin', { userId: 'a', defaultModelId: model.id }))
      assert.deepEqual(await service.getConfig(rootUser, 'frontend'), front)
      assert.deepEqual(await service.getConfig(rootUser, 'admin'), back)
      const i = await service.invitations(rootUser, 'frontend', { userId: 'sub', defaultModelId: model.id })
      await assert.rejects(() => service.handle(adminPeer, { kind: 'message', text: i.command }))
      assert.equal((await prisma.aiFeishuInvitation.findUnique({ where: { codeHash: digest(i.command.split(' ')[1]) } })).claimedAt, null)
    })
    const bind = async (user, selectedPeer = peer) => {
      const bot = user.role.includes('ADMIN') ? 'admin' : 'frontend'
      const invitation = await service.invitations(rootUser, bot, { userId: user.id, defaultModelId: model.id })
      const claimed = await service.handle(selectedPeer, { kind: 'message', text: invitation.command })
      const proof = /#proof=([A-Za-z0-9_-]+)/.exec(claimed[0].content)[1]
      return { invitation, proof, link: claimed[0].content, confirm: () => service.confirmBinding(user, { proof }) }
    }
    let bindingA, bindingB
    await check('owner confirmation, wrong-account denial, one-use instructions and proof', async () => {
      const i = await bind(a)
      assert(i.link.includes('https://lab.example.com/ai/feishu/bind#proof='))
      await assert.rejects(() => service.resolveBinding(b, { proof: i.proof }))
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: i.invitation.command }))
      assert.equal((await service.resolveBinding(a, { proof: i.proof })).account, 'a')
      bindingA = await i.confirm()
      await assert.rejects(() => i.confirm())
      assert.equal((await prisma.aiFeishuBinding.findUnique({ where: { userId: 'a' } })).openId, peer.openId)
    })
    await check('one website identity cannot be shared; one operator can bind multiple identities', async () => {
      await assert.rejects(() => service.invitations(rootUser, 'frontend', { userId: 'a', defaultModelId: model.id }))
      bindingB = await (await bind(b)).confirm()
      const s = await service.session(peer)
      assert.equal(s.bindingId, bindingA.bindingId) // New binding does not silently switch.
      assert.equal(await prisma.aiFeishuBinding.count({ where: { openId: peer.openId } }), 2)
    })
    await check('expired invitation and unauthorized/disabled models cannot bind', async () => {
      const i = await service.invitations(rootUser, 'frontend', { userId: 'sub', defaultModelId: model.id })
      await prisma.aiFeishuInvitation.updateMany({ where: { userId: 'sub' }, data: { expiresAt: new Date(0) } })
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: i.command }))
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: ['a'] } })
      await assert.rejects(() => service.invitations(rootUser, 'frontend', { userId: 'sub', defaultModelId: model.id }))
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: [] } })
    })
    await check('same Feishu operator has separate front/admin sessions and role-specific verification links', async () => {
      const i = await bind(rootUser, adminPeer)
      assert(i.link.includes('https://admin.example.com/admin/ai/feishu/bind#proof='))
      await assert.rejects(() => service.resolveBinding(a, { proof: i.proof }))
      await i.confirm()
      const front = await service.session(peer), back = await service.session(adminPeer)
      assert.notEqual(front.id, back.id); assert.notEqual(front.bindingId, back.bindingId)
      assert.equal(front.configId, 'frontend'); assert.equal(back.configId, 'admin')
      const rootBinding = await prisma.aiFeishuBinding.findUnique({ where: { userId: 'root' } })
      await assert.rejects(() => service.unbind(rootUser, 'frontend', rootBinding.id))
      assert.equal((await service.bindings(rootUser, 'frontend')).some(row => row.userId === 'root'), false)
    })
    const originalChat = ai.chat.bind(ai)
    let chats = 0
    let lastRead, lastContext
    // Replace only the external model turn. Data authorization and confirmation use real services.
    ai.chat = async (user, input, channel) => {
      chats++; await channel.assertCurrent()
      const settings = await prisma.aiSettings.findUnique({ where: { id: 'global' } })
      const ownerIds = await access.owners(user, input.ownerIds || (input.ownerId ? [input.ownerId] : undefined)), ownerId = ownerIds[0]
      assert.deepEqual(ownerIds, [...channel.selectedOwnerIds])
      const conversation = input.conversationId ? await prisma.aiConversation.findUnique({ where: { id: input.conversationId } }) : await prisma.aiConversation.create({ data: { actorId: user.id, ownerId, ownerIds, modelId: model.id, settingsRevision: settings.revision, authorizationHash: await access.ownersAuthorizationHash(user, ownerIds, input.grants), title: '飞书验收' } })
      const ctx = { user, ownerId, ownerIds, conversationId: conversation.id, grants: input.grants, channel }
      lastContext = ctx
      if (input.text === '新增支出') {
        await business.prepareCreate(ctx, 'expenses', { paymentDate: businessDateInBeijing(), item: '验收支出', amount: 12.5, paymentMethod: 'cash' })
      } else if (input.text === '查询客户') lastRead = await business.query(ctx, 'customers')
      else if (input.text === '下一页') lastRead = await business.continueQuery(ctx, 'customers')
      else if (input.text === '汇总客户') lastRead = await business.summarize(ctx, 'customers')
      else await business.query(ctx, 'expenses')
      return { conversationId: conversation.id, answer: '请核对授权数据与草稿', proposals: await prisma.aiProposal.findMany({ where: { conversationId: conversation.id }, select: { id: true, resource: true, status: true, preview: true, expiresAt: true } }) }
    }
    const tokenOf = output => output.content.body.elements.find(e => e.tag === 'column_set').columns[0].elements[0].behaviors[0].value.token
    const click = token => service.handle(peer, { kind: 'card', actionToken: token })
    let confirmToken, oldScope
    await check('draft only until confirmed, forwarded card refused, duplicate clicks idempotent', async () => {
      const result = await service.handle(peer, { kind: 'message', text: '新增支出', messageId: 'create-a' })
      confirmToken = tokenOf(result.find(r => r.type === 'card')); oldScope = result[0].scope
      assert.equal(await prisma.financeEntry.count(), 0)
      await assert.rejects(() => service.handle({ ...peer, openId: 'another', chatId: 'another-chat' }, { kind: 'card', actionToken: confirmToken }))
      assert((await click(confirmToken))[0].content.includes('已确认写入'))
      await click(confirmToken)
      assert.equal(await prisma.financeEntry.count(), 1)
      const audit = await prisma.aiAuditLog.findFirst({ where: { action: 'APPLIED' } })
      assert.equal(audit.detail.source, 'FEISHU'); assert.equal(audit.detail.openId, peer.openId)
    })
    await check('explicit identity switching clears conversation and invalidates old cards/results', async () => {
      const menu = await service.handle(peer, { kind: 'message', text: '切换身份' })
      const action = await prisma.aiFeishuAction.findFirst({ where: { kind: 'identity', targetId: bindingB.bindingId }, orderBy: { createdAt: 'desc' } })
      const buttons = menu[0].content.body.elements.filter(e => e.tag === 'column_set')
      const token = buttons.map(e => e.columns[0].elements[0].behaviors[0].value.token).find(t => digest(t) === action.tokenHash)
      await click(token)
      const s = await service.session(peer)
      assert.equal(s.bindingId, bindingB.bindingId); assert.equal(s.conversationId, null); assert.equal(s.grantsCipher, null)
      await assert.rejects(() => click(confirmToken)); await assert.rejects(() => service.assertScope(oldScope))
      const result = await service.handle(peer, { kind: 'message', text: '查询' })
      assert(result[0].content.includes('验收-b')); assert.equal((await prisma.aiConversation.findUnique({ where: { id: (await service.session(peer)).conversationId } })).ownerId, 'b')
    })
    await check('vision requirements, original header validation and attachment ownership', async () => {
      await prisma.aiModel.update({ where: { id: model.id }, data: { vision: false } })
      await assert.rejects(() => service.handle(peer, { kind: 'message', imageKey: 'image', messageId: 'image-b' }, async () => ({ bytes: Buffer.from([137,80,78,71,13,10,26,10]), mime: 'image/png' })))
      await prisma.aiModel.update({ where: { id: model.id }, data: { vision: true } })
      await assert.rejects(() => service.handle(peer, { kind: 'message', imageKey: 'image', messageId: 'bad-image' }, async () => ({ bytes: Buffer.from('invalid'), mime: 'image/png' })))
      await service.handle(peer, { kind: 'message', imageKey: 'image', messageId: 'image-b' }, async () => ({ bytes: Buffer.from([137,80,78,71,13,10,26,10]), mime: 'image/png' }))
      assert.equal((await prisma.aiAttachment.findFirst()).actorId, 'b')
    })
    await check('website access verification uses original grants and never returns password/token', async () => {
      const group = await prisma.accessGuardGroup.create({ data: { id: 'group-b', frontendUserId: 'b', name: '财务验证', password: 'fixture-access-password', recoveryPrompt: 'fixture', recoveryAnswer: 'fixture', enabled: true, ttlMinutes: 5, features: { create: { frontendUserId: 'b', feature: 'FINANCE' } } } })
      const output = await service.handle(peer, { kind: 'message', text: '访问验证' })
      const proof = /#proof=([A-Za-z0-9_-]+)/.exec(output[0].content)[1]
      await assert.rejects(() => service.resolveAccess(a, { proof }))
      const resolved = await service.resolveAccess(b, { proof })
      assert(!JSON.stringify(resolved).includes('password')); assert(!JSON.stringify(resolved).includes('recovery'))
      await assert.rejects(() => service.confirmAccess(b, { proof, groupId: group.id, password: 'wrong' }))
      const granted = await service.confirmAccess(b, { proof, groupId: group.id, password: 'fixture-access-password' })
      assert(!JSON.stringify(granted).includes('token'))
      const s = await service.session(peer)
      assert(!s.grantsCipher.includes('eyJ')); assert.equal(s.conversationId, null)
      await service.handle(peer, { kind: 'message', text: '查询' })
      const response = await service.handle(peer, { kind: 'message', text: '新增支出' })
      const token = tokenOf(response.find(o => o.type === 'card'))
      await prisma.accessGuardGroup.update({ where: { id: group.id }, data: { grantVersion: { increment: 1 } } })
      await assert.rejects(() => click(token))
      assert.equal(await prisma.financeEntry.count(), 1)
    })
    const subPeer = { ...peer, openId: 'sub-operator', chatId: 'sub-chat' }
    await check('frontend subaccount uses parent owner and cannot exceed menu permissions', async () => {
      await (await bind(sub, subPeer)).confirm()
      const output = await service.handle(subPeer, { kind: 'message', text: '新增支出' })
      const token = tokenOf(output.find(o => o.type === 'card'))
      await service.handle(subPeer, { kind: 'card', actionToken: token })
      assert.equal((await prisma.financeEntry.findFirst({ orderBy: { createdAt: 'desc' } })).frontendUserId, 'a')
      const conversation = await prisma.aiConversation.findUnique({ where: { id: (await service.session(subPeer)).conversationId } })
      await assert.rejects(() => business.prepareCreate({ user: sub, ownerId: 'a', conversationId: conversation.id, grants: {} }, 'customers', { name: 'unauthorized' }))
    })
    await check('subadministrator data selection and write audience stay restricted', async () => {
      const adminPeer = { ...peer, configId: 'admin', appId: 'test-admin-app', openId: 'admin-operator', chatId: 'admin-chat' }
      await (await bind(admin, adminPeer)).confirm()
      assert.equal((await service.handle(adminPeer, { kind: 'message', text: '查询' }))[0].type, 'card')
      await assert.rejects(() => access.owner(admin, 'b'))
      await assert.rejects(() => business.prepareCreate({ user: admin, ownerId: 'a', conversationId: 'unused', grants: {} }, 'expenses', { paymentDate: businessDateInBeijing(), item: 'forbidden', amount: 1, paymentMethod: 'cash' }))
    })
    await check('revocation during confirmation transaction blocks the original business write', async () => {
      const result = await service.handle(subPeer, { kind: 'message', text: '新增支出' })
      const token = tokenOf(result.find(o => o.type === 'card')), scope = result[0].scope
      await service.unbind(rootUser, 'frontend', (await prisma.aiFeishuBinding.findUnique({ where: { userId: 'sub' } })).id)
      await assert.rejects(() => service.handle(subPeer, { kind: 'card', actionToken: token }))
      await assert.rejects(() => service.assertScope(scope))
      assert.equal(await prisma.financeEntry.count(), 2)
    })
    await check('default model permission revoked: no fallback to another model', async () => {
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: ['a'] } })
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: '查询' }))
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: [] } })
    })
    const transport = { snapshot: () => ({ state: 'connected' }), stop: async () => {}, connect: async () => {}, error: () => {}, send: async () => {}, image: async () => { throw new Error('not used') } }
    const adminTransport = { ...transport, send: async () => {} }
    const factory = { create: () => factoryIndex++ % 2 === 0 ? transport : adminTransport }
    let factoryIndex = 0
    worker = new FeishuRuntime(prisma, service, factory)
    await prisma.aiFeishuEvent.updateMany({ data: { status: 'SENT' } }) // Binding notifications are synthetic fixture setup.
    await check('each queue uses its own transport, and a delayed front retry never blocks admin delivery', async () => {
      const frontSends = [], adminSends = []
      transport.send = async (...args) => { frontSends.push(args) }; adminTransport.send = async (...args) => { adminSends.push(args) }
      await worker.ingest(peer, 'message:front-routing', { kind: 'message', text: '帮助' })
      await worker.ingest(adminPeer, 'message:admin-routing', { kind: 'message', text: '帮助' })
      await worker.tick('frontend')
      await prisma.aiFeishuEvent.updateMany({ where: { eventKey: 'message:front-routing' }, data: { nextAttemptAt: new Date(Date.now() + 60000) } })
      await worker.tick('admin'); await worker.tick('admin')
      assert.equal(frontSends.length, 0); assert.equal(adminSends.length, 1)
      assert.equal((await prisma.aiFeishuEvent.findFirst({ where: { eventKey: 'message:admin-routing' } })).status, 'SENT')
      await prisma.aiFeishuEvent.updateMany({ where: { eventKey: 'message:front-routing' }, data: { nextAttemptAt: new Date(0) } })
      await worker.tick('frontend')
      assert.equal(frontSends.length, 1); assert.equal(adminSends.length, 1)
    })
    await check('durable dedup, encrypted message bodies, delivery retry never replays AI', async () => {
      let sends = 0
      transport.send = async () => { if (++sends === 1) throw new Error('network timeout') }
      const before = chats
      await worker.ingest(peer, 'message:queue-1', { kind: 'message', text: '状态' })
      await worker.ingest(peer, 'message:queue-1', { kind: 'message', text: '状态' })
      assert.equal(await prisma.aiFeishuEvent.count({ where: { eventKey: 'message:queue-1' } }), 1)
      await worker.tick(); await worker.tick()
      let e = await prisma.aiFeishuEvent.findFirst({ where: { eventKey: 'message:queue-1' } })
      assert.equal(e.status, 'READY'); assert.equal(e.lastError, 'DELIVERY_FAILED'); assert(!e.inputCipher.includes('状态'))
      await prisma.aiFeishuEvent.update({ where: { id: e.id }, data: { nextAttemptAt: new Date(0) } })
      await worker.tick()
      assert.equal((await prisma.aiFeishuEvent.findUnique({ where: { id: e.id } })).status, 'SENT')
      assert.equal(chats, before); assert.equal(sends, 2)
    })
    await check('queued real draft retries send only; duplicate receipt does not duplicate financial writes', async () => {
      await prisma.accessGuardGroup.update({ where: { id: 'group-b' }, data: { enabled: false } })
      await worker.ingest(peer, 'message:queue-create', { kind: 'message', text: '新增支出' })
      const before = chats
      await worker.tick(); await worker.tick()
      const e = await prisma.aiFeishuEvent.findFirst({ where: { eventKey: 'message:queue-create' } })
      const outputs = JSON.parse(decryptAiKey(e.outputCipher)), token = tokenOf(outputs.find(o => o.type === 'card'))
      await worker.ingest(peer, 'card:queue-confirm', { kind: 'card', actionToken: token })
      await worker.ingest(peer, 'card:queue-confirm', { kind: 'card', actionToken: token })
      await worker.tick(); await worker.tick()
      assert.equal(chats, before + 1); assert.equal(await prisma.financeEntry.count(), 3)
    })
    await check('process restart interrupts ambiguous execution without replaying a model/write', async () => {
      await worker.beforeApplicationShutdown()
      const c = await service.settings('frontend')
      await prisma.aiFeishuEvent.create({ data: { ...peer, configRevision: c.revision, eventKey: 'crash-job', inputCipher: encryptAiKey(JSON.stringify({ kind: 'message', text: '新增支出' })), status: 'PROCESSING' } })
      worker = new FeishuRuntime(prisma, service, factory)
      const before = chats
      await worker.tick()
      const e = await prisma.aiFeishuEvent.findFirst({ where: { eventKey: 'crash-job' } })
      assert.equal(e.status, 'SENT'); assert.equal(chats, before); assert.equal(await prisma.financeEntry.count(), 3)
    })
    await app.listen(0, '127.0.0.1')
    const address = await app.getUrl(), jwt = require('jsonwebtoken')
    const headers = id => ({ Authorization: `Bearer ${jwt.sign({ sub: id, permissionVersion: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' })
    await check('HTTP authentication and root-only endpoints; no unauthenticated business entrypoint', async () => {
      assert.equal((await fetch(address + '/api/admin/ai/feishu/configs/frontend')).status, 401)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/configs/frontend', { headers: headers('a') })).status, 403)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/configs/frontend', { headers: headers('root') })).status, 200)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/configs/admin', { headers: headers('root') })).status, 200)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/configs/forged', { headers: headers('root') })).status, 400)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/config', { method: 'PUT', headers: headers('root'), body: '{}' })).status, 404)
      assert.equal((await fetch(address + '/api/ai/feishu/bind/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    })
    let multiScope, snapshotAllToken
    const allButtons = output => output.content.body.elements.filter(e => e.tag === 'column_set').map(e => e.columns[0].elements[0])
    const buttonToken = (output, label) => allButtons(output).find(b => b.text.content.includes(label)).behaviors[0].value.token
    await check('multi-account selection is admin-only, explicit and persists through a new conversation', async () => {
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: '多账号查询' }))
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: '全选账号' }))
      const before = await service.session(adminPeer), reply = await service.handle(adminPeer, { kind: 'message', text: '全选账号' })
      assert(reply[0].content.includes('已选 2 个')); assert(reply[0].content.includes('多账号只读'))
      const selected = await service.session(adminPeer)
      assert.deepEqual(selected.ownerIds, ['a', 'b']); assert.equal(selected.ownerId, 'a'); assert(selected.revision > before.revision)
      await service.handle(adminPeer, { kind: 'message', text: '新建对话' })
      assert.deepEqual((await service.session(adminPeer)).ownerIds, ['a', 'b'])
      await assert.rejects(() => service.assertScope(reply[0].scope))
      const menu = await service.handle(adminPeer, { kind: 'message', text: '多账号查询' })
      snapshotAllToken = buttonToken(menu[0], '全选授权账号')
      assert(allButtons(menu[0]).some(b => b.text.content.startsWith('☑')))
    })
    await prisma.user.create({ data: { id: 'c', account: 'c', username: '未选丙', passwordHash: 'synthetic-password-hash', role: 'FRONTEND_USER' } })
    const policy = await prisma.aiPolicy.findUnique({ where: { subjectId: '*' } })
    await prisma.aiPolicy.update({ where: { subjectId: '*' }, data: { rules: [...policy.rules, { resource: 'customers', readFields: ['name'], writeFields: ['name'] }] } })
    await prisma.customer.createMany({ data: [
      ...Array.from({ length: 31 }, (_, i) => ({ id: 'joint-a-' + i, frontendUserId: 'a', name: '授权甲客户-' + i, phone: 'PRIVATE-PHONE-A' })),
      ...Array.from({ length: 30 }, (_, i) => ({ id: 'joint-b-' + i, frontendUserId: 'b', name: '授权乙客户-' + i, phone: 'PRIVATE-PHONE-B' })),
      { id: 'joint-c', frontendUserId: 'c', name: 'UNSELECTED-CUSTOMER', phone: 'UNSELECTED-PHONE' }
    ] })
    await check('all-selection card uses its original snapshot, not newly added accounts', async () => {
      await service.handle(adminPeer, { kind: 'card', actionToken: snapshotAllToken })
      assert.deepEqual((await service.session(adminPeer)).ownerIds, ['a', 'b'])
      await assert.rejects(() => service.handle(adminPeer, { kind: 'card', actionToken: snapshotAllToken }))
    })
    await check('joint reads label owners, paginate across accounts, redact fields and summarize the full scope', async () => {
      const output = await service.handle(adminPeer, { kind: 'message', text: '查询客户' })
      multiScope = output[0].scope
      assert.equal(lastRead.totalRecords, 61); assert.equal(lastRead.rows.length, 50); assert.equal(lastRead.hasMore, true)
      assert.deepEqual(lastRead.accounts.map(a => a.owner.id), ['a', 'b'])
      assert(lastRead.rows.every(row => ['a', 'b'].includes(row.owner.id)))
      assert(!JSON.stringify(lastRead).includes('PRIVATE-PHONE')); assert(!JSON.stringify(lastRead).includes('UNSELECTED-CUSTOMER'))
      const first = lastRead.rows.map(row => row.id), conversationId = (await service.session(adminPeer)).conversationId
      assert.deepEqual((await prisma.aiConversation.findUnique({ where: { id: conversationId } })).ownerIds, ['a', 'b'])
      await service.handle(adminPeer, { kind: 'message', text: '下一页' })
      assert.equal(lastRead.rows.length, 11); assert.equal(lastRead.hasMore, false); assert(lastRead.rows.every(row => !first.includes(row.id)))
      await service.handle(adminPeer, { kind: 'message', text: '汇总客户' })
      assert.equal(lastRead.totalRecords, 61); assert.equal(lastRead.complete, true)
      assert.deepEqual(lastRead.accounts.map(a => a.totalRecords), [31, 30])
    })
    await check('multi-account mode rejects business drafts and confirmation even with a genuine session token', async () => {
      const count = await prisma.financeEntry.count(), proposals = await prisma.aiProposal.count()
      await assert.rejects(() => service.handle(adminPeer, { kind: 'message', text: '新增支出' }))
      await assert.rejects(() => business.prepareCreate(lastContext, 'customers', { name: 'forbidden' }))
      const s = await service.session(adminPeer), token = await service.action(s, 'confirm', 'fabricated-proposal')
      await assert.rejects(() => service.handle(adminPeer, { kind: 'card', actionToken: token }))
      assert.equal(await prisma.financeEntry.count(), count); assert.equal(await prisma.aiProposal.count(), proposals)
    })
    await check('revoking any selected account blocks the whole read and saved reply instead of returning a partial total', async () => {
      await prisma.user.update({ where: { id: 'b' }, data: { disabled: true } })
      const before = chats
      await assert.rejects(() => service.handle(adminPeer, { kind: 'message', text: '查询客户' }))
      await assert.rejects(() => service.assertScope(multiScope))
      await assert.rejects(() => business.summarize(lastContext, 'customers'))
      assert.equal(chats, before)
      await prisma.user.update({ where: { id: 'b' }, data: { disabled: false } })
    })
    await check('subadmin joint reads remain limited to assigned accounts and recheck assignments at send time', async () => {
      const restrictedPeer = { ...adminPeer, openId: 'admin-operator', chatId: 'admin-chat' }
      await service.handle(restrictedPeer, { kind: 'message', text: '全选账号' })
      assert.deepEqual((await service.session(restrictedPeer)).ownerIds, ['a'])
      const assigned = await prisma.subAdminFrontendPermission.create({ data: { subAdminId: 'admin', frontendUserId: 'b', createdById: 'root' } })
      const output = await service.handle(restrictedPeer, { kind: 'message', text: '全选账号' })
      assert.deepEqual((await service.session(restrictedPeer)).ownerIds, ['a', 'b'])
      await prisma.subAdminFrontendPermission.delete({ where: { id: assigned.id } })
      await assert.rejects(() => service.assertScope(output[0].scope))
      await assert.rejects(() => service.handle(restrictedPeer, { kind: 'message', text: '查询客户' }))
      assert.equal((await service.session(restrictedPeer)).ownerIds.includes('c'), false)
    })
    await check('toggle, clear and single-owner switch invalidate old cards and never silently select all accounts', async () => {
      const menu = await service.handle(adminPeer, { kind: 'message', text: '多账号查询' })
      const stale = buttonToken(menu[0], '验收-b'), next = await service.handle(adminPeer, { kind: 'card', actionToken: buttonToken(menu[0], '验收-a') })
      assert.deepEqual((await service.session(adminPeer)).ownerIds, ['b'])
      await assert.rejects(() => service.handle(adminPeer, { kind: 'card', actionToken: stale }))
      await assert.rejects(() => service.assertScope(multiScope))
      await service.handle(adminPeer, { kind: 'card', actionToken: buttonToken(next[0], '清空选择') })
      const s = await service.session(adminPeer); assert.equal(s.ownerId, null); assert.deepEqual(s.ownerIds, []); assert.equal(s.conversationId, null)
      const before = chats, result = await service.handle(adminPeer, { kind: 'message', text: '查询客户' })
      assert.equal(result[0].type, 'card'); assert.equal(chats, before)
      const single = await service.handle(adminPeer, { kind: 'message', text: '切换账号' })
      await service.handle(adminPeer, { kind: 'card', actionToken: buttonToken(single[0], '验收-a') })
      assert.deepEqual((await service.session(adminPeer)).ownerIds, ['a'])
      await service.handle(adminPeer, { kind: 'message', text: '查询客户' })
      assert.equal(lastRead.totalRecords, 31)
    })
    await check('over-limit all-selection fails without selecting a partial subset or changing the original scope', async () => {
      const ids = Array.from({ length: 21 }, (_, i) => 'scope-limit-' + i)
      await prisma.user.createMany({ data: ids.map(id => ({ id, account: id, username: id, passwordHash: 'synthetic', role: 'FRONTEND_USER' })) })
      const before = await service.session(adminPeer)
      await assert.rejects(() => service.handle(adminPeer, { kind: 'message', text: '全选账号' }))
      await assert.rejects(() => service.selectOwners(before, ids))
      assert.deepEqual(await service.session(adminPeer), before)
      await prisma.user.deleteMany({ where: { id: { in: ids } } }) // Disposable fixture identities only.
    })
    await check('changing front configuration preserves admin proofs, bindings, sessions and cards', async () => {
      const frontBinding = await prisma.aiFeishuBinding.findUnique({ where: { userId: 'b' } })
      const backBinding = await prisma.aiFeishuBinding.findUnique({ where: { userId: 'root' } })
      const before = await service.session(adminPeer)
      const menu = await service.handle(adminPeer, { kind: 'message', text: '切换身份' }), token = tokenOf(menu[0])
      const invite = await service.invitations(rootUser, 'admin', { userId: 'legacy-root', defaultModelId: model.id })
      const frontConfig = await service.getConfig(rootUser, 'frontend')
      await service.saveConfig(rootUser, 'frontend', { appId: 'replacement-front-app', appSecret: 'replacement-secret', publicSiteUrl: 'https://front-new.example.com', enabled: true })
      assert.equal((await prisma.aiFeishuBinding.findUnique({ where: { id: frontBinding.id } })).enabled, false)
      assert.deepEqual(await prisma.aiFeishuBinding.findUnique({ where: { id: backBinding.id } }), backBinding)
      assert.deepEqual(await service.session(adminPeer), before)
      assert.equal((await prisma.aiFeishuInvitation.findUnique({ where: { codeHash: digest(invite.command.split(' ')[1]) } })).usedAt, null)
      assert((await service.handle(adminPeer, { kind: 'card', actionToken: token }))[0].type === 'card')
      await service.saveConfig(rootUser, 'frontend', { appId: frontConfig.appId, appSecret: 'fixture-secret', publicSiteUrl: frontConfig.publicSiteUrl, enabled: true })
    })
    await check('turning channel off preserves original website AI and business records', async () => {
      await service.saveConfig(rootUser, 'frontend', { appId: 'test-app', publicSiteUrl: 'https://lab.example.com', enabled: false })
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: '状态' }))
      assert((await ai.bootstrap(a)).enabled)
      assert.equal(await prisma.financeEntry.count(), 3)
      assert.equal((await service.getConfig(rootUser, 'admin')).enabled, true)
      assert.equal((await prisma.aiFeishuBinding.findUnique({ where: { userId: 'admin' } })).revokedAt, null)
      await service.saveConfig(rootUser, 'admin', { appId: 'test-admin-app', publicSiteUrl: 'https://admin.example.com', enabled: false })
      ai.chat = originalChat
    })
    await check('production start script boots and shuts down the compiled server', async () => {
      const pkg = JSON.parse(readFileSync(resolve(root, 'server/package.json'), 'utf8'))
      assert.equal(pkg.scripts.start, 'node dist/src/main.js')
      await worker.beforeApplicationShutdown()
      await prisma.$disconnect()
      let output = ''
      const child = spawn(process.execPath, ['dist/src/main.js'], { cwd: resolve(root, 'server'), env: { ...process.env, SERVER_PORT: '55443' }, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', data => { output = (output + data.toString()).slice(-4000) })
      child.stderr.on('data', data => { output = (output + data.toString()).slice(-4000) })
      try {
        let response
        for (let attempt = 0; attempt < 100; attempt++) {
          if (child.exitCode !== null) throw new Error('Production server exited before startup: ' + output)
          try { response = await fetch('http://127.0.0.1:55443/api/ai/bootstrap', { signal: AbortSignal.timeout(1000) }); break } catch {}
          await new Promise(r => setTimeout(r, 100))
        }
        assert.equal(response?.status, 401)
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = new Promise(r => child.once('exit', r))
          child.kill('SIGTERM')
          const deadline = setTimeout(() => child.kill('SIGKILL'), 5000)
          await exited; clearTimeout(deadline)
          assert(child.exitCode === 0 || child.signalCode === 'SIGTERM', 'Server did not shut down normally')
        }
        await prisma.$connect()
      }
    })
    console.log(JSON.stringify({ integrationChecks: passed, database: 'isolated PostgreSQL (PGlite)', realFeishuRequests: 0, modelRequests: 0, existingBusinessDatabaseTouched: false }))
  } finally {
    if (worker) await worker.beforeApplicationShutdown()
    if (app) await app.close()
    if (prisma) await prisma.$disconnect()
    if (socket) await socket.stop()
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
