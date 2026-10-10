import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import { clamp, closestDock, dockBounds, dockPosition, parseDockPreference, type DockPreference, type DockViewport } from './floatingDock'

/** Pointer events also work in the desktop webview. No native window or business data is moved. */
export function useFloatingDock(storageKey: Ref<string>, opened: Ref<boolean>) {
  const floatingRoot = ref<HTMLElement>()
  const preference = ref<DockPreference>({ side: 'right', verticalRatio: 1 })
  const viewport = reactive<DockViewport>({ width: 0, height: 0, left: 0, top: 0 })
  const size = reactive({ width: 0, height: 0 })
  const position = reactive({ x: 0, y: 0 })
  const dragging = ref(false), ready = ref(false)
  let bottomGap = 24, suppressClick = false, observer: ResizeObserver | undefined
  let gesture: { id: number; handle: HTMLElement; startX: number; startY: number; x: number; y: number; previous: DockPreference; moved: boolean } | undefined

  const floatingStyle = computed(() => ({
    ...(ready.value ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' } : {}),
    '--ys-ai-viewport-width': viewport.width ? `${viewport.width}px` : '100vw',
    '--ys-ai-viewport-height': viewport.height ? `${viewport.height}px` : '100dvh'
  }))
  const dockSide = computed(() => preference.value.side)

  function save() {
    try { window.localStorage.setItem(storageKey.value, JSON.stringify(preference.value)) } catch { /* Private browsing can disable storage; dragging still works. */ }
  }
  function restore() {
    try { preference.value = parseDockPreference(window.localStorage.getItem(storageKey.value)) }
    catch { preference.value = parseDockPreference(null) }
  }
  function place() { Object.assign(position, dockPosition(preference.value, viewport, size, bottomGap)) }
  function measure() {
    if (!floatingRoot.value) return
    const rect = floatingRoot.value.getBoundingClientRect()
    size.width = rect.width; size.height = rect.height
    bottomGap = Number.parseFloat(getComputedStyle(floatingRoot.value).getPropertyValue('--ys-ai-bottom-gap')) || 24
    if (!gesture) place()
    ready.value = true
  }
  async function refreshViewport() {
    cancelDrag()
    const visual = window.visualViewport
    Object.assign(viewport, { width: visual?.width || window.innerWidth, height: visual?.height || window.innerHeight, left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0 })
    await nextTick()
    measure()
  }
  function releasePointer() {
    const previous = gesture
    gesture = undefined
    dragging.value = false
    if (previous?.handle.hasPointerCapture?.(previous.id)) previous.handle.releasePointerCapture(previous.id)
  }
  function cancelDrag() {
    if (!gesture) return
    suppressClick = gesture.moved
    preference.value = gesture.previous
    releasePointer()
    place()
  }
  function startDrag(event: PointerEvent) {
    if (gesture || event.isPrimary === false || event.button !== 0) return
    const handle = event.currentTarget as HTMLElement
    // Header buttons remain ordinary controls; only its non-interactive area is a drag handle.
    if (handle.classList.contains('ys-ai-header') && (event.target as HTMLElement).closest('button, input, textarea, select, a')) return
    suppressClick = false
    measure()
    gesture = { id: event.pointerId, handle, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y, previous: { ...preference.value }, moved: false }
    handle.setPointerCapture?.(event.pointerId)
  }
  function moveDrag(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return
    const dx = event.clientX - gesture.startX, dy = event.clientY - gesture.startY
    if (!gesture.moved && Math.hypot(dx, dy) < 5) return
    gesture.moved = true; dragging.value = true
    event.preventDefault()
    const bounds = dockBounds(viewport, size, bottomGap)
    position.x = clamp(gesture.x + dx, bounds.minX, bounds.maxX)
    position.y = clamp(gesture.y + dy, bounds.minY, bounds.maxY)
  }
  function endDrag(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return
    if (gesture.moved) {
      suppressClick = true
      preference.value = {
        side: closestDock(position.x, size, viewport),
        verticalRatio: clamp((position.y + size.height / 2 - viewport.top) / Math.max(1, viewport.height), 0, 1)
      }
      save()
    }
    releasePointer()
    place()
  }
  function allowClick(event: MouseEvent) {
    const allowed = !suppressClick || event.detail === 0 // Enter/Space must still open the assistant after a drag.
    suppressClick = false
    if (!allowed) event.preventDefault()
    return allowed
  }
  function moveWithKeyboard(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.target !== event.currentTarget) return
    event.preventDefault()
    cancelDrag()
    if (event.key === 'ArrowLeft' || event.key === 'Home') preference.value.side = 'left'
    if (event.key === 'ArrowRight' || event.key === 'End') preference.value.side = 'right'
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const bounds = dockBounds(viewport, size, bottomGap)
      const top = clamp(position.y + (event.key === 'ArrowUp' ? -24 : 24), bounds.minY, bounds.maxY)
      preference.value.verticalRatio = clamp((top + size.height / 2 - viewport.top) / Math.max(1, viewport.height), 0, 1)
    }
    place(); save()
  }
  watch(opened, async () => { cancelDrag(); await nextTick(); measure() }, { flush: 'post' })
  watch(storageKey, () => { cancelDrag(); suppressClick = false; restore(); place() })
  onMounted(() => {
    restore()
    void refreshViewport()
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); if (floatingRoot.value) observer.observe(floatingRoot.value) }
    window.addEventListener('resize', refreshViewport)
    window.visualViewport?.addEventListener('resize', refreshViewport)
    window.visualViewport?.addEventListener('scroll', refreshViewport)
  })
  onBeforeUnmount(() => {
    releasePointer(); observer?.disconnect()
    window.removeEventListener('resize', refreshViewport)
    window.visualViewport?.removeEventListener('resize', refreshViewport)
    window.visualViewport?.removeEventListener('scroll', refreshViewport)
  })
  return { floatingRoot, floatingStyle, dockSide, dragging, startDrag, moveDrag, endDrag, cancelDrag, allowClick, moveWithKeyboard }
}
