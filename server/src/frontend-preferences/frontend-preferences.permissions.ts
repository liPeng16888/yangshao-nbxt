import { BadRequestException } from '@nestjs/common'
import {
  FrontendPreferenceSection,
  type FrontendMenuPermission
} from '@prisma/client'
import type { CurrentUser } from '../auth/current-user'

export const SECTION_PERMISSIONS = {
  LAB_REPORT_TEMPLATE: ['LAB_REPORT_IMAGE_TEMPLATE'],
  LAB_REPORT_SMS_TEMPLATE: ['LAB_REPORT_SMS_TEMPLATE'],
  LAB_REPORT_SAMPLE_UNITS: ['DATA_MAIN', 'LAB_REPORT_IMAGE_TEMPLATE'],
  LAB_ELEMENT_GROUPS: ['DATA_MAIN']
} as const satisfies Record<FrontendPreferenceSection, readonly FrontendMenuPermission[]>

const PREFERENCE_SECTIONS = [
  FrontendPreferenceSection.LAB_REPORT_TEMPLATE,
  FrontendPreferenceSection.LAB_REPORT_SMS_TEMPLATE,
  FrontendPreferenceSection.LAB_REPORT_SAMPLE_UNITS,
  FrontendPreferenceSection.LAB_ELEMENT_GROUPS
] as const

export function canAccessPreferenceSection(user: CurrentUser, section: FrontendPreferenceSection) {
  if (user.isFrontendMainAccount) return true
  return SECTION_PERMISSIONS[section].some((permission) => user.permissions.includes(permission))
}

export function accessiblePreferenceSections(user: CurrentUser): FrontendPreferenceSection[] {
  return PREFERENCE_SECTIONS.filter((section) => canAccessPreferenceSection(user, section))
}

export function parsePreferenceSection(section: string): FrontendPreferenceSection {
  if ((PREFERENCE_SECTIONS as readonly string[]).includes(section)) {
    return section as FrontendPreferenceSection
  }
  throw new BadRequestException('配置分区无效')
}
