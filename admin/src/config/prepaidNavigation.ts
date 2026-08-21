export type SharedPrepaidAdminPage = 'recharges' | 'members' | 'consumptions' | 'settlements'

export interface SharedPrepaidNavigationItem {
  path: string
  label: string
  page: SharedPrepaidAdminPage
}

export const prepaidNavigation: SharedPrepaidNavigationItem[] = [
  { path: '/shared-prepaid/recharges', label: '预存款充值', page: 'recharges' },
  { path: '/shared-prepaid/customers', label: '预存款客户', page: 'members' },
  { path: '/shared-prepaid/consumptions', label: '消费明细', page: 'consumptions' },
  { path: '/shared-prepaid/settlements', label: '转账结算', page: 'settlements' }
]

export const defaultPrepaidRoute = prepaidNavigation[0]

export function resolvePrepaidPage(path: string): SharedPrepaidAdminPage {
  return prepaidNavigation.find((item) => item.path === path)?.page || 'recharges'
}
