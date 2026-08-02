import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoginRegister from '@/views/auth/LoginRegister.vue'
import LabDataPage from '@/views/dashboard/LabDataPage.vue'
import LabReportPage from '@/views/dashboard/LabReportPage.vue'
import CoefficientCalculationPage from '@/views/dashboard/CoefficientCalculationPage.vue'
import StandardSampleCalculationPage from '@/views/dashboard/StandardSampleCalculationPage.vue'
import FinancePage from '@/views/dashboard/FinancePage.vue'
import FinanceIncomePage from '@/views/dashboard/FinanceIncomePage.vue'
import FinanceMonthlySettlementPage from '@/views/dashboard/FinanceMonthlySettlementPage.vue'
import FinancePrepaidAddPage from '@/views/dashboard/FinancePrepaidAddPage.vue'
import FinancePrepaidCustomersPage from '@/views/dashboard/FinancePrepaidCustomersPage.vue'
import FinanceUnsettledPage from '@/views/dashboard/FinanceUnsettledPage.vue'
import ReportPage from '@/views/dashboard/ReportPage.vue'
import BlacklistPage from '@/views/dashboard/BlacklistPage.vue'
import CustomerOverviewPage from '@/views/dashboard/CustomerOverviewPage.vue'
import MedicineInventoryStockPage from '@/views/dashboard/MedicineInventoryStockPage.vue'
import MedicineInventoryInboundPage from '@/views/dashboard/MedicineInventoryInboundPage.vue'
import MedicineInventoryOutboundPage from '@/views/dashboard/MedicineInventoryOutboundPage.vue'
import { useAccessGuardStore } from '@/stores/accessGuard'
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
        {
          path: 'data/standard-sample',
          name: 'standardSampleCalculation',
          component: StandardSampleCalculationPage,
          meta: { title: '标样计算', requiresAuth: true }
        },
        {
          path: 'data/coefficient',
          name: 'coefficientCalculation',
          component: CoefficientCalculationPage,
          meta: { title: '系数计算', requiresAuth: true }
        },
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
        { path: 'finance/prepaid', redirect: '/finance/prepaid/add' },
        {
          path: 'finance/prepaid/add',
          name: 'financePrepaidAdd',
          component: FinancePrepaidAddPage,
          meta: { title: '预存款', requiresAuth: true }
        },
        {
          path: 'finance/prepaid/customers',
          name: 'financePrepaidCustomers',
          component: FinancePrepaidCustomersPage,
          meta: { title: '预存款', requiresAuth: true }
        },
        { path: 'reports', name: 'reports', component: ReportPage, meta: { title: '报表', requiresAuth: true } },
        { path: 'medicine-inventory', redirect: '/medicine-inventory/stock' },
        {
          path: 'medicine-inventory/stock',
          name: 'medicineInventoryStock',
          component: MedicineInventoryStockPage,
          meta: { title: '药品库存', requiresAuth: true }
        },
        {
          path: 'medicine-inventory/inbound',
          name: 'medicineInventoryInbound',
          component: MedicineInventoryInboundPage,
          meta: { title: '药品入库', requiresAuth: true }
        },
        {
          path: 'medicine-inventory/outbound',
          name: 'medicineInventoryOutbound',
          component: MedicineInventoryOutboundPage,
          meta: { title: '药品出库', requiresAuth: true }
        },
        {
          path: 'customers-overview',
          name: 'customerOverview',
          component: CustomerOverviewPage,
          meta: { title: '客户总览', requiresAuth: true }
        },
        { path: 'blacklist', name: 'blacklist', component: BlacklistPage, meta: { title: '黑名单', requiresAuth: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/data' }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const redirect = resolveAuthRedirect({
    isLoggedIn: authStore.isLoggedIn,
    toPath: to.path,
    requiresAuth: to.matched.some((record) => record.meta.requiresAuth)
  })
  if (redirect) return redirect

  const accessGuard = useAccessGuardStore()
  if (accessGuard.isProtectedPath(to.path)) await accessGuard.loadSettings()
  if (accessGuard.requiresAccessForPath(to.path)) {
    accessGuard.requestAccess({
      title: getAccessGuardTitle(to.path),
      message: '请输入访问密码后进入该功能，验证通过后在设置的时间内可免输密码切换。',
      onSuccess: () => {
        void router.push(to.fullPath)
      }
    })
    return false
  }

  return true
})

function getAccessGuardTitle(path: string) {
  if (path.startsWith('/finance')) return '财务访问验证'
  if (path.startsWith('/medicine-inventory')) return '药品库存访问验证'
  if (path.startsWith('/reports')) return '报表访问验证'
  if (path.startsWith('/customers-overview')) return '客户总览访问验证'
  if (path.startsWith('/blacklist')) return '黑名单访问验证'
  return '访问验证'
}

export default router
