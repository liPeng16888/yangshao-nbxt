# Shared Prepaid Ledger and Cross-Account Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tenant-local, usage-count prepaid feature with a globally shared phone-based money ledger, transactional cross-account consumption allocation, net settlement with two-party confirmation, and a read-only mirrored admin experience.

**Architecture:** A dedicated NestJS `shared-prepaid` module owns global members, recharge lots, immutable ledger entries, sample-consumption allocations, rounded account-to-account payables, and settlement state. Lab-sheet saves call the ledger service inside the existing PostgreSQL sheet transaction so the sample and balance either both commit or both roll back. Vue receives four first-level prepaid pages plus a prepaid selection flow in the lab grid; admin receives the same four read-only views through GET-only controllers.

**Tech Stack:** Vue 3, Pinia, Vue Router, Element Plus, Axios, NestJS 10, Prisma 6, PostgreSQL row locks and Decimal, RxJS SSE, Vitest, TypeScript, pnpm.

## Global Constraints

- The first-level customer menu is named `预充值客户` and appears between `员工考勤` and `财务`.
- Its leaves are ordered exactly: `预存款充值`, `预存款客户`, `消费明细`, `转账结算`.
- A member is globally unique by a normalized 11-digit mainland China mobile number; spaces and hyphens are removed before validation.
- Spendable balance equals paid amount plus gift amount; paid amount must be greater than zero and gift amount is required but may be zero.
- Consumption prefers the consuming main account's oldest lots, then all other accounts' lots in stable recharge-date/created-time/ID order.
- Insufficient balance rejects the whole operation; negative balances and partial prepaid payments are not allowed.
- Cross-account payable is `allocated amount × paid amount ÷ (paid amount + gift amount)`.
- Allocation math keeps full Decimal precision, groups by recharge-owner account per consumption, then rounds with `ROUND_HALF_UP` to one decimal place.
- Opposite-direction payables are netted while the settlement retains both gross directions and every source line.
- Non-zero settlements require an actual transfer time; proof image and remark are optional. Zero-net settlements require counterparty confirmation without a transfer time.
- Recharge, consumption, allocation, payable, settlement, and reversal history is not directly edited or deleted.
- Subaccounts may use granted prepaid pages, but only frontend main accounts may submit payment, confirm receipt, reject, or cancel a settlement.
- Admin mirrors all four pages but exposes GET/read-only export APIs only; it cannot mutate prepaid data through UI or direct API calls.
- Legacy prepaid records and count-based remarks are deleted only in the cutover phase after a verified backup; old lab samples remain but never seed the new ledger.
- Existing ordinary finance, samples, customers, attendance, medicine inventory, and access-password data must remain unchanged.
- Use TDD for every production behavior: write the focused failing test, observe RED, implement the minimum behavior, then observe GREEN.

---

## File Structure

**New server files**

- `server/src/shared-prepaid/shared-prepaid.module.ts`: module wiring and exports used by lab sheets.
- `server/src/shared-prepaid/shared-prepaid.types.ts`: internal DTOs, allocation inputs, and result interfaces.
- `server/src/shared-prepaid/shared-prepaid-money.ts`: phone normalization, stable lot ordering, Decimal allocation, owner grouping, and one-decimal rounding.
- `server/src/shared-prepaid/shared-prepaid-money.test.ts`: exact allocation and rounding tests.
- `server/src/shared-prepaid/shared-prepaid-ledger.service.ts`: recharge, opening balance, member balance, consumption, and immutable reversal transactions.
- `server/src/shared-prepaid/shared-prepaid-ledger.service.test.ts`: validation, idempotency, locking, balance, and reversal tests.
- `server/src/shared-prepaid/shared-prepaid-query.service.ts`: global frontend lists/details and admin-scoped read models.
- `server/src/shared-prepaid/shared-prepaid-settlement.service.ts`: gross/net settlement creation and state transitions.
- `server/src/shared-prepaid/shared-prepaid-settlement.service.test.ts`: netting, freezing, permissions, and state-machine tests.
- `server/src/shared-prepaid/shared-prepaid.controller.ts`: permission-protected frontend JSON endpoints.
- `server/src/shared-prepaid/admin-shared-prepaid.controller.ts`: GET-only admin endpoints.
- `server/src/shared-prepaid/admin-shared-prepaid.controller.test.ts`: admin scope and GET-only route tests.
- `server/src/shared-prepaid/shared-prepaid-realtime.service.ts`: authenticated global prepaid event stream.
- `server/src/shared-prepaid/shared-prepaid-realtime.controller.ts`: SSE authentication and permission validation.
- `server/src/shared-prepaid/shared-prepaid-realtime.service.test.ts`: broadcast metadata and permission tests.
- `server/prisma/migrations/20260811230000_add_shared_prepaid_ledger/migration.sql`: new enums, tables, constraints, indexes, and permission migration.
- `server/prisma/migrations/20260811235900_remove_legacy_prepaid/migration.sql`: cutover-only removal of legacy prepaid rows/tables after backup.
- `server/scripts/verify-shared-prepaid-cutover.ts`: pre/post migration counts and ledger invariant checks.

**New customer frontend files**

- `src/types/sharedPrepaid.ts`: frontend read/write contracts and settlement states.
- `src/api/sharedPrepaid.ts`: frontend HTTP and SSE helpers with idempotency headers.
- `src/api/sharedPrepaid.test.ts`: endpoint, payload, and retry-key tests.
- `src/mocks/sharedPrepaid.ts`: deterministic dev-only shared member, recharge, consumption, and settlement fixture state.
- `src/mocks/sharedPrepaid.test.ts`: mock balance and 90.9/netting contract tests.
- `src/stores/sharedPrepaid.ts`: shared lists, filters, dirty state, and mutation actions.
- `src/stores/sharedPrepaid.test.ts`: store success, conflict, and non-destructive refresh tests.
- `src/components/prepaid/PrepaidMemberPickerDialog.vue`: exact-phone member lookup and balance confirmation for lab samples.
- `src/components/prepaid/PrepaidMemberPickerDialog.test.ts`: phone, balance, and confirm validation.
- `src/components/prepaid/PrepaidSettlementDetailDialog.vue`: gross/net/source-line review and payment/receipt actions.
- `src/views/dashboard/PrepaidRechargePage.vue`: recharge/opening-balance entry and immutable history.
- `src/views/dashboard/PrepaidCustomersPage.vue`: global member and balance-composition table.
- `src/views/dashboard/PrepaidConsumptionsPage.vue`: global consumption/allocation/payable details.
- `src/views/dashboard/PrepaidSettlementsPage.vue`: pair grouping, line selection, netting, and state actions.

**New admin files**

- `admin/src/config/prepaidNavigation.ts`: four read-only routes in approved order.
- `admin/src/config/prepaidNavigation.test.ts`: route/default-order contract.
- `admin/src/types/sharedPrepaid.ts`: admin read models.
- `admin/src/api/sharedPrepaid.ts`: GET-only admin client.
- `admin/src/views/SharedPrepaidReadOnlyPage.vue`: four read-only views selected by route meta.
- `admin/src/views/SharedPrepaidReadOnlyPage.test.ts`: proves mutation controls are absent.

**Existing files modified**

