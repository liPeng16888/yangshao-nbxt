# Historical Sample Change Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a frontend account to request audited changes to one historical sample, let an authorized administrator approve or reject the whole request, and apply approved inputs plus recalculated results atomically.

**Architecture:** Add a dedicated Prisma-backed sample-change-request domain with separate frontend and admin controllers. Keep historical sheets read-only; the frontend edits an isolated request draft, while the admin can only approve or reject from the todo page. Approval locks the request and sample, applies a validated input patch, recalculates with the sample parameter snapshot, writes linked cell history, resets affected settled monthly bills, and creates the reminder in one transaction.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, Axios, NestJS 10, Prisma 6, PostgreSQL, Vitest, Vue Test Utils.

**Spec:** `docs/superpowers/specs/2026-08-20-historical-sample-change-approval-design.md`

## Global Constraints

- Only samples whose `LabSheet.date` is earlier than `businessDateInBeijing()` can use this request flow; current-day editing and autosave remain unchanged.
- One request targets one sample and may change multiple allowed fields; approval and rejection are whole-request operations.
- Only one `PENDING` request may exist for a sample; a pending request may be withdrawn and resubmitted, while all terminal records remain stored.
- Request reason is required, rejection reason is required, and approval remark is optional.
- Allowed changes are `sampleNumber`, the payer-customer bundle, `price`, `paymentStatus`, `elementNote`, and the exact fields in `labDetectionInputFields`.
- `sequence`, `completed`, recipient customers, `note`, parameters, parameter snapshots, and `results` are never accepted in a request patch.
- Formula results are always recalculated on the server with the target sample's saved `parameterSnapshot`; neither frontend nor admin may submit result overrides.
- `ROOT_ADMIN` may review every request; `SUB_ADMIN` may review only requests for frontend accounts authorized by `AdminAccessService`.
- `admin/src/views/DataStatisticsPage.vue` stays GET-only and has no direct historical-sample mutation control.
- Approval that affects a paid or partially paid monthly bill resets the affected old/new customer-month records to unpaid and stores their previous settlement snapshots on the request.
- The migration is additive: no existing sample, finance, monthly-settlement, prepaid, reminder, or cell-history row is rewritten or deleted.
- Mock behavior must match the real request lifecycle, but real service and controller tests are the authority for DTO, authorization, transaction, and recalculation behavior.
- Use task-level RED -> minimal GREEN. Run focused tests before each task commit and the full excluded regression suite before completion.
- Preserve the unrelated untracked file `docs/superpowers/plans/2026-08-20-frontend-subaccounts-menu-permissions.md`.

## File Structure

### Server and persistence

- `server/prisma/schema.prisma`: request status, request model, user/sheet/block relations, reminder types, and optional cell-log link.
- `server/prisma/migrations/20260820000000_add_lab_sample_change_requests/migration.sql`: additive SQL and the partial unique pending index.
- `server/src/lab-sample-change-requests/lab-sample-change-request.types.ts`: normalized change patch, snapshots, grants, filters, and DTO contracts.
- `server/src/lab-sample-change-requests/lab-sample-change-fields.ts`: whitelist validation, patch application, changed-field extraction, and payer-customer normalization helpers.
- `server/src/lab-sample-change-requests/lab-sample-change-fields.test.ts`: pure field-contract tests.
- `server/src/lab-sample-change-requests/dto.ts`: class-validator request, query, approve, and reject DTOs.
- `server/src/lab-sample-change-requests/lab-sample-change-requests.service.ts`: frontend lifecycle, admin queries, approval/rejection transactions, conflicts, monthly resets, and DTO mapping.
- `server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`: service authorization, state, transaction, calculation, and rollback tests.
- `server/src/lab-sample-change-requests/lab-sample-change-requests.controller.ts`: frontend-role endpoints and two access-grant headers.
- `server/src/lab-sample-change-requests/admin-lab-sample-change-requests.controller.ts`: root/sub-admin endpoints.
- `server/src/lab-sample-change-requests/lab-sample-change-requests.controller.test.ts`: route-to-service contract and header propagation tests.
- `server/src/lab-sample-change-requests/lab-sample-change-requests.module.ts`: module wiring.
- `server/src/lab-sheets/lab-cell-change.service.ts`: shared cell history plus abnormal-count writer.
- `server/src/lab-sheets/lab-cell-change.service.test.ts`: autosave coalescing and request-linked log behavior.
- `server/src/lab-sheets/lab-sheets.service.ts`: delegate existing change-log behavior to the shared service.
- `server/src/lab-sheets/lab-sheets.service.test.ts`: preserve current sheet-save regression coverage after extraction.
- `server/src/lab-sheets/lab-sheets.module.ts`: provide and export `LabCellChangeService`.
- `server/src/common/sample-payer.ts`: one canonical payer name/key function shared by finance and approvals.
- `server/src/common/sample-payer.test.ts`: stored text, snapshot, and empty-customer behavior.
- `server/src/finance/finance.service.ts`: delegate customer-name derivation to the shared helper.
- `server/src/app.module.ts`: register the new request module.

### Frontend account app

- `src/types/labSampleChangeRequest.ts`: frontend request types and payloads.
- `src/constants/labSampleChangeRequest.ts`: field labels and raw-input field list.
- `src/utils/labSampleChangeRequest.ts`: draft creation, normalized diff, eligibility, and result preview.
- `src/utils/labSampleChangeRequest.test.ts`: pure frontend diff tests.
- `src/api/labSampleChangeRequest.ts`: real and mock request APIs plus separate historical/completed-data grant headers.
- `src/api/labSampleChangeRequest.test.ts`: URLs, payloads, filters, and access headers.
- `src/stores/labSampleChangeRequest.ts`: request list, pending-by-block map, create, detail, and withdraw state.
- `src/stores/labSampleChangeRequest.test.ts`: state transitions and failure preservation.
- `src/mocks/db.ts`: frontend request mock records and lifecycle functions.
- `src/types/reminder.ts`: new approval/rejection reminder variants.
- `src/components/lab-sheet/HistoricalSampleChangeDialog.vue`: isolated allowed-field form, diff, reason, and formula preview.
- `src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts`: validation, preview, immutable source, and emitted payload tests.
- `src/components/lab-sheet/LabSampleChangeRequestDrawer.vue`: frontend request history and pending withdrawal UI.
- `src/components/lab-sheet/LabSampleChangeRequestDrawer.test.ts`: history rendering and withdraw events.
- `src/components/lab-sheet/LabSheetGrid.vue`: historical per-sample request/pending actions only.
- `src/components/lab-sheet/LabSheetGrid.test.ts`: eligible history action and current-sheet regression tests.
- `src/views/dashboard/LabDataPage.vue`: coordinate historical request loading, dialogs, drawer, submit, and withdraw.
- `src/views/dashboard/LabDataPage.test.ts`: page-level history/current behavior and request lifecycle tests.

### Admin app

- `admin/src/types.ts`: admin request summary/detail/filter types.
- `admin/src/api.ts`: real and mock list/detail/approve/reject functions and seeded mock records.
- `admin/src/api.labSampleChangeRequests.test.ts`: API contract and mock state-transition tests.
- `admin/src/components/todos/FinanceDeletionRequestsPanel.vue`: existing deletion-request table and actions moved without behavior changes.
- `admin/src/components/todos/LabSampleChangeRequestsPanel.vue`: filters, diff detail, approval, rejection, and terminal-state UI.
- `admin/src/components/todos/LabSampleChangeRequestsPanel.test.ts`: permissions-neutral UI contract and actions.
- `admin/src/views/TodoPage.vue`: two-tab container only.
- `admin/src/views/TodoPage.test.ts`: both todo categories render and remain isolated.
- `admin/src/views/DataStatisticsPage.test.ts`: explicit GET-only/no-direct-edit boundary regression.

