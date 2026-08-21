import { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import {
  assertRequiredNewLedgerTables,
  assertReadOnlySql,
  evaluateCutoverSnapshot,
  jsonStringifyDecimalSafe,
  runReadOnlySnapshotTransaction,
  runCutoverVerifier,
  type CutoverSnapshot
} from './verify-shared-prepaid-cutover'

function validSnapshot(): CutoverSnapshot {
  return {
    ordinaryTableCounts: { User: '2', LabSheet: '4' },
    missingOrdinaryTables: [],
    newLedgerSchemaPresence: {
      SharedPrepaidMember: true,
      SharedPrepaidRecharge: true,
      SharedPrepaidLedgerEntry: true,
      SharedPrepaidConsumption: true,
      SharedPrepaidAllocation: true,
      SharedPrepaidPayable: true,
      SharedPrepaidSettlement: true,
      SharedPrepaidSettlementLine: true,
      SharedPrepaidSettlementAction: true
    },
    legacyPrepaidCounts: {
      PrepaidRechargeRecord: { exists: true, count: '3' },
      PrepaidCustomerRemark: { exists: true, count: '2' },
      PrepaidUsageRemark: { exists: true, count: '1' },
      FinanceDeletionRequestPrepaidRecharge: { exists: true, count: '1' }
    },
    newLedgerTotals: {
      members: '2',
      recharges: '3',
      ledgerEntries: '5',
      consumptions: '2',
      allocations: '2',
      payables: '1',
      settlements: '1',
      settlementLines: '2',
      settlementActions: '1',
      memberCachedBalance: '1000.00',
      ledgerBalanceDelta: '1000.00',
      remainingLotBalance: '1000.00'
    },
    negativeBalanceRows: { members: [], lots: [] },
    lotVsMemberBalanceDifferences: [],
    ledgerVsMemberBalanceDifferences: [],
    duplicateActiveSampleConsumptions: [],
    heldPayablesWithoutActiveSettlements: [],
    completedSettlementLineMismatches: []
  }
}

describe('shared prepaid cutover verifier', () => {
  it('returns structured JSON and a zero exit code for a consistent snapshot', async () => {
    const output: string[] = []
    const exitCode = await runCutoverVerifier({
      collect: async () => validSnapshot(),
      now: () => new Date('2026-08-12T00:00:00.000Z'),
      write: (value) => output.push(value)
    })

    expect(exitCode).toBe(0)
    expect(JSON.parse(output.join(''))).toEqual(expect.objectContaining({
      ok: true,
      checkedAt: '2026-08-12T00:00:00.000Z',
      failures: [],
      ordinaryTableCounts: { User: '2', LabSheet: '4' },
      newLedgerSchemaPresence: expect.objectContaining({
        SharedPrepaidSettlementLine: true,
        SharedPrepaidSettlementAction: true
      }),
      newLedgerTotals: expect.objectContaining({
        settlementLines: '2',
        settlementActions: '1',
        memberCachedBalance: '1000.00'
      })
    }))
  })

  it.each([
    ['missing ordinary table', (snapshot: CutoverSnapshot) => snapshot.missingOrdinaryTables.push('Customer'), 'ORDINARY_TABLE_MISSING'],
    ['negative member', (snapshot: CutoverSnapshot) => snapshot.negativeBalanceRows.members.push({ memberId: 'member-1', phone: '13800000000', cachedBalance: '-0.01' }), 'NEGATIVE_MEMBER_BALANCE'],
    ['negative lot', (snapshot: CutoverSnapshot) => snapshot.negativeBalanceRows.lots.push({ rechargeId: 'recharge-1', memberId: 'member-1', remainingAmount: '-0.01' }), 'NEGATIVE_LOT_BALANCE'],
    ['lot/member difference', (snapshot: CutoverSnapshot) => snapshot.lotVsMemberBalanceDifferences.push({ memberId: 'member-1', cachedBalance: '100.00', remainingLotBalance: '99.98', difference: '0.02' }), 'LOT_MEMBER_BALANCE_MISMATCH'],
    ['ledger/member difference', (snapshot: CutoverSnapshot) => snapshot.ledgerVsMemberBalanceDifferences.push({ memberId: 'member-1', cachedBalance: '100.00', ledgerBalance: '99.98', difference: '0.02' }), 'LEDGER_MEMBER_BALANCE_MISMATCH'],
    ['duplicate active consumption', (snapshot: CutoverSnapshot) => snapshot.duplicateActiveSampleConsumptions.push({ sampleBlockId: 'block-1', activeCount: '2', consumptionIds: ['consumption-1', 'consumption-2'] }), 'DUPLICATE_ACTIVE_SAMPLE_CONSUMPTION'],
    ['orphan held payable', (snapshot: CutoverSnapshot) => snapshot.heldPayablesWithoutActiveSettlements.push({ payableId: 'payable-1', consumptionId: 'consumption-1', amount: '90.9' }), 'HELD_PAYABLE_WITHOUT_ACTIVE_SETTLEMENT'],
    ['completed settlement mismatch', (snapshot: CutoverSnapshot) => snapshot.completedSettlementLineMismatches.push({ settlementId: 'settlement-1', aToBAmount: '100.0', lineAToBAmount: '99.9', bToAAmount: '60.0', lineBToAAmount: '60.0', netAmount: '40.0', computedNetAmount: '39.9', lineCount: '2', invalidLineCount: '0' }), 'COMPLETED_SETTLEMENT_LINE_MISMATCH']
  ])('exits non-zero for %s', async (_name, mutate, expectedCode) => {
    const snapshot = validSnapshot()
    mutate(snapshot)
    const output: string[] = []

    const exitCode = await runCutoverVerifier({
      collect: async () => snapshot,
      now: () => new Date('2026-08-12T00:00:00.000Z'),
      write: (value) => output.push(value)
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(output.join(''))).toMatchObject({
      ok: false,
      failures: [expect.objectContaining({ code: expectedCode })]
    })
  })

  it('treats a one-cent reconciliation difference as within tolerance', () => {
    const snapshot = validSnapshot()
    snapshot.lotVsMemberBalanceDifferences.push({
      memberId: 'member-1',
      cachedBalance: '100.00',
      remainingLotBalance: '99.99',
      difference: '0.01'
    })

    expect(evaluateCutoverSnapshot(snapshot, new Date('2026-08-12T00:00:00.000Z'))).toMatchObject({
      ok: true,
      failures: []
    })
  })

  it('serializes Prisma Decimal and bigint values without precision loss', () => {
    const value = JSON.parse(jsonStringifyDecimalSafe({
      money: new Prisma.Decimal('9007199254740993.01'),
      rows: 9007199254740993n
    }))

    expect(value).toEqual({ money: '9007199254740993.01', rows: '9007199254740993' })
  })

  it('allows one read statement and rejects writes, locks, and stacked statements', () => {
    expect(() => assertReadOnlySql('SELECT COUNT(*) FROM "User"')).not.toThrow()
    expect(() => assertReadOnlySql('WITH rows AS (SELECT 1) SELECT * FROM rows')).not.toThrow()
    expect(() => assertReadOnlySql('DELETE FROM "User"')).toThrow(/read-only/i)
    expect(() => assertReadOnlySql('SELECT * FROM "User" FOR UPDATE')).toThrow(/read-only/i)
    expect(() => assertReadOnlySql('SELECT 1; DROP TABLE "User"')).toThrow(/read-only/i)
  })

  it.each(['SharedPrepaidSettlementLine', 'SharedPrepaidSettlementAction'] as const)(
    'execution-fails when required table %s is missing',
    async (tableName) => {
      const snapshot = validSnapshot()
      snapshot.newLedgerSchemaPresence[tableName] = false
      const output: string[] = []

      const exitCode = await runCutoverVerifier({
        collect: async () => {
          assertRequiredNewLedgerTables(snapshot.newLedgerSchemaPresence)
          return snapshot
        },
        now: () => new Date('2026-08-12T00:00:00.000Z'),
        write: (value) => output.push(value)
      })

      expect(exitCode).toBe(2)
      expect(JSON.parse(output.join(''))).toMatchObject({
        ok: false,
        failures: [{ code: 'VERIFIER_EXECUTION_FAILED', count: 1 }]
      })
    }
  )

  it('uses a bounded repeatable-read transaction with read-only and statement-timeout guards', async () => {
    const executeRaw = vi.fn(async () => 0)
    const queryRaw = vi.fn(async () => [])
    const transaction = {
      $executeRawUnsafe: executeRaw,
      $queryRawUnsafe: queryRaw
    }
    const transactionRunner = vi.fn(async (callback) => callback(transaction))

    const value = await runReadOnlySnapshotTransaction(
      { $transaction: transactionRunner } as never,
      async (client) => {
        expect(client).toBe(transaction)
        return 'snapshot'
      }
    )

    expect(value).toBe('snapshot')
    expect(transactionRunner).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 15_000,
      timeout: 120_000
    })
    expect(executeRaw.mock.calls).toEqual([
      ['SET TRANSACTION READ ONLY'],
      ["SET LOCAL statement_timeout = '90s'"]
    ])
  })
})
