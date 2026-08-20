import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import type {
  AdminAttendanceAuditRow,
  AdminAttendanceAuditQuery,
  AdminAttendanceRecord,
  AdminAttendanceRevealPayload,
  AdminBonusRecord,
  AdminCommissionRecord,
  AdminAttendanceEmployee,
  AdminAttendanceEmployeeResponse,
  AdminAttendanceOverview,
  AdminAttendancePayrollRun,
  AdminAttendanceSchedules,
  AdminScheduleAttendanceOverview,
  AdminAttendanceCalendarDay,
  AdminDataLabSheet,
  AdminCustomerOverviewRow,
  AdminFrontendAccount,
  AdminEmployeeAttendanceQuery,
  AdminLeaveRequest,
  AdminMedicineInventoryItem,
  AdminMedicineInventoryMovement,
  AdminRevealedAttendanceEmployee,
  AdminRevealedAttendanceEmployeeResponse,
  AdminSampleRetestInput,
  AdminSampleRetestParameterSnapshot,
  AdminSampleRetestResult,
  AdminUser,
  FrontendOption
} from './types'

export const ADMIN_TOKEN_KEY = 'ys_admin_token'
export const ADMIN_USER_KEY = 'ys_admin_user'
export const useAdminMocks = import.meta.env.VITE_ADMIN_USE_MOCKS === 'true' || (import.meta.env.DEV && import.meta.env.VITE_ADMIN_USE_MOCKS !== 'false')

export type AdminProfilePayload = {
  account: string
  username: string
  currentPassword?: string
  newPassword?: string
  confirmPassword?: string
}

type AdminRequest = {
  get<T = any, R = any>(url: string, config?: AdminRequestConfig): Promise<R>
  post<T = any, R = any>(url: string, payload?: T, config?: AdminRequestConfig): Promise<R>
  put<T = any, R = any>(url: string, payload?: T, config?: AdminRequestConfig): Promise<R>
  patch<T = any, R = any>(url: string, payload?: T, config?: AdminRequestConfig): Promise<R>
  delete<T = any, R = any>(url: string, config?: AdminRequestConfig): Promise<R>
}

type AdminRequestConfig = AxiosRequestConfig & { preserveAdminSessionOnUnauthorized?: boolean }

const realRequest = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_BASE_URL || '/api',
  timeout: 15000
})

realRequest.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

realRequest.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error?.response?.data
    const rawMessage = data?.message
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : typeof rawMessage?.message === 'string'
          ? rawMessage.message
          : typeof data?.error === 'string'
            ? data.error
            : error?.message || '请求失败'
    const preserveSession = Boolean((error?.config as AdminRequestConfig | undefined)?.preserveAdminSessionOnUnauthorized)
    if (error?.response?.status === 401 && !preserveSession) {
      localStorage.removeItem(ADMIN_TOKEN_KEY)
      localStorage.removeItem(ADMIN_USER_KEY)
      window.location.href = `${import.meta.env.BASE_URL}login`
    } else {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  }
)

const mockUser: AdminUser = {
  id: 'root-admin',
  account: 'admin',
  username: '主账号',
  role: 'ROOT_ADMIN'
}

const mockFrontendOptions: FrontendOption[] = [
  { id: 'front-1', account: 'kaili001', name: '凯里化验室', disabled: false },
  { id: 'front-2', account: 'yangshao002', name: '仰韶客户二', disabled: false }
]

const mockRows = {
  customerOverview: [
    {
      frontendUserId: 'front-1',
      frontendUserName: '凯里化验室',
      customerKey: 'ids:customer-zhang-san',
      customer: '张三',
      customerDisplay: '张三 13800000001 zhangsan-wx 张总',
      sampleCount: 3,
      totalAmount: 240,
      firstDetectionDate: '2026-06-20',
      lastDetectionDate: '2026-06-25'
    }
  ],
  medicineInventoryItems: [
    {
      id: 'medicine-item-1',
      frontendUserId: 'front-1',
      name: '盐酸',
      unit: 'BOTTLE',
      unitLabel: '瓶',
      currentQuantity: 12,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T08:00:00.000Z'
    },
    {
      id: 'medicine-item-2',
      frontendUserId: 'front-2',
      name: '酒精',
      unit: 'LITER',
      unitLabel: '升',
      currentQuantity: 2.5,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T09:00:00.000Z'
    }
  ],
  medicineInventoryMovements: [
    {
      id: 'medicine-movement-1',
      frontendUserId: 'front-1',
      medicineItemId: 'medicine-item-1',
      type: 'INBOUND',
      occurredOn: '2026-08-02',
      quantity: 12,
      nameSnapshot: '盐酸',
      unitSnapshot: 'BOTTLE',
      unitLabel: '瓶',
      remark: '首次入库',
      correctionOfId: null,
      createdAt: '2026-08-02T08:00:00.000Z'
    },
    {
      id: 'medicine-movement-2',
      frontendUserId: 'front-2',
      medicineItemId: 'medicine-item-2',
      type: 'OUTBOUND',
      occurredOn: '2026-08-02',
      quantity: 0.5,
      nameSnapshot: '酒精',
      unitSnapshot: 'LITER',
      unitLabel: '升',
      remark: '日常使用',
      correctionOfId: null,
      createdAt: '2026-08-02T09:00:00.000Z'
    }
  ],
  frontendUsers: [
    {
      id: 'front-1',
      account: 'kaili001',
      username: '凯里化验室',
      displayRemark: '',
      displayName: '凯里化验室',
      password: '123456',
      accessGroups: [
        { id: 'group-1', name: '经营数据', enabled: true, password: '2580', ttlMinutes: 5, recoveryPrompt: '管理员提示', recoveryAnswer: '凯里', features: ['FINANCE', 'REPORTS'] },
        { id: 'group-2', name: '样品历史', enabled: true, password: '9527', ttlMinutes: 10, recoveryPrompt: '城市', recoveryAnswer: '凯里', features: ['HISTORICAL_DATES', 'COMPLETED_SAMPLE_DATA'] }
      ],
      frontendSubAccounts: [{
        id: 'frontend-sub-1', account: 'operator01', username: '操作员', disabled: false,
        requiresAccessGuardPassword: true, permissions: ['DATA_MAIN', 'REPORTS'],
        createdAt: '2026-08-11T09:00:00.000Z', lastLoginAt: null
      }],
      disabled: false,
      createdAt: '2026-06-25 09:00:00'
    },
    {
      id: 'front-2',
      account: 'yangshao002',
      username: '仰韶客户二',
      displayRemark: '',
      displayName: '仰韶客户二',
      password: '123456',
      accessGroups: [],
      frontendSubAccounts: [],
      disabled: false,
      createdAt: '2026-06-25 10:00:00'
    }
  ],
  subAdmins: [
    { id: 'sub-1', account: 'sub001', username: '子账号一', password: 'sub123456', permissions: [mockFrontendOptions[0]] }
  ],
  blacklist: [
    { id: 'b-1', uploadedAt: '2026-06-25 12:00:00', uploadedBy: '凯里化验室', phone: '13800000000', wechat: 'wx-demo', wechatNickname: '黑名单客户', amount: 800, images: [], other: '多次拖欠', note: '示例数据' }
  ],
  abnormal: [
    { id: 'a-1', date: '2026-06-25', frontendUserId: 'front-1', name: '凯里化验室', sheetId: 'sheet-1', blockId: 'block-1', sequence: '001', field: 'ironRaw', changeCount: 3, remark: '铁数据多次修改', updatedAt: '2026-06-25 14:20:00' }
  ],
  unsettled: [
    { date: '2026-06-25', sheetId: 'sheet-1', blockId: 'block-1', frontendUserId: 'front-1', name: '凯里化验室', sequence: '001', sampleNumber: '6.25桂AA802', customer: '张三', amount: 80 }
  ],
  monthlyDaily: [
    { id: 'm-d-1', date: '2026-06-25', frontendUserId: 'front-1', name: '凯里化验室', customer: '李四', sampleCount: 2, amount: 160 }
  ],
  monthlyCustomers: [
    { frontendUserId: 'front-1', name: '凯里化验室', customer: '李四', firstDate: '2026-06-01', lastDate: '2026-06-25', amount: 1280, sampleCount: 16, remark: '示例月结客户' }
  ],
  deletionRequests: [
    {
      id: 'delete-1',
      frontendUserId: 'front-1',
      name: '凯里化验室',
      sourceType: 'EXPENSE',
      sourceLabel: '支出账单',
      sourceId: 'e-1',
      sourceSnapshot: { paymentDate: '2026-06-25', item: '试剂耗材采购', amount: 368, paymentMethod: 'online', remark: '铁硅铝日常检测耗材' },
      sourceSummary: '2026-06-25 试剂耗材采购 ¥368.00',
      reason: '录入重复，需要删除',
      status: 'PENDING',
      statusLabel: '待审核',
      reviewRemark: '',
      createdAt: '2026-06-25 12:00:00',
      updatedAt: '2026-06-25 12:00:00'
    }
  ]
}