---

### Task 1: Add the persistence and normalized change-field contract

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260820000000_add_lab_sample_change_requests/migration.sql`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-request.types.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-fields.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-fields.test.ts`
- Create: `server/src/common/sample-payer.ts`
- Create: `server/src/common/sample-payer.test.ts`
- Modify: `server/src/finance/finance.service.ts`

**Interfaces:**
- Produces: `LabSampleChangeRequestStatus`, Prisma `LabSampleChangeRequest`, and optional `CellChangeLog.changeRequestId`.
- Produces: `LAB_SAMPLE_CHANGE_RAW_FIELDS`, `RequestedLabSampleChanges`, `normalizeRequestedChanges(value)`, `applyRequestedChanges(inputs, changes, canonicalCustomers)`, `diffChangedInputs(oldInputs, nextInputs)`.
- Produces: `samplePayerName(inputs): string`, returning the trimmed `customerText`, snapshot names joined by `、`, or `无信息`.

- [ ] **Step 1: Write failing pure contract tests**

```ts
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { applyRequestedChanges, normalizeRequestedChanges } from './lab-sample-change-fields'
import { samplePayerName } from '../common/sample-payer'

describe('historical sample requested changes', () => {
  it('normalizes allowed values and keeps payer customer as one logical field', () => {
    expect(normalizeRequestedChanges({
      sampleNumber: '  新样品  ',
      payerCustomer: { customerIds: ['c-1', 'c-1'], customerText: ' 王总 ' },
      price: 88.5,
      paymentStatus: '月结款',
      elementNote: ' 铁、硅 ',
      ironRaw: 1.25
    })).toEqual({
      sampleNumber: '新样品',
      payerCustomer: { customerIds: ['c-1'], customerText: '王总' },
      price: 88.5,
      paymentStatus: '月结款',
      elementNote: '铁、硅',
      ironRaw: 1.25
    })
  })

  it.each(['results', 'sequence', 'completed', 'note', 'recipientCustomerIds', 'parameterSnapshot'])(
    'rejects forbidden key %s',
    (key) => expect(() => normalizeRequestedChanges({ [key]: 'x' })).toThrow(BadRequestException)
  )

  it('rebuilds payer snapshots supplied by the server', () => {
    const next = applyRequestedChanges(
      { customerIds: ['old'], customers: [{ id: 'old', name: '旧客户' }], customerText: '旧客户' },
      { payerCustomer: { customerIds: ['c-1'], customerText: '王总' } },
      [{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }]
    )
    expect(next).toMatchObject({ customerId: 'c-1', customerIds: ['c-1'], customerText: '王总' })
    expect(next.customers).toEqual([{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }])
  })
})

describe('samplePayerName', () => {
  it('uses stored text before snapshots and has a stable empty fallback', () => {
    expect(samplePayerName({ customerText: ' 李总 ', customers: [{ name: '王总' }] })).toBe('李总')
    expect(samplePayerName({ customers: [{ name: '王总' }, { name: '赵总' }] })).toBe('王总、赵总')
    expect(samplePayerName({})).toBe('无信息')
  })
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-fields.test.ts server/src/common/sample-payer.test.ts`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Add the exact normalized patch contract**

```ts
export const LAB_SAMPLE_CHANGE_RAW_FIELDS = [
  'ironRaw', 'siliconRaw', 'siliconAdjust', 'aluminumRaw', 'aluminumAdjust',
  'sulfur', 'densityRaw', 'whiteness', 'calciumRaw', 'magnesiumRaw', 'carbon',
  'titaniumRaw', 'waterSample', 'bottleWater', 'bottleWaterSample', 'moisture',
  'crucible', 'sampleWeight', 'burnedCrucibleSample'
] as const

export type LabSampleChangeRawField = (typeof LAB_SAMPLE_CHANGE_RAW_FIELDS)[number]
export type PayerCustomerChange = { customerIds: string[]; customerText: string }
export type RequestedLabSampleChanges = {
  sampleNumber?: string
  payerCustomer?: PayerCustomerChange
  price?: number | null
  paymentStatus?: '已结款' | '未结款' | '月结款' | '预存款' | ''
  elementNote?: string
} & Partial<Record<LabSampleChangeRawField, number | null>>
```

Implement `normalizeRequestedChanges` to reject every unknown key, deduplicate customer IDs, trim strings, accept only finite numbers/null for numeric fields, and reject unsupported payment values. Implement `applyRequestedChanges` so the payer logical field expands to `customerId`, `customerIds`, `customers`, and `customerText`. Implement `diffChangedInputs` with JSON equality and return only actual changed bottom-level input fields.

- [ ] **Step 4: Add the additive Prisma schema and SQL migration**

Add reminder types `LAB_SAMPLE_CHANGE_APPROVED` and `LAB_SAMPLE_CHANGE_REJECTED`, the four-state enum, relations on `User`, `LabSheet`, `SampleBlock`, and the optional cell-log link. Use this model shape:

```prisma
model LabSampleChangeRequest {
  id                 String                       @id @default(uuid())
  frontendUserId     String
  requestedById      String
  sheetId            String
  blockId            String
  date               String
  blockIndex         Int
  baseBlockUpdatedAt DateTime
  sourceSnapshot     Json
  requestedChanges   Json
  previewResults     Json
  reason             String
  status             LabSampleChangeRequestStatus @default(PENDING)
  reviewRemark       String?
  reviewedById       String?
  reviewedAt         DateTime?
  withdrawnAt        DateTime?
  settlementEffects  Json?
  createdAt          DateTime                     @default(now())
  updatedAt          DateTime                     @updatedAt

  frontendUser User         @relation("FrontendLabSampleChangeRequests", fields: [frontendUserId], references: [id], onDelete: Restrict)
  requestedBy  User         @relation("RequestedLabSampleChangeRequests", fields: [requestedById], references: [id], onDelete: Restrict)
  reviewedBy   User?        @relation("ReviewedLabSampleChangeRequests", fields: [reviewedById], references: [id], onDelete: Restrict)
  sheet        LabSheet     @relation(fields: [sheetId], references: [id], onDelete: Restrict)
  block        SampleBlock  @relation(fields: [blockId], references: [id], onDelete: Restrict)
  changeLogs   CellChangeLog[]

  @@index([frontendUserId, status, createdAt])
  @@index([status, createdAt])
  @@index([sheetId, blockId])
  @@index([reviewedById])
}
```

The SQL migration must create the enum/table/foreign keys/indexes, add nullable `CellChangeLog.changeRequestId`, and finish with:

```sql
CREATE UNIQUE INDEX "LabSampleChangeRequest_one_pending_per_block"
ON "LabSampleChangeRequest" ("blockId")
WHERE "status" = 'PENDING';
```

- [ ] **Step 5: Delegate finance payer naming to the shared helper**

Replace the body of `FinanceService.getCustomerName` with `return samplePayerName(inputs)` and keep all callers and Chinese fallback output unchanged.

- [ ] **Step 6: Validate schema and run focused tests**

