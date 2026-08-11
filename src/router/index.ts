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
import FinanceUnsettledPage from '@/views/dashboard/FinanceUnsettledPage.vue'
import PrepaidRechargePage from '@/views/dashboard/PrepaidRechargePage.vue'
import PrepaidCustomersPage from '@/views/dashboard/PrepaidCustomersPage.vue'
import PrepaidConsumptionsPage from '@/views/dashboard/PrepaidConsumptionsPage.vue'
import PrepaidSettlementsPage from '@/views/dashboard/PrepaidSettlementsPage.vue'
import ReportPage from '@/views/dashboard/ReportPage.vue'
import BlacklistPage from '@/views/dashboard/BlacklistPage.vue'
import CustomerOverviewPage from '@/views/dashboard/CustomerOverviewPage.vue'
import MedicineInventoryStockPage from '@/views/dashboard/MedicineInventoryStockPage.vue'
import MedicineInventoryInboundPage from '@/views/dashboard/MedicineInventoryInboundPage.vue'
import MedicineInventoryOutboundPage from '@/views/dashboard/MedicineInventoryOutboundPage.vue'
import EmployeeAttendanceOverviewPage from '@/views/dashboard/employee-attendance/EmployeeAttendanceOverviewPage.vue'
import EmployeeDirectoryPage from '@/views/dashboard/employee-attendance/EmployeeDirectoryPage.vue'
import EmployeeSchedulesPage from '@/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue'
import EmployeeAttendanceRecordsPage from '@/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue'
import EmployeeLeavePage from '@/views/dashboard/employee-attendance/EmployeeLeavePage.vue'
import EmployeeCompensationPage from '@/views/dashboard/employee-attendance/EmployeeCompensationPage.vue'
import EmployeePayrollPage from '@/views/dashboard/employee-attendance/EmployeePayrollPage.vue'
import NoMenuPermissionPage from '@/views/dashboard/NoMenuPermissionPage.vue'
import { canAccessPath, firstAllowedPath } from '@/config/frontendNavigation'
import { useAccessGuardStore } from '@/stores/accessGuard'
import { useAuthStore } from '@/stores/auth'
import { featureForPath, resolveAuthRedirect } from './guards'

