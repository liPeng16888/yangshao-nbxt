import { describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import {
  acquireSingleInstanceLock,
  bringWindowToFront,
  resolveRuntimeDesktopTarget,
} from './runtime'

describe('desktop runtime target selection', () => {
  it('uses the packaged product name and ignores environment overrides', () => {
    expect(
      resolveRuntimeDesktopTarget({
        isPackaged: true,
        appName: '仰韶化验内部系统',
        environmentTarget: 'backend',
      }),
    ).toBe(desktopTargets.internal)
    expect(
      resolveRuntimeDesktopTarget({
        isPackaged: true,
        appName: '仰韶化验后端系统',
        environmentTarget: 'internal',
      }),
    ).toBe(desktopTargets.backend)
  })

  it('requires an explicit supported target during development', () => {
    expect(
      resolveRuntimeDesktopTarget({
        isPackaged: false,
        appName: '@yangshao/desktop',
        environmentTarget: 'backend',
      }),
    ).toBe(desktopTargets.backend)
    expect(() =>
      resolveRuntimeDesktopTarget({
        isPackaged: false,
        appName: '@yangshao/desktop',
        environmentTarget: undefined,
      }),
    ).toThrow('Unsupported desktop target: undefined')
  })

  it('rejects an unexpected packaged product identity', () => {
    expect(() =>
      resolveRuntimeDesktopTarget({
        isPackaged: true,
        appName: 'Fake Yangshao App',
        environmentTarget: 'internal',
      }),
    ).toThrow('Unsupported packaged desktop product: Fake Yangshao App')
  })
})

describe('desktop single-instance behavior', () => {
  it('quits immediately when the target already has an instance', () => {
    const app = {
      requestSingleInstanceLock: vi.fn().mockReturnValue(false),
      quit: vi.fn(),
    }

    expect(acquireSingleInstanceLock(app)).toBe(false)
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('keeps running when the target obtains its lock', () => {
    const app = {
      requestSingleInstanceLock: vi.fn().mockReturnValue(true),
      quit: vi.fn(),
    }

    expect(acquireSingleInstanceLock(app)).toBe(true)
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('restores, shows and focuses the existing window', () => {
    const window = {
      isMinimized: vi.fn().mockReturnValue(true),
      isVisible: vi.fn().mockReturnValue(false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }

    bringWindowToFront(window)

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})
