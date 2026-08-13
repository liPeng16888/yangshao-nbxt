import {
  Menu,
  type BrowserWindow,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
} from 'electron'

type EditFlags = Pick<
  ContextMenuParams['editFlags'],
  | 'canUndo'
  | 'canRedo'
  | 'canCut'
  | 'canCopy'
  | 'canPaste'
  | 'canDelete'
  | 'canSelectAll'
>

export interface ContextMenuParamsLike {
  isEditable: boolean
  selectionText: string
  editFlags?: Partial<EditFlags>
}

const disabledEditFlags: EditFlags = {
  canUndo: false,
  canRedo: false,
  canCut: false,
  canCopy: false,
  canPaste: false,
  canDelete: false,
  canSelectAll: false,
}

function editMenuItem(
  label: string,
  role: MenuItemConstructorOptions['role'],
  enabled: boolean,
): MenuItemConstructorOptions {
  return { label, role, enabled }
}

export function createContextMenuTemplate(
  params: ContextMenuParamsLike,
): MenuItemConstructorOptions[] {
  const editFlags = { ...disabledEditFlags, ...params.editFlags }

  if (!params.isEditable) {
    if (!params.selectionText) {
      return []
    }

    return [
      editMenuItem('复制', 'copy', editFlags.canCopy),
      editMenuItem('全选', 'selectAll', editFlags.canSelectAll),
    ]
  }

  return [
    editMenuItem('撤销', 'undo', editFlags.canUndo),
    editMenuItem('重做', 'redo', editFlags.canRedo),
    { type: 'separator' },
    editMenuItem('剪切', 'cut', editFlags.canCut),
    editMenuItem('复制', 'copy', editFlags.canCopy),
    editMenuItem('粘贴', 'paste', editFlags.canPaste),
    editMenuItem('删除', 'delete', editFlags.canDelete),
    { type: 'separator' },
    editMenuItem('全选', 'selectAll', editFlags.canSelectAll),
  ]
}

export function installContextMenu(window: BrowserWindow): () => void {
  const webContents = window.webContents
  const showContextMenu = (_event: Electron.Event, params: ContextMenuParams) => {
    if (window.isDestroyed() || webContents.isDestroyed()) {
      return
    }

    const template = createContextMenuTemplate(params)
    if (template.length) {
      Menu.buildFromTemplate(template).popup({ window })
    }
  }

  webContents.on('context-menu', showContextMenu)

  let installed = true
  return () => {
    if (!installed) {
      return
    }
    installed = false
    if (!webContents.isDestroyed()) {
      webContents.removeListener('context-menu', showContextMenu)
    }
  }
}
