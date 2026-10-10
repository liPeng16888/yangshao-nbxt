import { ForbiddenException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { LabTotalMonitorService } from './lab-total-monitor.service'
import { AdminAccessService } from '../admin/admin-access.service'

const rule = { id: 'r1', name: '低铁', ironMin: 5, ironMax: 10, totalMin: 80.5, totalMax: 82.5, enabled: true }
const user = { id: 'admin-1', role: UserRole.SUB_ADMIN, dataOwnerId: 'admin-1' } as CurrentUser
const row = { frontendUserId: 'main-1', version: 1, rules: [rule], updatedAt: new Date('2026-10-10T12:00:00Z') }
describe('LabTotalMonitorService', () => {
  let db: any, access: any, realtime: any, service: LabTotalMonitorService
  beforeEach(() => {
    const table = { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ ...row, version: 2 }) }
    db = { labTotalMonitorSetting: table, user: { findUnique: vi.fn().mockResolvedValue({ role: UserRole.FRONTEND_USER, deletedAt: null }) },
      $transaction: vi.fn(async (fn: any) => fn({ labTotalMonitorSetting: table })) }
    access = { getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['main-1']) }
    realtime = { publish: vi.fn() }; service = new LabTotalMonitorService(db, access, realtime)
  })
  it('reads only the authenticated parent for a frontend subaccount', async () => {
    await service.frontendConfig({ ...user, id: 'child-1', role: UserRole.FRONTEND_SUB_USER, dataOwnerId: 'main-1' })
    expect(db.labTotalMonitorSetting.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { frontendUserId: 'main-1' } }))
  })
  it('rejects unauthorized admin accounts before reading or writing configuration', async () => {
    access.getAllowedFrontendUserIds.mockRejectedValue(new ForbiddenException())
    await expect(service.adminConfig(user, 'other-main')).rejects.toThrow(ForbiddenException)
    await expect(service.save(user, 'other-main', { rules: [rule], baseVersion: 0 })).rejects.toThrow(ForbiddenException)
    expect(db.labTotalMonitorSetting.findUnique).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects subaccounts/deleted identities as configuration owners', async () => {
    db.user.findUnique.mockResolvedValue({ role: UserRole.FRONTEND_SUB_USER, deletedAt: null })
    await expect(service.save(user, 'child-1', { rules: [rule], baseVersion: 0 })).rejects.toThrow('主账号不存在')
  })
  it('persists multiple indicators for one authorized owner and notifies that frontend', async () => {
    const rules = [rule, { ...rule, id: 'r2', ironMin: 11, ironMax: 20 }]
    const result = await service.save(user, 'main-1', { rules, baseVersion: 0 })
    expect(access.getAllowedFrontendUserIds).toHaveBeenCalledWith(user, ['main-1'])
    expect(db.labTotalMonitorSetting.create).toHaveBeenCalledWith(expect.objectContaining({ data: { frontendUserId: 'main-1', rules, updatedById: 'admin-1' } }))
    expect(result).toEqual({ ...row, updatedAt: row.updatedAt.toISOString() })
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({ dataOwnerId: 'main-1', module: 'lab-total-monitor', changedById: 'admin-1' }))
  })
  it('uses an atomic version condition and refuses stale saves without notifying', async () => {
    db.labTotalMonitorSetting.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.save(user, 'main-1', { rules: [], baseVersion: 1 })).rejects.toThrow('其他管理员')
    expect(db.labTotalMonitorSetting.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { frontendUserId: 'main-1', version: 1 } }))
    expect(realtime.publish).not.toHaveBeenCalled()
  })
  it('rejects duplicate first-save races and invalid rules', async () => {
    db.labTotalMonitorSetting.create.mockRejectedValue({ code: 'P2002' })
    await expect(service.save(user, 'main-1', { rules: [rule], baseVersion: 0 })).rejects.toThrow('其他管理员创建')
    db.$transaction.mockClear()
    await expect(service.save(user, 'main-1', { rules: [{ ...rule, totalMin: 90 }], baseVersion: 1 })).rejects.toThrow('下限')
    await expect(service.save(user, 'main-1', { rules: [], baseVersion: -1 })).rejects.toThrow('版本')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  const bulkBody = { sourceFrontendUserId: 'main-1', sourceVersion: 1, ruleIds: ['r1'], frontendUserIds: ['target-1', 'target-2'] }
  const record = (id: string, rules: any[], version = 1) => ({ frontendUserId: id, rules, version, updatedAt: row.updatedAt })
  it('preflights every requested account before starting any batch writes', async () => {
    access.getAllowedFrontendUserIds.mockRejectedValue(new ForbiddenException())
    await expect(service.bulkAppend(user, bulkBody)).rejects.toThrow(ForbiddenException)
    expect(access.getAllowedFrontendUserIds).toHaveBeenCalledWith(user, ['main-1', 'target-1', 'target-2'])
    expect(db.labTotalMonitorSetting.findUnique).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('appends to eligible accounts while skipping overlapping targets without overwriting', async () => {
    const records: Record<string, any> = { 'main-1': record('main-1', [rule]), 'target-2': record('target-2', [{ ...rule, id: 'other', totalMax: 85 }]) }
    db.labTotalMonitorSetting.findUnique.mockImplementation(async ({ where }: any) => records[where.frontendUserId] || null)
    db.labTotalMonitorSetting.create.mockImplementation(async ({ data }: any) => ({ ...data, version: 1, updatedAt: row.updatedAt }))
    const result = await service.bulkAppend(user, bulkBody)
    expect(result.map((item) => item.status)).toEqual(['applied', 'skipped'])
    expect(result[1].message).toContain('重叠')
    expect(db.labTotalMonitorSetting.create).toHaveBeenCalledTimes(1)
    expect(db.labTotalMonitorSetting.create.mock.calls[0][0].data.frontendUserId).toBe('target-1')
    expect(realtime.publish).toHaveBeenCalledTimes(1)
  })
  it('does not write or notify accounts that already contain identical indicators', async () => {
    db.labTotalMonitorSetting.findUnique.mockImplementation(async ({ where }: any) => record(where.frontendUserId, [{ ...rule, id: where.frontendUserId === 'main-1' ? 'r1' : 'local-rule' }]))
    const result = await service.bulkAppend(user, bulkBody)
    expect(result.every((item) => item.status === 'unchanged' && item.duplicateCount === 1)).toBe(true)
    expect(db.$transaction).not.toHaveBeenCalled(); expect(realtime.publish).not.toHaveBeenCalled()
  })
  it('refuses stale source versions or missing selected rules before any target writes', async () => {
    db.labTotalMonitorSetting.findUnique.mockResolvedValue({ ...row, version: 2 })
    await expect(service.bulkAppend(user, bulkBody)).rejects.toThrow('来源账号')
    db.labTotalMonitorSetting.findUnique.mockResolvedValue(row)
    await expect(service.bulkAppend(user, { ...bulkBody, ruleIds: ['missing'] })).rejects.toThrow('来源规则不存在')
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('reports a target version conflict and continues with other targets', async () => {
    db.labTotalMonitorSetting.findUnique.mockImplementation(async ({ where }: any) => where.frontendUserId === 'main-1' ? row : record(where.frontendUserId, [], 1))
    db.labTotalMonitorSetting.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    db.labTotalMonitorSetting.findUniqueOrThrow.mockResolvedValue(record('target-2', [rule], 2))
    const result = await service.bulkAppend(user, bulkBody)
    expect(result.map((item) => item.status)).toEqual(['conflict', 'applied'])
    expect(realtime.publish).toHaveBeenCalledTimes(1)
  })
})

describe('admin owner authorization', () => {
  it('allows a delegated admin only its assigned owner IDs', async () => {
    const db = { subAdminFrontendPermission: { findMany: vi.fn().mockResolvedValue([{ frontendUserId: 'main-1' }]) } }
    const service = new AdminAccessService(db as never)
    expect(await service.getAllowedFrontendUserIds(user, ['main-1'])).toEqual(['main-1'])
    await expect(service.getAllowedFrontendUserIds(user, ['main-2'])).rejects.toThrow(ForbiddenException)
  })
})
