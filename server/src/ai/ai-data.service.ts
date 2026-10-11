import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FinanceService } from '../finance/finance.service'
import { CalculationDraftService } from '../calculation-drafts/calculation-draft.service'
import { CustomerOverviewService } from '../customer-overview/customer-overview.service'
import type { Resource } from './ai.catalog'
import type { CurrentUser } from '../auth/current-user'
import { defaultLabReportTemplate, defaultLabReportSmsTemplate } from '../frontend-preferences/frontend-preferences.defaults'
import { AI_SCAN_BATCH_SIZE, monthEnd, scopeMonths, type AiQueryScope } from './ai-query'

export function jsonSafe(value: unknown): any {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object') {
    if ('toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,jsonSafe(v)]))
  }
  return value
}
type Row = Record<string, any>
type Delegate = { findMany(args: any): Promise<Row[]> }

@Injectable()
export class AiDataService {
  constructor(private readonly prisma: PrismaService, private readonly finance: FinanceService, private readonly drafts: CalculationDraftService, private readonly customers: CustomerOverviewService) {}

  /** Bounded database batches in a repeatable-read snapshot; never expose raw rows to a model. */
  async *batches(ownerId: string, resource: Resource, scope: AiQueryScope, user: CurrentUser): AsyncGenerator<Row[]> {
    const db = this.prisma, where = { frontendUserId: ownerId }
    const dates = scope.startDate ? { gte: scope.startDate, lte: scope.endDate } : undefined
    const months = scope.startDate ? { gte: scope.startDate.slice(0,7), lte: scope.endDate!.slice(0,7) } : undefined
    let delegate: Delegate | undefined, args: Record<string, any> = {}, transform: (row: Row) => Row = row => row
    switch (resource) {
      case 'samples':
        delegate=db.sampleBlock; args={where:{sheet:{...where,date:dates}},orderBy:[{sheet:{date:'asc'}},{index:'asc'}],select:{id:true,index:true,inputs:true,results:true,sheet:{select:{date:true}}}}; break
      case 'customers': delegate=db.customer; args={where,orderBy:{updatedAt:'desc'},select:{id:true,name:true,phone:true,wechat:true,wechatNickname:true}}; break
      case 'expenses': delegate=db.financeEntry; args={where:{...where,paymentDate:dates},orderBy:{paymentDate:'desc'},select:{id:true,paymentDate:true,item:true,amount:true,paymentMethod:true,remark:true}}; break
      case 'medicine': delegate=db.medicineInventoryItem; args={where,orderBy:{name:'asc'},select:{id:true,name:true,unit:true,currentQuantity:true}}; break
      case 'employees': delegate=db.employee; args={where,orderBy:{employeeNumber:'asc'},select:{id:true,employeeNumber:true,name:true,status:true,phone:true,hireDate:true,terminationDate:true,baseSalary:true,attendanceBonus:true,overtimeHourlyRate:true,restQuotaDays:true,updatedAt:true}}; break
      case 'schedules': delegate=db.employeeMonthlyScheduleDay; args={where:{...where,date:dates},orderBy:[{date:'asc'},{employeeId:'asc'}],include:{segments:{orderBy:{sequence:'asc'},select:{startTime:true,endTime:true}}}}; transform=r=>({...r,segments:r.segments.map((s:Row)=>({startTime:s.startTime,endTime:s.endTime}))}); break
      case 'attendance': delegate=db.employeeAttendanceRecord; args={where:{...where,date:dates},orderBy:{date:'desc'},include:{segments:{orderBy:{sequence:'asc'},select:{checkInAt:true,checkOutAt:true}}}}; transform=r=>({...r,actualSegments:r.segments}); break
      case 'leaves': delegate=db.employeeLeaveRequest; args={where:{...where,startDate:{lte:scope.endDate},endDate:{gte:scope.startDate}},orderBy:{startDate:'desc'}}; break
      case 'leaveTypes': delegate=db.employeeLeaveType; args={where,orderBy:{name:'asc'}}; break
      case 'commissionTypes': delegate=db.employeeCommissionType; args={where,orderBy:{name:'asc'}}; break
      case 'commissions': delegate=db.employeeCommissionRecord; args={where:{...where,date:dates},orderBy:{date:'desc'}}; transform=r=>({...r,unitPrice:r.unitPriceSnapshot}); break
      case 'bonuses': delegate=db.employeeBonus; args={where:{...where,date:dates},orderBy:{date:'desc'}}; break
      case 'payroll': delegate=db.employeePayrollItem; args={where:{...where,payrollRun:{month:months}},orderBy:{employeeNumberSnapshot:'asc'},select:{id:true,payrollRunId:true,employeeId:true,employeeNumberSnapshot:true,employeeNameSnapshot:true,baseSalary:true,attendanceBonus:true,commissionAmount:true,bonusAmount:true,adjustmentAmount:true,payableAmount:true,payrollRun:{select:{id:true,month:true,status:true}}}}; transform=r=>({...r,month:r.payrollRun.month,status:r.payrollRun.status,employeeNumber:r.employeeNumberSnapshot,employeeName:r.employeeNameSnapshot}); break
      case 'payrollAdjustments': delegate=db.employeePayrollAdjustment; args={where:{...where,payrollItem:{payrollRun:{month:months}}},orderBy:{createdAt:'desc'}}; break
      case 'prepaidRecharges': delegate=db.sharedPrepaidRecharge; args={where:{ownerFrontendUserId:ownerId,rechargeDate:dates},orderBy:{createdAt:'desc'},include:{member:{select:{phone:true}}}}; transform=r=>({...r,phone:r.member.phone}); break
      case 'prepaidCustomers': delegate=db.sharedPrepaidMember; args={where:{recharges:{some:{ownerFrontendUserId:ownerId}}},orderBy:{phone:'asc'},select:{id:true,phone:true,recharges:{where:{ownerFrontendUserId:ownerId,reversedAt:null},select:{remainingAmount:true}}}}; transform=r=>({id:r.id,phone:r.phone,remainingAmount:r.recharges.reduce((sum:number,n:Row)=>sum+Number(n.remainingAmount),0)}); break
      case 'prepaidConsumptions': delegate=db.sharedPrepaidConsumption; args={where:{consumingFrontendUserId:ownerId,sheetDate:dates},orderBy:{createdAt:'desc'}}; transform=r=>({...r,phone:r.phoneSnapshot,sampleNumber:r.sampleNumberSnapshot}); break
      case 'prepaidSettlements': delegate=db.sharedPrepaidSettlement; args={where:{OR:[{accountAId:ownerId},{accountBId:ownerId}]},select:{id:true,accountAId:true,accountBId:true,netAmount:true,status:true,actualTransferredAt:true,remark:true,rejectionReason:true}}; break
      case 'medicineInbounds': case 'medicineOutbounds': delegate=db.medicineInventoryMovement; args={where:{...where,occurredOn:dates,type:{in:resource==='medicineInbounds'?['INBOUND','CORRECTION_OUT']:['OUTBOUND','CORRECTION_IN']}},orderBy:{occurredOn:'desc'}}; transform=r=>({...r,name:r.nameSnapshot,unit:r.unitSnapshot}); break
      case 'medicineNames': delegate=db.medicineCommonName; args={where,orderBy:{name:'asc'}}; break
      case 'blacklist': delegate=db.blacklistRecord; args={where:{uploadedById:ownerId},orderBy:{uploadedAt:'desc'},select:{id:true,phone:true,wechat:true,wechatNickname:true,amount:true,other:true,note:true,updatedAt:true}}; break
      case 'abnormal': delegate=db.abnormalRecord; args={where:{...where,date:dates},orderBy:{date:'desc'}}; break
      case 'financeDeletionRequests': delegate=db.financeDeletionRequest; args={where,select:{id:true,sourceType:true,sourceId:true,reason:true,status:true,reviewRemark:true,updatedAt:true}}; break
      case 'sampleChangeRequests': delegate=db.labSampleChangeRequest; args={where:{...where,...(dates?{date:dates}:{})},select:{id:true,date:true,blockIndex:true,reason:true,status:true,reviewRemark:true,updatedAt:true}}; break
      case 'aiModels': delegate=db.aiModel; args={select:{id:true,name:true,enabled:true,vision:true,tools:true}}; break
    }
    if (delegate) {
      // Unique tie-breakers prevent overlaps when multiple rows have the same date/name.
      const orderBy=[...(Array.isArray(args.orderBy)?args.orderBy:args.orderBy?[args.orderBy]:[]),{id:'asc'}]
      for (let skip=0;;skip+=AI_SCAN_BATCH_SIZE) {
        const batch=await delegate.findMany({...args,orderBy,skip,take:AI_SCAN_BATCH_SIZE})
        if (!batch.length) break
        yield batch.map(transform)
        if (batch.length<AI_SCAN_BATCH_SIZE) break
      }
      return
    }
    const rows=await this.derivedRows(ownerId,resource,scope,user)
    for (let offset=0;offset<rows.length;offset+=AI_SCAN_BATCH_SIZE) yield rows.slice(offset,offset+AI_SCAN_BATCH_SIZE)
  }

