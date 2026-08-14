export interface ApplicationMenuActions {
  reload(): void
  forceReload(): void
  showFind(): void
  findNext(): void
  findPrevious(): void
  resetZoom(): void
  zoomIn(): void
  zoomOut(): void
  toggleFullScreen(): void
}

export type ApplicationMenuRole =
  | 'about'
  | 'services'
  | 'hide'
  | 'hideOthers'
  | 'unhide'
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'selectAll'
  | 'minimize'
  | 'zoom'
  | 'front'

export interface ApplicationMenuItem {
  label?: string
  role?: ApplicationMenuRole
  type?: 'separator'
  accelerator?: string
  click?: () => void
  submenu?: ApplicationMenuItem[]
}

interface ZoomableWebContents {
  getZoomFactor(): number
  setZoomFactor(factor: number): void
}

export function adjustWindowZoom(
  webContents: ZoomableWebContents,
  delta: number,
): void {
  const next = Math.min(
    2,
    Math.max(0.5, webContents.getZoomFactor() + delta),
  )
  webContents.setZoomFactor(Number(next.toFixed(2)))
}

export function resetWindowZoom(webContents: ZoomableWebContents): void {
  webContents.setZoomFactor(1)
}

function separator(): ApplicationMenuItem {
  return { type: 'separator' }
}

function applicationMenu(
  productName: string,
  platform: NodeJS.Platform,
): ApplicationMenuItem {
  const common: ApplicationMenuItem[] = [
    {
      label: `关于 ${productName}`,
      role: 'about',
    },
    separator(),
  ]

  if (platform === 'darwin') {
    common.push(
      { label: '服务', role: 'services' },
      separator(),
      { label: `隐藏 ${productName}`, role: 'hide' },
      { label: '隐藏其他', role: 'hideOthers' },
      { label: '全部显示', role: 'unhide' },
      separator(),
    )
  }

  common.push({
    label: '退出',
    role: 'quit',
    accelerator: 'CmdOrCtrl+Q',
  })

  return {
    label: platform === 'darwin' ? productName : '应用',
    submenu: common,
  }
}

function editMenu(): ApplicationMenuItem {
  return {
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      separator(),
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '删除', role: 'delete' },
      separator(),
      { label: '全选', role: 'selectAll' },
    ],
  }
}

function pageMenu(
  platform: NodeJS.Platform,
  actions: ApplicationMenuActions,
): ApplicationMenuItem {
  return {
    label: '页面',
    submenu: [
      { label: '查找', accelerator: 'CmdOrCtrl+F', click: actions.showFind },
      {
        label: '查找下一个',
        accelerator: 'CmdOrCtrl+G',
        click: actions.findNext,
      },
      {
        label: '查找上一个',
        accelerator: 'CmdOrCtrl+Shift+G',
        click: actions.findPrevious,
      },
      separator(),
      { label: '刷新', accelerator: 'CmdOrCtrl+R', click: actions.reload },
      {
        label: '强制刷新',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: actions.forceReload,
      },
      separator(),
      {
        label: '实际大小',
        accelerator: 'CmdOrCtrl+0',
        click: actions.resetZoom,
      },
      {
        label: '放大',
        accelerator: 'CmdOrCtrl+Plus',
        click: actions.zoomIn,
      },
      {
        label: '缩小',
        accelerator: 'CmdOrCtrl+-',
        click: actions.zoomOut,
      },
      separator(),
      {
        label: '全屏',
        accelerator: platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
        click: actions.toggleFullScreen,
      },
    ],
  }
}

function windowMenu(platform: NodeJS.Platform): ApplicationMenuItem {
  return {
    label: '窗口',
    submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '缩放/窗口化', role: 'zoom' },
      ...(platform === 'darwin'
        ? [{ label: '前置全部窗口', role: 'front' as const }]
        : []),
    ],
  }
}

export function createApplicationMenuTemplate(
  productName: string,
  platform: NodeJS.Platform,
  actions: ApplicationMenuActions,
): ApplicationMenuItem[] {
  return [
    applicationMenu(productName, platform),
    editMenu(),
    pageMenu(platform, actions),
    windowMenu(platform),
  ]
}
