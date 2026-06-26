import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoginRegister from '@/views/auth/LoginRegister.vue'
import LabDataPage from '@/views/dashboard/LabDataPage.vue'
import LabReportPage from '@/views/dashboard/LabReportPage.vue'
import FinancePage from '@/views/dashboard/FinancePage.vue'
import FinanceIncomePage from '@/views/dashboard/FinanceIncomePage.vue'
import FinanceMonthlySettlementPage from '@/views/dashboard/FinanceMonthlySettlementPage.vue'
import FinanceUnsettledPage from '@/views/dashboard/FinanceUnsettledPage.vue'
import ReportPage from '@/views/dashboard/ReportPage.vue'
import BlacklistPage from '@/views/dashboard/BlacklistPage.vue'
import { useAuthStore } from '@/stores/auth'
import { resolveAuthRedirect } from './guards'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/data' },
    { path: '/login', name: 'login', component: LoginRegister },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: 'data', name: 'data', component: LabDataPage, meta: { title: '数据计算', requiresAuth: true } },
        { path: 'lab-report', redirect: '/lab-report/image-template' },
        {
          path: 'lab-report/image-template',
          name: 'labReportImageTemplate',
          component: LabReportPage,
          meta: { title: '化验报告', requiresAuth: true }
        },
        {
          path: 'lab-report/sms-template',
          name: 'labReportSmsTemplate',
          component: LabReportPage,
          meta: { title: '化验报告', requiresAuth: true }
        },
        { path: 'finance', redirect: '/finance/expenses' },
        { path: 'finance/expenses', name: 'financeExpenses', component: FinancePage, meta: { title: '支出账单', requiresAuth: true } },
        { path: 'finance/income', name: 'financeIncome', component: FinanceIncomePage, meta: { title: '收入账单', requiresAuth: true } },
        { path: 'finance/unsettled', name: 'financeUnsettled', component: FinanceUnsettledPage, meta: { title: '未结款', requiresAuth: true } },
        {
          path: 'finance/monthly-settlement',
          name: 'financeMonthlySettlement',
          component: FinanceMonthlySettlementPage,
          meta: { title: '月结款', requiresAuth: true }
        },
        { path: 'reports', name: 'reports', component: ReportPage, meta: { title: '报表', requiresAuth: true } },
        { path: 'blacklist', name: 'blacklist', component: BlacklistPage, meta: { title: '黑名单', requiresAuth: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/data' }
  ]
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  const redirect = resolveAuthRedirect({
    isLoggedIn: authStore.isLoggedIn,
    toPath: to.path,
    requiresAuth: to.matched.some((record) => record.meta.requiresAuth)
  })
  return redirect || true
})

export default router
