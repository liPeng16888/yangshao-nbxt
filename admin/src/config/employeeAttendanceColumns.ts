import type { EmployeeAttendanceAdminPage } from './employeeAttendanceNavigation'

export interface AttendanceColumn {
  key: string
  label: string
  width?: number
}

export const employeeAttendanceColumns: Record<Exclude<EmployeeAttendanceAdminPage, 'overview'>, AttendanceColumn[]> = {
  employees: [
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'employeeNumber', label: '员工编号' },
    { key: 'name', label: '姓名' },
    { key: 'status', label: '状态' },
    { key: 'phone', label: '手机号', width: 140 },
    { key: 'idCardMasked', label: '身份证号', width: 170 },
    { key: 'bankCardMasked', label: '银行卡号', width: 170 },
    { key: 'addressMasked', label: '住址', width: 160 },
    { key: 'hireDate', label: '入职日期' },
    { key: 'baseSalary', label: '基本月薪' },
    { key: 'attendanceBonus', label: '全勤奖' }
  ],
  schedules: [
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'categoryLabel', label: '排班类型' },
    { key: 'employeeLabel', label: '员工', width: 150 },
    { key: 'scheduleDate', label: '日期/月份' },
    { key: 'weekdayLabel', label: '星期' },
    { key: 'isWorkday', label: '工作日' },
    { key: 'plannedStartTime', label: '开始时间' },
    { key: 'plannedEndTime', label: '结束时间' },
    { key: 'scheduledMinutes', label: '排班分钟' },
    { key: 'scheduledWorkDays', label: '应出勤天数' },
    { key: 'restQuotaDays', label: '月休额度' },
    { key: 'remark', label: '备注', width: 180 }
  ],
  records: [
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'date', label: '日期' },
    { key: 'employeeLabel', label: '员工', width: 150 },
    { key: 'checkInText', label: '上班时间' },
    { key: 'checkOutText', label: '下班时间' },
    { key: 'scheduledMinutes', label: '排班分钟' },
    { key: 'workedMinutes', label: '实际工作分钟' },
    { key: 'lateMinutes', label: '迟到分钟' },
    { key: 'earlyLeaveMinutes', label: '早退分钟' },
    { key: 'absenceMinutes', label: '缺勤分钟' },
    { key: 'overtimeMinutes', label: '加班分钟' },
    { key: 'remark', label: '备注', width: 180 }
  ],
  leave: [
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'employeeLabel', label: '员工', width: 150 },
    { key: 'leaveTypeLabel', label: '请假类型' },
    { key: 'startDate', label: '开始日期' },
    { key: 'endDate', label: '结束日期' },
    { key: 'unitLabel', label: '请假单位' },
    { key: 'countedDays', label: '折算天数' },
    { key: 'reason', label: '请假原因', width: 180 },
    { key: 'status', label: '状态' },
    { key: 'reviewRemark', label: '审核备注', width: 180 }
  ],
  compensation: [
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'categoryLabel', label: '类别' },
    { key: 'date', label: '日期' },
    { key: 'employeeLabel', label: '员工', width: 150 },
    { key: 'typeLabel', label: '项目', width: 150 },
    { key: 'quantity', label: '数量' },
    { key: 'unitPrice', label: '单价' },
    { key: 'amount', label: '金额' },
    { key: 'reason', label: '原因/备注', width: 200 }
  ],
  payroll: [
    { key: 'month', label: '月份' },
    { key: 'accountName', label: '前台账号', width: 150 },
    { key: 'employeeLabel', label: '员工', width: 160 },
    { key: 'status', label: '结算状态' },
    { key: 'baseSalary', label: '基本月薪' },
    { key: 'overtimePay', label: '加班费' },
    { key: 'commissionAmount', label: '提成' },
    { key: 'bonusAmount', label: '奖金' },
    { key: 'deductionAmount', label: '扣款' },
    { key: 'payableAmount', label: '应发工资' },
    { key: 'issuesText', label: '阻断信息', width: 220 }
  ]
}
