import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'

import {
  FIND_CLOSE_CHANNEL,
  FIND_QUERY_CHANNEL,
  FIND_RESULT_CHANNEL,
} from './find-window'

class FakeTarget extends EventEmitter {
  addEventListener(event: string, listener: (...args: any[]) => void) {
    this.on(event, listener)
  }

  removeEventListener(event: string, listener: (...args: any[]) => void) {
    this.removeListener(event, listener)
  }

  dispatch(event: string, value: Record<string, unknown> = {}) {
    this.emit(event, value)
  }
}

class FakeElement extends FakeTarget {
  value = ''
  textContent = ''
  readonly focus = vi.fn()
  readonly select = vi.fn()
}

class FakeDocument extends FakeTarget {
  readonly elements = new Map([
    ['query', new FakeElement()],
    ['result', new FakeElement()],
    ['previous', new FakeElement()],
    ['next', new FakeElement()],
    ['close', new FakeElement()],
  ])

  getElementById(id: string) {
    return this.elements.get(id) ?? null
  }
}

describe('find preload DOM bridge', () => {
  it('sends only fixed find channels and removes its result listener on unload', () => {
    const document = new FakeDocument()
    const lifecycle = new FakeTarget()
    const ipc = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>
      off: typeof EventEmitter.prototype.off
    }
    ipc.send = vi.fn()
    const requiredModules: string[] = []
    const moduleValue = { exports: {} as Record<string, unknown> }
    const source = readFileSync(
      fileURLToPath(new URL('./find-preload.cts', import.meta.url)),
      'utf8',
    )
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    vm.runInNewContext(compiled, {
      exports: moduleValue.exports,
      module: moduleValue,
      require: (id: string) => {
        requiredModules.push(id)
        if (id === 'electron') return { ipcRenderer: ipc }
        throw new Error(`Unexpected preload dependency: ${id}`)
      },
    })
    const installFindPreload = moduleValue.exports.installFindPreload as (
      documentValue: unknown,
      ipcValue: unknown,
      lifecycleValue: unknown,
    ) => () => void
    const dispose = installFindPreload(
      document as never,
      ipc as never,
      lifecycle as never,
    )
    document.dispatch('DOMContentLoaded')

    const query = document.elements.get('query')!
    query.value = 'aluminium'
    query.dispatch('input')
    document.elements.get('previous')!.dispatch('click')
    document.elements.get('next')!.dispatch('click')
    query.dispatch('keydown', { key: 'Enter', shiftKey: true, preventDefault: vi.fn() })
    document.elements.get('close')!.dispatch('click')

    expect(ipc.send.mock.calls).toEqual([
      [FIND_QUERY_CHANNEL, { query: 'aluminium', forward: true }],
      [FIND_QUERY_CHANNEL, { query: 'aluminium', forward: false }],
      [FIND_QUERY_CHANNEL, { query: 'aluminium', forward: true }],
      [FIND_QUERY_CHANNEL, { query: 'aluminium', forward: false }],
      [FIND_CLOSE_CHANNEL],
    ])
    expect(requiredModules).toEqual(['electron'])
    expect(ipc.eventNames()).toEqual([FIND_RESULT_CHANNEL])

    ipc.emit(FIND_RESULT_CHANNEL, {}, { activeMatchOrdinal: 2, matches: 7 })
    expect(document.elements.get('result')?.textContent).toBe('2 / 7')
    lifecycle.dispatch('beforeunload')
    expect(ipc.listenerCount(FIND_RESULT_CHANNEL)).toBe(0)
    expect(() => dispose()).not.toThrow()
  })
})