Run: `pnpm --filter yangshao-server exec prisma validate --schema prisma/schema.prisma`

Expected: `The schema at prisma/schema.prisma is valid`.

Run: `pnpm --filter yangshao-server prisma:generate`

Expected: Prisma Client generated successfully.

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-fields.test.ts server/src/common/sample-payer.test.ts server/src/finance/finance.service.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the persistence contract**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260820000000_add_lab_sample_change_requests/migration.sql server/src/lab-sample-change-requests server/src/common/sample-payer.ts server/src/common/sample-payer.test.ts server/src/finance/finance.service.ts
git commit -m "feat: add historical sample change request contract"
```

### Task 2: Extract the shared cell-change audit writer

**Files:**
- Create: `server/src/lab-sheets/lab-cell-change.service.ts`
- Create: `server/src/lab-sheets/lab-cell-change.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.module.ts`

**Interfaces:**
- Consumes: Prisma `CellChangeLog.changeRequestId` from Task 1.
- Produces: `LabCellChangeService.record(db, input): Promise<void>`.
- `input` is `{ sheetId, blockId, frontendUserId, changedById, oldInputs, nextInputs, committedFields?, changeRequestId? }`.

- [ ] **Step 1: Write failing audit-service tests**

```ts
it('creates request-linked logs for explicit approved fields', async () => {
  await service.record(transaction as never, {
    sheetId: 'sheet-1', blockId: 'block-1', frontendUserId: 'front-1', changedById: 'admin-1',
    oldInputs: { price: 80 }, nextInputs: { price: 100 },
    committedFields: [{ field: 'price', oldValue: 80, newValue: 100 }],
    changeRequestId: 'request-1'
  })
  expect(transaction.cellChangeLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    field: 'price', oldValue: 80, newValue: 100, changedById: 'admin-1', changeRequestId: 'request-1'
  }) })
})

it('keeps existing autosave coalescing when no explicit fields are supplied', async () => {
  transaction.cellChangeLog.findFirst.mockResolvedValue({ id: 'log-1', field: 'price' })
  await service.record(transaction as never, {
    sheetId: 'sheet-1', blockId: 'block-1', frontendUserId: 'front-1', changedById: 'front-1',
    oldInputs: { price: 80 }, nextInputs: { price: 81 }
  })
  expect(transaction.cellChangeLog.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'log-1' } }))
  expect(transaction.cellChangeLog.create).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `./node_modules/.bin/vitest run server/src/lab-sheets/lab-cell-change.service.test.ts`

Expected: FAIL because `LabCellChangeService` does not exist.

- [ ] **Step 3: Move the existing change-log behavior into the service**

```ts
@Injectable()
export class LabCellChangeService {
  async record(db: Prisma.TransactionClient, input: RecordLabCellChangesInput) {
    const explicit = Array.isArray(input.committedFields)
    const fields = this.normalizeFields(input.committedFields, input.oldInputs, input.nextInputs)
    for (const change of fields) {
      if (this.isEqual(change.oldValue, change.newValue)) continue
      await this.writeOne(db, input, change, explicit)
      await this.syncAbnormalRecord(db, input, change.field)
    }
  }
}
```

Move `normalizeCommittedFields`, JSON conversion, effective-change counting, two-second collapse behavior, and abnormal upsert/delete logic without changing it. When `changeRequestId` is present, always create a new log and include the link; never merge an approval into an autosave log.

- [ ] **Step 4: Refactor `LabSheetsService` to delegate**

Inject `LabCellChangeService` after `LabSheetRealtimeService`, replace `recordInputChanges(...)` with `this.cellChanges.record(tx, {...})`, and remove the duplicated private helpers. Update existing test construction to pass a mock whose `record` delegates to the real service in change-log-specific tests and is a resolved stub elsewhere.

- [ ] **Step 5: Export the service and run regression tests**

Run: `./node_modules/.bin/vitest run server/src/lab-sheets/lab-cell-change.service.test.ts server/src/lab-sheets/lab-sheets.service.test.ts`

Expected: PASS, including current autosave conflict and abnormal-record tests.

- [ ] **Step 6: Commit the audit extraction**

```bash
git add server/src/lab-sheets/lab-cell-change.service.ts server/src/lab-sheets/lab-cell-change.service.test.ts server/src/lab-sheets/lab-sheets.service.ts server/src/lab-sheets/lab-sheets.service.test.ts server/src/lab-sheets/lab-sheets.module.ts
git commit -m "refactor: share lab cell change auditing"
```

### Task 3: Implement frontend-account request creation, queries, and withdrawal

**Files:**
- Create: `server/src/lab-sample-change-requests/dto.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-requests.service.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`

**Interfaces:**
- Consumes: Task 1 normalization helpers and Prisma model.
- Produces: `createForFrontend(user, dto, grants)`, `listForFrontend(user, query, grants)`, `getForFrontend(user, id, grants)`, and `withdrawForFrontend(user, id, grants)`.
- `grants` is `{ historical?: string; completedData?: string }`.
- Produces: summary DTOs without sensitive old/new values and detail DTOs containing snapshots only after conditional completed-data authorization.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('creates a server-normalized pending request for a historical sample', async () => {
  auth.assertAccessGrant.mockResolvedValue(undefined)
  prisma.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({
    sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1
  }))
  prisma.customer.findMany.mockResolvedValue([{ id: 'c-1', name: '王总', phone: null, wechat: null, wechatNickname: null }])
  prisma.labSampleChangeRequest.findFirst.mockResolvedValue(null)
  prisma.labSampleChangeRequest.create.mockImplementation(async ({ data }: any) => ({
    id: 'request-1', ...data, status: 'PENDING', createdAt: new Date(), updatedAt: new Date()
  }))

  const row = await service.createForFrontend(frontendUser, {
    blockId: 'block-1', baseUpdatedAt: '2026-08-19T08:00:00.000Z',
    changes: { sampleNumber: '新样品', payerCustomer: { customerIds: ['c-1'], customerText: '王总' }, ironRaw: 2 },
    reason: '客户要求更正'
  }, { historical: 'history-grant', completedData: 'completed-grant' })

  expect(row.status).toBe('PENDING')
  expect(prisma.labSampleChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    requestedById: 'front-1', frontendUserId: 'front-1', blockId: 'block-1', reason: '客户要求更正',
    requestedChanges: expect.objectContaining({ sampleNumber: '新样品', ironRaw: 2 }),
    previewResults: expect.objectContaining({ iron: expect.any(Number) })
  }) })
})

it('rejects today, empty diffs, foreign customers, forbidden keys, and an existing pending request', async () => {
  prisma.sampleBlock.findUnique.mockResolvedValue(makeCurrentBlock())
  await expect(service.createForFrontend(frontendUser, validCreateDto(), grants)).rejects.toThrow('仅支持申请修改历史日期样品')
})

it('withdraws only the owners pending request and preserves the record', async () => {
  prisma.labSampleChangeRequest.findFirst.mockResolvedValue(makeRequest({ status: 'PENDING' }))
  await service.withdrawForFrontend(frontendUser, 'request-1', grants)
  expect(prisma.labSampleChangeRequest.update).toHaveBeenCalledWith({
    where: { id: 'request-1' }, data: { status: 'WITHDRAWN', withdrawnAt: expect.any(Date) }, include: expect.any(Object)
  })
})
```

Also add named tests for: historical grant required when protected; completed-data grant required only for completed request detail/create; frontend list scoped by `frontendUserId`; list summaries do not expose `sourceSnapshot`; reason trimmed and required; Prisma pending-index conflict translated to HTTP 409 with the existing request summary.

- [ ] **Step 2: Run the service tests and verify RED**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`

