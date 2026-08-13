import path from 'node:path'

import type { DesktopTargetConfig } from './config.js'
import { isAllowedBlobUrl, isAllowedNavigation } from './security-policy.js'

export interface DownloadPromptItem {
  getFilename(): string
  getURL(): string
  getURLChain(): string[]
  setSaveDialogOptions(options: DownloadSaveDialogOptions): void
  setSavePath(path: string): void
  cancel(): void
}

export interface DownloadSaveDialogOptions {
  title: string
  buttonLabel: string
  defaultPath: string
  properties: Array<'showOverwriteConfirmation' | 'createDirectory'>
}

export type DownloadPromptDecision = 'prompt' | 'blocked'
export type DownloadOutcome = 'saved' | 'cancelled' | 'interrupted'

export function sanitizeDownloadFilename(filename: string): string {
  const basename = filename.split(/[\\/]/u).at(-1) ?? ''
  const safe = basename
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 240)

  return safe || 'download'
}

export function createSaveDialogOptions(
  filename: string,
  downloadsDirectory: string,
): DownloadSaveDialogOptions {
  return {
    title: '另存为',
    buttonLabel: '保存',
    defaultPath: path.join(
      downloadsDirectory,
      sanitizeDownloadFilename(filename),
    ),
    properties: ['showOverwriteConfirmation', 'createDirectory'],
  }
}

function isAllowedDownloadUrl(
  rawUrl: string,
  target: DesktopTargetConfig,
  isApprovedInitiator: boolean,
): boolean {
  return (
    isAllowedNavigation(rawUrl, target) ||
    isAllowedBlobUrl(rawUrl, target) ||
    (isApprovedInitiator && /^data:image\/png;base64,/iu.test(rawUrl))
  )
}

export function configureDownloadPrompt(
  item: DownloadPromptItem,
  target: DesktopTargetConfig,
  downloadsDirectory: string,
  initiatorUrl?: string,
): DownloadPromptDecision {
  const chain = item.getURLChain()
  const urls = chain.length > 0 ? chain : [item.getURL()]
  const isApprovedInitiator = Boolean(
    initiatorUrl && isAllowedNavigation(initiatorUrl, target),
  )

  if (
    !urls.every((url) =>
      isAllowedDownloadUrl(url, target, isApprovedInitiator),
    )
  ) {
    item.cancel()
    return 'blocked'
  }

  item.setSaveDialogOptions(
    createSaveDialogOptions(item.getFilename(), downloadsDirectory),
  )
  return 'prompt'
}

export function getDownloadOutcome(
  state: 'completed' | 'cancelled' | 'interrupted',
  savePath: string,
): DownloadOutcome {
  if (state === 'completed' && savePath !== '') {
    return 'saved'
  }
  return state === 'cancelled' ? 'cancelled' : 'interrupted'
}
