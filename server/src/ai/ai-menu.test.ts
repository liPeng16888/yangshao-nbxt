import {describe,expect,it,vi} from 'vitest'
import {catalog,policySchema,validateRules} from './ai.catalog'
import {businessChangeSchema,operations,operationFor,requiresRecordId} from './ai-operations'
import {menuCatalog} from './ai-menu-catalog'
import {transactionServices} from './ai-transaction'
import {TenantRealtimeService} from '../realtime/tenant-realtime.service'
describe('expanded AI capabilities and transaction scope',()=>{
  it('accepts a full-menu policy instead of the previous four-resource limit',()=>{const rules=catalog.map(c=>({resource:c.key,readFields:c.fields.map(f=>f.key),writeFields:c.fields.filter(f=>f.writable).map(f=>f.key)}));expect(policySchema.safeParse({enabled:true,rules}).success).toBe(true);expect(()=>validateRules(rules)).not.toThrow()})
  it('has unique resource keys and forbids internal credentials/implementations',()=>{expect(new Set(catalog.map(c=>c.key)).size).toBe(catalog.length);expect(catalog.flatMap(c=>c.fields.map(f=>f.key)).join(' ')).not.toMatch(/parameterSnapshot|parameters|password|apiKey|Cipher|calculationSnapshot|sourceCode|photoPath/)})
  it.each(operations)('strictly validates $resource/$action inputs',operation=>{expect(operation.schema.safeParse({sql:'DELETE',frontendUserId:'other'}).success).toBe(false);expect(menuCatalog.find(c=>c.key===operation.resource)?.writeAudiences).toContain(operation.audience)})
  it('does not expose manual-only operations through generic actions',()=>{expect(()=>operationFor('accounts','update','admin')).toThrow();expect(()=>operationFor('payroll','confirm','frontend')).toThrow();expect(()=>operationFor('prepaidSettlements','confirm','frontend')).toThrow();expect(()=>operationFor('sampleChangeRequests','approve','admin')).toThrow()})
  it('does not trust client-supplied transaction or approval data',()=>{expect(businessChangeSchema.safeParse({resource:'employees',action:'create',data:{},confirmed:true}).success).toBe(false)})
  it('requires a real monthly bill ID for reminders, but composite input for updates',()=>{expect(requiresRecordId(operationFor('monthly','remind','admin'))).toBe(true);expect(requiresRecordId(operationFor('monthly','update','frontend'))).toBe(false)})
  it('cannot silently move an existing salary adjustment to another employee',()=>{expect(operationFor('payrollAdjustments','update','frontend').schema.safeParse({payrollItemId:'foreign',amount:1}).success).toBe(false)})
  it('nested business services join the exact transaction without mutating singleton dependencies',async()=>{
    const outside=vi.fn(),inside=vi.fn().mockResolvedValue({id:'row'}),prisma={$transaction:outside,employee:{create:outside}},tx={employee:{create:inside}},events:(()=>void)[]=[]
    class Service {constructor(public prisma:any,public child?:Service){} async create(){return this.prisma.$transaction((db:any)=>db.employee.create({data:{}}))}}
    const child=new Service(prisma),original=new Service(prisma,child)
    const scoped=transactionServices({original},prisma as never,tx as never,events).original
    await scoped.child!.create();expect(inside).toHaveBeenCalledTimes(1);expect(outside).not.toHaveBeenCalled();expect(original.prisma).toBe(prisma);expect(original.child).toBe(child)
  })
  it('queues realtime events until commit and can discard them on rollback',()=>{
    const realtime=new TenantRealtimeService(),publish=vi.spyOn(realtime,'publish'),prisma={},tx={},after:(()=>void)[]=[]
    class Service {constructor(public prisma:any,public realtime:TenantRealtimeService){} }
    const scoped=transactionServices({service:new Service(prisma,realtime)},prisma as never,tx as never,after).service
    scoped.realtime.publish({dataOwnerId:'a',module:'medicine-inventory',entityId:'i',operation:'create',changedById:'a',updatedAt:new Date().toISOString()})
    expect(publish).not.toHaveBeenCalled();expect(after).toHaveLength(1);after[0]();expect(publish).toHaveBeenCalledTimes(1)
  })
})
