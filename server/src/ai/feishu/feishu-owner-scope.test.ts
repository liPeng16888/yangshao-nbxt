import { describe, expect, it } from 'vitest'
import { feishuOwners } from './feishu-owner-scope'
describe('Feishu account scope', () => {
  it('preserves legacy single-owner sessions without broadening the scope', () => {
    expect(feishuOwners({ ownerId: 'a', ownerIds: [] })).toEqual(['a'])
    expect(feishuOwners({ ownerId: 'a' })).toEqual(['a'])
    expect(feishuOwners({ ownerId: null, ownerIds: [] })).toEqual([])
    expect(feishuOwners({ ownerId: null, ownerIds: [] }, 'parent')).toEqual(['parent'])
  })
  it('normalizes an exact selected set and binds its anchor', () => {
    expect(feishuOwners({ ownerId: 'a', ownerIds: ['b', 'a'] })).toEqual(['a', 'b'])
    expect(() => feishuOwners({ ownerId: 'b', ownerIds: ['b', 'a'] })).toThrow(/已变化/)
    expect(() => feishuOwners({ ownerId: null, ownerIds: ['a'] })).toThrow(/已变化/)
  })
  it('rejects malformed, duplicate and oversized scopes rather than reading a partial set', () => {
    for (const ownerIds of [null, 'all', {}, ['a', 'a'], [''], Array.from({ length: 21 }, (_, i) => `a${i}`)]) expect(() => feishuOwners({ ownerId: 'a', ownerIds })).toThrow(/范围无效/)
  })
})
