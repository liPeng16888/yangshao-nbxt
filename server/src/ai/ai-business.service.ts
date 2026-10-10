import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { LabSheetsService } from '../lab-sheets/lab-sheets.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'
import { businessDateInBeijing } from '../common/date'
import { AiAccessService } from './ai-access.service'
import { catalog, customerSchema, dateSchema, expenseSchema, projectedRow, sampleFields, samplePatchSchema, type Grants, type Resource } from './ai.catalog'
import { AiDataService, jsonSafe } from './ai-data.service'
import { AiOperationService, type AiSavedOperation } from './ai-operation.service'

type Context = { user: CurrentUser; ownerId: string; conversationId: string; grants: Grants; channel?: import('./ai-channel').AiChannelContext }
type JsonRecord = Record<string, unknown>
export type Preview = { title: string; account: string; location: string; fields: { key: string; label: string; before: unknown; after: unknown }[]; warnings: string[] }

@Injectable()
export class AiBusinessService {
  constructor(private readonly prisma: PrismaService, private readonly access: AiAccessService, private readonly sheets: LabSheetsService, private readonly realtime: TenantRealtimeService, @Optional() private readonly data?: AiDataService, @Optional() private readonly operations?: AiOperationService) {}
  capabilities(context:Context,resource:Resource) { if(!this.operations) throw new ForbiddenException('业务能力不可用'); return this.operations.capabilities(context,resource) }
  async prepareOperation(context:Context,input:unknown) {
    if(!this.operations) throw new ForbiddenException('业务能力不可用')
    const draft=await this.operations.prepare(context,input)
    const preview=await this.preview(context,draft.title,draft.location,draft.fields)
    return this.proposal(context,draft.resource,'business',draft.payload,preview)
  }
  async query(context: Context, resource: Resource, date?: string, keyword = '') {
    const fields = await this.access.fields(context.user, resource, 'read', context.grants)
    let rows: JsonRecord[] = []
    if (resource === 'samples') {
      const day = dateSchema.parse(date || businessDateInBeijing())
      await this.access.sampleProtection(context.user, day, false, context.grants)
      const blocks = await this.prisma.sampleBlock.findMany({ where: { sheet: { frontendUserId: context.ownerId, date: day } }, orderBy: { index: 'asc' }, take: 50,
        select: { id: true, index: true, inputs: true, results: true } })
      for (const block of blocks) {
        try { await this.access.sampleProtection(context.user, day, Boolean((block.inputs as JsonRecord).completed), context.grants) } catch { continue }
        rows.push({ id: block.id, position: `数据计算/${day}/第${block.index + 1}个样品`, ...projectedRow(block, fields) })
      }
    } else if (resource === 'customers') {
      const items = await this.prisma.customer.findMany({ where: { frontendUserId: context.ownerId }, take: 50, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, phone: true, wechat: true, wechatNickname: true } })
      rows = items.map(row => ({ id: row.id, ...projectedRow(row, fields) }))
    } else if (resource === 'expenses') {
      const month = date ? dateSchema.parse(date).slice(0, 7) : businessDateInBeijing().slice(0, 7)
      const items = await this.prisma.financeEntry.findMany({ where: { frontendUserId: context.ownerId, paymentDate: { startsWith: month } }, take: 50, orderBy: { paymentDate: 'desc' }, select: { id: true, paymentDate: true, item: true, amount: true, paymentMethod: true, remark: true } })
      rows = items.map(row => ({ id: row.id, ...projectedRow({ ...row, amount: Number(row.amount) }, fields) }))
    } else if (resource === 'medicine') {
      const items = await this.prisma.medicineInventoryItem.findMany({ where: { frontendUserId: context.ownerId }, take: 50, orderBy: { name: 'asc' }, select: { id: true, name: true, unit: true, currentQuantity: true } })
      rows = items.map(row => ({ id: row.id, ...projectedRow({ ...row, currentQuantity: Number(row.currentQuantity) }, fields) }))
    } else {
      if(!this.data) throw new ForbiddenException('业务查询不可用')
      const items=await this.data.rows(context.ownerId,resource,date,context.user)
      rows=items.map(item=>{const row=jsonSafe(item);return {...(row.id?{id:row.id}:{}),...(row.rowKind?{rowKind:row.rowKind}:{}),...projectedRow(row,fields)}})
    }
    // Search only the projected values: a hidden field must never become a search oracle.
    if (keyword) rows = rows.filter(row => JSON.stringify(row).toLowerCase().includes(keyword.toLowerCase()))
    await this.prisma.aiAuditLog.create({ data: { actorId: context.user.id, ownerId: context.ownerId, action: 'READ', resource, detail: { ...context.channel?.audit, fields, returned: rows.length } } })
    return { rows, scope: '当前选定账号，最多 50 条；仅包含已授权字段', truncated: rows.length === 50 }
  }
  private async requireWrite(context: Context, resource: Resource, keys: string[], transaction?: Prisma.TransactionClient) {
    const read = await this.access.fields(context.user, resource, 'read', context.grants, transaction)
    const write = await this.access.fields(context.user, resource, 'write', context.grants, transaction)
    if (keys.some(k => !write.includes(k) || !read.includes(k))) throw new ForbiddenException('草稿包含禁止读取或写入的字段')
  }
  async prepareSample(context: Context, input: unknown) {
    const { blockId, changes } = samplePatchSchema.parse(input)
    for (const [key, value] of Object.entries(changes)) {
      const isText = ['sequence', 'sampleNumber', 'customerText', 'elementNote', 'note'].includes(key)
      if (value !== null && (isText ? typeof value !== 'string' : typeof value !== 'number')) throw new BadRequestException('请核对原始值类型，不能将检测结果直接写入原始值')
      if (typeof value === 'number' && value < 0 && !['siliconAdjust', 'aluminumAdjust'].includes(key)) throw new BadRequestException('原始检测值不能为负数')
    }
    await this.requireWrite(context, 'samples', Object.keys(changes).map(k => `inputs.${k}`))
    const block = await this.prisma.sampleBlock.findFirst({ where: { id: blockId, sheet: { frontendUserId: context.ownerId } }, include: { sheet: { select: { id: true, date: true, readonly: true } } } })
    if (!block) throw new NotFoundException('未找到当前账号的样品')
    this.assertEditable(block)
    const inputs = block.inputs as JsonRecord
    const preview = await this.preview(context, '修改样品数据', `数据计算/${block.sheet.date}/第${block.index + 1}个样品`, Object.entries(changes).map(([key, value]) => ({ key, label: sampleFields[key as keyof typeof sampleFields], before: inputs[key] ?? null, after: value })))
    return this.proposal(context, 'samples', 'update', { blockId, sheetId: block.sheetId, date: block.sheet.date, changes, baseUpdatedAt: block.updatedAt.toISOString(), baseInputs: Object.fromEntries(Object.keys(changes).map(k => [k, inputs[k] ?? null])) }, preview)
  }
  async prepareCreate(context: Context, resource: 'customers' | 'expenses', input: unknown) {
    const data = resource === 'customers' ? customerSchema.parse(input) : expenseSchema.parse(input)
    await this.requireWrite(context, resource, Object.keys(data))
    if (resource === 'customers' && await this.prisma.customer.findUnique({ where: { frontendUserId_name: { frontendUserId: context.ownerId, name: (data as { name: string }).name } }, select: { id: true } })) throw new ConflictException('该客户已存在，请在客户资料中核对，AI 不会覆盖现有客户')
    const entry = catalog.find(c => c.key === resource)!
    const preview = await this.preview(context, resource === 'customers' ? '新增客户资料' : '新增财务支出', resource === 'customers' ? '客户资料/新增' : `财务支出/${(data as { paymentDate: string }).paymentDate}`, Object.entries(data).map(([key, value]) => ({ key, label: entry.fields.find(f => f.key === key)!.label, before: null, after: value })))
    return this.proposal(context, resource, 'create', data, preview)
  }
  private async preview(context: Context, title: string, location: string, fields: Preview['fields']): Promise<Preview> {
    const owner = await this.prisma.user.findUnique({ where: { id: context.ownerId }, select: { account: true, username: true } })
    return { title, account: `${owner?.username || ''}（${owner?.account || ''}）`, location, fields, warnings: ['请逐项核对位置和数据；照片识别可能有误。草稿 15 分钟后过期。'] }
  }
  private async proposal(context: Context, resource: Resource, operation: string, payload: object, preview: Preview) {
    if (await this.prisma.aiProposal.count({ where: { conversationId: context.conversationId, status: 'PENDING', expiresAt: { gt: new Date() } } }) >= 5) throw new BadRequestException('请先处理已有的待确认草稿')
    const row = await this.prisma.aiProposal.create({ data: { conversationId: context.conversationId, actorId: context.user.id, ownerId: context.ownerId, resource, operation, payload: payload as Prisma.InputJsonValue, preview: preview as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } })
    await this.prisma.aiAuditLog.create({ data: { actorId: context.user.id, ownerId: context.ownerId, action: 'PROPOSED', resource, proposalId: row.id, ...(context.channel ? { detail: context.channel.audit } : {}) } })
    return { proposalId: row.id, status: 'PENDING', message: '草稿已生成，尚未写入。用户必须在确认卡片中核对并点击确认。' }
  }
  assertEditable(block: { readonly: boolean; inputs: unknown; sheet: { date: string; readonly: boolean } }) {
    if (block.sheet.date !== businessDateInBeijing() || block.sheet.readonly || block.readonly || (block.inputs as JsonRecord).completed) throw new ForbiddenException('历史、锁定或检测完成的样品不能由 AI 直接修改，请使用原有修改申请流程')
  }
  async confirm(context: Context, id: string, decision: 'confirm' | 'reject') {
    const afterCommit:(()=>void)[]=[]
    const result = await this.prisma.$transaction(async tx => {
      await context.channel?.assertCurrent(tx)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AiSettings" WHERE "id" = 'global' FOR SHARE`)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AiProposal" WHERE "id" = ${id} FOR UPDATE`)
      const settings = await tx.aiSettings.findUnique({ where: { id: 'global' } })
      const conversation = await tx.aiConversation.findFirst({ where: { id: context.conversationId, actorId: context.user.id, ownerId: context.ownerId } })
      if (!settings?.enabled || !conversation || conversation.settingsRevision !== settings.revision) throw new ConflictException('AI 配置或权限已变化，请新建对话')
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${context.user.id}, ${context.ownerId}) FOR SHARE`)
      const users = await tx.user.findMany({ where: { id: { in: [context.user.id, context.ownerId] } }, select: { id: true, disabled: true, deletedAt: true, permissionVersion: true } })
      if (users.some(u => u.disabled || u.deletedAt) || !users.some(u => u.id === context.user.id && u.permissionVersion === context.user.permissionVersion) || !users.some(u => u.id === context.ownerId)) throw new ForbiddenException('账号或权限已经变化')
      const proposal = await tx.aiProposal.findFirst({ where: { id, actorId: context.user.id, ownerId: context.ownerId, conversationId: context.conversationId } })
      if (!proposal) throw new NotFoundException('草稿不存在或无权确认')
      if (proposal.status !== 'PENDING') return { status: proposal.status, changed: false }
      if (decision === 'reject' || proposal.expiresAt < new Date()) {
        const status = decision === 'reject' ? 'REJECTED' : 'EXPIRED'
        await tx.aiProposal.update({ where: { id }, data: { status, resolvedAt: new Date() } })
        await tx.aiAuditLog.create({ data: { actorId: context.user.id, ownerId: context.ownerId, action: status, proposalId: id, resource: proposal.resource, ...(context.channel ? { detail: context.channel.audit } : {}) } })
        return { status, changed: false }
      }
      const data = proposal.payload as JsonRecord
      const resource = proposal.resource as Resource
      const isBusiness=proposal.operation==='business'
      const keys = isBusiness?Object.keys((data as unknown as AiSavedOperation).data):resource === 'samples' ? Object.keys(data.changes as JsonRecord).map(k => `inputs.${k}`) : Object.keys(data)
      if(!isBusiness) await this.requireWrite(context, resource, keys, tx)
      let entityId: string
      if(isBusiness) {
        if(!this.operations) throw new ForbiddenException('业务操作不可用')
        entityId=await this.operations.execute(context,resource,data as unknown as AiSavedOperation,tx,afterCommit,id)
      } else if (resource === 'samples') {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "LabSheet" WHERE "id" = ${String(data.sheetId)} FOR UPDATE`)
        const block = await tx.sampleBlock.findFirst({ where: { id: String(data.blockId), sheet: { frontendUserId: context.ownerId } }, include: { sheet: { select: { date: true, readonly: true } } } })
        if (!block) throw new NotFoundException('样品已不存在')
        this.assertEditable(block)
        if (block.updatedAt.toISOString() !== data.baseUpdatedAt) throw new ConflictException('样品已被其他操作修改，请取消草稿并重新生成')
        const changeLogFields = Object.entries(data.changes as JsonRecord).map(([field, newValue]) => ({ field, oldValue: (data.baseInputs as JsonRecord)[field] ?? null, newValue }))
        await this.sheets.saveSampleBlock(context.user, String(data.sheetId), { id: block.id, changedFields: data.changes, baseInputs: data.baseInputs, baseUpdatedAt: data.baseUpdatedAt, idempotencyKey: `ai:${id}`, changeLogFields }, undefined, false, tx)
        entityId = block.id
      } else if (resource === 'customers') {
        const payload = customerSchema.parse(data)
        if (await tx.customer.findUnique({ where: { frontendUserId_name: { frontendUserId: context.ownerId, name: payload.name } }, select: { id: true } })) throw new ConflictException('该客户已存在，请取消草稿并核对客户资料')
        const row = await tx.customer.create({ data: { frontendUserId: context.ownerId, ...payload } })
        entityId = row.id
      } else if (resource === 'expenses') {
        const payload = expenseSchema.parse(data)
        const row = await tx.financeEntry.create({ data: { frontendUserId: context.ownerId, ...payload } })
        entityId = row.id
      } else throw new ForbiddenException('该菜单不支持 AI 写入')
      await tx.aiProposal.update({ where: { id }, data: { status: 'APPLIED', resolvedAt: new Date() } })
      await tx.aiAuditLog.create({ data: { actorId: context.user.id, ownerId: context.ownerId, action: 'APPLIED', proposalId: id, resource, detail: { ...context.channel?.audit, entityId, fields: keys, preview: proposal.preview } } })
      return { status: 'APPLIED', changed: true, resource, entityId, data }
    }, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(error=>{
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034')throw new ConflictException('业务数据发生并发变化，请重新查询并核对草稿')
      throw error
    })
    if (result.changed && 'resource' in result) {
      for(const publish of afterCommit) publish()
      if (result.resource === 'samples') this.sheets.notifyAiSampleSaved(context.ownerId, String(result.data!.sheetId), String(result.data!.date), context.user.id)
      else this.realtime.publish({ dataOwnerId: context.ownerId, module: result.resource === 'expenses' ? 'finance-expenses' : ['employees','schedules','attendance','leaves','leaveTypes','commissionTypes','commissions','bonuses','payroll','payrollAdjustments'].includes(result.resource!)?'employee-attendance':result.resource!, entityId: result.entityId!, operation: 'update', changedById: context.user.id, updatedAt: new Date().toISOString() })
    }
    return { status: result.status }
  }
}
