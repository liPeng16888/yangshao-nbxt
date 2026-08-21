import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import { installLoadingFlow } from './loading-flow'
import { isAllowedNavigation } from './security-policy'

interface Deferred {
  promise: Promise<void>
  resolve(): void
  reject(error?: Error): void
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (error?: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

class FakeWebContents extends EventEmitter {
  currentUrl = desktopTargets.internal.entryUrl
  destroyed = false
  readonly loads: Array<{ url: string; deferred: Deferred }> = []
  readonly reload = vi.fn()
  readonly reloadIgnoringCache = vi.fn()
  readonly stop = vi.fn()
  readonly clearStorageData = vi.fn()
  readonly cookies = { remove: vi.fn() }

  loadURL = vi.fn((url: string) => {
    this.currentUrl = url
    const load = { url, deferred: deferred() }
    this.loads.push(load)
    return load.deferred.promise
  })

  getURL = vi.fn(() => this.currentUrl)
  isDestroyed = vi.fn(() => this.destroyed)
}

class FakeWindow extends EventEmitter {
  readonly webContents = new FakeWebContents()
  destroyed = false
  visible = false
  bounds = { x: 20, y: 30, width: 1200, height: 760 }
  readonly show = vi.fn(() => (this.visible = true))
  readonly hide = vi.fn(() => (this.visible = false))
  readonly focus = vi.fn()
  readonly restore = vi.fn()
  readonly setBounds = vi.fn((bounds) => (this.bounds = { ...bounds }))
  readonly destroy = vi.fn(() => (this.destroyed = true))

  isDestroyed = vi.fn(() => this.destroyed)
  isVisible = vi.fn(() => this.visible)
  isMinimized = vi.fn(() => false)
  getBounds = vi.fn(() => ({ ...this.bounds }))
}

function fixture() {
  const mainWindow = new FakeWindow()
  const loadingWindow = new FakeWindow()
  const quit = vi.fn()
  const flow = installLoadingFlow({
    mainWindow,
    loadingWindow,
    target: desktopTargets.internal,
    quit,
    isAllowedNavigation: (url) =>
      isAllowedNavigation(url, desktopTargets.internal),
  })
  return { flow, mainWindow, loadingWindow, quit }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe('main-process loading flow integration', () => {
  it.each(['resolve', 'reject'] as const)(
    'ignores an old startup %s after timeout and recovery restart',
    async (outcome) => {
      vi.useFakeTimers()
      const { flow, mainWindow, loadingWindow } = fixture()

      flow.startStartup()
      const oldLoad = mainWindow.webContents.loads[0]!
      loadingWindow.webContents.loads[0]!.deferred.resolve()
      await flushPromises()
      vi.advanceTimersByTime(15_000)
      const offlineLoad = mainWindow.webContents.loads[1]!
      offlineLoad.deferred.resolve()
      await flushPromises()

      flow.retry()
      const recoveryLoad = mainWindow.webContents.loads[2]!
      loadingWindow.webContents.loads[1]!.deferred.resolve()
      await flushPromises()

      if (outcome === 'resolve') oldLoad.deferred.resolve()
      else oldLoad.deferred.reject(new Error('old navigation failed'))
      await flushPromises()

      expect(loadingWindow.visible).toBe(true)
      expect(mainWindow.visible).toBe(false)

      recoveryLoad.deferred.resolve()
      await flushPromises()
      expect(loadingWindow.visible).toBe(false)
      expect(mainWindow.visible).toBe(true)
    },
  )

  it('coalesces reload commands while a reload is active', async () => {
    const { flow, mainWindow } = fixture()
    flow.startStartup()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    expect(flow.reload(false)).toBe(true)
    expect(flow.reload(true)).toBe(false)
    expect(mainWindow.webContents.reload).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.reloadIgnoringCache).not.toHaveBeenCalled()

    mainWindow.webContents.emit('did-frame-finish-load', {}, true)
    expect(flow.reload(true)).toBe(true)
    expect(mainWindow.webContents.reloadIgnoringCache).toHaveBeenCalledOnce()
  })

  it('ignores queued finish and fail events from a timed-out reload after recovery starts', async () => {
    vi.useFakeTimers()
    const { flow, mainWindow, loadingWindow } = fixture()
    flow.startStartup()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    flow.reload(false)
    vi.advanceTimersByTime(15_000)
    mainWindow.webContents.loads[1]!.deferred.resolve()
    await flushPromises()
    flow.retry()
    const recoveryLoad = mainWindow.webContents.loads[2]!
    loadingWindow.webContents.loads.at(-1)!.deferred.resolve()
    await flushPromises()

    mainWindow.webContents.currentUrl = desktopTargets.internal.entryUrl
    mainWindow.webContents.emit('did-frame-finish-load', {}, true)
    mainWindow.webContents.emit(
      'did-fail-load', {}, -105, 'old network failure',
      desktopTargets.internal.entryUrl, true,
    )
    expect(loadingWindow.visible).toBe(true)
    expect(mainWindow.visible).toBe(false)

    recoveryLoad.deferred.resolve()
    await flushPromises()
    expect(loadingWindow.visible).toBe(false)
    expect(mainWindow.visible).toBe(true)
  })

  it('accepts only main-frame allowed-origin reload completion and failure', async () => {
    const { flow, mainWindow, loadingWindow } = fixture()
    flow.startStartup()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    flow.reload(false)
    loadingWindow.webContents.loads.at(-1)!.deferred.resolve()
    await flushPromises()
    mainWindow.webContents.emit('did-frame-finish-load', {}, false)
    mainWindow.webContents.emit(
      'did-fail-load', {}, -105, 'network',
      'https://www.ysjc.art/api/stream', false,
    )
    expect(loadingWindow.visible).toBe(true)

    mainWindow.webContents.currentUrl = 'https://evil.example/'
    mainWindow.webContents.emit('did-frame-finish-load', {}, true)
    expect(loadingWindow.visible).toBe(true)

    mainWindow.webContents.currentUrl = 'https://www.ysjc.art/dashboard'
    mainWindow.webContents.emit('did-frame-finish-load', {}, true)
    expect(loadingWindow.visible).toBe(false)

    flow.reload(true)
    mainWindow.webContents.emit(
      'did-fail-load', {}, -105, 'network',
      'https://www.ysjc.art/dashboard', true,
    )
    expect(mainWindow.webContents.loads.at(-1)?.url).toMatch(/^data:text\/html/)
  })

  it('reloads without clearing cookies, storage, preferences or userData', async () => {
    const { flow, mainWindow } = fixture()
    const removeUserData = vi.fn()
    flow.startStartup()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    flow.reload(false)
    mainWindow.webContents.emit('did-frame-finish-load', {}, true)
    flow.reload(true)
    mainWindow.webContents.emit('did-frame-finish-load', {}, true)

    expect(mainWindow.webContents.reload).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.reloadIgnoringCache).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.clearStorageData).not.toHaveBeenCalled()
    expect(mainWindow.webContents.cookies.remove).not.toHaveBeenCalled()
    expect(removeUserData).not.toHaveBeenCalled()
  })

  it('enters recovery for an ordinary main-document navigation failure only', async () => {
    const { flow, mainWindow } = fixture()
    flow.startStartup()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    mainWindow.webContents.emit(
      'did-fail-load', {}, -105, 'network',
      'https://www.ysjc.art/api/frame', false,
    )
    expect(mainWindow.webContents.loads).toHaveLength(1)

    mainWindow.webContents.emit(
      'did-fail-load', {}, -105, 'network',
      'https://www.ysjc.art/dashboard', true,
    )
    expect(mainWindow.webContents.loads.at(-1)?.url).toMatch(/^data:text\/html/)
  })

  it('retries only the fixed entry, exits locally and rejects unrelated navigation', async () => {
    vi.useFakeTimers()
    const { flow, mainWindow, quit } = fixture()
    flow.startStartup()
    vi.advanceTimersByTime(15_000)
    mainWindow.webContents.loads[1]!.deferred.resolve()
    await flushPromises()

    flow.handleInPageNavigation(true, '#exit')
    expect(quit).toHaveBeenCalledOnce()

    const retryEvent = { preventDefault: vi.fn() }
    expect(flow.handleWillNavigate(retryEvent, desktopTargets.internal.entryUrl)).toBe(true)
    expect(retryEvent.preventDefault).toHaveBeenCalledOnce()
    expect(mainWindow.webContents.loads.at(-1)?.url).toBe(
      desktopTargets.internal.entryUrl,
    )

    expect(
      flow.handleWillNavigate(
        { preventDefault: vi.fn() },
        'https://www.ysjc.art/dashboard',
      ),
    ).toBe(false)
  })

  it('shows, hides, follows bounds, focuses and destroys the loading window', async () => {
    const { flow, mainWindow, loadingWindow } = fixture()
    flow.startStartup()
    loadingWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()

    expect(mainWindow.hide).toHaveBeenCalled()
    expect(loadingWindow.show).toHaveBeenCalled()
    mainWindow.bounds = { x: 60, y: 70, width: 1300, height: 800 }
    mainWindow.emit('move')
    mainWindow.emit('resize')
    expect(loadingWindow.setBounds).toHaveBeenLastCalledWith(mainWindow.bounds)

    flow.bringToFront()
    expect(loadingWindow.focus).toHaveBeenCalledOnce()
    mainWindow.webContents.loads[0]!.deferred.resolve()
    await flushPromises()
    expect(loadingWindow.hide).toHaveBeenCalled()
    expect(mainWindow.show).toHaveBeenCalled()

    mainWindow.emit('closed')
    expect(loadingWindow.destroy).toHaveBeenCalledOnce()
    expect(() => flow.dispose()).not.toThrow()
  })

  it('disposes after Electron has destroyed the main browser window', () => {
    const { flow, mainWindow, loadingWindow } = fixture()
    const mainWebContents = mainWindow.webContents
    mainWindow.destroyed = true
    mainWebContents.destroyed = true

    Object.defineProperty(mainWindow, 'webContents', {
      get: () => {
        throw new Error('Object has been destroyed')
      },
    })

    expect(() => mainWindow.emit('closed')).not.toThrow()
    expect(loadingWindow.destroy).toHaveBeenCalledOnce()
    expect(() => flow.dispose()).not.toThrow()
    expect(mainWebContents.listenerCount('did-fail-load')).toBe(1)
  })
})