const mockPrepaidAccountA = {
  id: 'front-1', account: 'kaili001', username: '凯里化验室', displayRemark: ''
}
const mockPrepaidAccountB = {
  id: 'front-2', account: 'yangshao002', username: '仰韶客户二', displayRemark: ''
}
const mockSharedPrepaid = {
  recharges: [
    {
      id: 'recharge-1', memberId: 'member-1', phone: '13800000001', ownerFrontendUserId: 'front-1',
      ownerAccount: 'kaili001', ownerUsername: '凯里化验室', actorUserId: 'front-1',
      actorAccount: 'kaili001', actorUsername: '凯里化验室', rechargeDate: '2026-08-01',
      paidAmount: 1000, giftAmount: 100, totalAmount: 1100, remainingAmount: 900,
      isOpeningBalance: false, remark: '现金充值', reversedAt: null, reversedByLedgerId: null,
      createdAt: '2026-08-01T01:00:00.000Z', updatedAt: '2026-08-01T01:00:00.000Z'
    },
    {
      id: 'recharge-2', memberId: 'member-2', phone: '13800000002', ownerFrontendUserId: 'front-2',
      ownerAccount: 'yangshao002', ownerUsername: '仰韶客户二', actorUserId: 'front-2',
      actorAccount: 'yangshao002', actorUsername: '仰韶客户二', rechargeDate: '2026-08-02',
      paidAmount: 500, giftAmount: 50, totalAmount: 550, remainingAmount: 0,
      isOpeningBalance: true, remark: '期初导入', reversedAt: '2026-08-03T02:00:00.000Z',
      reversedByLedgerId: 'ledger-reversal-2', createdAt: '2026-08-02T01:00:00.000Z',
      updatedAt: '2026-08-03T02:00:00.000Z', reversal: {
        id: 'ledger-reversal-2', reason: '重复导入', actorUserId: 'front-2', actorUser: mockPrepaidAccountB,
        createdAt: '2026-08-03T02:00:00.000Z'
      }
    },
    {
      id: 'recharge-mixed-b', memberId: 'member-1', phone: '13800000001', ownerFrontendUserId: 'front-2',
      ownerAccount: 'yangshao002', ownerUsername: '仰韶客户二', actorUserId: 'front-2',
      actorAccount: 'yangshao002', actorUsername: '仰韶客户二', rechargeDate: '2026-08-01',
      paidAmount: 90, giftAmount: 0, totalAmount: 90, remainingAmount: 0,
      isOpeningBalance: false, remark: '混合来源', reversedAt: null, reversedByLedgerId: null,
      createdAt: '2026-08-01T01:30:00.000Z', updatedAt: '2026-08-01T01:30:00.000Z'
    }
  ],
  members: [
    {
      id: 'member-1', phone: '13800000001',
      ledgerEntries: [{ id: 'ledger-1', kind: 'RECHARGE', balanceDelta: 1100, ownerFrontendUserId: 'front-1' }],
    },
    {
      id: 'member-2', phone: '13800000002',
      ledgerEntries: [{ id: 'ledger-reversal-2', kind: 'RECHARGE_REVERSAL', balanceDelta: -550, ownerFrontendUserId: 'front-2' }]
    },
    {
      id: 'member-consumer-only', phone: '13800000003', ledgerEntries: []
    },
    {
      id: 'member-settlement-only', phone: '13800000004', ledgerEntries: []
    }
  ],
  consumptions: [
    {
      id: 'consumption-1', memberId: 'member-1', phoneSnapshot: '13800000001',
      sampleNumberSnapshot: 'YS-001', sampleCountSnapshot: 2, elementsSnapshot: ['金', '银'], amount: 100,
      kind: 'CONSUMPTION', active: true, reversalOfId: null, consumingFrontendUserId: 'front-2',
      consumingFrontendUser: mockPrepaidAccountB, actorUser: mockPrepaidAccountB,
      allocations: [
        { id: 'allocation-1', sourceOwnerId: 'front-1', sourceOwner: mockPrepaidAccountA, allocatedAmount: 10, recharge: { id: 'recharge-1', rechargeDate: '2026-08-01' } },
        { id: 'allocation-2', sourceOwnerId: 'front-2', sourceOwner: mockPrepaidAccountB, allocatedAmount: 90, recharge: { id: 'recharge-mixed-b', rechargeDate: '2026-08-01' } }
      ],
      payables: [{ id: 'payable-1', status: 'PENDING', amount: 181.82, sourceOwner: mockPrepaidAccountA, consumerOwner: mockPrepaidAccountB }],
      originalPayables: [], sheetDate: '2026-08-04', createdAt: '2026-08-04T01:00:00.000Z'
    },
    {
      id: 'consumption-consumer-only', memberId: 'member-consumer-only', phoneSnapshot: '13800000003',
      sampleNumberSnapshot: 'YS-002', sampleCountSnapshot: 1, elementsSnapshot: ['金'], amount: 30,
      kind: 'CONSUMPTION', active: true, reversalOfId: null, consumingFrontendUserId: 'front-1',
      consumingFrontendUser: mockPrepaidAccountA, actorUser: mockPrepaidAccountA, allocations: [], payables: [],
      originalPayables: [], sheetDate: '2026-08-06', createdAt: '2026-08-06T01:00:00.000Z'
    },
    {
      id: 'consumption-settlement-only', memberId: 'member-settlement-only', phoneSnapshot: '13800000004',
      sampleNumberSnapshot: 'YS-003', sampleCountSnapshot: 1, elementsSnapshot: ['银'], amount: 20,
      kind: 'CONSUMPTION', active: true, reversalOfId: null, consumingFrontendUserId: 'front-2',
      consumingFrontendUser: mockPrepaidAccountB, actorUser: mockPrepaidAccountB, allocations: [],
      payables: [{ id: 'payable-settlement-only', status: 'HELD', amount: 20, sourceOwner: mockPrepaidAccountB, consumerOwner: mockPrepaidAccountB }],
      originalPayables: [], sheetDate: '2026-08-07', createdAt: '2026-08-07T01:00:00.000Z'
    },
    {
      id: 'consumption-reversal-1', memberId: 'member-1', phoneSnapshot: '13800000001',
      sampleNumberSnapshot: 'YS-001', sampleCountSnapshot: 2, elementsSnapshot: ['金', '银'], amount: -100,
      kind: 'REVERSAL', active: false, reversalOfId: 'consumption-1', consumingFrontendUserId: 'front-2',
      consumingFrontendUser: mockPrepaidAccountB, actorUser: mockPrepaidAccountB, allocations: [], payables: [],
      originalPayables: [], sheetDate: '2026-08-08', createdAt: '2026-08-08T01:00:00.000Z'
    }
  ],
  settlements: [
    {
      id: 'settlement-1', accountAId: 'front-1', accountBId: 'front-2', accountA: mockPrepaidAccountA,
      accountB: mockPrepaidAccountB, aToBAmount: 181.82, bToAAmount: 40, netAmount: 141.82,
      grossAmount: 221.82, status: 'AWAITING_RECEIPT', payerFrontendUserId: 'front-1',
      receiverFrontendUserId: 'front-2', proofUrls: ['/uploads/prepaid-proof-demo.jpg'],
      rejectionReason: null, createdByUser: mockPrepaidAccountA, paidByUser: mockPrepaidAccountA,
      confirmedByUser: null, rejectedByUser: null, createdAt: '2026-08-05T01:00:00.000Z',
      updatedAt: '2026-08-05T02:00:00.000Z', lines: [{ id: 'line-1', payableId: 'payable-1', amount: 181.82 }],
      actions: [{ id: 'action-1', operation: 'SUBMIT_PAYMENT', reason: null, actorUser: mockPrepaidAccountA, createdAt: '2026-08-05T02:00:00.000Z' }]
    },
    {
      id: 'settlement-member-only', accountAId: 'front-1', accountBId: 'front-2', accountA: mockPrepaidAccountA,
      accountB: mockPrepaidAccountB, aToBAmount: 20, bToAAmount: 0, netAmount: 20, grossAmount: 20,
      status: 'AWAITING_PAYMENT', payerFrontendUserId: 'front-1', receiverFrontendUserId: 'front-2', proofUrls: [],
      rejectionReason: null, createdByUser: mockPrepaidAccountA, paidByUser: null, confirmedByUser: null,
      rejectedByUser: null, createdAt: '2026-08-07T02:00:00.000Z', updatedAt: '2026-08-07T02:00:00.000Z',
      lines: [{ id: 'line-member-only', payableId: 'payable-settlement-only', amount: 20 }], actions: []
    }
  ]
}