Expected: FAIL because the service and DTOs do not exist.

- [ ] **Step 3: Add strict DTOs**

```ts
export class CreateLabSampleChangeRequestDto {
  @IsString() @IsNotEmpty() blockId!: string
  @IsISO8601() baseUpdatedAt!: string
  @IsObject() changes!: Record<string, unknown>
  @IsString() @MinLength(1) @MaxLength(500) reason!: string
}

export class FrontendLabSampleChangeRequestQueryDto {
  @IsOptional() @IsISO8601({ strict: true }) date?: string
  @IsOptional() @IsEnum(LabSampleChangeRequestStatus) status?: LabSampleChangeRequestStatus
}
```

Add corresponding admin query, optional approval remark capped at 500, and rejection remark with `MinLength(1)` and `MaxLength(500)` for later controller use.

- [ ] **Step 4: Implement lifecycle methods minimally**

Creation must:

1. Assert `HISTORICAL_DATES` access when that feature is protected.
2. Load the block with sheet and verify owner/date/visible data.
3. If `inputs.completed` is true, assert `COMPLETED_SAMPLE_DATA` access.
4. Normalize the patch, load and verify payer customers, construct canonical next inputs, and reject no-op diffs.
5. Compare parsed `baseUpdatedAt` with `block.updatedAt`.
6. Calculate `previewResults` with `calculateResults(nextInputs, block.parameterSnapshot)`.
7. Create one `PENDING` row from server-owned snapshots.

List returns only `id`, date, block index, sample name, changed field labels, reason, status, review summary, and timestamps. Detail loads by owner and conditionally checks the completed-data grant before returning snapshots. Withdrawal updates only an owned `PENDING` row.

- [ ] **Step 5: Run lifecycle tests and server build**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`

Expected: PASS.

Run: `pnpm build:server`

Expected: Nest TypeScript build succeeds.

- [ ] **Step 6: Commit the frontend request lifecycle**

```bash
git add server/src/lab-sample-change-requests/dto.ts server/src/lab-sample-change-requests/lab-sample-change-requests.service.ts server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts
git commit -m "feat: add historical sample request lifecycle"
```

### Task 4: Implement authorized approval, rejection, recalculation, and monthly reset

**Files:**
- Modify: `server/src/lab-sample-change-requests/lab-sample-change-requests.service.ts`
- Modify: `server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`

**Interfaces:**
- Consumes: `LabCellChangeService.record`, `samplePayerName`, `AdminAccessService.getAllowedFrontendUserIds`, and Task 3 request DTO mapping.
- Produces: `listForAdmin(admin, query)`, `getForAdmin(admin, id)`, `approveForAdmin(admin, id, dto)`, and `rejectForAdmin(admin, id, dto)`.
- Approval response returns the terminal request detail including `settlementEffects` and updated preview/actual results.

- [ ] **Step 1: Add failing approval and rejection tests**

```ts
it('approves one request atomically, recalculates from the sample snapshot, links logs, and reminds the owner', async () => {
  adminAccess.getAllowedFrontendUserIds.mockResolvedValue(['front-1'])
  transaction.labSampleChangeRequest.findUnique.mockResolvedValue(makeRequest({
    requestedChanges: { ironRaw: 2, price: 100 },
    sourceSnapshot: { inputs: { ironRaw: 1, price: 80 }, results: {}, parameterSnapshot: { ...defaultLabParameters, ironBlank: 0, ironFactor: 25 } }
  }))
  transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ ironRaw: 1, price: 80 }))

  await service.approveForAdmin(rootAdmin, 'request-1', { reviewRemark: '已核对原始记录' })

  expect(transaction.sampleBlock.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'block-1' },
    data: expect.objectContaining({ inputs: expect.objectContaining({ ironRaw: 2, price: 100 }), results: expect.objectContaining({ iron: 50 }) })
  }))
  expect(cellChanges.record).toHaveBeenCalledWith(transaction, expect.objectContaining({
    changedById: 'admin-1', changeRequestId: 'request-1'
  }))
  expect(transaction.reminder.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    type: 'LAB_SAMPLE_CHANGE_APPROVED', sourceId: 'request-1'
  }) })
})

it('resets affected paid and partial monthly records and snapshots their old state', async () => {
  transaction.monthlySettlementRecord.findMany.mockResolvedValue([
    { id: 'settle-old', month: '2026-08', frontendUserId: 'front-1', customer: '旧客户', status: 'PAID', paidAmount: 80, remark: '已结清' },
    { id: 'settle-new', month: '2026-08', frontendUserId: 'front-1', customer: '新客户', status: 'PARTIAL', paidAmount: 20, remark: '部分结款' }
  ])
  await service.approveForAdmin(rootAdmin, 'request-1', {})
  expect(transaction.monthlySettlementRecord.update).toHaveBeenCalledTimes(2)
  expect(transaction.labSampleChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ settlementEffects: expect.arrayContaining([expect.objectContaining({ recordId: 'settle-old', oldStatus: 'PAID' })]) })
  }))
})

it('rolls back on source-version conflict before any sample or settlement update', async () => {
  transaction.sampleBlock.findUnique.mockResolvedValue(makeHistoricalBlock({ price: 81 }, { updatedAt: new Date('2026-08-20T00:00:00Z') }))
  await expect(service.approveForAdmin(rootAdmin, 'request-1', {})).rejects.toThrow('样品数据已变化')
  expect(transaction.sampleBlock.update).not.toHaveBeenCalled()
  expect(transaction.monthlySettlementRecord.update).not.toHaveBeenCalled()
})
```

Also add explicit tests for authorized sub-admin success, unauthorized sub-admin 403, terminal request 409, double approval only once, whole-request rejection with required reason, admin list filtering by allowed frontend IDs, and no reset for already-unpaid/nonexistent monthly records.

- [ ] **Step 2: Run approval tests and verify RED**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts`

Expected: FAIL on missing admin methods and transaction writes.

- [ ] **Step 3: Implement row locks, authorization, and optimistic conflict checks**

Inside one `prisma.$transaction`, lock the request with `SELECT ... FOR UPDATE`, reload it, authorize its `frontendUserId`, lock/reload the sheet and block, require `PENDING`, and compare both `baseBlockUpdatedAt` and the stored source input/parameter snapshot with current data. Throw `ConflictException` before any update on mismatch.

- [ ] **Step 4: Apply the patch, recalculate, and write linked history**

```ts
const nextInputs = applyRequestedChanges(currentInputs, requestedChanges, canonicalCustomers)
const results = calculateResults(nextInputs, block.parameterSnapshot as typeof defaultLabParameters)
const changedFields = diffChangedInputs(currentInputs, nextInputs)

await tx.sampleBlock.update({
  where: { id: block.id },
  data: { inputs: nextInputs as Prisma.InputJsonValue, results: results as Prisma.InputJsonValue }
})
await this.cellChanges.record(tx, {
  sheetId: request.sheetId,
  blockId: request.blockId,
  frontendUserId: request.frontendUserId,
  changedById: admin.id,
  oldInputs: currentInputs,
  nextInputs,
  committedFields: changedFields,
  changeRequestId: request.id
})
```

