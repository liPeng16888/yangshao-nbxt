import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'
import { PrismaService } from '../prisma/prisma.service'
import { LabSheetsService } from '../lab-sheets/lab-sheets.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'
import { businessDateInBeijing } from '../common/date'
import { AiAccessService } from './ai-access.service'
import { catalog, customerSchema, dateSchema, expenseSchema, projectedRow, sampleFields, sampleWritable, samplePatchSchema, registrationSchema, entryContextSchema, type Grants, type Resource, type EntryContext } from './ai.catalog'
import { sampleRegistrationFields } from './ai-menu-catalog'
import { assertEntryWrite, entryMenuLevels } from './ai-entry'
import { AiOperationService, type AiSavedOperation } from './ai-operation.service'
import { AiReadService } from './ai-read.service'
import type { AiQueryOptions } from './ai-query'

type Context = { user: CurrentUser; ownerId: string;ownerIds?:string[]; conversationId: string; grants: Grants; entryContext?:EntryContext; channel?: import('./ai-channel').AiChannelContext; transaction?: Prisma.TransactionClient; afterCommit?: (()=>void)[]; createdPayers?: Map<string,{id:string;name:string}> }
type JsonRecord = Record<string, unknown>
export type Preview = { title: string; account: string; location: string; fields: { key: string; label: string; before: unknown; after: unknown }[]; warnings: string[]; target?: {date:string;sequence:string}; entry?:{context:EntryContext;id?:string;data:JsonRecord} }

