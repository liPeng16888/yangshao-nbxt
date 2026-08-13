import type { DesktopTargetConfig } from './config.js'

export interface DesktopWebPreferences {
  nodeIntegration: false
  contextIsolation: true
  sandbox: true
  webSecurity: true
  devTools: false
  navigateOnDragDrop: false
  spellcheck: false
}

export interface DesktopWindowOptions {
  title: string
  width: number
  height: number
  minWidth: number
  minHeight: number
  show: boolean
  icon?: string
  webPreferences: DesktopWebPreferences
}

export interface DesktopWindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopLoadingWindowOptions extends DesktopWindowBounds {
  title: string
  show: boolean
  resizable: boolean
  closable: boolean
  minimizable: boolean
  maximizable: boolean
  fullscreenable: boolean
  skipTaskbar: boolean
  webPreferences: DesktopWebPreferences
}

function createSecureWebPreferences(): DesktopWebPreferences {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    devTools: false,
    navigateOnDragDrop: false,
    spellcheck: false,
  }
}

export function createWindowOptions(
  target: DesktopTargetConfig,
  icon?: string,
): DesktopWindowOptions {
  return {
    title: target.productName,
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: createSecureWebPreferences(),
  }
}

export function createLoadingWindowOptions(
  target: DesktopTargetConfig,
  bounds: DesktopWindowBounds,
): DesktopLoadingWindowOptions {
  return {
    title: target.productName,
    ...bounds,
    show: false,
    resizable: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: createSecureWebPreferences(),
  }
}
