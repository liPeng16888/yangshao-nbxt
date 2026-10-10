import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service'
import { CurrentUser } from '../auth/current-user'
import { EmployeeAttendanceService } from '../employee-attendance/employee-attendance.service'
import { PayrollService } from '../employee-attendance/payroll.service'
import { MedicineInventoryService } from '../medicine-inventory/medicine-inventory.service'
import { FinanceService } from '../finance/finance.service'
import { SharedPrepaidLedgerService } from '../shared-prepaid/shared-prepaid-ledger.service'
import { CalculationDraftService } from '../calculation-drafts/calculation-draft.service'
import { FrontendPreferencesService } from '../frontend-preferences/frontend-preferences.service'
import { BlacklistService } from '../blacklist/blacklist.service'
import { AdminAccessService } from '../admin/admin-access.service'
import { AiAccessService } from './ai-access.service'
import { catalog, projectedRow, type Grants, type Resource } from './ai.catalog'
import { businessChangeSchema, operationFor, operations, requiresRecordId, type AiOperation } from './ai-operations'
import { defaultLabReportTemplate, defaultLabReportSmsTemplate } from '../frontend-preferences/frontend-preferences.defaults'
import { transactionServices } from './ai-transaction'
import { jsonSafe } from './ai-data.service'

export type AiBusinessContext = {user:CurrentUser;ownerId:string;conversationId:string;grants:Grants}
export interface AiSavedOperation { action:string; data:Record<string,any>; targetId?:string; baseStamp:string|null }
const valueAt = (row:any,key:string) => key.split('.').reduce((v,k)=>v?.[k],row) ?? null
const stamp = (row:any):string|null => row ? String(row.revision ?? row.version ?? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt) ?? JSON.stringify(row)) : null