const mockEmployeeAttendance = {
  employees: [
    {
      id: 'emp-1', frontendUserId: 'front-1', employeeNumber: 'YG001', name: '张三', status: 'ACTIVE', phone: '13800000001',
      idCard: '410***********1234', bankCard: '622*********7890', address: '洛阳市***', emergencyContact: '张父***',
      hireDate: '2026-01-01', terminationDate: null, baseSalary: 6000, attendanceBonus: 300, overtimeHourlyRate: 30,
      restQuotaDays: 4, hasPhoto: true, frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' }
    },
    {
      id: 'emp-2', frontendUserId: 'front-1', employeeNumber: 'YG002', name: '李四', status: 'ACTIVE', phone: '13800000002',
      idCard: '410***********2345', bankCard: '622*********8901', address: '三门峡市***', emergencyContact: '李母***',
      hireDate: '2026-02-01', terminationDate: null, baseSalary: 5500, attendanceBonus: 300, overtimeHourlyRate: 28,
      restQuotaDays: 4, hasPhoto: false, frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' }
    },
    {
      id: 'emp-3', frontendUserId: 'front-2', employeeNumber: 'YG001', name: '王五', status: 'INACTIVE', phone: '13800000003',
      idCard: '410***********3456', bankCard: '622*********9012', address: '郑州市***', emergencyContact: '王父***',
      hireDate: '2026-03-01', terminationDate: null, baseSalary: 5200, attendanceBonus: 200, overtimeHourlyRate: 26,
      restQuotaDays: 4, hasPhoto: false, frontendUser: { account: 'yangshao002', username: '仰韶客户二', displayRemark: '' }
    }
  ],
  sensitive: {
    'emp-1': { idCard: '410000199001011234', bankCard: '6222021234567890', address: '洛阳市涧西区', emergencyContact: '张父 13800001001' },
    'emp-2': { idCard: '410000199202022345', bankCard: '6222022345678901', address: '三门峡市湖滨区', emergencyContact: '李母 13800001002' },
    'emp-3': { idCard: '410000199303033456', bankCard: '6222023456789012', address: '郑州市金水区', emergencyContact: '王父 13800001003' }
  } as Record<string, { idCard: string; bankCard: string; address: string; emergencyContact: string }>,
  schedules: {
    days: [
      {
        id: 'schedule-day-1', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-08', isWorkday: true,
        scheduledMinutes: 600, breakMinutes: 0, remark: '常规班', segments: [{ sequence: 0, startTime: '08:00', endTime: '18:00' }],
        employee: { employeeNumber: 'YG001', name: '张三' }, frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' }
      },
      ...['2026-08-04', '2026-08-06', '2026-08-07', '2026-08-09', '2026-08-20'].map((date, index) => ({
        id: `schedule-parity-${index}`, frontendUserId: 'front-1', employeeId: 'emp-1', date, isWorkday: true,
        scheduledMinutes: 600, breakMinutes: 0, remark: '', segments: [{ sequence: 0, startTime: '08:00', endTime: '18:00' }],
        employee: { employeeNumber: 'YG001', name: '张三' }, frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' }
      })),
      {
        id: 'schedule-day-2', frontendUserId: 'front-1', employeeId: 'emp-2', date: '2026-08-09', isWorkday: false,
        scheduledMinutes: 0, breakMinutes: 0, remark: '休息', segments: [],
        employee: { employeeNumber: 'YG002', name: '李四' }, frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' }
      },
      {
        id: 'schedule-day-3', frontendUserId: 'front-2', employeeId: 'emp-3', date: '2026-08-08', isWorkday: true,
        scheduledMinutes: 480, breakMinutes: 0, remark: '', segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }],
        employee: { employeeNumber: 'YG001', name: '王五' }, frontendUser: { account: 'yangshao002', username: '仰韶客户二', displayRemark: '' }
      }
    ]
  },
  attendance: [
    {
      id: 'attendance-1', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-08', scheduledMinutes: 600, workedMinutes: 600, lateMinutes: 0, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 0, absenceMinutes: 0, overtimeMinutes: 30, remark: '', employee: { employeeNumber: 'YG001', name: '张三' },
      actualSegments: [{ sequence: 0, checkInAt: '2026-08-08T08:00:00+08:00', checkOutAt: '2026-08-08T18:00:00+08:00' }]
    },
    { id: 'attendance-short', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-06', scheduledMinutes: 600, workedMinutes: 540, lateMinutes: 0, earlyLeaveMinutes: 60, explicitAbsenceMinutes: 0, absenceMinutes: 60, overtimeMinutes: 0, remark: '', employee: { employeeNumber: 'YG001', name: '张三' }, actualSegments: [{ sequence: 0, checkInAt: '2026-08-06T08:00:00+08:00', checkOutAt: '2026-08-06T17:00:00+08:00' }] },
    { id: 'attendance-absent', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-09', scheduledMinutes: 600, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 600, absenceMinutes: 600, overtimeMinutes: 0, remark: '无故未到', employee: { employeeNumber: 'YG001', name: '张三' }, actualSegments: [] },
    { id: 'attendance-2', frontendUserId: 'front-2', employeeId: 'emp-3', date: '2026-08-08', scheduledMinutes: 480, workedMinutes: 470, lateMinutes: 10, earlyLeaveMinutes: 0, explicitAbsenceMinutes: 0, absenceMinutes: 0, overtimeMinutes: 0, remark: '', employee: { employeeNumber: 'YG001', name: '王五' } }
  ],
  leaves: [
    { id: 'leave-1', frontendUserId: 'front-1', employeeId: 'emp-2', leaveTypeId: 'leave-type-1', startDate: '2026-08-08', endDate: '2026-08-08', unit: 'HALF_DAY', countedDays: 0.5, reason: '个人事务', status: 'PENDING', reviewRemark: '', employee: { employeeNumber: 'YG002', name: '李四' }, leaveType: { id: 'leave-type-1', name: '事假' } },
    { id: 'leave-parity', frontendUserId: 'front-1', employeeId: 'emp-1', leaveTypeId: 'leave-type-1', startDate: '2026-08-07', endDate: '2026-08-07', unit: 'HOUR', countedDays: 0.4, reason: '照顾家人', status: 'APPROVED', reviewRemark: '', employee: { employeeNumber: 'YG001', name: '张三' }, leaveType: { id: 'leave-type-1', name: '事假' } }
  ],
  commissions: [
    { id: 'commission-1', frontendUserId: 'front-1', employeeId: 'emp-1', commissionTypeId: 'commission-type-1', date: '2026-08-08', quantity: 8, unitPriceSnapshot: 12, amount: 96, remark: '当日送样', employee: { employeeNumber: 'YG001', name: '张三' }, commissionType: { id: 'commission-type-1', name: '送样提成' } }
  ],
  bonuses: [
    { id: 'bonus-1', frontendUserId: 'front-1', employeeId: 'emp-1', date: '2026-08-08', amount: 200, reason: '月度安全奖', employee: { employeeNumber: 'YG001', name: '张三' } }
  ],
  payroll: [
    {
      id: 'payroll-1', frontendUserId: 'front-1', month: '2026-08', status: 'DRAFT',
      frontendUser: { account: 'kaili001', username: '凯里化验室', displayRemark: '' },
      items: [{ id: 'payroll-item-1', employeeId: 'emp-1', employeeNumberSnapshot: 'YG001', employeeNameSnapshot: '张三', payableAmount: 6596, issues: [], calculationSnapshot: { input: { baseSalary: 6000 }, result: { overtimePay: 0, commissionAmount: 96, bonusAmount: 200, leaveDeduction: 0, absenceDeduction: 0, payableAmount: 6596 } }, adjustments: [] }]
    }
  ],
  audit: [] as AdminAttendanceAuditRow[]
}

function mockAdminUser() {
  return currentAdminUser() || mockUser
}

function mockAuthorizedFrontendIds() {
  const admin = mockAdminUser()
  if (admin.role === 'ROOT_ADMIN') return mockRows.frontendUsers.map((row) => row.id)
  const sub = mockRows.subAdmins.find((row) => row.id === admin.id || row.account === admin.account)
  return (sub?.permissions || []).map((item) => item.id)
}

function mockAttendanceIds(config?: AdminRequestConfig) {
  const permitted = mockAuthorizedFrontendIds()
  const requested = String(config?.params?.frontendUserIds || '').split(',').filter(Boolean)
  if (requested.length && mockAdminUser().role === 'SUB_ADMIN' && requested.some((id) => !permitted.includes(id))) {
    throw new Error('没有访问部分前端账号的权限')
  }
  return requested.length ? requested : permitted
}

function assertExclusiveAttendanceDateFilter(config?: AdminRequestConfig) {
  if (config?.params?.month && (config.params.startDate || config.params.endDate)) throw new Error('月份和日期范围不能同时筛选')
}

function mockMonthlyScheduleFilter(config?: AdminRequestConfig) {
  const ids = mockAttendanceIds(config)
  const employeeId = String(config?.params?.employeeId || '')
  const month = String(config?.params?.month || '')
  const startDate = String(config?.params?.startDate || '')
  const endDate = String(config?.params?.endDate || '')
  return mockEmployeeAttendance.schedules.days.filter((row) => ids.includes(row.frontendUserId)
    && (!employeeId || row.employeeId === employeeId)
    && (month ? row.date.startsWith(month) : (!startDate || row.date >= startDate) && (!endDate || row.date <= endDate)))
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date) || left.employeeId.localeCompare(right.employeeId) || left.id.localeCompare(right.id))
}

