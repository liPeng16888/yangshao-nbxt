import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const { DatabaseSync } = createRequire(__filename)('node:sqlite')

const migrationSource = readFileSync(join(
  __dirname,
  '../../prisma/migrations/20260812035000_add_shared_prepaid_money_checks/migration.sql'
), 'utf8')
const migration = migrationSource.replace(/\s+/g, ' ')

function settlementAmountCheckExpression() {
  const match = migrationSource.match(
    /ADD CONSTRAINT "SharedPrepaidSettlement_amount_invariants"\s+CHECK \(([\s\S]*?)\n  \) NOT VALID;/
  )
  if (!match?.[1]) throw new Error('SharedPrepaidSettlement amount CHECK not found')
  return `(${match[1]})`
}

describe('shared prepaid settlement migration contract', () => {
  it('binds payer and receiver to the gross direction and requires null participants at equality', () => {
    expect(migration).toContain(
      '("aToBAmount" > "bToAAmount" AND "payerFrontendUserId" IS NOT NULL AND "receiverFrontendUserId" IS NOT NULL AND "payerFrontendUserId" = "accountAId" AND "receiverFrontendUserId" = "accountBId")'
    )
    expect(migration).toContain(
      '("bToAAmount" > "aToBAmount" AND "payerFrontendUserId" IS NOT NULL AND "receiverFrontendUserId" IS NOT NULL AND "payerFrontendUserId" = "accountBId" AND "receiverFrontendUserId" = "accountAId")'
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

  it('rejects null or swapped directional participants under SQL CHECK three-valued logic', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(`
        CREATE TABLE settlement (
          "accountAId" TEXT NOT NULL,
          "accountBId" TEXT NOT NULL,
          "aToBAmount" NUMERIC NOT NULL,
          "bToAAmount" NUMERIC NOT NULL,
          "netAmount" NUMERIC NOT NULL,
          "payerFrontendUserId" TEXT,
          "receiverFrontendUserId" TEXT,
          CHECK ${settlementAmountCheckExpression()}
        )
      `)
      const insert = database.prepare(`
        INSERT INTO settlement (
          "accountAId", "accountBId", "aToBAmount", "bToAAmount", "netAmount",
          "payerFrontendUserId", "receiverFrontendUserId"
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      const row = (
        aToBAmount: number,
        bToAAmount: number,
        netAmount: number,
        payer: string | null,
        receiver: string | null
      ) => ['A', 'B', aToBAmount, bToAAmount, netAmount, payer, receiver] as const

      expect(() => insert.run(...row(10, 3, 7, 'A', 'B'))).not.toThrow()
      expect(() => insert.run(...row(3, 10, 7, 'B', 'A'))).not.toThrow()
      expect(() => insert.run(...row(10, 10, 0, null, null))).not.toThrow()

      expect(() => insert.run(...row(10, 3, 7, 'B', 'A'))).toThrow()
      expect(() => insert.run(...row(10, 3, 7, null, null))).toThrow()
      expect(() => insert.run(...row(10, 3, 7, 'A', null))).toThrow()
      expect(() => insert.run(...row(3, 10, 7, null, 'A'))).toThrow()
      expect(() => insert.run(...row(10, 10, 0, 'A', 'B'))).toThrow()
    } finally {
      database.close()
    }
  })
})
