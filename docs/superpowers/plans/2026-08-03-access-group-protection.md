# 访问密码组合与已完成样品隐藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single account-wide access password with account-scoped access groups, protect completed-sample sensitive fields, and show the same groups in the admin customer-account table.

**Architecture:** Persist one access-group row and one feature-membership row per protected feature. The client maps a route or completed-sample view to a feature, then asks only that feature's group for access. The server independently redacts completed-sample sensitive values unless the request carries a valid short-lived grant for the completed-sample feature.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, NestJS, Prisma, PostgreSQL, Vitest.

## Global Constraints

- Access groups are scoped to the current frontend account.
- A feature can occur in only one group for an account.
- Start with no migrated group; legacy single-password values are ignored by the new UI and guard decisions.
- An unassigned feature is not password protected.
- Completed blocks continue to show identifiers, customers, element note and remark; redact only detection fields, price and payment status without a valid group grant.
- Do not modify unrelated dirty worktree files.

---

### Task 1: Persist access groups and enforce unique feature membership

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260803010000_add_access_guard_groups/migration.sql`
- Modify: `server/src/auth/dto.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.service.test.ts`

**Interfaces:**
- Produces `AccessGuardFeature` enum values: `FINANCE`, `REPORTS`, `BLACKLIST`, `HISTORICAL_DATES`, `MEDICINE_INVENTORY`, `CUSTOMER_OVERVIEW`, `COMPLETED_SAMPLE_DATA`.
- Produces `AccessGuardGroupDto { id, name, enabled, ttlMinutes, password, recoveryPrompt, recoveryAnswer, features }`.
- Produces authenticated endpoints: `GET /auth/access-groups`, `POST /auth/access-groups`, `PATCH /auth/access-groups/:id`, `DELETE /auth/access-groups/:id`, `POST /auth/access-groups/:id/verify`.

- [ ] **Step 1: Write failing service tests for group ownership, feature uniqueness, and password verification**

```ts
it('rejects assigning FINANCE to a second group for the same frontend account', async () => {
  await expect(service.createAccessGroup(frontendUser, groupPayload(['FINANCE']))).resolves.toMatchObject({ features: ['FINANCE'] })
  await expect(service.createAccessGroup(frontendUser, groupPayload(['FINANCE']))).rejects.toThrow('该功能已加入其他访问组合')
})

it('issues a grant only after the group password matches', async () => {
  await expect(service.verifyAccessGroup(frontendUser, 'group-1', { password: 'wrong' })).rejects.toThrow('访问密码不正确')
  await expect(service.verifyAccessGroup(frontendUser, 'group-1', { password: '2580' })).resolves.toMatchObject({ groupId: 'group-1', expiresAt: expect.any(String) })
})
```

- [ ] **Step 2: Run the auth service test and verify it fails because group APIs do not exist**

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts`

Expected: FAIL with missing group service methods or absent Prisma models.

- [ ] **Step 3: Add the Prisma enum, group model, membership model, and migration**

```prisma
enum AccessGuardFeature { FINANCE REPORTS BLACKLIST HISTORICAL_DATES MEDICINE_INVENTORY CUSTOMER_OVERVIEW COMPLETED_SAMPLE_DATA }

model AccessGuardGroup {
  id String @id @default(uuid())
  frontendUserId String
  name String
  enabled Boolean @default(true)
  password String
  ttlMinutes Int @default(5)
  recoveryPrompt String
  recoveryAnswer String
  features AccessGuardGroupFeature[]
  frontendUser User @relation("FrontendAccessGuardGroups", fields: [frontendUserId], references: [id], onDelete: Cascade, onUpdate: Cascade)
}

model AccessGuardGroupFeature {
  id String @id @default(uuid())
  frontendUserId String
  groupId String
  feature AccessGuardFeature
  group AccessGuardGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@unique([frontendUserId, feature])
  @@index([groupId])
}
```

- [ ] **Step 4: Implement DTO validation and account-scoped CRUD/verification in `AuthService`**

Use a transaction to create or replace memberships. Validate name, feature count, password length, recovery fields and duplicate requested features before writes. Use the authenticated user's id in every lookup. Return an expiration timestamp from verification and never use legacy `accessGuard*` fields in the new methods.

