import 'reflect-metadata'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { ROLES_KEY } from '../auth/roles.decorator'
import { FRONTEND_PERMISSIONS_KEY } from '../auth/frontend-permission.decorator'
import { AdminLabTotalMonitorController, LabTotalMonitorController } from './lab-total-monitor.controller'

describe('total monitor API boundaries', () => {
  it('keeps the customer endpoint read-only and scoped to DATA_MAIN', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LabTotalMonitorController)).toBe('lab-total-monitor')
    expect(Reflect.getMetadata(ROLES_KEY, LabTotalMonitorController)).toEqual([UserRole.FRONTEND_USER])
    expect(Reflect.getMetadata(FRONTEND_PERMISSIONS_KEY, LabTotalMonitorController)).toEqual(['DATA_MAIN'])
    expect(Reflect.getMetadata(GUARDS_METADATA, LabTotalMonitorController)).toHaveLength(3)
    expect(Object.getOwnPropertyNames(LabTotalMonitorController.prototype)).toEqual(['constructor', 'config'])
  })
  it('requires authenticated backend roles for configuration writes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminLabTotalMonitorController)).toBe('admin/lab-total-monitor')
    expect(Reflect.getMetadata(ROLES_KEY, AdminLabTotalMonitorController)).toEqual([UserRole.ROOT_ADMIN, UserRole.SUB_ADMIN])
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminLabTotalMonitorController)).toHaveLength(2)
    expect(Reflect.getMetadata(PATH_METADATA, AdminLabTotalMonitorController.prototype.bulk)).toBe('bulk')
    expect(Reflect.getMetadata(METHOD_METADATA, AdminLabTotalMonitorController.prototype.bulk)).toBe(RequestMethod.POST)
  })
})
