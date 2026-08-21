import type { DesktopTargetConfig } from './config.js'
import {
  LoadingCoordinator,
  type LoadingFailureReason,
} from './loading-coordinator.js'
import { createLoadingPageDataUrl } from './loading-page.js'
import { createOfflinePageDataUrl } from './offline-page.js'
import { bringWindowToFront } from './runtime.js'
import { shouldShowOfflinePage } from './offline-page.js'

type Listener = (...args: any[]) => void

interface FlowWebContents {
  isDestroyed(): boolean
  on(event: string, listener: Listener): unknown
  removeListener(event: string, listener: Listener): unknown
  loadURL(url: string): Promise<unknown>
  reload(): void
  reloadIgnoringCache(): void
  stop(): void
  getURL(): string
  setWindowOpenHandler?(handler: (details: { url: string }) => { action: 'deny' }): void
}

interface FlowWindow {
  webContents: FlowWebContents
  on(event: string, listener: Listener): unknown
  removeListener(event: string, listener: Listener): unknown
  isDestroyed(): boolean
  isVisible(): boolean
  isMinimized(): boolean
  getBounds(): { x: number; y: number; width: number; height: number }
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void
  show(): void
  hide(): void
  focus(): void
  restore(): void
  destroy(): void
}

interface PreventableEvent {
  preventDefault(): void
}

export interface LoadingFlowOptions {
  mainWindow: FlowWindow
  loadingWindow: FlowWindow
  target: DesktopTargetConfig
  quit(): void
  isAllowedNavigation(url: string): boolean
  timeoutMs?: number
}

export interface InstalledLoadingFlow {
  startStartup(): boolean
  reload(force: boolean): boolean
  retry(): boolean
  fail(reason: Exclude<LoadingFailureReason, 'timeout' | 'load'>): void
  handleWillNavigate(event: PreventableEvent, url: string): boolean
  handleInPageNavigation(isMainFrame: boolean, url: string): void
  bringToFront(): void
  dispose(): void
}

