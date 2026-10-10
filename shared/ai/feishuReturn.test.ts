import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { feishuLoginReturn, rememberFeishuReturn, safeFeishuReturn } from './feishuReturn'
const target = '/ai/feishu/bind#proof=' + 'a'.repeat(32)
beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())
describe('Feishu login return boundaries', () => {
  it('keeps the proof in per-audience session storage and consumes it only after login', () => { rememberFeishuReturn('frontend', target); expect(feishuLoginReturn('admin')).toBe('/data'); expect(feishuLoginReturn('frontend')).toBe(target); expect(feishuLoginReturn('frontend', true)).toBe(target); expect(feishuLoginReturn('frontend')).toBe('/data') })
  it('rejects external, protocol-relative, encoded and non-verification redirects', () => { for (const value of ['https://evil.example' + target, '//evil.example', '/data#proof=' + 'a'.repeat(32), '/ai/feishu/bind?redirect=https://evil.example', '/ai/feishu/bind#proof=a&next=https://evil.example']) expect(safeFeishuReturn(value)).toBeNull() })
  it('expires the login continuation with the invitation window', () => { rememberFeishuReturn('frontend', target); vi.advanceTimersByTime(600001); expect(feishuLoginReturn('frontend')).toBe('/data') })
})
