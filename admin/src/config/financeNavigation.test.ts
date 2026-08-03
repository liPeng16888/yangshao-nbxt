import { describe, expect, it } from 'vitest'
import { financeNavigationGroups, resolveFinanceRoute } from './financeNavigation'

describe('finance navigation', () => {
  it('groups every financial page under one of the three sidebar branches', () => {
    expect(financeNavigationGroups.map((group) => group.label)).toEqual(['收支账单', '月结款明细', '预存款明细'])
    expect(financeNavigationGroups.flatMap((group) => group.children.map((child) => child.label))).toEqual([
      '收入账单', '支出账单', '未结款',
      '月结款每日明细', '月结款账单明细', '月结客户信息收录',
      '预存款添加记录', '预存款每日明细', '预存款客户'
    ])
  })

  it('redirects the finance root to the income page and resolves a page to its branch', () => {
    expect(resolveFinanceRoute('/finance')).toEqual({ group: 'income', page: 'income' })
    expect(resolveFinanceRoute('/finance/monthly/bills')).toEqual({ group: 'monthly', page: 'monthlyBills' })
    expect(resolveFinanceRoute('/finance/prepaid/customers')).toEqual({ group: 'prepaid', page: 'prepaidCustomers' })
  })
})
