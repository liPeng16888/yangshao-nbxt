import { ipcRenderer, type IpcRendererEvent } from 'electron'

const FIND_QUERY_CHANNEL = 'desktop-find:query'
const FIND_CLOSE_CHANNEL = 'desktop-find:close'
const FIND_RESULT_CHANNEL = 'desktop-find:result'

interface EventTargetLike {
  addEventListener(event: string, listener: (event: any) => void): void
  removeEventListener(event: string, listener: (event: any) => void): void
}

interface DocumentLike extends EventTargetLike {
  getElementById(id: string): unknown
}

interface IpcRendererLike {
  send(channel: string, value?: unknown): void
  on(channel: string, listener: (...args: any[]) => void): unknown
  off(channel: string, listener: (...args: any[]) => void): unknown
}

function asControl(value: unknown): {
  value: string
  textContent: string | null
  focus(): void
  select(): void
  addEventListener(event: string, listener: (event: any) => void): void
  removeEventListener(event: string, listener: (event: any) => void): void
} | null {
  if (!value || typeof value !== 'object') return null
  return value as never
}

export function installFindPreload(
  documentValue: DocumentLike,
  ipc: IpcRendererLike,
  lifecycle: EventTargetLike,
): () => void {
  let removeDomListeners: (() => void) | undefined
  let disposed = false

  const onResult = (
    _event: IpcRendererEvent,
    result: { activeMatchOrdinal?: unknown; matches?: unknown },
  ) => {
    const output = asControl(documentValue.getElementById('result'))
    if (!output) return
    const active =
      typeof result?.activeMatchOrdinal === 'number'
        ? result.activeMatchOrdinal
        : 0
    const matches = typeof result?.matches === 'number' ? result.matches : 0
    output.textContent = matches > 0 ? `${active} / ${matches}` : '未找到'
  }

  const onReady = () => {
    if (disposed || removeDomListeners) return
    const query = asControl(documentValue.getElementById('query'))
    const previous = asControl(documentValue.getElementById('previous'))
    const next = asControl(documentValue.getElementById('next'))
    const close = asControl(documentValue.getElementById('close'))
    if (!query || !previous || !next || !close) return

    const sendQuery = (forward: boolean) =>
      ipc.send(FIND_QUERY_CHANNEL, { query: query.value, forward })
    const onInput = () => sendQuery(true)
    const onPrevious = () => sendQuery(false)
    const onNext = () => sendQuery(true)
    const onClose = () => ipc.send(FIND_CLOSE_CHANNEL)
    const onKeyDown = (event: { key?: string; shiftKey?: boolean; preventDefault?(): void }) => {
      if (event.key === 'Escape') {
        event.preventDefault?.()
        onClose()
      } else if (event.key === 'Enter') {
        event.preventDefault?.()
        sendQuery(!event.shiftKey)
      }
    }

    query.addEventListener('input', onInput)
    query.addEventListener('keydown', onKeyDown)
    previous.addEventListener('click', onPrevious)
    next.addEventListener('click', onNext)
    close.addEventListener('click', onClose)
    query.focus()
    query.select()

    removeDomListeners = () => {
      query.removeEventListener('input', onInput)
      query.removeEventListener('keydown', onKeyDown)
      previous.removeEventListener('click', onPrevious)
      next.removeEventListener('click', onNext)
      close.removeEventListener('click', onClose)
    }
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    documentValue.removeEventListener('DOMContentLoaded', onReady)
    lifecycle.removeEventListener('beforeunload', dispose)
    removeDomListeners?.()
    removeDomListeners = undefined
    ipc.off(FIND_RESULT_CHANNEL, onResult)
  }

  documentValue.addEventListener('DOMContentLoaded', onReady)
  lifecycle.addEventListener('beforeunload', dispose)
  ipc.on(FIND_RESULT_CHANNEL, onResult)
  return dispose
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  installFindPreload(document, ipcRenderer, window)
}
