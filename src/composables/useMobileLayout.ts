import { onScopeDispose, readonly, ref } from 'vue'

export const MOBILE_NARROW_QUERY = '(max-width: 767px)'
export const MOBILE_TOUCH_QUERY = '(pointer: coarse) and (max-width: 1024px)'

export function useMobileLayout() {
  const isMobileLayout = ref(false)

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { isMobileLayout: readonly(isMobileLayout) }
  }

  const narrowViewport = window.matchMedia(MOBILE_NARROW_QUERY)
  const touchPhone = window.matchMedia(MOBILE_TOUCH_QUERY)
  const updateLayout = () => {
    isMobileLayout.value = narrowViewport.matches || touchPhone.matches
  }

  updateLayout()
  narrowViewport.addEventListener('change', updateLayout)
  touchPhone.addEventListener('change', updateLayout)

  onScopeDispose(() => {
    narrowViewport.removeEventListener('change', updateLayout)
    touchPhone.removeEventListener('change', updateLayout)
  })

  return { isMobileLayout: readonly(isMobileLayout) }
}
