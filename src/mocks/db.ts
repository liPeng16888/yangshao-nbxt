import dayjs from 'dayjs'
import type { AuthResponse, AuthUser, LoginPayload, RegisterPayload, UpdatePasswordPayload } from '@/types/auth'
import type { BlacklistCheckResult, BlacklistPayload, BlacklistRecord } from '@/types/blacklist'
import type { Customer, CustomerPayload } from '@/types/customer'
import type { FinanceEntry, FinancePayload } from '@/types/finance'
import type { DateRange, FinanceReport, SampleDetectionReport } from '@/types/report'
import type { LabParameter, LabSheet, LabSampleInput, SampleBlock } from '@/types/labSheet'
import { defaultLabParameters, DEFAULT_SAMPLE_BLOCK_COUNT } from '@/constants/labSheetTemplate'
import { financeCategoryRules } from '@/constants/reportCategories'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { getReportRange, todayInBeijing } from '@/utils/date'
import { isReportableSample } from '@/utils/sampleReport'

let currentUser: AuthUser = {
  id: 'u-admin',
  username: '管理员',
  account: 'admin',
  role: 'admin' as const
}

let labParameters: LabParameter = {
  ...defaultLabParameters,
  savedAt: dayjs().toISOString()
}

const customers: Customer[] = [
  { id: 'c-1', name: '洛阳矿业样品 001', phone: '13800000001', wechat: 'luoyang001', wechatNickname: '洛阳矿业' },
  { id: 'c-2', name: '三门峡选矿厂', phone: '13800000002', wechat: 'smx-ore', wechatNickname: '三门峡客户' },
  { id: 'c-3', name: '渑池送样客户', phone: '13800000003', wechat: 'mianchi-lab', wechatNickname: '渑池样品' }
]

let blacklist: BlacklistRecord[] = [
  {
    id: 'b-1',
    uploadedAt: dayjs().subtract(2, 'day').toISOString(),
    uploadedBy: '管理员',
    phone: '13800000002',
    wechat: 'smx-ore',
    wechatNickname: '三门峡客户',
    amount: 1280,
    images: [],
    other: '历史欠款客户',
    note: '录入样品前需确认付款'
  },
  {
    id: 'b-2',
    uploadedAt: dayjs().subtract(8, 'day').toISOString(),
    uploadedBy: '管理员',
    phone: '13999999999',
    wechat: 'risk-client',
    wechatNickname: '风险客户',
    amount: 860,
    images: [],
    other: '多次催收未回款',
    note: ''
  }
]

let financeEntries: FinanceEntry[] = [
  {
    id: 'f-1',
    paymentDate: dayjs().format('YYYY-MM-DD'),
    item: '试剂耗材采购',
    amount: 368,
    paymentMethod: 'online',
    screenshotUrl: '',
    remark: '铁硅铝日常检测耗材'
  },
  {
    id: 'f-2',
    paymentDate: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
    item: '打印纸和标签纸',
    amount: 126,
    paymentMethod: 'cash',
    screenshotUrl: '',
    remark: ''
  },
  {
    id: 'f-3',
    paymentDate: dayjs().subtract(3, 'day').format('YYYY-MM-DD'),
    item: '设备校准服务',
    amount: 780,
    paymentMethod: 'online',
    screenshotUrl: '',
    remark: '光谱仪校准'
  }
]

const labSheets = new Map<string, LabSheet>()

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function delay<T>(value: T, ms = 120) {
  return new Promise<T>((resolve) => {
    window.setTimeout(() => resolve(clone(value)), ms)
  })
}

function createEmptyBlock(index: number, parameters: LabParameter, date: string): SampleBlock {
  const inputs: LabSampleInput = {
    sequence: String(index).padStart(3, '0'),
    sampleNumber: '',
    customerIds: [],
    customers: [],
    customerText: '',
    price: null,
    paymentStatus: ''
  }

  return {
    id: `${date}-${index}`,
    index,
    readonly: false,
    inputs,
    results: calculateSampleResults(inputs, parameters),
    parameterSnapshot: clone(parameters)
  }
}

function ensureSheet(date = todayInBeijing()) {
  if (!labSheets.has(date)) {
    const readonly = date !== todayInBeijing()
    const sampleBlocks = Array.from({ length: DEFAULT_SAMPLE_BLOCK_COUNT }, (_, idx) => ({
      ...createEmptyBlock(idx + 1, labParameters, date),
      readonly
    }))
    labSheets.set(date, {
      id: `sheet-${date}`,
      date,
      readonly,
      parameters: clone(labParameters),
      sampleBlocks
    })
  }
  return labSheets.get(date)!
}

