import { Prisma, PrismaClient } from '@prisma/client'

type Count = string

export interface NegativeMemberBalance {
  memberId: string
  phone: string
  cachedBalance: string
}

export interface NegativeLotBalance {
  rechargeId: string
  memberId: string
  remainingAmount: string
}

export interface LotMemberDifference {
  memberId: string
  cachedBalance: string
  remainingLotBalance: string
  difference: string
}

export interface LedgerMemberDifference {
  memberId: string
  cachedBalance: string
  ledgerBalance: string
  difference: string
}

export interface DuplicateConsumption {
  sampleBlockId: string
  activeCount: string
  consumptionIds: string[]
}

export interface HeldPayableWithoutActiveSettlement {
  payableId: string
  consumptionId: string
  amount: string
}

export interface CompletedSettlementLineMismatch {
  settlementId: string
  aToBAmount: string
  lineAToBAmount: string
  bToAAmount: string
  lineBToAAmount: string
  netAmount: string
  computedNetAmount: string
  lineCount: string
  invalidLineCount: string
}

interface LegacyTableCount {
  exists: boolean
  count: Count
}

export interface CutoverSnapshot {
  ordinaryTableCounts: Record<string, Count>
  missingOrdinaryTables: string[]
  legacyPrepaidCounts: {
    PrepaidRechargeRecord: LegacyTableCount
    PrepaidCustomerRemark: LegacyTableCount
    PrepaidUsageRemark: LegacyTableCount
    FinanceDeletionRequestPrepaidRecharge: LegacyTableCount
  }
  newLedgerTotals: {
    members: Count
    recharges: Count
    ledgerEntries: Count
    consumptions: Count
    allocations: Count
    payables: Count
    settlements: Count
    memberCachedBalance: string
    ledgerBalanceDelta: string
    remainingLotBalance: string
  }
  negativeBalanceRows: {
    members: NegativeMemberBalance[]
    lots: NegativeLotBalance[]
  }
  lotVsMemberBalanceDifferences: LotMemberDifference[]
  ledgerVsMemberBalanceDifferences: LedgerMemberDifference[]
  duplicateActiveSampleConsumptions: DuplicateConsumption[]
  heldPayablesWithoutActiveSettlements: HeldPayableWithoutActiveSettlement[]
  completedSettlementLineMismatches: CompletedSettlementLineMismatch[]
}

interface VerificationFailure {
  code: string
  count: number
}

export interface CutoverReport extends CutoverSnapshot {
  ok: boolean
  checkedAt: string
  failures: VerificationFailure[]
}

interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>
}

const ordinaryTableNames = [
  'User',
  'FrontendSubAccountPermission',
  'AccessGuardGroup',
  'AccessGuardGroupFeature',
  'Customer',
  'InviteCode',
  'SubAdminFrontendPermission',
  'LabSheet',
  'SampleBlock',
  'LabSampleSaveRequest',
  'CellChangeLog',
  'AbnormalRecord',
  'FinanceEntry',
  'MonthlySettlementRecord',
  'MonthlyCustomerRemark',
  'BlacklistRecord',
  'UploadedFile',
  'Reminder',
  'MedicineInventoryItem',
  'MedicineInventoryMovement',
  'MedicineCommonName',
  'Employee',
  'EmployeeWeeklySchedule',
  'EmployeeDateOverride',
  'EmployeeMonthlySetting',
  'EmployeeAttendanceRecord',
  'EmployeeLeaveType',
  'EmployeeLeaveRequest',
  'EmployeeCommissionType',
  'EmployeeCommissionRecord',
  'EmployeeBonus',
  'EmployeePayrollRun',
  'EmployeePayrollItem',
  'EmployeePayrollAdjustment',
  'EmployeeAuditLog'
] as const

const prohibitedReadTokens = /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|MERGE|VACUUM|ANALYZE)\b/i
const lockingRead = /\bFOR\s+(?:UPDATE|NO\s+KEY\s+UPDATE|SHARE|KEY\s+SHARE)\b|\bLOCK\s+TABLE\b/i