function mockAdminScheduleAttendanceOverview(config?: AdminRequestConfig): AdminScheduleAttendanceOverview {
  const ids = mockAttendanceIds(config)
  const employeeId = String(config?.params?.employeeId || '')
  const month = String(config?.params?.month || '')
  const employee = employeeId ? mockEmployeeAttendance.employees.find((row) => row.id === employeeId && ids.includes(row.frontendUserId)) : undefined
  if (employeeId && !employee) throw new Error('员工不存在或无权查看')
  const monthRows = mockEmployeeAttendance.attendance.filter((row) => ids.includes(row.frontendUserId) && row.date.startsWith(month))
  const pendingLeaves = mockEmployeeAttendance.leaves.filter((row) => ids.includes(row.frontendUserId) && row.status === 'PENDING' && row.startDate <= `${month}-31` && row.endDate >= `${month}-01`).length
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const activeIds = new Set(mockEmployeeAttendance.employees.filter((row) => ids.includes(row.frontendUserId) && row.status === 'ACTIVE' && row.hireDate <= today && (!row.terminationDate || String(row.terminationDate) >= today)).map((row) => row.id))
  const todayClassifications = mockEmployeeAttendance.schedules.days
    .filter((row) => ids.includes(row.frontendUserId) && activeIds.has(row.employeeId) && row.date === today && row.isWorkday && row.scheduledMinutes > 0)
    .map((schedule) => {
      const leaveMinutes = mockEmployeeAttendance.leaves.filter((row) => row.employeeId === schedule.employeeId && row.status === 'APPROVED' && row.startDate <= today && row.endDate >= today)
        .reduce((sum, leave) => sum + (leave.unit === 'FULL_DAY' ? schedule.scheduledMinutes : leave.unit === 'HALF_DAY' ? Math.round(schedule.scheduledMinutes / 2) : Math.round(schedule.scheduledMinutes * Number(leave.countedDays || 0))), 0)
      if (leaveMinutes > 0) return 'LEAVE'
      const record = mockEmployeeAttendance.attendance.find((row) => row.employeeId === schedule.employeeId && row.date === today)
      return record && !(record.actualSegments || []).length && Number(record.absenceMinutes || 0) >= schedule.scheduledMinutes ? 'ABSENT' : 'PRESENT'
    })
  const payrollRows = mockEmployeeAttendance.payroll.filter((row) => ids.includes(row.frontendUserId) && row.month === month)
  const projectedPayroll = payrollRows.length
    ? payrollRows.reduce((sum, row) => sum + row.items.reduce((itemSum, item) => itemSum + Number(item.payableAmount || 0), 0), 0)
    : mockEmployeeAttendance.employees.filter((row) => ids.includes(row.frontendUserId) && row.status === 'ACTIVE').reduce((sum, row) => sum + Number(row.baseSalary) + Number(row.attendanceBonus), 0)
  const overview = {
    month,
    activeEmployees: mockEmployeeAttendance.employees.filter((row) => ids.includes(row.frontendUserId) && row.status === 'ACTIVE').length,
    todayPresent: todayClassifications.filter((value) => value === 'PRESENT').length,
    todayOnLeave: todayClassifications.filter((value) => value === 'LEAVE').length,
    todayAbsent: todayClassifications.filter((value) => value === 'ABSENT').length,
    overtimeHours: Number((monthRows.reduce((sum, row) => sum + Number(row.overtimeMinutes || 0), 0) / 60).toFixed(2)),
    pendingLeaves, projectedPayroll, issueCount: pendingLeaves, issues: pendingLeaves ? [`${pendingLeaves} 条请假待审批`] : []
  }
  if (!employee) return { month, employee: null, days: [], overview, readonly: true }
  const dayCount = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  const days: AdminAttendanceCalendarDay[] = Array.from({ length: dayCount }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, '0')}`
    const sourceSchedule = mockEmployeeAttendance.schedules.days.find((row) => row.employeeId === employee.id && row.date === date)
    const schedule = sourceSchedule ? {
      id: sourceSchedule.id, employeeId: sourceSchedule.employeeId, date: sourceSchedule.date, isWorkday: sourceSchedule.isWorkday,
      scheduledMinutes: sourceSchedule.scheduledMinutes, breakMinutes: sourceSchedule.breakMinutes, segments: sourceSchedule.segments, remark: sourceSchedule.remark || ''
    } : null
    const record = mockEmployeeAttendance.attendance.find((row) => row.employeeId === employee.id && row.date === date)
    const leaves = mockEmployeeAttendance.leaves.filter((row) => row.employeeId === employee.id && row.status === 'APPROVED' && row.startDate <= date && row.endDate >= date)
    const scheduledMinutes = schedule?.isWorkday ? schedule.scheduledMinutes : 0
    const approvedLeaveMinutes = Math.min(scheduledMinutes, leaves.reduce((sum, leave) => sum + (leave.unit === 'FULL_DAY' ? scheduledMinutes : leave.unit === 'HALF_DAY' ? Math.round(scheduledMinutes / 2) : Math.round(scheduledMinutes * Number(leave.countedDays || 0))), 0))
    const isFuture = date > today
    const workedMinutes = record ? Math.min(scheduledMinutes, Number(record.workedMinutes || 0)) : Math.max(0, scheduledMinutes - approvedLeaveMinutes)
    const overtimeMinutes = Number(record?.overtimeMinutes || 0)
    const shortageMinutes = Math.max(0, scheduledMinutes - Math.min(scheduledMinutes, workedMinutes + approvedLeaveMinutes))
    const fullAbsence = Boolean(record && !(record.actualSegments || []).length && Number(record.absenceMinutes || 0) >= scheduledMinutes && scheduledMinutes > 0 && !approvedLeaveMinutes)
    const status = isFuture ? 'FUTURE' : !schedule?.isWorkday ? 'REST' : fullAbsence ? 'ABSENT' : approvedLeaveMinutes ? 'LEAVE' : shortageMinutes ? 'SHORT' : overtimeMinutes ? 'OVERTIME' : 'NORMAL'
    const credited = Math.min(scheduledMinutes, workedMinutes + approvedLeaveMinutes)
    const displayMinutes = isFuture ? scheduledMinutes : status === 'REST' ? 0 : credited + overtimeMinutes
    const hours = (minutes: number) => { const value = minutes / 60; return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '') }
    const parts = isFuture || status === 'REST' ? [] : [workedMinutes ? `工作${hours(workedMinutes)}` : '', approvedLeaveMinutes ? `请假${hours(approvedLeaveMinutes)}` : '', overtimeMinutes ? `加班${hours(overtimeMinutes)}` : ''].filter(Boolean)
    return {
      date, day: index + 1, isFuture, status, schedule, actualSegments: record?.actualSegments || [],
      scheduledMinutes: isFuture ? scheduledMinutes : status === 'REST' ? 0 : scheduledMinutes,
      workedMinutes: isFuture || status === 'REST' ? 0 : workedMinutes, approvedLeaveMinutes: isFuture || status === 'REST' ? 0 : approvedLeaveMinutes,
      overtimeMinutes: isFuture || status === 'REST' ? 0 : overtimeMinutes, displayMinutes,
      shortageMinutes: isFuture || status === 'REST' ? 0 : shortageMinutes,
      durationText: status === 'REST' ? '公司排休' : `${hours(displayMinutes)} 小时${parts.length ? `（${parts.join('＋')}）` : ''}`,
      leaveTypeName: leaves[0]?.leaveType?.name || '', leaveReason: leaves[0]?.reason || '',
      absenceReason: status === 'ABSENT' ? record?.remark || '未填写原因' : '',
      backgroundTone: status === 'FUTURE' ? 'future' : status === 'REST' ? 'rest' : status === 'LEAVE' ? 'leave' : status === 'ABSENT' ? 'absent' : 'normal',
      durationTone: shortageMinutes && status !== 'ABSENT' ? 'short' : status === 'OVERTIME' ? 'overtime' : status === 'ABSENT' ? 'absent' : status === 'LEAVE' ? 'leave' : status === 'REST' ? 'rest' : status === 'FUTURE' ? 'future' : 'normal'
    }
  })
  return { month, employee: { id: employee.id, employeeNumber: employee.employeeNumber, name: employee.name }, days, overview, readonly: true }
}

function isEmployeeAttendanceAdminPath(url: string) {
  return url === '/admin/employee-attendance' || url.startsWith('/admin/employee-attendance/')
}

function isSharedPrepaidAdminPath(url: string) {
  return url === '/admin/shared-prepaid' || url.startsWith('/admin/shared-prepaid/')
}

function isAdminRetestWritePath(url: string) {
  let pathname: string
  try {
    pathname = new URL(url, 'http://admin.local').pathname
  } catch {
    pathname = url.split(/[?#]/, 1)[0]
  }
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return normalized === '/admin/data-statistics/lab-sheets'
    || normalized.startsWith('/admin/data-statistics/lab-sheets/')
    || normalized.split('/').includes('sample-retests')
}

function mockSharedPrepaidIds(config?: AdminRequestConfig) {
  const permitted = mockAuthorizedFrontendIds()
  const requested = String(config?.params?.frontendUserIds || '').split(',').filter(Boolean)
  if (requested.some((id) => !permitted.includes(id))) throw new Error('没有访问部分前端账号的权限')
  return requested.length ? requested : permitted
}

function mockSharedPrepaidEffectiveAllocations(row: any) {
  const sourceRow = row.kind === 'REVERSAL' && row.reversalOfId
    ? mockSharedPrepaid.consumptions.find((candidate) => candidate.id === row.reversalOfId) ?? row
    : row
  return {
    sourceConsumptionId: sourceRow.id,
    allocations: sourceRow.allocations
  }
}

function mockSharedPrepaidConsumptionParticipates(row: any, allowedIds: string[]) {
  const { allocations } = mockSharedPrepaidEffectiveAllocations(row)
  return allowedIds.includes(row.consumingFrontendUserId)
    || allocations.some((allocation: any) => allowedIds.includes(allocation.sourceOwnerId))
}

function mockSharedPrepaidMemberParticipates(memberId: string, allowedIds: string[]) {
  if (mockSharedPrepaid.recharges.some((row) => row.memberId === memberId && allowedIds.includes(row.ownerFrontendUserId))) {
    return true
  }
  return mockSharedPrepaid.consumptions.some((consumption) => consumption.memberId === memberId && (
    mockSharedPrepaidConsumptionParticipates(consumption, allowedIds)
    || consumption.payables.some((payable) => mockSharedPrepaid.settlements.some((settlement) =>
      settlement.lines.some((line) => line.payableId === payable.id)
      && (allowedIds.includes(settlement.accountAId) || allowedIds.includes(settlement.accountBId))
    ))
  ))
}

function mockSharedPrepaidConsumptionSummary(row: any) {
  const { allocations: effectiveAllocations, sourceConsumptionId } = mockSharedPrepaidEffectiveAllocations(row)
  const sourceOwners = [...new Map(effectiveAllocations.map((allocation: any) => [
    allocation.sourceOwnerId,
    allocation.sourceOwner
  ])).values()]
  const {
    allocations: _allocations,
    payables: _payables,
    originalPayables: _originalPayables,
    sheetId: _sheetId,
    sampleBlockId: _sampleBlockId,
    sampleIndex: _sampleIndex,
    ...summary
  } = row
  return {
    ...summary,
    allocationOrigin: sourceConsumptionId === row.id ? 'DIRECT' : 'REVERSAL_TARGET',
    allocationSourceConsumptionId: sourceConsumptionId,
    sourceOwners: sourceOwners.slice(0, 100),
    sourceOwnersTruncated: sourceOwners.length > 100
  }
}

function mockScopedSharedPrepaidMember(row: any, allowedIds: string[]) {
  const scopedRecharges = mockSharedPrepaid.recharges
    .filter((recharge) => recharge.memberId === row.id && allowedIds.includes(recharge.ownerFrontendUserId))
  const activeRecharges = scopedRecharges.filter((recharge) => !recharge.reversedAt)
  const scopedConsumptions = mockSharedPrepaid.consumptions.filter((consumption) => (
    consumption.memberId === row.id && mockSharedPrepaidConsumptionParticipates(consumption, allowedIds)
  ))
  const activeConsumptions = scopedConsumptions.filter((consumption) => (
    consumption.kind === 'CONSUMPTION' && consumption.active
  ))
  const consumedTotal = activeConsumptions.reduce((total, consumption) => {
    if (allowedIds.includes(consumption.consumingFrontendUserId)) return total + consumption.amount
    return total + consumption.allocations.reduce(
      (subtotal, allocation) => allowedIds.includes(allocation.sourceOwnerId)
        ? subtotal + allocation.allocatedAmount
        : subtotal,
      0
    )
  }, 0)
  const ownerComposition = [...new Set(activeRecharges.map((recharge) => recharge.ownerFrontendUserId))]
    .map((ownerFrontendUserId) => {
      const ownerRows = activeRecharges.filter((recharge) => recharge.ownerFrontendUserId === ownerFrontendUserId)
      const first = ownerRows[0]
      return {
        ownerFrontendUserId,
        ownerAccount: first.ownerAccount,
        ownerUsername: first.ownerUsername,
        ownerDisplayName: first.ownerUsername || first.ownerAccount,
        balance: ownerRows.reduce((total, recharge) => total + recharge.remainingAmount, 0)
      }
    })
    .filter((owner) => owner.balance > 0)
    .sort((left, right) => left.ownerFrontendUserId.localeCompare(right.ownerFrontendUserId))
  const ledgerEntries = (row.ledgerEntries ?? [])
    .filter((entry: any) => allowedIds.includes(entry.ownerFrontendUserId))
  const historyLimit = 50
  return {
    ...row,
    paidTotal: activeRecharges.reduce((total, recharge) => total + recharge.paidAmount, 0),
    giftTotal: activeRecharges.reduce((total, recharge) => total + recharge.giftAmount, 0),
    consumedTotal,
    balance: activeRecharges.reduce((total, recharge) => total + recharge.remainingAmount, 0),
    ownerComposition,
    latestRechargeTime: activeRecharges.reduce<string | null>((latest, recharge) => (
      !latest || recharge.createdAt > latest ? recharge.createdAt : latest
    ), null),
    latestConsumptionTime: activeConsumptions.reduce<string | null>((latest, consumption) => (
      !latest || consumption.createdAt > latest ? consumption.createdAt : latest
    ), null),
    historyLimit,
    historyTruncated: {
      recharges: scopedRecharges.length > historyLimit,
      consumptions: scopedConsumptions.length > historyLimit,
      ledgerEntries: ledgerEntries.length > historyLimit
    },
    recharges: scopedRecharges.slice(0, historyLimit),
    consumptions: scopedConsumptions.slice(0, historyLimit).map(mockSharedPrepaidConsumptionSummary),
    ledgerEntries: ledgerEntries.slice(0, historyLimit)
  }
}

function mockSharedPrepaidRows(resource: keyof typeof mockSharedPrepaid, config?: AdminRequestConfig) {
  const allowedIds = mockSharedPrepaidIds(config)
  const phone = String(config?.params?.phone || '').replace(/\D/g, '')
  const status = String(config?.params?.status || '')
  const startDate = String(config?.params?.startDate || '')
  const endDate = String(config?.params?.endDate || '')
  const rows = mockSharedPrepaid[resource].filter((row: any) => {
    const participates = resource === 'recharges'
      ? allowedIds.includes(row.ownerFrontendUserId)
      : resource === 'members'
        ? mockSharedPrepaidMemberParticipates(row.id, allowedIds)
        : resource === 'consumptions'
          ? mockSharedPrepaidConsumptionParticipates(row, allowedIds)
          : allowedIds.includes(row.accountAId) || allowedIds.includes(row.accountBId)
    const date = resource === 'recharges' ? row.rechargeDate : resource === 'consumptions' ? row.sheetDate : String(row.createdAt || '').slice(0, 10)
    const rowStatus = resource === 'recharges' ? (row.reversedAt ? 'REVERSED' : 'ACTIVE') : resource === 'consumptions' ? (row.active ? 'ACTIVE' : 'REVERSED') : row.status
    const sourceOwnerId = String(config?.params?.sourceOwnerId || '')
    const counterpartyId = String(config?.params?.counterpartyFrontendUserId || '')
    return participates
      && (!phone || String(row.phone || row.phoneSnapshot || '').includes(phone))
      && (!config?.params?.ownerFrontendUserId || row.ownerFrontendUserId === config.params.ownerFrontendUserId)
      && (!config?.params?.consumingFrontendUserId || row.consumingFrontendUserId === config.params.consumingFrontendUserId)
      && (resource !== 'consumptions' || !sourceOwnerId || mockSharedPrepaidEffectiveAllocations(row).allocations
        .some((allocation: any) => allocation.sourceOwnerId === sourceOwnerId))
      && (!counterpartyId || row.accountAId === counterpartyId || row.accountBId === counterpartyId)
      && (!status || rowStatus === status)
      && (resource !== 'recharges' || config?.params?.isOpeningBalance === undefined || row.isOpeningBalance === config.params.isOpeningBalance)
      && (!startDate || !date || date >= startDate)
      && (!endDate || !date || date <= endDate)
  })
  if (resource !== 'consumptions' || !config?.params?.payableStatus) return rows
  return rows.filter((row: any) => [...(row.payables || []), ...(row.originalPayables || [])]
    .some((payable: any) => payable.status === config.params.payableStatus))
}

function mockSharedPrepaidResponse(resource: keyof typeof mockSharedPrepaid, id: string | undefined, config?: AdminRequestConfig) {
  const rows = mockSharedPrepaidRows(resource, config)
  const allowedIds = mockSharedPrepaidIds(config)
  if (id) {
    const row = rows.find((item) => item.id === id)
    if (!row) throw new Error('记录不存在或无权查看')
    return resource === 'members' ? mockScopedSharedPrepaidMember(row, allowedIds) : row
  }
  const page = Math.max(1, Number(config?.params?.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(config?.params?.pageSize) || 20))
  const start = (page - 1) * pageSize
  const items = rows.slice(start, start + pageSize).map((row: any) => {
    if (resource === 'members') {
      const scoped = mockScopedSharedPrepaidMember(row, allowedIds)
      const { recharges: _recharges, consumptions: _consumptions, ledgerEntries: _ledgerEntries,
        historyLimit: _historyLimit, historyTruncated: _historyTruncated, ...summary } = scoped
      return summary
    }
    if (resource === 'consumptions') {
      return mockSharedPrepaidConsumptionSummary(row)
    }
    if (resource === 'settlements') {
      const { proofUrls: _proofUrls, lines: _lines, actions: _actions, rejectionReason: _rejectionReason, ...summary } = row
      return summary
    }
    if (resource === 'recharges') {
      const { reversal: _reversal, ...summary } = row
      return summary
    }
    return row
  })
  return { items, total: rows.length, page, pageSize }
}

function mockAttendanceFilter<T extends Record<string, unknown>>(rows: T[], config?: AdminRequestConfig, dateFields: [string, string?] = ['date']) {
  const ids = mockAttendanceIds(config)
  const employeeId = String(config?.params?.employeeId || '')
  const month = String(config?.params?.month || '')
  const startDate = String(config?.params?.startDate || '')
  const endDate = String(config?.params?.endDate || '')
  const status = String(config?.params?.status || '')
  const [startField, endField = startField] = dateFields
  return rows.filter((row) => {
    const rowStart = String(row[startField] || '')
    const rowEnd = String(row[endField] || rowStart)
    return ids.includes(String(row.frontendUserId))
      && (!employeeId || row.employeeId === employeeId)
      && (!month || rowStart.slice(0, 7) === month || (endField !== startField && rowStart <= `${month}-31` && rowEnd >= `${month}-01`))
      && (!startDate || rowEnd >= startDate)
      && (!endDate || rowStart <= endDate)
      && (!status || row.status === status)
  })
}

const mockAdminRetestInputs: AdminSampleRetestInput = {
  ironRaw: null, siliconRaw: null, siliconAdjust: null, aluminumRaw: null, aluminumAdjust: null,
  sulfur: null, densityRaw: null, whiteness: null, calciumRaw: null, magnesiumRaw: null,
  carbon: null, titaniumRaw: null, waterSample: null, bottleWater: null, bottleWaterSample: null,
  moisture: null, crucible: null, sampleWeight: null, burnedCrucibleSample: null
}

const mockAdminRetestResults: AdminSampleRetestResult = {
  iron: 0, silicon: 0, aluminum: 0, aluminumSiliconRatio: 0, total: 0, density: 0,
  calcium: 0, magnesium: 0, titanium: 0, bottleDensity: 0, moisture: 0, burnLoss: 0
}

const mockAdminRetestParameters: AdminSampleRetestParameterSnapshot = {
  ironBlank: 0.04, ironFactor: 29.1, siliconBlank: 0.027, siliconFactor: 13,
  aluminumFactor1: 0.502, aluminumFactor2: 4.98, calciumFactor: 1.15,
  magnesiumFactor: 0.556, titaniumFactor: 0.57
}

const mockSheet: AdminDataLabSheet = {
  id: 'sheet-1',
  frontendUserId: 'front-1',
  name: '凯里化验室',
  date: '2026-06-25',
  readonly: true,
  parameters: { ...mockAdminRetestParameters },
  sampleBlocks: [
    {
      id: 'block-1',
      index: 1,
      readonly: true,
      inputs: {
        sequence: '001',
        sampleNumber: '6.25桂AA802',
        customerText: '张三',
        customerId: 'customer-zhang-san',
        customerIds: ['customer-zhang-san'],
        customers: [{ id: 'customer-zhang-san', name: '张三', phone: '13800000001', wechat: 'zhangsan-wx', wechatNickname: '张总' }],
        price: 80,
        paymentStatus: '未结款',
        ironRaw: 1,
        siliconRaw: 2,
        aluminumRaw: 3,
        sulfur: 0.18,
        densityRaw: 1.08,
        whiteness: 76.5,
        calciumRaw: 1,
        magnesiumRaw: 3,
        carbon: 0.42,
        titaniumRaw: 2,
        waterSample: 10,
        bottleWater: 50,
        bottleWaterSample: 55,
        moisture: 2,
        crucible: 20,
        sampleWeight: 5,
        burnedCrucibleSample: 24.1
      },
      results: {
        iron: 27.94,
        silicon: 25.65,
        aluminum: 64.31,
        aluminumSiliconRatio: 2.51,
        total: 117.9,
        density: 74.07,
        calcium: 1.15,
        magnesium: 1.11,
        titanium: 1.14,
        bottleDensity: 1.9965,
        moisture: 2,
        burnLoss: 18
      },
      parameterSnapshot: { ...mockAdminRetestParameters },
      retests: [
        {
          id: 'retest-1', sampleBlockId: 'block-1', sequence: 1, status: 'ACTIVE', everFilled: true,
          readonly: true, sensitiveFieldsHidden: false,
          inputs: { ...mockAdminRetestInputs, ironRaw: 1.2, siliconRaw: 2.1 },
          results: { ...mockAdminRetestResults, iron: 33.76, silicon: 26.95, total: 60.71 },
          parameterSnapshot: { ...mockAdminRetestParameters },
          voidReason: null, createdById: 'front-1', updatedById: 'front-1', voidedById: null,
          createdAt: '2026-08-20T08:00:00+08:00', updatedAt: '2026-08-20T08:30:00+08:00', voidedAt: null
        },
        {
          id: 'retest-2', sampleBlockId: 'block-1', sequence: 2, status: 'VOID', everFilled: true,
          readonly: true, sensitiveFieldsHidden: false,
          inputs: { ...mockAdminRetestInputs, ironRaw: 1.3, siliconRaw: 2.2 },
          results: { ...mockAdminRetestResults, iron: 36.67, silicon: 28.25, total: 64.92 },
          parameterSnapshot: { ...mockAdminRetestParameters },
          voidReason: '复核无效', createdById: 'front-1', updatedById: 'front-1', voidedById: 'front-1',
          createdAt: '2026-08-20T09:00:00+08:00', updatedAt: '2026-08-20T09:30:00+08:00', voidedAt: '2026-08-20T10:00:00+08:00'
        }
      ]
    },
    {
      id: 'block-2',
      index: 2,
      readonly: true,
      inputs: {
        sequence: '002',
        sampleNumber: '粉矿',
        customerText: '李四',
        customerId: 'customer-li-si',
        customerIds: ['customer-li-si'],
        customers: [{ id: 'customer-li-si', name: '李四', phone: '13800000002', wechat: 'lisi-wx', wechatNickname: '李总' }],
        price: 100,
        paymentStatus: '月结款',
        ironRaw: 0.34,
        siliconRaw: 1.05,
        aluminumRaw: 2.7,
        sulfur: 0.08,
        calciumRaw: 0.8,
        magnesiumRaw: 1.6,
        titaniumRaw: 1.5
      },
      results: {
        iron: 8.64,
        silicon: 13.3,
        aluminum: 59.75,
        aluminumSiliconRatio: 4.49,
        total: 81.69,
        calcium: 0.92,
        magnesium: 0.44,
        titanium: 0.86
      },
      parameterSnapshot: { ...mockAdminRetestParameters },
      retests: []
    }
  ]
}

function hasVisibleSampleInput(inputs: Record<string, unknown>) {
  return Object.entries(inputs).some(([field, value]) => {
    if (field === 'sequence' || field === 'completed') return false
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'string') return value.trim() !== ''
    return Array.isArray(value) ? value.length > 0 : Boolean(value)
  })
}

function mockAdminDataIds(config?: AdminRequestConfig) {
  const permitted = mockAuthorizedFrontendIds()
  const requested = String(config?.params?.frontendUserIds || '').split(',').map((id) => id.trim()).filter(Boolean)
  if (requested.some((id) => !permitted.includes(id))) throw new Error('没有访问部分前端账号的权限')
  return requested.length ? requested : permitted
}

function parseHistoryFields(value: unknown) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '')
  return Array.from(new Set(raw.split(',').map((field) => field.trim()).filter(Boolean)))
}

const mockRequest = {
  async get(url: string, config?: AdminRequestConfig) {
    if (isEmployeeAttendanceAdminPath(url) && url !== '/admin/employee-attendance/schedules') assertExclusiveAttendanceDateFilter(config)
    const prepaidMatch = url.match(/^\/admin\/shared-prepaid\/(recharges|members|consumptions|settlements)(?:\/([^/]+))?$/)
    if (prepaidMatch) {
      return mockSharedPrepaidResponse(
        prepaidMatch[1] as keyof typeof mockSharedPrepaid,
        prepaidMatch[2] ? decodeURIComponent(prepaidMatch[2]) : undefined,
        config
      )
    }
    if (url === '/admin/auth/me') return mockAdminUser()
    if (url === '/admin/frontend-users/options') {
      const allowed = mockAuthorizedFrontendIds()
      return mockRows.frontendUsers.filter((row) => allowed.includes(row.id)).map((row) => ({
        id: row.id,
        account: row.account,
        name: row.displayRemark || row.username || row.account,
        disabled: row.disabled
      }))
    }
    if (url === '/admin/employee-attendance/overview') {
      const ids = mockAttendanceIds(config)
      const month = String(config?.params?.month || '2026-08')
      return {
        month,
        workforce: mockEmployeeAttendance.employees.filter((row) => ids.includes(row.frontendUserId) && row.status === 'ACTIVE').length,
        attendanceRecords: mockEmployeeAttendance.attendance.filter((row) => ids.includes(row.frontendUserId) && row.date.startsWith(month)).length,
        pendingLeave: mockEmployeeAttendance.leaves.filter((row) => ids.includes(row.frontendUserId) && row.status === 'PENDING' && row.startDate <= `${month}-31` && row.endDate >= `${month}-01`).length,
        payrollRuns: mockEmployeeAttendance.payroll.filter((row) => ids.includes(row.frontendUserId) && row.month === month).length,
        readonly: true
      }
    }
    if (url === '/admin/employee-attendance/employees') {
      const ids = mockAttendanceIds(config)
      const employeeId = String(config?.params?.employeeId || '')
      const status = String(config?.params?.status || '')
      return mockEmployeeAttendance.employees.filter((row) => ids.includes(row.frontendUserId) && (!employeeId || row.id === employeeId) && (!status || row.status === status))
    }
    if (url === '/admin/employee-attendance/schedules') {
      return mockMonthlyScheduleFilter(config)
    }
    if (url === '/admin/employee-attendance/schedule-attendance-overview') return mockAdminScheduleAttendanceOverview(config)
    if (url === '/admin/employee-attendance/attendance') return mockAttendanceFilter(mockEmployeeAttendance.attendance, config)
    if (url === '/admin/employee-attendance/leaves') return mockAttendanceFilter(mockEmployeeAttendance.leaves, config, ['startDate', 'endDate'])
    if (url === '/admin/employee-attendance/commissions') return mockAttendanceFilter(mockEmployeeAttendance.commissions, config)
    if (url === '/admin/employee-attendance/bonuses') return mockAttendanceFilter(mockEmployeeAttendance.bonuses, config)
    if (url === '/admin/employee-attendance/payroll') {
      const ids = mockAttendanceIds(config)
      const employeeId = String(config?.params?.employeeId || '')
      const month = String(config?.params?.month || '')
      const status = String(config?.params?.status || '')
      return mockEmployeeAttendance.payroll.filter((row) => ids.includes(row.frontendUserId) && (!month || row.month === month) && (!status || row.status === status))
        .map((row) => ({ ...row, items: row.items.filter((item) => !employeeId || item.employeeId === employeeId) }))
        .filter((row) => !employeeId || row.items.length)
    }
    if (url === '/admin/employee-attendance/audit') {
      const ids = mockAttendanceIds(config)
      const month = String(config?.params?.month || '')
      return mockEmployeeAttendance.audit.filter((row) => ids.includes(row.frontendUserId) && (!month || String(row.createdAt).slice(0, 7) === month))
    }
    if (url === '/admin/data-statistics/lab-sheets') {
      const ids = mockAdminDataIds(config)
      const date = String(config?.params?.date || mockSheet.date)
      if (!ids.includes(mockSheet.frontendUserId) || date !== mockSheet.date) return []
      const sampleBlocks = mockSheet.sampleBlocks.filter((block) => hasVisibleSampleInput(block.inputs))
      return sampleBlocks.length ? [{ ...mockSheet, sampleBlocks }] : []
    }
    if (url === '/admin/customer-overview') {
      const selectedIds = String(config?.params?.frontendUserIds || '').split(',').filter(Boolean)
      return selectedIds.length
        ? mockRows.customerOverview.filter((row) => selectedIds.includes(row.frontendUserId))
        : mockRows.customerOverview
    }
    if (url === '/admin/medicine-inventory/items') {
      const selectedFrontendIds = String(config?.params?.frontendUserIds || '').split(',').filter(Boolean)
      const selectedItemIds = String(config?.params?.medicineItemIds || '').split(',').filter(Boolean)
      return mockRows.medicineInventoryItems.filter((row) =>
        (!selectedFrontendIds.length || selectedFrontendIds.includes(row.frontendUserId)) &&
        (!selectedItemIds.length || selectedItemIds.includes(row.id))
      )
    }
    if (url === '/admin/medicine-inventory/inbounds' || url === '/admin/medicine-inventory/outbounds') {
      const selectedFrontendIds = String(config?.params?.frontendUserIds || '').split(',').filter(Boolean)
      const selectedItemIds = String(config?.params?.medicineItemIds || '').split(',').filter(Boolean)
      const startDate = String(config?.params?.startDate || '')
      const endDate = String(config?.params?.endDate || '')
      const isInbound = url.endsWith('/inbounds')
      const types = isInbound ? ['INBOUND', 'CORRECTION_OUT'] : ['OUTBOUND', 'CORRECTION_IN']
      return mockRows.medicineInventoryMovements.filter((row) =>
        types.includes(row.type) &&
        (!selectedFrontendIds.length || selectedFrontendIds.includes(row.frontendUserId)) &&
        (!selectedItemIds.length || selectedItemIds.includes(row.medicineItemId)) &&
        (!startDate || row.occurredOn >= startDate) &&
        (!endDate || row.occurredOn <= endDate)
      )
    }
    if (url === '/admin/data-statistics/cell-history') {
      const fields = parseHistoryFields(config?.params?.fields || config?.params?.field || 'sampleNumber')
      return fields.flatMap((field, index) => {
        if (field === 'ironRaw') {
          return [
            { id: `h-${field}-1`, field, oldValue: '', newValue: '0.944', changedAt: '2026-06-25 10:10:00' },
            { id: `h-${field}-2`, field, oldValue: '0.944', newValue: '0.950', changedAt: '2026-06-25 10:25:00' },
            { id: `h-${field}-3`, field, oldValue: '0.950', newValue: '1.000', changedAt: '2026-06-25 14:20:00' }
          ]
        }
        return [
          { id: `h-${field}-1`, field, oldValue: index ? '' : '王总', newValue: index ? '1.000' : '李总', changedAt: '2026-06-25 10:10:00' },
          { id: `h-${field}-2`, field, oldValue: index ? '1.000' : '李总', newValue: index ? '1.250' : '张总', changedAt: '2026-06-25 10:25:00' }
        ]
      })
    }
    if (url === '/admin/finance/income') {
      return {
        totals: { today: { amount: 180 }, week: { amount: 1260 }, month: { amount: 5200 } },
        rows: [
          {
            date: '2026-06-25',
            sampleCount: 3,
            totalAmount: 1180,
            statusSummaries: [
              { status: '已结款', count: 0, amount: 0 },
              { status: '未结款', count: 1, amount: 80 },
              { status: '月结款', count: 1, amount: 100 },
              { status: '预存款', count: 1, amount: 1000 }
            ]
          }
        ]
      }
    }
    if (url === '/admin/finance/expenses') {
      return {
        totals: { today: { amount: 368 }, week: { amount: 1260 }, month: { amount: 4200 } },
        rows: [{ id: 'e-1', paymentDate: '2026-06-25', registeredAt: '2026-06-25 09:30:00', name: '凯里化验室', item: '试剂耗材采购', amount: 368, paymentMethod: 'online', screenshotUrl: '无信息', remark: '铁硅铝日常检测耗材' }]
      }
    }
    if (url === '/admin/finance/unsettled') return mockRows.unsettled
    if (url === '/admin/finance/monthly-daily') return mockRows.monthlyDaily
    if (url === '/admin/finance/monthly-bills') {
      return { summaryRows: [{ id: '2026-06__front-1__李四', recordId: 'mrs-1', month: '2026-06', frontendUserId: 'front-1', name: '凯里化验室', customer: '李四', amount: 1280, sampleCount: 16, settlementStatus: '未结款', paidAmount: null, remark: '' }] }
    }
    if (url === '/admin/finance/monthly-customers') return mockRows.monthlyCustomers
    if (url === '/admin/finance/delete-requests') {
      const status = String(config?.params?.status || '')
      return status ? mockRows.deletionRequests.filter((row) => row.status === status) : mockRows.deletionRequests
    }
    if (url === '/admin/abnormal-records') return mockRows.abnormal
    if (url === '/admin/blacklist') return mockRows.blacklist
    if (url === '/admin/accounts/frontend-users') return mockRows.frontendUsers
    if (url === '/admin/accounts/sub-admins') return mockRows.subAdmins
    return {}
  },
  async post(url: string, payload?: any, config?: AdminRequestConfig) {
    if (url === '/admin/auth/login') {
      if (payload?.account === mockUser.account && payload?.password === 'admin123456') return { token: 'mock-admin-token', user: mockUser }
      const sub = mockRows.subAdmins.find((row) => row.account === payload?.account && row.password === payload?.password)
      if (sub) return { token: 'mock-sub-admin-token', user: { id: sub.id, account: sub.account, username: sub.username, role: 'SUB_ADMIN' } }
      throw new Error('账号或密码错误')
    }
    if (isAdminRetestWritePath(url)) throw new Error('后台复样数据只读')
    if (isSharedPrepaidAdminPath(url)) throw new Error('后台共享预存款只读')
    if (url === '/admin/accounts/invite-codes') return { code: `YS-${Date.now().toString().slice(-6)}` }
    const revealEmployeeMatch = url.match(/^\/admin\/employee-attendance\/employees\/(.+)\/reveal$/)
    if (revealEmployeeMatch) {
      const admin = mockAdminUser()
      const validPassword = admin.role === 'ROOT_ADMIN' ? 'admin123456' : 'sub123456'
      if (payload?.password !== validPassword) throw new Error('当前后台账号密码错误')
      const employee = mockEmployeeAttendance.employees.find((row) => row.id === revealEmployeeMatch[1] && mockAttendanceIds(config).includes(row.frontendUserId))
      if (!employee) throw new Error('员工不存在或无权查看')
      mockEmployeeAttendance.audit.unshift({
        id: `audit-${Date.now()}`, frontendUserId: employee.frontendUserId, action: 'REVEAL', entityType: 'Employee', entityId: employee.id,
        reason: '后台敏感信息二次验证查看', createdAt: new Date().toISOString(), actorUser: { account: admin.account, username: admin.username, role: admin.role }
      })
      return { ...employee, ...mockEmployeeAttendance.sensitive[employee.id] }
    }
    if (isEmployeeAttendanceAdminPath(url)) throw new Error('后台员工考勤只读')
    const approveDeletionMatch = url.match(/^\/admin\/finance\/delete-requests\/(.+)\/approve$/)
    if (approveDeletionMatch) {
      const row = mockRows.deletionRequests.find((item) => item.id === approveDeletionMatch[1])
      if (row) {
        row.status = 'APPROVED'
        row.statusLabel = '已同意'
        row.updatedAt = new Date().toISOString()
      }
      return row || { ok: true }
    }
    const rejectDeletionMatch = url.match(/^\/admin\/finance\/delete-requests\/(.+)\/reject$/)
    if (rejectDeletionMatch) {
      const row = mockRows.deletionRequests.find((item) => item.id === rejectDeletionMatch[1])
      if (row) {
        row.status = 'REJECTED'
        row.statusLabel = '已拒绝'
        row.reviewRemark = payload?.reviewRemark || ''
        row.updatedAt = new Date().toISOString()
      }
      return row || { ok: true }
    }
    return { ok: true }
  },
  async put(url: string) {
    if (isAdminRetestWritePath(url)) throw new Error('后台复样数据只读')
    if (isSharedPrepaidAdminPath(url)) throw new Error('后台共享预存款只读')
    if (isEmployeeAttendanceAdminPath(url)) throw new Error('后台员工考勤只读')
    return { ok: true }
  },
  async patch(url: string, payload?: any) {
    if (isAdminRetestWritePath(url)) throw new Error('后台复样数据只读')
    if (isSharedPrepaidAdminPath(url)) throw new Error('后台共享预存款只读')
    if (isEmployeeAttendanceAdminPath(url)) throw new Error('后台员工考勤只读')
    if (url === '/admin/auth/profile') {
      mockUser.account = payload?.account || mockUser.account
      mockUser.username = payload?.username || mockUser.username
      return mockUser
    }
    const remarkMatch = url.match(/^\/admin\/accounts\/frontend-users\/(.+)\/remark$/)
    if (remarkMatch) {
      const row = mockRows.frontendUsers.find((item) => item.id === remarkMatch[1])
      if (row) {
        row.displayRemark = payload?.displayRemark || ''
        row.displayName = row.displayRemark || row.username || row.account
      }
      return row || { ok: true }
    }
    if (url === '/admin/finance/monthly-customers/remark') {
      const row = mockRows.monthlyCustomers.find((item) => item.frontendUserId === payload?.frontendUserId && item.customer === payload?.customer)
      if (row) row.remark = payload?.remark || ''
    }
    return { ok: true }
  },
  async delete(url: string) {
    if (isAdminRetestWritePath(url)) throw new Error('后台复样数据只读')
    if (isSharedPrepaidAdminPath(url)) throw new Error('后台共享预存款只读')
    if (isEmployeeAttendanceAdminPath(url)) throw new Error('后台员工考勤只读')
    return { ok: true }
  }
} as AdminRequest

export const request: AdminRequest = useAdminMocks ? mockRequest : (realRequest as unknown as AdminRequest)

export function currentAdminUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}

export async function adminLogin(payload: { account: string; password: string }) {
  const result = await request.post<any, { token: string; user: AdminUser }>('/admin/auth/login', payload)
  localStorage.setItem(ADMIN_TOKEN_KEY, result.token)
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(result.user))
  return result
}

export async function adminMe() {
  const result = await request.get<any, AdminUser>('/admin/auth/me')
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(result))
  return result
}

export async function updateAdminProfile(payload: AdminProfilePayload) {
  const result = await request.patch<any, AdminUser>('/admin/auth/profile', payload)
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(result))
  return result
}

export function logoutAdmin() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_USER_KEY)
}

export function getFrontendOptions() {
  return request.get<any, FrontendOption[]>('/admin/frontend-users/options')
}

export function getAdminFrontendAccounts() {
  return request.get<any, AdminFrontendAccount[]>('/admin/accounts/frontend-users')
}

export function buildFrontendIds(ids: string[]) {
  return ids.join(',')
}

export function getAdminCustomerOverview(frontendUserIds: string[]) {
  return request.get<any, AdminCustomerOverviewRow[]>('/admin/customer-overview', {
    params: { frontendUserIds: buildFrontendIds(frontendUserIds) }
  })
}

export function getAdminMedicineItems(frontendUserIds: string[], medicineItemIds: string[] = []) {
  return request.get<any, AdminMedicineInventoryItem[]>('/admin/medicine-inventory/items', {
    params: {
      frontendUserIds: buildFrontendIds(frontendUserIds),
      ...(medicineItemIds.length ? { medicineItemIds: medicineItemIds.join(',') } : {})
    }
  })
}

export function getAdminMedicineInbounds(
  frontendUserIds: string[],
  medicineItemIds: string[] = [],
  startDate?: string,
  endDate?: string
) {
  return request.get<any, AdminMedicineInventoryMovement[]>('/admin/medicine-inventory/inbounds', {
    params: {
      frontendUserIds: buildFrontendIds(frontendUserIds),
      ...(medicineItemIds.length ? { medicineItemIds: medicineItemIds.join(',') } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {})
    }
  })
}

export function getAdminMedicineOutbounds(
  frontendUserIds: string[],
  medicineItemIds: string[] = [],
  startDate?: string,
  endDate?: string
) {
  return request.get<any, AdminMedicineInventoryMovement[]>('/admin/medicine-inventory/outbounds', {
    params: {
      frontendUserIds: buildFrontendIds(frontendUserIds),
      ...(medicineItemIds.length ? { medicineItemIds: medicineItemIds.join(',') } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {})
    }
  })
}

function employeeAttendanceParams(query: AdminEmployeeAttendanceQuery, monthWins = false) {
  if (!monthWins && query.month && (query.startDate || query.endDate)) throw new Error('月份和日期范围不能同时筛选')
  return {
    frontendUserIds: buildFrontendIds(query.frontendUserIds),
    ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    ...(query.month ? { month: query.month } : {}),
    ...(!monthWins || !query.month ? (query.startDate ? { startDate: query.startDate } : {}) : {}),
    ...(!monthWins || !query.month ? (query.endDate ? { endDate: query.endDate } : {}) : {}),
    ...(query.status ? { status: query.status } : {})
  }
}

function normalizeAdminAttendanceEmployee(row: AdminAttendanceEmployeeResponse): AdminAttendanceEmployee {
  const { idCard, bankCard, address, emergencyContact, ...safe } = row
  return {
    ...safe,
    idCardMasked: row.idCardMasked ?? idCard ?? '',
    bankCardMasked: row.bankCardMasked ?? bankCard ?? '',
    addressMasked: row.addressMasked ?? address ?? '',
    emergencyContactMasked: row.emergencyContactMasked ?? emergencyContact ?? ''
  }
}

export async function getAdminAttendanceOverview(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminAttendanceOverview>('/admin/employee-attendance/overview', { params: employeeAttendanceParams(query) })
}

export async function getAdminAttendanceEmployees(query: AdminEmployeeAttendanceQuery) {
  return request.get<unknown, AdminAttendanceEmployeeResponse[]>('/admin/employee-attendance/employees', { params: employeeAttendanceParams(query) })
    .then((rows) => rows.map(normalizeAdminAttendanceEmployee))
}

export async function getAdminAttendanceSchedules(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminAttendanceSchedules>('/admin/employee-attendance/schedules', { params: employeeAttendanceParams(query, true) })
}

function adminRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('后台排班考勤概览响应格式无效')
  return value as Record<string, unknown>
}

export function normalizeAdminScheduleAttendanceOverview(value: unknown): AdminScheduleAttendanceOverview {
  const row = adminRecord(value)
  if (typeof row.month !== 'string' || row.readonly !== true || !Array.isArray(row.days)) throw new Error('后台排班考勤概览响应格式无效')
  const overview = adminRecord(row.overview)
  const statuses = ['FUTURE', 'ABSENT', 'LEAVE', 'REST', 'NORMAL', 'OVERTIME', 'SHORT'] as const
  const tones = ['future', 'normal', 'leave', 'absent', 'rest', 'overtime', 'short'] as const
  const days = row.days.map((value): AdminAttendanceCalendarDay => {
    const day = adminRecord(value)
    if (typeof day.date !== 'string' || !statuses.includes(day.status as typeof statuses[number]) || !tones.includes(day.backgroundTone as typeof tones[number]) || !tones.includes(day.durationTone as typeof tones[number]) || !Array.isArray(day.actualSegments)) throw new Error('后台排班考勤概览响应格式无效')
    const scheduleRow = day.schedule ? adminRecord(day.schedule) : null
    if (scheduleRow && (typeof scheduleRow.id !== 'string' || typeof scheduleRow.employeeId !== 'string' || typeof scheduleRow.date !== 'string' || !Array.isArray(scheduleRow.segments))) throw new Error('后台排班考勤概览响应格式无效')
    const schedule = scheduleRow ? {
      id: scheduleRow.id as string, employeeId: scheduleRow.employeeId as string, date: scheduleRow.date as string, isWorkday: Boolean(scheduleRow.isWorkday),
      scheduledMinutes: Number(scheduleRow.scheduledMinutes || 0), breakMinutes: Number(scheduleRow.breakMinutes || 0), remark: String(scheduleRow.remark || ''),
      segments: (scheduleRow.segments as unknown[]).map((value, index) => { const segment = adminRecord(value); return { sequence: Number(segment.sequence ?? index), startTime: String(segment.startTime || ''), endTime: String(segment.endTime || '') } })
    } : null
    return {
      date: day.date, day: Number(day.day || 0), isFuture: Boolean(day.isFuture), status: day.status as AdminAttendanceCalendarDay['status'], schedule,
      actualSegments: (day.actualSegments as unknown[]).map((value, index) => { const segment = adminRecord(value); return { sequence: Number(segment.sequence ?? index), checkInAt: String(segment.checkInAt || ''), checkOutAt: String(segment.checkOutAt || '') } }),
      scheduledMinutes: Number(day.scheduledMinutes || 0), workedMinutes: Number(day.workedMinutes || 0), approvedLeaveMinutes: Number(day.approvedLeaveMinutes || 0), overtimeMinutes: Number(day.overtimeMinutes || 0), displayMinutes: Number(day.displayMinutes || 0), shortageMinutes: Number(day.shortageMinutes || 0),
      durationText: String(day.durationText || ''), leaveTypeName: String(day.leaveTypeName || ''), leaveReason: String(day.leaveReason || ''), absenceReason: String(day.absenceReason || ''), backgroundTone: day.backgroundTone as AdminAttendanceCalendarDay['backgroundTone'], durationTone: day.durationTone as AdminAttendanceCalendarDay['durationTone']
    }
  })
  const employee = row.employee ? adminRecord(row.employee) : null
  return {
    month: row.month, employee: employee ? { id: String(employee.id || ''), employeeNumber: String(employee.employeeNumber || ''), name: String(employee.name || '') } : null, days,
    overview: { month: String(overview.month || row.month), activeEmployees: Number(overview.activeEmployees ?? overview.workforce ?? 0), todayPresent: Number(overview.todayPresent ?? overview.todayAttendance ?? 0), todayOnLeave: Number(overview.todayOnLeave ?? overview.todayLeave ?? 0), todayAbsent: Number(overview.todayAbsent ?? overview.todayAbsence ?? 0), overtimeHours: Number(overview.overtimeHours ?? Number(overview.overtimeMinutes || 0) / 60), pendingLeaves: Number(overview.pendingLeaves ?? overview.pendingLeave ?? 0), projectedPayroll: Number(overview.projectedPayroll || 0), issueCount: Number(overview.issueCount || 0), issues: Array.isArray(overview.issues) ? overview.issues.map(String) : [] },
    readonly: true
  }
}

export async function getAdminScheduleAttendanceOverview(query: AdminEmployeeAttendanceQuery) {
  if (!query.month) throw new Error('月份必填')
  return request.get<unknown, unknown>('/admin/employee-attendance/schedule-attendance-overview', { params: {
    frontendUserIds: buildFrontendIds(query.frontendUserIds), ...(query.employeeId ? { employeeId: query.employeeId } : {}), month: query.month
  } }).then(normalizeAdminScheduleAttendanceOverview)
}

export async function getAdminAttendanceRecords(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminAttendanceRecord[]>('/admin/employee-attendance/attendance', { params: employeeAttendanceParams(query) })
}

export async function getAdminAttendanceLeaves(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminLeaveRequest[]>('/admin/employee-attendance/leaves', { params: employeeAttendanceParams(query) })
}

export async function getAdminAttendanceCommissions(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminCommissionRecord[]>('/admin/employee-attendance/commissions', { params: employeeAttendanceParams(query) })
}

export async function getAdminAttendanceBonuses(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminBonusRecord[]>('/admin/employee-attendance/bonuses', { params: employeeAttendanceParams(query) })
}

export async function getAdminAttendancePayroll(query: AdminEmployeeAttendanceQuery) {
  return request.get<any, AdminAttendancePayrollRun[]>('/admin/employee-attendance/payroll', { params: employeeAttendanceParams(query) })
}

export function getAdminAttendanceAudit(query: AdminAttendanceAuditQuery) {
  return request.get<any, AdminAttendanceAuditRow[]>('/admin/employee-attendance/audit', {
    params: { frontendUserIds: buildFrontendIds(query.frontendUserIds), ...(query.month ? { month: query.month } : {}) }
  })
}

export function revealAdminAttendanceEmployee(employeeId: string, password: string, frontendUserIds: string[]) {
  return request.post<AdminAttendanceRevealPayload, AdminRevealedAttendanceEmployeeResponse>(`/admin/employee-attendance/employees/${employeeId}/reveal`, { password }, {
    params: { frontendUserIds: buildFrontendIds(frontendUserIds) },
    preserveAdminSessionOnUnauthorized: true
  }).then((row): AdminRevealedAttendanceEmployee => ({
    ...normalizeAdminAttendanceEmployee({
      ...row,
      idCardMasked: maskAdminSensitive(row.idCard),
      bankCardMasked: maskAdminSensitive(row.bankCard),
      addressMasked: maskAdminSensitive(row.address),
      emergencyContactMasked: maskAdminSensitive(row.emergencyContact)
    }),
    idCard: row.idCard,
    bankCard: row.bankCard,
    address: row.address,
    emergencyContact: row.emergencyContact
  }))
}

function maskAdminSensitive(value: string) {
  return value ? `${value.slice(0, 3)}****${value.slice(-4)}` : ''
}
