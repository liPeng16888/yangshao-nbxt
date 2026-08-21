import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { AdminDataService } from '../admin/data.service'
import { ReportsController } from '../reports/reports.controller'

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '前台一',
  role: UserRole.FRONTEND_USER,
  dataOwnerId: 'front-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: true, isFrontendSubAccount: false
}

const rootAdmin: CurrentUser = {
  id: 'root-1',
  account: 'root',
  username: '主账号',
  role: UserRole.ROOT_ADMIN,
  dataOwnerId: 'root-1', permissionVersion: 1, permissions: [], requiresAccessGuardPassword: true,
  isFrontendMainAccount: false, isFrontendSubAccount: false
}

describe('customer overview routes', () => {
  it('uses only the authenticated frontend account and removes admin-only fields', async () => {
    const getRows = vi.fn().mockResolvedValue([
      {
        frontendUserId: 'front-1',
        frontendUserName: '前台一',
        customerKey: 'text:客户甲',
        customer: '客户甲',
        customerDisplay: '客户甲',
        sampleCount: 1,
        totalAmount: 20,
        firstDetectionDate: '2026-07-01',
        lastDetectionDate: '2026-07-01'
      }
    ])
    const controller = new ReportsController({} as never, { getRows } as never)

    const result = await controller.customerOverview(frontendUser)

    expect(getRows).toHaveBeenCalledWith(['front-1'])
    expect(result[0]).not.toHaveProperty('frontendUserId')
    expect(result[0]).not.toHaveProperty('frontendUserName')
  })

  it('filters requested frontend accounts through admin access before loading rows', async () => {
    const getAllowedFrontendUserIds = vi.fn().mockResolvedValue(['front-1'])
    const parseFrontendUserIds = vi.fn().mockReturnValue(['front-1', 'front-denied'])
    const getRows = vi.fn().mockResolvedValue([])
    const service = new AdminDataService(
      {} as never,
      { getAllowedFrontendUserIds, parseFrontendUserIds } as never,
      { getRows } as never
    )

    await service.customerOverview(rootAdmin, { frontendUserIds: 'front-1,front-denied' })

    expect(parseFrontendUserIds).toHaveBeenCalledWith('front-1,front-denied')
    expect(getAllowedFrontendUserIds).toHaveBeenCalledWith(rootAdmin, ['front-1', 'front-denied'])
    expect(getRows).toHaveBeenCalledWith(['front-1'])
  })
})