- `server/prisma/schema.prisma`: new enums/models/relations and four menu permissions.
- `server/src/app.module.ts`: register `SharedPrepaidModule`.
- `server/src/auth/frontend-menu-permissions.ts`: move prepaid leaves out of `FINANCE` into `PREPAID`.
- `server/src/auth/frontend-menu-permissions.test.ts`: exact permission catalog.
- `server/src/lab-sheets/lab-sheets.module.ts`: import the ledger module.
- `server/src/lab-sheets/lab-sheets.service.ts`: atomically sync prepaid consumption during sample save.
- `server/src/lab-sheets/lab-sheets.service.test.ts`: atomic save, rollback, stale balance, and reversal tests.
- `server/src/finance/finance.controller.ts`: remove legacy prepaid mutation/report endpoints.
- `server/src/finance/finance.service.ts`: source prepaid income from paid recharge principal only.
- `server/src/finance/finance.service.test.ts`: new income semantics and legacy removal regression.
- `server/src/reports/reports.service.ts`: source prepaid income from new recharge ledger.
- `server/src/reports/reports.service.test.ts`: principal-only amount and recharge-count semantics.
- `server/src/reminders/reminders.controller.ts`: replace legacy prepaid permission keys.
- `server/src/customers/customers.controller.ts`: remove legacy prepaid-add permission from customer lookup.
- `src/config/frontendNavigation.ts`: new first-level menu and four leaves.
- `src/config/frontendNavigation.test.ts`: ordering, permission, and route lookup.
- `src/router/index.ts`: four new routes and remove `/finance/prepaid/*`.
- `src/components/layout/AppSidebar.vue`: map the new prepaid navigation icon.
- `src/types/labSheet.ts`: member ID/phone and save idempotency fields.
- `src/api/labSheet.ts`: preserve one idempotency key across retries.
- `src/stores/labSheet.ts`: combined prepaid patch and 409 balance refresh behavior.
- `src/stores/labSheet.test.ts`: retry key, draft preservation, and conflict tests.
- `src/components/lab-sheet/LabSheetGrid.vue`: `扣除金额`, two-decimal input, member picker, and shared balance.
- `src/components/lab-sheet/LabSheetGrid.test.ts`: prepaid UI and combined update tests.
- `src/types/financeBills.ts`, `src/api/financeBills.ts`, `src/stores/financeBills.ts`, `src/utils/financeBills.ts`: remove count-based prepaid contracts and mocks.
- `src/utils/financeBills.test.ts`: remove legacy count assertions and retain ordinary finance coverage.
- `src/views/dashboard/FinancePrepaidAddPage.vue`, `src/views/dashboard/FinancePrepaidCustomersPage.vue`: delete after replacements are routed.
- `admin/src/router.ts`, `admin/src/views/AdminLayout.vue`: new first-level admin menu and routes.
- `admin/src/config/financeNavigation.ts`, `admin/src/config/financeNavigation.test.ts`: remove prepaid from finance groups.
- `admin/src/views/FinanceReportsPage.vue`, `admin/src/api.ts`: remove legacy prepaid finance tabs/mocks.
- `admin/src/types.ts`, `admin/src/components/FrontendSubAccountsReadOnly.vue`: show the four new permission leaves.
- `admin/src/views/TodoPage.vue`: remove legacy prepaid deletion-request labels.
- `docs/deployment/shared-prepaid-cutover.md`: backup, migrate, verify, seed opening balances, rollback, and smoke-test runbook.

---

