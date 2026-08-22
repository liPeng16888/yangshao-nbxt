import path from 'node:path'

import type { DesktopTargetConfig } from './config.js'

interface CacheSession {
  clearStorageData(options: {
    origin: string
    storages: ['serviceworkers', 'cachestorage']
  }): Promise<void>
}

export function resolveUserDataPath(
  appDataPath: string,
  target: DesktopTargetConfig,
): string {
  return path.join(appDataPath, target.userDataDirectory)
}

export async function prepareOnlineShellSession(
  session: CacheSession,
  target: DesktopTargetConfig,
): Promise<void> {
  await session.clearStorageData({
    origin: target.allowedOrigin,
    storages: ['serviceworkers', 'cachestorage'],
  })
}
