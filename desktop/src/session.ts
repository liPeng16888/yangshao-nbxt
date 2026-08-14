import path from 'node:path'

import type { DesktopTargetConfig } from './config.js'

interface CacheSession {
  clearCache(): Promise<void>
}

export function resolveUserDataPath(
  appDataPath: string,
  target: DesktopTargetConfig,
): string {
  return path.join(appDataPath, target.userDataDirectory)
}

export async function clearHttpCache(session: CacheSession): Promise<void> {
  await session.clearCache()
}
