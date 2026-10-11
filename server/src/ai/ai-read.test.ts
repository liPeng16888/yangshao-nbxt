import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import { AiReadService } from './ai-read.service'
import { AiDataService } from './ai-data.service'
import { AiAccessService } from './ai-access.service'
import { catalog, type Grants } from './ai.catalog'
import { businessDateInBeijing } from '../common/date'
import { type CurrentUser } from '../auth/current-user'
import { AI_MAX_SCAN_ROWS, businessQuerySchema, decodePageCursor, encodePageCursor, queryScope } from './ai-query'

function fixture(size=125) {
  const date=businessDateInBeijing()
  const user:CurrentUser={id:'actor',account:'a',username:'甲',role:'FRONTEND_USER',dataOwnerId:'actor',permissionVersion:1,permissions:[],requiresAccessGuardPassword:true,isFrontendMainAccount:true,isFrontendSubAccount:false}
  const settings={enabled:true,revision:1,blockedFields:{} as Record<string,string[]>}
  const rules=catalog.map(c=>({resource:c.key,readFields:c.fields.map(f=>f.key),writeFields:[]}))
  const records=Array.from({length:size},(_,index)=>({id:'sample-'+index,index,sheet:{date,frontendUserId:'actor'},inputs:{ironRaw:1,price:0.1,completed:false,sampleNumber:'样品-'+index,note:'PRIVATE'},results:{iron:25},parameterSnapshot:{secret:99}}))
  const protectedFeatures=new Set<string>()
  const audit:Record<string,any>[]=[]
  const prisma:any={
    $executeRawUnsafe:vi.fn().mockResolvedValue(0),
    user:{findUnique:vi.fn(async()=>({...user,disabled:false,deletedAt:null,frontendSubAccountPermissions:user.permissions.map(permission=>({permission}))})),findFirst:vi.fn(async({where}:any)=>where.id==='actor'?{id:'actor'}:null)},
    subAdminFrontendPermission:{findFirst:vi.fn(async({where}:any)=>where.frontendUserId==='actor'?{frontendUserId:'actor'}:null)},
    aiSettings:{findUnique:vi.fn(async()=>settings)},
    accessGuardGroupFeature:{findMany:vi.fn(async()=>[...protectedFeatures].map(feature=>({feature,group:{id:'g-'+feature,grantVersion:1}})))},
    sampleBlock:{findMany:vi.fn(async({where,skip,take}:any)=>records.filter(r=>r.sheet.frontendUserId===where.sheet.frontendUserId&&(!where.sheet.date||r.sheet.date>=where.sheet.date.gte&&r.sheet.date<=where.sheet.date.lte)).slice(skip,skip+take))},
    aiAuditLog:{create:vi.fn(async({data}:any)=>{audit.push(data);return data}),findFirst:vi.fn(async({where}:any)=>{const log=[...audit].reverse().find(r=>r.actorId===where.actorId&&r.ownerId===where.ownerId&&r.action===where.action&&(!where.resource||where.resource===r.resource)&&r.detail.conversationId===where.detail.equals);return log?{detail:log.detail}:null})}
  }
  // Prisma's JSON path is checked by the SQL integration tests; this mock also scopes by conversation.
  prisma.aiAuditLog.findFirst.mockImplementation(async({where}:any)=>{const log=[...audit].reverse().find(r=>r.actorId===where.actorId&&r.ownerId===where.ownerId&&r.action===where.action&&(!where.resource||where.resource===r.resource)&&r.detail.conversationId===where.detail.equals);return log?{detail:log.detail}:null})
  prisma.$transaction=vi.fn(async(callback:any)=>callback(prisma))
  const config={policy:vi.fn(async()=>({enabled:true,rules})),settings:vi.fn(async()=>settings)}
  const auth={assertAccessGrant:vi.fn(async(_user:CurrentUser,token:string|undefined,feature:string)=>{if(protectedFeatures.has(feature)&&token!=='valid')throw new ForbiddenException()}),hasAccessGrant:vi.fn(async(_user:CurrentUser,token:string|undefined)=>token==='valid')}
  const admin={getAllowedFrontendUserIds:vi.fn(async(_user:CurrentUser,ids:string[])=>{if(ids.some(id=>id!=='actor'))throw new ForbiddenException();return ids})}
  const access=new AiAccessService(prisma,config as never,auth as never,admin as never)
  const finance={getFrontendIncomeReport:vi.fn(async(_id:string,month:string)=>({rows:[{date:month+'-01',sampleCount:65,totalAmount:4080},{date:month+'-02',sampleCount:15,totalAmount:200}]}))}
  const data=new AiDataService(prisma,finance as never,{} as never,{} as never)
  const service=new AiReadService(prisma,access,data)
  const context={user,ownerId:'actor',conversationId:'c',grants:{} as Grants}
  return{date,user,settings,rules,records,protectedFeatures,audit,prisma,config,auth,admin,finance,data,service,context}
}
function multiFixture(){
  const f=fixture(60),disabled=new Set<string>()
  f.user.id='root';f.user.role='ROOT_ADMIN';f.user.dataOwnerId='root'
  f.records.push(...Array.from({length:30},(_,index)=>({...f.records[0],id:'other-'+index,index,sheet:{date:f.date,frontendUserId:'other'},inputs:{...f.records[0].inputs,price:0.2}})))
  f.admin.getAllowedFrontendUserIds.mockImplementation(async(_u,ids)=>{if(ids.some(id=>!['actor','other'].includes(id)))throw new ForbiddenException();return ids})
  f.prisma.user.findFirst.mockImplementation(async({where}:any)=>['actor','other'].includes(where.id)&&!disabled.has(where.id)?{id:where.id}:null)
  f.prisma.user.findMany=vi.fn(async({where}:any)=>[{id:'actor',account:'A',username:'授权甲'},{id:'other',account:'B',username:'授权乙'}].filter(p=>where.id.in.includes(p.id)&&!disabled.has(p.id)))
  const context={...f.context,ownerIds:['actor','other']}
  return{...f,context,disabled}
}

