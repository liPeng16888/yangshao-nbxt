import type { Resource } from '../../server/src/ai/ai-menu-catalog'
export type EntryScene = Resource
export type EntryPaymentStatus = '' | '已结款' | '未结款' | '月结款' | '预存款'
export interface EntryRow { sequence: string; customerName: string; customerId?: string; createCustomer: boolean; price: number | null; paymentStatus: EntryPaymentStatus }
export interface EntryContext { scene: EntryScene; action?: string; date: string; sequence?: string }
export interface EntryInputSchema { type?: string; enum?: (string | number | boolean)[]; const?: unknown; format?: string; minimum?: number; maximum?: number; minItems?: number; maxItems?: number; anyOf?: EntryInputSchema[]; properties?: Record<string, EntryInputSchema>; required?: string[]; items?: EntryInputSchema; description?: string }
export interface EntryOperation { action: string; label: string; requiresId: boolean; input: EntryInputSchema }
export interface EntryOption { key: EntryScene; label: string; levels: string[]; path: string; writeFields: {key:string;label:string}[]; operations: EntryOperation[]; note?: string }
export function entryScopeKey(scope: EntryContext) { return JSON.stringify([scope.scene,scope.action,scope.date]) }
export const entryReferenceResources: Record<string,EntryScene> = { employeeId:'employees',leaveTypeId:'leaveTypes',commissionTypeId:'commissionTypes',medicineItemId:'medicine',payrollItemId:'payroll',sourceId:'expenses' }
export function entryRecordLabel(row: Record<string,unknown>) {
  const inputs=row.inputs as Record<string,unknown>|undefined
  const parts=[row.name,row.employeeName,row.employeeNumber,row.customer,row.item,row.date,row.occurredOn,row.month,inputs?.sequence,inputs?.sampleNumber,inputs?.customerText,row.rowKind].filter(value=>value!==undefined&&value!==null&&value!=='')
  return parts.map(String).join(' · ') || `记录 ${String(row.id || '')}`
}
export interface EntryPageContext { menu: string; date?: string; sequence?: string }
export function todayInBeijing() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) }
export function nextSequence(value: string) { return /^\d+$/.test(value) ? String(Number(value)+1).padStart(value.length,'0') : '' }

/** An explicit four-column grammar avoids a model confusing sample sequence with customer ID. */
export function parseEntryRows(text: string, defaults?: { customerName?: string; paymentStatus?: EntryPaymentStatus }): EntryRow[] {
  const lines = text.split(/[\n；;]/).map(line=>line.trim()).filter(Boolean)
  if (!lines.length || lines.length > 5) throw new Error('每批填写1至5条，每行一个样品。')
  const rows = lines.map(line => {
    const normalized = line.replace(/^(?:编号|序号)\s*/,'').replace(/付款客户(?:录入|为|是)?/,' ').replace(/(?:样品)?金额(?:为|是)?/,' ').replace(/费用状态(?:为|是)?/,' ').replace(/[、，,\t]/g,' ').replace(/元(?=\s|$)/g,'').trim()
    const full = normalized.match(/^(\S+)\s+(.+?)\s+(\d+(?:\.\d{1,2})?)\s+(已结款|未结款|月结款|预存款)$/)
    const short = normalized.match(/^(\S+)\s+(\d+(?:\.\d{1,2})?)$/)
    const sequence = full?.[1] || short?.[1]
    const customerName = full?.[2] || (short && defaults?.customerName)
    const amount = full?.[3] || short?.[2]
    const status = full?.[4] || (short && defaults?.paymentStatus)
    if (!sequence || !customerName || !amount || !status) throw new Error(`无法解析「${line}」。请用「001 小张 60 月结款」；金额不要省略。`)
    const price = Number(amount)
    if (!Number.isFinite(price) || price > 9999999999.99) throw new Error('样品金额超出允许范围。')
    return {sequence,customerName:customerName.trim(),price,paymentStatus:status as EntryPaymentStatus,createCustomer:false}
  })
  const ids = rows.map(row=>/^\d+$/.test(row.sequence)?row.sequence.padStart(3,'0'):row.sequence)
  if (new Set(ids).size !== rows.length) throw new Error('同一批次不能重复填写样品序号。')
  return rows
}
