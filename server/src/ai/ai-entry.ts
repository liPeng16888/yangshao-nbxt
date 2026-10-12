import { BadRequestException } from '@nestjs/common'
import { type EntryContext, type Resource } from './ai.catalog'
export { entryMenuLevels } from './ai-menu-catalog'

export function normalizeEntryContext(context: EntryContext): EntryContext {
  return { ...context, action: context.action || (context.scene === 'samples' ? 'prepare_sample_registration' : 'create') }
}
export function entryScopeKey(context: EntryContext) {
  const scope = normalizeEntryContext(context)
  // Sequence is a convenience hint, not a permission to select a different menu/date.
  return JSON.stringify([scope.scene, scope.action, scope.date])
}
const dependencies: Partial<Record<Resource, Resource[]>> = {
  samples: ['customers'], schedules: ['employees'], attendance: ['employees'],
  leaves: ['employees', 'leaveTypes'], commissions: ['employees', 'commissionTypes'],
  bonuses: ['employees'], payrollAdjustments: ['payroll'], medicineOutbounds: ['medicine'],
  medicineInbounds: ['medicineNames'], financeDeletionRequests: ['expenses']
}
export function entryReadResources(context: EntryContext): Resource[] {
  return [context.scene, ...(dependencies[context.scene] || [])]
}
export function assertEntryWrite(context: EntryContext | undefined, resource: string, action: string, data?: Record<string, unknown>) {
  if (!context) return
  const scope = normalizeEntryContext(context)
  if (scope.scene !== resource || scope.action !== action) throw new BadRequestException('录入目标或操作与已选菜单不一致，请重新选择录入位置')
  if (data) assertEntryDate(scope, data)
}
export function assertEntryDate(context: EntryContext | undefined, data: Record<string, unknown>) {
  if (!context) return
  const keys = ['date', 'paymentDate', 'occurredOn', 'rechargeDate', 'startDate']
  if (keys.some(key => typeof data[key] === 'string' && data[key] !== context.date) || typeof data.month === 'string' && data.month !== context.date.slice(0, 7)) {
    throw new BadRequestException('数据日期与已确认的录入日期不一致，请先重新选择日期')
  }
}
