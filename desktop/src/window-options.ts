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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: false,
      navigateOnDragDrop: false,
      spellcheck: false,
    },
  }
}
