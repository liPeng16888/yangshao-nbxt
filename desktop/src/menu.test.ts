import { describe, expect, it, vi } from 'vitest'

import {
  adjustWindowZoom,
  createApplicationMenuTemplate,
  resetWindowZoom,
  type ApplicationMenuActions,
  type ApplicationMenuItem,
} from './menu'

function actions(): ApplicationMenuActions {
  return {
    reload: vi.fn(),
    forceReload: vi.fn(),
    showFind: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    resetZoom: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    toggleFullScreen: vi.fn(),
  }
}

function roles(item: ApplicationMenuItem | undefined): string[] {
  return (item?.submenu ?? [])
    .map((entry) => entry.role)
    .filter((role): role is NonNullable<typeof role> => Boolean(role))
}

function menu(
  template: ApplicationMenuItem[],
  label: string,
): ApplicationMenuItem {
  const item = template.find((entry) => entry.label === label)
  if (!item) throw new Error(`Missing menu: ${label}`)
  return item
}

describe('desktop application menu', () => {
  it('provides standard macOS application, edit, page and window menus', () => {
    const template = createApplicationMenuTemplate(
      '仰韶化验内部系统',
      'darwin',
      actions(),
    )

    expect(roles(template[0])).toEqual([
      'about',
      'services',
      'hide',
      'hideOthers',
      'unhide',
      'quit',
    ])
    expect(roles(menu(template, '编辑'))).toEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'delete',
      'selectAll',
    ])
    expect(
      (menu(template, '页面').submenu ?? []).map((item) => item.accelerator),
    ).toEqual(
      expect.arrayContaining([
        'CmdOrCtrl+F',
        'CmdOrCtrl+G',
        'CmdOrCtrl+Shift+G',
        'CmdOrCtrl+R',
        'CmdOrCtrl+Shift+R',
        'CmdOrCtrl+0',
        'CmdOrCtrl+Plus',
        'CmdOrCtrl+-',
        'Ctrl+Command+F',
      ]),
    )
    expect(roles(menu(template, '窗口'))).toEqual([
      'minimize',
      'zoom',
      'front',
    ])
  })

  it('omits macOS-only application and front-window roles on Windows', () => {
    const template = createApplicationMenuTemplate(
      '仰韶化验后端系统',
      'win32',
      actions(),
    )

    expect(template[0]?.label).toBe('应用')
    expect(roles(template[0])).toEqual(['about', 'quit'])
    expect(roles(menu(template, '编辑'))).toEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'delete',
      'selectAll',
    ])
    expect(roles(menu(template, '窗口'))).toEqual(['minimize', 'zoom'])
    const accelerators = (menu(template, '页面').submenu ?? []).map(
      (item) => item.accelerator,
    )
    expect(accelerators).toEqual(
      expect.arrayContaining(['CmdOrCtrl+G', 'CmdOrCtrl+Shift+G', 'F11']),
    )
    expect(accelerators).not.toContain('Enter')
    expect(accelerators).not.toContain('Shift+Enter')
  })

  it('connects every custom page command to its supplied action', () => {
    const handlers = actions()
    const template = createApplicationMenuTemplate(
      '仰韶化验内部系统',
      'darwin',
      handlers,
    )
    const customItems = [
      ...(template[0]?.submenu ?? []),
      ...(menu(template, '页面').submenu ?? []),
    ].filter((item) => item.click)

    for (const item of customItems) item.click?.()

    expect(handlers.showFind).toHaveBeenCalledOnce()
    expect(handlers.findNext).toHaveBeenCalledOnce()
    expect(handlers.findPrevious).toHaveBeenCalledOnce()
    expect(handlers.reload).toHaveBeenCalledOnce()
    expect(handlers.forceReload).toHaveBeenCalledOnce()
    expect(handlers.resetZoom).toHaveBeenCalledOnce()
    expect(handlers.zoomIn).toHaveBeenCalledOnce()
    expect(handlers.zoomOut).toHaveBeenCalledOnce()
    expect(handlers.toggleFullScreen).toHaveBeenCalledOnce()
  })

  it('leaves standard roles native without ignored click handlers', () => {
    const template = createApplicationMenuTemplate(
      '仰韶化验内部系统',
      'darwin',
      actions(),
    )

    const roleItems = template.flatMap((item) => item.submenu ?? []).filter(
      (item) => item.role,
    )
    expect(roleItems.every((item) => item.click === undefined)).toBe(true)
    const aboutItem = roleItems.find((item) => item.role === 'about')
    expect(aboutItem).toMatchObject({ role: 'about' })
    expect(aboutItem).not.toHaveProperty('click')
  })

  it('changes zoom in tenths and clamps it to the approved range', () => {
    let zoomFactor = 1.95
    const contents = {
      getZoomFactor: vi.fn(() => zoomFactor),
      setZoomFactor: vi.fn((next: number) => (zoomFactor = next)),
    }

    adjustWindowZoom(contents, 0.1)
    adjustWindowZoom(contents, 0.1)
    expect(contents.setZoomFactor).toHaveBeenLastCalledWith(2)

    zoomFactor = 0.55
    adjustWindowZoom(contents, -0.1)
    adjustWindowZoom(contents, -0.1)
    expect(contents.setZoomFactor).toHaveBeenLastCalledWith(0.5)

    resetWindowZoom(contents)
    expect(contents.setZoomFactor).toHaveBeenLastCalledWith(1)
  })
})
