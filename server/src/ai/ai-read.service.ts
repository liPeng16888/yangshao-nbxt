import { ForbiddenException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { resolveCurrentUserIdentity, type CurrentUser } from '../auth/current-user'
import { hasLabDetectionInput, labDetectionInputFields } from '../common/lab'
import { AiAccessService } from './ai-access.service'
import { AiDataService, jsonSafe } from './ai-data.service'
import { catalog, projectedRow, type Grants, type Resource } from './ai.catalog'
import { normalizedOwners } from './ai-owner-scope'
import { transactionServices } from './ai-transaction'
import { AI_MAX_SCAN_ROWS, AI_PAGE_SIZE, AiQueryChangedError, AiQueryInputError, businessQuerySchema, decodePageCursor, encodePageCursor, queryScope, type AiQueryOptions } from './ai-query'

export interface AiReadContext { user: CurrentUser; ownerId: string; ownerIds?:string[]; conversationId: string; grants: Grants; channel?: import('./ai-channel').AiChannelContext }
type Row = Record<string, any>
export interface AiDetailPage { resource:Resource; range:import('./ai-query').AiQueryScope; totalRecords:number; rows:Row[]; pageSize:number; returned:number; hasMore:boolean; truncated:boolean; nextCursor:string|null; scope:string; notes:string[]; accounts?:Row[] }
export interface AiSummary { resource:Resource; range:import('./ai-query').AiQueryScope; totalRecords:number; complete:true; totals:Record<string,{label:string;value:string|number;validValues:number}>; sampleCounts?:Record<string,number>; scope:string; notes:string[]; accounts?:Row[] }
const monetaryFields: Partial<Record<Resource,string[]>> = {
  samples:['inputs.price'], expenses:['amount'], employees:['baseSalary','attendanceBonus'], commissions:['amount'], bonuses:['amount'],
  payroll:['baseSalary','attendanceBonus','commissionAmount','bonusAmount','adjustmentAmount','payableAmount'], payrollAdjustments:['amount'],
  prepaidRecharges:['paidAmount','giftAmount','totalAmount','remainingAmount'], prepaidCustomers:['remainingAmount'], prepaidConsumptions:['amount'], prepaidSettlements:['netAmount'],
  income:['totalAmount'], unsettled:['amount'], monthly:['amount','paidAmount'], monthlyDaily:['amount'], monthlyCustomers:['amount'],
  reportsSamples:['totalPrice'], reportsFinance:['income','expense','profit'], customerOverview:['totalAmount'], blacklist:['amount']
}
const countFields: Partial<Record<Resource,string[]>> = { income:['sampleCount'], monthly:['sampleCount'], monthlyDaily:['sampleCount'], monthlyCustomers:['sampleCount'], reportsSamples:['sampleCount'], customerOverview:['sampleCount'] }
const readValue = (row:Row,field:string) => field.split('.').reduce<any>((v,k)=>v&&typeof v==='object'?v[k]:undefined,row)

@Injectable()
export class AiReadService {
  constructor(private readonly prisma:PrismaService, private readonly access:AiAccessService, private readonly data:AiDataService) {}

  query(context:AiReadContext,resource:Resource,date?:string,keyword='',options:AiQueryOptions={}) { return this.read(context,resource,date,keyword,options,false) as Promise<AiDetailPage> }
  summarize(context:AiReadContext,resource:Resource,date?:string,keyword='',options:AiQueryOptions={}) { return this.read(context,resource,date,keyword,options,true) as Promise<AiSummary> }
  async continueQuery(context:AiReadContext,resource?:Resource) {
    const previous=await this.prisma.aiAuditLog.findFirst({where:{actorId:context.user.id,ownerId:context.ownerId,action:'READ',...(resource?{resource}:{}),detail:{path:['conversationId'],equals:context.conversationId}},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{detail:true}})
    const detail=previous?.detail as {query?:unknown;nextCursor?:string|null;ownerIds?:string[]}|undefined
    if(!detail)throw new AiQueryInputError('当前对话尚未查询明细，请先指定菜单和查询范围')
    if(JSON.stringify(normalizedOwners(detail.ownerIds||[context.ownerId]))!==JSON.stringify(normalizedOwners(context.ownerIds||[context.ownerId])))throw new AiQueryChangedError('所选账号范围已变化，请重新查询第一页')
    if(!detail.nextCursor)return{rows:[],hasMore:false,nextCursor:null,note:'最近一次明细查询已到最后一页，没有更多记录'}
    const parsed=businessQuerySchema.safeParse(detail.query)
    if(!parsed.success)throw new AiQueryChangedError('历史查询标记不可用，请重新查询第一页')
    const query=parsed.data
    return this.query(context,query.resource,query.date,query.keyword,{startDate:query.startDate,endDate:query.endDate,cursor:detail.nextCursor})
  }

  private async authorization(context:AiReadContext,resource:Resource,db:PrismaService,access:AiAccessService) {
    const user=await resolveCurrentUserIdentity(db,context.user.id,context.user.permissionVersion)
    const owners=await access.owners(user,context.ownerIds||[context.ownerId])
    if(owners[0]!==context.ownerId)throw new ForbiddenException('查询账号范围不一致')
    if(owners.length>1&&resource==='aiModels')throw new AiQueryInputError('模型列表属于全局配置，不能按多个账号重复统计')
    const settings=await db.aiSettings.findUnique({where:{id:'global'},select:{enabled:true,revision:true}})
    if(!settings?.enabled) throw new ForbiddenException('AI 尚未启用')
    let fields:string[]|undefined
    for(const owner of owners){const allowed=(await access.fields(user,resource,'read',context.grants,undefined,owner)).filter(field=>!field.startsWith('actions.'));fields=fields?fields.filter(field=>allowed.includes(field)):allowed}
    fields=(fields||[]).sort()
    if(!fields.length) throw new ForbiddenException('没有已授权的业务读取字段')
    const authorization=await access.ownersAuthorizationHash(user,owners,context.grants)
    const profiles=owners.length>1?(await db.user.findMany({where:{id:{in:owners},role:'FRONTEND_USER',disabled:false,deletedAt:null},select:{id:true,username:true}})).map(p=>({id:p.id,username:p.username})):[]
    if(owners.length>1&&profiles.length!==owners.length)throw new ForbiddenException('部分账号已停用或不在授权范围内')
    return {user,fields,authorization,owners,profiles,revision:settings.revision}
  }

  private async read(context:AiReadContext,resource:Resource,date:string|undefined,keyword:string,options:AiQueryOptions,summary:boolean) {
    if(summary&&options.cursor)throw new AiQueryInputError('全量统计不能使用明细翻页标记')
    if(typeof keyword!=='string'||keyword.length>100) throw new AiQueryInputError('查询关键词最多 100 个字符')
    keyword=keyword.trim()
    const range=queryScope(resource,date,options)
    const result=await this.prisma.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      const scoped=transactionServices({access:this.access,data:this.data},this.prisma,tx,[])
      // Existing report services also use this snapshot, not independent live reads.
      const db=(scoped.data as unknown as {prisma:PrismaService}).prisma
      const auth=await this.authorization(context,resource,db,scoped.access)
      const signature=JSON.stringify({actor:auth.user.id,owners:auth.owners,conversation:context.conversationId,resource,range,keyword,fields:auth.fields,authorization:auth.authorization,revision:auth.revision})
      const scopeHash=createHash('sha256').update(signature).digest('hex')
      const cursor=decodePageCursor(options.cursor,scopeHash), offset=cursor?.offset||0
      const digest=createHash('sha256'), rows:Row[]=[], notes:string[]=[], sharedRecords=new Set<string>()
      const money=monetaryFields[resource]||[], counts=countFields[resource]||[]
      const metrics=[...money,...counts].filter(f=>auth.fields.includes(f))
      const totals=Object.fromEntries(metrics.map(f=>[f,{sum:new Prisma.Decimal(0),values:0}]))
      const sampleCounts:Record<string,number>={}
      const detectionCount=resource==='samples'&&labDetectionInputFields.every(f=>auth.fields.includes('inputs.'+f))
      if(detectionCount) sampleCounts.detected=0
      if(resource==='samples'&&auth.fields.includes('inputs.price')) sampleCounts.priced=0
      if(resource==='samples'&&auth.fields.includes('inputs.completed')) {sampleCounts.completed=0;sampleCounts.uncompleted=0}
      const accountStats=auth.owners.map(id=>({owner:auth.profiles.find(p=>p.id===id),totalRecords:0,totals:Object.fromEntries(metrics.map(f=>[f,{sum:new Prisma.Decimal(0),values:0}])),sampleCounts:Object.fromEntries(Object.keys(sampleCounts).map(key=>[key,0])) as Record<string,number>}))
      let scanned=0,totalRecords=0
      // A historical range must be unlocked even when no records exist in that range.
      if(resource==='samples'&&range.startDate) {
        await scoped.access.sampleProtection(auth.user,range.startDate,false,context.grants)
        await scoped.access.sampleProtection(auth.user,range.endDate!,false,context.grants)
      }
      let completedAllowed=true
      if(resource==='samples') {try {await scoped.access.sampleProtection(auth.user,range.startDate!,true,context.grants)} catch(error) {if(!(error instanceof ForbiddenException))throw error;completedAllowed=false}}
      for(const [ownerIndex,ownerId]of auth.owners.entries()) {
      const account=accountStats[ownerIndex]
      for await(const batch of scoped.data.batches(ownerId,resource,range,auth.user)) {
        scanned+=batch.length
        if(scanned>AI_MAX_SCAN_ROWS) throw new AiQueryInputError('查询范围过大，尚未完成全量统计。请缩小日期范围或按时间分段查询，不要使用部分结果推算总数')
        for(const raw of batch) {
          if(resource==='samples'&&!completedAllowed&&raw.inputs?.completed) continue
          const row=jsonSafe(raw)
          const safe:Row={...(auth.owners.length>1?{owner:account.owner}:{}),...(row.id?{id:row.id}:{}),...(row.rowKind?{rowKind:row.rowKind}:{}),...(resource==='samples'?{position:'数据计算/'+row.sheet.date+'/第'+(row.index+1)+'个样品'}:{}),...projectedRow(row,auth.fields)}
          if(auth.owners.length>1&&resource==='prepaidSettlements')safe.owners=auth.profiles.filter(p=>p.id===row.accountAId||p.id===row.accountBId)
          // Hidden fields/IDs never drive keyword filtering or count/sum statistics.
          if(keyword&&!JSON.stringify(projectedRow(row,auth.fields)).toLowerCase().includes(keyword.toLowerCase())) continue
          digest.update(JSON.stringify(safe)+'\n')
          const shared=auth.owners.length>1&&resource==='prepaidSettlements'
          const duplicate=shared&&sharedRecords.has(row.id)
          if(shared)sharedRecords.add(row.id)
          if(!duplicate){if(!summary&&totalRecords>=offset&&rows.length<AI_PAGE_SIZE) rows.push(safe);totalRecords++}
          account.totalRecords++
          if(summary) {
            for(const field of metrics) {
              const value=readValue(safe,field)
              if(typeof value!=='number'||!Number.isFinite(value)) continue
              const decimal=new Prisma.Decimal(String(value))
              const valueToAdd=money.includes(field)?decimal.toDecimalPlaces(2):decimal
              if(!duplicate){totals[field].sum=totals[field].sum.plus(valueToAdd);totals[field].values++}
              account.totals[field].sum=account.totals[field].sum.plus(valueToAdd);account.totals[field].values++
            }
            if(detectionCount&&hasLabDetectionInput(safe.inputs||{})){sampleCounts.detected++;account.sampleCounts.detected++}
            if('priced'in sampleCounts&&typeof safe.inputs?.price==='number'&&Number.isFinite(safe.inputs.price)){sampleCounts.priced++;account.sampleCounts.priced++}
            if('completed'in sampleCounts){const key=safe.inputs?.completed?'completed':'uncompleted';sampleCounts[key]++;account.sampleCounts[key]++}
          }
        }
      }
      }
      const dataHash=digest.digest('hex')
      if(cursor&&(cursor.data!==dataHash||offset>=totalRecords)) throw new AiQueryChangedError('业务数据已经变化，请重新查询第一页，避免翻页重复或遗漏')
      const hasMore=offset+rows.length<totalRecords
      if(range.wholeMonths)notes.push('此菜单按整月记账，返回的开始/结束日期是实际整月范围。')
      if(!range.startDate)notes.push('此菜单没有日期过滤，实际范围是所选账号全部记录；date 参数不表示仅查询当天。')
      if(summary&&metrics.length)notes.push('totals 是符合当前范围的授权字段合计，validValues 是有效数值数量；缺失值不是已确认的零。普通明细合计不自动排除草稿、冲正或失效记录，不能冒充净收入、结清金额或当前余额；收入等业务口径应查询相应报表。')
      if(resource==='samples')notes.push('记录数是有权查看的样品行数，包含空白预留行；detected 是有检测输入的样品数，priced 是有有效价格的样品数，样品价格合计不等于收入。仅返回获授权的计数。')
      if(resource==='samples'&&!detectionCount)notes.push('未授权全部原始检测字段，无法提供完整实检样品计数；不能用当前页行数推断实检总数。')
      if(['income','reportsSamples'].includes(resource))notes.push('样品数量沿用收入账单口径：有有效价格的样品；收入包含有效充值实付金额，预存款消费不重复计入收入。')
      if(resource==='customerOverview')notes.push('同一样品可能关联多个客户，跨客户相加的样品数不等于唯一实检样品数。')
      const serializeTotals=(values:typeof totals)=>Object.fromEntries(metrics.map(f=>[f,{label:catalog.find(c=>c.key===resource)!.fields.find(x=>x.key===f)!.label,value:money.includes(f)?values[f].sum.toFixed(2):values[f].sum.toNumber(),validValues:values[f].values}]))
      const accounts=auth.owners.length>1?accountStats.map(a=>({owner:a.owner,totalRecords:a.totalRecords,...(summary?{totals:serializeTotals(a.totals),...(resource==='samples'?{sampleCounts:a.sampleCounts}:{})}:{})})):undefined
      if(accounts)notes.push('仅查询用户所选的授权账号集合；明细每页合计最多50条，accounts是分账号统计，顶层totalRecords和totals是这些账号合计。多账号模式只读。')
      if(accounts&&resource==='prepaidSettlements')notes.push('同一笔双方结算按记录ID去重，owners只展示所选账号中的参与方。分账号统计表示各自参与的记录，可能重叠，不能相加冒充去重合计；字段金额不等于各账号的收付方向或余额。')
      const common={resource,range,totalRecords,...(accounts?{accounts}:{}),scope:'当前选定的授权账号范围及有效字段；关键词仅匹配已授权字段',notes}
      const output=summary?{...common,complete:true,totals:serializeTotals(totals),...(resource==='samples'?{sampleCounts}:{})}:{...common,rows,pageSize:AI_PAGE_SIZE,returned:rows.length,hasMore,truncated:hasMore,nextCursor:hasMore?encodePageCursor(scopeHash,dataHash,offset+rows.length):null}
      return {output,auth}
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:5000,timeout:20000}).catch(error=>{
      if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2028')throw new AiQueryInputError('当前范围查询超时，未返回部分统计。请缩小日期范围或分段查询')
      throw error
    })
    // Grants may expire / policies may change during a long snapshot. Never return that result.
    await context.channel?.assertCurrent()
    const current=await this.authorization(context,resource,this.prisma,this.access)
    if(current.authorization!==result.auth.authorization||current.revision!==result.auth.revision||JSON.stringify(current.fields)!==JSON.stringify(result.auth.fields)) throw new AiQueryChangedError('查询期间权限或访问授权已变化，请重新查询')
    const detail=JSON.parse(JSON.stringify({...context.channel?.audit,conversationId:context.conversationId,ownerIds:current.owners,fields:current.fields,range,totalRecords:result.output.totalRecords,...('returned'in result.output?{returned:result.output.returned,query:{resource,date,keyword,startDate:options.startDate,endDate:options.endDate},nextCursor:result.output.nextCursor}:{})}))
    await this.prisma.aiAuditLog.create({data:{actorId:context.user.id,ownerId:context.ownerId,action:summary?'SUMMARY':'READ',resource,detail}})
    return result.output
  }
}
