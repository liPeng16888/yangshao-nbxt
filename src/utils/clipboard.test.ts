import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeTextToClipboard } from './clipboard'

const originalClipboard = navigator.clipboard
const originalExecCommand = document.execCommand

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand })
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('writeTextToClipboard', () => {
  it('uses the browser clipboard without creating a fallback node', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await writeTextToClipboard('化验短信')

    expect(writeText).toHaveBeenCalledWith('化验短信')
    expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
  })

  it('falls back to a selected readonly textarea and always removes it', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const execCommand = vi.fn().mockImplementation(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-clipboard-fallback]')
      expect(textarea).not.toBeNull()
      expect(textarea?.readOnly).toBe(true)
      expect(textarea?.getAttribute('aria-hidden')).toBe('true')
      expect(textarea?.selectionStart).toBe(0)
      expect(textarea?.selectionEnd).toBe('化验短信'.length)
      return true
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await writeTextToClipboard('化验短信')

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
  })

  it('falls back when the browser clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await writeTextToClipboard('客户信息')

    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back when the browser clipboard getter throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      get: () => { throw new Error('clipboard unavailable') }
    })
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await writeTextToClipboard('客户信息')

    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('copies empty text through the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const execCommand = vi.fn().mockImplementation(() => {
      expect(document.querySelector<HTMLTextAreaElement>('[data-clipboard-fallback]')?.value).toBe('')
      return true
    })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await writeTextToClipboard('')

    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('restores the active input selection after a fallback copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const input = document.createElement('input')
    input.value = '原有选择内容'
    document.body.appendChild(input)
    input.focus()
    input.setSelectionRange(2, 5, 'backward')

    await writeTextToClipboard('客户信息')

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(5)
    expect(input.selectionDirection).toBe('backward')
  })

  it('rejects once when both browser methods fail and removes the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) })

    await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')

    expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
  })

  it('normalizes a throwing execCommand failure and removes the fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => { throw new Error('denied') }) })

    await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')

    expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
  })

  it('normalizes a missing document body failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    vi.spyOn(document, 'body', 'get').mockReturnValue(null as unknown as HTMLBodyElement)

    await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')
  })

  it('normalizes an append failure without leaving a fallback node', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => { throw new Error('append denied') })

    await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')

    expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
  })

  it('normalizes a fallback textarea creation failure', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'textarea') throw new Error('creation denied')
      return createElement(tagName)
    })

    await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')
  })

  it.each(['focus', 'select', 'setSelectionRange'] as const)(
    'normalizes a fallback textarea %s failure',
    async (method) => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
      vi.spyOn(HTMLTextAreaElement.prototype, method).mockImplementation(() => { throw new Error(`${method} denied`) })

      await expect(writeTextToClipboard('内容')).rejects.toThrow('复制失败')

      expect(document.querySelector('[data-clipboard-fallback]')).toBeNull()
    }
  )

  it('still copies when reading the active input selection throws', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    vi.spyOn(HTMLInputElement.prototype, 'selectionStart', 'get').mockImplementation(() => { throw new Error('selection unavailable') })

    await expect(writeTextToClipboard('内容')).resolves.toBeUndefined()
  })

  it('still copies when reading the active element throws once', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    vi.spyOn(document, 'activeElement', 'get').mockImplementationOnce(() => { throw new Error('active unavailable') })

    await expect(writeTextToClipboard('内容')).resolves.toBeUndefined()
  })

  it('restores document selection ranges after fallback copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const text = document.createTextNode('已有选择')
    document.body.appendChild(text)
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 3)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    await writeTextToClipboard('内容')

    expect(selection.toString()).toBe('有选')
  })

  it('still copies when selection range cloning throws', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    vi.spyOn(window, 'getSelection')
      .mockReturnValueOnce({ rangeCount: 1, getRangeAt: () => ({ cloneRange: () => { throw new Error('clone failed') } }) } as unknown as Selection)
      .mockReturnValueOnce(null)

    await expect(writeTextToClipboard('内容')).resolves.toBeUndefined()
  })

  it('still resolves when selection restoration throws after a successful copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    vi.spyOn(window, 'getSelection')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ removeAllRanges: () => { throw new Error('restore failed') } } as unknown as Selection)

    await expect(writeTextToClipboard('内容')).resolves.toBeUndefined()
  })

  it('does not fail when the active element is removed while copying', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        input.remove()
        return true
      })
    })

    await expect(writeTextToClipboard('内容')).resolves.toBeUndefined()
  })

  it('restores a connected generic focusable element', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(true) })
    const activeElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const focus = vi.fn()
    Object.assign(activeElement, { focus })
    document.body.appendChild(activeElement)
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(activeElement)

    await writeTextToClipboard('内容')

    expect(focus).toHaveBeenCalled()
  })
})