describe('full-scope statistics and paginated business reads',()=>{
  it('returns 50 / 50 / 25 unique rows, correct totals, and a final-page marker',async()=>{
    const f=fixture(),pages=[]
    let cursor:string|undefined
    do{const page=await f.service.query(f.context,'samples',f.date,'',{cursor});pages.push(page);cursor=page.nextCursor||undefined}while(cursor)
    expect(pages.map(p=>p.returned)).toEqual([50,50,25])
    expect(pages.map(p=>p.truncated)).toEqual([true,true,false])
    expect(pages.every(p=>p.totalRecords===125)).toBe(true)
    expect(new Set(pages.flatMap(p=>p.rows.map(r=>r.id))).size).toBe(125)
    expect(f.prisma.$transaction.mock.calls[0][1].isolationLevel).toBe('RepeatableRead')
    expect(f.prisma.$executeRawUnsafe).toHaveBeenCalledWith('SET TRANSACTION READ ONLY')
    expect(JSON.stringify(pages)).not.toMatch(/parameterSnapshot|secret/)
  })
  it.each([0,49,50,51])('does not falsely report truncation for %i records',async size=>{
    const f=fixture(size),page=await f.service.query(f.context,'samples',f.date)
    expect(page.hasMore).toBe(size>50);expect(page.returned).toBe(Math.min(size,50));expect(page.totalRecords).toBe(size)
  })
  it('searches authorized fields across later database batches, before pagination',async()=>{
    const f=fixture(450)
    f.records.forEach((r,i)=>r.inputs.sampleNumber=i>=300?'MATCH':'other')
    f.settings.blockedFields.samples=['inputs.note']
    const page=await f.service.query(f.context,'samples',f.date,'MATCH')
    expect(page.returned).toBe(50);expect(page.totalRecords).toBe(150);expect(page.rows[0].id).toBe('sample-300');expect(page.hasMore).toBe(true)
    expect(JSON.stringify(page)).not.toContain('PRIVATE')
    expect((await f.service.summarize(f.context,'samples',f.date,'PRIVATE')).totalRecords).toBe(0)
    expect(f.prisma.sampleBlock.findMany.mock.calls[0][0].orderBy.at(-1)).toEqual({id:'asc'})
  })
  it('filters protected completed rows before counting/adding to a page',async()=>{
    const f=fixture(125);f.protectedFeatures.add('COMPLETED_SAMPLE_DATA');f.records.slice(0,80).forEach(r=>r.inputs.completed=true)
    const page=await f.service.query(f.context,'samples',f.date)
    expect(page.returned).toBe(45);expect(page.totalRecords).toBe(45);expect(page.hasMore).toBe(false)
    expect((await f.service.summarize(f.context,'samples',f.date)).totals['inputs.price'].value).toBe('4.50')
    f.context.grants.COMPLETED_SAMPLE_DATA='valid'
    expect((await f.service.query(f.context,'samples',f.date)).totalRecords).toBe(125)
  })
  it('requires historical authorization even if the date range has no records',async()=>{
    const f=fixture(0);f.protectedFeatures.add('HISTORICAL_DATES')
    await expect(f.service.summarize(f.context,'samples',undefined,'',{startDate:'2000-01-01',endDate:'2000-01-05'})).rejects.toThrow(ForbiddenException)
    expect(f.prisma.sampleBlock.findMany).not.toHaveBeenCalled()
  })
  it('computes a full precise total and distinguishes reserved rows / detected / priced counts',async()=>{
    const f=fixture()
    f.records.slice(120).forEach(r=>{r.inputs={...r.inputs,ironRaw:null as never,price:null as never}})
    const result=await f.service.summarize(f.context,'samples',f.date)
    expect(result.complete).toBe(true);expect(result.totalRecords).toBe(125)
    expect(result.totals['inputs.price']).toMatchObject({value:'12.00',validValues:120})
    expect(result.sampleCounts).toMatchObject({detected:120,priced:120,completed:0,uncompleted:125})
    expect(result).not.toHaveProperty('rows')
    f.settings.blockedFields.samples=['inputs.price','inputs.ironRaw']
    const limited=await f.service.summarize(f.context,'samples',f.date)
    expect(limited.totals).not.toHaveProperty('inputs.price');expect(limited.sampleCounts).not.toHaveProperty('priced');expect(limited.sampleCounts).not.toHaveProperty('detected')
  })
  it('calculates full report statistics across months, using the report count rather than record count',async()=>{
    const f=fixture()
    const result=await f.service.summarize(f.context,'income',undefined,'',{startDate:'2026-09-01',endDate:'2026-10-01'})
    expect(result.totalRecords).toBe(3);expect(result.totals.sampleCount.value).toBe(145);expect(result.totals.totalAmount.value).toBe('8360.00')
    expect(f.finance.getFrontendIncomeReport.mock.calls.map(c=>c[1])).toEqual(['2026-09','2026-10'])
    f.settings.blockedFields.samples=['inputs.price']
    expect((await f.service.summarize(f.context,'income',f.date)).totals).not.toHaveProperty('totalAmount')
  })
  it('rejects cross-account and subaccount menu escalation before querying',async()=>{
    const f=fixture();await expect(f.service.query({...f.context,ownerId:'foreign'},'samples',f.date)).rejects.toThrow(/跨账号/)
    f.user.role='SUB_ADMIN';await expect(f.service.query({...f.context,ownerId:'foreign'},'samples',f.date)).rejects.toThrow()
    f.user.role='FRONTEND_SUB_USER'
    await expect(f.service.query(f.context,'samples',f.date)).rejects.toThrow()
    expect(f.prisma.sampleBlock.findMany).not.toHaveBeenCalled()
  })
  it('binds cursors to actor, owner, conversation, query and permissions; rejects tampering',async()=>{
    const f=fixture(),page=await f.service.query(f.context,'samples',f.date)
    for(const [context,keyword,cursor]of[[{...f.context,conversationId:'other'},'',page.nextCursor],[f.context,'new',page.nextCursor],[f.context,'',page.nextCursor!.slice(0,-2)+'xx']]as const){await expect(f.service.query(context,'samples',f.date,keyword,{cursor:cursor!})).rejects.toThrow(/标记/)}
    f.settings.revision++
    await expect(f.service.query(f.context,'samples',f.date,'',{cursor:page.nextCursor!})).rejects.toThrow(/标记/)
  })
  it('rejects stale pages when authorized business values change',async()=>{
    const f=fixture(),page=await f.service.query(f.context,'samples',f.date)
    f.records[0].inputs.price=999
    await expect(f.service.query(f.context,'samples',f.date,'',{cursor:page.nextCursor!})).rejects.toThrow(/数据已经变化/)
  })
  it('continues the latest page across chat turns without asking for a cursor',async()=>{
    const f=fixture();await f.service.query(f.context,'samples',f.date)
    const next=await f.service.continueQuery(f.context,'samples')
    expect(next.rows[0].id).toBe('sample-50')
    await f.service.continueQuery(f.context)
    expect(await f.service.continueQuery(f.context)).toMatchObject({rows:[],hasMore:false})
    await expect(f.service.continueQuery({...f.context,conversationId:'other'})).rejects.toThrow(/尚未查询/)
    expect(f.prisma.aiAuditLog.findFirst.mock.calls[0][0].where).toMatchObject({actorId:'actor',ownerId:'actor',detail:{path:['conversationId'],equals:'c'}})
  })
  it('rechecks revoked authorization and the external channel before returning data',async()=>{
    const f=fixture();f.prisma.$transaction.mockImplementation(async(callback:any)=>{const result=await callback(f.prisma);f.settings.enabled=false;return result})
    await expect(f.service.query(f.context,'samples',f.date)).rejects.toThrow(/尚未启用/)
    expect(f.audit).toHaveLength(0)
    const g=fixture();await expect(g.service.query({...g.context,channel:{assertCurrent:async()=>{throw new Error('revoked')},audit:{source:'FEISHU'}}},'samples',g.date)).rejects.toThrow('revoked')
    expect(g.audit).toHaveLength(0)
  })
  it('never returns a partial total when the server scan budget is exceeded',async()=>{
    const f=fixture(1)
    const scan=vi.spyOn(AiDataService.prototype,'batches').mockImplementation(async function*(){yield new Array(AI_MAX_SCAN_ROWS+1).fill(f.records[0])})
    try{await expect(f.service.summarize(f.context,'samples',f.date)).rejects.toThrow(/尚未完成全量统计/);expect(f.audit).toHaveLength(0)}finally{scan.mockRestore()}
  })
})