export function installLoadingFlow(
  options: LoadingFlowOptions,
): InstalledLoadingFlow {
  const {
    mainWindow,
    loadingWindow,
    target,
    quit,
    isAllowedNavigation,
  } = options
  const mainWebContents = mainWindow.webContents
  const loadingWebContents = loadingWindow.webContents

  let state: 'idle' | 'loading' | 'offline' | 'disposed' = 'idle'
  let activeGeneration = 0
  let loadingPageRequest = 0
  let offlinePageDataUrl = ''
  let removeReloadListeners: (() => void) | undefined

  const syncBounds = () => {
    if (!mainWindow.isDestroyed() && !loadingWindow.isDestroyed()) {
      loadingWindow.setBounds(mainWindow.getBounds())
    }
  }

  const clearReloadListeners = () => {
    removeReloadListeners?.()
    removeReloadListeners = undefined
  }

  const coordinator = new LoadingCoordinator(
    {
      show: (mode) => {
        state = 'loading'
        const request = ++loadingPageRequest
        if (!mainWindow.isDestroyed()) {
          mainWindow.hide()
        }
        if (loadingWindow.isDestroyed()) {
          return
        }
        syncBounds()
        void loadingWebContents
          .loadURL(createLoadingPageDataUrl(target, mode))
          .then(() => {
            if (
              state === 'loading' &&
              request === loadingPageRequest &&
              !loadingWindow.isDestroyed()
            ) {
              loadingWindow.show()
            }
          })
          .catch(() => undefined)
      },
      hide: () => {
        state = 'idle'
        ++loadingPageRequest
        clearReloadListeners()
        if (!loadingWindow.isDestroyed()) {
          loadingWindow.hide()
        }
        if (!mainWindow.isDestroyed()) {
          mainWindow.show()
        }
      },
      showOffline: (reason) => {
        state = 'offline'
        ++loadingPageRequest
        clearReloadListeners()
        if (!loadingWindow.isDestroyed()) {
          loadingWindow.hide()
        }
        if (mainWindow.isDestroyed()) {
          return
        }
        mainWebContents.stop()
        offlinePageDataUrl = createOfflinePageDataUrl(target, reason)
        void mainWebContents
          .loadURL(offlinePageDataUrl)
          .then(() => {
            if (state === 'offline' && !mainWindow.isDestroyed()) {
              mainWindow.show()
            }
          })
          .catch(() => {
            if (state === 'offline' && !mainWindow.isDestroyed()) {
              mainWindow.show()
            }
          })
      },
    },
    options.timeoutMs,
  )

  const startFixedNavigation = (
    mode: 'startup' | 'recovery',
  ): boolean => {
    if (state === 'loading' || state === 'disposed' || mainWindow.isDestroyed()) {
      return false
    }

    clearReloadListeners()
    const generation = coordinator.start(mode)
    activeGeneration = generation
    void mainWebContents.loadURL(target.entryUrl).then(
      () => {
        if (isAllowedNavigation(mainWebContents.getURL())) {
          coordinator.finish(generation)
        } else {
          coordinator.fail('load', generation)
        }
      },
      () => coordinator.fail('load', generation),
    )
    return true
  }

  const startReload = (force: boolean): boolean => {
    if (state === 'offline') {
      return startFixedNavigation('recovery')
    }
    if (state !== 'idle' || mainWindow.isDestroyed()) {
      return false
    }

    const generation = coordinator.start('reload')
    activeGeneration = generation

    const finish = (
      _event: unknown,
      isMainFrame: boolean,
    ) => {
      if (
        isMainFrame &&
        isAllowedNavigation(mainWebContents.getURL())
      ) {
        clearReloadListeners()
        coordinator.finish(generation)
      }
    }
    const fail = (
      _event: unknown,
      errorCode: number,
      _errorDescription: string,
      validatedUrl: string,
      isMainFrame: boolean,
    ) => {
      if (
        shouldShowOfflinePage(
          isMainFrame,
          errorCode,
          validatedUrl,
          target,
        )
      ) {
        clearReloadListeners()
        coordinator.fail('load', generation)
      }
    }
    removeReloadListeners = () => {
      if (!mainWebContents.isDestroyed()) {
        mainWebContents.removeListener('did-frame-finish-load', finish)
        mainWebContents.removeListener('did-fail-load', fail)
      }
    }
    mainWebContents.on('did-frame-finish-load', finish)
    mainWebContents.on('did-fail-load', fail)

    if (force) {
      mainWebContents.reloadIgnoringCache()
    } else {
      mainWebContents.reload()
    }
    return true
  }

  const failRuntime = (
    reason: Exclude<LoadingFailureReason, 'timeout' | 'load'>,
  ) => {
    if (state === 'disposed' || state === 'offline' || mainWindow.isDestroyed()) {
      return
    }
    if (state === 'idle') {
      activeGeneration = coordinator.start('recovery')
    }
    coordinator.fail(reason, activeGeneration)
  }

  const handleOrdinaryLoadFailure = (
    _event: unknown,
    errorCode: number,
    _errorDescription: string,
    validatedUrl: string,
    isMainFrame: boolean,
  ) => {
    if (
      state !== 'idle' ||
      !shouldShowOfflinePage(
        isMainFrame,
        errorCode,
        validatedUrl,
        target,
      )
    ) {
      return
    }
    activeGeneration = coordinator.start('recovery')
    coordinator.fail('load', activeGeneration)
  }

  const handleWillNavigate = (
    event: PreventableEvent,
    url: string,
  ): boolean => {
    if (state !== 'offline' || url !== target.entryUrl) {
      return false
    }
    event.preventDefault()
    return startFixedNavigation('recovery')
  }

  const handleInPageNavigation = (isMainFrame: boolean, url: string) => {
    if (
      isMainFrame &&
      state === 'offline' &&
      (url === '#exit' || url === `${offlinePageDataUrl}#exit`)
    ) {
      quit()
    }
  }

  const bringToFront = () => {
    if (state === 'loading' && !loadingWindow.isDestroyed()) {
      bringWindowToFront(loadingWindow)
    } else if (!mainWindow.isDestroyed()) {
      bringWindowToFront(mainWindow)
    }
  }

  const onMainWindowClosed = () => dispose()
  const preventLoadingNavigation = (event: PreventableEvent) => event.preventDefault()

  const dispose = () => {
    if (state === 'disposed') {
      return
    }
    state = 'disposed'
    ++loadingPageRequest
    clearReloadListeners()
    coordinator.dispose()
    if (!mainWindow.isDestroyed()) {
      mainWindow.removeListener('move', syncBounds)
      mainWindow.removeListener('resize', syncBounds)
      mainWindow.removeListener('closed', onMainWindowClosed)
    }
    if (!loadingWebContents.isDestroyed()) {
      loadingWebContents.removeListener(
        'will-navigate',
        preventLoadingNavigation,
      )
    }
    if (!mainWebContents.isDestroyed()) {
      mainWebContents.removeListener(
        'did-fail-load',
        handleOrdinaryLoadFailure,
      )
    }
    if (!loadingWindow.isDestroyed()) {
      loadingWindow.destroy()
    }
  }

  mainWindow.on('move', syncBounds)
  mainWindow.on('resize', syncBounds)
  mainWindow.on('closed', onMainWindowClosed)
  loadingWebContents.on('will-navigate', preventLoadingNavigation)
  mainWebContents.on('did-fail-load', handleOrdinaryLoadFailure)
  loadingWebContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))

  return {
    startStartup: () => startFixedNavigation('startup'),
    reload: startReload,
    retry: () => state === 'offline' && startFixedNavigation('recovery'),
    fail: failRuntime,
    handleWillNavigate,
    handleInPageNavigation,
    bringToFront,
    dispose,
  }
}