export function prepaidRootRedirect(user: Parameters<typeof firstAllowedPath>[0]) {
  return firstAllowedPath(user, '/prepaid')
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: () => firstAllowedPath(useAuthStore().user) },
    { path: '/login', name: 'login', component: LoginRegister },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: 'data', name: 'data', component: LabDataPage, meta: { title: '数据计算', requiresAuth: true, frontendPermission: 'DATA_MAIN' } },
        {
          path: 'data/standard-sample',
          name: 'standardSampleCalculation',
          component: StandardSampleCalculationPage,
          meta: { title: '标样计算', requiresAuth: true, frontendPermission: 'DATA_STANDARD_SAMPLE' }
        },
        {
          path: 'data/coefficient',
          name: 'coefficientCalculation',
          component: CoefficientCalculationPage,
          meta: { title: '系数计算', requiresAuth: true, frontendPermission: 'DATA_COEFFICIENT' }
        },
        { path: 'lab-report', redirect: () => firstAllowedPath(useAuthStore().user, '/lab-report') },
        {
          path: 'lab-report/image-template',
          name: 'labReportImageTemplate',
          component: LabReportPage,
          meta: { title: '化验报告', requiresAuth: true, frontendPermission: 'LAB_REPORT_IMAGE_TEMPLATE' }
        },
        {
          path: 'lab-report/sms-template',
          name: 'labReportSmsTemplate',
          component: LabReportPage,
          meta: { title: '化验报告', requiresAuth: true, frontendPermission: 'LAB_REPORT_SMS_TEMPLATE' }
        },
        { path: 'employee-attendance', redirect: () => firstAllowedPath(useAuthStore().user, '/employee-attendance') },
        { path: 'employee-attendance/overview', name: 'employeeAttendanceOverview', component: EmployeeAttendanceOverviewPage, meta: { title: '考勤概览', requiresAuth: true, frontendPermission: 'ATTENDANCE_OVERVIEW' } },
        { path: 'employee-attendance/employees', name: 'employeeAttendanceEmployees', component: EmployeeDirectoryPage, meta: { title: '员工档案', requiresAuth: true, frontendPermission: 'ATTENDANCE_EMPLOYEES' } },
        { path: 'employee-attendance/schedules', name: 'employeeAttendanceSchedules', component: EmployeeSchedulesPage, meta: { title: '排班管理', requiresAuth: true, frontendPermission: 'ATTENDANCE_SCHEDULES' } },
        { path: 'employee-attendance/records', name: 'employeeAttendanceRecords', component: EmployeeAttendanceRecordsPage, meta: { title: '考勤记录', requiresAuth: true, frontendPermission: 'ATTENDANCE_RECORDS' } },
        { path: 'employee-attendance/leave', name: 'employeeAttendanceLeave', component: EmployeeLeavePage, meta: { title: '请假管理', requiresAuth: true, frontendPermission: 'ATTENDANCE_LEAVE' } },
        { path: 'employee-attendance/compensation', name: 'employeeAttendanceCompensation', component: EmployeeCompensationPage, meta: { title: '提成与奖金', requiresAuth: true, frontendPermission: 'ATTENDANCE_COMPENSATION' } },
        { path: 'employee-attendance/payroll', name: 'employeeAttendancePayroll', component: EmployeePayrollPage, meta: { title: '工资统计', requiresAuth: true, frontendPermission: 'ATTENDANCE_PAYROLL' } },
        { path: 'finance', redirect: () => firstAllowedPath(useAuthStore().user, '/finance') },
        { path: 'finance/expenses', name: 'financeExpenses', component: FinancePage, meta: { title: '支出账单', requiresAuth: true, frontendPermission: 'FINANCE_EXPENSES' } },
        { path: 'finance/income', name: 'financeIncome', component: FinanceIncomePage, meta: { title: '收入账单', requiresAuth: true, frontendPermission: 'FINANCE_INCOME' } },
        { path: 'finance/unsettled', name: 'financeUnsettled', component: FinanceUnsettledPage, meta: { title: '未结款', requiresAuth: true, frontendPermission: 'FINANCE_UNSETTLED' } },
        {
          path: 'finance/monthly-settlement',
          name: 'financeMonthlySettlement',
          component: FinanceMonthlySettlementPage,
          meta: { title: '月结款', requiresAuth: true, frontendPermission: 'FINANCE_MONTHLY_SETTLEMENT' }
        },
        { path: 'prepaid', redirect: () => prepaidRootRedirect(useAuthStore().user) },
        {
          path: 'prepaid/recharges',
          name: 'prepaidRecharges',
          component: PrepaidRechargePage,
          meta: { title: '预存款充值', requiresAuth: true, frontendPermission: 'PREPAID_RECHARGE' }
        },
        {
          path: 'prepaid/customers',
          name: 'prepaidCustomers',
          component: PrepaidCustomersPage,
          meta: { title: '预存款客户', requiresAuth: true, frontendPermission: 'PREPAID_CUSTOMERS' }
        },
        {
          path: 'prepaid/consumptions',
          name: 'prepaidConsumptions',
          component: PrepaidConsumptionsPage,
          meta: { title: '消费明细', requiresAuth: true, frontendPermission: 'PREPAID_CONSUMPTIONS' }
        },
        {
          path: 'prepaid/settlements',
          name: 'prepaidSettlements',
          component: PrepaidSettlementsPage,
          meta: { title: '转账结算', requiresAuth: true, frontendPermission: 'PREPAID_SETTLEMENTS' }
        },
        { path: 'reports', name: 'reports', component: ReportPage, meta: { title: '报表', requiresAuth: true, frontendPermission: 'REPORTS' } },
        { path: 'medicine-inventory', redirect: () => firstAllowedPath(useAuthStore().user, '/medicine-inventory') },
        {
          path: 'medicine-inventory/stock',
          name: 'medicineInventoryStock',
          component: MedicineInventoryStockPage,
          meta: { title: '药品库存', requiresAuth: true, frontendPermission: 'MEDICINE_STOCK' }
        },
        {
          path: 'medicine-inventory/inbound',
          name: 'medicineInventoryInbound',
          component: MedicineInventoryInboundPage,
          meta: { title: '药品入库', requiresAuth: true, frontendPermission: 'MEDICINE_INBOUND' }
        },
        {
          path: 'medicine-inventory/outbound',
          name: 'medicineInventoryOutbound',
          component: MedicineInventoryOutboundPage,
          meta: { title: '药品出库', requiresAuth: true, frontendPermission: 'MEDICINE_OUTBOUND' }
        },
        {
          path: 'customers-overview',
          name: 'customerOverview',
          component: CustomerOverviewPage,
          meta: { title: '客户总览', requiresAuth: true, frontendPermission: 'CUSTOMER_OVERVIEW' }
        },
        { path: 'blacklist', name: 'blacklist', component: BlacklistPage, meta: { title: '黑名单', requiresAuth: true, frontendPermission: 'BLACKLIST' } },
        { path: 'no-menu-permission', name: 'noMenuPermission', component: NoMenuPermissionPage, meta: { title: '暂无菜单权限', requiresAuth: true } }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: () => firstAllowedPath(useAuthStore().user) }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const redirect = resolveAuthRedirect({
    isLoggedIn: authStore.isLoggedIn,
    toPath: to.path,
    requiresAuth: to.matched.some((record) => record.meta.requiresAuth),
    authenticatedHome: firstAllowedPath(authStore.user)
  })
  if (redirect) return redirect

  if (authStore.user && !canAccessPath(authStore.user, to.path)) {
    return firstAllowedPath(authStore.user)
  }

  const accessGuard = useAccessGuardStore()
  const followsAccessPassword = authStore.user?.requiresAccessGuardPassword !== false
  if (followsAccessPassword && accessGuard.isProtectedPath(to.path)) await accessGuard.loadGroups()
  if (followsAccessPassword && accessGuard.requiresAccessForPath(to.path)) {
    const feature = featureForPath(to.path)
    if (!feature) return true
    accessGuard.requestFeatureAccess(feature, {
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
  if (path.startsWith('/employee-attendance')) return '员工考勤访问验证'
  if (path.startsWith('/finance')) return '财务访问验证'
  if (path.startsWith('/medicine-inventory')) return '药品库存访问验证'
  if (path.startsWith('/reports')) return '报表访问验证'
  if (path.startsWith('/customers-overview')) return '客户总览访问验证'
  if (path.startsWith('/blacklist')) return '黑名单访问验证'
  return '访问验证'
}

export default router
