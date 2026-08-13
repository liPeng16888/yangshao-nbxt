import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Event,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from 'electron'
import { fileURLToPath } from 'node:url'

import { installContextMenu } from './context-menu.js'
import { configureDownloadPrompt } from './downloads.js'
import { confirmAndOpenExternalLink } from './external-links.js'
import { installFindWindow } from './find-window.js'
import { installLoadingFlow } from './loading-flow.js'
import {
  adjustWindowZoom,
  createApplicationMenuTemplate,
  resetWindowZoom,
} from './menu.js'
import {
  acquireSingleInstanceLock,
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
let showFindApplication: (() => void) | null = null
let findNextApplication: (() => void) | null = null
let findPreviousApplication: (() => void) | null = null

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
  const findWindow = installFindWindow({
    mainWindow: window,
    ipc: ipcMain,
    preloadPath: fileURLToPath(new URL('./find-preload.cjs', import.meta.url)),
    createWindow: (options) => new BrowserWindow(options),
  })
  const loadingFlow = installLoadingFlow({
    mainWindow: window,
    loadingWindow,
    target,
    quit: () => app.quit(),
    isAllowedNavigation: (url) => isAllowedNavigation(url, target),
  })
  const reloadWindow = (force: boolean) => loadingFlow.reload(force)

  reloadApplication = reloadWindow
  bringApplicationToFront = () => loadingFlow.bringToFront()
  showFindApplication = () => findWindow.show()
  findNextApplication = () => findWindow.findNext()
  findPreviousApplication = () => findWindow.findPrevious()

  window.on('closed', () => {
    removeContextMenu()
    findWindow.dispose()
    if (reloadApplication === reloadWindow) {
      reloadApplication = null
    }
    if (mainWindow === window) {
      bringApplicationToFront = null
      showFindApplication = null
      findNextApplication = null
      findPreviousApplication = null
    }
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(target.productName)
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!loadingFlow.handleWillNavigate(event, url)) {
      handleRendererNavigation(event, url)
    }
  })
  window.webContents.on('will-redirect', handleRendererNavigation)
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  window.webContents.on('did-finish-load', () => {
    window.setTitle(target.productName)
  })
  window.webContents.on(
    'did-navigate-in-page',
    (_event, url, isMainFrame) => {
      loadingFlow.handleInPageNavigation(isMainFrame, url)
    },
  )
  window.webContents.on('render-process-gone', () => {
    loadingFlow.fail('render-process-gone')
  })
  window.on('unresponsive', () => {
    loadingFlow.fail('unresponsive')
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

  loadingFlow.startStartup()
  return window
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate(
    target.productName,
    process.platform,
    {
      reload: () => reloadApplication?.(false),
      forceReload: () => reloadApplication?.(true),
      showFind: () => showFindApplication?.(),
      findNext: () => findNextApplication?.(),
      findPrevious: () => findPreviousApplication?.(),
      resetZoom: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          resetWindowZoom(mainWindow.webContents)
        }
      },
      zoomIn: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          adjustWindowZoom(mainWindow.webContents, 0.1)
        }
      },
      zoomOut: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          adjustWindowZoom(mainWindow.webContents, -0.1)
        }
      },
      toggleFullScreen: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setFullScreen(!mainWindow.isFullScreen())
        }
      },
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
