import { describe, expect, it } from 'vitest'

import { desktopTargets } from './config'
import {
  createLoadingWindowOptions,
  createWindowOptions,
} from './window-options'

describe('desktop window options', () => {
  it('uses the approved size, title and hardened renderer settings', () => {
    const options = createWindowOptions(desktopTargets.internal, '/icon.png')

    expect(options).toMatchObject({
      title: '仰韶化验内部系统',
      width: 1440,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      show: false,
      icon: '/icon.png',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    })
    expect(options.webPreferences).not.toHaveProperty('preload')
  })

  it('uses the selected product title without sharing mutable options', () => {
    const internal = createWindowOptions(desktopTargets.internal)
    const backend = createWindowOptions(desktopTargets.backend)

    expect(internal.title).toBe('仰韶化验内部系统')
    expect(backend.title).toBe('仰韶化验后端系统')
    expect(internal.webPreferences).not.toBe(backend.webPreferences)
  })

  it('creates a hidden fixed loading window at the main window bounds', () => {
    const options = createLoadingWindowOptions(desktopTargets.internal, {
      x: 120,
      y: 80,
      width: 1280,
      height: 760,
    })

    expect(options).toMatchObject({
      title: '仰韶化验内部系统',
      x: 120,
      y: 80,
      width: 1280,
      height: 760,
      show: false,
      resizable: false,
      closable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    })
    expect(options.webPreferences).not.toHaveProperty('preload')
  })
})