export async function mockLogin(payload: LoginPayload): Promise<AuthResponse> {
  if (payload.account !== 'admin' || payload.password !== 'admin123') {
    throw new Error('账号或密码错误')
  }
  return delay({ token: 'mock-token-admin', user: currentUser })
}

export async function mockRegister(payload: RegisterPayload): Promise<AuthResponse> {
  if (payload.inviteCode !== 'YANGSHAO-2026') {
    throw new Error('一次性注册码无效、已使用或已过期')
  }
  currentUser = {
    id: `u-${Date.now()}`,
    username: payload.username,
    account: payload.account,
    role: 'staff'
  }
  return delay({ token: `mock-token-${Date.now()}`, user: currentUser })
}

export async function mockMe(): Promise<AuthResponse['user']> {
  return delay(currentUser)
}

export async function mockUpdatePassword(payload: UpdatePasswordPayload) {
  if (!payload.currentPassword || !payload.newPassword || !payload.confirmPassword) throw new Error('请完整填写当前密码、新密码和确认密码')
  if (payload.newPassword.length < 6) throw new Error('新密码至少 6 位')
  if (payload.newPassword !== payload.confirmPassword) throw new Error('两次新密码不一致')
  return delay({ ok: true })
}

export async function mockCurrentLabSheet() {
  return delay(ensureSheet())
}

export async function mockLabSheetByDate(date: string) {
  return delay(ensureSheet(date))
}

export async function mockCurrentParameters() {
  return delay(labParameters)
}

export async function mockUpdateParameters(parameters: LabParameter) {
  labParameters = { ...parameters, savedAt: dayjs().toISOString() }
  const sheet = ensureSheet()
  sheet.parameters = clone(labParameters)
  return delay(labParameters)
}

export async function mockAddSampleBlocks(sheetId: string, count: number) {
  const sheet = Array.from(labSheets.values()).find((item) => item.id === sheetId) || ensureSheet()
  const start = sheet.sampleBlocks.length + 1
  for (let i = 0; i < count; i += 1) {
    sheet.sampleBlocks.push(createEmptyBlock(start + i, sheet.parameters, sheet.date))
  }
  return delay(sheet)
}

export async function mockSaveSampleBlock(sheetId: string, block: SampleBlock) {
  const sheet = Array.from(labSheets.values()).find((item) => item.id === sheetId) || ensureSheet()
  const index = sheet.sampleBlocks.findIndex((item) => item.id === block.id)
  const nextBlock = {
    ...block,
    results: calculateSampleResults(block.inputs, block.parameterSnapshot)
  }
  if (index >= 0) sheet.sampleBlocks[index] = nextBlock
  return delay(nextBlock)
}

export async function mockLabHistory() {
  return delay(Array.from(labSheets.values()).map((sheet) => ({ id: sheet.id, date: sheet.date, readonly: sheet.readonly })))
}

export async function mockSearchCustomers(keyword: string) {
  const query = keyword.trim().toLowerCase()
  const data = query
    ? customers.filter((item) => `${item.name}${item.phone || ''}${item.wechat || ''}${item.wechatNickname || ''}`.toLowerCase().includes(query))
    : customers
  return delay(data)
}

export async function mockCreateCustomer(payload: CustomerPayload) {
  const customerName = payload.name?.trim() || payload.phone?.trim() || payload.wechat?.trim() || payload.wechatNickname?.trim()
  if (!customerName) throw new Error('请至少填写一项客户信息')
  const customer: Customer = {
    id: `c-${Date.now()}`,
    name: customerName,
    phone: payload.phone?.trim() || undefined,
    wechat: payload.wechat?.trim() || undefined,
    wechatNickname: payload.wechatNickname?.trim() || undefined,
    note: payload.note?.trim() || undefined
  }
  customers.unshift(customer)
  return delay(customer)
}

export async function mockSearchBlacklist(keyword = '') {
  const query = keyword.trim().toLowerCase()
  const data = query
    ? blacklist.filter((item) => `${item.phone || ''}${item.wechat || ''}${item.wechatNickname || ''}${item.other || ''}${item.note || ''}`.toLowerCase().includes(query))
    : blacklist
  return delay(data)
}

