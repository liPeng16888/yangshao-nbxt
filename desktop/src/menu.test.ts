import { describe, expect, it, vi } from 'vitest'

import { createApplicationMenuTemplate } from './menu'

describe('desktop application menu', () => {
  it('provides reload, hard reload, about and quit actions', () => {
    const actions = {
      reload: vi.fn(),
      forceReload: vi.fn(),
      about: vi.fn(),
      quit: vi.fn(),
    }
    const template = createApplicationMenuTemplate(
      '仰韶化验内部系统',
      'darwin',
      actions,
    )

    const applicationItems = template[0]?.submenu ?? []
    const pageItems = template[1]?.submenu ?? []

    expect(template.map((item) => item.label)).toEqual([
      '仰韶化验内部系统',
      '页面',
    ])
    expect(applicationItems.map((item) => item.label ?? item.type)).toEqual([
      '关于 仰韶化验内部系统',
      'separator',
      '退出',
    ])
    expect(pageItems.map((item) => item.label)).toEqual(['刷新', '强制刷新'])
    expect(pageItems.map((item) => item.accelerator)).toEqual([
      'CmdOrCtrl+R',
      'CmdOrCtrl+Shift+R',
    ])

    applicationItems[0]?.click?.()
    applicationItems[2]?.click?.()
    pageItems[0]?.click?.()
    pageItems[1]?.click?.()

    expect(actions.about).toHaveBeenCalledOnce()
    expect(actions.quit).toHaveBeenCalledOnce()
    expect(actions.reload).toHaveBeenCalledOnce()
    expect(actions.forceReload).toHaveBeenCalledOnce()
  })

  it('uses a conventional application label on Windows', () => {
    const noop = () => undefined
    const template = createApplicationMenuTemplate('仰韶化验后端系统', 'win32', {
      reload: noop,
      forceReload: noop,
      about: noop,
      quit: noop,
    })

    expect(template[0]?.label).toBe('应用')
  })
})