- [ ] **Step 5: Add controller endpoints and run Prisma generation plus focused tests**

Run: `DATABASE_URL='postgresql://validation:validation@127.0.0.1:5432/validation' pnpm --filter yangshao-server prisma:generate && pnpm --filter yangshao-server test -- auth.service.test.ts`

Expected: PASS; duplicate membership and cross-account group operations fail with clear errors.

- [ ] **Step 6: Commit the server access-group model and APIs**

```bash
git add server/prisma server/src/auth
git commit -m "feat: add account access groups"
```

### Task 2: Replace the frontend single-password store and settings dialog

**Files:**
- Replace: `src/api/accessGuard.ts`
- Replace: `src/stores/accessGuard.ts`
- Replace: `src/components/access/AccessGuardSettingsDialog.vue`
- Modify: `src/components/access/AccessGuardDialog.vue`
- Modify: `src/api/accessGuard.test.ts` or create `src/api/accessGuard.test.ts`
- Modify: `src/stores/accessGuard.test.ts`

**Interfaces:**
- Consumes the Task 1 group DTO endpoints.
- Produces `AccessGuardFeature` and `AccessGuardGroup` frontend types.
- Produces `requestFeatureAccess(feature, options)` and `hasFeatureAccess(feature)` in the Pinia store.

- [ ] **Step 1: Write failing API/store tests for per-group sessions and mock persistence**

```ts
it('unlocks only the verified group and not a different group', async () => {
  await store.loadGroups()
  await store.verifyGroupPassword('finance-group', '2580')
  expect(store.hasFeatureAccess('FINANCE')).toBe(true)
  expect(store.hasFeatureAccess('HISTORICAL_DATES')).toBe(false)
})

it('keeps a feature unavailable for selection when another group owns it', () => {
  expect(store.availableFeaturesFor('history-group')).not.toContain('FINANCE')
})
```

- [ ] **Step 2: Run the focused tests and verify failure against the legacy single-password store**

Run: `pnpm vitest run src/stores/accessGuard.test.ts src/api/accessGuard.test.ts`

Expected: FAIL because feature-based group methods and group API data are missing.

- [ ] **Step 3: Implement API methods, mock-mode local persistence, and per-group expiry keys**

Use `ys_access_guard_groups` and a session map keyed by group id in mock mode. Keep mock group data scoped to the logged-in account. Clear only an individual group grant when it expires; do not clear grants for unrelated groups.

- [ ] **Step 4: Implement the group-card settings dialog and group-specific verification dialog**

Render an empty state and “新建组合” button. In the editor, show feature checkboxes with another group's name on unavailable options. Make delete and disable open a password-confirm dialog for that group. Preserve the dialog's existing recovery-password flow, but operate on the requested group.

- [ ] **Step 5: Run focused API/store/component tests**

Run: `pnpm vitest run src/api/accessGuard.test.ts src/stores/accessGuard.test.ts src/components/access/AccessGuardSettingsDialog.test.ts`

Expected: PASS; no route or view is unlocked by a password from another group.

- [ ] **Step 6: Commit the frontend group settings implementation**

```bash
git add src/api/accessGuard.ts src/stores/accessGuard.ts src/components/access
git commit -m "feat: manage access password groups"
```

### Task 3: Map protected routes and historical dates to access-group features

**Files:**
- Modify: `src/router/guards.ts`
- Modify: `src/router/index.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/router/guards.test.ts`
- Modify: `src/views/dashboard/LabDataPage.test.ts`

**Interfaces:**
- Consumes `requestFeatureAccess('FINANCE' | ... )` from Task 2.
- Produces `featureForPath(path)` mapping medicine inventory child routes to `MEDICINE_INVENTORY` and historical data access to `HISTORICAL_DATES`.

- [ ] **Step 1: Write failing mapping and page tests**

```ts
it('maps every medicine inventory child route to one feature', () => {
  expect(featureForPath('/medicine-inventory/stock')).toBe('MEDICINE_INVENTORY')
  expect(featureForPath('/medicine-inventory/inbound')).toBe('MEDICINE_INVENTORY')
})

it('asks only the historical-date group before opening a prior date', async () => {
  await selectHistoricalDate(wrapper)
  expect(mocks.accessGuard.requestFeatureAccess).toHaveBeenCalledWith('HISTORICAL_DATES', expect.any(Object))
})
```