export async function mockCheckBlacklist(keyword: string): Promise<BlacklistCheckResult> {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return delay({ hit: false, records: [] })
  const tokens = normalized
    .split(/[\s,，、\n:：]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
  const records = blacklist.filter((item) => {
    const haystack = `${item.phone || ''} ${item.wechat || ''} ${item.wechatNickname || ''} ${item.other || ''} ${item.note || ''}`.toLowerCase()
    return tokens.some((token) => haystack.includes(token))
  })
  return delay({ hit: records.length > 0, records })
}

export async function mockCreateBlacklist(payload: BlacklistPayload) {
  const record: BlacklistRecord = {
    id: `b-${Date.now()}`,
    uploadedAt: dayjs().toISOString(),
    uploadedBy: currentUser.username,
    phone: payload.phone,
    wechat: payload.wechat,
    wechatNickname: payload.wechatNickname,
    amount: payload.amount ?? undefined,
    images: payload.images,
    other: payload.other,
    note: payload.note
  }
  blacklist = [record, ...blacklist]
  return delay(record)
}

export async function mockDeleteBlacklist(id: string) {
  const record = blacklist.find((item) => item.id === id)
  if (!record) throw new Error('黑名单记录不存在')
  if (record.uploadedBy !== currentUser.username) {
    throw new Error('只能删除自己上传的黑名单')
  }
  blacklist = blacklist.filter((item) => item.id !== id)
  return delay(record)
}

export async function mockFinanceByMonth(month: string) {
  return delay(financeEntries.filter((item) => item.paymentDate.startsWith(month)))
}

export async function mockCreateFinance(payload: FinancePayload) {
  const entry: FinanceEntry = { id: `f-${Date.now()}`, ...payload }
  financeEntries = [entry, ...financeEntries]
  return delay(entry)
}

export async function mockFinanceMonths() {
  const months = Array.from(new Set(financeEntries.map((item) => item.paymentDate.slice(0, 7))))
  return delay(months.sort().reverse())
}

function datesBetween(startDate: string, endDate: string) {
  const dates: string[] = []
  let cursor = dayjs(startDate)
  const end = dayjs(endDate)
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    dates.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }
  return dates
}

export async function mockSampleDetectionReport(range: DateRange): Promise<SampleDetectionReport> {
  const { startDate, endDate } = getReportRange(range.mode, range.date || todayInBeijing(), range.startDate, range.endDate)
  const rows = datesBetween(startDate, endDate).map((date) => {
    const sheet = ensureSheet(date)
    const validBlocks = sheet.sampleBlocks.filter((block) => isReportableSample(block.inputs))
    return {
      date,
      sampleCount: validBlocks.length,
      totalPrice: validBlocks.reduce((sum, block) => sum + (block.inputs.price || 0), 0)
    }
  })
  const totalSamples = rows.reduce((sum, row) => sum + row.sampleCount, 0)
  const totalPrice = rows.reduce((sum, row) => sum + row.totalPrice, 0)
  return delay({
    summary: {
      totalSamples,
      totalPrice,
      averageSamples: rows.length ? Number((totalSamples / rows.length).toFixed(2)) : 0,
      averagePrice: rows.length ? Number((totalPrice / rows.length).toFixed(2)) : 0
    },
    rows
  })
}

function classifyFinanceItem(item: string) {
  return financeCategoryRules.find((rule) => rule.name !== '其他' && rule.keywords.some((keyword) => item.includes(keyword))) || financeCategoryRules.at(-1)!
}

export async function mockFinanceReport(range: DateRange): Promise<FinanceReport> {
  const { startDate, endDate } = getReportRange(range.mode, range.date || todayInBeijing(), range.startDate, range.endDate)
  const dates = datesBetween(startDate, endDate)
  const entries = financeEntries.filter((item) => item.paymentDate >= startDate && item.paymentDate <= endDate)
  const rows = dates.map((date) => {
    const dayEntries = entries.filter((item) => item.paymentDate === date)
    const amount = dayEntries.reduce((sum, item) => sum + item.amount, 0)
    const mainCategory = dayEntries.length ? classifyFinanceItem(dayEntries[0].item).name : '无'
    return { date, amount, count: dayEntries.length, mainCategory }
  })
  const categoryMap = new Map<string, { amount: number; count: number; color: string }>()
  for (const entry of entries) {
    const category = classifyFinanceItem(entry.item)
    const current = categoryMap.get(category.name) || { amount: 0, count: 0, color: category.color }
    current.amount += entry.amount
    current.count += 1
    categoryMap.set(category.name, current)
  }
  const categories = Array.from(categoryMap.entries()).map(([category, value]) => ({ category, ...value }))
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0)
  const highest = rows.reduce((max, row) => (row.amount > max.amount ? row : max), { date: '无', amount: 0, count: 0, mainCategory: '无' })
  return delay({
    summary: {
      totalAmount,
      totalCount,
      averageAmount: rows.length ? Number((totalAmount / rows.length).toFixed(2)) : 0,
      highestExpenseDay: highest.date
    },
    rows,
    categories
  })
}

export async function mockFinanceCategories() {
  return delay(financeCategoryRules)
}

export async function mockUploadImages(files: File[]) {
  return delay(files.map((file) => URL.createObjectURL(file)))
}
