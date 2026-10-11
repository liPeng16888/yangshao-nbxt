import { BadRequestException, ConflictException } from '@nestjs/common'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { businessDateInBeijing } from '../common/date'
import { dateSchema, resourceSchema, type Resource } from './ai.catalog'

export const AI_PAGE_SIZE = 50
export const AI_SCAN_BATCH_SIZE = 200
export const AI_MAX_SCAN_ROWS = 100_000
export class AiQueryInputError extends BadRequestException {}
export class AiQueryChangedError extends ConflictException {}
export interface AiQueryOptions { startDate?: string; endDate?: string; cursor?: string }
export interface AiQueryScope { startDate?: string; endDate?: string; wholeMonths: boolean }

const input = z.object({ resource: resourceSchema, date: dateSchema.optional(), startDate: dateSchema.optional(), endDate: dateSchema.optional(), keyword: z.string().trim().max(100).default('') }).strict()
  .refine(v => Boolean(v.startDate) === Boolean(v.endDate), '开始和结束日期必须同时填写')
  .refine(v => !(v.date && v.startDate), '日期和日期范围不能同时填写')
  .refine(v => !v.startDate || v.startDate <= v.endDate!, '开始日期不能晚于结束日期')
  .refine(v => !v.startDate || (Date.parse(v.endDate!) - Date.parse(v.startDate)) / 86400000 < 366, '单次日期范围最多 366 天，请分段统计')
export const businessSummarySchema = input
export const businessQuerySchema = input.safeExtend({ cursor: z.string().min(1).max(2000).optional() })

const monthly = new Set<Resource>(['expenses','schedules','attendance','leaves','commissions','bonuses','prepaidRecharges','prepaidConsumptions','income','monthlyDaily','reportsSamples','reportsFinance','medicineInbounds','medicineOutbounds','abnormal'])
const wholeMonths = new Set<Resource>(['payroll','payrollAdjustments','monthly','monthlyCustomers'])
const rangeOnly = new Set<Resource>(['unsettled','sampleChangeRequests'])
export function monthEnd(date: string) {
  const end=new Date(date+'T00:00:00Z')
  end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0)
  return end.toISOString().slice(0,10)
}
export function queryScope(resource: Resource, date?: string, options: AiQueryOptions = {}): AiQueryScope {
  const parsed = businessSummarySchema.safeParse({ resource, date, startDate: options.startDate, endDate: options.endDate })
  if (!parsed.success) throw new AiQueryInputError('查询日期无效：填写一个日期或完整日期范围，范围最多 366 天')
  const day = date || businessDateInBeijing()
  const scope: AiQueryScope = { wholeMonths: wholeMonths.has(resource) }
  if (options.startDate) {
    if (resource !== 'samples' && !monthly.has(resource) && !wholeMonths.has(resource) && !rangeOnly.has(resource)) throw new AiQueryInputError('此菜单没有日期范围查询，不能把全库结果当作指定日期的统计')
    scope.startDate = options.startDate; scope.endDate = options.endDate
  } else if (resource === 'samples') { scope.startDate = day; scope.endDate = day }
  else if (monthly.has(resource) || wholeMonths.has(resource)) { scope.startDate = `${day.slice(0,7)}-01`; scope.endDate = monthEnd(day) }
  if (scope.wholeMonths && scope.startDate) { scope.startDate = `${scope.startDate.slice(0,7)}-01`; scope.endDate = monthEnd(scope.endDate!) }
  if(scope.startDate&&(Date.parse(scope.endDate!)-Date.parse(scope.startDate))/86400000>=366)throw new AiQueryInputError('按整月展开后的范围超过 366 天，请按日历年或分段查询')
  return scope
}
export function scopeMonths(scope: AiQueryScope) {
  if (!scope.startDate || !scope.endDate) return []
  const months: string[] = []
  const current = new Date(`${scope.startDate.slice(0,7)}-01T00:00:00Z`)
  while (current.toISOString().slice(0,7) <= scope.endDate.slice(0,7)) { months.push(current.toISOString().slice(0,7)); current.setUTCMonth(current.getUTCMonth() + 1) }
  return months
}

// No business values or access tokens in a cursor. A restart invalidates development cursors.
const fallbackKey = randomBytes(32)
const signingKey = () => process.env.JWT_SECRET || fallbackKey
type PageCursor = { v: 1; scope: string; data: string; offset: number; expires: number }
export function encodePageCursor(scope: string, data: string, offset: number) {
  const payload = Buffer.from(JSON.stringify({ v: 1, scope, data, offset, expires: Date.now() + 15 * 60_000 })).toString('base64url')
  return `${payload}.${createHmac('sha256', signingKey()).update(payload).digest('base64url')}`
}
export function decodePageCursor(raw: string | undefined, scope: string): PageCursor | undefined {
  if (!raw) return undefined
  try {
    if (raw.length > 2000) throw new Error()
    const [payload, signature, extra] = raw.split('.')
    const actual = Buffer.from(signature || '', 'base64url')
    const expected = createHmac('sha256', signingKey()).update(payload || '').digest()
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error()
    const cursor = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PageCursor
    if (cursor.v !== 1 || cursor.scope !== scope || !/^[a-f0-9]{64}$/.test(cursor.data) || !Number.isInteger(cursor.offset) || cursor.offset < 1 || cursor.offset > AI_MAX_SCAN_ROWS || !Number.isFinite(cursor.expires) || cursor.expires <= Date.now()) throw new Error()
    return cursor
  } catch { throw new AiQueryChangedError('下一页标记无效、过期或查询权限已变化，请重新查询第一页') }
}
