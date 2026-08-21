import type { DesktopTargetConfig } from './config.js'
import { classifyNavigation } from './security-policy.js'

export type ExternalLinkOutcome = 'opened' | 'cancelled' | 'blocked'

export async function confirmAndOpenExternalLink(
  rawUrl: string,
  target: DesktopTargetConfig,
  confirm: (origin: string) => Promise<boolean>,
  openExternal: (url: string) => Promise<void>,
): Promise<ExternalLinkOutcome> {
  if (classifyNavigation(rawUrl, target) !== 'external-https') {
    return 'blocked'
  }

  const url = new URL(rawUrl)
  if (!(await confirm(url.origin))) {
    return 'cancelled'
  }

  await openExternal(url.href)
  return 'opened'
}
