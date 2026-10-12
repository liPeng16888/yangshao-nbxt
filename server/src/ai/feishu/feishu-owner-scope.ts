import { ConflictException } from '@nestjs/common'
import { normalizedOwners } from '../ai-owner-scope'

// Legacy [] sessions fall back to the previously selected owner, never to all accounts.
export function feishuOwners(session: { ownerId: string | null; ownerIds?: unknown }, frontendOwnerId?: string): string[] {
  if (session.ownerIds === undefined || Array.isArray(session.ownerIds) && !session.ownerIds.length) {
    const owner = session.ownerId || frontendOwnerId
    return owner ? [owner] : []
  }
  let owners: string[]
  try { owners = normalizedOwners(session.ownerIds as string[]) }
  catch { throw new ConflictException('飞书数据账号范围无效，请重新选择账号') }
  if (owners[0] !== session.ownerId) throw new ConflictException('飞书数据账号范围已变化，请重新选择账号')
  return owners
}
