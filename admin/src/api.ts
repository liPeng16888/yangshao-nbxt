import axios from 'axios'
import { ElMessage } from 'element-plus'
import type { AdminUser, FrontendOption } from './types'

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
  get<T = any, R = any>(url: string, config?: any): Promise<R>
  post<T = any, R = any>(url: string, payload?: any, config?: any): Promise<R>
  patch<T = any, R = any>(url: string, payload?: any, config?: any): Promise<R>
  delete<T = any, R = any>(url: string, config?: any): Promise<R>
}

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
    if (error?.response?.status === 401) {
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
  frontendUsers: [
    {
      id: 'front-1',
      account: 'kaili001',
      username: '凯里化验室',
      displayRemark: '',
      displayName: '凯里化验室',
      password: '123456',
      accessGuard: { enabled: true, password: '2580', ttlMinutes: 5, recoveryPrompt: '管理员提示', recoveryAnswer: '凯里' },
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
      accessGuard: { enabled: false, password: '', ttlMinutes: 5, recoveryPrompt: '', recoveryAnswer: '' },
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
  prepaidRecharges: [
    { id: 'p-1', rechargeDate: '2026-06-25', createdAt: '2026-06-25 10:30:00', frontendUserId: 'front-1', name: '凯里化验室', customer: '王总', amount: 1000, usableTimes: 10, remark: '预存款示例' }
  ],
  prepaidCustomers: [
    { id: 'front-1__王总', frontendUserId: 'front-1', name: '凯里化验室', customer: '王总', totalAmount: 1000, totalUsableTimes: 10, usedTimes: 2, availableTimes: 8, remark: '预存款示例' }
  ],
  prepaidDaily: [
    { id: '2026-06-25__王总', date: '2026-06-25', frontendUserId: 'front-1', name: '凯里化验室', customer: '王总', sampleCount: 2, remark: '当天扣除 2 次' }
  ]
}

const mockSheet = {
  id: 'sheet-1',
  frontendUserId: 'front-1',
  name: '凯里化验室',
  date: '2026-06-25',
  readonly: true,
  parameters: {},
  sampleBlocks: [
    {
      id: 'block-1',
      index: 1,
      readonly: true,
      inputs: {
        sequence: '001',
        sampleNumber: '6.25桂AA802',
        customerText: '张三',
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
        moisture: 2,
        burnLoss: 18
      }
    },
    {
      id: 'block-2',
      index: 2,
      readonly: true,
      inputs: {
        sequence: '002',
        sampleNumber: '粉矿',
        customerText: '李四',
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
      }
    }
  ]
}

const labDetectionInputFields = [
  'ironRaw',
  'siliconRaw',
  'siliconAdjust',
  'aluminumRaw',
  'aluminumAdjust',
  'sulfur',
  'densityRaw',
  'whiteness',
  'calciumRaw',
  'magnesiumRaw',
  'carbon',
  'titaniumRaw',
  'waterSample',
  'bottleWater',
  'bottleWaterSample',
  'crucible',
  'sampleWeight',
  'burnedCrucibleSample'
]

function hasLabDetectionInput(inputs: Record<string, unknown>) {
  return labDetectionInputFields.some((field) => hasDetectionInputValue(inputs[field]))
}

function hasDetectionInputValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed !== '' && Number.isFinite(Number(trimmed))
}

function parseHistoryFields(value: unknown) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '')
  return Array.from(new Set(raw.split(',').map((field) => field.trim()).filter(Boolean)))
}

const mockRequest = {
  async get(url: string, config?: any) {
    if (url === '/admin/auth/me') return mockUser
    if (url === '/admin/frontend-users/options') {
      return mockRows.frontendUsers.map((row) => ({
        id: row.id,
        account: row.account,
        name: row.displayRemark || row.username || row.account,
        disabled: row.disabled
      }))
    }
    if (url === '/admin/data-statistics/lab-sheets') {
      const sampleBlocks = mockSheet.sampleBlocks.filter((block) => hasLabDetectionInput(block.inputs))
      return sampleBlocks.length ? [{ ...mockSheet, date: config?.params?.date || mockSheet.date, sampleBlocks }] : []
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
            sampleCount: 12,
            totalAmount: 1180,
            statusSummaries: [
              { status: '已结款', count: 0, amount: 0 },
              { status: '未结款', count: 1, amount: 80 },
              { status: '月结款', count: 1, amount: 100 },
              { status: '预存款', count: 10, amount: 1000 }
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
    if (url === '/admin/finance/prepaid-recharges') return mockRows.prepaidRecharges
    if (url === '/admin/finance/prepaid-report') {
      return { customerRows: mockRows.prepaidCustomers, dailyRows: mockRows.prepaidDaily }
    }
    if (url === '/admin/abnormal-records') return mockRows.abnormal
    if (url === '/admin/blacklist') return mockRows.blacklist
    if (url === '/admin/accounts/frontend-users') return mockRows.frontendUsers
    if (url === '/admin/accounts/sub-admins') return mockRows.subAdmins
    return {}
  },
  async post(url: string, payload?: any) {
    if (url === '/admin/auth/login') {
      if (payload?.account !== mockUser.account || payload?.password !== 'admin123456') throw new Error('账号或密码错误')
      return { token: 'mock-admin-token', user: mockUser }
    }
    if (url === '/admin/accounts/invite-codes') return { code: `YS-${Date.now().toString().slice(-6)}` }
    return { ok: true }
  },
  async patch(url: string, payload?: any) {
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
  async delete() {
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

export function buildFrontendIds(ids: string[]) {
  return ids.join(',')
}