- [ ] **Step 2: Run the tests and verify they fail because the app still uses `isSensitiveAccessPath`**

Run: `pnpm vitest run src/router/guards.test.ts src/views/dashboard/LabDataPage.test.ts`

Expected: FAIL with missing feature mapping or legacy access method calls.

- [ ] **Step 3: Replace global-path checks with feature mapping and feature-specific dialog copy**

Map `/finance`, `/reports`, `/blacklist`, `/customers-overview`, and all `/medicine-inventory` routes. Leave unassigned features accessible. Replace historical date's direct global request with `HISTORICAL_DATES`.

- [ ] **Step 4: Run focused router and page tests**

Run: `pnpm vitest run src/router/guards.test.ts src/views/dashboard/LabDataPage.test.ts`

Expected: PASS; each protected area requests only its own configured group.

- [ ] **Step 5: Commit route and history access changes**

```bash
git add src/router src/views/dashboard/LabDataPage.vue src/views/dashboard/LabDataPage.test.ts
git commit -m "feat: gate features by access group"
```

### Task 4: Redact completed-sample sensitive values until its group is verified

**Files:**
- Modify: `src/types/labSheet.ts`
- Modify: `src/stores/labSheet.ts`
- Modify: `src/components/lab-sheet/LabSheetGrid.vue`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/components/lab-sheet/LabSheetGrid.test.ts`
- Modify: `src/views/dashboard/LabDataPage.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`

**Interfaces:**
- Consumes `hasFeatureAccess('COMPLETED_SAMPLE_DATA')` and the group grant from Task 2.
- Produces `sensitiveFieldsHidden` on completed blocks returned without a valid grant.

- [ ] **Step 1: Write failing redaction tests for completed and unfinished blocks**

```ts
it('masks completed results, amount and payment status without completed-data access', () => {
  mountGrid({ blocks: [completedBlock], canViewCompletedSensitiveData: false })
  expect(wrapper.text()).toContain('已隐藏')
  expect(wrapper.text()).not.toContain('64.31')
  expect(wrapper.text()).not.toContain('¥80.00')
})

it('does not mask unfinished sample values', () => {
  mountGrid({ blocks: [unfinishedBlock], canViewCompletedSensitiveData: false })
  expect(wrapper.text()).toContain('64.31')
})
```

- [ ] **Step 2: Run the redaction test and verify failure because completed blocks currently only change color**

Run: `pnpm vitest run src/components/lab-sheet/LabSheetGrid.test.ts`

Expected: FAIL because raw inputs, computed values, price and status are rendered.

- [ ] **Step 3: Add a redacted completed-block view in the frontend**

Keep sequence, sample name, payer, recipient, element note and note. For `inputs.completed && !canViewCompletedSensitiveData`, replace every raw detection input, formula result, `price`, and `paymentStatus` cell with a stable “已隐藏” placeholder and prevent editing. When a feature group is absent or disabled, pass `true` so no redaction applies.

- [ ] **Step 4: Add backend redaction and a valid group-grant check**

Have the sheet read endpoints receive the completed-data grant header. If the user's `COMPLETED_SAMPLE_DATA` group is enabled and the grant is missing/expired, clear detection input keys, clear result keys, price and payment status in the DTO and set `sensitiveFieldsHidden: true`. Keep persistence endpoints unchanged so marking completed does not destroy stored data.

- [ ] **Step 5: Re-fetch current sheet immediately after successful completed-data verification**

On verified access, reload the active sheet so the server response contains original sensitive values; on expiry, re-render/reload redacted data. Do not mutate hidden values back into browser state without a fresh authorized read.

- [ ] **Step 6: Run frontend and server sheet tests**

Run: `pnpm vitest run src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts server/src/lab-sheets/lab-sheets.service.test.ts`

Expected: PASS; only the requested fields are hidden, and the server DTO does not leak them without a grant.

- [ ] **Step 7: Commit completed-sample redaction**

```bash
git add src/types/labSheet.ts src/stores/labSheet.ts src/components/lab-sheet src/views/dashboard/LabDataPage.vue server/src/lab-sheets
git commit -m "feat: protect completed sample data"
```

### Task 5: Synchronize access-group summaries to admin customer accounts

**Files:**
- Modify: `server/src/admin/accounts.service.ts`
- Modify: `server/src/admin/accounts.service.test.ts`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/views/AccountManagementPage.vue`
- Modify: `admin/src/views/AccountManagementPage.test.ts`

