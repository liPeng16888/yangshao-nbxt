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

import { configureDownloadPrompt } from './downloads.js'
import { confirmAndOpenExternalLink } from './external-links.js'
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
import { createWindowOptions } from './window-options.js'

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
let showingOfflinePage = false

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

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })
  window.once('ready-to-show', () => window.show())

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
      if (isMainFrame && isAllowedNavigation(url, target)) {
        showingOfflinePage = false
      }
    },
  )
  window.webContents.on('did-finish-load', () => {
    window.setTitle(target.productName)
  })
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, validatedUrl, isMainFrame) => {
      if (
        !showingOfflinePage &&
        shouldShowOfflinePage(
          isMainFrame,
          errorCode,
          validatedUrl,
          target,
        )
      ) {
        showingOfflinePage = true
        void window
          .loadURL(createOfflinePageDataUrl(target))
          .catch(() => undefined)
      }
    },
  )

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyNavigation(url, target)
    if (decision === 'allow') {
      void window.loadURL(url).catch(() => undefined)
    } else if (decision === 'external-https') {
      requestExternalLink(url)
    }
    return { action: 'deny' }
  })

  void window.loadURL(target.entryUrl).catch(() => undefined)
  return window
}

function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate(
    target.productName,
    process.platform,
    {
      reload: () => mainWindow?.webContents.reload(),
      forceReload: () => mainWindow?.webContents.reloadIgnoringCache(),
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

  desktopSession.setPermissionCheckHandler((_webContents, permission) =>
    shouldGrantPermission(permission),
  )
  desktopSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(shouldGrantPermission(permission))
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
      bringWindowToFront(mainWindow)
    }
  })
}

if (acquireSingleInstanceLock(app)) {
  app.on('second-instance', () => bringWindowToFront(mainWindow))
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
