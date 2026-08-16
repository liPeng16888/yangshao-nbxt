import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { customerNavigationForUser, findCustomerNavigation } from '@/config/customerNavigation'
import { useAuthStore } from '@/stores/auth'

export function useCustomerNavigation() {
  const route = useRoute()
  const authStore = useAuthStore()
  const navigationItems = computed(() => customerNavigationForUser(authStore.user))
  const navigation = computed(() => findCustomerNavigation(route.path, navigationItems.value))
  const section = computed(() => navigation.value?.section)
  const children = computed(() => section.value?.children ?? [])
  const activeChild = computed(() => navigation.value?.activeChild)
  const showSecondaryNav = computed(() => children.value.length > 1)

  return { navigationItems, section, children, activeChild, showSecondaryNav }
}
