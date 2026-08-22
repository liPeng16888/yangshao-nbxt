import { describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import { prepareOnlineShellSession, resolveUserDataPath } from './session'

describe('desktop session isolation', () => {
  it('places each target in its own userData directory', () => {
    expect(
      resolveUserDataPath('/Users/example/Library/Application Support', desktopTargets.internal),
    ).toBe('/Users/example/Library/Application Support/YangshaoInternalSystem')
    expect(
      resolveUserDataPath('/Users/example/Library/Application Support', desktopTargets.backend),
    ).toBe('/Users/example/Library/Application Support/YangshaoBackendSystem')
  })

  it('keeps reusable HTTP assets while removing stale application workers only', async () => {
    const session = {
      clearCache: vi.fn().mockResolvedValue(undefined),
      clearStorageData: vi.fn().mockResolvedValue(undefined),
      clearAuthCache: vi.fn().mockResolvedValue(undefined),
    }

    await prepareOnlineShellSession(session, desktopTargets.internal)

    expect(session.clearCache).not.toHaveBeenCalled()
    expect(session.clearStorageData).toHaveBeenCalledOnce()
    expect(session.clearStorageData).toHaveBeenCalledWith({
      origin: desktopTargets.internal.allowedOrigin,
      storages: ['serviceworkers', 'cachestorage'],
    })
    expect(session.clearAuthCache).not.toHaveBeenCalled()
  })
})