### Task 1: Add the shared ledger schema and permission catalog

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260811230000_add_shared_prepaid_ledger/migration.sql`
- Modify: `server/src/auth/frontend-menu-permissions.ts`
- Test: `server/src/auth/frontend-menu-permissions.test.ts`
- Modify: `src/config/frontendNavigation.ts`
- Test: `src/config/frontendNavigation.test.ts`
- Modify: `admin/src/types.ts`
- Modify: `admin/src/components/FrontendSubAccountsReadOnly.vue`

**Interfaces:**
- Produces: Prisma enums `SharedPrepaidLedgerKind`, `SharedPrepaidConsumptionKind`, `SharedPrepaidPayableStatus`, and `SharedPrepaidSettlementStatus`.
- Produces: models `SharedPrepaidMember`, `SharedPrepaidRecharge`, `SharedPrepaidLedgerEntry`, `SharedPrepaidConsumption`, `SharedPrepaidAllocation`, `SharedPrepaidPayable`, `SharedPrepaidSettlement`, and `SharedPrepaidSettlementLine`.
- Produces permissions: `PREPAID_RECHARGE`, `PREPAID_CUSTOMERS`, `PREPAID_CONSUMPTIONS`, `PREPAID_SETTLEMENTS`.

- [ ] **Step 1: Write failing permission-catalog tests**

Update both catalogs to expect a separate `PREPAID` group between attendance and finance and an exact total of 26 leaves: remove two legacy leaves and add four new leaves.

```ts
expect(frontendMenuPermissionGroups.find((group) => group.key === 'PREPAID')?.children).toEqual([
  'PREPAID_RECHARGE',
  'PREPAID_CUSTOMERS',
  'PREPAID_CONSUMPTIONS',
  'PREPAID_SETTLEMENTS'
])
expect(frontendMenuPermissionGroups.find((group) => group.key === 'FINANCE')?.children).toEqual([
  'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED', 'FINANCE_MONTHLY_SETTLEMENT'
])
expect(new Set(allFrontendMenuPermissions).size).toBe(26)
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter yangshao-server test -- frontend-menu-permissions.test.ts`

Run: `pnpm test -- src/config/frontendNavigation.test.ts`

Expected: FAIL because the new group and permission enum values do not exist.

- [ ] **Step 3: Add schema models and constraints**

Add the four permission enum values and the following required shape. Use `Decimal(14,2)` for balances, `Decimal(20,8)` for exact payable math, and `Decimal(14,1)` for fixed rounded payable/settlement amounts.

```prisma
model SharedPrepaidMember {
  id            String   @id @default(uuid())
  phone         String   @unique
  cachedBalance Decimal  @default(0) @db.Decimal(14, 2)
  version       Int      @default(1)
  createdById   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model SharedPrepaidRecharge {
  id                    String   @id @default(uuid())
  memberId              String
  ownerFrontendUserId   String
  actorUserId           String
  rechargeDate          String
  paidAmount            Decimal  @db.Decimal(14, 2)
  giftAmount            Decimal  @db.Decimal(14, 2)
  totalAmount           Decimal  @db.Decimal(14, 2)
  remainingAmount       Decimal  @db.Decimal(14, 2)
  isOpeningBalance      Boolean  @default(false)
  remark                String?
  idempotencyKey        String   @unique
  reversedAt            DateTime?
  reversedByLedgerId    String?  @unique
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@index([memberId, ownerFrontendUserId, rechargeDate, createdAt, id])
}

model SharedPrepaidLedgerEntry {
  id                  String   @id @default(uuid())
  memberId            String
  kind                SharedPrepaidLedgerKind
  balanceDelta        Decimal  @db.Decimal(14, 2)
  ownerFrontendUserId String
  actorUserId         String
  referenceType       String
  referenceId         String
  idempotencyKey      String   @unique
  createdAt           DateTime @default(now())

  @@index([memberId, createdAt])
  @@index([referenceType, referenceId])
}
```

Use the following remaining scalar shape; add named Prisma relations to the member, owner, actor, sheet/block, counterparty, and reversal rows without changing these financial fields:

```prisma
enum SharedPrepaidLedgerKind {
  RECHARGE
  CONSUMPTION
  CONSUMPTION_REVERSAL
  RECHARGE_REVERSAL
}

enum SharedPrepaidConsumptionKind {
  CONSUMPTION
  REVERSAL
}

enum SharedPrepaidPayableStatus {
  PENDING
  HELD
  COMPLETED
  REVERSED
}

enum SharedPrepaidSettlementStatus {
  AWAITING_PAYMENT
  AWAITING_RECEIPT
  COMPLETED
  REJECTED
  CANCELLED
}

model SharedPrepaidConsumption {
  id                       String   @id @default(uuid())
  memberId                 String
  consumingFrontendUserId  String
  actorUserId              String
  kind                     SharedPrepaidConsumptionKind
  amount                   Decimal  @db.Decimal(14, 2)
  sheetId                  String
  sampleBlockId            String
  sampleIndex              Int
  sampleNumberSnapshot     String?
  sampleCountSnapshot      Int      @default(1)
  elementsSnapshot         Json
  phoneSnapshot            String
  sheetDate                String
  active                   Boolean  @default(true)
  reversalOfId             String?  @unique
  idempotencyKey           String   @unique
  createdAt                DateTime @default(now())

  @@index([memberId, createdAt])
  @@index([consumingFrontendUserId, createdAt])
  @@index([sampleBlockId, active])
}

model SharedPrepaidAllocation {
  id                  String   @id @default(uuid())
  consumptionId       String
  rechargeId          String
  sourceOwnerId       String
  allocatedAmount     Decimal  @db.Decimal(14, 2)
  paidRatio           Decimal  @db.Decimal(20, 10)
  exactTransferAmount Decimal  @db.Decimal(20, 8)
  createdAt           DateTime @default(now())

  @@unique([consumptionId, rechargeId])
  @@index([rechargeId])
}

model SharedPrepaidPayable {
  id                String                      @id @default(uuid())
  consumptionId     String
  sourceOwnerId     String
  consumerOwnerId   String
  exactAmount       Decimal                     @db.Decimal(20, 8)
  amount            Decimal                     @db.Decimal(14, 1)
  status            SharedPrepaidPayableStatus  @default(PENDING)
  reversalOfId      String?                     @unique
  createdAt         DateTime                    @default(now())
  updatedAt         DateTime                    @updatedAt

  @@unique([consumptionId, sourceOwnerId, consumerOwnerId])
  @@index([sourceOwnerId, consumerOwnerId, status, createdAt])
}

model SharedPrepaidSettlement {
  id                       String                         @id @default(uuid())
  accountAId               String
  accountBId               String
  aToBAmount               Decimal                        @db.Decimal(14, 1)
  bToAAmount               Decimal                        @db.Decimal(14, 1)
  netAmount                Decimal                        @db.Decimal(14, 1)
  payerFrontendUserId      String?
  receiverFrontendUserId   String?
  status                   SharedPrepaidSettlementStatus
  actualTransferredAt      DateTime?
  proofUrls                Json
  remark                   String?
  createdById              String
  paymentSubmittedById     String?
  paymentSubmittedAt       DateTime?
  receiptConfirmedById     String?
  receiptConfirmedAt       DateTime?
  rejectedById             String?
  rejectedAt               DateTime?
  rejectionReason          String?
  cancelledById            String?
  cancelledAt              DateTime?
  version                  Int                            @default(1)
  idempotencyKey           String                         @unique
  createdAt                DateTime                       @default(now())
  updatedAt                DateTime                       @updatedAt

  @@index([accountAId, accountBId, status, createdAt])
}

model SharedPrepaidSettlementLine {
  id           String   @id @default(uuid())
  settlementId String
  payableId    String
  direction    String
  amount       Decimal  @db.Decimal(14, 1)
  releasedAt   DateTime?
  createdAt    DateTime @default(now())

  @@unique([settlementId, payableId])
  @@index([payableId, releasedAt])
}
```

Add PostgreSQL partial unique indexes in the migration because Prisma cannot express them:

```sql
CREATE UNIQUE INDEX "SharedPrepaidConsumption_one_active_per_block"
ON "SharedPrepaidConsumption" ("sampleBlockId")
WHERE "active" = true AND "kind" = 'CONSUMPTION';

CREATE UNIQUE INDEX "SharedPrepaidSettlementLine_one_active_per_payable"
ON "SharedPrepaidSettlementLine" ("payableId") WHERE "releasedAt" IS NULL;
```

Add explicit named `User` relations for owner/actor/settlement parties, cascade only join/detail rows, and use `Restrict` for financial source records. Add unique constraints on active business identities: one active normal consumption per sample block, one payable per consumption/source-owner/consumer-owner, one active settlement line per payable, and unique idempotency keys.

- [ ] **Step 4: Create and inspect the non-destructive migration**

Run: `pnpm --filter yangshao-server exec prisma migrate dev --name add_shared_prepaid_ledger --create-only`

Rename the generated directory to `20260811230000_add_shared_prepaid_ledger` if needed. Add SQL that maps existing subaccount permissions before deleting legacy permission rows:

```sql
INSERT INTO "FrontendSubAccountPermission" ("id", "subAccountId", "permission", "createdAt")
SELECT md5("subAccountId" || ':PREPAID_RECHARGE')::uuid::text, "subAccountId", 'PREPAID_RECHARGE'::"FrontendMenuPermission", NOW()
FROM "FrontendSubAccountPermission" WHERE "permission" = 'FINANCE_PREPAID_ADD'
ON CONFLICT DO NOTHING;

INSERT INTO "FrontendSubAccountPermission" ("id", "subAccountId", "permission", "createdAt")
SELECT md5(old."subAccountId" || ':' || p."permission")::uuid::text, old."subAccountId", p."permission"::"FrontendMenuPermission", NOW()
FROM "FrontendSubAccountPermission" old
CROSS JOIN (VALUES ('PREPAID_CUSTOMERS'), ('PREPAID_CONSUMPTIONS')) AS p("permission")
WHERE old."permission" = 'FINANCE_PREPAID_CUSTOMERS'
ON CONFLICT DO NOTHING;

DELETE FROM "FrontendSubAccountPermission"
WHERE "permission" IN ('FINANCE_PREPAID_ADD', 'FINANCE_PREPAID_CUSTOMERS');
```

The migration must not drop old prepaid tables yet.

- [ ] **Step 5: Implement the permission catalogs and regenerate Prisma**

Run: `pnpm --filter yangshao-server prisma:generate`

Run: `pnpm --filter yangshao-server exec prisma validate`

Expected: both exit 0.

- [ ] **Step 6: Run GREEN tests and commit**

Run: `pnpm --filter yangshao-server test -- frontend-menu-permissions.test.ts`

Run: `pnpm test -- src/config/frontendNavigation.test.ts`

Expected: PASS.

```bash
git add server/prisma server/src/auth/frontend-menu-permissions.ts server/src/auth/frontend-menu-permissions.test.ts src/config/frontendNavigation.ts src/config/frontendNavigation.test.ts admin/src/types.ts admin/src/components/FrontendSubAccountsReadOnly.vue
git commit -m "feat: add shared prepaid ledger schema"
```

### Task 2: Implement phone normalization and Decimal allocation rules

**Files:**
- Create: `server/src/shared-prepaid/shared-prepaid.types.ts`
- Create: `server/src/shared-prepaid/shared-prepaid-money.ts`
- Test: `server/src/shared-prepaid/shared-prepaid-money.test.ts`

**Interfaces:**
- Produces: `normalizePrepaidPhone(value: unknown): string`.
- Produces: `allocatePrepaidLots(input: AllocationInput): AllocationResult`.
- Produces: `roundPayable(value: Prisma.Decimal): Prisma.Decimal`.
- `AllocationResult` contains ordered `allocations`, owner-grouped `payables`, and `remainingBalance` without mutating its input lots.

- [ ] **Step 1: Write failing normalization and allocation tests**

```ts
expect(normalizePrepaidPhone('138-0000 0000')).toBe('13800000000')
expect(() => normalizePrepaidPhone('1380000000')).toThrow('会员手机号必须为中国大陆 11 位手机号')

const result = allocatePrepaidLots({
  consumingFrontendUserId: 'B',
  amount: new Prisma.Decimal(100),
  lots: [{
    id: 'a-1', ownerFrontendUserId: 'A', rechargeDate: '2026-08-01',
    createdAt: new Date('2026-08-01T01:00:00Z'), paidAmount: new Prisma.Decimal(1000),
    giftAmount: new Prisma.Decimal(100), remainingAmount: new Prisma.Decimal(1100)
  }]
})
expect(result.payables).toEqual([
  expect.objectContaining({ sourceOwnerId: 'A', consumerOwnerId: 'B', amount: new Prisma.Decimal('90.9') })
])
```

Add cases for local-owner priority, FIFO ties by ID, one consumption split across lots owned by the same account before rounding, multiple source owners, zero gift, exact exhaustion, and insufficient balance.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-money.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure Decimal math**

```ts
export function roundPayable(value: Prisma.Decimal) {
  return value.toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
}

export function exactTransfer(allocated: Prisma.Decimal, paid: Prisma.Decimal, gift: Prisma.Decimal) {
  return allocated.mul(paid).div(paid.add(gift))
}
```

Sort a copied lot array by `owner === consuming owner` first, then `rechargeDate`, `createdAt.getTime()`, and `id`. Accumulate exact transfers in a `Map<sourceOwnerId, Decimal>` and round only after all lots for that source owner are included. Throw `ConflictException` with code `PREPAID_BALANCE_INSUFFICIENT` and the exact available balance when the sum is too small.

- [ ] **Step 4: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-money.test.ts`

Expected: PASS with all Decimal equality assertions.

```bash
git add server/src/shared-prepaid/shared-prepaid.types.ts server/src/shared-prepaid/shared-prepaid-money.ts server/src/shared-prepaid/shared-prepaid-money.test.ts
git commit -m "feat: add prepaid allocation math"
```

### Task 3: Build recharge, member balance, idempotency, and query services

**Files:**
- Create: `server/src/shared-prepaid/shared-prepaid-ledger.service.ts`
- Create: `server/src/shared-prepaid/shared-prepaid-query.service.ts`
- Create: `server/src/shared-prepaid/shared-prepaid.controller.ts`
- Create: `server/src/shared-prepaid/shared-prepaid.module.ts`
- Test: `server/src/shared-prepaid/shared-prepaid-ledger.service.test.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Produces: `createRecharge(user, payload, idempotencyKey)` and `reverseRecharge(user, rechargeId, reason, idempotencyKey)`.
- Produces: `getMemberByPhone(phone)`, `listMembers(query)`, `listRecharges(query)`, and `getMemberDetail(id)`.
- Frontend routes: `GET /shared-prepaid/members`, `GET /shared-prepaid/members/lookup`, `GET /shared-prepaid/members/:id`, `GET /shared-prepaid/recharges`, `POST /shared-prepaid/recharges`, `POST /shared-prepaid/recharges/:id/reversal`.

- [ ] **Step 1: Write failing ledger tests**

Cover required paid/gift/date/phone validation, a subaccount recharge being owned by `dataOwnerId` but audited by `user.id`, opening balance rejection for subaccounts, global phone reuse, two unrelated authorized main accounts receiving the same global member/balance result, idempotent duplicate request return, locked balance increment, and reversal allowed only for an unused lot.

```ts
expect(await service.createRecharge(subUser, {
  phone: '13800000000', rechargeDate: '2026-08-11', paidAmount: 1000, giftAmount: 100,
  isOpeningBalance: false, remark: '首次充值'
}, 'idem-1')).toMatchObject({
  phone: '13800000000', ownerFrontendUserId: 'front-1', actorUserId: 'sub-1',
  paidAmount: 1000, giftAmount: 100, totalAmount: 1100, balance: 1100
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-ledger.service.test.ts`

Expected: FAIL because the ledger service is missing.

- [ ] **Step 3: Implement recharge transaction and read models**

Normalize the phone before lookup. In one transaction, upsert the member, lock it with `SELECT "id" FROM "SharedPrepaidMember" WHERE "id" = ${memberId} FOR UPDATE`, return the original result when `idempotencyKey` already exists, create the recharge lot, append a positive `SharedPrepaidLedgerEntry`, and increment `cachedBalance` plus `version`.

```ts
async createRecharge(user: CurrentUser, payload: CreateRechargePayload, idempotencyKey: string) {
  if (!idempotencyKey) throw new BadRequestException('缺少幂等请求编号')
  if (payload.isOpeningBalance && !user.isFrontendMainAccount) throw new ForbiddenException('只有主账号可以录入期初余额')
  return this.prisma.$transaction((tx) => this.createRechargeInTransaction(tx, user, payload, idempotencyKey))
}
```

Read models return numbers as JSON but all service arithmetic remains `Prisma.Decimal`. Member rows include paid total, gift total, consumed total, balance, owner composition, latest recharge time, and latest consumption time.

- [ ] **Step 4: Add permission-protected controller routes**

Use `@Roles(UserRole.FRONTEND_USER)` and the exact leaf required by each route, such as `@FrontendPermission('PREPAID_RECHARGE')`. The server derives owner and actor from `CurrentUser`; request bodies cannot choose them. Read the key from `@Headers('x-idempotency-key')`.

```ts
@Post('recharges')
@FrontendPermission('PREPAID_RECHARGE')
createRecharge(@CurrentUserInfo() user: CurrentUser, @Headers('x-idempotency-key') key: string, @Body() body: CreateRechargePayload) {
  return this.ledger.createRecharge(user, body, key)
}
```

- [ ] **Step 5: Run GREEN, module build, and commit**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-ledger.service.test.ts frontend-permission.guard.test.ts`

Run: `pnpm --filter yangshao-server build`

Expected: PASS and build exit 0.

```bash
git add server/src/shared-prepaid server/src/app.module.ts
git commit -m "feat: add shared prepaid recharge ledger"
```

### Task 4: Make lab-sheet prepaid consumption atomic

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.module.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Test: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `src/types/labSheet.ts`
- Modify: `src/api/labSheet.ts`
- Modify: `src/stores/labSheet.ts`
- Test: `src/stores/labSheet.test.ts`

**Interfaces:**
- Adds `LabSampleInput.prepaidMemberId?: string` and `prepaidMemberPhone?: string`.
- Adds `SampleBlockSavePayload.idempotencyKey?: string`.
- Produces `SharedPrepaidLedgerService.syncSampleConsumption(tx, input): Promise<void>`.

- [ ] **Step 1: Write failing server tests for atomic save**

Add tests for a new prepaid sample, changing amount, changing away from prepaid, changing member, insufficient balance rollback, unrelated field change not creating a second consumption, and response-loss retry idempotency.

```ts
await service.saveSampleBlock(user, 'sheet-1', {
  id: 'block-1', idempotencyKey: 'cell-save-1',
  changedFields: { paymentStatus: '预存款', price: 100, prepaidMemberId: 'member-1', prepaidMemberPhone: '13800000000' }
})
expect(prepaid.syncSampleConsumption).toHaveBeenCalledWith(transaction, expect.objectContaining({
  sampleBlockId: 'block-1', consumingFrontendUserId: 'front-1', actorUserId: 'sub-1', amount: 100
}))
```

When the ledger throws `PREPAID_BALANCE_INSUFFICIENT`, assert `sampleBlock.update` and `recordInputChanges` are not committed.

- [ ] **Step 2: Run server tests and verify RED**

Run: `pnpm --filter yangshao-server test -- lab-sheets.service.test.ts`

Expected: FAIL because the service does not sync a ledger and the new inputs are not editable.

- [ ] **Step 3: Implement transactional synchronization**

Add both prepaid fields to `editableInputFields`. Inside the existing `withSheetWriteLock` transaction, compute `nextInputs`, validate the complete prepaid tuple, and call the ledger before updating the sample block.

```ts
await this.sharedPrepaid.syncSampleConsumption(tx, {
  sheetId: sheet.id,
  sampleBlockId: block.id,
  sampleIndex: block.index,
  sheetDate: sheet.date,
  consumingFrontendUserId: dataOwnerId,
  actorUserId: user.id,
  oldInputs,
  nextInputs,
  idempotencyKey: String(blockPayload.idempotencyKey || '')
})
```

The ledger locks the member and candidate recharge rows, calls `allocatePrepaidLots`, decrements each lot, appends a negative balance entry, creates consumption/allocation/payable rows, and decrements member balance in the same transaction. Existing active consumption is reversed before a changed prepaid tuple is applied. Reversal restores the exact original lots and creates opposite payables when the original payable was already completed.

- [ ] **Step 4: Write failing client retry and draft tests**

Assert `prepareBlockSave` adds one UUID and `saveBlockWithRetry` reuses the same payload object across transient retries. Assert a 409 response leaves dirty fields and local draft intact and exposes the latest balance message.

- [ ] **Step 5: Implement client idempotency and 409 handling**

```ts
payload: {
  id: block.id,
  idempotencyKey: crypto.randomUUID(),
  baseUpdatedAt: block.updatedAt,
  baseInputs,
  changedFields,
  changeLogFields: Array.from(pendingChangeLogFields.get(block.id)?.values() || [])
}
```

Do not regenerate the key inside `saveBlockWithRetry`. Treat 409 as a business conflict, never a transient retry.

- [ ] **Step 6: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- lab-sheets.service.test.ts shared-prepaid-ledger.service.test.ts`

Run: `pnpm test -- src/stores/labSheet.test.ts`

Expected: PASS.

```bash
git add server/src/lab-sheets server/src/shared-prepaid src/types/labSheet.ts src/api/labSheet.ts src/stores/labSheet.ts src/stores/labSheet.test.ts
git commit -m "feat: consume prepaid balance with sample saves"
```

### Task 5: Implement immutable consumption and recharge reversals

**Files:**
- Modify: `server/src/shared-prepaid/shared-prepaid-ledger.service.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid.controller.ts`
- Test: `server/src/shared-prepaid/shared-prepaid-ledger.service.test.ts`

**Interfaces:**
- Produces: `reverseRecharge(user, rechargeId, reason, idempotencyKey)`.
- Produces: `reverseConsumption(user, consumptionId, reason, idempotencyKey)`.
- Routes: `POST /shared-prepaid/recharges/:id/reversal` and `POST /shared-prepaid/consumptions/:id/reversal`.

- [ ] **Step 1: Write failing reversal tests**

Cover unused recharge reversal, partially used recharge rejection, unbatched consumption reversal, consumption held by a settlement rejection, and completed-payable reversal producing the opposite pending payable.

```ts
await expect(service.reverseRecharge(mainUser, 'recharge-1', '金额录错', 'rev-1'))
  .rejects.toThrow('该充值已有消费记录，请先冲正相关消费')
```

- [ ] **Step 2: Run RED**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-ledger.service.test.ts`

Expected: FAIL on missing reversal methods.

- [ ] **Step 3: Implement append-only correction events**

Reversal must never delete or overwrite the original amount. It appends a `SharedPrepaidLedgerEntry`, stores a reversal relation, restores or removes spendable balance as applicable, and marks the operational source as reversed only after the append succeeds. Require a non-empty reason and main-account identity for manual reversal endpoints.

For a completed payable A→B, create an equal positive B→A payable referencing the original; do not mutate the completed settlement.

- [ ] **Step 4: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-ledger.service.test.ts`

Expected: PASS.

```bash
git add server/src/shared-prepaid/shared-prepaid-ledger.service.ts server/src/shared-prepaid/shared-prepaid.controller.ts server/src/shared-prepaid/shared-prepaid-ledger.service.test.ts
git commit -m "feat: add prepaid ledger reversals"
```

### Task 6: Implement gross/net settlement and two-party confirmation

**Files:**
- Create: `server/src/shared-prepaid/shared-prepaid-settlement.service.ts`
- Test: `server/src/shared-prepaid/shared-prepaid-settlement.service.test.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid.controller.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid.module.ts`

**Interfaces:**
- Produces: `previewSettlement(user, payableIds)` without mutation.
- Produces: `createSettlement(user, payableIds, idempotencyKey)`.
- Produces: `submitPayment(user, id, payload, idempotencyKey)`, `confirmReceipt`, `rejectSettlement`, and `cancelSettlement`.
- Routes: `POST /shared-prepaid/settlements/preview`, `POST /shared-prepaid/settlements`, and state-action endpoints under `/shared-prepaid/settlements/:id/*`.

- [ ] **Step 1: Write failing netting and state tests**

```ts
expect(await service.previewSettlement(mainA, ['a-to-b-100', 'b-to-a-60'])).toMatchObject({
  accountAId: 'A', accountBId: 'B', aToBAmount: 100, bToAAmount: 60,
  payerFrontendUserId: 'A', receiverFrontendUserId: 'B', netAmount: 40
})
```

Add cases for unrelated third account, duplicate IDs, already-held payable, atomic freeze failure, subaccount creating/previewing but not submitting payment, wrong payer, wrong receiver, mandatory transfer time for non-zero, optional proof, zero-net counterparty confirmation, rejection release, cancellation before payment, and completed immutability.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-settlement.service.test.ts`

Expected: FAIL because the settlement service is missing.

- [ ] **Step 3: Implement selection, freeze, and net calculation**

All selected payables must involve exactly the current `dataOwnerId` and one counterparty. Lock payables in stable ID order. Compute two Decimal gross sums and one absolute one-decimal net amount. Create lines and transition every payable `PENDING → HELD` in one transaction.

```ts
const signedNet = aToB.sub(bToA)
const payerFrontendUserId = signedNet.gt(0) ? accountAId : signedNet.lt(0) ? accountBId : null
const receiverFrontendUserId = signedNet.gt(0) ? accountBId : signedNet.lt(0) ? accountAId : null
const netAmount = signedNet.abs().toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP)
```

- [ ] **Step 4: Implement main-account-only state actions**

Use `user.isFrontendMainAccount` in addition to role/permission checks. Non-zero payment moves `AWAITING_PAYMENT → AWAITING_RECEIPT`; receiver confirmation moves to `COMPLETED` and payables to `COMPLETED`. Rejection/cancellation releases payables to `PENDING`. Zero net starts directly in `AWAITING_RECEIPT` with the creator and confirmer recorded but no transfer time.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-settlement.service.test.ts`

Run: `pnpm --filter yangshao-server build`

Expected: PASS and build exit 0.

```bash
git add server/src/shared-prepaid
git commit -m "feat: add cross-account prepaid settlement"
```

### Task 7: Add permission-checked global realtime refresh

**Files:**
- Create: `server/src/shared-prepaid/shared-prepaid-realtime.service.ts`
- Create: `server/src/shared-prepaid/shared-prepaid-realtime.controller.ts`
- Test: `server/src/shared-prepaid/shared-prepaid-realtime.service.test.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid.module.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid-ledger.service.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid-settlement.service.ts`
- Modify: `src/api/sharedPrepaid.ts`
- Modify: `src/stores/sharedPrepaid.ts`
- Test: `src/stores/sharedPrepaid.test.ts`

**Interfaces:**
- SSE route: `GET /shared-prepaid/stream?token=<signed-jwt>`.
- Event payload: `{ type: 'change'; module: 'recharges'|'members'|'consumptions'|'settlements'; entityId; operation; changedById; updatedAt }`.

- [ ] **Step 1: Write failing server broadcast tests**

Assert an authenticated frontend main account can connect, a subaccount without any prepaid permission is denied, and an event contains metadata only—never phone, balance, proof URL, or remark.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter yangshao-server test -- shared-prepaid-realtime.service.test.ts`

Expected: FAIL because the stream does not exist.

- [ ] **Step 3: Implement the global channel**

Reuse `resolveCurrentUserIdentity` to verify token version and account status. Authorize when main account or when the subaccount has at least one of the four prepaid permissions. Keep the current single-process Subject pattern and the 25-second heartbeat; document PostgreSQL LISTEN/NOTIFY or Redis as a precondition before multi-instance deployment.

- [ ] **Step 4: Write failing dirty-form client tests**

Assert clean pages refresh automatically and dirty recharge/settlement forms receive a visible refresh prompt without losing input.

- [ ] **Step 5: Implement client registration and run GREEN**

Register one EventSource in the shared store, dispatch by module, and close it on logout/store disposal.

Run: `pnpm --filter yangshao-server test -- shared-prepaid-realtime.service.test.ts`

Run: `pnpm test -- src/stores/sharedPrepaid.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/shared-prepaid src/api/sharedPrepaid.ts src/stores/sharedPrepaid.ts src/stores/sharedPrepaid.test.ts
git commit -m "feat: sync shared prepaid changes live"
```

### Task 8: Replace legacy finance/report sources without double counting

**Files:**
- Modify: `server/src/finance/finance.controller.ts`
- Modify: `server/src/finance/finance.service.ts`
- Test: `server/src/finance/finance.service.test.ts`
- Modify: `server/src/reports/reports.service.ts`
- Test: `server/src/reports/reports.service.test.ts`
- Modify: `server/src/customers/customers.controller.ts`
- Modify: `server/src/reminders/reminders.controller.ts`
- Modify: `src/types/financeBills.ts`
- Modify: `src/api/financeBills.ts`
- Modify: `src/stores/financeBills.ts`
- Modify: `src/utils/financeBills.ts`
- Test: `src/utils/financeBills.test.ts`

**Interfaces:**
- Finance and report income queries consume active `SharedPrepaidRecharge.paidAmount` for the recharge owner/date.
- Gift amount never counts as cash income.
- Prepaid sample consumption never counts as a second income amount.
- A recharge contributes paid-principal income amount only; each prepaid lab sample contributes one sample count only, so neither recharge count nor consumption amount is double-counted.

- [ ] **Step 1: Write failing report tests**

```ts
expect(report.statusSummaries.find((row) => row.status === '预存款')).toMatchObject({ count: 1, amount: 1000 })
expect(report.totalAmount).toBe(1000)
expect(report.totalSamples).toBe(1)
```

Use one active recharge with paid amount 1000/gift amount 100 and one sample with `paymentStatus='预存款'` and `price=100`. Assert the sample contributes the count of 1, the recharge contributes the amount of 1000, gift contributes 0 income, and the sample does not add another 100 to income.

- [ ] **Step 2: Run RED**

Run: `pnpm --filter yangshao-server test -- finance.service.test.ts reports.service.test.ts`

Run: `pnpm test -- src/utils/financeBills.test.ts`

Expected: FAIL because old `usableTimes` records still drive reports.

- [ ] **Step 3: Switch queries and remove legacy endpoints**

Replace `prepaidRechargeRecord` reads with active new recharge lots scoped by `ownerFrontendUserId`. Sum `paidAmount`, not `totalAmount`. Count prepaid sample blocks in the prepaid status summary and total sample count, but do not add their deduction amount to income. Remove `/finance/prepaid-recharges`, `/finance/prepaid-report`, remark mutations, legacy admin prepaid routes, and prepaid delete-request creation. Preserve ordinary expense deletion requests.

Remove old frontend types, local-storage mock keys, count summarizers, and store actions. Remove legacy permission keys from customer lookup/reminders.

- [ ] **Step 4: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- finance.service.test.ts reports.service.test.ts`

Run: `pnpm test -- src/utils/financeBills.test.ts`

Expected: PASS.

```bash
git add server/src/finance server/src/reports server/src/customers/customers.controller.ts server/src/reminders/reminders.controller.ts src/types/financeBills.ts src/api/financeBills.ts src/stores/financeBills.ts src/utils/financeBills.ts src/utils/financeBills.test.ts
git commit -m "refactor: replace legacy prepaid reports"
```

### Task 9: Add customer frontend contracts, navigation, API, and store

**Files:**
- Create: `src/types/sharedPrepaid.ts`
- Create: `src/api/sharedPrepaid.ts`
- Test: `src/api/sharedPrepaid.test.ts`
- Create: `src/mocks/sharedPrepaid.ts`
- Test: `src/mocks/sharedPrepaid.test.ts`
- Create: `src/stores/sharedPrepaid.ts`
- Test: `src/stores/sharedPrepaid.test.ts`
- Modify: `src/config/frontendNavigation.ts`
- Test: `src/config/frontendNavigation.test.ts`
- Modify: `src/router/index.ts`
- Modify: `src/components/layout/AppSidebar.vue`

**Interfaces:**
- Produces typed `PrepaidMemberRow`, `PrepaidRechargeRow`, `PrepaidConsumptionRow`, `PrepaidPayableRow`, `PrepaidSettlementRow`, and mutation payloads.
- Produces store actions matching every frontend route from Tasks 3, 5, and 6.

- [ ] **Step 1: Write failing navigation and API tests**

```ts
expect(frontendNavigation.map((item) => item.key)).toEqual([
  'DATA', 'LAB_REPORT', 'ATTENDANCE', 'PREPAID', 'FINANCE', 'REPORTS',
  'MEDICINE_INVENTORY', 'CUSTOMER_OVERVIEW', 'BLACKLIST'
])
expect(permissionForPath('/prepaid/settlements')).toBe('PREPAID_SETTLEMENTS')
expect(firstAllowedPath(prepaidCustomersOnly, '/prepaid')).toBe('/prepaid/customers')
```

Mock Axios and assert mutations send a stable `X-Idempotency-Key` and typed payloads.

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/config/frontendNavigation.test.ts src/api/sharedPrepaid.test.ts src/mocks/sharedPrepaid.test.ts src/stores/sharedPrepaid.test.ts`

Expected: FAIL on missing routes/API/store.

- [ ] **Step 3: Implement navigation and routes**

Use routes `/prepaid/recharges`, `/prepaid/customers`, `/prepaid/consumptions`, `/prepaid/settlements`; `/prepaid` redirects to the first permitted leaf. Remove `/finance/prepaid/*` imports and routes. Add `prepaid` to `FrontendNavigationIcon` and map it to Element Plus `Money` in `AppSidebar.vue`.

- [ ] **Step 4: Implement API/store contracts**

The API accepts an optional explicit idempotency key for tests and retries; otherwise it creates `crypto.randomUUID()` once at action start. When `useMocks` is true, call a focused in-memory mock module that normalizes phone numbers, maintains recharge/balance arrays, returns 90.9 for the approved 1000+100/100 example, and nets opposite payables. The store keeps independent loading and dirty states per page and preserves local selection/form data on 409.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm test -- src/config/frontendNavigation.test.ts src/api/sharedPrepaid.test.ts src/mocks/sharedPrepaid.test.ts src/stores/sharedPrepaid.test.ts`

Expected: PASS.

```bash
git add src/types/sharedPrepaid.ts src/api/sharedPrepaid.ts src/api/sharedPrepaid.test.ts src/mocks/sharedPrepaid.ts src/mocks/sharedPrepaid.test.ts src/stores/sharedPrepaid.ts src/stores/sharedPrepaid.test.ts src/config/frontendNavigation.ts src/config/frontendNavigation.test.ts src/router/index.ts src/components/layout/AppSidebar.vue
git commit -m "feat: add prepaid frontend contracts and routes"
```

### Task 10: Build recharge, customer, and consumption pages

**Files:**
- Create: `src/views/dashboard/PrepaidRechargePage.vue`
- Create: `src/views/dashboard/PrepaidCustomersPage.vue`
- Create: `src/views/dashboard/PrepaidConsumptionsPage.vue`
- Test: `src/views/dashboard/PrepaidPages.test.ts`
- Delete: `src/views/dashboard/FinancePrepaidAddPage.vue`
- Delete: `src/views/dashboard/FinancePrepaidCustomersPage.vue`

**Interfaces:**
- Consumes: typed store from Task 9.
- Produces: approved field labels, global balance composition, allocation detail, filters, and main-account-only opening/reversal controls.

- [ ] **Step 1: Write failing page tests**

Mount pages with a mocked store and assert:

```ts
expect(wrapper.text()).toContain('会员手机号')
expect(wrapper.text()).toContain('充值金额')
expect(wrapper.text()).toContain('赠送金额')
expect(wrapper.text()).not.toContain('可使用次数')
```

Test required gift amount including zero, invalid phone, opening-balance button hidden for subaccounts, customer balance columns, consumption source/consumer account columns, sample count/elements/time, filters, and no direct delete/edit buttons.

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/views/dashboard/PrepaidPages.test.ts`

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Implement approved pages**

Recharge confirmation text must show paid, gift, total, and owner. Customer detail shows each recharge lot and remaining amount. Consumption detail expands one row into allocations and account payables. Use `ElMessageBox` only for immutable reversal confirmation and require a reason.

- [ ] **Step 4: Run GREEN and commit**

Run: `pnpm test -- src/views/dashboard/PrepaidPages.test.ts`

Expected: PASS.

```bash
git add src/views/dashboard/PrepaidRechargePage.vue src/views/dashboard/PrepaidCustomersPage.vue src/views/dashboard/PrepaidConsumptionsPage.vue src/views/dashboard/PrepaidPages.test.ts src/views/dashboard/FinancePrepaidAddPage.vue src/views/dashboard/FinancePrepaidCustomersPage.vue
git commit -m "feat: add shared prepaid customer pages"
```

### Task 11: Integrate the member picker and deduction amount into data calculation

**Files:**
- Create: `src/components/prepaid/PrepaidMemberPickerDialog.vue`
- Test: `src/components/prepaid/PrepaidMemberPickerDialog.test.ts`
- Modify: `src/components/lab-sheet/LabSheetGrid.vue`
- Test: `src/components/lab-sheet/LabSheetGrid.test.ts`
- Modify: `src/types/labSheet.ts`

**Interfaces:**
- Produces dialog result `{ memberId: string; phone: string; amount: number; currentBalance: number }`.
- Lab grid emits one combined patch `{ paymentStatus: '预存款', price, prepaidMemberId, prepaidMemberPhone }`.

- [ ] **Step 1: Write failing picker/grid tests**

Assert choosing “预存款” opens the picker, exact phone lookup is required, balance and post-deduction balance render, insufficient balance disables confirm, and confirmation emits one combined patch. Assert the label is `扣除金额`, precision is 2, and old `扣除次数` text is absent.

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/components/prepaid/PrepaidMemberPickerDialog.test.ts src/components/lab-sheet/LabSheetGrid.test.ts`

Expected: FAIL on missing dialog and old label/precision.

- [ ] **Step 3: Implement atomic interaction**

Do not first emit a bare `paymentStatus='预存款'`. Open the dialog and emit the complete tuple only after member and amount validation. Changing an existing prepaid amount keeps member fields in the same saved block. Changing status away from prepaid emits `prepaidMemberId: undefined` and `prepaidMemberPhone: undefined` so the server reverses the active consumption.

```ts
emitUpdate(blockId, {
  paymentStatus: '预存款',
  price: result.amount,
  prepaidMemberId: result.memberId,
  prepaidMemberPhone: result.phone
})
```

- [ ] **Step 4: Run GREEN and commit**

Run: `pnpm test -- src/components/prepaid/PrepaidMemberPickerDialog.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/stores/labSheet.test.ts`

Expected: PASS.

```bash
git add src/components/prepaid src/components/lab-sheet/LabSheetGrid.vue src/components/lab-sheet/LabSheetGrid.test.ts src/types/labSheet.ts
git commit -m "feat: select prepaid members in lab data"
```

### Task 12: Build the net settlement frontend

**Files:**
- Create: `src/components/prepaid/PrepaidSettlementDetailDialog.vue`
- Test: `src/components/prepaid/PrepaidSettlementDetailDialog.test.ts`
- Create: `src/views/dashboard/PrepaidSettlementsPage.vue`
- Test: `src/views/dashboard/PrepaidSettlementsPage.test.ts`
- Modify: `src/api/sharedPrepaid.ts`
- Modify: `src/stores/sharedPrepaid.ts`

**Interfaces:**
- Consumes settlement preview/create/actions from Task 6.
- Produces two-direction line selection, gross/net preview, optional proof upload through `uploadImages`, and role/state-specific actions.

- [ ] **Step 1: Write failing settlement UI tests**

Cover grouping by counterparty, separate A→B and B→A tables, selected gross totals, net payer/receiver, fixed one-decimal display, stale-line 409 preserving selection, subaccount action restrictions, non-zero transfer time requirement, optional proof, zero-net confirmation, rejection reason, and completed lock.

- [ ] **Step 2: Run RED**

Run: `pnpm test -- src/components/prepaid/PrepaidSettlementDetailDialog.test.ts src/views/dashboard/PrepaidSettlementsPage.test.ts`

Expected: FAIL because settlement UI does not exist.

- [ ] **Step 3: Implement selection and preview**

Send both directions' payable IDs to `/preview` before creating. Render `A应付B`, `B应付A`, `抵扣金额`, and `实际转账金额`; never replace gross values with net-only display. On create conflict, retain checked IDs and reload only unavailable rows.

- [ ] **Step 4: Implement payment and confirmation actions**

Reuse `uploadImages` for an optional proof image. Main payer submits actual transfer time; main receiver confirms or rejects with a required reason. For zero net, render `发起核对` and `确认核对` without transfer fields.

- [ ] **Step 5: Run GREEN and commit**

Run: `pnpm test -- src/components/prepaid/PrepaidSettlementDetailDialog.test.ts src/views/dashboard/PrepaidSettlementsPage.test.ts src/stores/sharedPrepaid.test.ts`

Expected: PASS.

```bash
git add src/components/prepaid/PrepaidSettlementDetailDialog.vue src/components/prepaid/PrepaidSettlementDetailDialog.test.ts src/views/dashboard/PrepaidSettlementsPage.vue src/views/dashboard/PrepaidSettlementsPage.test.ts src/api/sharedPrepaid.ts src/stores/sharedPrepaid.ts
git commit -m "feat: add prepaid net settlement UI"
```

### Task 13: Mirror all prepaid pages in admin as read-only

**Files:**
- Modify: `server/src/shared-prepaid/shared-prepaid-query.service.ts`
- Create: `server/src/shared-prepaid/admin-shared-prepaid.controller.ts`
- Modify: `server/src/shared-prepaid/shared-prepaid.module.ts`
- Test: `server/src/shared-prepaid/admin-shared-prepaid.controller.test.ts`
- Create: `admin/src/config/prepaidNavigation.ts`
- Test: `admin/src/config/prepaidNavigation.test.ts`
- Create: `admin/src/types/sharedPrepaid.ts`
- Create: `admin/src/api/sharedPrepaid.ts`
- Create: `admin/src/views/SharedPrepaidReadOnlyPage.vue`
- Test: `admin/src/views/SharedPrepaidReadOnlyPage.test.ts`
- Modify: `admin/src/router.ts`
- Modify: `admin/src/views/AdminLayout.vue`
- Modify: `admin/src/config/financeNavigation.ts`
- Test: `admin/src/config/financeNavigation.test.ts`
- Modify: `admin/src/views/FinanceReportsPage.vue`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/views/TodoPage.vue`

**Interfaces:**
- GET routes: `/admin/shared-prepaid/recharges`, `/members`, `/consumptions`, `/settlements`, and `/:resource/:id` details.
- Admin first-level route: `/shared-prepaid`, defaulting to `/shared-prepaid/recharges`.
- Admin mutations under `/admin/shared-prepaid` do not exist.

- [ ] **Step 1: Write failing GET-only controller tests**

Use route metadata or Supertest to prove the four GET collections return read models, root admin sees all, sub-admin sees only rows where an allowed frontend account is an owner/consumer/settlement party, and POST/PATCH/PUT/DELETE return 404/403.

```ts
expect(registeredRoutes.filter((route) => route.path.startsWith('/admin/shared-prepaid'))
  .every((route) => route.method === 'GET')).toBe(true)
```

- [ ] **Step 2: Run server RED**

Run: `pnpm --filter yangshao-server test -- admin-shared-prepaid.controller.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement admin-scoped query endpoints**

Use `AdminAccessService.getAllowedFrontendUserIds`. For recharges, filter owner IDs; consumptions include rows whose consumer or source owner is allowed; settlements include rows where either party is allowed. Return counterparty identity only for records already included by that rule.

- [ ] **Step 4: Write failing admin navigation/read-only tests**

```ts
expect(prepaidNavigation.map((item) => item.label)).toEqual([
  '预存款充值', '预存款客户', '消费明细', '转账结算'
])
expect(wrapper.findAll('button').map((button) => button.text())).not.toEqual(
  expect.arrayContaining(['新增', '编辑', '删除', '冲正', '提交已支付', '确认到账'])
)
```

- [ ] **Step 5: Implement admin routes and remove finance prepaid tabs**

Insert `预充值客户` between admin employee attendance and finance. Render filters, pagination, detail drawers, proof preview, and export only. Remove the old `prepaid` finance group, mock rows, editable remark, and legacy deletion-request labels.

- [ ] **Step 6: Run GREEN and commit**

Run: `pnpm --filter yangshao-server test -- admin-shared-prepaid.controller.test.ts`

Run: `pnpm test -- admin/src/config/prepaidNavigation.test.ts admin/src/config/financeNavigation.test.ts admin/src/views/SharedPrepaidReadOnlyPage.test.ts`

Run: `pnpm build:admin`

Expected: PASS and admin build exit 0.

```bash
git add server/src/shared-prepaid admin/src
git commit -m "feat: add read-only prepaid admin views"
```

### Task 14: Perform legacy cutover, full verification, and browser acceptance

**Files:**
- Create: `server/prisma/migrations/20260811235900_remove_legacy_prepaid/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Create: `server/scripts/verify-shared-prepaid-cutover.ts`
- Create: `docs/deployment/shared-prepaid-cutover.md`
- Modify: `server/package.json`

**Interfaces:**
- Produces script `pnpm --filter yangshao-server prepaid:verify-cutover`.
- Produces a cutover runbook that blocks destructive migration until backup verification succeeds.

- [ ] **Step 1: Write the cutover verifier before destructive SQL**

The script must print JSON containing ordinary-table counts, legacy prepaid counts, new ledger totals, negative-balance rows, lot-vs-member balance differences, duplicate active sample consumptions, held payables without active settlements, and completed settlement line mismatches. Exit non-zero when any invariant fails.

```ts
if (negativeMembers.length || negativeLots.length || duplicateConsumptions.length || balanceDifference.abs().gt('0.01')) {
  process.exitCode = 1
}
```

- [ ] **Step 2: Create explicit legacy cleanup migration**

The migration must use named tables only and run in a transaction:

```sql
DELETE FROM "FinanceDeletionRequest" WHERE "sourceType" = 'PREPAID_RECHARGE';
DROP TABLE "PrepaidUsageRemark";
DROP TABLE "PrepaidCustomerRemark";
DROP TABLE "PrepaidRechargeRecord";
```

Remove the three legacy models/relations from `schema.prisma`. Keep old lab sample JSON untouched; new reports query only new ledger tables, so historical `paymentStatus='预存款'` rows do not seed balances.

- [ ] **Step 3: Write the backup/cutover/rollback runbook**

The runbook order is mandatory:

1. Put prepaid writes in maintenance mode.
2. Record `SELECT COUNT(*)` for ordinary business tables.
3. Create a timestamped PostgreSQL backup.
4. Restore that backup into a temporary database and run `SELECT 1` plus count checks.
5. Run the non-destructive ledger migration.
6. Run the verifier.
7. Run the legacy cleanup migration.
8. Run the verifier again and compare ordinary counts.
9. Start services and enter opening balances from main accounts.
10. Complete two-account recharge, consumption, net settlement, and receipt smoke tests.
11. If any invariant fails, stop writes and restore the verified backup; do not edit balances manually.

- [ ] **Step 4: Run schema and focused test verification**

Run: `pnpm --filter yangshao-server prisma:generate`

Run: `pnpm --filter yangshao-server exec prisma validate`

Run: `pnpm --filter yangshao-server test -- shared-prepaid-money.test.ts shared-prepaid-ledger.service.test.ts shared-prepaid-settlement.service.test.ts shared-prepaid-realtime.service.test.ts admin-shared-prepaid.controller.test.ts lab-sheets.service.test.ts finance.service.test.ts reports.service.test.ts frontend-menu-permissions.test.ts`

Run: `pnpm test -- src/config/frontendNavigation.test.ts src/api/sharedPrepaid.test.ts src/mocks/sharedPrepaid.test.ts src/stores/sharedPrepaid.test.ts src/components/prepaid/PrepaidMemberPickerDialog.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/PrepaidPages.test.ts src/views/dashboard/PrepaidSettlementsPage.test.ts admin/src/config/prepaidNavigation.test.ts admin/src/views/SharedPrepaidReadOnlyPage.test.ts`

Expected: all commands exit 0 with zero failed tests.

- [ ] **Step 5: Run full type checks and production builds**

Run: `pnpm build:all`

Run: `pnpm test:all`

Expected: frontend, admin, and server builds exit 0; all test suites report zero failures. If root Vitest discovers `.worktrees/**`, `.pnpm-store/**`, or cache copies, add those directories to `vitest.config.ts` exclusions before interpreting duplicate failures, then rerun the full command.

- [ ] **Step 6: Perform local browser acceptance**

Start the API, customer frontend, and admin frontend. In the in-app browser verify:

- Customer menu order is `员工考勤 → 预充值客户 → 财务`.
- The four prepaid leaves appear in approved order and route independently.
- A 1000 + 100 recharge displays 1100 balance.
- Account B consuming 100 from A creates a 90.9 A→B payable.
- Local-account lots are consumed before remote lots.
- Insufficient balance keeps the sample form input and saves neither sample nor ledger change.
- Opposite 100 and 60 payables produce a 40 net settlement while both gross lists remain visible.
- Non-zero payment accepts transfer time with no proof; receiver confirmation completes it.
- Admin shows all four datasets without any mutation control.

- [ ] **Step 7: Commit the cutover and verification assets**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260811235900_remove_legacy_prepaid server/scripts/verify-shared-prepaid-cutover.ts server/package.json docs/deployment/shared-prepaid-cutover.md
git commit -m "chore: finalize shared prepaid cutover"
```

## Completion Gate

Do not claim the feature complete until all of the following evidence is fresh:

- `git status --short` contains no unexpected files.
- `pnpm --filter yangshao-server exec prisma validate` exits 0.
- All focused shared-prepaid, lab-sheet, permissions, finance, report, frontend, and admin tests pass.
- `pnpm test:all` reports zero failures.
- `pnpm build:all` exits 0.
- The cutover verifier exits 0 before and after legacy cleanup in the target environment.
- The in-app browser two-account acceptance flow produces 90.9 for the approved example and 40 for the approved netting example.
- Admin mutation attempts are rejected even when sent directly instead of through the hidden UI.
- A verified database backup exists before the legacy cleanup migration is deployed.
