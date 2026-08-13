export interface ApplicationMenuActions {
  reload(): void
  forceReload(): void
  about(): void
  quit(): void
}

export interface ApplicationMenuItem {
  label?: string
  role?: 'editMenu'
  type?: 'separator'
  accelerator?: string
  click?: () => void
  submenu?: ApplicationMenuItem[]
}

export function createApplicationMenuTemplate(
  productName: string,
  platform: NodeJS.Platform,
  actions: ApplicationMenuActions,
): ApplicationMenuItem[] {
  return [
    {
      label: platform === 'darwin' ? productName : '应用',
      submenu: [
        {
          label: `关于 ${productName}`,
          click: actions.about,
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: actions.quit,
        },
      ],
    },
    {
      role: 'editMenu',
    },
    {
      label: '页面',
      submenu: [
        {
          label: '刷新',
          accelerator: 'CmdOrCtrl+R',
          click: actions.reload,
        },
        {
          label: '强制刷新',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: actions.forceReload,
        },
      ],
    },
  ]
}
