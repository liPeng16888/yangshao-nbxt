import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Event,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from 'electron'

import { installContextMenu } from './context-menu.js'
import { configureDownloadPrompt } from './downloads.js'
import { confirmAndOpenExternalLink } from './external-links.js'
import {
  LoadingCoordinator,
  type LoadingFailureReason,
} from './loading-coordinator.js'
import { createLoadingPageDataUrl } from './loading-page.js'
import { createApplicationMenuTemplate } from './menu.js'
import {
  createOfflinePageDataUrl,
  shouldShowOfflinePage,
} from './offline-page.js'
import {
  acquireSingleInstanceLock,
  bringWindowToFront,
  resolveRuntimeDesktopTarget,
} from './runtime.js'
import {
  buildMainDocumentCsp,
  classifyNavigation,
  isAllowedNavigation,
  shouldAcceptCertificateError,
  shouldGrantPermission,
  withMainDocumentCsp,
  type ResponseHeaders,
} from './security-policy.js'
import { clearHttpCache, resolveUserDataPath } from './session.js'
import {
  createLoadingWindowOptions,
  createWindowOptions,
} from './window-options.js'

const target = resolveRuntimeDesktopTarget({
  isPackaged: app.isPackaged,
  appName: app.getName(),
  environmentTarget: process.env.YANGSHAO_DESKTOP_TARGET,
})

app.setName(target.productName)
app.setPath(
  'userData',
  resolveUserDataPath(app.getPath('appData'), target),
)

let mainWindow: BrowserWindow | null = null
let reloadApplication: ((force: boolean) => void) | null = null
let bringApplicationToFront: (() => void) | null = null

function showApplicationMessageBox(
  options: MessageBoxOptions,
): Promise<MessageBoxReturnValue> {
  return mainWindow
    ? dialog.showMessageBox(mainWindow, options)
    : dialog.showMessageBox(options)
}

function requestExternalLink(rawUrl: string): void {
  void confirmAndOpenExternalLink(
    rawUrl,
    target,
    async (origin) => {
      const result = await showApplicationMessageBox({
        type: 'question',
        title: '打开外部链接',
        message: '是否使用系统浏览器打开此网站？',
        detail: origin,
        buttons: ['打开', '取消'],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      })
      return result.response === 0
    },
    (url) => shell.openExternal(url),
  )
}

