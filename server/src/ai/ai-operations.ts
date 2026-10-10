import { z } from 'zod'
import { dateSchema, type Resource } from './ai.catalog'
import type { AiAudience } from './ai-menu-catalog'
const text = z.string().trim().max(500), required = text.min(1), id = z.string().min(1).max(100)
const number = z.number().finite().min(0).max(999999999), money = z.number().finite().min(-999999999).max(999999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'金额最多两位小数')
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), empty = z.object({}).strict()
const employee = z.object({employeeNumber:required,name:required,status:z.enum(['ACTIVE','INACTIVE']).optional(),phone:text.optional(),hireDate:dateSchema,terminationDate:dateSchema.optional(),baseSalary:number.optional(),attendanceBonus:number.optional(),overtimeHourlyRate:number.optional(),restQuotaDays:number.optional()}).strict()
const schedule = z.object({employeeId:id,date:dateSchema,isWorkday:z.boolean(),segments:z.array(z.object({startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),endTime:z.string().regex(/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/)}).strict()).max(12),remark:text.optional()}).strict()
const attendance = z.object({employeeId:id,date:dateSchema,actualSegments:z.array(z.object({checkInAt:z.iso.datetime({offset:true}),checkOutAt:z.iso.datetime({offset:true})}).strict()).max(12),explicitAbsenceMinutes:number.int().max(1440).optional(),overtimeMinutes:number.int().max(1440).optional(),remark:text.optional()}).strict()
const leave = z.object({employeeId:id,leaveTypeId:id,startDate:dateSchema,endDate:dateSchema,unit:z.enum(['HOUR','HALF_DAY','FULL_DAY']),hours:number.positive().optional(),reason:required}).strict()
const leaveType = z.object({name:required,active:z.boolean().optional(),countsTowardRestQuota:z.boolean()}).strict()
const commissionType = z.object({name:required,unitName:required,unitPrice:number,active:z.boolean().optional()}).strict()
const commission = z.object({employeeId:id,commissionTypeId:id,date:dateSchema,quantity:number,unitPrice:number.optional(),remark:text.optional()}).strict()
const bonus = z.object({employeeId:id,date:dateSchema,amount:money,reason:required}).strict()
const adjustment = z.object({payrollItemId:id,amount:money,reason:required}).strict()
const blacklist = z.object({phone:text.optional(),wechat:text.optional(),wechatNickname:text.optional(),amount:number.nullable().optional(),other:text.optional(),note:text.optional()}).strict()
export interface AiOperation { resource: Resource; action: string; label: string; audience: AiAudience; schema: z.ZodObject<any>; target?: string; permissionKeys?: string[] }
const op = (resource:Resource,action:string,label:string,schema:z.ZodObject<any>,target?:string,audience:AiAudience='frontend',permissionKeys?:string[]):AiOperation=>({resource,action,label,schema,target,audience,permissionKeys})
const crud = (resource:Resource,label:string,schema:z.ZodObject<any>,target:string) => [op(resource,'create',`新增${label}`,schema),op(resource,'update',`修改${label}`,schema.partial().strict(),target)]
const standards = Object.fromEntries(['aluminum','silicon','iron'].flatMap(e=>['highStandard','highReading','lowStandard','lowReading',...(e==='aluminum'?['baseValue']:[])].map(k=>[`${e}.${k}`,number.nullable().optional()])))
export const operations: AiOperation[] = [
  op('standardSamples','update','修改标样输入',z.object(standards).strict(),'standardSamples'),
  op('coefficients','update','修改系数计算原始行',z.object({rowKind:z.enum(['standardRows','calculationRows']),code:text.optional(),aluminum:number.nullable().optional(),silicon:number.nullable().optional(),iron:number.nullable().optional(),calcium:number.nullable().optional(),magnesium:number.nullable().optional(),titanium:number.nullable().optional(),'inputs.ironRaw':number.nullable().optional(),'inputs.siliconRaw':number.nullable().optional(),'inputs.aluminumRaw':number.nullable().optional(),'inputs.calciumRaw':number.nullable().optional(),'inputs.magnesiumRaw':number.nullable().optional(),'inputs.titaniumRaw':number.nullable().optional()}).strict(),'coefficients'),
  op('reportImage','update','修改报告图片模板',z.object({title:text.optional(),sampleUnit:text.optional(),inspector:text.optional(),reviewer:text.optional(),address:text.optional(),phone:text.optional(),statements:z.array(text).length(4).optional()}).strict(),'reportImage'),
  op('reportSms','update','修改化验短信模板',z.object({prefix:text.optional(),suffix:text.optional()}).strict(),'reportSms'),
  ...crud('employees','员工档案',employee,'employee'),
  op('schedules','save','保存每日排班',schedule,'employeeMonthlyScheduleDay'),
  ...crud('attendance','考勤记录',attendance,'employeeAttendanceRecord'),
  ...crud('leaves','请假申请',leave,'employeeLeaveRequest'),
  op('leaves','approve','通过请假申请',z.object({reviewRemark:text.optional()}).strict(),'employeeLeaveRequest','frontend',['actions.approve']),
  op('leaves','reject','驳回请假申请',z.object({reviewRemark:required}).strict(),'employeeLeaveRequest','frontend',['actions.reject']),
  ...crud('leaveTypes','请假类型',leaveType,'employeeLeaveType'),
  ...crud('commissionTypes','提成类型',commissionType,'employeeCommissionType'),
  ...crud('commissions','提成记录',commission,'employeeCommissionRecord'),
  ...crud('bonuses','奖金记录',bonus,'employeeBonus'),
  op('payroll','generate','生成工资草稿',z.object({month}).strict(),undefined,'frontend',['actions.generate']),
  op('payrollAdjustments','create','新增工资调整',adjustment),
  op('payrollAdjustments','update','修改工资调整',adjustment.omit({payrollItemId:true}).partial().strict(),'employeePayrollAdjustment'),
  op('prepaidRecharges','create','录入预存款充值',z.object({phone:z.string().regex(/^1\d{10}$/),rechargeDate:dateSchema,paidAmount:number,giftAmount:number,isOpeningBalance:z.boolean(),remark:text.optional()}).strict()),
  op('prepaidRecharges','reverse','冲正本人充值',z.object({reason:required}).strict(),'sharedPrepaidRecharge','frontend',['actions.reverse']),
  op('medicineInbounds','create','新增药品入库',z.object({occurredOn:dateSchema,name:required,unit:z.enum(['BOTTLE','LITER','MILLILITER','GRAM']),quantity:number.positive(),remark:text.optional()}).strict()),
  op('medicineOutbounds','create','新增药品出库',z.object({occurredOn:dateSchema,medicineItemId:id,quantity:number.positive(),remark:text.optional()}).strict()),
  op('medicineNames','create','新增常用药品名称',z.object({name:required}).strict()),
  op('unsettled','markPaid','标记样品已结款',z.object({paymentStatus:z.literal('已结款')}).strict(),'sampleBlock','frontend',['paymentStatus']),
  op('unsettled','remind','发送未结款提醒',empty,'sampleBlock','admin',['actions.remind']),
  op('monthly','update','更新月结款状态',z.object({month,customer:required,settlementStatus:z.enum(['未结款','部分结款','已结款']),paidAmount:number.nullable().optional(),remark:text.optional()}).strict(),'monthlySettlementRecord','frontend',['settlementStatus']),
  op('monthly','remind','发送月结款提醒',empty,'monthlySettlementRecord','admin',['actions.remind']),
  op('monthlyCustomers','update','修改月结客户备注',z.object({customer:required,remark:text}).strict(),'monthlyCustomerRemark','admin',['remark']),
  ...crud('blacklist','本人黑名单',blacklist,'blacklistRecord'),
  op('abnormal','update','修改异常记录备注',z.object({remark:text}).strict(),'abnormalRecord','admin'),
  op('financeDeletionRequests','create','提交支出删除申请',z.object({sourceId:id,reason:required}).strict()),
  op('financeDeletionRequests','reject','驳回支出删除申请',z.object({reviewRemark:required}).strict(),'financeDeletionRequest','admin',['actions.reject'])
]
export const businessChangeSchema = z.object({resource:z.string().min(1).max(100),action:z.string().min(1).max(50),id:id.optional(),data:z.record(z.string(),z.unknown())}).strict()
export function requiresRecordId(operation:AiOperation) { return Boolean(operation.target&&!['standardSamples','reportImage','reportSms','employeeMonthlyScheduleDay','monthlyCustomerRemark'].includes(operation.target)&&!(operation.target==='monthlySettlementRecord'&&operation.action==='update')) }
export function operationFor(resource:string,action:string,audience:AiAudience) {
  const operation=operations.find(o=>o.resource===resource&&o.action===action&&o.audience===audience)
  if(!operation) throw new Error('该菜单操作未开放，请沿用原流程')
  return operation
}
