import { createRouter, createWebHistory } from 'vue-router'
import { ADMIN_TOKEN_KEY, currentAdminUser, useAdminMocks } from './api'
import LoginPage from './views/LoginPage.vue'
import FeishuVerifyPage from '../../shared/ai/FeishuVerifyPage.vue'
import { rememberFeishuReturn, feishuLoginReturn } from '../../shared/ai/feishuReturn'
import AdminLayout from './views/AdminLayout.vue'
import DataStatisticsPage from './views/DataStatisticsPage.vue'
import FinanceReportsPage from './views/FinanceReportsPage.vue'
import AbnormalRecordsPage from './views/AbnormalRecordsPage.vue'
import AccountManagementPage from './views/AccountManagementPage.vue'
import BlacklistPage from './views/BlacklistPage.vue'
import CustomerOverviewPage from './views/CustomerOverviewPage.vue'
import MedicineInventoryPage from './views/MedicineInventoryPage.vue'
import TodoPage from './views/TodoPage.vue'
import EmployeeAttendancePage from './views/EmployeeAttendancePage.vue'
import SharedPrepaidReadOnlyPage from './views/SharedPrepaidReadOnlyPage.vue'
import AiSettingsPage from './views/AiSettingsPage.vue'
import LabTotalMonitorPage from './views/LabTotalMonitorPage.vue'
import { financeNavigationGroups } from './config/financeNavigation'
import { employeeAttendanceNavigation } from './config/employeeAttendanceNavigation'
import { prepaidNavigation } from './config/prepaidNavigation'

const financeRoutes = financeNavigationGroups.flatMap((group) =>
  group.children.map((child) => ({
    path: child.path.slice(1),
    component: FinanceReportsPage,
    meta: { title: '财务报表', financeGroup: group.id, financePage: child.page }
  }))
)

const employeeAttendanceRoutes = employeeAttendanceNavigation.map((item) => ({
  path: item.path.slice(1),
  component: EmployeeAttendancePage,
  meta: { title: item.label, employeeAttendancePage: item.page }
}))

const sharedPrepaidRoutes = prepaidNavigation.map((item) => ({
  path: item.path.slice(1),
  component: SharedPrepaidReadOnlyPage,
  meta: { title: item.label, sharedPrepaidPage: item.page }
}))

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: LoginPage },
    ...['bind', 'access'].map(kind => ({ path: `/ai/feishu/${kind}`, component: FeishuVerifyPage, props: { audience: 'admin', mocks: useAdminMocks, apiBase: import.meta.env.VITE_ADMIN_API_BASE_URL || '/api' } })),
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', redirect: '/data' },
        { path: 'data', component: DataStatisticsPage, meta: { title: '数据统计' } },
        { path: 'lab-total-monitor', component: LabTotalMonitorPage, meta: { title: '合量监测' } },
        { path: 'employee-attendance', redirect: '/employee-attendance/schedules' },
        { path: 'employee-attendance/overview', redirect: '/employee-attendance/schedules' },
        ...employeeAttendanceRoutes,
        { path: 'shared-prepaid', redirect: '/shared-prepaid/recharges' },
        ...sharedPrepaidRoutes,
        { path: 'employee-attendance/:pathMatch(.*)*', redirect: '/employee-attendance/schedules' },
        { path: 'finance', redirect: '/finance/income' },
        ...financeRoutes,
        { path: 'todos', component: TodoPage, meta: { title: '待办事项' } },
        { path: 'customer-overview', component: CustomerOverviewPage, meta: { title: '客户总览' } },
        { path: 'medicine-inventory', component: MedicineInventoryPage, meta: { title: '药品库存' } },
        { path: 'abnormal', component: AbnormalRecordsPage, meta: { title: '异常记录' } },
        { path: 'accounts', component: AccountManagementPage, meta: { title: '账号管理', rootOnly: true } },
        { path: 'ai-settings', component: AiSettingsPage, meta: { title: 'AI API 配置', rootOnly: true } },
        { path: 'blacklist', component: BlacklistPage, meta: { title: '客户黑名单' } }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (to.path !== '/login' && !token) {
    if (to.path.startsWith('/ai/feishu/')) rememberFeishuReturn('admin', to.fullPath)
    return '/login'
  }
  if (to.path === '/login' && token) return feishuLoginReturn('admin', true)
  if (to.meta.rootOnly && currentAdminUser()?.role !== 'ROOT_ADMIN') return '/data'
  return true
})
