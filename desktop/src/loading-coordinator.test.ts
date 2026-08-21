import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoadingCoordinator } from './loading-coordinator'

afterEach(() => {
  vi.useRealTimers()
})

function callbacks() {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    showOffline: vi.fn(),
  }
}

describe('desktop loading coordinator', () => {
  it('shows a requested mode and hides it only after the active load finishes', () => {
    vi.useFakeTimers()
    const effects = callbacks()
    const coordinator = new LoadingCoordinator(effects)

    const generation = coordinator.start('reload')
    coordinator.finish(generation)
    vi.advanceTimersByTime(15_000)

    expect(effects.show).toHaveBeenCalledWith('reload')
    expect(effects.hide).toHaveBeenCalledOnce()
    expect(effects.showOffline).not.toHaveBeenCalled()
  })

  it('times out once after 15 seconds and a late finish cannot hide the failure', () => {
    vi.useFakeTimers()
    const effects = callbacks()
    const coordinator = new LoadingCoordinator(effects)

    const generation = coordinator.start('startup')
    vi.advanceTimersByTime(14_999)
    expect(effects.showOffline).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(effects.showOffline).toHaveBeenCalledOnce()
    expect(effects.showOffline).toHaveBeenCalledWith('timeout')
    coordinator.fail('load', generation)
    coordinator.finish(generation)
    expect(effects.showOffline).toHaveBeenCalledOnce()
    expect(effects.hide).not.toHaveBeenCalled()
  })

  it('restarting invalidates prior timers and stale navigation events', () => {
    vi.useFakeTimers()
    const effects = callbacks()
    const coordinator = new LoadingCoordinator(effects)

    const oldGeneration = coordinator.start('startup')
    vi.advanceTimersByTime(10_000)
    const activeGeneration = coordinator.start('recovery')
    coordinator.finish(oldGeneration)
    coordinator.fail('load', oldGeneration)
    vi.advanceTimersByTime(5_000)

    expect(effects.hide).not.toHaveBeenCalled()
    expect(effects.showOffline).not.toHaveBeenCalled()

    coordinator.finish(activeGeneration)
    vi.advanceTimersByTime(15_000)

    expect(effects.show).toHaveBeenNthCalledWith(1, 'startup')
    expect(effects.show).toHaveBeenNthCalledWith(2, 'recovery')
    expect(effects.hide).toHaveBeenCalledOnce()
    expect(effects.showOffline).not.toHaveBeenCalled()
  })

  it('dispose permanently cancels the active load and ignores later events', () => {
    vi.useFakeTimers()
    const effects = callbacks()
    const coordinator = new LoadingCoordinator(effects)

    const generation = coordinator.start('startup')
    coordinator.dispose()
    coordinator.finish(generation)
    coordinator.fail('unresponsive', generation)
    coordinator.start('recovery')
    vi.advanceTimersByTime(30_000)

    expect(effects.show).toHaveBeenCalledOnce()
    expect(effects.hide).not.toHaveBeenCalled()
    expect(effects.showOffline).not.toHaveBeenCalled()
  })
})
