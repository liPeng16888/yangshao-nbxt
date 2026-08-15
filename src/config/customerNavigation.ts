import type { Component } from 'vue'
import { Box, Calendar, DataAnalysis, DocumentChecked, Memo, Money, User, Warning } from '@element-plus/icons-vue'

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

const navigationMap = [
  {
    key: 'data',
    path: '/data',
    label: '数据计算',
    icon: DataAnalysis,
    children: [
      { key: 'data-entry', path: '/data', label: '数据计算' },
      { key: 'standard-sample', path: '/data/standard-sample', label: '标样计算' },
      { key: 'coefficient', path: '/data/coefficient', label: '系数计算' }
    ]
  },
  {
    key: 'lab-report',
    path: '/lab-report',
    label: '化验报告',
    icon: Memo,
    children: [
      { key: 'image-template', path: '/lab-report/image-template', label: '化验报告图片模板' },
      { key: 'sms-template', path: '/lab-report/sms-template', label: '化验短信生成模板' }
    ]
  },
  {
    key: 'employee-attendance',
    path: '/employee-attendance',
    label: '员工考勤',
    icon: Calendar,
    children: [
      { key: 'schedules', path: '/employee-attendance/schedules', label: '排班考勤概览' },
      { key: 'employees', path: '/employee-attendance/employees', label: '员工档案' },
      { key: 'records', path: '/employee-attendance/records', label: '考勤记录' },
      { key: 'leave', path: '/employee-attendance/leave', label: '请假管理' },
      { key: 'compensation', path: '/employee-attendance/compensation', label: '提成与奖金' },
      { key: 'payroll', path: '/employee-attendance/payroll', label: '工资统计' }
    ]
  },
  {
    key: 'finance',
    path: '/finance',
    label: '财务',
    icon: Money,
    children: [
      { key: 'expenses', path: '/finance/expenses', label: '支出账单' },
      { key: 'income', path: '/finance/income', label: '收入账单' },
      { key: 'unsettled', path: '/finance/unsettled', label: '未结款' },
      { key: 'monthly-settlement', path: '/finance/monthly-settlement', label: '月结款' },
      { key: 'prepaid', path: '/finance/prepaid/add', label: '预存款', matchPrefixes: ['/finance/prepaid/'] }
    ]
  },
  { key: 'reports', path: '/reports', label: '报表', icon: DocumentChecked },
  {
    key: 'medicine-inventory',
    path: '/medicine-inventory',
    label: '药品库存',
    icon: Box,
    children: [
      { key: 'stock', path: '/medicine-inventory/stock', label: '药品库存' },
      { key: 'inbound', path: '/medicine-inventory/inbound', label: '药品入库' },
      { key: 'outbound', path: '/medicine-inventory/outbound', label: '药品出库' }
    ]
  },
  { key: 'customers-overview', path: '/customers-overview', label: '客户总览', icon: User },
  { key: 'blacklist', path: '/blacklist', label: '黑名单', icon: Warning }
] as const satisfies readonly CustomerNavSection[]

export const customerNavigation = navigationMap

export function isCustomerNavChildActive(path: string, child: CustomerNavChild) {
  if (child.path === '/data') return path === '/data'
  return path === child.path || (child.matchPrefixes || []).some((prefix) => path.startsWith(prefix))
}

export function findCustomerNavigation(path: string): { section: CustomerNavSection; activeChild?: CustomerNavChild } | undefined {
  const section = customerNavigation.find((item) => path === item.path || path.startsWith(`${item.path}/`)) as CustomerNavSection | undefined
  if (!section) return undefined

  return {
    section,
    activeChild: section.children?.find((child) => isCustomerNavChildActive(path, child)) ?? section.children?.[0]
  }
}
