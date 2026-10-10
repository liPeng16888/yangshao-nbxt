import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TenantRealtimeService } from '../realtime/tenant-realtime.service'
import { SharedPrepaidRealtimeService } from '../shared-prepaid/shared-prepaid-realtime.service'

// Bind only explicitly injected business services, never mutate Nest singletons.
// Their nested transactions join the proposal transaction; events wait for commit.
export function transactionServices<T extends Record<string, object>>(services: T, prisma: PrismaService, tx: Prisma.TransactionClient, afterCommit: (() => void)[]): T {
  const scopedDb = new Proxy(prisma, {
    get(target, property) {
      if (property === '$transaction') return async (operation: unknown) => {
        if (typeof operation !== 'function') throw new Error('AI writes require an interactive transaction')
        return operation(tx)
      }
      const value = Reflect.get(tx, property)
      if (value !== undefined) return typeof value === 'function' ? value.bind(tx) : value
      throw new Error(`Database operation not available inside AI transaction: ${String(property)}`)
    }
  })
  const copies = new WeakMap<object, object>()
  const bind = (source: object): object => {
    if (source === prisma) return scopedDb
    const previous = copies.get(source)
    if (previous) return previous
    if (source instanceof TenantRealtimeService || source instanceof SharedPrepaidRealtimeService) {
      const deferred = Object.create(Object.getPrototypeOf(source))
      deferred.publish = (...args: unknown[]) => afterCommit.push(() => (source.publish as Function).apply(source,args))
      copies.set(source,deferred)
      return deferred
    }
    if (!Object.prototype.hasOwnProperty.call(source,'prisma')) return source
    const copy = Object.create(Object.getPrototypeOf(source))
    copies.set(source,copy)
    for (const [key,value] of Object.entries(source)) copy[key] = value && typeof value === 'object' ? bind(value) : value
    return copy
  }
  return Object.fromEntries(Object.entries(services).map(([key,value])=>[key,bind(value)])) as T
}
