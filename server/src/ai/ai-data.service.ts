import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { FinanceService } from '../finance/finance.service'
import { CalculationDraftService } from '../calculation-drafts/calculation-draft.service'
import { CustomerOverviewService } from '../customer-overview/customer-overview.service'
import { businessDateInBeijing } from '../common/date'
import { dateSchema, type Resource } from './ai.catalog'
import type { CurrentUser } from '../auth/current-user'
import { defaultLabReportTemplate, defaultLabReportSmsTemplate } from '../frontend-preferences/frontend-preferences.defaults'

export function jsonSafe(value: unknown): any {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object') {
    if ('toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,jsonSafe(v)]))
  }
  return value
}

@Injectable()
export class AiDataService {
  constructor(private readonly prisma: PrismaService, private readonly finance: FinanceService, private readonly drafts: CalculationDraftService, private readonly customers: CustomerOverviewService) {}
  async rows(ownerId: string, resource: Resource, date?: string, user?:CurrentUser) {
    const day = dateSchema.parse(date || businessDateInBeijing()), month = day.slice(0,7)
    const where = { frontendUserId: ownerId }, take = 50
    const db = this.prisma
    switch (resource) {
      case 'standardSamples': { const d = await this.drafts.get(ownerId, 'STANDARD_SAMPLE'); return [{ id: 'STANDARD_SAMPLE', ...d.payload, revision: d.revision }] }
      case 'coefficients': { const d = await this.drafts.get(ownerId, 'COEFFICIENT'); return [...d.payload.standardRows.map(r=>({ ...r,rowKind:'standardRows',revision:d.revision })),...d.payload.calculationRows.map(r=>({...r,rowKind:'calculationRows',revision:d.revision}))].slice(0,take) }
      case 'reportImage': case 'reportSms': {
        const section = resource === 'reportImage' ? 'LAB_REPORT_TEMPLATE' : 'LAB_REPORT_SMS_TEMPLATE'
        const row = await db.frontendBusinessPreference.findUnique({ where:{frontendUserId_section:{frontendUserId:ownerId,section}} })
        return [{ id:section,...(row?.value as object || (resource==='reportImage'?defaultLabReportTemplate:defaultLabReportSmsTemplate)),version:row?.version||0 }]
      }
      case 'employees': return db.employee.findMany({ where, take, orderBy:{employeeNumber:'asc'}, select:{id:true,employeeNumber:true,name:true,status:true,phone:true,hireDate:true,terminationDate:true,baseSalary:true,attendanceBonus:true,overtimeHourlyRate:true,restQuotaDays:true,updatedAt:true} })
      case 'schedules': { const rows = await db.employeeMonthlyScheduleDay.findMany({where:{...where,date:{startsWith:month}},take,orderBy:[{date:'asc'},{employeeId:'asc'}],include:{segments:{orderBy:{sequence:'asc'},select:{startTime:true,endTime:true}}}}); return rows.map(r=>({...r,segments:r.segments.map(s=>({startTime:s.startTime,endTime:s.endTime}))})) }
      case 'attendance': { const rows = await db.employeeAttendanceRecord.findMany({where:{...where,date:{startsWith:month}},take,orderBy:{date:'desc'},include:{segments:{orderBy:{sequence:'asc'},select:{checkInAt:true,checkOutAt:true}}}}); return rows.map(r=>({...r,actualSegments:r.segments})) }
      case 'leaves': return db.employeeLeaveRequest.findMany({where:{...where,startDate:{lte:`${month}-31`},endDate:{gte:`${month}-01`}},take,orderBy:{startDate:'desc'}})
      case 'leaveTypes': return db.employeeLeaveType.findMany({where,take,orderBy:{name:'asc'}})
      case 'commissionTypes': return db.employeeCommissionType.findMany({where,take,orderBy:{name:'asc'}})
      case 'commissions': { const rows=await db.employeeCommissionRecord.findMany({where:{...where,date:{startsWith:month}},take,orderBy:{date:'desc'}});return rows.map(r=>({...r,unitPrice:r.unitPriceSnapshot})) }
      case 'bonuses': return db.employeeBonus.findMany({where:{...where,date:{startsWith:month}},take,orderBy:{date:'desc'}})
      case 'payroll': { const rows = await db.employeePayrollItem.findMany({where:{...where,payrollRun:{month}},take,orderBy:{employeeNumberSnapshot:'asc'},select:{id:true,payrollRunId:true,employeeId:true,employeeNumberSnapshot:true,employeeNameSnapshot:true,baseSalary:true,attendanceBonus:true,commissionAmount:true,bonusAmount:true,adjustmentAmount:true,payableAmount:true,payrollRun:{select:{id:true,month:true,status:true}}}});return rows.map(r=>({...r,month:r.payrollRun.month,status:r.payrollRun.status,employeeNumber:r.employeeNumberSnapshot,employeeName:r.employeeNameSnapshot})) }
      case 'payrollAdjustments': return db.employeePayrollAdjustment.findMany({where:{...where,payrollItem:{payrollRun:{month}}},take,orderBy:{createdAt:'desc'}})
      case 'prepaidRecharges': { const rows=await db.sharedPrepaidRecharge.findMany({where:{ownerFrontendUserId:ownerId,rechargeDate:{startsWith:month}},take,orderBy:{createdAt:'desc'},include:{member:{select:{phone:true}}}});return rows.map(r=>({...r,phone:r.member.phone})) }
      case 'prepaidCustomers': {
        const rows = await db.sharedPrepaidMember.findMany({where:{recharges:{some:{ownerFrontendUserId:ownerId}}},take,orderBy:{phone:'asc'},select:{id:true,phone:true,recharges:{where:{ownerFrontendUserId:ownerId,reversedAt:null},select:{remainingAmount:true}}}})
        return rows.map(r=>({id:r.id,phone:r.phone,remainingAmount:r.recharges.reduce((sum,n)=>sum+Number(n.remainingAmount),0)}))
      }
      case 'prepaidConsumptions': { const rows=await db.sharedPrepaidConsumption.findMany({where:{consumingFrontendUserId:ownerId,sheetDate:{startsWith:month}},take,orderBy:{createdAt:'desc'}});return rows.map(r=>({...r,phone:r.phoneSnapshot,sampleNumber:r.sampleNumberSnapshot})) }
      case 'prepaidSettlements': return db.sharedPrepaidSettlement.findMany({where:{OR:[{accountAId:ownerId},{accountBId:ownerId}]},take,orderBy:{createdAt:'desc'},select:{id:true,netAmount:true,status:true,actualTransferredAt:true,remark:true,rejectionReason:true}})
      case 'income': { const r=await this.finance.getFrontendIncomeReport(ownerId,month);return r.rows.slice(0,take) }
      case 'unsettled': { const r=await this.finance.getFrontendUnsettledSamples(ownerId);return r.slice(0,take).map(row=>({...row,id:row.blockId,paymentStatus:'未结款'})) }
      case 'monthly': { const r=await this.finance.getFrontendMonthlySettlementReport(ownerId,month);return r.summaryRows.slice(0,take).map(({id:_derivedId,...row})=>({...row,...(row.recordId?{id:row.recordId}:{})})) }
      // Derived row keys contain customer text; never bypass field grants through IDs.
      case 'monthlyDaily': { const r=await this.finance.getFrontendMonthlySettlementReport(ownerId,month);return r.dailyRows.slice(0,take).map(({id:_derivedId,...row})=>row) }
      case 'monthlyCustomers': { if(!user)throw new Error('需要真实管理员身份');return (await this.finance.getAdminMonthlyCustomers(user,{frontendUserIds:[ownerId],month})).slice(0,take) }
      case 'reportsSamples': { const r=await this.finance.getFrontendIncomeReport(ownerId,month);return r.rows.slice(0,take).map(row=>({...row,totalPrice:row.totalAmount})) }
      case 'reportsFinance': {
        const income=await this.finance.getFrontendIncomeReport(ownerId,month)
        const expense=await db.financeEntry.groupBy({by:['paymentDate'],where:{...where,paymentDate:{startsWith:month}},_sum:{amount:true}})
        return income.rows.slice(0,take).map(r=>{const e=Number(expense.find(n=>n.paymentDate===r.date)?._sum.amount||0);return{date:r.date,income:r.totalAmount,expense:e,profit:r.totalAmount-e}})
      }
      case 'medicineInbounds': case 'medicineOutbounds': { const rows=await db.medicineInventoryMovement.findMany({where:{...where,occurredOn:{startsWith:month},type:{in:resource==='medicineInbounds'?['INBOUND','CORRECTION_OUT']:['OUTBOUND','CORRECTION_IN']}},take,orderBy:{occurredOn:'desc'}});return rows.map(r=>({...r,name:r.nameSnapshot,unit:r.unitSnapshot})) }
      case 'medicineNames': return db.medicineCommonName.findMany({where,take,orderBy:{name:'asc'}})
      case 'customerOverview': return (await this.customers.getRows([ownerId])).slice(0,take)
      case 'blacklist': return db.blacklistRecord.findMany({where:{uploadedById:ownerId},take,orderBy:{uploadedAt:'desc'},select:{id:true,phone:true,wechat:true,wechatNickname:true,amount:true,other:true,note:true,updatedAt:true}})
      case 'abnormal': return db.abnormalRecord.findMany({where:{...where,date:{startsWith:month}},take,orderBy:{date:'desc'}})
      case 'financeDeletionRequests': return db.financeDeletionRequest.findMany({where,take,orderBy:{createdAt:'desc'},select:{id:true,sourceType:true,sourceId:true,reason:true,status:true,reviewRemark:true,updatedAt:true}})
      case 'sampleChangeRequests': return db.labSampleChangeRequest.findMany({where,take,orderBy:{createdAt:'desc'},select:{id:true,date:true,blockIndex:true,reason:true,status:true,reviewRemark:true,updatedAt:true}})
      case 'accounts': { const row=await db.user.findUnique({where:{id:ownerId},select:{id:true,account:true,username:true,disabled:true,displayRemark:true}});return row?[row]:[] }
      case 'aiModels': return db.aiModel.findMany({take,select:{id:true,name:true,enabled:true,vision:true,tools:true}})
      default: throw new Error('此菜单没有查询适配器')
    }
  }
}