function handleRendererNavigation(event: Event, rawUrl: string): void {
  const decision = classifyNavigation(rawUrl, target)
  if (decision === 'allow') {
    return
  }

  event.preventDefault()
  if (decision === 'external-https') {
    requestExternalLink(rawUrl)
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(
    createWindowOptions(target) as BrowserWindowConstructorOptions,
  )
  const loadingWindow = new BrowserWindow(
    createLoadingWindowOptions(
      target,
      window.getBounds(),
    ) as BrowserWindowConstructorOptions,
  )

  const removeContextMenu = installContextMenu(window)
  let showingOfflinePage = false
  let offlinePageDataUrl = ''
  let activeLoadingGeneration = 0
  let loadingInProgress = false
  let loadingPageRequest = 0

  const syncLoadingWindowBounds = () => {
    if (!loadingWindow.isDestroyed() && !window.isDestroyed()) {
      loadingWindow.setBounds(window.getBounds())
    }
  }

  const coordinator = new LoadingCoordinator({
    show: (mode) => {
      loadingInProgress = true
      ++loadingPageRequest
      const request = loadingPageRequest
      if (!window.isDestroyed()) {
        window.hide()
      }
      if (loadingWindow.isDestroyed()) {
        return
      }
      syncLoadingWindowBounds()
      void loadingWindow
        .loadURL(createLoadingPageDataUrl(target, mode))
        .then(() => {
          if (
            request === loadingPageRequest &&
            loadingInProgress &&
            !loadingWindow.isDestroyed()
          ) {
            loadingWindow.show()
          }
        })
        .catch(() => undefined)
    },
    hide: () => {
      loadingInProgress = false
      ++loadingPageRequest
      if (!loadingWindow.isDestroyed()) {
        loadingWindow.hide()
      }
      if (!window.isDestroyed()) {
        window.show()
      }
    },
    showOffline: (reason) => {
      loadingInProgress = false
      showingOfflinePage = true
      ++loadingPageRequest
      if (!loadingWindow.isDestroyed()) {
        loadingWindow.hide()
      }
      if (window.isDestroyed()) {
        return
      }
      offlinePageDataUrl = createOfflinePageDataUrl(target, reason)
      void window
        .loadURL(offlinePageDataUrl)
        .then(() => {
          if (showingOfflinePage && !window.isDestroyed()) {
            window.show()
          }
        })
        .catch(() => {
          if (!window.isDestroyed()) {
            window.show()
          }
        })
    },
  })

  const failLoading = (
    reason: LoadingFailureReason,
    generation?: number,
  ) => {
    if (showingOfflinePage || window.isDestroyed()) {
      return
    }
    if (generation !== undefined) {
      coordinator.fail(reason, generation)
      return
    }
    if (!loadingInProgress) {
      activeLoadingGeneration = coordinator.start('recovery')
    }
    coordinator.fail(reason, activeLoadingGeneration)
  }

  const loadFixedTarget = (mode: 'startup' | 'recovery') => {
    showingOfflinePage = false
    const generation = coordinator.start(mode)
    activeLoadingGeneration = generation
    void window.loadURL(target.entryUrl).catch(() => {
      failLoading('load', generation)
    })
  }

  const reloadWindow = (force: boolean) => {
    if (window.isDestroyed()) {
      return
    }
    if (showingOfflinePage) {
      loadFixedTarget('recovery')
      return
    }
    activeLoadingGeneration = coordinator.start('reload')
    if (force) {
      window.webContents.reloadIgnoringCache()
    } else {
      window.webContents.reload()
    }
  }

  reloadApplication = reloadWindow
  bringApplicationToFront = () => {
    if (loadingInProgress && !loadingWindow.isDestroyed()) {
      bringWindowToFront(loadingWindow)
    } else if (!window.isDestroyed()) {
      bringWindowToFront(window)
    }
  }

  loadingWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  loadingWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  window.on('closed', () => {
    removeContextMenu()
    coordinator.dispose()
    if (!loadingWindow.isDestroyed()) {
      loadingWindow.destroy()
    }
    if (reloadApplication === reloadWindow) {
      reloadApplication = null
    }
    if (mainWindow === window) {
      bringApplicationToFront = null
    }
    if (mainWindow === window) {
      mainWindow = null
    }
  })
  window.on('move', syncLoadingWindowBounds)
  window.on('resize', syncLoadingWindowBounds)

  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(target.productName)
  })
  window.webContents.on('will-navigate', handleRendererNavigation)
  window.webContents.on('will-redirect', handleRendererNavigation)
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.on(
    'did-start-navigation',
    (_event, url, _isInPlace, isMainFrame) => {
      if (
        isMainFrame &&
        showingOfflinePage &&
        url === target.entryUrl
      ) {
        showingOfflinePage = false
        activeLoadingGeneration = coordinator.start('recovery')
      }
    },
  )
  window.webContents.on(
    'did-frame-finish-load',
    (_event, isMainFrame) => {
      if (
        isMainFrame &&
        isAllowedNavigation(window.webContents.getURL(), target)
      ) {
        coordinator.finish(activeLoadingGeneration)
      }
    },
  )
  window.webContents.on('did-finish-load', () => {
    window.setTitle(target.productName)
  })
  window.webContents.on(
    'did-navigate-in-page',
    (_event, url, isMainFrame) => {
      if (
        isMainFrame &&
        showingOfflinePage &&
        offlinePageDataUrl &&
        url === `${offlinePageDataUrl}#exit`
      ) {
        app.quit()
      }
    },
  )
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, validatedUrl, isMainFrame) => {
      if (
        shouldShowOfflinePage(
          isMainFrame,
          errorCode,
          validatedUrl,
          target,
        )
      ) {
        failLoading('load')
      }
    },
  )
  window.webContents.on('render-process-gone', () => {
    failLoading('render-process-gone')
  })
  window.on('unresponsive', () => {
    failLoading('unresponsive')
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyNavigation(url, target)
    if (decision === 'allow') {
      void window.loadURL(url).catch(() => undefined)
    } else if (decision === 'external-https') {
      requestExternalLink(url)
    }
    return { action: 'deny' }
  })

  loadFixedTarget('startup')
  return window
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate(
    target.productName,
    process.platform,
    {
      reload: () => reloadApplication?.(false),
      forceReload: () => reloadApplication?.(true),
      about: () => {
        void showApplicationMessageBox({
          type: 'info',
          title: `关于 ${target.productName}`,
          message: target.productName,
          detail: `版本 ${app.getVersion()}`,
          buttons: ['确定'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
      },
      quit: () => app.quit(),
    },
  )

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(template as MenuItemConstructorOptions[]),
  )
}

function configureDefaultSession(): void {
  const desktopSession = session.defaultSession

  desktopSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) =>
      shouldGrantPermission(
        permission,
        {
          requestingUrl: details.requestingUrl ?? requestingOrigin,
          isMainFrame: details.isMainFrame,
        },
        target,
      ),
  )
  desktopSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(
        shouldGrantPermission(
          permission,
          {
            requestingUrl: details.requestingUrl,
            isMainFrame: details.isMainFrame,
          },
          target,
        ),
      )
    },
  )
  desktopSession.setDevicePermissionHandler(() => false)

  const csp = buildMainDocumentCsp(target)
  desktopSession.webRequest.onHeadersReceived((details, callback) => {
    if (
      details.resourceType !== 'mainFrame' ||
      !isAllowedNavigation(details.url, target)
    ) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: withMainDocumentCsp(
        (details.responseHeaders ?? {}) as ResponseHeaders,
        csp,
      ),
    })
  })

  desktopSession.on('will-download', (_event, item, webContents) => {
    configureDownloadPrompt(
      item,
      target,
      app.getPath('downloads'),
      webContents.getURL(),
    )
  })
}

async function startApplication(): Promise<void> {
  await app.whenReady()
  app.setAppUserModelId(target.appId)
  configureDefaultSession()
  await clearHttpCache(session.defaultSession)
  installApplicationMenu()
  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow()
    } else {
      bringApplicationToFront?.()
    }
  })
}

if (acquireSingleInstanceLock(app)) {
  app.on('second-instance', () => bringApplicationToFront?.())
  app.on(
    'certificate-error',
    (event, _webContents, url, error, _certificate, callback) => {
      event.preventDefault()
      callback(shouldAcceptCertificateError(url, error))
    },
  )
  app.on('window-all-closed', () => app.quit())

  void startApplication().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(`${target.productName} 启动失败`, message)
    app.quit()
  })
}
