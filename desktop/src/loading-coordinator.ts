import type { LoadingMode } from './loading-page.js'

export type LoadingFailureReason =
  | 'timeout'
  | 'load'
  | 'render-process-gone'
  | 'unresponsive'

export interface LoadingCoordinatorCallbacks {
  show(mode: LoadingMode): void
  hide(): void
  showOffline(reason: LoadingFailureReason): void
}

type LoadingState = 'idle' | 'loading' | 'failed' | 'disposed'

export class LoadingCoordinator {
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private state: LoadingState = 'idle'

  constructor(
    private readonly callbacks: LoadingCoordinatorCallbacks,
    private readonly timeoutMs = 15_000,
  ) {}

  start(mode: LoadingMode): number {
    if (this.state === 'disposed') {
      return this.generation
    }

    const generation = ++this.generation
    this.clearTimer()
    this.state = 'loading'
    this.callbacks.show(mode)
    this.timer = setTimeout(() => {
      this.fail('timeout', generation)
    }, this.timeoutMs)
    return generation
  }

  finish(generation = this.generation): void {
    if (!this.isActive(generation)) {
      return
    }

    this.clearTimer()
    this.state = 'idle'
    this.callbacks.hide()
  }

  fail(
    reason: LoadingFailureReason,
    generation = this.generation,
  ): void {
    if (!this.isActive(generation)) {
      return
    }

    this.clearTimer()
    this.state = 'failed'
    this.callbacks.showOffline(reason)
  }

  dispose(): void {
    if (this.state === 'disposed') {
      return
    }

    ++this.generation
    this.clearTimer()
    this.state = 'disposed'
  }

  private isActive(generation: number): boolean {
    return this.state === 'loading' && generation === this.generation
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }
}
