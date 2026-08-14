import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  FIND_CLOSE_CHANNEL,
  FIND_QUERY_CHANNEL,
  FIND_RESULT_CHANNEL,
  installFindWindow,
  normalizeFindRequest,
} from './find-window'

class FakeMainWebContents extends EventEmitter {
  nextRequestId = 40
  readonly findInPage = vi.fn(() => this.nextRequestId++)
  readonly stopFindInPage = vi.fn()
  destroyed = false
  isDestroyed = vi.fn(() => this.destroyed)
}

class FakeMainWindow extends EventEmitter {
  readonly webContents = new FakeMainWebContents()
  destroyed = false
  isDestroyed = vi.fn(() => this.destroyed)
}

let nextId = 20

class FakeFindWebContents extends EventEmitter {
  readonly id = nextId++
  readonly send = vi.fn()
  readonly loadURL = vi.fn(async () => undefined)
  readonly setWindowOpenHandler = vi.fn()
  destroyed = false
  isDestroyed = vi.fn(() => this.destroyed)
}

class FakeFindWindow extends EventEmitter {
  readonly webContents = new FakeFindWebContents()
  readonly show = vi.fn()
  readonly focus = vi.fn()
  readonly close = vi.fn(() => this.emit('closed'))
  readonly destroy = vi.fn(() => {
    this.webContents.destroyed = true
    this.emit('closed')
  })
  destroyed = false
  isDestroyed = vi.fn(() => this.destroyed)
}

function fixture() {
  const mainWindow = new FakeMainWindow()
  const ipc = new EventEmitter()
  const windows: FakeFindWindow[] = []
  const createWindow = vi.fn((_options: unknown) => {
    const window = new FakeFindWindow()
    windows.push(window)
    return window
  })
  const controller = installFindWindow({
    mainWindow,
    ipc,
    preloadPath: '/trusted/find-preload.js',
    createWindow,
  })
  return { controller, mainWindow, ipc, windows, createWindow }
}

describe('find request validation', () => {
  it('accepts plain objects and truncates a query to 200 Unicode code points', () => {
    const query = '🧪'.repeat(205)

    expect(normalizeFindRequest({ query, forward: false })).toEqual({
      query: '🧪'.repeat(200),
      forward: false,
    })
    expect(
      normalizeFindRequest(Object.assign(Object.create(null), {
        query: 'iron',
        forward: true,
      })),
    ).toEqual({ query: 'iron', forward: true })
  })

  it('rejects malformed, inherited, array and non-boolean requests', () => {
    class RequestValue {
      query = 'iron'
      forward = true
    }

    expect(normalizeFindRequest({ query: 7, forward: true })).toBeNull()
    expect(normalizeFindRequest({ query: 'iron', forward: 'yes' })).toBeNull()
    expect(normalizeFindRequest(['iron', true])).toBeNull()
    expect(normalizeFindRequest(new RequestValue())).toBeNull()
    expect(normalizeFindRequest(null)).toBeNull()
  })
})

