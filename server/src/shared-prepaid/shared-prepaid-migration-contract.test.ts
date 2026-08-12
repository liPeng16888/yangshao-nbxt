import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  __dirname,
  '../../prisma/migrations/20260812035000_add_shared_prepaid_money_checks/migration.sql'
), 'utf8').replace(/\s+/g, ' ')

describe('shared prepaid settlement migration contract', () => {
  it('binds payer and receiver to the gross direction and requires null participants at equality', () => {
    expect(migration).toContain(
      '("aToBAmount" > "bToAAmount" AND "payerFrontendUserId" = "accountAId" AND "receiverFrontendUserId" = "accountBId")'
    )
    expect(migration).toContain(
      '("bToAAmount" > "aToBAmount" AND "payerFrontendUserId" = "accountBId" AND "receiverFrontendUserId" = "accountAId")'
    )
    expect(migration).toContain(
      '("aToBAmount" = "bToAAmount" AND "payerFrontendUserId" IS NULL AND "receiverFrontendUserId" IS NULL)'
    )
  })

  it('retains nonnegative bounds, gross cap, and the absolute net relation', () => {
    expect(migration).toContain(
      '"aToBAmount" >= 0 AND "aToBAmount" <= 9999999999999.9'
    )
    expect(migration).toContain(
      '"bToAAmount" >= 0 AND "bToAAmount" <= 9999999999999.9'
    )
    expect(migration).toContain(
      '"aToBAmount" + "bToAAmount" <= 9999999999999.9'
    )
    expect(migration).toContain(
      '"netAmount" = ABS("aToBAmount" - "bToAAmount")'
    )
  })
})