describe('query scope and cursor validation',()=>{
  it('validates date ranges, disallows unrecognized fields and normalizes monthly scope',()=>{
    expect(businessQuerySchema.safeParse({resource:'samples',startDate:'2026-10-05',endDate:'2026-10-01'}).success).toBe(false)
    expect(businessQuerySchema.safeParse({resource:'samples',date:'2026-10-01',offset:100}).success).toBe(false)
    expect(businessQuerySchema.safeParse({resource:'samples',startDate:'2025-01-01',endDate:'2026-10-01'}).success).toBe(false)
    expect(()=>queryScope('customers',undefined,{startDate:'2026-10-01',endDate:'2026-10-05'})).toThrow(/没有日期范围/)
    expect(queryScope('payroll',undefined,{startDate:'2026-02-15',endDate:'2026-03-02'})).toEqual({startDate:'2026-02-01',endDate:'2026-03-31',wholeMonths:true})
  })
  it('rejects expired and fabricated cursors',()=>{
    const cursor=encodePageCursor('scope','a'.repeat(64),50)
    expect(decodePageCursor(cursor,'scope')?.offset).toBe(50)
    vi.spyOn(Date,'now').mockReturnValue(Date.now()+16*60_000)
    expect(()=>decodePageCursor(cursor,'scope')).toThrow(/过期/)
    vi.restoreAllMocks()
    expect(()=>decodePageCursor('fake.token','scope')).toThrow(/标记/)
  })
})

