import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA } from '@nestjs/common/constants'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { AdminMedicineInventoryController } from './admin-medicine-inventory.controller'
import { MedicineInventoryController } from './medicine-inventory.controller'
import { MedicineInventoryService } from './medicine-inventory.service'

const frontendUser: CurrentUser = {
  id: 'front-1',
  account: 'front-1',
  username: '前台一',
  role: UserRole.FRONTEND_USER
}

const subAdmin: CurrentUser = {
  id: 'admin-1',
  account: 'admin-1',
  username: '子管理员',
  role: UserRole.SUB_ADMIN
}

function createMedicineInventoryService() {
  return {
    listItems: vi.fn().mockResolvedValue([]),
    listMovements: vi.fn().mockResolvedValue([]),
    createInbound: vi.fn().mockResolvedValue({}),
    createOutbound: vi.fn().mockResolvedValue({}),
    createCorrection: vi.fn().mockResolvedValue({})
  } as unknown as MedicineInventoryService
}

describe('medicine inventory routes', () => {
  it('uses only the authenticated frontend account when listing items', async () => {
    const service = createMedicineInventoryService()
    const controller = new MedicineInventoryController(service)

    await controller.items(frontendUser, { medicineItemIds: 'item-1,item-2' } as never)

    expect(service.listItems).toHaveBeenCalledWith(['front-1'], ['item-1', 'item-2'])
  })

  it('uses the authenticated frontend account for writes even when the body includes another account', async () => {
    const service = createMedicineInventoryService()
    const controller = new MedicineInventoryController(service)
    const body = {
      frontendUserId: 'front-2',
      occurredOn: '2026-08-02',
      name: '盐酸',
      unit: 'BOTTLE',
      quantity: 1
    }

    await controller.createInbound(frontendUser, body as never)

    expect(service.createInbound).toHaveBeenCalledWith('front-1', {
      occurredOn: '2026-08-02',
      name: '盐酸',
      unit: 'BOTTLE',
      quantity: 1
    })
  })

  it('parses frontend movement filters before listing movements', async () => {
    const service = createMedicineInventoryService()
    const controller = new MedicineInventoryController(service)

    await controller.inbounds(frontendUser, {
      medicineItemIds: ['item-1,item-2', 'item-2'],
      startDate: '2026-08-01',
      endDate: '2026-08-02'
    } as never)

    expect(service.listMovements).toHaveBeenCalledWith(['front-1'], 'inbound', {
      medicineItemIds: ['item-1', 'item-2'],
      startDate: '2026-08-01',
      endDate: '2026-08-02'
    })
  })

  it('filters admin item queries through the allowed frontend account range', async () => {
    const service = createMedicineInventoryService()
    const adminAccess = {
      parseFrontendUserIds: vi.fn().mockReturnValue(['front-1', 'front-denied']),
      getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1'])
    }
    const controller = new AdminMedicineInventoryController(service, adminAccess as never)

    await controller.items(subAdmin, {
      frontendUserIds: 'front-1,front-denied',
      medicineItemIds: 'item-1,item-2'
    } as never)

    expect(adminAccess.parseFrontendUserIds).toHaveBeenCalledWith('front-1,front-denied')
    expect(adminAccess.getAllowedFrontendUserIds).toHaveBeenCalledWith(subAdmin, ['front-1', 'front-denied'])
    expect(service.listItems).toHaveBeenCalledWith(['front-1'], ['item-1', 'item-2'])
  })

  it('uses the allowed admin account range for inbound and outbound movement queries', async () => {
    const service = createMedicineInventoryService()
    const adminAccess = {
      parseFrontendUserIds: vi.fn().mockReturnValue(['front-1']),
      getAllowedFrontendUserIds: vi.fn().mockResolvedValue(['front-1'])
    }
    const controller = new AdminMedicineInventoryController(service, adminAccess as never)

    await controller.inbounds(subAdmin, { frontendUserIds: 'front-1', medicineItemIds: 'item-1' } as never)
    await controller.outbounds(subAdmin, { frontendUserIds: 'front-1', endDate: '2026-08-02' } as never)

    expect(service.listMovements).toHaveBeenNthCalledWith(1, ['front-1'], 'inbound', { medicineItemIds: ['item-1'] })
    expect(service.listMovements).toHaveBeenNthCalledWith(2, ['front-1'], 'outbound', { endDate: '2026-08-02' })
  })

  it('exposes only GET handlers on the admin controller', () => {
    const handlerNames = Object.getOwnPropertyNames(AdminMedicineInventoryController.prototype)
      .filter((name) => name !== 'constructor')

    expect(handlerNames).toEqual(['items', 'inbounds', 'outbounds'])
    expect(handlerNames.map((name) => Reflect.getMetadata(METHOD_METADATA, AdminMedicineInventoryController.prototype[name as keyof AdminMedicineInventoryController])))
      .toEqual([RequestMethod.GET, RequestMethod.GET, RequestMethod.GET])
  })
})