export function assertReadOnlySql(sql: string) {
  const normalized = sql.trim().replace(/;+\s*$/, '')
  if (!/^(?:SELECT|WITH)\b/i.test(normalized)) {
    throw new Error('Cutover verifier accepts read-only SQL only')
  }
  if (normalized.includes(';') || prohibitedReadTokens.test(normalized) || lockingRead.test(normalized)) {
    throw new Error('Cutover verifier accepts one read-only SQL statement only')
  }
}

export function jsonStringifyDecimalSafe(value: unknown) {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === 'bigint') return item.toString()
    if (Prisma.Decimal.isDecimal(item)) return item.toString()
    return item
  }, 2)
}

function differenceExceedsTolerance(value: string) {
  return new Prisma.Decimal(value).abs().gt('0.01')
}

export function evaluateCutoverSnapshot(snapshot: CutoverSnapshot, checkedAt = new Date()): CutoverReport {
  const failures: VerificationFailure[] = []
  const addFailure = (code: string, count: number) => {
    if (count > 0) failures.push({ code, count })
  }

  addFailure('ORDINARY_TABLE_MISSING', snapshot.missingOrdinaryTables.length)
  addFailure('NEGATIVE_MEMBER_BALANCE', snapshot.negativeBalanceRows.members.length)
  addFailure('NEGATIVE_LOT_BALANCE', snapshot.negativeBalanceRows.lots.length)
  addFailure(
    'LOT_MEMBER_BALANCE_MISMATCH',
    snapshot.lotVsMemberBalanceDifferences.filter((row) => differenceExceedsTolerance(row.difference)).length
  )
  addFailure(
    'LEDGER_MEMBER_BALANCE_MISMATCH',
    snapshot.ledgerVsMemberBalanceDifferences.filter((row) => differenceExceedsTolerance(row.difference)).length
  )
  addFailure('DUPLICATE_ACTIVE_SAMPLE_CONSUMPTION', snapshot.duplicateActiveSampleConsumptions.length)
  addFailure('HELD_PAYABLE_WITHOUT_ACTIVE_SETTLEMENT', snapshot.heldPayablesWithoutActiveSettlements.length)
  addFailure('COMPLETED_SETTLEMENT_LINE_MISMATCH', snapshot.completedSettlementLineMismatches.length)

  return {
    ok: failures.length === 0,
    checkedAt: checkedAt.toISOString(),
    failures,
    ...snapshot
  }
}

export async function runCutoverVerifier(options: {
  collect: () => Promise<CutoverSnapshot>
  write: (value: string) => void
  now?: () => Date
}) {
  const checkedAt = (options.now ?? (() => new Date()))()
  try {
    const report = evaluateCutoverSnapshot(await options.collect(), checkedAt)
    options.write(`${jsonStringifyDecimalSafe(report)}\n`)
    return report.ok ? 0 : 1
  } catch {
    options.write(`${jsonStringifyDecimalSafe({
      ok: false,
      checkedAt: checkedAt.toISOString(),
      failures: [{ code: 'VERIFIER_EXECUTION_FAILED', count: 1 }],
      message: 'Shared prepaid cutover verification could not be completed'
    })}\n`)
    return 2
  }
}

async function queryRows<T>(client: RawQueryClient, sql: string, ...values: unknown[]): Promise<T> {
  assertReadOnlySql(sql)
  return client.$queryRawUnsafe<T>(sql, ...values)
}

function quoteIdentifier(value: string) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(value)) throw new Error('Unsafe database identifier')
  return `"${value}"`
}

async function tableExists(client: RawQueryClient, tableName: string) {
  const rows = await queryRows<Array<{ relationName: string | null }>>(
    client,
    'SELECT to_regclass($1)::text AS "relationName"',
    `public.${quoteIdentifier(tableName)}`
  )
  return Boolean(rows[0]?.relationName)
}

