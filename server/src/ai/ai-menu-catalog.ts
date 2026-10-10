// Public business capability metadata only. No implementation, formulas or credentials.
export type AiAudience = 'frontend' | 'admin'
export interface AiField { key: string; label: string; writable: boolean; guard: string; requires?: string[]; writeAudiences?: AiAudience[] }
export interface AiMenu { group: string; path: string; label: string }
export interface AiMenuEntry {
  key: string; label: string; permissions: string[]; protection?: string
  frontend?: AiMenu; admin?: AiMenu; rootOnly?: boolean
  fields: AiField[]; writeAudiences: AiAudience[]; note?: string
}
export const sampleFields = {
  sequence: '序号', sampleNumber: '样品编号/名称', customerText: '付款客户文字', price: '价格', paymentStatus: '费用状态',
  ironRaw: '铁原始滴定值', siliconRaw: '硅原始值', siliconAdjust: '硅调整数', aluminumRaw: '铝原始值', aluminumAdjust: '铝调整数',
  sulfur: '硫', densityRaw: '比重原始值', whiteness: '白度', calciumRaw: '钙原始值', magnesiumRaw: '镁原始值', carbon: '碳',
  titaniumRaw: '钛原始值', waterSample: '水样重量', bottleWater: '瓶+水', bottleWaterSample: '瓶+水+样', moisture: '水分输入',
  crucible: '坩埚重量', sampleWeight: '样重', burnedCrucibleSample: '烧后坩埚+样', elementNote: '化验元素备注', note: '备注', completed: '检测完成状态'
} as const
export const sampleWritable = Object.keys(sampleFields).filter(k => !['price', 'paymentStatus', 'completed'].includes(k))
export const resultFields = { iron: '铁结果', silicon: '硅结果', aluminum: '铝结果', aluminumSiliconRatio: '铝硅比结果', total: '合量结果', density: '比重结果', calcium: '钙结果', magnesium: '镁结果', titanium: '钛结果', moisture: '水分结果', burnLoss: '灼减结果' }
function fields(source: Record<string, string>, writable: boolean | string[] = false, kind = ''): AiField[] {
  return Object.entries(source).map(([key, label]) => ({ key, label, writable: writable === true || Array.isArray(writable) && writable.includes(key), guard: `${kind}:${key}` }))
}
const actions = (...names: string[]) => fields(Object.fromEntries(names.map(n => [`actions.${n}`, ({ delete: '允许删除（需确认）', approve: '允许审批通过（需确认）', reject: '允许驳回（需确认）', reverse: '允许冲正（需确认）', confirm: '允许确认/锁定（需确认）', reopen: '允许重新打开（需确认）', generate: '允许生成（需确认）', remind: '允许发送提醒（需确认）', cancel: '允许取消（需确认）', markRead: '允许标记已读（需确认）' } as Record<string, string>)[n]])), true, 'operation')
const front = (group: string, path: string, label: string): AiMenu => ({ group, path, label })
const employee = (path: string, label: string) => front('员工考勤', path, label)
const finance = (path: string, label: string) => front('财务', path, label)
const prepaid = (path: string, label: string) => front('预充值客户', path, label)
const medicine = (path: string, label: string) => front('药品库存', path, label)
function entry<K extends string>(key: K, label: string, permission: string, items: AiField[], frontend?: AiMenu, admin?: AiMenu, protection?: string, writeAudiences: AiAudience[] = ['frontend'], note?: string) {
  return { key, label, permissions: permission ? [permission] : [], fields: items, frontend, admin, protection, writeAudiences, note } as AiMenuEntry & { key: K }
}
const af = (path: string, label: string) => front('财务报表', path, label)
const am = medicine('/medicine-inventory', '药品库存')
const ac = front('客户总览', '/customer-overview', '客户总览')
const expense = fields({ paymentDate: '支付日期', item: '支出事项', amount: '金额（元）', paymentMethod: '付款方式', remark: '备注' }, true, 'expense')
const customer = fields({ name: '姓名/名称', phone: '电话', wechat: '微信号', wechatNickname: '微信昵称' }, true, 'customer')
const attendanceMenu = (path: string, label: string) => [employee(path, label), employee(path, label)] as const
export const menuCatalog = [
  entry('samples', '样品输入与检测结果', 'DATA_MAIN', [...fields(Object.fromEntries(Object.entries(sampleFields).map(([k,v]) => [`inputs.${k}`,v])), sampleWritable.map(k=>`inputs.${k}`), 'sample'), ...fields(Object.fromEntries(Object.entries(resultFields).map(([k,v]) => [`results.${k}`,v])), false, 'sample')], front('数据计算', '/data', '数据计算'), front('数据统计', '/data', '数据统计'), undefined, ['frontend'], '只改当天既有样品的原始输入；历史、锁定、完成样品沿用原审批流程。'),
  entry('standardSamples', '标样输入', 'DATA_STANDARD_SAMPLE', fields(Object.fromEntries(['aluminum','silicon','iron'].flatMap(e=>['highStandard','highReading','lowStandard','lowReading',...(e==='aluminum'?['baseValue']:[])].map(k=>[`${e}.${k}`,`${({aluminum:'铝',silicon:'硅',iron:'铁'} as Record<string,string>)[e]}·${({highStandard:'高标标准值',highReading:'高标读数',lowStandard:'低标标准值',lowReading:'低标读数',baseValue:'基准输入'} as Record<string,string>)[k]}`]))), true, 'standard'), front('数据计算','/data/standard-sample','标样计算'), undefined, undefined, ['frontend'], '仅授权标样输入；内部计算公式不开放。'),
  entry('coefficients', '系数计算原始行', 'DATA_COEFFICIENT', fields({code:'样品编号',aluminum:'铝标准值',silicon:'硅标准值',iron:'铁标准值',calcium:'钙标准值',magnesium:'镁标准值',titanium:'钛标准值', 'inputs.ironRaw':'铁原始值','inputs.siliconRaw':'硅原始值','inputs.aluminumRaw':'铝原始值','inputs.calciumRaw':'钙原始值','inputs.magnesiumRaw':'镁原始值','inputs.titaniumRaw':'钛原始值'},true,'coefficientInput'),front('数据计算','/data/coefficient','系数计算'),undefined,undefined,['frontend'],'仅修改既有标准行/测量行的输入；不读取或修改内部系数参数。'),
  entry('reportImage','报告图片模板','LAB_REPORT_IMAGE_TEMPLATE',fields({title:'报告标题',sampleUnit:'来样单位',inspector:'检验员',reviewer:'审核人',address:'地址',phone:'电话',statements:'报告声明'},true,'reportTemplate'),front('化验报告','/lab-report/image-template','化验报告图片模板'),undefined,undefined,['frontend'],'不提供印章图片或文件读取；生成报告仍使用原页面。'),
  entry('reportSms','化验短信模板','LAB_REPORT_SMS_TEMPLATE',fields({prefix:'短信前缀',suffix:'短信后缀'},true,'smsTemplate'),front('化验报告','/lab-report/sms-template','化验短信生成模板')),
  entry('employees','员工档案','ATTENDANCE_EMPLOYEES',fields({employeeNumber:'员工编号',name:'姓名',status:'在职状态',phone:'电话',hireDate:'入职日期',terminationDate:'离职日期',baseSalary:'基本月薪',attendanceBonus:'全勤奖',overtimeHourlyRate:'加班时薪',restQuotaDays:'月休额度'},true,'employee'),...attendanceMenu('/employee-attendance/employees','员工档案'),'EMPLOYEE_ATTENDANCE',['frontend'],'身份证、银行卡、住址、紧急联系人及私密照片不对 AI 开放。'),
  entry('schedules','每日排班','ATTENDANCE_SCHEDULES',fields({employeeId:'员工',date:'日期',isWorkday:'工作日',segments:'排班时间段',remark:'备注'},true,'schedule'),...attendanceMenu('/employee-attendance/schedules','排班考勤概览'),'EMPLOYEE_ATTENDANCE'),
  entry('attendance','考勤记录','ATTENDANCE_RECORDS',fields({employeeId:'员工',date:'日期',actualSegments:'实际打卡时间段',explicitAbsenceMinutes:'明确缺勤分钟',overtimeMinutes:'加班分钟',remark:'备注',workedMinutes:'工作分钟',lateMinutes:'迟到分钟',earlyLeaveMinutes:'早退分钟'},['employeeId','date','actualSegments','explicitAbsenceMinutes','overtimeMinutes','remark'],'attendance'),...attendanceMenu('/employee-attendance/records','考勤记录'),'EMPLOYEE_ATTENDANCE'),
  entry('leaves','请假申请','ATTENDANCE_LEAVE',[...fields({employeeId:'员工',leaveTypeId:'请假类型',startDate:'开始日期',endDate:'结束日期',unit:'请假单位',hours:'小时数',reason:'请假原因',status:'审批状态',reviewRemark:'审批备注'},['employeeId','leaveTypeId','startDate','endDate','unit','hours','reason','reviewRemark'],'leave'),...actions('approve','reject')],...attendanceMenu('/employee-attendance/leave','请假管理'),'EMPLOYEE_ATTENDANCE'),
  entry('leaveTypes','请假类型','ATTENDANCE_LEAVE',fields({name:'类型名称',active:'启用状态',countsTowardRestQuota:'计入月休额度'},true,'leaveType'),...attendanceMenu('/employee-attendance/leave','请假管理'),'EMPLOYEE_ATTENDANCE'),
  entry('commissionTypes','提成类型','ATTENDANCE_COMPENSATION',fields({name:'名称',unitName:'计量单位',unitPrice:'单价',active:'启用状态'},true,'commissionType'),...attendanceMenu('/employee-attendance/compensation','提成与奖金'),'EMPLOYEE_ATTENDANCE'),
  entry('commissions','提成记录','ATTENDANCE_COMPENSATION',fields({employeeId:'员工',commissionTypeId:'提成类型',date:'日期',quantity:'数量',unitPrice:'单价',amount:'提成金额',remark:'备注'},['employeeId','commissionTypeId','date','quantity','unitPrice','remark'],'commission'),...attendanceMenu('/employee-attendance/compensation','提成与奖金'),'EMPLOYEE_ATTENDANCE'),
  entry('bonuses','奖金记录','ATTENDANCE_COMPENSATION',fields({employeeId:'员工',date:'日期',amount:'金额',reason:'原因'},true,'bonus'),...attendanceMenu('/employee-attendance/compensation','提成与奖金'),'EMPLOYEE_ATTENDANCE'),
  entry('payroll','工资统计','ATTENDANCE_PAYROLL',[...fields({month:'月份',status:'工资状态',employeeId:'员工',employeeNumber:'员工编号',employeeName:'姓名',baseSalary:'基本月薪',attendanceBonus:'全勤奖',commissionAmount:'提成金额',bonusAmount:'奖金金额',adjustmentAmount:'调整金额',payableAmount:'应付工资'},false,'payroll'),...actions('generate')],...attendanceMenu('/employee-attendance/payroll','工资统计'),'EMPLOYEE_ATTENDANCE',['frontend'],'生成工资草稿；工资确认/锁定和重新打开仍在原页面，AI 不替代人工结账。'),
  entry('payrollAdjustments','工资调整','ATTENDANCE_PAYROLL',fields({payrollItemId:'工资明细',amount:'调整金额',reason:'调整原因'},true,'payrollAdjustment'),...attendanceMenu('/employee-attendance/payroll','工资统计'),'EMPLOYEE_ATTENDANCE'),
  entry('prepaidRecharges','预存款充值','PREPAID_RECHARGE',[...fields({phone:'客户电话',rechargeDate:'充值日期',paidAmount:'实付金额',giftAmount:'赠送金额',totalAmount:'充值总额',remainingAmount:'本账号充值剩余',isOpeningBalance:'期初余额',remark:'备注',reversedAt:'冲正时间'},['phone','rechargeDate','paidAmount','giftAmount','isOpeningBalance','remark'],'recharge'),...actions('reverse')],prepaid('/prepaid/recharges','预存款充值'),prepaid('/shared-prepaid/recharges','预存款充值'),undefined,['frontend'],'仅本账号充值；冲正/期初余额沿用主账号限制。'),
  entry('prepaidCustomers','预存款客户','PREPAID_CUSTOMERS',fields({phone:'客户电话',remainingAmount:'本账号充值剩余金额'},false,'recharge'),prepaid('/prepaid/customers','预存款客户'),prepaid('/shared-prepaid/customers','预存款客户'),undefined,[],'不提供跨账号共享余额/其他账号充值明细；新增通过充值菜单。'),
  entry('prepaidConsumptions','消费明细','PREPAID_CONSUMPTIONS',fields({phone:'客户电话',sheetDate:'样品日期',sampleNumber:'样品编号',amount:'消费金额',active:'有效状态'},false,'consumption'),prepaid('/prepaid/consumptions','消费明细'),prepaid('/shared-prepaid/consumptions','消费明细'),undefined,[],'消费由样品业务自动记账，不直接改账本。冲正需在原页面核对相关结算。'),
  entry('prepaidSettlements','转账结算','PREPAID_SETTLEMENTS',fields({netAmount:'本人参与结算净额',status:'状态',actualTransferredAt:'实际转账时间',remark:'备注',rejectionReason:'驳回原因'},false,'prepaidSettlement'),prepaid('/prepaid/settlements','转账结算'),prepaid('/shared-prepaid/settlements','转账结算'),undefined,[],'涉及对方账号和转账凭证，保持原页面双方确认流程，不由 AI 发起或确认转账。'),
  entry('expenses','支出账单','FINANCE_EXPENSES',expense,finance('/finance/expenses','支出账单'),af('/finance/expenses','支出账单'),'FINANCE'),
  entry('income','收入账单','FINANCE_INCOME',fields({date:'日期',sampleCount:'样品数量',totalAmount:'收入金额'},false,'income'),finance('/finance/income','收入账单'),af('/finance/income','收入账单'),'FINANCE',[],'收入是原业务派生报表，不能直接写汇总结果。'),
  entry('unsettled','未结款','FINANCE_UNSETTLED',[...fields({date:'日期',sequence:'序号',sampleNumber:'样品编号',customer:'客户',amount:'待结金额',paymentStatus:'费用状态'},['paymentStatus'],'unsettled'),...actions('remind')],finance('/finance/unsettled','未结款'),af('/finance/unsettled','未结款'),'FINANCE',['frontend','admin'],'前台可标记已结款；后台只可发送催款提醒，均须二次确认。'),
  entry('monthly','月结款账单','FINANCE_MONTHLY_SETTLEMENT',[...fields({month:'月份',customer:'客户',sampleCount:'样品数量',amount:'月结总额',settlementStatus:'结款状态',paidAmount:'已结金额',remark:'备注'},['settlementStatus','paidAmount','remark'],'monthly'),...actions('remind')],finance('/finance/monthly-settlement','月结款'),af('/finance/monthly/bills','月结款账单明细'),'FINANCE',['frontend','admin']),
  entry('monthlyDaily','月结款每日明细','FINANCE_MONTHLY_SETTLEMENT',fields({date:'日期',customer:'客户',sampleCount:'样品数量',amount:'金额'},false,'monthly'),undefined,af('/finance/monthly/daily','月结款每日明细'),'FINANCE',[]),
  entry('monthlyCustomers','月结客户信息','',fields({customer:'客户',sampleCount:'样品数量',amount:'金额',remark:'备注'},['remark'],'monthly'),undefined,af('/finance/monthly/customers','月结客户信息收录'),undefined,['admin']),
  entry('reportsSamples','样品检测报表','REPORTS',fields({date:'日期',sampleCount:'样品数量',totalPrice:'金额'},false,'income'),front('报表','/reports','报表'),undefined,'REPORTS',[],'只读统计，不能直接改统计结果。'),
  entry('reportsFinance','财务报表','REPORTS',fields({date:'日期',income:'收入',expense:'支出',profit:'结余'},false,'financeReport'),front('报表','/reports','报表'),undefined,'REPORTS',[]),
  entry('medicine','药品库存','MEDICINE_STOCK',fields({name:'药品名称',unit:'单位',currentQuantity:'库存数量'},false,'medicine'),medicine('/medicine-inventory/stock','药品库存'),am,'MEDICINE_INVENTORY',[],'库存由入库/出库流水自动更新，不直接覆盖库存数。'),
  entry('medicineInbounds','药品入库','MEDICINE_INBOUND',fields({occurredOn:'日期',name:'药品名称',unit:'单位',quantity:'数量',remark:'备注'},true,'movement'),medicine('/medicine-inventory/inbound','药品入库'),am,'MEDICINE_INVENTORY'),
  entry('medicineOutbounds','药品出库','MEDICINE_OUTBOUND',fields({occurredOn:'日期',medicineItemId:'库存药品',name:'药品名称',unit:'单位',quantity:'数量',remark:'备注'},['occurredOn','medicineItemId','quantity','remark'],'movement'),medicine('/medicine-inventory/outbound','药品出库'),am,'MEDICINE_INVENTORY'),
  entry('medicineNames','常用药品名称','MEDICINE_INBOUND',fields({name:'名称'},true,'medicineName'),medicine('/medicine-inventory/inbound','药品入库'),undefined,'MEDICINE_INVENTORY'),
  entry('customers','客户资料','CUSTOMER_OVERVIEW',customer,front('客户总览','/customers-overview','客户总览'),ac,'CUSTOMER_OVERVIEW'),
  entry('customerOverview','客户业务统计','CUSTOMER_OVERVIEW',fields({customer:'客户名称',sampleCount:'样品数',totalAmount:'金额',firstDetectionDate:'首次检测',lastDetectionDate:'末次检测'},false,'customer'),front('客户总览','/customers-overview','客户总览'),ac,'CUSTOMER_OVERVIEW',[]),
  entry('blacklist','本人上传的黑名单','BLACKLIST',fields({phone:'电话',wechat:'微信号',wechatNickname:'微信昵称',amount:'金额',other:'其他信息',note:'备注'},true,'blacklist'),front('黑名单','/blacklist','黑名单'),front('客户黑名单','/blacklist','客户黑名单'),'BLACKLIST',['frontend'],'AI 只读取本账号上传的信息，不读取其他账号上传记录。'),
  entry('abnormal','异常记录','',fields({date:'日期',field:'字段',changeCount:'修改次数',remark:'备注'},['remark'],'abnormal'),undefined,front('异常记录','/abnormal','异常记录'),undefined,['admin']),
  entry('financeDeletionRequests','财务删除申请','FINANCE_EXPENSES',[...fields({sourceType:'来源类型',sourceId:'支出记录',reason:'申请原因',status:'状态',reviewRemark:'审批备注'},['sourceId','reason','reviewRemark'],'expenseRequest'),...actions('reject')],finance('/finance/expenses','支出账单'),front('待办事项','/todos','待办事项'),'FINANCE',['frontend','admin'],'可提交或驳回删除申请；同意删除仍在原页面核对原记录。'),
  entry('sampleChangeRequests','历史样品修改申请','DATA_MAIN',fields({date:'日期',blockIndex:'样品位置',reason:'原因',status:'状态',reviewRemark:'审批备注'},false,'sampleRequest'),front('数据计算','/data','数据计算'),front('待办事项','/todos','待办事项'),undefined,[],'仍在原申请/审批页面核对完整变更，不通过 AI 直接审批历史样品。'),
  entry('accounts','账号基本状态','',fields({account:'账号',username:'名称',disabled:'停用状态',displayRemark:'显示备注'},false,'account'),undefined,front('账号管理','/accounts','账号管理'),undefined,[],'仅所选账号的基本信息；账号权限、密码、邀请、停用/删除不可由 AI 操作。'),
  entry('aiModels','模型公开信息','',fields({name:'模型显示名称',enabled:'启用状态',vision:'图片能力',tools:'业务工具能力'},false,'aiModel'),undefined,front('AI API 配置','/ai-settings','AI API 配置'),undefined,[],'不读取 API 地址、密钥或配置权限，不能让 AI 给自己加权限。')
] as const
export type Resource = typeof menuCatalog[number]['key']
// Preserve the original customer picker permissions without broadening other menus.
menuCatalog.find(c => c.key === 'customers')!.permissions = ['DATA_MAIN','CUSTOMER_OVERVIEW','PREPAID_RECHARGE','PREPAID_CUSTOMERS']
menuCatalog.find(c => c.key === 'accounts')!.rootOnly = true
menuCatalog.find(c => c.key === 'aiModels')!.rootOnly = true
for (const entry of menuCatalog) for (const field of entry.fields) {
  field.writeAudiences = field.writable ? [...entry.writeAudiences] : []
  if (['unsettled','monthly'].includes(entry.key)) field.writeAudiences = field.writable ? [field.key === 'actions.remind' ? 'admin' : 'frontend'] : []
  if (entry.key === 'financeDeletionRequests') field.writeAudiences = field.writable ? [field.key === 'actions.reject' || field.key === 'reviewRemark' ? 'admin' : 'frontend'] : []
  if (entry.key==='samples'&&field.key==='inputs.customerText') field.guard='customer:name'
  if (['income','reportsSamples'].includes(entry.key)&&['totalAmount','totalPrice'].includes(field.key)) field.guard='sample:inputs.price'
  if (['unsettled','monthly','monthlyDaily','monthlyCustomers'].includes(entry.key)) {
    if(field.key==='amount')field.guard='sample:inputs.price'
    if(field.key==='sampleNumber')field.guard='sample:inputs.sampleNumber'
    if(field.key==='customer')field.guard='customer:name'
    if(field.key==='paymentStatus')field.guard='sample:inputs.paymentStatus'
  }
  if(entry.key==='customerOverview') {if(field.key==='customer')field.guard='customer:name';if(field.key==='totalAmount')field.guard='sample:inputs.price'}
  if(['prepaidRecharges','prepaidCustomers','prepaidConsumptions'].includes(entry.key)&&field.key==='phone')field.guard='customer:phone'
  if(['medicineInbounds','medicineOutbounds'].includes(entry.key)&&['name','unit'].includes(field.key))field.guard=`medicine:${field.key}`
  if(entry.key==='payroll'&&['baseSalary','attendanceBonus','employeeNumber'].includes(field.key))field.guard=`employee:${field.key}`
  if(entry.key==='payroll'&&field.key==='employeeName')field.guard='employee:name'
  if(entry.key==='reportsFinance') {if(field.key==='income')field.guard='sample:inputs.price';if(field.key==='expense')field.guard='expense:amount';if(field.key==='profit')field.requires=['sample:inputs.price','expense:amount']}
  if(entry.key==='commissions'&&field.key==='unitPrice')field.guard='commissionType:unitPrice'
  if(entry.key==='commissions'&&field.key==='amount')field.requires=['commissionType:unitPrice','commission:quantity']
  if(entry.key==='payroll'&&field.key==='payableAmount')field.requires=['employee:baseSalary','employee:attendanceBonus','employee:overtimeHourlyRate','commissionType:unitPrice','commission:quantity','bonus:amount','payrollAdjustment:amount']
  if(entry.key==='payroll'&&field.key==='commissionAmount')field.requires=['commissionType:unitPrice','commission:quantity','commission:amount']
  if(entry.key==='payroll'&&field.key==='bonusAmount')field.guard='bonus:amount'
  if(entry.key==='payroll'&&field.key==='adjustmentAmount')field.guard='payrollAdjustment:amount'
  if(['income','reportsSamples'].includes(entry.key)&&['totalAmount','totalPrice'].includes(field.key))field.requires=['recharge:paidAmount']
  if(entry.key==='reportsFinance'&&['income','profit'].includes(field.key))field.requires=[...(field.requires||[]),'recharge:paidAmount']
  if(['prepaidRecharges','prepaidCustomers'].includes(entry.key)&&['totalAmount','remainingAmount'].includes(field.key))field.requires=['recharge:paidAmount','recharge:giftAmount']
  if(entry.key==='medicine'&&field.key==='currentQuantity')field.requires=['movement:quantity']
}
export function fieldIsDenied(field:AiField,denied:Set<string>) {return [field.guard,...(field.requires||[])].some(k=>denied.has(k))}
export const fixedAiBoundaries = [
  { label: '源代码、服务器文件', explanation: '永久禁止读取和写入。模型没有文件、终端、代码仓库或任意 SQL 工具。' },
  { label: '内部计算公式、系数及参数快照', explanation: '永久禁止读取和写入。标样/系数菜单只开放原始业务输入，不开放计算实现和内部参数。' },
  { label: '密码、API 密钥和权限设置', explanation: '永久禁止作为业务内容提供给模型；不能由 AI 授权、改密码或修改 AI 配置。' },
  { label: '其他账号的数据', explanation: '永久禁止越权读取或写入。前台按数据归属隔离，后台必须选择已有授权的账号。' }
]
