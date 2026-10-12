// Isolated integration verification. Never accepts or connects to a business DATABASE_URL.
// Usage: AI_TEST_DB_RUNTIME=/absolute/temp/node_modules node server/scripts/verify-ai-assistant.cjs
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { resolve } = require('node:path')

async function main() {
  const runtime = process.env.AI_TEST_DB_RUNTIME
  if (!runtime || !runtime.startsWith('/private/tmp/yangshao-ai-db.')) throw new Error('Use an isolated temporary PGlite runtime')
  const { PGlite } = require(resolve(runtime, '@electric-sql/pglite'))
  const { PGLiteSocketServer } = require(resolve(runtime, '@electric-sql/pglite-socket'))
  const root = resolve(__dirname, '../..')
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55439/postgres?connection_limit=1&pool_timeout=30'
  process.env.JWT_SECRET = 'isolated-ai-integration-signing-secret-2026'
  process.env.AI_API_KEY_SECRET = 'isolated-ai-integration-cipher-secret-2026'
  const sql = execFileSync(resolve(root, 'server/node_modules/.bin/prisma'), ['migrate','diff','--from-empty','--to-schema-datamodel',resolve(root,'server/prisma/schema.prisma'),'--script'], { env: process.env, encoding: 'utf8' })
  const baseSql = sql.split(';').filter(statement => !/\b(?:CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE) "Ai/.test(statement)).join(';')
  const migration = readFileSync(resolve(root, 'server/prisma/migrations/20261009000000_add_ai_assistant/migration.sql'), 'utf8')
  const entryMigration=readFileSync(resolve(root,'server/prisma/migrations/20261011120000_ai_conversation_entry_context/migration.sql'),'utf8')
  const feishuMigration=readFileSync(resolve(root,'server/prisma/migrations/20261010010000_add_ai_feishu/migration.sql'),'utf8')
  assert(!/\bDROP\b|ALTER TABLE "(?!Ai)/.test(migration))
  assert(!/\bDROP\b|ALTER TABLE "(?!Ai)/.test(entryMigration))
  const db = await PGlite.create()
  let socket, app, prisma
  let passed = 0
  const check = (name, operation) => Promise.resolve().then(operation).then(() => { passed++; console.log(`PASS ${name}`) })
  try {
    await db.exec(baseSql)
    await db.exec(migration)
    await db.exec(readFileSync(resolve(root, 'server/prisma/migrations/20261010010000_add_ai_feishu/migration.sql'), 'utf8'))
    const ownerScopeMigration = readFileSync(resolve(root, 'server/prisma/migrations/20261011000000_add_ai_conversation_owner_scope/migration.sql'), 'utf8')
    assert(!/\bDROP\b|\bDELETE\b|\bUPDATE\b|\bTRUNCATE\b/.test(ownerScopeMigration))
    await db.exec(ownerScopeMigration)
    await db.exec(readFileSync(resolve(root,'server/prisma/migrations/20261011010000_split_ai_feishu_bots/migration.sql'),'utf8'))
    await db.exec(readFileSync(resolve(root,'server/prisma/migrations/20261011020000_add_feishu_owner_scope/migration.sql'),'utf8'))
    await db.exec(entryMigration)
    socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55439 })
    await socket.start()
    const { NestFactory } = require('@nestjs/core')
    const { AppModule } = require('../dist/src/app.module.js')
    const { PrismaService } = require('../dist/src/prisma/prisma.service.js')
    const { AiService } = require('../dist/src/ai/ai.service.js')
    const { AiBusinessService } = require('../dist/src/ai/ai-business.service.js')
    const { AiConfigService } = require('../dist/src/ai/ai-config.service.js')
    const { AiAccessService } = require('../dist/src/ai/ai-access.service.js')
    const { FeishuRuntime } = require('../dist/src/ai/feishu/feishu.runtime.js')
    const { resolveCurrentUserIdentity } = require('../dist/src/auth/current-user.js')
    const { defaultLabParameters, createEmptyInputs, calculateResults } = require('../dist/src/common/lab.js')
    const { businessDateInBeijing } = require('../dist/src/common/date.js')
    const { encryptAiKey } = require('../dist/src/ai/ai.security.js')
    const { catalog } = require('../dist/src/ai/ai.catalog.js')
    const jwt = require('jsonwebtoken')
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    app.setGlobalPrefix('api')
    // The channel worker has its own harness; keep these SQL checks deterministic.
    const feishuWorker = app.get(FeishuRuntime)
    feishuWorker.onApplicationBootstrap = () => {}
    feishuWorker.beforeApplicationShutdown = async () => {}
    await app.init()
    prisma = app.get(PrismaService)
    const ai = app.get(AiService), business = app.get(AiBusinessService), config = app.get(AiConfigService), access = app.get(AiAccessService)
    await prisma.user.createMany({ data: [
      { id: 'a', account: 'fixture-a', username: '测试甲', role: 'FRONTEND_USER', passwordHash: 'fixture', requiresAccessGuardPassword: false },
      { id: 'b', account: 'fixture-b', username: '测试乙', role: 'FRONTEND_USER', passwordHash: 'fixture', requiresAccessGuardPassword: false },
      { id: 'root', account: 'fixture-root', username: '测试管理员', role: 'ROOT_ADMIN', passwordHash: 'fixture' }
    ] })
    await prisma.aiSettings.create({ data: { id: 'global', enabled: true, blockedFields: { samples: ['inputs.note'] } } })
    const rules = [
      { resource: 'samples', readFields: ['inputs.ironRaw','inputs.note','results.iron'], writeFields: ['inputs.ironRaw'] },
      { resource: 'customers', readFields: ['name','phone'], writeFields: ['name','phone'] },
      { resource: 'expenses', readFields: ['paymentDate','item','amount','paymentMethod'], writeFields: ['paymentDate','item','amount','paymentMethod'] }
    ]
    await prisma.aiPolicy.create({ data: { subjectId: 'a', rules } })
    const model = await prisma.aiModel.create({ data: { name: '测试模型', modelId: 'fixture', baseUrl: 'https://api.example.com/v1', apiKeyCipher: encryptAiKey('fixture-key'), vision: true } })
    const actor = await resolveCurrentUserIdentity(prisma, 'a', 1), other = await resolveCurrentUserIdentity(prisma, 'b', 1), rootUser = await resolveCurrentUserIdentity(prisma, 'root', 1)
    const date = businessDateInBeijing()
    const inputs = { ...createEmptyInputs(0), ironRaw: 1, note: '禁止发送的数据' }
    const sheet = await prisma.labSheet.create({ data: { frontendUserId: 'a', date, parameters: defaultLabParameters, sampleBlocks: { create: { index: 0, inputs, results: calculateResults(inputs, defaultLabParameters), parameterSnapshot: defaultLabParameters } } }, include: { sampleBlocks: true } })
    await prisma.labSheet.create({ data: { frontendUserId: 'b', date, parameters: defaultLabParameters, sampleBlocks: { create: { index: 0, inputs: { ...inputs, ironRaw: 999 }, results: {}, parameterSnapshot: defaultLabParameters } } } })
    const createConversation = () => prisma.aiConversation.create({ data: { actorId: 'a', ownerId: 'a', modelId: model.id, settingsRevision: 1, authorizationHash: '', title: '隔离验收' } })
    const conversation = await createConversation()
    await prisma.aiConversation.update({ where: { id: conversation.id }, data: { authorizationHash: await access.authorizationHash(actor, 'a', {}) } })
    const context = { user: actor, ownerId: 'a', conversationId: conversation.id, grants: {} }
    const sampleId = sheet.sampleBlocks[0].id
    await check('additive migrations create assistant and channel tables and nullable entry context', async () => { assert.equal(await prisma.aiSettings.count(), 1);assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='AiConversation' AND column_name='entryContext'")).rows.length,1);assert.equal(await prisma.aiFeishuSession.count(),0) })
    await check('tenant and field filters on real SQL reads', async () => { const data = await business.query(context, 'samples', date); assert.equal(data.rows.length, 1); assert.equal(data.rows[0].inputs.ironRaw, 1); assert(!JSON.stringify(data).includes('禁止发送')); assert(!JSON.stringify(data).includes('parameterSnapshot')); assert(!JSON.stringify(data).includes('999')) })
    await check('foreign frontend account selection is rejected', async () => { await assert.rejects(() => access.owner(actor, 'b')) })
    let draft
    await check('proposal creation does not modify the sample', async () => { draft = await business.prepareSample(context, { blockId: sampleId, changes: { ironRaw: 2 } }); assert.equal((await prisma.sampleBlock.findUnique({ where: { id: sampleId } })).inputs.ironRaw, 1) })
    await check('confirmation does not accept injected replacement values', async () => { await assert.rejects(() => ai.confirm(actor, draft.proposalId, { decision: 'confirm', changes: { ironRaw: 100 } })); assert.equal((await prisma.sampleBlock.findUnique({ where: { id: sampleId } })).inputs.ironRaw, 1) })
    await check('foreign actor cannot confirm a draft', async () => { await assert.rejects(() => ai.confirm(other, draft.proposalId, { decision: 'confirm' })) })
    await check('atomic confirmed write and idempotent repeat', async () => { assert.equal((await ai.confirm(actor, draft.proposalId, { decision: 'confirm' })).status, 'APPLIED'); assert.equal((await ai.confirm(actor, draft.proposalId, { decision: 'confirm' })).status, 'APPLIED'); const saved = await prisma.sampleBlock.findUnique({ where: { id: sampleId } }); assert.equal(saved.inputs.ironRaw, 2); assert.deepEqual(saved.parameterSnapshot, defaultLabParameters); assert.equal(await prisma.cellChangeLog.count({ where: { blockId: sampleId, field: 'ironRaw' } }), 1); assert.equal(await prisma.aiAuditLog.count({ where: { proposalId: draft.proposalId, action: 'APPLIED' } }), 1) })
    await check('stale proposal rolls back without changing its status', async () => { const d = await business.prepareSample(context, { blockId: sampleId, changes: { ironRaw: 3 } }); await prisma.sampleBlock.update({ where: { id: sampleId }, data: { inputs: { ...inputs, ironRaw: 4 } } }); await assert.rejects(() => ai.confirm(actor, d.proposalId, { decision: 'confirm' })); assert.equal((await prisma.aiProposal.findUnique({ where: { id: d.proposalId } })).status, 'PENDING'); assert.equal((await prisma.sampleBlock.findUnique({ where: { id: sampleId } })).inputs.ironRaw, 4) })
    await check('expense insertion is confirmed, scoped and not duplicated', async () => { const d = await business.prepareCreate(context, 'expenses', { paymentDate: date, item: '测试支出', amount: 12.5, paymentMethod: 'cash' }); assert.equal(await prisma.financeEntry.count(), 0); await ai.confirm(actor, d.proposalId, { decision: 'confirm' }); await ai.confirm(actor, d.proposalId, { decision: 'confirm' }); assert.equal(await prisma.financeEntry.count({ where: { frontendUserId: 'a' } }), 1); assert.equal(await prisma.financeEntry.count({ where: { frontendUserId: 'b' } }), 0) })
    await check('customer creation cannot overwrite an existing record', async () => { const d = await business.prepareCreate(context, 'customers', { name: '测试客户', phone: 'fixture' }); await ai.confirm(actor, d.proposalId, { decision: 'confirm' }); await assert.rejects(() => business.prepareCreate(context, 'customers', { name: '测试客户', phone: 'overwrite' })); assert.equal((await prisma.customer.findFirst({ where: { frontendUserId: 'a', name: '测试客户' } })).phone, 'fixture') })
    await check('disabled actor is rejected during the write transaction', async () => { const d = await business.prepareCreate(context, 'expenses', { paymentDate: date, item: '不应写入', amount: 1, paymentMethod: 'cash' }); await prisma.user.update({ where: { id: 'a' }, data: { disabled: true } }); await assert.rejects(() => business.confirm(context, d.proposalId, 'confirm')); assert.equal(await prisma.financeEntry.count(), 1); await prisma.user.update({ where: { id: 'a' }, data: { disabled: false } }) })
    await check('ordinary accounts cannot read configuration secrets', async () => { await assert.rejects(() => config.getConfig(actor)); const c = await config.getConfig(rootUser); assert(!JSON.stringify(c).includes('apiKeyCipher')); assert(!JSON.stringify(c).includes('fixture-key')) })
    // Only synthetic fixtures in this isolated database receive the full test policy.
    const fullRules = catalog.map(entry => ({ resource: entry.key, readFields: entry.fields.map(field => field.key), writeFields: entry.fields.filter(field => field.writable).map(field => field.key) }))
    await prisma.aiPolicy.update({ where: { subjectId: 'a' }, data: { rules: fullRules } })
    await prisma.aiPolicy.create({ data: { subjectId: 'root', rules: fullRules } })
    const adminConversation = await prisma.aiConversation.create({ data: { actorId: 'root', ownerId: 'a', modelId: model.id, settingsRevision: 1, authorizationHash: await access.authorizationHash(rootUser, 'a', {}), title: '后台隔离验收' } })
    const adminContext = { user: rootUser, ownerId: 'a', conversationId: adminConversation.id, grants: {} }
    const change = async (resource, action, data, id, selected = context) => {
      const draft = await business.prepareOperation(selected, { resource, action, data, ...(id ? { id } : {}) })
      assert.equal((await prisma.aiProposal.findUnique({ where: { id: draft.proposalId } })).status, 'PENDING')
      assert.equal((await ai.confirm(selected.user, draft.proposalId, { decision: 'confirm' })).status, 'APPLIED')
      return draft
    }
    await check('every front and admin menu has an executable scoped query adapter', async () => {
      for (const entry of catalog) {
        if (entry.frontend) assert(Array.isArray((await business.query(context, entry.key, date)).rows), entry.key)
        if (entry.admin) assert(Array.isArray((await business.query(adminContext, entry.key, date)).rows), entry.key)
      }
    })
    let employeeId, leaveTypeId, commissionTypeId, medicineId, rechargeId
    await check('employee create and update join the confirmation transaction', async () => {
      await change('employees', 'create', { employeeNumber: 'AI-001', name: '验收员工', hireDate: date, baseSalary: 3000, attendanceBonus: 100, overtimeHourlyRate: 20, restQuotaDays: 4 })
      employeeId = (await prisma.employee.findFirst({ where: { frontendUserId: 'a' } })).id
      await change('employees', 'update', { phone: 'fixture-phone' }, employeeId)
      assert.equal(await prisma.employee.count({ where: { frontendUserId: 'b' } }), 0)
      assert.equal((await prisma.employee.findUnique({ where: { id: employeeId } })).phone, 'fixture-phone')
    })
    await check('stale generic drafts reject without partial writes or applied audit', async () => {
      const d = await business.prepareOperation(context, { resource: 'employees', action: 'update', id: employeeId, data: { name: '不应覆盖' } })
      await prisma.employee.update({ where: { id: employeeId }, data: { name: '其他操作已修改' } })
      await assert.rejects(() => ai.confirm(actor, d.proposalId, { decision: 'confirm' }))
      assert.equal((await prisma.employee.findUnique({ where: { id: employeeId } })).name, '其他操作已修改')
      assert.equal(await prisma.aiAuditLog.count({ where: { proposalId: d.proposalId, action: 'APPLIED' } }), 0)
      await ai.confirm(actor, d.proposalId, { decision: 'reject' })
    })
    await check('schedules, attendance, leave types and reviewed leave use original services', async () => {
      await change('schedules', 'save', { employeeId, date, isWorkday: true, segments: [{ startTime: '09:00', endTime: '17:00' }], remark: '验收排班' })
      await change('attendance', 'create', { employeeId, date, actualSegments: [{ checkInAt: `${date}T01:00:00Z`, checkOutAt: `${date}T09:00:00Z` }], remark: '验收打卡' })
      await change('leaveTypes', 'create', { name: '验收假', countsTowardRestQuota: false })
      leaveTypeId = (await prisma.employeeLeaveType.findFirst({ where: { frontendUserId: 'a' } })).id
      await change('leaves', 'create', { employeeId, leaveTypeId, startDate: date, endDate: date, unit: 'HOUR', hours: 1, reason: '验收请假' })
      const leave = await prisma.employeeLeaveRequest.findFirst({ where: { frontendUserId: 'a' } })
      await change('leaves', 'approve', { reviewRemark: '核对完成' }, leave.id)
      assert.equal((await prisma.employeeLeaveRequest.findUnique({ where: { id: leave.id } })).status, 'APPROVED')
    })
    await check('commission, bonus, payroll generation and adjustment keep snapshots private', async () => {
      await change('commissionTypes', 'create', { name: '验收提成', unitName: '件', unitPrice: 2 })
      commissionTypeId = (await prisma.employeeCommissionType.findFirst({ where: { frontendUserId: 'a' } })).id
      await change('commissions', 'create', { employeeId, commissionTypeId, date, quantity: 3 })
      await change('bonuses', 'create', { employeeId, date, amount: 10, reason: '验收奖励' })
      await change('payroll', 'generate', { month: date.slice(0, 7) })
      const item = await prisma.employeePayrollItem.findFirst({ where: { frontendUserId: 'a' } })
      await change('payrollAdjustments', 'create', { payrollItemId: item.id, amount: 1, reason: '验收调整' })
      const adjustment = await prisma.employeePayrollAdjustment.findFirst({ where: { frontendUserId: 'a' } })
      await change('payrollAdjustments', 'update', { amount: 2 }, adjustment.id)
      const visible = JSON.stringify(await business.query(context, 'payroll', date))
      assert(!visible.includes('calculationSnapshot')); assert(!visible.includes('ironFactor'))
      assert.equal((await prisma.employeePayrollAdjustment.findUnique({ where: { id: adjustment.id } })).amount.toNumber(), 2)
    })
    await check('medicine movements update stock atomically and repeats do not duplicate', async () => {
      await change('medicineNames', 'create', { name: '验收药品' })
      const d = await change('medicineInbounds', 'create', { occurredOn: date, name: '验收药品', unit: 'BOTTLE', quantity: 3 })
      medicineId = (await prisma.medicineInventoryItem.findFirst({ where: { frontendUserId: 'a' } })).id
      await ai.confirm(actor, d.proposalId, { decision: 'confirm' })
      await change('medicineOutbounds', 'create', { occurredOn: date, medicineItemId: medicineId, quantity: 1 })
      assert.equal((await prisma.medicineInventoryItem.findUnique({ where: { id: medicineId } })).currentQuantity.toNumber(), 2)
      assert.equal(await prisma.medicineInventoryMovement.count(), 2)
    })
    await check('recharge and reversal are scoped and shared balance is not exposed', async () => {
      await change('prepaidRecharges', 'create', { phone: '13000000001', rechargeDate: date, paidAmount: 100, giftAmount: 10, isOpeningBalance: false })
      const recharge = await prisma.sharedPrepaidRecharge.findFirst({ where: { ownerFrontendUserId: 'a' } }); rechargeId = recharge.id
      await prisma.sharedPrepaidRecharge.create({ data: { memberId: recharge.memberId, ownerFrontendUserId: 'b', rechargeDate: date, paidAmount: 999, giftAmount: 0, totalAmount: 999, remainingAmount: 999, actorUserId: 'b', idempotencyKey: 'fixture-b-recharge' } })
      assert.equal((await business.query(context, 'prepaidCustomers', date)).rows[0].remainingAmount, 110)
      await change('prepaidRecharges', 'reverse', { reason: '验收冲正' }, rechargeId)
      assert.equal((await business.query(context, 'prepaidCustomers', date)).rows[0].remainingAmount, 0)
    })
    await check('standard and template updates preserve private parameters and seal data', async () => {
      await change('standardSamples', 'update', { 'iron.highReading': 0.5 })
      await change('coefficients', 'update', { rowKind: 'standardRows', iron: 10 }, 'standard-1')
      const before = await prisma.frontendCalculationDraft.findFirst({ where: { frontendUserId: 'a', kind: 'COEFFICIENT' } })
      await change('coefficients', 'update', { rowKind: 'calculationRows', 'inputs.ironRaw': 0.5 }, 'calculation-1')
      const after = await prisma.frontendCalculationDraft.findFirst({ where: { frontendUserId: 'a', kind: 'COEFFICIENT' } })
      assert.deepEqual(after.payload.parameters, before.payload.parameters)
      await change('reportImage', 'update', { title: '验收报告' })
      await change('reportSms', 'update', { prefix: '验收前缀' })
      const stored = await prisma.frontendCalculationDraft.findFirst({ where: { frontendUserId: 'a', kind: 'STANDARD_SAMPLE' } })
      assert.equal(stored.payload.iron.highReading, 0.5)
      assert.equal((await business.query(context, 'reportImage', date)).rows[0].inspector, '检验员')
      assert(!JSON.stringify(await business.query(context, 'coefficients', date)).includes('parameters'))
    })
    await check('payment and monthly workflows keep confirmation and reminder routing scoped', async () => {
      await prisma.sampleBlock.update({ where: { id: sampleId }, data: { inputs: { ...inputs, ironRaw: 4, sampleNumber: '验收未结样品', price: 50, paymentStatus: '未结款' } } })
      await change('unsettled', 'remind', {}, sampleId, adminContext)
      await change('unsettled', 'markPaid', { paymentStatus: '已结款' }, sampleId)
      assert.equal((await prisma.sampleBlock.findUnique({ where: { id: sampleId } })).inputs.paymentStatus, '已结款')
      await prisma.sampleBlock.create({ data: { sheetId: sheet.id, index: 1, inputs: { ...inputs, sampleNumber: '验收月结样品', customerText: '隐藏的月结客户', price: 80, paymentStatus: '月结款' }, results: {}, parameterSnapshot: defaultLabParameters } })
      const initial = await business.query(context, 'monthly', date)
      assert(initial.rows.every(row => !row.id || !row.id.includes('隐藏的月结客户')))
      await change('monthly', 'update', { month: date.slice(0, 7), customer: '隐藏的月结客户', settlementStatus: '部分结款', paidAmount: 40, remark: '验收部分付款' })
      const record = await prisma.monthlySettlementRecord.findFirst({ where: { frontendUserId: 'a' } })
      await change('monthly', 'remind', {}, record.id, adminContext)
      assert.equal(await prisma.reminder.count({ where: { frontendUserId: 'a' } }), 2)
      await prisma.aiSettings.update({ where: { id: 'global' }, data: { blockedFields: { customers: ['name'] } } })
      for (const resource of ['monthly','customerOverview']) assert(!JSON.stringify(await business.query(context, resource, date)).includes('隐藏的月结客户'), resource)
      assert(!JSON.stringify(await business.query(adminContext, 'monthlyDaily', date)).includes('隐藏的月结客户'))
      await prisma.aiSettings.update({ where: { id: 'global' }, data: { blockedFields: { samples: ['inputs.note'] } } })
    })
    await check('blacklist and deletion requests stay in their original owner workflows', async () => {
      await change('blacklist', 'create', { phone: 'fixture-blacklist', note: '验收备注' })
      const entry = await prisma.blacklistRecord.findFirst({ where: { uploadedById: 'a' } })
      await change('blacklist', 'update', { note: '核对后的备注' }, entry.id)
      const expense = await prisma.financeEntry.findFirst({ where: { frontendUserId: 'a' } })
      await change('financeDeletionRequests', 'create', { sourceId: expense.id, reason: '验收申请' })
      const request = await prisma.financeDeletionRequest.findFirst({ where: { frontendUserId: 'a' } })
      await change('financeDeletionRequests', 'reject', { reviewRemark: '保留记录' }, request.id, adminContext)
      assert.equal(await prisma.financeEntry.count(), 1)
      assert.equal((await prisma.financeDeletionRequest.findUnique({ where: { id: request.id } })).status, 'REJECTED')
    })
    await check('admin scoped remarks cannot turn into ordinary frontend writes', async () => {
      await prisma.abnormalRecord.create({ data: { id: 'abnormal-a', sheetId: sheet.id, blockId: sampleId, frontendUserId: 'a', date, field: 'ironRaw', changeCount: 4 } })
      await change('abnormal', 'update', { remark: '已核对' }, 'abnormal-a', adminContext)
      await change('monthlyCustomers', 'update', { customer: '测试客户', remark: '验收月结备注' }, undefined, adminContext)
      await assert.rejects(() => business.prepareOperation(adminContext, { resource: 'employees', action: 'create', data: { employeeNumber: 'forbidden', name: '不允许', hireDate: date } }))
      assert.equal((await prisma.abnormalRecord.findUnique({ where: { id: 'abnormal-a' } })).remark, '已核对')
    })
    await check('foreign IDs, private fields and manual-only actions cannot create drafts', async () => {
      const foreign = await prisma.employee.create({ data: { frontendUserId: 'b', employeeNumber: 'B-001', name: '其他账号员工', hireDate: date } })
      await assert.rejects(() => business.prepareOperation(context, { resource: 'employees', action: 'update', id: foreign.id, data: { name: '越权' } }))
      await assert.rejects(() => business.prepareOperation(context, { resource: 'employees', action: 'update', id: employeeId, data: { idCard: 'secret' } }))
      await assert.rejects(() => business.prepareOperation(context, { resource: 'coefficients', action: 'update', id: 'row', data: { rowKind: 'standardRows', ironFactor: 100 } }))
      for (const [resource, action] of [['accounts','update'],['payroll','confirm'],['prepaidSettlements','create'],['sampleChangeRequests','approve']]) await assert.rejects(() => business.prepareOperation(context, { resource, action, data: {} }))
    })
    await check('global denials propagate across menu aliases and derived totals', async () => {
      await prisma.aiSettings.update({ where: { id: 'global' }, data: { blockedFields: { customers: ['phone'], expenses: ['amount'], employees: ['baseSalary'] } } })
      const recharge = JSON.stringify(await business.query(context, 'prepaidRecharges', date)); assert(!recharge.includes('13000000001'))
      const report = await business.query(context, 'reportsFinance', date); assert(report.rows.every(row => !('expense' in row) && !('profit' in row)))
      const payroll = await business.query(context, 'payroll', date); assert(payroll.rows.every(row => !('baseSalary' in row) && !('payableAmount' in row)))
      await prisma.aiSettings.update({ where: { id: 'global' }, data: { blockedFields: { samples: ['inputs.note'] } } })
    })
    // Registration checks use only this temporary database and synthetic accounts.
    const registrationBlocks = []
    for (const index of [10,11]) registrationBlocks.push(await prisma.sampleBlock.create({data:{sheetId:sheet.id,index,inputs:{...createEmptyInputs(index+1),sampleNumber:`隔离登记${index}`,price:0,paymentStatus:'未结款'},results:{},parameterSnapshot:defaultLabParameters}}))
    const registrationRows = registrationBlocks.map((block,index)=>({date,sequence:String(index+11).padStart(3,'0'),customerName:'整批新客户',createCustomer:true,price:60+index*20,paymentStatus:'月结款'}))
    await check('registration customer picker exposes only authorized owner names',async()=>{const names=await business.entryCustomers(rootUser,'a','测试',{});assert(names.every(row=>Object.keys(row).sort().join(',')==='id,name'));assert(!JSON.stringify(names).includes('fixture'))})
    await check('registration batch proposal creation rolls back if any position is invalid',async()=>{const count=await prisma.aiProposal.count();await assert.rejects(()=>business.prepareRegistrations(adminContext,[registrationRows[0],{...registrationRows[1],sequence:'missing'}]));assert.equal(await prisma.aiProposal.count(),count);assert.equal(await prisma.customer.count({where:{frontendUserId:'a',name:'整批新客户'}}),0)})
    let registrationResponse
    await check('quick entry creates scoped previews without modifying samples or customers',async()=>{registrationResponse=await ai.quickEntry(rootUser,{modelId:model.id,ownerId:'a',conversationId:adminConversation.id,rows:registrationRows});assert.equal(registrationResponse.proposals.filter(p=>p.status==='PENDING'&&p.preview.target).length,2);assert.equal(await prisma.customer.count({where:{frontendUserId:'a',name:'整批新客户'}}),0);for(const block of registrationBlocks)assert.equal((await prisma.sampleBlock.findUnique({where:{id:block.id}})).inputs.price,0)})
    const firstBatch=registrationResponse.proposals.filter(p=>p.status==='PENDING'&&p.preview.target).map(p=>p.id).sort()
    await check('one stale batch row rolls back earlier sample writes and customer creation',async()=>{const last=await prisma.aiProposal.findUnique({where:{id:firstBatch[1]}});const target=await prisma.sampleBlock.findUnique({where:{id:last.payload.blockId}});await prisma.sampleBlock.update({where:{id:target.id},data:{inputs:{...target.inputs,price:999}}});const before=await prisma.sampleBlock.findMany({where:{id:{in:registrationBlocks.map(b=>b.id)}},orderBy:{id:'asc'},select:{id:true,inputs:true}});await assert.rejects(()=>ai.confirmBatch(rootUser,{ids:firstBatch}));assert.deepEqual(await prisma.sampleBlock.findMany({where:{id:{in:registrationBlocks.map(b=>b.id)}},orderBy:{id:'asc'},select:{id:true,inputs:true}}),before);assert.equal(await prisma.customer.count({where:{frontendUserId:'a',name:'整批新客户'}}),0);assert.equal(await prisma.aiAuditLog.count({where:{proposalId:{in:firstBatch},action:'APPLIED'}}),0);assert.equal(await prisma.aiProposal.count({where:{id:{in:firstBatch},status:'PENDING'}}),2);for(const id of firstBatch)await ai.confirm(rootUser,id,{decision:'reject'})})
    let appliedBatch
    await check('atomic batch confirmation shares one new payer and preserves real admin audit actor',async()=>{const response=await ai.quickEntry(rootUser,{modelId:model.id,ownerId:'a',conversationId:adminConversation.id,rows:registrationRows});appliedBatch=response.proposals.filter(p=>p.status==='PENDING'&&p.preview.target).map(p=>p.id);assert.equal((await ai.confirmBatch(rootUser,{ids:appliedBatch})).results.length,2);const payer=await prisma.customer.findUnique({where:{frontendUserId_name:{frontendUserId:'a',name:'整批新客户'}}});assert(payer);for(let i=0;i<registrationBlocks.length;i++){const block=await prisma.sampleBlock.findUnique({where:{id:registrationBlocks[i].id}});assert.equal(block.inputs.price,60+i*20);assert.equal(block.inputs.paymentStatus,'月结款');assert.equal(block.inputs.customerId,payer.id);assert.deepEqual(block.inputs.customerIds,[payer.id])}assert.equal(await prisma.aiAuditLog.count({where:{proposalId:{in:appliedBatch},actorId:'root',ownerId:'a',action:'APPLIED'}}),2)})
    await check('repeated batch confirmation does not duplicate customers or ledger changes',async()=>{const count=await prisma.cellChangeLog.count();await ai.confirmBatch(rootUser,{ids:appliedBatch});assert.equal(await prisma.cellChangeLog.count(),count);assert.equal(await prisma.customer.count({where:{frontendUserId:'a',name:'整批新客户'}}),1)})
    await check('subadmin requires independent enablement and both AI and original owner scopes',async()=>{await prisma.user.create({data:{id:'sub-registration',account:'fixture-sub-registration',username:'隔离子管理员',role:'SUB_ADMIN',passwordHash:'fixture'}});await prisma.subAdminFrontendPermission.create({data:{subAdminId:'sub-registration',frontendUserId:'a',createdById:'root'}});const sub=await resolveCurrentUserIdentity(prisma,'sub-registration',1);assert.equal((await config.policy(sub.id)).enabled,false);await assert.rejects(()=>access.owner(sub,'a'));await prisma.aiPolicy.create({data:{subjectId:sub.id,enabled:true,rules:[{resource:'samples',readFields:['inputs.sequence','inputs.customerText','inputs.price','inputs.paymentStatus'],writeFields:['inputs.customerText','inputs.price','inputs.paymentStatus'],ownerIds:['a']}]}});assert.equal(await access.owner(sub,'a'),'a');await assert.rejects(()=>access.owner(sub,'b'));await assert.rejects(()=>access.fields(sub,'samples','write',{},undefined,'b'));const response=await ai.quickEntry(sub,{modelId:model.id,ownerId:'a',rows:[{...registrationRows[0],customerName:'测试客户',createCustomer:false,price:65}]});const proposal=response.proposals.find(p=>p.status==='PENDING');await prisma.subAdminFrontendPermission.deleteMany({where:{subAdminId:sub.id,frontendUserId:'a'}});await assert.rejects(()=>ai.confirm(sub,proposal.id,{decision:'confirm'}));assert.equal((await prisma.sampleBlock.findUnique({where:{id:registrationBlocks[0].id}})).inputs.price,60)})
    await check('prepaid registration stays on the original member and ledger workflow',async()=>{await assert.rejects(()=>business.prepareRegistration(adminContext,{...registrationRows[0],paymentStatus:'预存款'}));const count=await prisma.sharedPrepaidConsumption.count();assert.equal((await prisma.sampleBlock.findUnique({where:{id:registrationBlocks[0].id}})).inputs.paymentStatus,'月结款');assert.equal(await prisma.sharedPrepaidConsumption.count(),count)})
    await check('hierarchical entry options cover supported menus and exclude readonly resources',async()=>{const frontend=await ai.entryOptions(actor,undefined,{}),admin=await ai.entryOptions(rootUser,'a',{});for(const key of ['samples','standardSamples','coefficients','expenses','employees','attendance','medicineInbounds','medicineOutbounds','customers','blacklist'])assert(frontend.scenes.some(scene=>scene.key===key),key);for(const key of ['income','medicine','accounts','aiModels','prepaidSettlements'])assert(!frontend.scenes.some(scene=>scene.key===key),key);assert.deepEqual(frontend.scenes.find(scene=>scene.key==='samples').levels,['数据计算','数据计算']);assert.deepEqual(admin.scenes.find(scene=>scene.key==='monthly').levels,['财务报表','月结款明细','月结款账单明细']);assert(!admin.scenes.some(scene=>scene.key==='expenses'));assert(!admin.scenes.find(scene=>scene.key==='samples').writeFields.some(field=>field.key==='inputs.ironRaw'))})
    let entryResponse
    await check('manual entry form freezes its menu and date and never calls a model',async()=>{entryResponse=await ai.quickEntry(actor,{modelId:model.id,entryContext:{scene:'expenses',action:'create',date},data:{paymentDate:date,item:'快捷菜单支出',amount:35,paymentMethod:'cash'}});const saved=await prisma.aiConversation.findUnique({where:{id:entryResponse.conversationId}});assert.equal(saved.entryContext.scene,'expenses');assert(entryResponse.proposals[0].preview.entry);assert.equal(await prisma.financeEntry.count(),1);await assert.rejects(()=>ai.quickEntry(actor,{modelId:model.id,conversationId:saved.id,entryContext:{scene:'medicineInbounds',action:'create',date},data:{}}));await assert.rejects(()=>ai.quickEntry(actor,{modelId:model.id,conversationId:saved.id,entryContext:{scene:'expenses',action:'create',date},data:{paymentDate:'2000-01-01',item:'错误日期',amount:1,paymentMethod:'cash'}}));assert.equal(await prisma.financeEntry.count(),1)})
    await check('history reads and continues the original private context after a new conversation',async()=>{const listing=await ai.history(actor,{});assert(listing.items.some(item=>item.id===entryResponse.conversationId));assert(!listing.items.some(item=>item.id===adminConversation.id));const detail=await ai.conversation(actor,entryResponse.conversationId,undefined,{});assert(detail.messages.some(message=>message.role==='user'&&message.content.includes('快捷菜单支出')));assert.equal(detail.entryContext.scene,'expenses');await assert.rejects(()=>ai.conversation(other,entryResponse.conversationId,undefined,{}));await assert.rejects(()=>ai.conversation(rootUser,entryResponse.conversationId,'a',{}))})
    await check('history pages expose latest and older messages without a foreign cursor',async()=>{const c=await createConversation();await prisma.aiConversation.update({where:{id:c.id},data:{authorizationHash:await access.authorizationHash(actor,'a',{})}});const stamp=new Date('2026-01-01T00:00:00Z');await prisma.aiMessage.createMany({data:Array.from({length:65},(_,i)=>({id:`history-page-${String(i).padStart(3,'0')}`,conversationId:c.id,role:i%2?'assistant':'user',content:`历史第${i}条`,createdAt:new Date(stamp.getTime()+i*1000)}))});const recent=await ai.conversation(actor,c.id,undefined,{});assert.equal(recent.messages.length,60);assert(recent.hasMore);assert.equal(recent.messages[0].content,'历史第5条');const older=await ai.conversation(actor,c.id,undefined,{},recent.nextBeforeId);assert.equal(older.messages.length,5);assert(!older.hasMore);const foreign=await prisma.aiMessage.findFirst({where:{conversationId:entryResponse.conversationId}});await assert.rejects(()=>ai.conversation(actor,c.id,undefined,{},foreign.id))})
    await check('deleting history removes messages and drafts but retains applied data and audit',async()=>{const pending=entryResponse.proposals[0];await ai.confirm(actor,pending.id,{decision:'confirm'});const before=await prisma.financeEntry.findMany({orderBy:{id:'asc'}});assert.equal(before.length,2);assert.equal(await prisma.aiAuditLog.count({where:{proposalId:pending.id,action:'APPLIED'}}),1);await prisma.aiFeishuSession.create({data:{appId:'test',tenantKey:'test',openId:'test',chatId:'test',conversationId:entryResponse.conversationId}});await assert.rejects(()=>ai.deleteConversation(other,entryResponse.conversationId,{}));await prisma.aiConversation.update({where:{id:entryResponse.conversationId},data:{processingUntil:new Date(Date.now()+60000)}});await assert.rejects(()=>ai.deleteConversation(actor,entryResponse.conversationId,{}));await prisma.aiConversation.update({where:{id:entryResponse.conversationId},data:{processingUntil:null}});assert.deepEqual(await ai.deleteConversation(actor,entryResponse.conversationId,{}),{deleted:true});assert.equal(await prisma.aiMessage.count({where:{conversationId:entryResponse.conversationId}}),0);assert.equal(await prisma.aiProposal.count({where:{conversationId:entryResponse.conversationId}}),0);assert.deepEqual(await prisma.financeEntry.findMany({orderBy:{id:'asc'}}),before);assert.equal(await prisma.aiAuditLog.count({where:{proposalId:pending.id,action:'APPLIED'}}),1);assert.equal((await prisma.aiFeishuSession.findFirst()).conversationId,null);await assert.rejects(()=>ai.confirm(actor,pending.id,{decision:'confirm'}));await assert.rejects(()=>ai.conversation(actor,entryResponse.conversationId,undefined,{}))})
    await check('policy change revokes old conversation and drafts and hides sensitive history titles', async () => { const d = await business.prepareCreate(context, 'expenses', { paymentDate: date, item: '权限撤销', amount: 1, paymentMethod: 'cash' }); await config.savePolicy(rootUser, 'a', { enabled: true, rules: [] }); await assert.rejects(() => ai.confirm(actor, d.proposalId, { decision: 'confirm' })); assert.equal(await prisma.financeEntry.count(), 2);const history=await ai.history(actor,{});assert(history.items.every(item=>!item.available&&item.title==='历史会话（权限或访问授权已变化）')) })
    // Pagination/statistics fixtures are separate from all existing write-flow fixtures.
    await prisma.user.create({ data: { id: 'paged', account: 'fixture-paged', username: '分页验收', role: 'FRONTEND_USER', passwordHash: 'synthetic' } })
    await prisma.aiPolicy.create({ data: { subjectId: 'paged', rules: fullRules } })
    const pagedActor = await resolveCurrentUserIdentity(prisma, 'paged', 1)
    const pagedSheet = await prisma.labSheet.create({ data: { frontendUserId: 'paged', date, parameters: defaultLabParameters } })
    await prisma.sampleBlock.createMany({ data: Array.from({ length: 125 }, (_, index) => ({ sheetId: pagedSheet.id, index, inputs: { ...createEmptyInputs(index), ironRaw: 1, price: 0.1, sampleNumber: index >= 80 ? '后半段匹配' : '普通样品', note: '不得暴露的备注' }, results: {}, parameterSnapshot: defaultLabParameters })) })
    const pagedContext = { user: pagedActor, ownerId: 'paged', conversationId: 'isolated-pagination', grants: {} }
    let firstPage
    await check('real SQL pagination has 50/50/25 unique rows and persists continuation across turns', async () => {
      firstPage = await business.query(pagedContext, 'samples', date)
      const second = await business.continueQuery(pagedContext, 'samples')
      const third = await business.continueQuery(pagedContext)
      assert.deepEqual([firstPage.returned, second.returned, third.returned], [50, 50, 25])
      assert.deepEqual([firstPage.truncated, second.truncated, third.truncated], [true, true, false])
      assert.equal(firstPage.totalRecords, 125)
      assert.equal(new Set([...firstPage.rows, ...second.rows, ...third.rows].map(r => r.id)).size, 125)
      assert.equal((await business.continueQuery(pagedContext)).hasMore, false)
      assert(!JSON.stringify(firstPage).includes('不得暴露')); assert(!JSON.stringify(firstPage).includes('parameterSnapshot'))
    })
    await check('server summary scans all 125 rows and sums decimal money exactly', async () => {
      const summary = await business.summarize(pagedContext, 'samples', date)
      assert.equal(summary.complete, true); assert.equal(summary.totalRecords, 125)
      assert.equal(summary.totals['inputs.price'].value, '12.50')
      assert.equal(summary.sampleCounts.detected, 125); assert.equal(summary.sampleCounts.priced, 125)
      assert(!('rows' in summary)); assert.equal(await prisma.sampleBlock.count({ where: { sheetId: pagedSheet.id } }), 125)
      const income = await business.summarize(pagedContext, 'income', date)
      assert.equal(income.totals.sampleCount.value, 125); assert.equal(income.totals.totalAmount.value, '12.50')
    })
    await check('keyword search and exact page-end detection happen after authorization, not the first 50 rows', async () => {
      const page = await business.query(pagedContext, 'samples', date, '后半段匹配')
      assert.equal(page.totalRecords, 45); assert.equal(page.returned, 45); assert.equal(page.hasMore, false)
      assert.equal((await business.summarize(pagedContext, 'samples', date, '不得暴露')).totalRecords, 0)
    })
    await check('cursors reject changed data and another account or conversation', async () => {
      await assert.rejects(() => business.query({ ...pagedContext, conversationId: 'other' }, 'samples', date, '', { cursor: firstPage.nextCursor }))
      await assert.rejects(() => business.query({ ...pagedContext, ownerId: 'b' }, 'samples', date, '', { cursor: firstPage.nextCursor }))
      const first = await prisma.sampleBlock.findFirst({ where: { sheetId: pagedSheet.id }, orderBy: { index: 'asc' } })
      await prisma.sampleBlock.update({ where: { id: first.id }, data: { inputs: { ...first.inputs, ironRaw: 2 } } })
      await assert.rejects(() => business.query(pagedContext, 'samples', date, '', { cursor: firstPage.nextCursor }))
    })
    await check('real SQL scans past multiple source batches and supports expense-only report days', async () => {
      const earlier = new Date(date + 'T00:00:00Z'); earlier.setUTCDate(earlier.getUTCDate() - 1)
      const earlierDate = earlier.toISOString().slice(0, 10)
      await prisma.financeEntry.createMany({ data: Array.from({ length: 501 }, (_, index) => ({ frontendUserId: 'paged', paymentDate: earlierDate, item: index >= 300 ? '晚段支出' : '普通支出', amount: 0.1, paymentMethod: 'cash' })) })
      const summary = await business.summarize(pagedContext, 'expenses', undefined, '', { startDate: earlierDate, endDate: date })
      assert.equal(summary.totalRecords, 501); assert.equal(summary.totals.amount.value, '50.10')
      const late = await business.query(pagedContext, 'expenses', undefined, '晚段支出', { startDate: earlierDate, endDate: date })
      assert.equal(late.totalRecords, 201); assert.equal(late.returned, 50); assert.equal(late.hasMore, true)
      const report = await business.summarize(pagedContext, 'reportsFinance', undefined, '', { startDate: earlierDate, endDate: date })
      assert.equal(report.totals.expense.value, '50.10'); assert.equal(report.totals.income.value, '12.50')
    })
    await check('real access-password gates exclude completed rows from full summaries and require historical unlock', async () => {
      const group = await prisma.accessGuardGroup.create({ data: { frontendUserId: 'paged', name: '分页访问验收', password: 'fixture-password', recoveryPrompt: 'fixture', recoveryAnswer: 'fixture', features: { create: [{ frontendUserId: 'paged', feature: 'COMPLETED_SAMPLE_DATA' }, { frontendUserId: 'paged', feature: 'HISTORICAL_DATES' }] } } })
      const sample = await prisma.sampleBlock.findFirst({ where: { sheetId: pagedSheet.id } })
      await prisma.sampleBlock.update({ where: { id: sample.id }, data: { inputs: { ...sample.inputs, completed: true } } })
      assert.equal((await business.summarize(pagedContext, 'samples', date)).totalRecords, 124)
      await assert.rejects(() => business.summarize(pagedContext, 'samples', '2000-01-01'))
      const { AuthService } = require('../dist/src/auth/auth.service.js')
      const grant = await app.get(AuthService).verifyAccessGuardGroup(pagedActor, group.id, 'fixture-password')
      const unlocked = { ...pagedContext, grants: { COMPLETED_SAMPLE_DATA: grant.token, HISTORICAL_DATES: grant.token } }
      assert.equal((await business.summarize(unlocked, 'samples', date)).totalRecords, 125)
      assert.equal((await business.summarize(unlocked, 'samples', '2000-01-01')).totalRecords, 0)
    })
    await check('authorized multi-owner reads preserve provenance, per-owner totals and the combined page limit', async () => {
      await prisma.user.create({ data: { id: 'z-paged-second', account: 'fixture-paged-second', username: '第二授权账号', role: 'FRONTEND_USER', passwordHash: 'synthetic' } })
      const secondSheet = await prisma.labSheet.create({ data: { frontendUserId: 'z-paged-second', date, parameters: defaultLabParameters } })
      await prisma.sampleBlock.createMany({ data: Array.from({ length: 30 }, (_, index) => ({ sheetId: secondSheet.id, index, inputs: { ...createEmptyInputs(index), ironRaw: 1, price: 0.2 }, results: {}, parameterSnapshot: defaultLabParameters })) })
      const multi = { user: rootUser, ownerId: 'paged', ownerIds: ['paged', 'z-paged-second'], conversationId: 'multi-read', grants: {} }
      const first = await business.query(multi, 'samples', date)
      assert.equal(first.returned, 50); assert.equal(first.totalRecords, 155)
      const pages = [first]
      while (pages.at(-1).hasMore) pages.push(await business.continueQuery(multi))
      assert.deepEqual(pages.map(p => p.returned), [50, 50, 50, 5])
      assert(pages.flatMap(p => p.rows).every(row => multi.ownerIds.includes(row.owner.id)))
      assert.equal(pages.flatMap(p => p.rows).filter(row => row.owner.id === 'z-paged-second').length, 30)
      const summary = await business.summarize(multi, 'samples', date)
      assert.equal(summary.totals['inputs.price'].value, '18.50')
      assert.deepEqual(summary.accounts.map(a => a.totals['inputs.price'].value), ['12.50', '6.00'])
      await assert.rejects(() => business.query({ ...multi, ownerIds: ['paged'] }, 'samples', date, '', { cursor: first.nextCursor }))
      for (const action of [() => business.prepareCreate(multi, 'expenses', {}), () => business.prepareSample(multi, {}), () => business.prepareOperation(multi, {}), () => business.confirm(multi, 'fake', 'confirm')]) await assert.rejects(action)
    })
    await check('one unauthorized or disabled account rejects the complete group; frontend remains isolated', async () => {
      await prisma.user.create({ data: { id: 'paged-admin', account: 'fixture-paged-admin', username: '授权管理员', role: 'SUB_ADMIN', passwordHash: 'synthetic' } })
      await prisma.subAdminFrontendPermission.create({ data: { subAdminId: 'paged-admin', frontendUserId: 'paged', createdById: 'root' } })
      await prisma.aiPolicy.create({ data: { subjectId: 'paged-admin', rules: fullRules } })
      const limitedAdmin = await resolveCurrentUserIdentity(prisma, 'paged-admin', 1)
      const multi = { user: limitedAdmin, ownerId: 'paged', ownerIds: ['paged', 'z-paged-second'], conversationId: 'scope-denial', grants: {} }
      await assert.rejects(() => business.query(multi, 'samples', date))
      await assert.rejects(() => business.query({ ...multi, user: pagedActor }, 'samples', date))
      await prisma.user.update({ where: { id: 'z-paged-second' }, data: { disabled: true } })
      await assert.rejects(() => business.summarize({ ...multi, user: rootUser }, 'samples', date))
      await prisma.user.update({ where: { id: 'z-paged-second' }, data: { disabled: false } })
    })
    await check('conversation scope migration keeps legacy history valid and blocks forged multi-account confirmation', async () => {
      assert.deepEqual((await prisma.aiConversation.findUnique({ where: { id: conversation.id } })).ownerIds, [])
      const ownerIds = ['paged', 'z-paged-second']
      const saved = await prisma.aiConversation.create({ data: { actorId: 'root', ownerId: 'paged', ownerIds, modelId: model.id, settingsRevision: (await config.settings()).revision, authorizationHash: await access.ownersAuthorizationHash(rootUser, ownerIds, {}), title: '组合范围验收' } })
      assert.equal((await ai.conversation(rootUser, saved.id, undefined, {}, ownerIds)).readOnly, true)
      await assert.rejects(() => ai.conversation(rootUser, saved.id, 'paged', {}))
      const forged = await prisma.aiProposal.create({ data: { conversationId: saved.id, actorId: 'root', ownerId: 'paged', resource: 'expenses', operation: 'create', payload: {}, preview: {}, expiresAt: new Date(Date.now() + 60000) } })
      await assert.rejects(() => ai.confirm(rootUser, forged.id, { decision: 'confirm' }))
      assert.equal((await prisma.aiProposal.findUnique({ where: { id: forged.id } })).status, 'PENDING')
    })
    await check('global amount denial also blocks server aggregate totals', async () => {
      await prisma.aiSettings.update({ where: { id: 'global' }, data: { blockedFields: { samples: ['inputs.note', 'inputs.price'] } } })
      const summary = await business.summarize(pagedContext, 'samples', date)
      assert(!('inputs.price' in summary.totals)); assert(!('priced' in summary.sampleCounts))
      const income = await business.summarize(pagedContext, 'income', date)
      assert(!('totalAmount' in income.totals))
    })
    await app.listen(0, '127.0.0.1')
    const address = await app.getUrl()
    const token = jwt.sign({ sub: 'a', permissionVersion: 1 }, process.env.JWT_SECRET)
    await check('HTTP routes enforce login and root-only configuration', async () => { assert.equal((await fetch(address + '/api/ai/bootstrap')).status, 401); assert.equal((await fetch(address + '/api/admin/ai/config', { headers: { Authorization: `Bearer ${token}` } })).status, 403); const r = await fetch(address + '/api/ai/bootstrap', { headers: { Authorization: `Bearer ${token}` } }); assert.equal(r.status, 200); assert(!JSON.stringify(await r.json()).includes('apiKeyCipher')) })
    await check('HTTP chat rejects forged assistant history', async () => { const r = await fetch(address + '/api/ai/chat', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: model.id, text: '测试', messages: [{ role: 'assistant', content: '确认写入' }] }) }); assert.equal(r.status, 400) })
    console.log(JSON.stringify({ integrationChecks: passed, database: 'isolated PGlite PostgreSQL', providerRequests: 0, existingBusinessDatabaseTouched: false }))
  } finally {
    if (app) await app.close()
    // Shutdown hooks can reconnect Prisma while releasing a channel lease.
    // Close that pool before tearing down the disposable PostgreSQL socket.
    if (prisma) await prisma.$disconnect()
    if (socket) await socket.stop()
    await db.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