**Interfaces:**
- Consumes `AccessGuardGroup` and membership data from Task 1.
- Produces `accessGroups: AccessGuardGroupDto[]` on `GET /admin/accounts/frontend-users`.

- [ ] **Step 1: Write failing admin service and page tests**

```ts
it('returns each frontend account access group with its grouped features', async () => {
  const [user] = await service.listFrontendUsers()
  expect(user.accessGroups).toEqual([expect.objectContaining({ name: '财务报表', features: ['FINANCE', 'REPORTS'] })])
})

it('renders a no-groups state and group password summary in the customer table', async () => {
  expect(wrapper.text()).toContain('未创建访问组合')
  expect(wrapper.text()).toContain('财务报表')
  expect(wrapper.text()).toContain('密码：2580')
})
```

- [ ] **Step 2: Run the tests and verify failure because the admin DTO still returns `accessGuard`**

Run: `pnpm vitest run server/src/admin/accounts.service.test.ts admin/src/views/AccountManagementPage.test.ts`

Expected: FAIL with missing `accessGroups` data and UI text.

- [ ] **Step 3: Include groups and memberships in the server account query and adapt mock admin rows**

Fetch `accessGroups` with their feature memberships, map group passwords/recovery values exactly as the existing account-management view exposes legacy values, and return an empty array for no groups.

- [ ] **Step 4: Replace the single-password table cell with group summaries**

Display one compact card per group: name, status, comma-separated feature labels, password, TTL, recovery prompt and answer. Display `未创建访问组合` for an empty array. Do not add an admin-side mutation path.

- [ ] **Step 5: Run admin and server focused tests**

Run: `pnpm vitest run server/src/admin/accounts.service.test.ts admin/src/views/AccountManagementPage.test.ts`

Expected: PASS; frontend edits are reflected after admin list reload.

- [ ] **Step 6: Commit admin synchronization**

```bash
git add server/src/admin admin/src/api.ts admin/src/views/AccountManagementPage.vue admin/src/views/AccountManagementPage.test.ts
git commit -m "feat: show access groups in admin accounts"
```

### Task 6: Final integration verification

**Files:**
- Modify only if verification reveals a defect in files above.

- [ ] **Step 1: Run affected frontend, admin and server tests without changing code**

Run: `pnpm vitest run src/api/accessGuard.test.ts src/stores/accessGuard.test.ts src/router/guards.test.ts src/components/lab-sheet/LabSheetGrid.test.ts src/views/dashboard/LabDataPage.test.ts server/src/auth/auth.service.test.ts server/src/lab-sheets/lab-sheets.service.test.ts server/src/admin/accounts.service.test.ts admin/src/views/AccountManagementPage.test.ts`

Expected: PASS.

- [ ] **Step 2: Run type checks and schema validation**

Run: `pnpm build && pnpm --filter yangshao-server exec tsc --noEmit && DATABASE_URL='postgresql://validation:validation@127.0.0.1:5432/validation' pnpm --filter yangshao-server prisma:validate`

Expected: all commands exit 0.

- [ ] **Step 3: Manually verify the local UI without creating or deleting user data**

Check that the settings page starts empty, a created group owns only its selected features, the admin customer-account row renders the same group, and an already-completed block has sensitive cells masked before its group is verified.

- [ ] **Step 4: Commit any verification-only fixes, then report the migration requirement**

If verification exposes a defect, first add a focused failing test in the affected test file, implement the smallest correction in its paired source file, rerun that focused test, then stage only those two files and commit with `fix: verify access group protection`. Do not create an empty verification commit.

Do not run the production migration automatically. Report that deployment must run `prisma migrate deploy` after the code is released.