describe('trusted local find window', () => {
  it('creates one parent-bound hardened local window and blocks its navigation', () => {
    const { controller, mainWindow, createWindow, windows } = fixture()

    controller.show()
    controller.show()

    expect(createWindow).toHaveBeenCalledOnce()
    expect(createWindow).toHaveBeenCalledWith({
      width: 520,
      height: 126,
      show: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      parent: mainWindow,
      title: '查找',
      webPreferences: {
        preload: '/trusted/find-preload.js',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        devTools: false,
        navigateOnDragDrop: false,
        spellcheck: false,
      },
    })
    expect(windows[0]?.webContents.loadURL).toHaveBeenCalledWith(
      expect.stringMatching(/^data:text\/html/),
    )
    expect(windows[0]?.webContents.setWindowOpenHandler).toHaveBeenCalled()
    expect(
      windows[0]?.webContents.setWindowOpenHandler.mock.calls[0]?.[0]({
        url: 'https://evil.example',
      }),
    ).toEqual({ action: 'deny' })
    const navigation = { preventDefault: vi.fn() }
    windows[0]?.webContents.emit('will-navigate', navigation)
    expect(navigation.preventDefault).toHaveBeenCalledOnce()
    expect(windows[0]?.focus).toHaveBeenCalledOnce()
  })

  it('accepts query and close IPC only from the current trusted sender', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const trusted = windows[0]!

    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: 999 } }, {
      query: 'ignored',
      forward: true,
    })
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: trusted.webContents.id } }, {
      query: 'silicon',
      forward: true,
    })
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: trusted.webContents.id } }, {
      query: 'silicon',
      forward: false,
    })

    expect(mainWindow.webContents.findInPage).toHaveBeenNthCalledWith(
      1,
      'silicon',
      { forward: true, findNext: true },
    )
    expect(mainWindow.webContents.findInPage).toHaveBeenNthCalledWith(
      2,
      'silicon',
      { forward: false, findNext: false },
    )

    ipc.emit(FIND_CLOSE_CHANNEL, { sender: { id: 999 } })
    expect(trusted.close).not.toHaveBeenCalled()
    ipc.emit(FIND_CLOSE_CHANNEL, {
      sender: { id: trusted.webContents.id },
    })
    expect(mainWindow.webContents.stopFindInPage).toHaveBeenCalledWith(
      'clearSelection',
    )
    expect(trusted.close).toHaveBeenCalledOnce()
  })

  it('clears empty searches and reuses only the current query for menu navigation', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const sender = { id: windows[0]!.webContents.id }

    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: 'lead', forward: true })
    controller.findNext()
    controller.findPrevious()
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: '', forward: true })

    expect(mainWindow.webContents.findInPage).toHaveBeenNthCalledWith(
      2,
      'lead',
      { forward: true, findNext: false },
    )
    expect(mainWindow.webContents.findInPage).toHaveBeenNthCalledWith(
      3,
      'lead',
      { forward: false, findNext: false },
    )
    expect(mainWindow.webContents.stopFindInPage).toHaveBeenCalledWith(
      'clearSelection',
    )
    controller.findNext()
    expect(mainWindow.webContents.findInPage).toHaveBeenCalledTimes(3)
  })

  it('sends only normalized numeric match data for the active request', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const sender = { id: windows[0]!.webContents.id }
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: 'zinc', forward: true })

    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 40,
      activeMatchOrdinal: 2.9,
      matches: 5.8,
      finalUpdate: true,
      selectionArea: { x: 0, y: 0, width: 5, height: 5 },
    })
    expect(windows[0]?.webContents.send).toHaveBeenCalledOnce()
    expect(windows[0]?.webContents.send).toHaveBeenCalledWith(
      FIND_RESULT_CHANNEL,
      { activeMatchOrdinal: 2, matches: 5 },
    )
  })

  it('drops a late result from query A after query B becomes active', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const findContents = windows[0]!.webContents
    const sender = { id: findContents.id }
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: 'A', forward: true })
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: 'B', forward: true })

    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 40,
      activeMatchOrdinal: 8,
      matches: 9,
    })
    expect(findContents.send).not.toHaveBeenCalled()

    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 41,
      activeMatchOrdinal: 1,
      matches: 3,
    })
    expect(findContents.send).toHaveBeenCalledOnce()
    expect(findContents.send).toHaveBeenCalledWith(FIND_RESULT_CHANNEL, {
      activeMatchOrdinal: 1,
      matches: 3,
    })
  })

  it('invalidates the request and resets the label when the query is cleared', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const findContents = windows[0]!.webContents
    const sender = { id: findContents.id }
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: 'tin', forward: true })
    ipc.emit(FIND_QUERY_CHANNEL, { sender }, { query: '', forward: true })

    expect(findContents.send).toHaveBeenCalledOnce()
    expect(findContents.send).toHaveBeenCalledWith(FIND_RESULT_CHANNEL, {
      activeMatchOrdinal: 0,
      matches: 0,
    })
    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 40,
      activeMatchOrdinal: 1,
      matches: 1,
    })
    expect(findContents.send).toHaveBeenCalledOnce()
  })

  it('does not deliver old results after close and reopen', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const first = windows[0]!
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: first.webContents.id } }, {
      query: 'first',
      forward: true,
    })
    first.close()
    controller.show()
    const second = windows[1]!
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: second.webContents.id } }, {
      query: 'second',
      forward: true,
    })

    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 40,
      activeMatchOrdinal: 1,
      matches: 2,
    })
    expect(second.webContents.send).not.toHaveBeenCalled()
    mainWindow.webContents.emit('found-in-page', {}, {
      requestId: 41,
      activeMatchOrdinal: 2,
      matches: 2,
    })
    expect(second.webContents.send).toHaveBeenCalledOnce()
  })

  it('ignores missing, non-numeric and non-integer result request IDs', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const findContents = windows[0]!.webContents
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: findContents.id } }, {
      query: 'valid',
      forward: true,
    })

    for (const requestId of [undefined, '40', Number.NaN, 40.5]) {
      mainWindow.webContents.emit('found-in-page', {}, {
        requestId,
        activeMatchOrdinal: 1,
        matches: 1,
      })
    }
    expect(findContents.send).not.toHaveBeenCalled()
  })

  it('rejects stale senders and removes every listener on parent disposal', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const oldSender = { id: windows[0]!.webContents.id }
    windows[0]!.close()
    controller.show()

    ipc.emit(FIND_QUERY_CHANNEL, { sender: oldSender }, {
      query: 'stale',
      forward: true,
    })
    expect(mainWindow.webContents.findInPage).not.toHaveBeenCalled()

    mainWindow.emit('closed')
    expect(ipc.listenerCount(FIND_QUERY_CHANNEL)).toBe(0)
    expect(ipc.listenerCount(FIND_CLOSE_CHANNEL)).toBe(0)
    expect(mainWindow.webContents.listenerCount('found-in-page')).toBe(0)
    expect(mainWindow.listenerCount('closed')).toBe(0)
    expect(windows[1]?.destroy).toHaveBeenCalledOnce()
    expect(() => controller.dispose()).not.toThrow()
  })

  it('does not touch destroyed child web contents while handling close', () => {
    const { controller, windows } = fixture()
    controller.show()
    const window = windows[0]!
    const removeListener = vi.spyOn(window.webContents, 'removeListener')
    window.webContents.destroyed = true

    expect(() => window.emit('closed')).not.toThrow()
    expect(removeListener).not.toHaveBeenCalled()
    expect(() => controller.dispose()).not.toThrow()
  })

  it('clears the active match when the native find window is closed', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const window = windows[0]!
    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: window.webContents.id } }, {
      query: 'copper',
      forward: true,
    })

    window.emit('closed')

    expect(mainWindow.webContents.stopFindInPage).toHaveBeenCalledWith(
      'clearSelection',
    )
    expect(controller.findNext()).toBe(false)
  })

  it('does not remove listeners from destroyed main web contents on disposal', () => {
    const { controller, mainWindow } = fixture()
    const removeListener = vi.spyOn(mainWindow.webContents, 'removeListener')
    mainWindow.webContents.destroyed = true

    expect(() => controller.dispose()).not.toThrow()
    expect(removeListener).not.toHaveBeenCalled()
  })

  it('ignores valid-looking IPC after the trusted web contents is destroyed', () => {
    const { controller, mainWindow, ipc, windows } = fixture()
    controller.show()
    const window = windows[0]!
    window.webContents.destroyed = true

    ipc.emit(FIND_QUERY_CHANNEL, { sender: { id: window.webContents.id } }, {
      query: 'must not run',
      forward: true,
    })
    ipc.emit(FIND_CLOSE_CHANNEL, { sender: { id: window.webContents.id } })

    expect(mainWindow.webContents.findInPage).not.toHaveBeenCalled()
    expect(window.close).not.toHaveBeenCalled()
    controller.dispose()
  })
})