describe('multi-owner authorized read snapshots',()=>{
  it('merges pages with a global limit of 50 and keeps account provenance',async()=>{
    const f=multiFixture(),first=await f.service.query(f.context,'samples',f.date)
    const next=await f.service.continueQuery(f.context)
    expect(first.returned).toBe(50);expect(next.rows).toHaveLength(40);expect(next.hasMore).toBe(false)
    expect(first.totalRecords).toBe(90)
    expect(first.accounts?.map(a=>a.totalRecords)).toEqual([60,30])
    expect(next.rows.filter(r=>r.owner.id==='actor')).toHaveLength(10)
    expect(next.rows.filter(r=>r.owner.id==='other')).toHaveLength(30)
    expect(next.rows.every(r=>r.owner.id&&r.owner.username&&!('account'in r.owner))).toBe(true)
  })
  it('returns precise combined and per-account statistics in one snapshot',async()=>{
    const f=multiFixture(),result=await f.service.summarize(f.context,'samples',f.date)
    expect(result.totalRecords).toBe(90);expect(result.totals['inputs.price'].value).toBe('12.00')
    expect(result.accounts?.map(a=>a.totals['inputs.price'].value)).toEqual(['6.00','6.00'])
    expect(result.sampleCounts?.detected).toBe(90)
    expect(result.accounts?.map(a=>a.owner.id)).toEqual(['actor','other'])
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1)
    f.settings.blockedFields.samples=['inputs.price']
    const denied=await f.service.summarize(f.context,'samples',f.date)
    expect(denied.totals).not.toHaveProperty('inputs.price');expect(denied.accounts?.every(a=>!('inputs.price'in a.totals))).toBe(true)
  })
  it('does not return partial results when a selected account is unauthorized or revoked',async()=>{
    const f=multiFixture()
    await expect(f.service.query({...f.context,ownerIds:['actor','foreign']},'samples',f.date)).rejects.toThrow()
    expect(f.prisma.sampleBlock.findMany).not.toHaveBeenCalled()
    f.prisma.$transaction.mockImplementation(async(callback:any)=>{const result=await callback(f.prisma);f.disabled.add('other');return result})
    await expect(f.service.query(f.context,'samples',f.date)).rejects.toThrow(/停用/)
    expect(f.audit).toHaveLength(0)
  })
  it('binds pagination to the entire account set and all selected account data',async()=>{
    const f=multiFixture(),first=await f.service.query(f.context,'samples',f.date)
    await expect(f.service.query({...f.context,ownerIds:['actor']},'samples',f.date,'',{cursor:first.nextCursor!})).rejects.toThrow(/标记/)
    await expect(f.service.continueQuery({...f.context,ownerIds:['actor']})).rejects.toThrow(/账号范围/)
    const reordered=await f.service.query({...f.context,ownerIds:['other','actor']},'samples',f.date,'',{cursor:first.nextCursor!})
    expect(reordered.returned).toBe(40)
    f.records.at(-1)!.inputs.price=5
    await expect(f.service.query(f.context,'samples',f.date,'',{cursor:first.nextCursor!})).rejects.toThrow(/数据已经变化/)
  })
  it('does not multiply a global model list by the number of selected accounts',async()=>{
    const f=multiFixture();await expect(f.service.summarize(f.context,'aiModels')).rejects.toThrow(/全局配置/)
  })
  it('deduplicates a shared settlement without exposing an unselected counterparty',async()=>{
    const f=multiFixture()
    f.prisma.sharedPrepaidSettlement={findMany:vi.fn(async({where,skip,take}:any)=>[{id:'shared',accountAId:'actor',accountBId:'other',netAmount:10},{id:'unselected-counterparty',accountAId:'actor',accountBId:'foreign',netAmount:2}].filter(r=>where.OR.some((p:any)=>p.accountAId===r.accountAId||p.accountBId===r.accountBId)).slice(skip,skip+take))}
    const summary=await f.service.summarize(f.context,'prepaidSettlements')
    expect(summary.totalRecords).toBe(2);expect(summary.totals.netAmount.value).toBe('12.00')
    expect(summary.accounts?.map(a=>a.totalRecords)).toEqual([2,1])
    const detail=await f.service.query(f.context,'prepaidSettlements')
    expect(detail.rows).toHaveLength(2)
    expect(detail.rows.find(r=>r.id==='shared')?.owners.map((o:any)=>o.id).sort()).toEqual(['actor','other'])
    expect(JSON.stringify(detail)).not.toMatch(/accountAId|accountBId|foreign/)
  })
})
