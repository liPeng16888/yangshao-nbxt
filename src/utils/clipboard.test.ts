import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeTextToClipboard } from './clipboard'

const originalClipboard = navigator.clipboard
const originalExecCommand = document.execCommand

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard })
  Object.defineProperty(document, 'execCommand', { configurable: true, value: originalExecCommand })
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
})