@Injectable()
export class AiOperationService {
  constructor(private readonly prisma:PrismaService,private readonly access:AiAccessService,private readonly employees:EmployeeAttendanceService,private readonly payroll:PayrollService,private readonly medicine:MedicineInventoryService,private readonly finance:FinanceService,private readonly ledger:SharedPrepaidLedgerService,private readonly drafts:CalculationDraftService,private readonly preferences:FrontendPreferencesService,private readonly blacklist:BlacklistService,private readonly admin:AdminAccessService) {}
  private audience(context:AiBusinessContext) { return this.access.isAdmin(context.user)?'admin' as const:'frontend' as const }
  async capabilities(context:AiBusinessContext,resource:Resource) {
    const entry=catalog.find(c=>c.key===resource)!
    const read=await this.access.fields(context.user,resource,'read',context.grants)
    let write:string[]=[]
    try {write=await this.access.fields(context.user,resource,'write',context.grants)} catch {}
    return {resource,label:entry.label,readFields:entry.fields.filter(f=>read.includes(f.key)).map(f=>({key:f.key,label:f.label})),writeFields:entry.fields.filter(f=>write.includes(f.key)).map(f=>({key:f.key,label:f.label})),operations:operations.filter(o=>o.resource===resource&&o.audience===this.audience(context)&&write.length&&(!o.permissionKeys||o.permissionKeys.every(k=>write.includes(k)))).map(o=>({action:o.action,label:o.label,requiresId:requiresRecordId(o),input:z.toJSONSchema(o.schema)})),note:entry.note}
  }
  private async permit(context:AiBusinessContext,operation:AiOperation,data:Record<string,any>,tx?:Prisma.TransactionClient) {
    const read=await this.access.fields(context.user,operation.resource,'read',context.grants,tx)
    const write=await this.access.fields(context.user,operation.resource,'write',context.grants,tx)
    const entry=catalog.find(c=>c.key===operation.resource)!
    const inputKeys=Object.keys(data).filter(k=>entry.fields.some(f=>f.key===k))
    const keys=[...inputKeys.filter(k=>entry.fields.some(f=>f.key===k&&f.writable)),...(operation.permissionKeys||[])]
    if(!keys.length||keys.some(k=>!read.includes(k)||!write.includes(k))||inputKeys.some(k=>!read.includes(k))) throw new ForbiddenException('没有此次操作所需的字段权限')
    const consequential = operation.resource==='unsettled'?['date','sampleNumber','amount']:operation.resource==='monthly'&&operation.action==='remind'?['month','customer']:operation.resource==='prepaidRecharges'&&operation.action==='reverse'?['phone','rechargeDate','paidAmount','giftAmount','remainingAmount']:operation.resource==='leaves'&&['approve','reject'].includes(operation.action)?['employeeId','leaveTypeId','startDate','endDate','unit','reason']:[]
    if(consequential.some(k=>!read.includes(k))) throw new ForbiddenException('必须允许读取待处理记录的完整关键内容，才能核对确认此操作')
    return {read,keys}
  }
  private async target(db:any,context:AiBusinessContext,operation:AiOperation,data:Record<string,any>,targetId?:string,draftService=this.drafts):Promise<any> {
    const owner=context.ownerId
    if(!operation.target) return null
    if(operation.target==='standardSamples'||operation.target==='coefficients') {
      const kind=operation.target==='standardSamples'?'STANDARD_SAMPLE':'COEFFICIENT'
      const row=await db.frontendCalculationDraft.findUnique({where:{frontendUserId_kind:{frontendUserId:owner,kind}}})
      const draft=row||await draftService.get(owner,kind)
      if(operation.target==='standardSamples') return {...(draft.payload as any),revision:draft.revision,id:row?.id||'STANDARD_SAMPLE'}
      const source=(draft.payload as any)?.[data.rowKind]?.find((r:any)=>r.id===targetId)
      if(!source) throw new NotFoundException('请先查询并选择当前账号的既有计算行')
      return {...source,revision:draft.revision}
    }
    if(operation.target==='reportImage'||operation.target==='reportSms') {
      const section=operation.target==='reportImage'?'LAB_REPORT_TEMPLATE':'LAB_REPORT_SMS_TEMPLATE'
      const row=await db.frontendBusinessPreference.findUnique({where:{frontendUserId_section:{frontendUserId:owner,section}}})
      return {...(row?.value as any || (operation.target==='reportImage'?defaultLabReportTemplate:defaultLabReportSmsTemplate)),version:row?.version||0,id:section}
    }
    let where:any={frontendUserId:owner}
    if(operation.target==='employeeMonthlyScheduleDay') where={...where,employeeId:data.employeeId,date:data.date}
    else if(operation.target==='monthlySettlementRecord'&&operation.action==='update') where={...where,month:data.month,customer:data.customer}
    else if(operation.target==='monthlyCustomerRemark') where={...where,customer:data.customer}
    else {
      if(!targetId) throw new BadRequestException('必须先查询并选择确切记录')
      where={...where,id:targetId}
      if(operation.target==='sharedPrepaidRecharge') where={id:targetId,ownerFrontendUserId:owner}
      if(operation.target==='blacklistRecord') where={id:targetId,uploadedById:owner}
      if(operation.target==='sampleBlock') where={id:targetId,sheet:{frontendUserId:owner}}
    }
    const row=await db[operation.target].findFirst({where})
    if(!row&&!['employeeMonthlyScheduleDay','monthlySettlementRecord','monthlyCustomerRemark'].includes(operation.target)) throw new NotFoundException('记录不存在或不属于当前账号')
    if(operation.target==='sampleBlock'&&row) return {...row,...row.inputs,date:(await db.labSheet.findUnique({where:{id:row.sheetId},select:{date:true}}))?.date,amount:row.inputs.price}
    if(operation.target==='sharedPrepaidRecharge'&&row) return {...row,phone:(await db.sharedPrepaidMember.findUnique({where:{id:row.memberId},select:{phone:true}}))?.phone}
    return row
  }
  async prepare(context:AiBusinessContext,input:unknown) {
    const body=businessChangeSchema.parse(input)
    const operation=operationFor(body.resource,body.action,this.audience(context)),data=operation.schema.parse(body.data) as Record<string,any>
    if(requiresRecordId(operation)?!body.id:Boolean(body.id)) throw new BadRequestException(requiresRecordId(operation)?'必须选择确切的记录':'此操作按输入位置定位，请勿附加记录编号')
    if(!Object.keys(data).length&&['update','save'].includes(operation.action)) throw new BadRequestException('没有需要修改的数据')
    if(operation.resource==='coefficients'&&Object.keys(data).length===1) throw new BadRequestException('没有需要修改的行字段')
    if(operation.resource==='coefficients'&&Object.keys(data).some(k=>k!=='rowKind'&&(data.rowKind==='standardRows'?k.startsWith('inputs.'):k!=='code'&&!k.startsWith('inputs.')))) throw new BadRequestException('标准行只接受标准值，测量行只接受原始输入')
    if(operation.resource==='prepaidRecharges'&&(operation.action==='reverse'||data.isOpeningBalance)&&!context.user.isFrontendMainAccount) throw new ForbiddenException('只有主账号可以执行此充值操作')
    const {read,keys}=await this.permit(context,operation,data)
    const row=await this.target(this.prisma,context,operation,data,body.id)
    const entry=catalog.find(c=>c.key===operation.resource)!
    const before=projectedRow(jsonSafe(row||{}),read)
    const changed=Object.entries(data).filter(([k])=>k!=='rowKind').map(([key,after])=>({key,label:entry.fields.find(f=>f.key===key)?.label||'操作原因',before:valueAt(before,key),after}))
    // Consequential actions must show the affected record, not only the action name.
    if(['reverse','approve','reject','remind','markPaid'].includes(operation.action)) {
      for(const field of entry.fields.filter(f=>!f.key.startsWith('actions.')&&read.includes(f.key))) if(!changed.some(f=>f.key===field.key)) changed.unshift({key:field.key,label:field.label,before:valueAt(before,field.key),after:valueAt(before,field.key)})
    }
    const location=`${entry[this.audience(context)]!.group}/${entry[this.audience(context)]!.label}/${body.id||data.date||data.month||data.rechargeDate||data.occurredOn||data.customer||'新增'}`
    return {resource:operation.resource,keys,payload:{action:operation.action,data,...(body.id?{targetId:body.id}:{}),baseStamp:stamp(row)} as AiSavedOperation,title:operation.label,location,fields:changed}
  }
  async execute(context:AiBusinessContext,resource:Resource,input:AiSavedOperation,tx:Prisma.TransactionClient,afterCommit:(()=>void)[],proposalId:string) {
    const operation=operationFor(resource,input.action,this.audience(context)),data=operation.schema.parse(input.data) as Record<string,any>
    await this.permit(context,operation,data,tx)
    const scoped=transactionServices({employees:this.employees,payroll:this.payroll,medicine:this.medicine,finance:this.finance,ledger:this.ledger,drafts:this.drafts,preferences:this.preferences,blacklist:this.blacklist,admin:this.admin},this.prisma,tx,afterCommit)
    if(this.audience(context)==='admin') await scoped.admin.getAllowedFrontendUserIds(context.user,[context.ownerId])
    const row=await this.target(tx,context,operation,data,input.targetId,scoped.drafts)
    if(stamp(row)!==input.baseStamp) throw new ConflictException('记录已经变化，请取消草稿后重新查询和核对')
    const owner=context.ownerId,actor=context.user.id,id=input.targetId!,version=row?.updatedAt?.toISOString?.()
    const payload={...data,...(version?{baseUpdatedAt:version}:{})},user=context.user
    const update=operation.action==='update'
    let result:any
    switch(resource) {
      case 'employees': result=update?await scoped.employees.updateEmployee(owner,actor,id,payload as any):await scoped.employees.createEmployee(owner,actor,payload as any);break
      case 'schedules': result=await scoped.employees.saveMonthlyScheduleDay(owner,actor,payload as any);break
      case 'attendance': result=update?await scoped.employees.updateAttendance(owner,actor,id,payload as any):await scoped.employees.createAttendance(owner,actor,payload as any);break
      case 'leaves': result=operation.action==='approve'?await scoped.employees.approveLeave(owner,actor,id,data.reviewRemark):operation.action==='reject'?await scoped.employees.rejectLeave(owner,actor,id,data.reviewRemark):update?await scoped.employees.updateLeaveRequest(owner,actor,id,payload as any):await scoped.employees.createLeaveRequest(owner,actor,payload as any);break
      case 'leaveTypes': result=update?await scoped.employees.updateLeaveType(owner,actor,id,payload as any):await scoped.employees.createLeaveType(owner,actor,payload as any);break
      case 'commissionTypes': result=update?await scoped.employees.updateCommissionType(owner,actor,id,payload as any):await scoped.employees.createCommissionType(owner,actor,payload as any);break
      case 'commissions': result=update?await scoped.employees.updateCommissionRecord(owner,actor,id,payload as any):await scoped.employees.createCommissionRecord(owner,actor,payload as any);break
      case 'bonuses': result=update?await scoped.employees.updateBonus(owner,actor,id,payload as any):await scoped.employees.createBonus(owner,actor,payload as any);break
      case 'payroll': result=await scoped.payroll.generate(owner,actor,data.month);break
      case 'payrollAdjustments': result=update?await scoped.payroll.updateAdjustment(owner,actor,id,data.amount??Number(row.amount),data.reason??row.reason,version):await scoped.payroll.createAdjustment(owner,actor,data.payrollItemId,data.amount,data.reason);break
      case 'prepaidRecharges': result=operation.action==='reverse'?await scoped.ledger.reverseRecharge(user,id,data.reason,`ai:${proposalId}`):await scoped.ledger.createRecharge(user,data as any,`ai:${proposalId}`);break
      case 'medicineInbounds': result=await scoped.medicine.createInbound(owner,actor,data as any);break
      case 'medicineOutbounds': result=await scoped.medicine.createOutbound(owner,actor,data as any);break
      case 'medicineNames': result=await scoped.medicine.createCommonName(owner,actor,data.name);break
      case 'unsettled': result=operation.action==='markPaid'?await scoped.finance.markFrontendSamplePaid(owner,id,actor):await scoped.finance.remindUnsettled(user,id);break
      case 'monthly': result=operation.action==='update'?await scoped.finance.updateFrontendMonthlySettlement(owner,actor,payload as any):await scoped.finance.remindMonthlyBill(user,id);break
      case 'monthlyCustomers': result=await scoped.finance.updateAdminMonthlyCustomerRemark(user,{frontendUserId:owner,customer:data.customer,remark:data.remark});break
      case 'blacklist': result=update?await scoped.blacklist.update(owner,actor,id,{...row,...payload,images:row.images}):await scoped.blacklist.create(owner,actor,data);break
      case 'abnormal': result=await tx.abnormalRecord.updateMany({where:{id,frontendUserId:owner,updatedAt:row.updatedAt},data:{remark:data.remark}});break
      case 'financeDeletionRequests': result=operation.action==='create'?await scoped.finance.createFrontendDeletionRequest(owner,actor,{sourceType:'expense',...data}):await scoped.finance.rejectDeletionRequest(user,id,data);break
      case 'standardSamples': case 'coefficients': {
        const kind=resource==='standardSamples'?'STANDARD_SAMPLE':'COEFFICIENT'
        const draft=await scoped.drafts.get(owner,kind),next=structuredClone(draft.payload) as any
        const target=resource==='standardSamples'?next:next[data.rowKind].find((r:any)=>r.id===id)
        if(!target) throw new ConflictException('计算行已不存在')
        for(const [key,value] of Object.entries(data)) {if(key==='rowKind') continue;const parts=key.split('.');if(parts.length===2) target[parts[0]][parts[1]]=value;else target[key]=value}
        result=await scoped.drafts.save(owner,kind,draft.revision,next);break
      }
      case 'reportImage': case 'reportSms': {
        const section=resource==='reportImage'?'LAB_REPORT_TEMPLATE':'LAB_REPORT_SMS_TEMPLATE'
        const defaults=resource==='reportImage'?defaultLabReportTemplate:defaultLabReportSmsTemplate
        const {version:baseVersion=0,id:_id,...stored}=row||{}
        result=await scoped.preferences.save(user,section,{baseVersion,value:{...defaults,...stored,...data}});break
      }
      default: throw new ForbiddenException('未开放的业务操作')
    }
    const entityId=String(result?.id||id||resource)
    return entityId
  }
}
