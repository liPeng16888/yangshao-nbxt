import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMocks = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('@/utils/request', () => ({
  default: requestMocks,
  useMocks: false
}))

import {
  createSharedPrepaidEventSource,
  createSharedPrepaidStreamTicket,
  isSharedPrepaidTerminalAuthError
} from './sharedPrepaid'

describe('shared prepaid realtime transport', () => {
  beforeEach(() => {
    requestMocks.post.mockReset()
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] || null,
      get length() { return values.size }
    })
    window.localStorage.setItem('ys_token', 'long-lived.raw.jwt')
  })

  it('obtains a short-lived ticket through the authenticated request client', async () => {
    requestMocks.post.mockResolvedValue({ ticket: 'opaque-ticket', expiresAt: 1234 })

    await expect(createSharedPrepaidStreamTicket()).resolves.toEqual({
      ticket: 'opaque-ticket', expiresAt: 1234
    })
    expect(requestMocks.post).toHaveBeenCalledWith('/shared-prepaid/stream-ticket')
  })

  it('puts only the opaque ticket in the EventSource URL and never the bearer token', () => {
    const EventSourceMock = vi.fn(function (this: { url: string }, url: string) {
      this.url = url
    })
    vi.stubGlobal('EventSource', EventSourceMock)

    createSharedPrepaidEventSource('opaque-ticket')

    const url = new URL(EventSourceMock.mock.calls[0][0])
    expect(url.pathname).toBe('/api/shared-prepaid/stream')
    expect(url.searchParams.get('ticket')).toBe('opaque-ticket')
    expect(url.searchParams.has('token')).toBe(false)
    expect(url.toString()).not.toContain('long-lived.raw.jwt')
  })

  it('classifies only 401 and 403 preflight responses as terminal authorization failures', () => {
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 401 } })).toBe(true)
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 403 } })).toBe(true)
    expect(isSharedPrepaidTerminalAuthError({ response: { status: 503 } })).toBe(false)
    expect(isSharedPrepaidTerminalAuthError(new Error('offline'))).toBe(false)
  })
})
