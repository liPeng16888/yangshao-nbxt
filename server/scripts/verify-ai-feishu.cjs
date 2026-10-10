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
  let socket, app, worker
  let passed = 0
  const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`) }
  try {
    await db.exec(sql.split(';').filter(s => !s.includes('"AiFeishu')).join(';'))
    await db.exec(migration)
    socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55442 })
    await socket.start()
    const { NestFactory } = require('@nestjs/core')
    const { AppModule } = require('../dist/src/app.module')
    const { PrismaService } = require('../dist/src/prisma/prisma.service')
    const { AiService } = require('../dist/src/ai/ai.service')
    const { AiBusinessService } = require('../dist/src/ai/ai-business.service')
    const { AiAccessService } = require('../dist/src/ai/ai-access.service')
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
    const prisma = app.get(PrismaService), service = app.get(FeishuService), ai = app.get(AiService), business = app.get(AiBusinessService), access = app.get(AiAccessService)
    for (const [id, role, extra] of [['root', 'ROOT_ADMIN', {}], ['a', 'FRONTEND_USER', {}], ['b', 'FRONTEND_USER', {}], ['sub', 'FRONTEND_SUB_USER', { parentFrontendUserId: 'a', requiresAccessGuardPassword: false }], ['admin', 'SUB_ADMIN', {}]]) await prisma.user.create({ data: { id, account: id, username: `验收-${id}`, passwordHash: 'synthetic-password-hash', role, ...extra } })
    await prisma.frontendSubAccountPermission.create({ data: { subAccountId: 'sub', permission: 'FINANCE_EXPENSES' } })
    await prisma.subAdminFrontendPermission.create({ data: { subAdminId: 'admin', frontendUserId: 'a', createdById: 'root' } })
    const actor = id => resolveCurrentUserIdentity(prisma, id, 1)
    const rootUser = await actor('root'), a = await actor('a'), b = await actor('b'), sub = await actor('sub'), admin = await actor('admin')
    await prisma.aiSettings.create({ data: { id: 'global', enabled: true } })
    await prisma.aiPolicy.create({ data: { subjectId: '*', enabled: true, rules: [{ resource: 'expenses', readFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'], writeFields: ['paymentDate', 'item', 'amount', 'paymentMethod', 'remark'] }] } })
    const model = await prisma.aiModel.create({ data: { id: 'model', name: '测试模型', modelId: 'fixture', baseUrl: 'https://model.example.com/v1', apiKeyCipher: encryptAiKey('fixture-key'), vision: true } })
    const peer = { appId: 'test-app', tenantKey: 'test-tenant', openId: 'operator', chatId: 'private-chat' }
    await check('default off, root-only management and encrypted masked secret', async () => {
      assert.equal((await service.getConfig(rootUser)).enabled, false)
      await assert.rejects(() => service.getConfig(a))
      await assert.rejects(() => service.saveConfig(a, {}))
      await assert.rejects(() => service.saveConfig(rootUser, { appId: 'test-app', appSecret: 'fixture-secret', publicSiteUrl: 'http://localhost:5173', enabled: true }))
      const config = await service.saveConfig(rootUser, { appId: 'test-app', appSecret: 'fixture-secret', publicSiteUrl: 'https://lab.example.com', enabled: true })
      assert(config.hasSecret); assert(!JSON.stringify(config).includes('fixture-secret')); assert(!JSON.stringify(config).includes('Cipher'))
      assert.notEqual((await prisma.aiFeishuConfig.findUnique({ where: { id: 'global' } })).appSecretCipher, 'fixture-secret')
    })
    const bind = async (user, selectedPeer = peer) => {
      const invitation = await service.invitations(rootUser, { userId: user.id, defaultModelId: model.id })
      const claimed = await service.handle(selectedPeer, { kind: 'message', text: invitation.command })
      const proof = /#proof=([A-Za-z0-9_-]+)/.exec(claimed[0].content)[1]
      return { invitation, proof, confirm: () => service.confirmBinding(user, { proof }) }
    }
    let bindingA, bindingB
    await check('owner confirmation, wrong-account denial, one-use instructions and proof', async () => {
      const i = await bind(a)
      await assert.rejects(() => service.resolveBinding(b, { proof: i.proof }))
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: i.invitation.command }))
      assert.equal((await service.resolveBinding(a, { proof: i.proof })).account, 'a')
      bindingA = await i.confirm()
      await assert.rejects(() => i.confirm())
      assert.equal((await prisma.aiFeishuBinding.findUnique({ where: { userId: 'a' } })).openId, peer.openId)
    })
    await check('one website identity cannot be shared; one operator can bind multiple identities', async () => {
      await assert.rejects(() => service.invitations(rootUser, { userId: 'a', defaultModelId: model.id }))
      bindingB = await (await bind(b)).confirm()
      const s = await service.session(peer)
      assert.equal(s.bindingId, bindingA.bindingId) // New binding does not silently switch.
      assert.equal(await prisma.aiFeishuBinding.count({ where: { openId: peer.openId } }), 2)
    })
    await check('expired invitation and unauthorized/disabled models cannot bind', async () => {
      const i = await service.invitations(rootUser, { userId: 'sub', defaultModelId: model.id })
      await prisma.aiFeishuInvitation.updateMany({ where: { userId: 'sub' }, data: { expiresAt: new Date(0) } })
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: i.command }))
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: ['a'] } })
      await assert.rejects(() => service.invitations(rootUser, { userId: 'sub', defaultModelId: model.id }))
      await prisma.aiModel.update({ where: { id: model.id }, data: { allowedUserIds: [] } })
    })
    const originalChat = ai.chat.bind(ai)
    let chats = 0
    // Replace only the external model turn. Data authorization and confirmation use real services.
    ai.chat = async (user, input, channel) => {
      chats++; await channel.assertCurrent()
      const settings = await prisma.aiSettings.findUnique({ where: { id: 'global' } })
      const ownerId = await access.owner(user, input.ownerId)
      const conversation = input.conversationId ? await prisma.aiConversation.findUnique({ where: { id: input.conversationId } }) : await prisma.aiConversation.create({ data: { actorId: user.id, ownerId, modelId: model.id, settingsRevision: settings.revision, authorizationHash: await access.authorizationHash(user, ownerId, input.grants), title: '飞书验收' } })
      const ctx = { user, ownerId, conversationId: conversation.id, grants: input.grants, channel }
      if (input.text === '新增支出') {
        await business.prepareCreate(ctx, 'expenses', { paymentDate: businessDateInBeijing(), item: '验收支出', amount: 12.5, paymentMethod: 'cash' })
      } else await business.query(ctx, 'expenses')
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
      const adminPeer = { ...peer, openId: 'admin-operator', chatId: 'admin-chat' }
      await (await bind(admin, adminPeer)).confirm()
      assert.equal((await service.handle(adminPeer, { kind: 'message', text: '查询' }))[0].type, 'card')
      await assert.rejects(() => access.owner(admin, 'b'))
      await assert.rejects(() => business.prepareCreate({ user: admin, ownerId: 'a', conversationId: 'unused', grants: {} }, 'expenses', { paymentDate: businessDateInBeijing(), item: 'forbidden', amount: 1, paymentMethod: 'cash' }))
    })
    await check('revocation during confirmation transaction blocks the original business write', async () => {
      const result = await service.handle(subPeer, { kind: 'message', text: '新增支出' })
      const token = tokenOf(result.find(o => o.type === 'card')), scope = result[0].scope
      await service.unbind(rootUser, (await prisma.aiFeishuBinding.findUnique({ where: { userId: 'sub' } })).id)
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
    worker = new FeishuRuntime(prisma, service, transport)
    await prisma.aiFeishuEvent.updateMany({ data: { status: 'SENT' } }) // Binding notifications are synthetic fixture setup.
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
      const c = await service.settings()
      await prisma.aiFeishuEvent.create({ data: { ...peer, configRevision: c.revision, eventKey: 'crash-job', inputCipher: encryptAiKey(JSON.stringify({ kind: 'message', text: '新增支出' })), status: 'PROCESSING' } })
      worker = new FeishuRuntime(prisma, service, transport)
      const before = chats
      await worker.tick()
      const e = await prisma.aiFeishuEvent.findFirst({ where: { eventKey: 'crash-job' } })
      assert.equal(e.status, 'SENT'); assert.equal(chats, before); assert.equal(await prisma.financeEntry.count(), 3)
    })
    await app.listen(0, '127.0.0.1')
    const address = await app.getUrl(), jwt = require('jsonwebtoken')
    const headers = id => ({ Authorization: `Bearer ${jwt.sign({ sub: id, permissionVersion: 1 }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' })
    await check('HTTP authentication and root-only endpoints; no unauthenticated business entrypoint', async () => {
      assert.equal((await fetch(address + '/api/admin/ai/feishu/config')).status, 401)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/config', { headers: headers('a') })).status, 403)
      assert.equal((await fetch(address + '/api/admin/ai/feishu/config', { headers: headers('root') })).status, 200)
      assert.equal((await fetch(address + '/api/ai/feishu/bind/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    })
    await check('turning channel off preserves original website AI and business records', async () => {
      await service.saveConfig(rootUser, { appId: 'test-app', publicSiteUrl: 'https://lab.example.com', enabled: false })
      await assert.rejects(() => service.handle(peer, { kind: 'message', text: '状态' }))
      assert((await ai.bootstrap(a)).enabled)
      assert.equal(await prisma.financeEntry.count(), 3)
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
    if (socket) await socket.stop()
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