- [ ] **Step 5: Reset only affected settled monthly records**

Build the old/new key set only when `price`, payer customer, or `paymentStatus` changes and either the old or new status is `月结款`. Query `(month, frontendUserId, customer)` records, update only `PAID` and `PARTIAL` rows to `UNPAID`, set `paidAmount: null`, and set the exact remark `因历史样品修改审批，需按新汇总重新核对`. Save `{ recordId, month, customer, oldStatus, oldPaidAmount, oldRemark, newStatus: 'UNPAID' }` in `settlementEffects`.

- [ ] **Step 6: Finish the terminal state and reminder in the same transaction**

Update the request to `APPROVED`, reviewer/time/optional remark/effects, then use `tx.reminder.create` with source type `lab_sample_change_request`. Rejection updates to `REJECTED`, persists the trimmed required reason, and creates `LAB_SAMPLE_CHANGE_REJECTED`. No service call outside the transaction may be required for these database reminders.

- [ ] **Step 7: Run focused service and finance regressions**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts server/src/lab-sheets/lab-cell-change.service.test.ts server/src/finance/finance.service.test.ts server/src/customer-overview/customer-overview.service.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit approval behavior**

```bash
git add server/src/lab-sample-change-requests/lab-sample-change-requests.service.ts server/src/lab-sample-change-requests/lab-sample-change-requests.service.test.ts
git commit -m "feat: approve historical sample changes atomically"
```

### Task 5: Expose guarded frontend and authorized admin HTTP APIs

**Files:**
- Create: `server/src/lab-sample-change-requests/lab-sample-change-requests.controller.ts`
- Create: `server/src/lab-sample-change-requests/admin-lab-sample-change-requests.controller.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-requests.controller.test.ts`
- Create: `server/src/lab-sample-change-requests/lab-sample-change-requests.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Frontend routes: `POST/GET /lab-sheets/change-requests`, `GET /lab-sheets/change-requests/:id`, `POST /lab-sheets/change-requests/:id/withdraw`.
- Admin routes: `GET /admin/lab-sheet-change-requests`, `GET /admin/lab-sheet-change-requests/:id`, `POST /admin/lab-sheet-change-requests/:id/approve`, `POST /admin/lab-sheet-change-requests/:id/reject`.
- Frontend access headers: `X-YS-Historical-Access-Grant` and `X-YS-Completed-Data-Access-Grant` so features may belong to different access groups.

- [ ] **Step 1: Write failing controller contract tests**

```ts
it('passes both independent access grants to frontend creation', async () => {
  await controller.create(frontendUser, createDto, 'history-token', 'completed-token')
  expect(service.createForFrontend).toHaveBeenCalledWith(frontendUser, createDto, {
    historical: 'history-token', completedData: 'completed-token'
  })
})

it('passes admin filters and actor to the admin service', async () => {
  const query = { frontendUserIds: 'front-1', status: 'PENDING', date: '2026-08-19' }
  await adminController.list(subAdmin, query as never)
  expect(service.listForAdmin).toHaveBeenCalledWith(subAdmin, query)
})
```

Add metadata assertions that the frontend controller allows only `FRONTEND_USER` and the admin controller allows only `ROOT_ADMIN`/`SUB_ADMIN` under `AuthGuard` and `RolesGuard`.

- [ ] **Step 2: Run controller tests and verify RED**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/lab-sample-change-requests.controller.test.ts`

Expected: FAIL because controllers are absent.

- [ ] **Step 3: Implement controllers and module wiring**

Use the exact routes above, typed DTOs from Task 3, `@Headers('x-ys-historical-access-grant')`, and `@Headers('x-ys-completed-data-access-grant')`. The module imports `AuthModule`, `AdminModule`, and `LabSheetsModule`, provides the request service, and registers both controllers. Add it to `AppModule` after `LabSheetsModule`.

