import type {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Event,
  FoundInPageResult,
  IpcMain,
  IpcMainEvent,
} from 'electron'

import { createFindPageDataUrl } from './find-page.js'

export const FIND_QUERY_CHANNEL = 'desktop-find:query'
export const FIND_CLOSE_CHANNEL = 'desktop-find:close'
export const FIND_RESULT_CHANNEL = 'desktop-find:result'

export interface FindRequest {
  query: string
  forward: boolean
}

type Listener = (...args: any[]) => void

interface FindMainWindow {
  webContents: {
    on(event: string, listener: Listener): unknown
    removeListener(event: string, listener: Listener): unknown
    findInPage(
      text: string,
      options: { forward: boolean; findNext: boolean },
    ): number
    stopFindInPage(action: 'clearSelection'): void
    isDestroyed(): boolean
  }
  on(event: string, listener: Listener): unknown
  removeListener(event: string, listener: Listener): unknown
  isDestroyed(): boolean
}

interface FindChildWindow {
  webContents: {
    readonly id: number
    on(event: string, listener: Listener): unknown
    removeListener(event: string, listener: Listener): unknown
    send(channel: string, value: unknown): void
    loadURL(url: string): Promise<unknown>
    setWindowOpenHandler(
      handler: (details: { url: string }) => { action: 'deny' },
    ): void
    isDestroyed(): boolean
  }
  on(event: string, listener: Listener): unknown
  removeListener(event: string, listener: Listener): unknown
  isDestroyed(): boolean
  show(): void
  focus(): void
  close(): void
  destroy(): void
}

interface FindIpc {
  on(channel: string, listener: Listener): unknown
  removeListener(channel: string, listener: Listener): unknown
}

export interface FindWindowOptions {
  mainWindow: FindMainWindow
  ipc: FindIpc
  preloadPath: string
  createWindow(options: BrowserWindowConstructorOptions): FindChildWindow
}

export interface InstalledFindWindow {
  show(): boolean
  findNext(): boolean
  findPrevious(): boolean
  dispose(): void
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function normalizeFindRequest(value: unknown): FindRequest | null {
  if (
    !isPlainObject(value) ||
    typeof value.query !== 'string' ||
    typeof value.forward !== 'boolean'
  ) {
    return null
  }

  return {
    query: Array.from(value.query).slice(0, 200).join(''),
    forward: value.forward,
  }
}

function normalizeResultNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function normalizeRequestId(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null
}

export function installFindWindow(
  options: FindWindowOptions,
): InstalledFindWindow {
  const { mainWindow, ipc, preloadPath, createWindow } = options
  const mainWebContents = mainWindow.webContents
  let findWindow: FindChildWindow | null = null
  let currentQuery = ''
  let activeRequestId: number | null = null
  let disposed = false

  const senderIsTrusted = (event: { sender?: { id?: unknown } }): boolean =>
    !disposed &&
    findWindow !== null &&
    !findWindow.isDestroyed() &&
    !findWindow.webContents.isDestroyed() &&
    event.sender?.id === findWindow.webContents.id

  const sendResult = (activeMatchOrdinal: number, matches: number) => {
    if (
      disposed ||
      !findWindow ||
      findWindow.isDestroyed() ||
      findWindow.webContents.isDestroyed()
    ) {
      return
    }
    findWindow.webContents.send(FIND_RESULT_CHANNEL, {
      activeMatchOrdinal,
      matches,
    })
  }

  const clearSelection = () => {
    currentQuery = ''
    activeRequestId = null
    if (!mainWindow.isDestroyed() && !mainWebContents.isDestroyed()) {
      mainWebContents.stopFindInPage('clearSelection')
    }
    sendResult(0, 0)
  }

  const runFind = (query: string, forward: boolean): boolean => {
    if (
      disposed ||
      mainWindow.isDestroyed() ||
      mainWebContents.isDestroyed() ||
      !query
    ) {
      return false
    }
    const findNext = currentQuery !== query
    currentQuery = query
    activeRequestId = normalizeRequestId(
      mainWebContents.findInPage(query, { forward, findNext }),
    )
    return true
  }

  const onQuery = (event: IpcMainEvent, value: unknown) => {
    if (!senderIsTrusted(event)) {
      return
    }
    const request = normalizeFindRequest(value)
    if (!request) {
      return
    }
    if (!request.query) {
      clearSelection()
      return
    }
    runFind(request.query, request.forward)
  }

  const onClose = (event: IpcMainEvent) => {
    if (!senderIsTrusted(event)) {
      return
    }
    findWindow?.close()
  }

  const onFoundInPage = (_event: Event, result: FoundInPageResult) => {
    const requestId = normalizeRequestId(result?.requestId)
    if (
      requestId === null ||
      activeRequestId === null ||
      requestId !== activeRequestId
    ) {
      return
    }
    sendResult(
      normalizeResultNumber(result?.activeMatchOrdinal),
      normalizeResultNumber(result?.matches),
    )
  }

  const onMainClosed = () => dispose()

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    currentQuery = ''
    activeRequestId = null
    ipc.removeListener(FIND_QUERY_CHANNEL, onQuery)
    ipc.removeListener(FIND_CLOSE_CHANNEL, onClose)
    if (!mainWebContents.isDestroyed()) {
      mainWebContents.removeListener('found-in-page', onFoundInPage)
    }
    mainWindow.removeListener('closed', onMainClosed)
    const window = findWindow
    findWindow = null
    if (window && !window.isDestroyed()) {
      window.destroy()
    }
  }

  const show = (): boolean => {
    if (disposed || mainWindow.isDestroyed()) {
      return false
    }
    if (findWindow && !findWindow.isDestroyed()) {
      findWindow.focus()
      return true
    }

    const window = createWindow({
      width: 520,
      height: 126,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      parent: mainWindow as BrowserWindow,
      title: '查找',
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    })
    findWindow = window
    const webContents = window.webContents

    const preventNavigation = (event: { preventDefault(): void }) =>
      event.preventDefault()
    const onClosed = () => {
      if (!webContents.isDestroyed()) {
        webContents.removeListener('will-navigate', preventNavigation)
      }
      window.removeListener('ready-to-show', onReadyToShow)
      window.removeListener('closed', onClosed)
      if (findWindow === window) {
        clearSelection()
        findWindow = null
      }
    }
    const onReadyToShow = () => {
      if (!disposed && findWindow === window && !window.isDestroyed()) {
        window.show()
        window.focus()
      }
    }

    webContents.on('will-navigate', preventNavigation)
    webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('ready-to-show', onReadyToShow)
    window.on('closed', onClosed)
    void webContents.loadURL(createFindPageDataUrl()).catch(() => {
      if (findWindow === window && !window.isDestroyed()) {
        window.close()
      }
    })
    return true
  }

  ipc.on(FIND_QUERY_CHANNEL, onQuery)
  ipc.on(FIND_CLOSE_CHANNEL, onClose)
  mainWebContents.on('found-in-page', onFoundInPage)
  mainWindow.on('closed', onMainClosed)

  return {
    show,
    findNext: () => runFind(currentQuery, true),
    findPrevious: () => runFind(currentQuery, false),
    dispose,
  }
}
