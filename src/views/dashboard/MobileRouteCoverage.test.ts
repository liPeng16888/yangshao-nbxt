import { mount, shallowMount } from '@vue/test-utils'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AppLayout from '@/components/layout/AppLayout.vue'
import AppMobileShell from '@/components/layout/AppMobileShell.vue'
import appRouter from '@/router'
import { findCustomerNavigation } from '@/config/customerNavigation'
import { featureForPath } from '@/router/guards'

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

const routes = [
  '/data', '/data/standard-sample', '/data/coefficient',
  '/lab-report/image-template', '/lab-report/sms-template',
  '/employee-attendance/schedules', '/employee-attendance/employees', '/employee-attendance/records',
  '/employee-attendance/leave', '/employee-attendance/compensation', '/employee-attendance/payroll',
  '/finance/expenses', '/finance/income', '/finance/unsettled', '/finance/monthly-settlement',
  '/finance/prepaid/add', '/finance/prepaid/customers',
  '/medicine-inventory/stock', '/medicine-inventory/inbound', '/medicine-inventory/outbound',
  '/reports', '/customers-overview', '/blacklist'
]

const routeOrder = new Map(routes.map((path, index) => [path, index]))

function customerRouteRecords() {
  return appRouter.getRoutes()
    .filter((route) => route.path !== '/' && route.path !== '/login' && route.meta.requiresAuth && !route.redirect)
    .sort((left, right) => (routeOrder.get(left.path) ?? Number.MAX_SAFE_INTEGER) - (routeOrder.get(right.path) ?? Number.MAX_SAFE_INTEGER))
}

const RoutedPage = defineComponent({ template: '<section data-testid="routed-page-root" />' })

function createCoverageRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: customerRouteRecords().map((route) => ({
      path: route.path,
      component: RoutedPage,
      meta: route.meta
    }))
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

  it('derives all 23 customer pages from the real router', () => {
    const coveredMobileRoutes = customerRouteRecords().map((route) => route.path)

    expect(coveredMobileRoutes).toEqual(routes)
  })

  it('resolves the canonical secondary group and current item for every routed page', () => {
    for (const route of customerRouteRecords()) {
      const navigation = findCustomerNavigation(route.path)
      const expectedSectionPath = `/${route.path.split('/')[1]}`
      const expectedActivePath = route.path === '/finance/prepaid/customers'
        ? '/finance/prepaid/add'
        : route.path

      expect(navigation?.section.path, `${route.path} section`).toBe(expectedSectionPath)
      if ((navigation?.section.children?.length ?? 0) > 1) {
        expect(navigation?.activeChild?.path, `${route.path} current secondary item`).toBe(expectedActivePath)
      }
    }
  })

  it('renders one mobile shell and routed page while excluding the desktop chrome on every route', async () => {
    const router = createCoverageRouter()
    await router.push(routes[0])
    await router.isReady()
    const wrapper = shallowMount(AppLayout, { global: { plugins: [router] } })

    for (const path of routes) {
      await router.push(path)
      await nextTick()

      expect(wrapper.findAll('.app-shell--mobile'), `${path} mobile root`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppMobileShell' }), `${path} mobile shell`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppSidebar' }), `${path} desktop sidebar`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppTopbar' }), `${path} desktop topbar`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'RouterView' }), `${path} routed page outlet`).toHaveLength(1)
    }
  })

  it('keeps one desktop shell and routed page while excluding mobile chrome on every route', async () => {
    mocks.isMobileLayout.value = false
    const router = createCoverageRouter()
    await router.push(routes[0])
    await router.isReady()
    const wrapper = shallowMount(AppLayout, { global: { plugins: [router] } })

    for (const path of routes) {
      await router.push(path)
      await nextTick()

      expect(wrapper.findAll('.app-shell--mobile'), `${path} mobile root`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppMobileShell' }), `${path} mobile shell`).toHaveLength(0)
      expect(wrapper.findAllComponents({ name: 'AppSidebar' }), `${path} desktop sidebar`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'AppTopbar' }), `${path} desktop topbar`).toHaveLength(1)
      expect(wrapper.findAllComponents({ name: 'RouterView' }), `${path} routed page outlet`).toHaveLength(1)
    }
  })

  it('renders the correct secondary rail and current item through the real mobile shell for every route', async () => {
    const router = createCoverageRouter()
    await router.push(routes[0])
    await router.isReady()
    const wrapper = mount(AppMobileShell, {
      global: {
        plugins: [router],
        stubs: {
          ElDrawer: { props: ['modelValue'], template: '<aside v-if="modelValue"><slot name="header"/><slot/></aside>' }
        }
      }
    })

    for (const path of routes) {
      await router.push(path)
      await nextTick()
      const navigation = findCustomerNavigation(path)!
      const shouldShowRail = (navigation.section.children?.length ?? 0) > 1

      expect(wrapper.findAll('.mobile-app-header'), `${path} mobile page root`).toHaveLength(1)
      expect(wrapper.find('.mobile-secondary-nav').exists(), `${path} secondary rail`).toBe(shouldShowRail)
      if (shouldShowRail) {
        const activeItems = wrapper.findAll('.mobile-secondary-nav__item.router-link-active')
        expect(activeItems, `${path} current secondary item`).toHaveLength(1)
        expect(activeItems[0]!.attributes('href'), `${path} current secondary target`).toBe(navigation.activeChild?.path)
      }
    }
  })

  it.each(['/reports', '/customers-overview', '/blacklist'])('keeps %s as a standalone page without a secondary rail', (path) => {
    expect(findCustomerNavigation(path)?.section.children).toBeUndefined()
  })

  it('keeps sensitive-route access features aligned with the server-facing groups', () => {
    expect(featureForPath('/employee-attendance/payroll')).toBe('EMPLOYEE_ATTENDANCE')
    expect(featureForPath('/finance/monthly-settlement')).toBe('FINANCE')
    expect(featureForPath('/medicine-inventory/outbound')).toBe('MEDICINE_INVENTORY')
    expect(featureForPath('/reports')).toBe('REPORTS')
    expect(featureForPath('/customers-overview')).toBe('CUSTOMER_OVERVIEW')
    expect(featureForPath('/blacklist')).toBe('BLACKLIST')
  })
})
