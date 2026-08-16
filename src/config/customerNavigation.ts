import type { Component } from 'vue'
import { Box, Calendar, DataAnalysis, DocumentChecked, Memo, Money, User, Warning } from '@element-plus/icons-vue'
import {
  frontendNavigation,
  navigationForUser,
  type FrontendNavigationItem
} from '@/config/frontendNavigation'

export interface CustomerNavChild {
  key: string
  path: string
  label: string
  matchPrefixes?: readonly string[]
}

export interface CustomerNavSection extends Omit<CustomerNavChild, 'matchPrefixes'> {
  icon: Component
  children?: readonly CustomerNavChild[]
}

type NavigationUser = Parameters<typeof navigationForUser>[0]

const iconComponents = {
  data: DataAnalysis,
  report: Memo,
  attendance: Calendar,
  prepaid: Money,
  finance: Money,
  reports: DocumentChecked,
  medicine: Box,
  customers: User,
  blacklist: Warning
} as const

function keyForPath(path: string) {
  return path.replace(/^\//, '') || 'home'
}

function toCustomerSection(item: FrontendNavigationItem): CustomerNavSection {
  return {
    key: keyForPath(item.path),
    path: item.path,
    label: item.label,
    icon: iconComponents[item.icon],
    ...(item.children?.length
      ? {
          children: item.children.map((child) => ({
            key: keyForPath(child.path),
            path: child.path,
            label: child.label
          }))
        }
      : {})
  }
}

export const customerNavigation: readonly CustomerNavSection[] = frontendNavigation.map(toCustomerSection)

export function customerNavigationForUser(user: NavigationUser): readonly CustomerNavSection[] {
  return navigationForUser(user).map(toCustomerSection)
}

export function isCustomerNavChildActive(path: string, child: CustomerNavChild) {
  if (child.path === '/data') return path === '/data'
  return path === child.path || path.startsWith(`${child.path}/`) || (child.matchPrefixes || []).some((prefix) => path.startsWith(prefix))
}

export function findCustomerNavigation(
  path: string,
  navigation: readonly CustomerNavSection[] = customerNavigation
): { section: CustomerNavSection; activeChild?: CustomerNavChild } | undefined {
  const section = navigation.find((item) => path === item.path || path.startsWith(`${item.path}/`))
  if (!section) return undefined

  return {
    section,
    activeChild: section.children?.find((child) => isCustomerNavChildActive(path, child)) ?? section.children?.[0]
  }
}
