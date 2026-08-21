export async function writeTextToClipboard(text: string): Promise<void> {
  let clipboard: Clipboard | undefined
  try {
    clipboard = navigator.clipboard
    if (clipboard?.writeText) {
      await clipboard.writeText(text)
      return
    }
  } catch {
    // Some desktop webviews expose Clipboard but reject writes. Use the DOM fallback below.
  }

  const snapshot = captureFallbackSnapshot()
  let textarea: HTMLTextAreaElement | undefined

  try {
    textarea = document.createElement('textarea')
    textarea.dataset.clipboardFallback = 'true'
    textarea.value = text
    textarea.readOnly = true
    textarea.tabIndex = -1
    textarea.setAttribute('aria-hidden', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.style.left = '-9999px'
    const body = document.body
    if (!body) throw new Error('body unavailable')
    body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    if (typeof document.execCommand === 'function' && document.execCommand('copy')) return
  } catch {
    // Normalize browser-specific clipboard errors after cleanup.
  } finally {
    cleanupFallbackTextarea(textarea)
    restoreFocusAndSelection(snapshot)
  }

  throw new Error('复制失败')
}

function cleanupFallbackTextarea(textarea: HTMLTextAreaElement | undefined) {
  if (!textarea) return

  try {
    textarea.remove()
  } catch {
    // Try the parent path below.
  }

  let parent: ParentNode | null = null
  try {
    parent = textarea.parentNode
    if (!textarea.isConnected && !parent) return
  } catch {
    neutralizeFallbackTextarea(textarea)
    return
  }

  try {
    parent?.removeChild(textarea)
  } catch {
    // A hostile DOM shim can reject both removal paths. Neutralize in place below.
  }

  try {
    if (!textarea.isConnected && !textarea.parentNode) return
  } catch {
    // If connected state is unreadable, neutralize the retained node defensively.
  }
  neutralizeFallbackTextarea(textarea)
}

function neutralizeFallbackTextarea(textarea: HTMLTextAreaElement) {
  try { textarea.value = '' } catch { /* best effort */ }
  try { textarea.readOnly = true } catch { /* best effort */ }
  try { textarea.disabled = true } catch { /* best effort */ }
  try { textarea.tabIndex = -1 } catch { /* best effort */ }
  try { textarea.setAttribute('aria-hidden', 'true') } catch { /* best effort */ }
  try { textarea.setAttribute('inert', '') } catch { /* best effort */ }
  try { textarea.style.position = 'fixed' } catch { /* best effort */ }
  try { textarea.style.opacity = '0' } catch { /* best effort */ }
  try { textarea.style.pointerEvents = 'none' } catch { /* best effort */ }
  try { textarea.style.left = '-9999px' } catch { /* best effort */ }
}

type InputSelection = {
  start: number | null
  end: number | null
  direction: 'forward' | 'backward' | 'none' | undefined
}

type FallbackSnapshot = {
  activeElement: Element | null
  inputSelection?: InputSelection
  selectedRanges: Range[]
}

function captureFallbackSnapshot(): FallbackSnapshot {
  let activeElement: Element | null = null
  try {
    activeElement = document.activeElement
  } catch {
    // Focus preservation is best effort only.
  }
  return {
    activeElement,
    inputSelection: captureInputSelection(activeElement),
    selectedRanges: captureSelectionRanges()
  }
}

function captureInputSelection(element: Element | null): InputSelection | undefined {
  try {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return undefined
    return {
      start: element.selectionStart,
      end: element.selectionEnd,
      direction: element.selectionDirection ?? undefined
    }
  } catch {
    return undefined
  }
}

function captureSelectionRanges(): Range[] {
  try {
    const selection = window.getSelection()
    if (!selection) return []
    const ranges: Range[] = []
    for (let index = 0; index < selection.rangeCount; index += 1) {
      try {
        ranges.push(selection.getRangeAt(index).cloneRange())
      } catch {
        // Preserve any ranges captured before a browser-specific selection failure.
      }
    }
    return ranges
  } catch {
    return []
  }
}

function restoreFocusAndSelection({ activeElement, inputSelection, selectedRanges }: FallbackSnapshot) {
  try {
    const focusable = activeElement as (Element & { focus?: () => void }) | null
    if (focusable?.isConnected && typeof focusable.focus === 'function') focusable.focus()
    if (
      inputSelection &&
      activeElement?.isConnected &&
      (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
    ) {
      activeElement.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction)
    }
  } catch {
    // A removed or disabled focus target must not make a successful copy fail.
  }

  try {
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selectedRanges.forEach((range) => selection.addRange(range))
  } catch {
    // Selection restoration is best effort only.
  }
}
