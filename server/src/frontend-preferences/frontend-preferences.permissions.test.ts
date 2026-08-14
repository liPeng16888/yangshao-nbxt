import { UserRole, type FrontendMenuPermission } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '../auth/current-user'
import { accessiblePreferenceSections, canAccessPreferenceSection } from './frontend-preferences.permissions'

function subUser(permissions: FrontendMenuPermission[]): CurrentUser {
  return {
    id: 'sub-1',
    account: 'sub-1',
    username: '子账号',
    role: UserRole.FRONTEND_SUB_USER,
    dataOwnerId: 'main-1',
    permissionVersion: 1,
    permissions,
    requiresAccessGuardPassword: true,
    isFrontendMainAccount: false,
    isFrontendSubAccount: true
  }
}

describe('frontend preference section permissions', () => {
  it('maps each section to the exact allowed leaf permissions', () => {
    expect(accessiblePreferenceSections(subUser(['DATA_MAIN']))).toEqual([
      'LAB_REPORT_SAMPLE_UNITS', 'LAB_ELEMENT_GROUPS'
    ])
    expect(canAccessPreferenceSection(subUser(['LAB_REPORT_IMAGE_TEMPLATE']), 'LAB_REPORT_TEMPLATE')).toBe(true)
    expect(canAccessPreferenceSection(subUser(['LAB_REPORT_IMAGE_TEMPLATE']), 'LAB_REPORT_SAMPLE_UNITS')).toBe(true)
    expect(canAccessPreferenceSection(subUser(['DATA_MAIN']), 'LAB_REPORT_SMS_TEMPLATE')).toBe(false)
  })

  it('allows a main account to access every section in declaration order', () => {
    expect(accessiblePreferenceSections({
      ...subUser([]),
      id: 'main-1',
      role: UserRole.FRONTEND_USER,
      isFrontendMainAccount: true,
      isFrontendSubAccount: false
    })).toEqual([
      'LAB_REPORT_TEMPLATE',
      'LAB_REPORT_SMS_TEMPLATE',
      'LAB_REPORT_SAMPLE_UNITS',
      'LAB_ELEMENT_GROUPS'
    ])
  })
})
