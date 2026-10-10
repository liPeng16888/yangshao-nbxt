import { mount, shallowMount } from '@vue/test-utils'
import { nextTick, ref, type Component, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppLayout from '@/components/layout/AppLayout.vue'
import AppMobileShell from '@/components/layout/AppMobileShell.vue'
import appRouter from '@/router'
import { findCustomerNavigation } from '@/config/customerNavigation'
import { featureForPath, type AccessGuardFeature } from '@/router/guards'
import BlacklistPage from './BlacklistPage.vue'
import CoefficientCalculationPage from './CoefficientCalculationPage.vue'
import CustomerOverviewPage from './CustomerOverviewPage.vue'
import FinanceIncomePage from './FinanceIncomePage.vue'
import FinanceMonthlySettlementPage from './FinanceMonthlySettlementPage.vue'
import FinancePage from './FinancePage.vue'
import FinanceUnsettledPage from './FinanceUnsettledPage.vue'
import LabDataPage from './LabDataPage.vue'
import LabReportPage from './LabReportPage.vue'
import MedicineInventoryInboundPage from './MedicineInventoryInboundPage.vue'
import MedicineInventoryOutboundPage from './MedicineInventoryOutboundPage.vue'
import MedicineInventoryStockPage from './MedicineInventoryStockPage.vue'
import PrepaidConsumptionsPage from './PrepaidConsumptionsPage.vue'
import PrepaidCustomersPage from './PrepaidCustomersPage.vue'
import PrepaidRechargePage from './PrepaidRechargePage.vue'
import PrepaidSettlementsPage from './PrepaidSettlementsPage.vue'
import ReportPage from './ReportPage.vue'
import StandardSampleCalculationPage from './StandardSampleCalculationPage.vue'
import EmployeeAttendanceRecordsPage from './employee-attendance/EmployeeAttendanceRecordsPage.vue'
import EmployeeCompensationPage from './employee-attendance/EmployeeCompensationPage.vue'
import EmployeeDirectoryPage from './employee-attendance/EmployeeDirectoryPage.vue'
import EmployeeLeavePage from './employee-attendance/EmployeeLeavePage.vue'
import EmployeePayrollPage from './employee-attendance/EmployeePayrollPage.vue'
import EmployeeSchedulesPage from './employee-attendance/EmployeeSchedulesPage.vue'

const mocks = vi.hoisted(() => ({
  isMobileLayout: undefined as unknown as Ref<boolean>,
  accessGuard: {
    loadGroups: vi.fn().mockResolvedValue([]),
    openSettings: vi.fn(),
    isProtectedPath: vi.fn().mockReturnValue(false),
    requiresAccessForPath: vi.fn().mockReturnValue(false),
    requestFeatureAccess: vi.fn().mockReturnValue(true)
  },
  auth: {
    isLoggedIn: true,
    user: { username: 'route-coverage-user' },
    logoutCurrentUser: vi.fn().mockResolvedValue(undefined)
  },
  labSheet: { disconnectRealtime: vi.fn() }
}))

vi.mock('@/composables/useMobileLayout', () => ({
  useMobileLayout: () => ({ isMobileLayout: mocks.isMobileLayout })
}))
vi.mock('@/stores/accessGuard', () => ({ useAccessGuardStore: () => mocks.accessGuard }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('@/stores/labSheet', () => ({ useLabSheetStore: () => mocks.labSheet }))
vi.mock('@/stores/tenantRealtime', () => ({ useTenantRealtimeStore: () => ({ connect: vi.fn(), disconnect: vi.fn(), registerModule: vi.fn(() => vi.fn()) }) }))
vi.mock('@/stores/sharedPrepaid', () => ({ useSharedPrepaidStore: () => ({ connectRealtime: vi.fn(), disconnectRealtime: vi.fn() }) }))
vi.mock('@/stores/frontendPreferences', () => ({
  frontendPreferenceOwnerId: (user: { dataOwnerId?: string; id?: string } | null) => user?.dataOwnerId || user?.id || '',
  useFrontendPreferencesStore: () => ({ hasPendingChanges: false, records: {}, loadAll: vi.fn().mockResolvedValue('loaded'), save: vi.fn(), resolveConflict: vi.fn() })
}))
vi.mock('@/utils/frontendPreferenceMigration', () => ({ collectLegacyPreferenceCandidates: () => ({}), markLegacyMigrationFinished: vi.fn() }))

interface OwningRouteContract {
  path: string
  name: string
  component: Component
  feature: AccessGuardFeature | null
  owningTest: string
  mobileRoot: string
  desktopRoot: string
}

// This is the single expected route contract. Paths are never duplicated in a
// second ordering list: every assertion joins these expectations to the real
// normalized router record by route name.
const routeContracts: OwningRouteContract[] = [
  { path: '/data', name: 'data', component: LabDataPage, feature: null, owningTest: 'LabDataPage.test.ts', mobileRoot: '.mobile-lab-list-stub', desktopRoot: '.lab-grid-stub' },
  { path: '/data/standard-sample', name: 'standardSampleCalculation', component: StandardSampleCalculationPage, feature: null, owningTest: 'StandardSampleCalculationPage.test.ts', mobileRoot: '[data-testid="standard-mobile-view"]', desktopRoot: '[data-testid="standard-desktop-view"]' },
  { path: '/data/coefficient', name: 'coefficientCalculation', component: CoefficientCalculationPage, feature: null, owningTest: 'CoefficientCalculationPage.test.ts', mobileRoot: '[data-testid="coefficient-mobile-view"]', desktopRoot: '[data-testid="coefficient-desktop-view"]' },
  { path: '/lab-report/image-template', name: 'labReportImageTemplate', component: LabReportPage, feature: null, owningTest: 'LabReportPage.mobile.test.ts', mobileRoot: '[data-testid="mobile-report-template"]', desktopRoot: '.report-section-tabs' },
  { path: '/lab-report/sms-template', name: 'labReportSmsTemplate', component: LabReportPage, feature: null, owningTest: 'LabReportPage.mobile.test.ts', mobileRoot: '[data-testid="mobile-sms-template"]', desktopRoot: '.report-section-tabs' },
  { path: '/employee-attendance/schedules', name: 'employeeAttendanceSchedules', component: EmployeeSchedulesPage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-calendar-day"]', desktopRoot: '[data-testid="monthly-schedule-calendar"]' },
  { path: '/employee-attendance/employees', name: 'employeeAttendanceEmployees', component: EmployeeDirectoryPage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-employee-card"]', desktopRoot: '.el-table' },
  { path: '/employee-attendance/records', name: 'employeeAttendanceRecords', component: EmployeeAttendanceRecordsPage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-attendance-record-card"]', desktopRoot: '.el-table' },
  { path: '/employee-attendance/leave', name: 'employeeAttendanceLeave', component: EmployeeLeavePage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-leave-card"]', desktopRoot: '.el-table' },
  { path: '/employee-attendance/compensation', name: 'employeeAttendanceCompensation', component: EmployeeCompensationPage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-commission-card"]', desktopRoot: '.el-table' },
  { path: '/employee-attendance/payroll', name: 'employeeAttendancePayroll', component: EmployeePayrollPage, feature: 'EMPLOYEE_ATTENDANCE', owningTest: 'EmployeeAttendancePages.test.ts', mobileRoot: '[data-testid="mobile-payroll-card"]', desktopRoot: '.el-table' },
  { path: '/finance/expenses', name: 'financeExpenses', component: FinancePage, feature: 'FINANCE', owningTest: 'FinancePage.mobile.test.ts', mobileRoot: '[data-testid="mobile-finance-entry-form"]', desktopRoot: '.expense-entry-table' },
  { path: '/finance/income', name: 'financeIncome', component: FinanceIncomePage, feature: 'FINANCE', owningTest: 'FinanceIncomePage.mobile.test.ts', mobileRoot: '[data-testid="mobile-income-summary"]', desktopRoot: '.el-table' },
  { path: '/finance/unsettled', name: 'financeUnsettled', component: FinanceUnsettledPage, feature: 'FINANCE', owningTest: 'FinanceUnsettledPage.test.ts', mobileRoot: '[data-testid="mobile-unsettled-card"]', desktopRoot: '.table-stub' },
  { path: '/finance/monthly-settlement', name: 'financeMonthlySettlement', component: FinanceMonthlySettlementPage, feature: 'FINANCE', owningTest: 'FinanceMonthlySettlementPage.mobile.test.ts', mobileRoot: '[data-testid="mobile-monthly-summary-card"]', desktopRoot: '.el-table' },
  { path: '/prepaid/recharges', name: 'prepaidRecharges', component: PrepaidRechargePage, feature: null, owningTest: 'PrepaidPages.test.ts', mobileRoot: '[data-testid="mobile-recharge-card"]', desktopRoot: '.el-table' },
  { path: '/prepaid/customers', name: 'prepaidCustomers', component: PrepaidCustomersPage, feature: null, owningTest: 'PrepaidPages.test.ts', mobileRoot: '[data-testid="mobile-member-card"]', desktopRoot: '.el-table' },
  { path: '/prepaid/consumptions', name: 'prepaidConsumptions', component: PrepaidConsumptionsPage, feature: null, owningTest: 'PrepaidPages.test.ts', mobileRoot: '[data-testid="mobile-consumption-card"]', desktopRoot: '.el-table' },
  { path: '/prepaid/settlements', name: 'prepaidSettlements', component: PrepaidSettlementsPage, feature: null, owningTest: 'PrepaidSettlementsPage.test.ts', mobileRoot: '[data-testid="mobile-settlement-card"]', desktopRoot: '.el-table' },
  { path: '/medicine-inventory/stock', name: 'medicineInventoryStock', component: MedicineInventoryStockPage, feature: 'MEDICINE_INVENTORY', owningTest: 'MedicineInventoryPages.test.ts', mobileRoot: '[data-testid="mobile-medicine-stock-list"]', desktopRoot: '.inventory-control-band' },
  { path: '/medicine-inventory/inbound', name: 'medicineInventoryInbound', component: MedicineInventoryInboundPage, feature: 'MEDICINE_INVENTORY', owningTest: 'MedicineInventoryPages.test.ts', mobileRoot: '[data-testid="mobile-inbound-form"]', desktopRoot: '.el-table' },
  { path: '/medicine-inventory/outbound', name: 'medicineInventoryOutbound', component: MedicineInventoryOutboundPage, feature: 'MEDICINE_INVENTORY', owningTest: 'MedicineInventoryPages.test.ts', mobileRoot: '[data-testid="mobile-outbound-form"]', desktopRoot: '.el-table' },
  { path: '/reports', name: 'reports', component: ReportPage, feature: 'REPORTS', owningTest: 'ReportPage.mobile.test.ts', mobileRoot: '[data-testid="mobile-report-filter"]', desktopRoot: 'ReportFilterBar' },
  { path: '/customers-overview', name: 'customerOverview', component: CustomerOverviewPage, feature: 'CUSTOMER_OVERVIEW', owningTest: 'CustomerOverviewPage.test.ts', mobileRoot: '[data-testid="mobile-customer-card"]', desktopRoot: '.el-table' },
  { path: '/blacklist', name: 'blacklist', component: BlacklistPage, feature: 'BLACKLIST', owningTest: 'BlacklistPage.mobile.test.ts', mobileRoot: '[data-testid="mobile-blacklist-card"]', desktopRoot: '.blacklist-table' }
]

const routeContractsByName = new Map(routeContracts.map((contract) => [contract.name, contract]))

function customerRouteRecords() {
  return appRouter.getRoutes()
    .filter((route) => route.path !== '/'
      && route.path !== '/login'
      && route.path !== '/no-menu-permission'
      && route.meta.requiresAuth
      && route.meta.customerNavigation !== false
      && !route.redirect)
}

function createCoverageRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: customerRouteRecords().map((route) => {
      const component = route.components?.default
      if (!component) throw new Error(`${route.path} is missing its real route component`)
      return { path: route.path, component, meta: route.meta }
    })
  })
}

describe('mobile customer route coverage', () => {
  beforeEach(() => {
    mocks.isMobileLayout = ref(true)
    mocks.accessGuard.loadGroups.mockClear()
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() { return values.size },
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        key: (index: number) => [...values.keys()][index] ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, String(value))
      } satisfies Storage
    })
  })

  it('derives all 25 customer pages from the real router', () => {
    const realPaths = new Set(customerRouteRecords().map((route) => route.path))
    const contractedPaths = new Set(routeContracts.map((contract) => contract.path))

    expect(realPaths.size).toBe(25)
    expect(contractedPaths.size).toBe(25)
    expect(realPaths).toEqual(contractedPaths)
  })

  it('binds every real route to its owning component and exclusive root assertions', () => {
    const realRecords = customerRouteRecords()
    const realNames = new Set(realRecords.map((route) => String(route.name)))
    const contractedNames = new Set(routeContracts.map((contract) => contract.name))

    expect(realNames).toEqual(contractedNames)
    for (const route of realRecords) {
      const contract = routeContractsByName.get(String(route.name))
      expect(contract, `${route.path} owning contract`).toBeDefined()
      expect(route.path, `${route.path} canonical path`).toBe(contract!.path)
      expect(route.components?.default, `${route.path} real route component`).toBe(contract!.component)
      expect(contract!.owningTest, `${route.path} owning test`).toMatch(/\.test\.ts$/)
      expect(contract!.mobileRoot, `${route.path} mobile root marker`).not.toBe(contract!.desktopRoot)
      expect(contract!.mobileRoot.trim(), `${route.path} mobile root marker`).not.toBe('')
      expect(contract!.desktopRoot.trim(), `${route.path} desktop root marker`).not.toBe('')
    }
  })

  it('resolves the canonical secondary group and current item for every routed page', () => {
    for (const route of customerRouteRecords()) {
      const navigation = findCustomerNavigation(route.path)
      const expectedSectionPath = `/${route.path.split('/')[1]}`
      const expectedActivePath = route.path

      expect(navigation?.section.path, `${route.path} section`).toBe(expectedSectionPath)
      if ((navigation?.section.children?.length ?? 0) > 1) {
        expect(navigation?.activeChild?.path, `${route.path} current secondary item`).toBe(expectedActivePath)
      }
    }
  })

  it('renders one mobile shell and routed page while excluding the desktop chrome on every route', async () => {
    const router = createCoverageRouter()
    await router.push(routeContracts[0]!.path)
    await router.isReady()
    const wrapper = shallowMount(AppLayout, { global: { plugins: [router] } })

    for (const route of customerRouteRecords()) {
      await router.push(route.path)
      await nextTick()

      expect(wrapper.findAll('.app-shell--mobile'), `${route.path} mobile root`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppMobileShell' }), `${route.path} mobile shell`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppSidebar' }), `${route.path} desktop sidebar`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppTopbar' }), `${route.path} desktop topbar`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'RouterView' }), `${route.path} routed page outlet`).toHaveLength(1)
      expect(router.currentRoute.value.matched.at(-1)?.components?.default, `${route.path} routed component`).toBe(route.components?.default)
    }
  })

  it('keeps one desktop shell and routed page while excluding mobile chrome on every route', async () => {
    mocks.isMobileLayout.value = false
    const router = createCoverageRouter()
    await router.push(routeContracts[0]!.path)
    await router.isReady()
    const wrapper = shallowMount(AppLayout, { global: { plugins: [router] } })

    for (const route of customerRouteRecords()) {
      await router.push(route.path)
      await nextTick()

      expect(wrapper.findAll('.app-shell--mobile'), `${route.path} mobile root`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppMobileShell' }), `${route.path} mobile shell`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppSidebar' }), `${route.path} desktop sidebar`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppTopbar' }), `${route.path} desktop topbar`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'RouterView' }), `${route.path} routed page outlet`).toHaveLength(1)
      expect(router.currentRoute.value.matched.at(-1)?.components?.default, `${route.path} routed component`).toBe(route.components?.default)
    }
  })

  it('renders the correct secondary rail and current item through the real mobile shell for every route', async () => {
    const router = createCoverageRouter()
    await router.push(routeContracts[0]!.path)
    await router.isReady()
    const wrapper = mount(AppMobileShell, {
      global: {
        plugins: [router],
        stubs: {
          ElDrawer: { props: ['modelValue'], template: '<aside v-if="modelValue"><slot name="header"/><slot/></aside>' }
        }
      }
    })

    for (const route of customerRouteRecords()) {
      await router.push(route.path)
      await nextTick()
      const navigation = findCustomerNavigation(route.path)!
      const shouldShowRail = (navigation.section.children?.length ?? 0) > 1

      expect(wrapper.findAll('.mobile-app-header'), `${route.path} mobile page root`).toHaveLength(1)
      expect(wrapper.find('.mobile-secondary-nav').exists(), `${route.path} secondary rail`).toBe(shouldShowRail)
      if (shouldShowRail) {
        const activeItems = wrapper.findAll('.mobile-secondary-nav__item.router-link-active')
        expect(activeItems, `${route.path} current secondary item`).toHaveLength(1)
        expect(activeItems[0]!.attributes('href'), `${route.path} current secondary target`).toBe(navigation.activeChild?.path)
      }
    }
  })

  it.each(['/reports', '/customers-overview', '/blacklist'])('keeps %s as a standalone page without a secondary rail', (path) => {
    expect(findCustomerNavigation(path)?.section.children).toBeUndefined()
  })

  it('keeps sensitive-route access features aligned with the server-facing groups', () => {
    for (const route of customerRouteRecords()) {
      const contract = routeContractsByName.get(String(route.name))!
      expect(featureForPath(route.path), `${route.path} access feature`).toBe(contract.feature)
    }
  })
})
