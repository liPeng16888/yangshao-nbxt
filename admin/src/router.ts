import { createRouter, createWebHistory } from 'vue-router'
import { ADMIN_TOKEN_KEY, currentAdminUser } from './api'
import LoginPage from './views/LoginPage.vue'
import AdminLayout from './views/AdminLayout.vue'
import DataStatisticsPage from './views/DataStatisticsPage.vue'
import FinanceReportsPage from './views/FinanceReportsPage.vue'
import AbnormalRecordsPage from './views/AbnormalRecordsPage.vue'
import AccountManagementPage from './views/AccountManagementPage.vue'
import BlacklistPage from './views/BlacklistPage.vue'
import CustomerOverviewPage from './views/CustomerOverviewPage.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', component: LoginPage },
    {
      path: '/',
      component: AdminLayout,
      children: [
        { path: '', redirect: '/data' },
        { path: 'data', component: DataStatisticsPage, meta: { title: '数据统计' } },
        { path: 'finance', component: FinanceReportsPage, meta: { title: '财务报表' } },
        { path: 'customer-overview', component: CustomerOverviewPage, meta: { title: '客户总览' } },
        { path: 'abnormal', component: AbnormalRecordsPage, meta: { title: '异常记录' } },
        { path: 'accounts', component: AccountManagementPage, meta: { title: '账号管理', rootOnly: true } },
        { path: 'blacklist', component: BlacklistPage, meta: { title: '客户黑名单' } }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (to.path !== '/login' && !token) return '/login'
  if (to.path === '/login' && token) return '/data'
  if (to.meta.rootOnly && currentAdminUser()?.role !== 'ROOT_ADMIN') return '/data'
  return true
})