- [ ] **Step 4: Run controller, service, and build verification**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/*.test.ts`

Expected: PASS.

Run: `pnpm build:server`

Expected: PASS.

- [ ] **Step 5: Commit HTTP APIs**

```bash
git add server/src/lab-sample-change-requests/lab-sample-change-requests.controller.ts server/src/lab-sample-change-requests/admin-lab-sample-change-requests.controller.ts server/src/lab-sample-change-requests/lab-sample-change-requests.controller.test.ts server/src/lab-sample-change-requests/lab-sample-change-requests.module.ts server/src/app.module.ts
git commit -m "feat: expose sample change approval APIs"
```

### Task 6: Add frontend request types, pure draft logic, API, store, and mocks

**Files:**
- Create: `src/types/labSampleChangeRequest.ts`
- Create: `src/constants/labSampleChangeRequest.ts`
- Create: `src/utils/labSampleChangeRequest.ts`
- Create: `src/utils/labSampleChangeRequest.test.ts`
- Create: `src/api/labSampleChangeRequest.ts`
- Create: `src/api/labSampleChangeRequest.test.ts`
- Create: `src/stores/labSampleChangeRequest.ts`
- Create: `src/stores/labSampleChangeRequest.test.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/types/reminder.ts`

**Interfaces:**
- Produces: `LabSampleChangeRequestStatus`, `LabSampleChangePatch`, `LabSampleChangeRequestSummary`, `LabSampleChangeRequestDetail`, `CreateLabSampleChangeRequestPayload`.
- Produces: `createSampleChangeDraft(block)`, `buildSampleChangePatch(source, draft)`, `sampleChangeDiffRows(source, draft)`, `isHistoricalSampleChangeEligible(block)`.
- Produces API functions `listLabSampleChangeRequests`, `getLabSampleChangeRequest`, `createLabSampleChangeRequest`, `withdrawLabSampleChangeRequest`.
- Produces Pinia store `useLabSampleChangeRequestStore` with `pendingByBlock`, `load(filters)`, `submit(payload)`, `loadDetail(id)`, `withdraw(id)`, and `reset()`.

- [ ] **Step 1: Write failing pure utility and API tests**

```ts
it('builds only allowed changed fields and treats payer customer as one change', () => {
  const block = makeBlock({ sampleNumber: '旧样品', customerIds: ['c-old'], customerText: '旧客户', price: 80, ironRaw: 1 })
  const draft = createSampleChangeDraft(block)
  draft.sampleNumber = '新样品'
  draft.customerIds = ['c-1']
  draft.customerText = '王总'
  draft.ironRaw = 2
  expect(buildSampleChangePatch(block, draft)).toEqual({
    sampleNumber: '新样品', payerCustomer: { customerIds: ['c-1'], customerText: '王总' }, ironRaw: 2
  })
})

it('sends independent access grants and the exact create payload', async () => {
  window.localStorage.setItem('ys_access_guard_group_sessions', JSON.stringify(twoFeatureSessions))
  await createLabSampleChangeRequest(payload)
  expect(requestMock.post).toHaveBeenCalledWith('/lab-sheets/change-requests', payload, { headers: {
    'X-YS-Historical-Access-Grant': 'history-token',
    'X-YS-Completed-Data-Access-Grant': 'completed-token'
  } })
})
```

- [ ] **Step 2: Run utility/API tests and verify RED**

Run: `./node_modules/.bin/vitest run src/utils/labSampleChangeRequest.test.ts src/api/labSampleChangeRequest.test.ts`

Expected: FAIL because the new files are absent.

- [ ] **Step 3: Implement types, labels, diff helpers, and real API calls**

Use the same raw-field tuple and payment-state union as the server. `buildSampleChangePatch` must never copy `results`, parameters, `completed`, `sequence`, recipients, or `note`. `isHistoricalSampleChangeEligible` requires visible business input and must return false for sensitive-hidden blocks until completed-data access is present.

Build request headers by selecting separate grants for `HISTORICAL_DATES` and `COMPLETED_SAMPLE_DATA`; omit empty headers. Implement real URLs exactly as Task 5.

- [ ] **Step 4: Add mock lifecycle functions**

In `src/mocks/db.ts`, store request rows with immutable snapshots. Mock create enforces a historical date, actual diff, reason, and one pending request; mock withdraw changes only `PENDING` to `WITHDRAWN`. Mock list filters by date/status, and mock detail returns a clone. Seed no pending request by default so existing history tests remain unchanged.

- [ ] **Step 5: Write failing Pinia store tests**

```ts
it('maps pending requests by block and replaces the pending row after withdrawal', async () => {
  api.listLabSampleChangeRequests.mockResolvedValue([makeSummary({ id: 'request-1', blockId: 'block-1', status: 'PENDING' })])
  api.withdrawLabSampleChangeRequest.mockResolvedValue(makeSummary({ id: 'request-1', blockId: 'block-1', status: 'WITHDRAWN' }))
  const store = useLabSampleChangeRequestStore()
  await store.load({ date: '2026-08-19' })
  expect(store.pendingByBlock['block-1']?.id).toBe('request-1')
  await store.withdraw('request-1')
  expect(store.pendingByBlock['block-1']).toBeUndefined()
})

it('keeps the current request list and clears submitting after create failure', async () => {
  api.createLabSampleChangeRequest.mockRejectedValue(new Error('网络错误'))
  const store = useLabSampleChangeRequestStore()
  store.requests = [makeSummary({ id: 'existing' })]
  await expect(store.submit(payload)).rejects.toThrow('网络错误')
  expect(store.requests).toHaveLength(1)
  expect(store.submitting).toBe(false)
})
```

- [ ] **Step 6: Implement the store and reminder type additions**

`pendingByBlock` is a computed record from `requests.filter(status === 'PENDING')`. On successful create, prepend the returned summary. On successful withdrawal, replace the row. Never remove terminal history. Make the frontend `Reminder.type` union match the server exactly: `UNSETTLED_PAYMENT | MONTHLY_PAYMENT | FINANCE_DELETE_APPROVED | FINANCE_DELETE_REJECTED | LAB_SAMPLE_CHANGE_APPROVED | LAB_SAMPLE_CHANGE_REJECTED`.

- [ ] **Step 7: Run focused tests and frontend type build**

Run: `./node_modules/.bin/vitest run src/utils/labSampleChangeRequest.test.ts src/api/labSampleChangeRequest.test.ts src/stores/labSampleChangeRequest.test.ts`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 8: Commit frontend request state**

```bash
git add src/types/labSampleChangeRequest.ts src/constants/labSampleChangeRequest.ts src/utils/labSampleChangeRequest.ts src/utils/labSampleChangeRequest.test.ts src/api/labSampleChangeRequest.ts src/api/labSampleChangeRequest.test.ts src/stores/labSampleChangeRequest.ts src/stores/labSampleChangeRequest.test.ts src/mocks/db.ts src/types/reminder.ts
git commit -m "feat: add frontend sample change request state"
```

### Task 7: Build the isolated historical-sample change dialog

**Files:**
- Create: `src/components/lab-sheet/HistoricalSampleChangeDialog.vue`
- Create: `src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts`

**Interfaces:**
- Consumes: Task 6 types, field labels, draft/diff helpers, `CustomerCellEditor`, `LabElementSelector`, and `calculateSampleResults`.
- Props: `{ modelValue: boolean; block: SampleBlock | null; submitting: boolean }`.
- Emits: `update:modelValue` and `submit(payload: CreateLabSampleChangeRequestPayload)`.

- [ ] **Step 1: Write failing component tests**

```ts
it('does not mutate the source block and emits only changed allowed fields with a required reason', async () => {
  const block = makeBlock({ sampleNumber: '旧样品', price: 80, ironRaw: 1 })
  const original = JSON.parse(JSON.stringify(block))
  const wrapper = mountDialog(block)
  await wrapper.get('[data-testid="sample-change-sample-number"]').setValue('新样品')
  await wrapper.get('[data-testid="sample-change-ironRaw"]').setValue('2')
  expect(wrapper.get('[data-testid="submit-sample-change"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="sample-change-reason"]').setValue('复核原始化验记录')
  await wrapper.get('[data-testid="submit-sample-change"]').trigger('click')
  expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
    blockId: block.id,
    changes: { sampleNumber: '新样品', ironRaw: 2 },
    reason: '复核原始化验记录'
  })
  expect(block).toEqual(original)
})

it('previews recalculated results and never renders result override inputs', async () => {
  const wrapper = mountDialog(makeBlock({ ironRaw: 1 }))
  await wrapper.get('[data-testid="sample-change-ironRaw"]').setValue('2')
  expect(wrapper.get('[data-testid="sample-change-preview-iron"]').text()).toContain('预览')
  expect(wrapper.find('[data-testid="sample-change-result-input-iron"]').exists()).toBe(false)
})
```

Add tests for payer-customer logical diff, price/payment/element fields, all raw field labels, no-op disablement, reason trimming, reset when a new block opens, and retained form state while `submitting` fails in the parent.

- [ ] **Step 2: Run the dialog tests and verify RED**

Run: `./node_modules/.bin/vitest run src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts`

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the dialog minimally**

Use a local reactive draft recreated only when the dialog opens for a new block. Render only allowed fields. Use existing three-decimal parsing behavior for detection inputs and existing money precision for `price`. Show diff rows from `sampleChangeDiffRows`; calculate preview from the draft plus `block.parameterSnapshot`; label it as non-authoritative. Emit a complete create payload without changing the Pinia lab sheet store.

- [ ] **Step 4: Run component and formula regressions**

Run: `./node_modules/.bin/vitest run src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts src/utils/formulaEngine.test.ts src/components/lab-sheet/CustomerCellEditor.test.ts src/components/lab-sheet/LabParameterPanel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the request dialog**

```bash
git add src/components/lab-sheet/HistoricalSampleChangeDialog.vue src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts
git commit -m "feat: add historical sample change dialog"
```

### Task 8: Integrate request, pending, withdrawal, and history UI into the historical sheet

**Files:**
- Create: `src/components/lab-sheet/LabSampleChangeRequestDrawer.vue`
- Create: `src/components/lab-sheet/LabSampleChangeRequestDrawer.test.ts`
- Modify: `src/components/lab-sheet/LabSheetGrid.vue`
- Modify: `src/components/lab-sheet/LabSheetGrid.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/views/dashboard/LabDataPage.test.ts`

**Interfaces:**
- Consumes: `useLabSampleChangeRequestStore` and `HistoricalSampleChangeDialog`.
- Adds grid props `sampleChangeRequests?: Record<string, LabSampleChangeRequestSummary>` and `sampleChangeLoading?: boolean`.
- Adds grid emits `requestSampleChange(blockId)`, `viewSampleChangeRequest(requestId)`, and `withdrawSampleChangeRequest(requestId)`.
- Drawer props: `{ modelValue; rows; detail; loading; withdrawingId }`; emits `update:modelValue`, `select(id)`, and `withdraw(id)`.

- [ ] **Step 1: Add failing grid action tests**

```ts
it('shows request actions only for eligible readonly history samples', () => {
  const wrapper = mountGrid({ readonly: true, blocks: [makeBlock({ sampleNumber: '历史样品' })] })
  expect(wrapper.get('[data-testid="request-sample-change-block-1"]').text()).toContain('申请修改')
})

it('shows pending view and withdraw actions without enabling cell editing', () => {
  const wrapper = mountGrid({
    readonly: true,
    blocks: [makeBlock({ sampleNumber: '历史样品' })],
    sampleChangeRequests: { 'block-1': makeSummary({ id: 'request-1', blockId: 'block-1', status: 'PENDING' }) }
  })
  expect(wrapper.text()).toContain('待审批')
  expect(wrapper.find('[data-testid="withdraw-sample-change-request-1"]').exists()).toBe(true)
  expect(wrapper.find('input:not([disabled])').exists()).toBe(false)
})

it('does not add the request action to the current editable sheet', () => {
  const wrapper = mountGrid({ readonly: false, blocks: [makeBlock({ sampleNumber: '当天样品' })] })
  expect(wrapper.find('[data-testid^="request-sample-change-"]').exists()).toBe(false)
})
```

- [ ] **Step 2: Run grid tests and verify RED**

Run: `./node_modules/.bin/vitest run src/components/lab-sheet/LabSheetGrid.test.ts`

Expected: FAIL on missing props/actions.

- [ ] **Step 3: Add compact historical actions to the sequence cell**

Keep the existing grid column count. Under the readonly sequence display, render a compact action group only when `isHistoricalSampleChangeEligible(block)` is true. Emit actions upward; do not call APIs from the grid. A pending summary replaces “申请修改” with a warning tag plus view/withdraw links.

- [ ] **Step 4: Write and implement drawer tests**

```ts
it('renders terminal history and emits withdrawal only for pending rows', async () => {
  const wrapper = mountDrawer([
    makeSummary({ id: 'pending', status: 'PENDING' }),
    makeSummary({ id: 'approved', status: 'APPROVED', reviewRemark: '已核对' })
  ])
  expect(wrapper.text()).toContain('已核对')
  expect(wrapper.find('[data-testid="withdraw-request-pending"]').exists()).toBe(true)
  expect(wrapper.find('[data-testid="withdraw-request-approved"]').exists()).toBe(false)
})
```

The drawer lists date, sample, changed field labels, reason, status, review result, and timestamps. Selecting a row loads detail. Pending withdrawal requires `ElMessageBox.confirm` and emits only after confirmation.

- [ ] **Step 5: Add failing `LabDataPage` coordination tests**

```ts
it('loads request summaries after a historical sheet and submits without patching the sheet store', async () => {
  mocks.labStore.sheet = makeHistoricalSheet()
  const wrapper = mountPage()
  await flushPromises()
  expect(mocks.changeRequestStore.load).toHaveBeenCalledWith({ date: '2026-06-24' })
  wrapper.getComponent({ name: 'LabSheetGrid' }).vm.$emit('requestSampleChange', 'block-1')
  wrapper.getComponent({ name: 'HistoricalSampleChangeDialog' }).vm.$emit('submit', createPayload)
  await flushPromises()
  expect(mocks.changeRequestStore.submit).toHaveBeenCalledWith(createPayload)
  expect(mocks.labStore.patchBlock).not.toHaveBeenCalled()
})

it('resets request state and keeps existing current-day autosave behavior on today', async () => {
  mocks.labStore.sheet = makeCurrentSheet()
  mountPage()
  await flushPromises()
  expect(mocks.changeRequestStore.reset).toHaveBeenCalled()
  expect(mocks.changeRequestStore.load).not.toHaveBeenCalled()
})
```

- [ ] **Step 6: Implement page coordination**

After a successful historical load, call `changeRequestStore.load({ date: sheet.date })`; reset on current date or failed access. Open the dialog with the selected block, call `submit`, close only after success, and keep it open on failure. Open the drawer from a page-level “修改申请记录” button. Withdrawal confirms, calls the store, and leaves the historical sample unchanged. Preserve all existing history access, completed-data access, report selection, bulk fill, business-day rollover, and autosave code paths.

- [ ] **Step 7: Run frontend history regressions and build**

Run: `./node_modules/.bin/vitest run src/components/lab-sheet/LabSheetGrid.test.ts src/components/lab-sheet/LabSampleChangeRequestDrawer.test.ts src/views/dashboard/LabDataPage.test.ts src/stores/labSheet.test.ts`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 8: Commit historical sheet integration**

```bash
git add src/components/lab-sheet/LabSampleChangeRequestDrawer.vue src/components/lab-sheet/LabSampleChangeRequestDrawer.test.ts src/components/lab-sheet/LabSheetGrid.vue src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: request changes from historical samples"
```

### Task 9: Add admin review APIs, mock lifecycle, and the two-category todo UI

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Create: `admin/src/api.labSampleChangeRequests.test.ts`
- Create: `admin/src/components/todos/FinanceDeletionRequestsPanel.vue`
- Create: `admin/src/components/todos/LabSampleChangeRequestsPanel.vue`
- Create: `admin/src/components/todos/LabSampleChangeRequestsPanel.test.ts`
- Modify: `admin/src/views/TodoPage.vue`
- Create: `admin/src/views/TodoPage.test.ts`
- Create: `admin/src/views/DataStatisticsPage.test.ts`

**Interfaces:**
- Produces: `AdminLabSampleChangeRequestSummary`, `AdminLabSampleChangeRequestDetail`, `AdminLabSampleChangeRequestQuery`.
- Produces API functions `getAdminLabSampleChangeRequests(query)`, `getAdminLabSampleChangeRequest(id)`, `approveAdminLabSampleChangeRequest(id, reviewRemark?)`, `rejectAdminLabSampleChangeRequest(id, reviewRemark)`.
- Todo page owns only `activeTodoType: 'sampleChanges' | 'deletions'`; child panels own their filters and actions.

- [ ] **Step 1: Write failing admin API tests**

```ts
it('sends account, status, and date filters to the admin list endpoint', async () => {
  await getAdminLabSampleChangeRequests({ frontendUserIds: ['front-1'], status: 'PENDING', date: '2026-08-19' })
  expect(requestMock.get).toHaveBeenCalledWith('/admin/lab-sheet-change-requests', { params: {
    frontendUserIds: 'front-1', status: 'PENDING', date: '2026-08-19'
  } })
})

it('uses separate approve and required-reason reject endpoints', async () => {
  await approveAdminLabSampleChangeRequest('request-1', '已核对')
  await rejectAdminLabSampleChangeRequest('request-2', '原始凭证不一致')
  expect(requestMock.post).toHaveBeenNthCalledWith(1, '/admin/lab-sheet-change-requests/request-1/approve', { reviewRemark: '已核对' })
  expect(requestMock.post).toHaveBeenNthCalledWith(2, '/admin/lab-sheet-change-requests/request-2/reject', { reviewRemark: '原始凭证不一致' })
})
```

- [ ] **Step 2: Run admin API tests and verify RED**

Run: `./node_modules/.bin/vitest run admin/src/api.labSampleChangeRequests.test.ts`

Expected: FAIL because types and functions are absent.

- [ ] **Step 3: Add real and mock admin APIs**

Add a seeded `PENDING` mock request with server-shaped snapshots/diffs/results. Mock list applies frontend/status/date filters. Mock approve applies `requestedChanges` to the matching `mockSheet` block, assigns `previewResults`, resets seeded paid/partial settlement rows to unpaid, stores effects, and marks approved. Mock reject requires a non-empty reason and marks rejected. Both terminal operations reject a non-pending row.

- [ ] **Step 4: Move existing deletion UI into its own panel**

Move current `TodoPage` deletion filters/table/detail/approve/reject code into `FinanceDeletionRequestsPanel.vue` without changing URLs, confirmation text, or behavior. `TodoPage.vue` becomes an `el-tabs` container that lazy-renders the sample-change panel and deletion panel.

- [ ] **Step 5: Write failing sample-change panel and todo tests**

```ts
it('shows diffs and previews, approves whole requests, and requires a rejection reason', async () => {
  api.getAdminLabSampleChangeRequests.mockResolvedValue([pendingSummary])
  api.getAdminLabSampleChangeRequest.mockResolvedValue(pendingDetail)
  const wrapper = mountPanel()
  await flushPromises()
  await wrapper.get('[data-testid="view-sample-change-request-1"]').trigger('click')
  expect(wrapper.text()).toContain('旧样品')
  expect(wrapper.text()).toContain('新样品')
  expect(wrapper.text()).toContain('公式结果预览')
  await wrapper.get('[data-testid="approve-sample-change-request-1"]').trigger('click')
  await flushPromises()
  expect(api.approveAdminLabSampleChangeRequest).toHaveBeenCalledWith('request-1', '')
})

it('renders sample-change and deletion categories without mixing their requests', async () => {
  const wrapper = mount(TodoPage, { global: { stubs } })
  expect(wrapper.text()).toContain('样品修改申请')
  expect(wrapper.text()).toContain('删除申请')
})
```

Add tests for account/status/date filters, terminal rows without action buttons, required rejection reason, monthly-reset warning, and a loading/error retry state.

- [ ] **Step 6: Implement the review panel**

Render field labels and old/new values from the server detail, not by reconstructing hidden data. Show result differences read-only. Approve uses a confirmation dialog and optional remark; reject uses a prompt that refuses a trimmed empty value. Reload the active filter after success. The panel never edits `requestedChanges`.

- [ ] **Step 7: Add the explicit admin data-statistics boundary test**

```ts
it('keeps data statistics GET-only with no direct sample mutation control', () => {
  const source = readFileSync(new URL('./DataStatisticsPage.vue', import.meta.url), 'utf8')
  expect(source).toContain("request.get('/admin/data-statistics/lab-sheets'")
  expect(source).not.toMatch(/request\.(post|put|patch|delete)\(/)
  expect(source).not.toMatch(/申请值|保存修改|直接修改/)
})
```

- [ ] **Step 8: Run admin UI tests and build**

Run: `./node_modules/.bin/vitest run admin/src/api.labSampleChangeRequests.test.ts admin/src/components/todos/LabSampleChangeRequestsPanel.test.ts admin/src/views/TodoPage.test.ts admin/src/views/DataStatisticsPage.test.ts`

Expected: PASS.

Run: `pnpm build:admin`

Expected: PASS.

- [ ] **Step 9: Commit admin review UI**

```bash
git add admin/src/types.ts admin/src/api.ts admin/src/api.labSampleChangeRequests.test.ts admin/src/components/todos/FinanceDeletionRequestsPanel.vue admin/src/components/todos/LabSampleChangeRequestsPanel.vue admin/src/components/todos/LabSampleChangeRequestsPanel.test.ts admin/src/views/TodoPage.vue admin/src/views/TodoPage.test.ts admin/src/views/DataStatisticsPage.test.ts
git commit -m "feat: review historical sample change requests"
```

### Task 10: Run cross-layer acceptance, migration safety, and full regressions

**Files:**
- Modify only if a verification failure reveals an in-scope defect; return to the owning task's test first and commit the focused correction separately.

**Interfaces:**
- Consumes all earlier task outputs.
- Produces verified evidence for frontend request, admin approval, direct effect, financial reset, authorization, migration safety, and regressions.

- [ ] **Step 1: Review the migration for destructive SQL**

Run: `rg -n "DROP TABLE|TRUNCATE|DELETE FROM|ALTER COLUMN.*SET NOT NULL" server/prisma/migrations/20260820000000_add_lab_sample_change_requests/migration.sql`

Expected: no matches.

Run: `pnpm --filter yangshao-server exec prisma validate --schema prisma/schema.prisma`

Expected: schema valid.

- [ ] **Step 2: Run all request-focused suites together**

Run: `./node_modules/.bin/vitest run server/src/lab-sample-change-requests/*.test.ts server/src/lab-sheets/lab-cell-change.service.test.ts src/utils/labSampleChangeRequest.test.ts src/api/labSampleChangeRequest.test.ts src/stores/labSampleChangeRequest.test.ts src/components/lab-sheet/HistoricalSampleChangeDialog.test.ts src/components/lab-sheet/LabSampleChangeRequestDrawer.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts admin/src/api.labSampleChangeRequests.test.ts admin/src/components/todos/LabSampleChangeRequestsPanel.test.ts admin/src/views/TodoPage.test.ts admin/src/views/DataStatisticsPage.test.ts`

Expected: PASS.

- [ ] **Step 3: Run the complete repository regression suite with known generated/worktree exclusions**

Run: `./node_modules/.bin/vitest run --cache=false --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'`

Expected: all frontend, admin, and shared tests pass.

Run: `pnpm test:server`

Expected: all server tests pass.

- [ ] **Step 4: Run all builds**

Run: `pnpm build:all`

Expected: frontend, admin, and server builds all succeed.

- [ ] **Step 5: Verify the real local flow, not Mock-only behavior**

Start the API on `127.0.0.1:3000`, frontend on `127.0.0.1:5173`, and admin from `admin/` on `127.0.0.1:5174`. With `VITE_USE_MOCKS=false` and `VITE_ADMIN_USE_MOCKS=false`, verify:

1. A historical sheet stays read-only and the current-day sheet still autosaves normally.
2. A historical sample can submit name, payer, amount, element, payment status, and raw-input changes with a reason.
3. The sample remains unchanged and shows `待审批`; a second pending request is blocked.
4. Withdrawal preserves a `WITHDRAWN` record and permits resubmission.
5. An unauthorized sub-admin cannot list/detail/approve the request; an authorized sub-admin can.
6. Approval shows exact old/new values, recalculates results, and changes the historical sample only after commit.
7. The request, linked cell history, reviewer, reminder, and monthly settlement effects are all visible.
8. Paid/partial affected monthly rows become unpaid; income, unsettled, prepaid, reports, and customer overview reflect the approved sample.
9. Rejection requires a reason and never changes the sample.
10. A stale source version produces a conflict and no partial updates.

- [ ] **Step 6: Check final Git scope**

Run: `git status --short`

Expected: only the pre-existing unrelated `docs/superpowers/plans/2026-08-20-frontend-subaccounts-menu-permissions.md` may remain untracked; no generated Prisma client, build output, database dump, credential, or unrelated file is staged.

- [ ] **Step 7: Record the implementation handoff evidence**

In the final implementation response, report focused test results, full test counts, build results, migration review, real frontend/admin/API acceptance, commit hashes, and any intentionally unrun production deployment step. Do not claim production readiness from Mock-only evidence.
