export type DockSide = 'left' | 'right'
export interface DockViewport { width: number; height: number; left: number; top: number }
export interface DockSize { width: number; height: number }
export interface DockPreference { side: DockSide; verticalRatio: number }

export const DOCK_MARGIN = 12
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function dockBounds(viewport: DockViewport, size: DockSize, bottomGap: number) {
  const minX = viewport.left + DOCK_MARGIN, minY = viewport.top + DOCK_MARGIN
  return {
    minX, minY,
    maxX: Math.max(minX, viewport.left + viewport.width - size.width - DOCK_MARGIN),
    maxY: Math.max(minY, viewport.top + viewport.height - size.height - bottomGap)
  }
}

export function dockPosition(preference: DockPreference, viewport: DockViewport, size: DockSize, bottomGap: number) {
  const bounds = dockBounds(viewport, size, bottomGap)
  return {
    x: preference.side === 'left' ? bounds.minX : bounds.maxX,
    y: clamp(viewport.top + preference.verticalRatio * viewport.height - size.height / 2, bounds.minY, bounds.maxY)
  }
}

export function closestDock(x: number, size: DockSize, viewport: DockViewport): DockSide {
  return x + size.width / 2 <= viewport.left + viewport.width / 2 ? 'left' : 'right'
}

export function parseDockPreference(raw: string | null): DockPreference {
  const fallback: DockPreference = { side: 'right', verticalRatio: 1 }
  try {
    const value = raw ? JSON.parse(raw) : null
    if (!value || !['left', 'right'].includes(value.side) || typeof value.verticalRatio !== 'number' || !Number.isFinite(value.verticalRatio)) return fallback
    return { side: value.side, verticalRatio: clamp(value.verticalRatio, 0, 1) }
  } catch { return fallback }
}
