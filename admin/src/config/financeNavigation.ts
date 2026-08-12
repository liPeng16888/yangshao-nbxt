export type FinanceGroupId = 'income' | 'monthly'

export type FinancePageId =
  | 'income'
  | 'expenses'
  | 'unsettled'
  | 'monthlyDaily'
  | 'monthlyBills'
  | 'monthlyCustomers'

export interface FinanceNavigationPage {
  path: string
  label: string
  page: FinancePageId
}

export interface FinanceNavigationGroup {
  id: FinanceGroupId
  label: string
  path: string
  children: FinanceNavigationPage[]
}

export const financeNavigationGroups: FinanceNavigationGroup[] = [
  {
    id: 'income',
    label: '收支账单',
    path: '/finance/income',
    children: [
      { path: '/finance/income', label: '收入账单', page: 'income' },
      { path: '/finance/expenses', label: '支出账单', page: 'expenses' },
      { path: '/finance/unsettled', label: '未结款', page: 'unsettled' }
    ]
  },
  {
    id: 'monthly',
    label: '月结款明细',
    path: '/finance/monthly/daily',
    children: [
      { path: '/finance/monthly/daily', label: '月结款每日明细', page: 'monthlyDaily' },
      { path: '/finance/monthly/bills', label: '月结款账单明细', page: 'monthlyBills' },
      { path: '/finance/monthly/customers', label: '月结客户信息收录', page: 'monthlyCustomers' }
    ]
  }
]

export const defaultFinanceRoute = financeNavigationGroups[0].children[0]

export function resolveFinanceRoute(path: string): { group: FinanceGroupId; page: FinancePageId } {
  const match = financeNavigationGroups
    .flatMap((group) => group.children.map((child) => ({ group: group.id, page: child.page, path: child.path })))
    .find((item) => item.path === path)

  return match
    ? { group: match.group, page: match.page }
    : { group: 'income', page: 'income' }
}