  private async derivedRows(ownerId:string,resource:Resource,scope:AiQueryScope,user:CurrentUser):Promise<Row[]> {
    const db=this.prisma, where={frontendUserId:ownerId}
    const inRange=(date:string)=>!scope.startDate||date>=scope.startDate&&date<=scope.endDate!
    switch (resource) {
      case 'standardSamples': {const d=await this.drafts.get(ownerId,'STANDARD_SAMPLE');return[{id:'STANDARD_SAMPLE',...d.payload,revision:d.revision}]}
      case 'coefficients': {const d=await this.drafts.get(ownerId,'COEFFICIENT');return[...d.payload.standardRows.map(r=>({...r,rowKind:'standardRows',revision:d.revision})),...d.payload.calculationRows.map(r=>({...r,rowKind:'calculationRows',revision:d.revision}))]}
      case 'reportImage': case 'reportSms': {const section=resource==='reportImage'?'LAB_REPORT_TEMPLATE':'LAB_REPORT_SMS_TEMPLATE';const row=await db.frontendBusinessPreference.findUnique({where:{frontendUserId_section:{frontendUserId:ownerId,section}}});return[{id:section,...(row?.value as object||(resource==='reportImage'?defaultLabReportTemplate:defaultLabReportSmsTemplate)),version:row?.version||0}]}
      case 'unsettled': return (await this.finance.getFrontendUnsettledSamples(ownerId)).filter(r=>inRange(r.date)).map(r=>({...r,id:r.blockId,paymentStatus:'未结款'}))
      case 'customerOverview': return this.customers.getRows([ownerId])
      case 'accounts': {const row=await db.user.findUnique({where:{id:ownerId},select:{id:true,account:true,username:true,disabled:true,displayRemark:true}});return row?[row]:[]}
    }
    const rows:Row[]=[]
    for (const month of scopeMonths(scope)) {
      switch(resource) {
        case 'income': case 'reportsSamples': {const report=await this.finance.getFrontendIncomeReport(ownerId,month);rows.push(...report.rows.filter(r=>inRange(r.date)).map(r=>({...r,...(resource==='reportsSamples'?{totalPrice:r.totalAmount}:{})})));break}
        case 'reportsFinance': {
          const income=await this.finance.getFrontendIncomeReport(ownerId,month)
          const expenses=await db.financeEntry.groupBy({by:['paymentDate'],where:{...where,paymentDate:{gte:month+'-01',lte:monthEnd(month+'-01')}},_sum:{amount:true}})
          const days=new Set([...income.rows.map(r=>r.date),...expenses.map(r=>r.paymentDate)])
          for (const date of [...days].sort()) if(inRange(date)) {const amount=income.rows.find(r=>r.date===date)?.totalAmount||0;const expense=Number(expenses.find(r=>r.paymentDate===date)?._sum.amount||0);rows.push({date,income:amount,expense,profit:amount-expense})}
          break
        }
        case 'monthly': case 'monthlyDaily': {const report=await this.finance.getFrontendMonthlySettlementReport(ownerId,month);const list=resource==='monthly'?report.summaryRows:report.dailyRows;rows.push(...list.filter(r=>!('date'in r)||inRange(r.date)).map(({id:_derivedId,...r})=>({...r,...('recordId'in r&&r.recordId?{id:r.recordId}:{})})));break}
        case 'monthlyCustomers': rows.push(...await this.finance.getAdminMonthlyCustomers(user,{frontendUserIds:[ownerId],month}));break
        default: throw new Error('此菜单没有查询适配器')
      }
    }
    return rows
  }
}
