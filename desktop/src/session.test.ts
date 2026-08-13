import { describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import { clearHttpCache, resolveUserDataPath } from './session'

describe('desktop session isolation', () => {
  it('places each target in its own userData directory', () => {
    expect(
      resolveUserDataPath('/Users/example/Library/Application Support', desktopTargets.internal),
    ).toBe('/Users/example/Library/Application Support/YangshaoInternalSystem')
    expect(
      resolveUserDataPath('/Users/example/Library/Application Support', desktopTargets.backend),
    ).toBe('/Users/example/Library/Application Support/YangshaoBackendSystem')
  })

  it('clears only HTTP cache and preserves authentication storage', async () => {
    const session = {
      clearCache: vi.fn().mockResolvedValue(undefined),
      clearStorageData: vi.fn().mockResolvedValue(undefined),
      clearAuthCache: vi.fn().mockResolvedValue(undefined),
    }

    await clearHttpCache(session)

    expect(session.clearCache).toHaveBeenCalledOnce()
    expect(session.clearStorageData).not.toHaveBeenCalled()
    expect(session.clearAuthCache).not.toHaveBeenCalled()
  })
})