@Injectable()
export class AiBusinessService {
  constructor(private readonly prisma: PrismaService, private readonly access: AiAccessService, private readonly sheets: LabSheetsService, private readonly realtime: TenantRealtimeService, @Optional() private readonly operations?: AiOperationService,@Optional() private readonly reads?:AiReadService) {}
  private requireSingleOwner(context:Context){if(context.ownerIds&&(context.ownerIds.length!==1||context.ownerIds[0]!==context.ownerId))throw new ForbiddenException('多账号模式只允许读取，请选择一个账号并新建对话后写入')}
  async capabilities(context:Context,resource:Resource) {
    const entry=catalog.find(c=>c.key===resource)!
    const read=await this.access.fields(context.user,resource,'read',context.grants,undefined,context.ownerId)
    let write:string[]=[]
    try { write=await this.access.fields(context.user,resource,'write',context.grants,undefined,context.ownerId) } catch {}
    const result = this.operations ? await this.operations.capabilities(context,resource) : {resource,label:entry.label,readFields:entry.fields.filter(f=>read.includes(f.key)),writeFields:entry.fields.filter(f=>write.includes(f.key)),operations:[] as {action:string;label:string;requiresId:boolean;input:any}[],note:entry.note}
    if(context.ownerIds&&context.ownerIds.length>1)return {...result,writeFields:[],operations:[],note:'多账号对话只允许读取和统计，不提供写入动作'}
    if (resource === 'samples' && result.writeFields.length) return { ...result, operations: [
      ...(read.includes('inputs.sequence')&&sampleRegistrationFields.every(k=>write.includes(k))?[{ action:'prepare_sample_registration',label:'登记付款客户、金额和费用状态',requiresId:false,input:registrationSchema.toJSONSchema()}]:[]),
      {action:'prepare_sample_change',label:this.access.isAdmin(context.user)?'修改单个样品登记字段':'修改样品原始输入',requiresId:true,input:samplePatchSchema.shape.changes.toJSONSchema()}
    ] }
    if (resource === 'customers' && write.includes('name')) return {...result,operations:[{action:'create',label:'新增客户资料',requiresId:false,input:customerSchema.toJSONSchema()}]}
    if (resource === 'expenses' && write.length) return {...result,operations:[{action:'create',label:'新增支出',requiresId:false,input:expenseSchema.toJSONSchema()}]}
    return result
  }
  async entryOptions(user: CurrentUser, ownerId: string, grants: Grants, onlyResource?:Resource) {
    const scenes:any[]=[]
    const audience=this.access.isAdmin(user)?'admin':'frontend'
    for (const entry of catalog) {
      try {
        if(onlyResource&&entry.key!==onlyResource)continue
        if(!entry[audience])continue
        const capability=await this.capabilities({user,ownerId,grants,conversationId:''},entry.key)
        const read=capability.readFields.map(f=>f.key),write=capability.writeFields.map(f=>f.key)
        const permitted=(key:string,action:string)=>{const field=entry.fields.find(f=>f.key===key||entry.key==='samples'&&f.key===`inputs.${key}`);if(entry.key==='samples'&&action==='prepare_sample_registration'&&key==='sequence')return read.includes('inputs.sequence');return !field || (field.writable?write:read).includes(field.key)}
        const operations=capability.operations.filter(operation=>(operation.input.required||[]).every((key:string)=>permitted(key,operation.action))).map(operation=>{
          const input=structuredClone(operation.input)
          if(input.properties)input.properties=Object.fromEntries(Object.entries(input.properties).filter(([key])=>permitted(key,operation.action)))
          return {...operation,input}
        })
        if(operations.length&&write.length)scenes.push({key:entry.key,label:entry.label,levels:entryMenuLevels(entry.key,audience),path:entry[audience]!.path,writeFields:capability.writeFields.map(f=>({key:f.key,label:f.label})),operations,note:entry.note})
      } catch(error) {if(!(error instanceof ForbiddenException||error instanceof NotFoundException))throw error;/* Omit only genuine authorization failures, not implementation errors. */}
    }
    return { scenes }
  }
  async entryCustomers(user: CurrentUser, ownerId: string, keyword: string, grants: Grants) {
    const fields = await this.access.fields(user,'samples','read',grants,undefined,ownerId)
    if (!fields.includes('inputs.customerText')) throw new ForbiddenException('没有付款客户名称的读取权限')
    const rows = await this.prisma.customer.findMany({ where: { frontendUserId: ownerId, name: { contains: keyword } }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 20 })
    await this.prisma.aiAuditLog.create({ data: { actorId:user.id,ownerId,action:'READ',resource:'samples',detail:{fields:['inputs.customerText'],returned:rows.length,purpose:'customer-picker'} } })
    return rows
  }
  async prepareRegistration(context: Context, input: unknown) {
    this.requireSingleOwner(context)
    const row = registrationSchema.parse(input)
    assertEntryWrite(context.entryContext,'samples','prepare_sample_registration',{date:row.date})
    const read = await this.access.fields(context.user,'samples','read',context.grants,context.transaction,context.ownerId)
    if (!read.includes('inputs.sequence')) throw new ForbiddenException('必须允许读取样品序号，才能核对录入位置')
    await this.requireWrite(context,'samples',sampleRegistrationFields,context.transaction)
    const db = context.transaction || this.prisma
    const normalized = /^\d+$/.test(row.sequence) ? row.sequence.padStart(3,'0') : row.sequence
    const blocks = await db.sampleBlock.findMany({ where: { sheet: { frontendUserId:context.ownerId,date:row.date }, OR: [...new Set([row.sequence,normalized])].map(sequence => ({inputs:{path:['sequence'],equals:sequence}})) }, take:2, include:{sheet:{select:{id:true,date:true,readonly:true}}} })
    if (!blocks.length) throw new NotFoundException('该日期没有这个序号的既有样品，请核对日期和序号；不会自动新增样品')
    if (blocks.length !== 1) throw new ConflictException('样品序号重复，请在原页面核对并选择唯一位置')
    return this.prepareSample(context,{blockId:blocks[0].id,changes:{customerText:row.customerName,price:row.price,paymentStatus:row.paymentStatus}},{customerId:row.customerId,createCustomer:row.createCustomer,expectedDate:row.date})
  }
  async prepareRegistrations(context: Context, rows: unknown[]) {
    this.requireSingleOwner(context)
    const parsed = rows.map(row => registrationSchema.parse(row))
    const positions = parsed.map(row => `${row.date}:${/^\d+$/.test(row.sequence)?row.sequence.padStart(3,'0'):row.sequence}`)
    if (!parsed.length || parsed.length > 5 || new Set(positions).size !== positions.length) throw new BadRequestException('每批最多5条，不能重复填写同一日期和样品序号')
    return this.prisma.$transaction(async tx => {
      await context.channel?.assertCurrent(tx)
      await this.access.owner(context.user,context.ownerId,tx)
      const result = []
      for (const row of parsed) result.push(await this.prepareRegistration({...context,transaction:tx},row))
      return result
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000})
  }
  async prepareOperation(context:Context,input:unknown) {
    this.requireSingleOwner(context)
    if(!this.operations) throw new ForbiddenException('业务能力不可用')
    const draft=await this.operations.prepare(context,input)
    const preview=await this.preview(context,draft.title,draft.location,draft.fields)
    if(context.entryContext)preview.entry={context:context.entryContext,...(draft.payload.targetId?{id:draft.payload.targetId}:{}),data:draft.payload.data}
    return this.proposal(context,draft.resource,'business',draft.payload,preview)
  }
  query(context:Context,resource:Resource,date?:string,keyword='',options:AiQueryOptions={}) {
    if(!this.reads) throw new ForbiddenException('业务查询不可用')
    return this.reads.query(context,resource,date,keyword,options)
  }
  summarize(context:Context,resource:Resource,date?:string,keyword='',options:AiQueryOptions={}) {
    if(!this.reads) throw new ForbiddenException('业务统计不可用')
    return this.reads.summarize(context,resource,date,keyword,options)
  }
  continueQuery(context:Context,resource?:Resource) {
    if(!this.reads) throw new ForbiddenException('业务查询不可用')
    return this.reads.continueQuery(context,resource)
  }
  private async requireWrite(context: Context, resource: Resource, keys: string[], transaction?: Prisma.TransactionClient) {
    const read = await this.access.fields(context.user, resource, 'read', context.grants, transaction,context.ownerId)
    const write = await this.access.fields(context.user, resource, 'write', context.grants, transaction,context.ownerId)
    if (keys.some(k => !write.includes(k) || !read.includes(k))) throw new ForbiddenException('草稿包含禁止读取或写入的字段')
  }
  async prepareSample(context: Context, input: unknown, payer?: { customerId?: string; createCustomer?: boolean; expectedDate?:string }) {
    this.requireSingleOwner(context)
    const { blockId, changes } = samplePatchSchema.parse(input)
    for (const [key, value] of Object.entries(changes)) {
      const isText = ['sequence', 'sampleNumber', 'customerText', 'paymentStatus', 'elementNote', 'note'].includes(key)
      if (value !== null && (isText ? typeof value !== 'string' : typeof value !== 'number')) throw new BadRequestException('请核对原始值类型，不能将检测结果直接写入原始值')
      if (typeof value === 'number' && value < 0 && !['siliconAdjust', 'aluminumAdjust'].includes(key)) throw new BadRequestException('原始检测值不能为负数')
    }
    await this.requireWrite(context, 'samples', Object.keys(changes).map(k => `inputs.${k}`),context.transaction)
    const db = context.transaction || this.prisma
    const block = await db.sampleBlock.findFirst({ where: { id: blockId, sheet: { frontendUserId: context.ownerId } }, include: { sheet: { select: { id: true, date: true, readonly: true } } } })
    if (!block) throw new NotFoundException('未找到当前账号的样品')
    if(payer?.expectedDate&&block.sheet.date!==payer.expectedDate)throw new BadRequestException('样品不在当前快捷录入日期，请核对日期与位置')
    this.assertEditable(block)
    const inputs = block.inputs as JsonRecord
    if (changes.paymentStatus === '预存款' || inputs.paymentStatus === '预存款' && ('price' in changes || 'paymentStatus' in changes || 'customerText' in changes)) throw new ForbiddenException('预存款登记或变更需在原页面选择会员并核对台账；AI 不会直接扣款或冲正')
    let payerId: string | undefined, payerVersion: string | undefined, newPayerName: string | undefined
    const patch: JsonRecord = { ...changes }
    if ('customerText' in changes) {
      const name = String(changes.customerText || '').trim()
      if (name) {
        const matches = await db.customer.findMany({where:{frontendUserId:context.ownerId,name,...(payer?.customerId?{id:payer.customerId}:{})},select:{id:true,name:true,updatedAt:true},take:2})
        if (!matches.length) {
          if(payer?.customerId)throw new ForbiddenException('所选付款客户不是当前账号的匹配记录，请重新选择')
          if (!payer?.createCustomer) throw new BadRequestException('没有找到该付款客户。请先选择已有客户，或明确勾选新建客户后生成草稿')
          await this.requireWrite(context,'customers',['name'],context.transaction)
          newPayerName = name
        } else {
          if (matches.length !== 1) throw new ConflictException('客户名称不唯一，请选择具体客户')
          payerId=matches[0].id; payerVersion=matches[0].updatedAt.toISOString()
        }
      }
      patch.customerText=name
      patch.customerId=payerId || null; patch.customerIds=payerId?[payerId]:[]; patch.customers=payerId?[{id:payerId,name}]:[]
    }
    const preview = await this.preview(context, '修改样品数据', `数据计算/${block.sheet.date}/第${block.index + 1}个样品`, Object.entries(changes).map(([key, value]) => ({ key, label: sampleFields[key as keyof typeof sampleFields], before: inputs[key] ?? null, after: value })))
    if (sampleRegistrationFields.every(k=>Object.prototype.hasOwnProperty.call(changes,k.slice(7)))) {
      const read = await this.access.fields(context.user,'samples','read',context.grants,context.transaction,context.ownerId)
      if (read.includes('inputs.sequence')) preview.target={date:block.sheet.date,sequence:String(inputs.sequence||'')}
    }
    if (newPayerName) preview.warnings.push(`确认后将新增客户「${newPayerName}」并关联到该样品；尚未创建客户或写入样品。`)
    else if (payerId) preview.warnings.push('付款客户将关联到本账号的已有客户档案，不只写入名称文字。')
    if(context.entryContext?.action==='prepare_sample_change')preview.entry={context:context.entryContext,id:blockId,data:changes}
    return this.proposal(context, 'samples', 'update', { blockId, sheetId: block.sheetId, date: block.sheet.date, changes:patch, ...(payerId?{payerId,payerVersion}:{}),...(newPayerName?{newPayerName}:{}), baseUpdatedAt: block.updatedAt.toISOString(), baseInputs: Object.fromEntries(Object.keys(patch).map(k => [k, inputs[k] ?? null])) }, preview)
  }
  async prepareCreate(context: Context, resource: 'customers' | 'expenses', input: unknown) {
    this.requireSingleOwner(context)
    const data = resource === 'customers' ? customerSchema.parse(input) : expenseSchema.parse(input)
    assertEntryWrite(context.entryContext,resource,'create',data)
    await this.requireWrite(context, resource, Object.keys(data))
    if (resource === 'customers' && await this.prisma.customer.findUnique({ where: { frontendUserId_name: { frontendUserId: context.ownerId, name: (data as { name: string }).name } }, select: { id: true } })) throw new ConflictException('该客户已存在，请在客户资料中核对，AI 不会覆盖现有客户')
    const entry = catalog.find(c => c.key === resource)!
    const preview = await this.preview(context, resource === 'customers' ? '新增客户资料' : '新增财务支出', resource === 'customers' ? '客户资料/新增' : `财务支出/${(data as { paymentDate: string }).paymentDate}`, Object.entries(data).map(([key, value]) => ({ key, label: entry.fields.find(f => f.key === key)!.label, before: null, after: value })))
    if(context.entryContext)preview.entry={context:context.entryContext,data}
    return this.proposal(context, resource, 'create', data, preview)
  }
  private async preview(context: Context, title: string, location: string, fields: Preview['fields']): Promise<Preview> {
    const owner = await (context.transaction || this.prisma).user.findUnique({ where: { id: context.ownerId }, select: { account: true, username: true } })
    return { title, account: `${owner?.username || ''}（${owner?.account || ''}）`, location, fields, warnings: ['请逐项核对位置和数据；照片识别可能有误。草稿 15 分钟后过期。'] }
  }
  private async proposal(context: Context, resource: Resource, operation: string, payload: object, preview: Preview) {
    const db = context.transaction || this.prisma
    if (await db.aiProposal.count({ where: { conversationId: context.conversationId, status: 'PENDING', expiresAt: { gt: new Date() } } }) >= 5) throw new BadRequestException('请先处理已有的待确认草稿')
    const row = await db.aiProposal.create({ data: { conversationId: context.conversationId, actorId: context.user.id, ownerId: context.ownerId, resource, operation, payload: payload as Prisma.InputJsonValue, preview: preview as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 15 * 60 * 1000) } })
    await db.aiAuditLog.create({ data: { actorId: context.user.id, ownerId: context.ownerId, action: 'PROPOSED', resource, proposalId: row.id, ...(context.channel ? { detail: context.channel.audit } : {}) } })
    return { proposalId: row.id, status: 'PENDING', message: '草稿已生成，尚未写入。用户必须在确认卡片中核对并点击确认。' }
  }
  assertEditable(block: { readonly: boolean; inputs: unknown; sheet: { date: string; readonly: boolean } }) {
    if (block.sheet.date !== businessDateInBeijing() || block.sheet.readonly || block.readonly || (block.inputs as JsonRecord).completed) throw new ForbiddenException('历史、锁定或检测完成的样品不能由 AI 直接修改，请使用原有修改申请流程')
  }
  async confirm(context: Context, id: string, decision: 'confirm' | 'reject') {
    this.requireSingleOwner(context)
    const afterCommit:(()=>void)[]=context.afterCommit || []
    const operation = async (tx:Prisma.TransactionClient) => {
      await context.channel?.assertCurrent(tx)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AiSettings" WHERE "id" = 'global' FOR SHARE`)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "AiProposal" WHERE "id" = ${id} FOR UPDATE`)
      const settings = await tx.aiSettings.findUnique({ where: { id: 'global' } })
      const conversation = await tx.aiConversation.findFirst({ where: { id: context.conversationId, actorId: context.user.id, ownerId: context.ownerId } })
      if (!settings?.enabled || !conversation || conversation.settingsRevision !== settings.revision) throw new ConflictException('AI 配置或权限已变化，请新建对话')
      if(Array.isArray(conversation.ownerIds)&&conversation.ownerIds.length>1)throw new ForbiddenException('多账号会话只允许读取，不能确认写入')
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
      await this.access.owner(context.user,context.ownerId,tx)
      const data = proposal.payload as JsonRecord
      const resource = proposal.resource as Resource
      const isBusiness=proposal.operation==='business'
      const scope=conversation.entryContext?entryContextSchema.parse(conversation.entryContext):undefined
      if(scope){
        const action=isBusiness?String(data.action):resource==='samples'?scope.action||'prepare_sample_registration':'create'
        assertEntryWrite(scope,resource,action,isBusiness?(data as unknown as AiSavedOperation).data:data)
        if(resource==='samples'&&scope.action==='prepare_sample_registration'&&Object.keys(data.changes as JsonRecord).some(key=>sampleWritable.includes(key)&&!sampleRegistrationFields.includes(`inputs.${key}`)))throw new ForbiddenException('该草稿不是当前选定的样品登记操作')
        context={...context,entryContext:scope}
      }
      const keys = isBusiness?Object.keys((data as unknown as AiSavedOperation).data):resource === 'samples' ? Object.keys(data.changes as JsonRecord).filter(k=>sampleWritable.includes(k)).map(k => `inputs.${k}`) : Object.keys(data)
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
        const publicChanges = Object.fromEntries(Object.entries(data.changes as JsonRecord).filter(([key])=>sampleWritable.includes(key)))
        samplePatchSchema.parse({blockId:block.id,changes:publicChanges})
        if ((data.changes as JsonRecord).paymentStatus === '预存款' || (block.inputs as JsonRecord).paymentStatus === '预存款' && ['price','paymentStatus','customerText'].some(k=>k in (data.changes as JsonRecord))) throw new ForbiddenException('预存款需在原页面核对会员和台账')
        if (block.updatedAt.toISOString() !== data.baseUpdatedAt) throw new ConflictException('样品已被其他操作修改，请取消草稿并重新生成')
        if (data.newPayerName) {
          await this.requireWrite(context,'customers',['name'],tx)
          const createdInBatch=context.createdPayers?.get(String(data.newPayerName))
          if (!createdInBatch && await tx.customer.findUnique({where:{frontendUserId_name:{frontendUserId:context.ownerId,name:String(data.newPayerName)}}})) throw new ConflictException('客户已被其他操作创建，请重新选择已有客户生成草稿')
          const customer = createdInBatch || await tx.customer.create({data:{frontendUserId:context.ownerId,name:String(data.newPayerName)}})
          context.createdPayers?.set(customer.name,customer)
          Object.assign(data.changes as JsonRecord,{customerId:customer.id,customerIds:[customer.id],customers:[{id:customer.id,name:customer.name}]})
          if(!createdInBatch)afterCommit.push(()=>this.realtime.publish({dataOwnerId:context.ownerId,module:'customers',entityId:customer.id,operation:'create',changedById:context.user.id,updatedAt:new Date().toISOString()}))
        } else if (data.payerId) {
          const customer = await tx.customer.findFirst({where:{id:String(data.payerId),frontendUserId:context.ownerId},select:{id:true,name:true,updatedAt:true}})
          if (!customer || customer.updatedAt.toISOString() !== data.payerVersion || customer.name !== (data.changes as JsonRecord).customerText) throw new ConflictException('付款客户档案已变化，请重新核对并生成草稿')
        }
        const changeLogFields = Object.entries(data.changes as JsonRecord).map(([field, newValue]) => ({ field, oldValue: (data.baseInputs as JsonRecord)[field] ?? null, newValue }))
        await this.sheets.saveSampleBlock({...context.user,dataOwnerId:context.ownerId}, String(data.sheetId), { id: block.id, changedFields: data.changes, baseInputs: data.baseInputs, baseUpdatedAt: data.baseUpdatedAt, idempotencyKey: `ai:${id}`, changeLogFields }, undefined, false, tx)
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
    }
    const result = await (context.transaction ? operation(context.transaction) : this.prisma.$transaction(operation, { timeout: 20000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })).catch(error=>{
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2034')throw new ConflictException('业务数据发生并发变化，请重新查询并核对草稿')
      throw error
    })
    if (result.changed && 'resource' in result) {
      if (result.resource === 'samples') afterCommit.push(()=>this.sheets.notifyAiSampleSaved(context.ownerId, String(result.data!.sheetId), String(result.data!.date), context.user.id))
      else afterCommit.push(()=>this.realtime.publish({ dataOwnerId: context.ownerId, module: result.resource === 'expenses' ? 'finance-expenses' : ['employees','schedules','attendance','leaves','leaveTypes','commissionTypes','commissions','bonuses','payroll','payrollAdjustments'].includes(result.resource!)?'employee-attendance':result.resource!, entityId: result.entityId!, operation: 'update', changedById: context.user.id, updatedAt: new Date().toISOString() }))
      if (!context.transaction) for(const publish of afterCommit) publish()
    }
    return { status: result.status }
  }
  async confirmBatch(context:Context, ids:string[]) {
    if (!ids.length || ids.length>5 || new Set(ids).size!==ids.length) throw new BadRequestException('请核对1至5个不同的草稿')
    const afterCommit:(()=>void)[]=[],createdPayers=new Map<string,{id:string;name:string}>()
    const result=await this.prisma.$transaction(async tx=>{
      const rows=[]
      for(const id of [...ids].sort()) {
        const status=await this.confirm({...context,transaction:tx,afterCommit,createdPayers},id,'confirm')
        if(status.status!=='APPLIED')throw new ConflictException('其中一个草稿已取消或过期，整批未写入，请重新核对')
        rows.push({id,status:status.status})
      }
      return rows
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000})
    for(const publish of afterCommit)publish()
    return result
  }
}
