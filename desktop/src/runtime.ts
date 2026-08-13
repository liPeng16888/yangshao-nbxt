import {
  desktopTargets,
  resolveDesktopTarget,
  type DesktopTargetConfig,
} from './config.js'

export interface RuntimeTargetInputs {
  isPackaged: boolean
  appName: string
  environmentTarget: string | undefined
}

export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean
  quit(): void
}

export interface FocusableWindow {
  isMinimized(): boolean
  isVisible(): boolean
  restore(): void
  show(): void
  focus(): void
}

export function resolveRuntimeDesktopTarget(
  inputs: RuntimeTargetInputs,
): DesktopTargetConfig {
  if (!inputs.isPackaged) {
    return resolveDesktopTarget(inputs.environmentTarget)
  }

  const packagedTarget = Object.values(desktopTargets).find(
    (target) => target.productName === inputs.appName,
  )
  if (!packagedTarget) {
    throw new Error(`Unsupported packaged desktop product: ${inputs.appName}`)
  }
  return packagedTarget
}

export function acquireSingleInstanceLock(app: SingleInstanceApp): boolean {
  if (app.requestSingleInstanceLock()) {
    return true
  }

  app.quit()
  return false
}

export function bringWindowToFront(window: FocusableWindow | null): void {
  if (!window) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  if (!window.isVisible()) {
    window.show()
  }
  window.focus()
}
