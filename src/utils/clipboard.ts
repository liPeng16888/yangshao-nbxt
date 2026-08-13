export async function writeTextToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Some desktop webviews expose Clipboard but reject writes. Use the DOM fallback below.
  }

  const activeElement = document.activeElement
  const inputSelection = captureInputSelection(activeElement)
  const selectedRanges = captureSelectionRanges()
  const textarea = document.createElement('textarea')
  textarea.dataset.clipboardFallback = 'true'
  textarea.value = text
  textarea.readOnly = true
  textarea.tabIndex = -1
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)

  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    if (typeof document.execCommand === 'function' && document.execCommand('copy')) return
  } catch {
    // Normalize browser-specific clipboard errors after cleanup.
  } finally {
    textarea.remove()
    restoreFocusAndSelection(activeElement, inputSelection, selectedRanges)
  }

  throw new Error('复制失败')
}

type InputSelection = {
  start: number | null
  end: number | null
  direction: 'forward' | 'backward' | 'none' | undefined
}

function captureInputSelection(element: Element | null): InputSelection | undefined {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return undefined
  return {
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection ?? undefined
  }
}

function captureSelectionRanges(): Range[] {
  const selection = window.getSelection()
  if (!selection) return []
  return Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
}

function restoreFocusAndSelection(
  activeElement: Element | null,
  inputSelection: InputSelection | undefined,
  selectedRanges: Range[]
) {
  try {
    if (activeElement instanceof HTMLElement && activeElement.isConnected) activeElement.focus()
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
