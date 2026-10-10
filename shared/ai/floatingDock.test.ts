import { describe, expect, it } from 'vitest'
import { closestDock, dockBounds, dockPosition, parseDockPreference } from './floatingDock'

const viewport = { width: 1200, height: 800, left: 0, top: 0 }
const launcher = { width: 84, height: 116 }
describe('floating assistant docking geometry', () => {
  it('chooses the closest side using the whole assistant center', () => {
    expect(closestDock(300, launcher, viewport)).toBe('left')
    expect(closestDock(558, launcher, viewport)).toBe('left')
    expect(closestDock(559, launcher, viewport)).toBe('right')
  })
  it('keeps both launcher and expanded dialog inside the viewport', () => {
    expect(dockPosition({ side: 'right', verticalRatio: 1 }, viewport, launcher, 24)).toEqual({ x: 1104, y: 660 })
    expect(dockPosition({ side: 'left', verticalRatio: 0 }, viewport, launcher, 24)).toEqual({ x: 12, y: 12 })
    expect(dockPosition({ side: 'right', verticalRatio: 1 }, viewport, { width: 460, height: 740 }, 24)).toEqual({ x: 728, y: 36 })
  })
  it('respects mobile bottom navigation and visual viewport offsets', () => {
    const mobile = { width: 390, height: 600, left: 10, top: 100 }
    expect(dockPosition({ side: 'right', verticalRatio: 1 }, mobile, launcher, 78)).toEqual({ x: 304, y: 506 })
    expect(dockBounds(mobile, launcher, 78)).toEqual({ minX: 22, maxX: 304, minY: 112, maxY: 506 })
  })
  it('normalizes missing, damaged, malicious or out-of-range saved preferences', () => {
    for (const value of [null, 'invalid', '{}', '{"side":"bottom","verticalRatio":0.5}', '{"side":"left","verticalRatio":"0.5"}']) {
      expect(parseDockPreference(value)).toEqual({ side: 'right', verticalRatio: 1 })
    }
    expect(parseDockPreference('{"side":"left","verticalRatio":2}')).toEqual({ side: 'left', verticalRatio: 1 })
    expect(parseDockPreference('{"side":"right","verticalRatio":-1}')).toEqual({ side: 'right', verticalRatio: 0 })
  })
})