async function countOptionalTable(client: RawQueryClient, tableName: string): Promise<LegacyTableCount> {
  const exists = await tableExists(client, tableName)
  if (!exists) return { exists: false, count: '0' }
  const rows = await queryRows<Array<{ count: string }>>(
    client,
    `SELECT COUNT(*)::text AS "count" FROM ${quoteIdentifier(tableName)}`
  )
  return { exists: true, count: rows[0]?.count ?? '0' }
}

async function collectOrdinaryCounts(client: RawQueryClient) {
  const counts: Record<string, string> = {}
  const missing: string[] = []
  for (const tableName of ordinaryTableNames) {
    if (!await tableExists(client, tableName)) {
      missing.push(tableName)
      continue
    }
    const rows = await queryRows<Array<{ count: string }>>(
      client,
      `SELECT COUNT(*)::text AS "count" FROM ${quoteIdentifier(tableName)}`
    )
    counts[tableName] = rows[0]?.count ?? '0'
  }

  if (!await tableExists(client, 'FinanceDeletionRequest')) {
    missing.push('FinanceDeletionRequest')
  } else {
    const rows = await queryRows<Array<{ count: string }>>(
      client,
      `SELECT COUNT(*)::text AS "count"
       FROM "FinanceDeletionRequest"
       WHERE "sourceType" <> 'PREPAID_RECHARGE'`
    )
    counts.FinanceDeletionRequestOrdinary = rows[0]?.count ?? '0'
  }
  return { counts, missing }
}

