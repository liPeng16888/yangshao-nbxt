import { Menu } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createContextMenuTemplate, installContextMenu } from './context-menu'

const menuMock = vi.hoisted(() => ({
  buildFromTemplate: vi.fn(() => ({ popup: vi.fn() })),
}))

vi.mock('electron', () => ({ Menu: menuMock }))

beforeEach(() => {
  menuMock.buildFromTemplate.mockClear()
})

interface ContextMenuTestParams {
  isEditable: boolean
  selectionText: string
  editFlags?: {
    canUndo?: boolean
    canRedo?: boolean
    canCut?: boolean
    canCopy?: boolean
    canPaste?: boolean
    canDelete?: boolean
    canSelectAll?: boolean
  }
}

function params(overrides: Partial<ContextMenuTestParams> = {}): ContextMenuTestParams {
  return {
    isEditable: false,
    selectionText: '',
    editFlags: {
      canUndo: false,
      canRedo: false,
      canCut: false,
      canCopy: true,
      canPaste: false,
      canDelete: false,
      canSelectAll: true,
    },
    ...overrides,
  }
}

describe('native edit context menu', () => {
  it('offers enabled native roles for an editable field', () => {
    expect(
      createContextMenuTemplate(
        params({
          isEditable: true,
          editFlags: {
            canUndo: true,
            canRedo: false,
            canCut: true,
            canCopy: true,
            canPaste: true,
            canDelete: true,
            canSelectAll: true,
          },
        }),
      ),
    ).toEqual([
      { label: '撤销', role: 'undo', enabled: true },
      { label: '重做', role: 'redo', enabled: false },
      { type: 'separator' },
      { label: '剪切', role: 'cut', enabled: true },
      { label: '复制', role: 'copy', enabled: true },
      { label: '粘贴', role: 'paste', enabled: true },
      { label: '删除', role: 'delete', enabled: true },
      { type: 'separator' },
      { label: '全选', role: 'selectAll', enabled: true },
    ])
  })

  it('returns copy/select-all for selection and no menu for blank read-only content', () => {
    expect(
      createContextMenuTemplate(
        params({ selectionText: '已选择', isEditable: false }),
      ).map((item) => item.role),
    ).toEqual(['copy', 'selectAll'])
    expect(
      createContextMenuTemplate(params({ selectionText: '', isEditable: false })),
    ).toEqual([])
  })

  it('does not enable unavailable read-only selection roles', () => {
    expect(
      createContextMenuTemplate(
        params({
          selectionText: '受保护文本',
          editFlags: { canCopy: false, canSelectAll: false },
        }),
      ),
    ).toEqual([{ label: '复制', role: 'copy', enabled: false }])
  })

  it('treats missing edit flags as disabled for editable fields', () => {
    expect(
      createContextMenuTemplate(
        params({ isEditable: true, editFlags: undefined }),
      ).filter((item) => item.role),
    ).toEqual([
      { label: '撤销', role: 'undo', enabled: false },
      { label: '重做', role: 'redo', enabled: false },
      { label: '剪切', role: 'cut', enabled: false },
      { label: '复制', role: 'copy', enabled: false },
      { label: '粘贴', role: 'paste', enabled: false },
      { label: '删除', role: 'delete', enabled: false },
      { label: '全选', role: 'selectAll', enabled: false },
    ])
  })

  it('pops up only for its live window and removes its listener on teardown', () => {
    let listener:
      | ((event: Electron.Event, params: Electron.ContextMenuParams) => void)
      | undefined
    const on = vi.fn(
      (_event: string, handler: typeof listener) => (listener = handler),
    )
    const removeListener = vi.fn()
    const window = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        on,
        removeListener,
      },
    } as never

    const unsubscribe = installContextMenu(window)
    listener?.({} as Electron.Event, {
      isEditable: true,
      selectionText: '',
      editFlags: {
        canUndo: false,
        canRedo: false,
        canCut: false,
        canCopy: false,
        canPaste: true,
        canDelete: false,
        canSelectAll: true,
      },
    } as Electron.ContextMenuParams)

    expect(on).toHaveBeenCalledWith('context-menu', expect.any(Function))
    expect(menuMock.buildFromTemplate).toHaveBeenCalledOnce()
    expect(Menu.buildFromTemplate).toHaveBeenCalledWith(
      expect.arrayContaining([{ label: '粘贴', role: 'paste', enabled: true }]),
    )

    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('context-menu', listener)
  })

  it('does not pop up after its window has been destroyed', () => {
    let listener:
      | ((event: Electron.Event, params: Electron.ContextMenuParams) => void)
      | undefined
    const window = {
      isDestroyed: () => true,
      webContents: {
        isDestroyed: () => false,
        on: (_event: string, handler: typeof listener) => (listener = handler),
        removeListener: vi.fn(),
      },
    } as never

    installContextMenu(window)
    listener?.({} as Electron.Event, {
      isEditable: true,
      selectionText: '',
      editFlags: {},
    } as Electron.ContextMenuParams)

    expect(menuMock.buildFromTemplate).not.toHaveBeenCalled()
  })
})
