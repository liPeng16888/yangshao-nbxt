import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { findCustomerNavigation } from '@/config/customerNavigation'

export function useCustomerNavigation() {
  const route = useRoute()
  const navigation = computed(() => findCustomerNavigation(route.path))
  const section = computed(() => navigation.value?.section)
  const children = computed(() => section.value?.children ?? [])
  const activeChild = computed(() => navigation.value?.activeChild)
  const showSecondaryNav = computed(() => children.value.length > 1)

  return { section, children, activeChild, showSecondaryNav }
}