async function collectSnapshotFromClient(client: RawQueryClient): Promise<CutoverSnapshot> {
  const ordinary = await collectOrdinaryCounts(client)
  const financeDeletionRequestExists = await tableExists(client, 'FinanceDeletionRequest')
  const financeDeletionRequestRows = financeDeletionRequestExists
    ? await queryRows<Array<{ count: string }>>(
      client,
      `SELECT COUNT(*)::text AS "count"
       FROM "FinanceDeletionRequest"
       WHERE "sourceType" = 'PREPAID_RECHARGE'`
    )
    : []

  const totals = await queryRows<CutoverSnapshot['newLedgerTotals'][]>(client, `
    SELECT
      (SELECT COUNT(*)::text FROM "SharedPrepaidMember") AS "members",
      (SELECT COUNT(*)::text FROM "SharedPrepaidRecharge") AS "recharges",
      (SELECT COUNT(*)::text FROM "SharedPrepaidLedgerEntry") AS "ledgerEntries",
      (SELECT COUNT(*)::text FROM "SharedPrepaidConsumption") AS "consumptions",
      (SELECT COUNT(*)::text FROM "SharedPrepaidAllocation") AS "allocations",
      (SELECT COUNT(*)::text FROM "SharedPrepaidPayable") AS "payables",
      (SELECT COUNT(*)::text FROM "SharedPrepaidSettlement") AS "settlements",
      (SELECT COALESCE(SUM("cachedBalance"), 0)::text FROM "SharedPrepaidMember") AS "memberCachedBalance",
      (SELECT COALESCE(SUM("balanceDelta"), 0)::text FROM "SharedPrepaidLedgerEntry") AS "ledgerBalanceDelta",
      (SELECT COALESCE(SUM("remainingAmount"), 0)::text FROM "SharedPrepaidRecharge" WHERE "reversedAt" IS NULL) AS "remainingLotBalance"
  `)

  const negativeMembers = await queryRows<NegativeMemberBalance[]>(client, `
    SELECT "id" AS "memberId", "phone", "cachedBalance"::text AS "cachedBalance"
    FROM "SharedPrepaidMember"
    WHERE "cachedBalance" < 0
    ORDER BY "id"
  `)
  const negativeLots = await queryRows<NegativeLotBalance[]>(client, `
    SELECT "id" AS "rechargeId", "memberId", "remainingAmount"::text AS "remainingAmount"
    FROM "SharedPrepaidRecharge"
    WHERE "remainingAmount" < 0
    ORDER BY "id"
  `)
  const lotDifferences = await queryRows<LotMemberDifference[]>(client, `
    SELECT
      member."id" AS "memberId",
      member."cachedBalance"::text AS "cachedBalance",
      COALESCE(lots."remainingLotBalance", 0)::text AS "remainingLotBalance",
      (member."cachedBalance" - COALESCE(lots."remainingLotBalance", 0))::text AS "difference"
    FROM "SharedPrepaidMember" member
    LEFT JOIN (
      SELECT "memberId", SUM("remainingAmount") AS "remainingLotBalance"
      FROM "SharedPrepaidRecharge"
      WHERE "reversedAt" IS NULL
      GROUP BY "memberId"
    ) lots ON lots."memberId" = member."id"
    WHERE ABS(member."cachedBalance" - COALESCE(lots."remainingLotBalance", 0)) > 0.01
    ORDER BY member."id"
  `)
  const ledgerDifferences = await queryRows<LedgerMemberDifference[]>(client, `
    SELECT
      member."id" AS "memberId",
      member."cachedBalance"::text AS "cachedBalance",
      COALESCE(ledger."ledgerBalance", 0)::text AS "ledgerBalance",
      (member."cachedBalance" - COALESCE(ledger."ledgerBalance", 0))::text AS "difference"
    FROM "SharedPrepaidMember" member
    LEFT JOIN (
      SELECT "memberId", SUM("balanceDelta") AS "ledgerBalance"
      FROM "SharedPrepaidLedgerEntry"
      GROUP BY "memberId"
    ) ledger ON ledger."memberId" = member."id"
    WHERE ABS(member."cachedBalance" - COALESCE(ledger."ledgerBalance", 0)) > 0.01
    ORDER BY member."id"
  `)
  const duplicateConsumptions = await queryRows<DuplicateConsumption[]>(client, `
    SELECT
      "sampleBlockId",
      COUNT(*)::text AS "activeCount",
      ARRAY_AGG("id" ORDER BY "id") AS "consumptionIds"
    FROM "SharedPrepaidConsumption"
    WHERE "active" = true AND "kind" = 'CONSUMPTION'
    GROUP BY "sampleBlockId"
    HAVING COUNT(*) > 1
    ORDER BY "sampleBlockId"
  `)
  const orphanHeldPayables = await queryRows<HeldPayableWithoutActiveSettlement[]>(client, `
    SELECT payable."id" AS "payableId", payable."consumptionId", payable."amount"::text AS "amount"
    FROM "SharedPrepaidPayable" payable
    WHERE payable."status" = 'HELD'
      AND NOT EXISTS (
        SELECT 1
        FROM "SharedPrepaidSettlementLine" line
        JOIN "SharedPrepaidSettlement" settlement ON settlement."id" = line."settlementId"
        WHERE line."payableId" = payable."id"
          AND line."releasedAt" IS NULL
          AND settlement."status" IN ('AWAITING_PAYMENT', 'AWAITING_RECEIPT')
      )
    ORDER BY payable."id"
  `)
  const settlementMismatches = await queryRows<CompletedSettlementLineMismatch[]>(client, `
    WITH completed AS (
      SELECT
        settlement."id" AS "settlementId",
        settlement."aToBAmount",
        COALESCE(SUM(line."amount") FILTER (WHERE line."direction" = 'A_TO_B'), 0) AS "lineAToBAmount",
        settlement."bToAAmount",
        COALESCE(SUM(line."amount") FILTER (WHERE line."direction" = 'B_TO_A'), 0) AS "lineBToAAmount",
        settlement."netAmount",
        ABS(
          COALESCE(SUM(line."amount") FILTER (WHERE line."direction" = 'A_TO_B'), 0)
          - COALESCE(SUM(line."amount") FILTER (WHERE line."direction" = 'B_TO_A'), 0)
        ) AS "computedNetAmount",
        COUNT(line."id") AS "lineCount",
        COUNT(*) FILTER (
          WHERE line."id" IS NOT NULL AND (
            line."releasedAt" IS NOT NULL
            OR line."direction" NOT IN ('A_TO_B', 'B_TO_A')
            OR payable."status" IS DISTINCT FROM 'COMPLETED'
            OR ABS(line."amount" - payable."amount") > 0.01
            OR (
              line."direction" = 'A_TO_B'
              AND NOT (
                payable."sourceOwnerId" = settlement."accountAId"
                AND payable."consumerOwnerId" = settlement."accountBId"
              )
            )
            OR (
              line."direction" = 'B_TO_A'
              AND NOT (
                payable."sourceOwnerId" = settlement."accountBId"
                AND payable."consumerOwnerId" = settlement."accountAId"
              )
            )
          )
        ) AS "invalidLineCount"
      FROM "SharedPrepaidSettlement" settlement
      LEFT JOIN "SharedPrepaidSettlementLine" line ON line."settlementId" = settlement."id"
      LEFT JOIN "SharedPrepaidPayable" payable ON payable."id" = line."payableId"
      WHERE settlement."status" = 'COMPLETED'
      GROUP BY settlement."id"
    )
    SELECT
      "settlementId",
      "aToBAmount"::text AS "aToBAmount",
      "lineAToBAmount"::text AS "lineAToBAmount",
      "bToAAmount"::text AS "bToAAmount",
      "lineBToAAmount"::text AS "lineBToAAmount",
      "netAmount"::text AS "netAmount",
      "computedNetAmount"::text AS "computedNetAmount",
      "lineCount"::text AS "lineCount",
      "invalidLineCount"::text AS "invalidLineCount"
    FROM completed
    WHERE
      "lineCount" = 0
      OR "invalidLineCount" > 0
      OR ABS("aToBAmount" - "lineAToBAmount") > 0.01
      OR ABS("bToAAmount" - "lineBToAAmount") > 0.01
      OR ABS("netAmount" - "computedNetAmount") > 0.01
    ORDER BY "settlementId"
  `)

  if (!totals[0]) throw new Error('Shared prepaid totals query returned no row')
  return {
    ordinaryTableCounts: ordinary.counts,
    missingOrdinaryTables: ordinary.missing,
    legacyPrepaidCounts: {
      PrepaidRechargeRecord: await countOptionalTable(client, 'PrepaidRechargeRecord'),
      PrepaidCustomerRemark: await countOptionalTable(client, 'PrepaidCustomerRemark'),
      PrepaidUsageRemark: await countOptionalTable(client, 'PrepaidUsageRemark'),
      FinanceDeletionRequestPrepaidRecharge: {
        exists: financeDeletionRequestExists,
        count: financeDeletionRequestRows[0]?.count ?? '0'
      }
    },
    newLedgerTotals: totals[0],
    negativeBalanceRows: { members: negativeMembers, lots: negativeLots },
    lotVsMemberBalanceDifferences: lotDifferences,
    ledgerVsMemberBalanceDifferences: ledgerDifferences,
    duplicateActiveSampleConsumptions: duplicateConsumptions,
    heldPayablesWithoutActiveSettlements: orphanHeldPayables,
    completedSettlementLineMismatches: settlementMismatches
  }
}

export async function collectCutoverSnapshot(prisma: PrismaClient): Promise<CutoverSnapshot> {
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    return collectSnapshotFromClient(transaction)
  })
}

async function main() {
  const prisma = new PrismaClient()
  const exitCode = await runCutoverVerifier({
    collect: () => collectCutoverSnapshot(prisma),
    write: (value) => process.stdout.write(value)
  })
  await prisma.$disconnect().catch(() => undefined)
  process.exitCode = exitCode
}

if (require.main === module) void main()
