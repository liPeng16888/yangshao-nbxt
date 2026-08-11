# Frontend Subaccounts and Menu Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure frontend subaccounts that share their parent account's business data, enforce per-page menu permissions on both client and server, expose read-only details in admin, and prevent concurrent edits from silently overwriting data.

**Architecture:** A new `FRONTEND_SUB_USER` role remains the authenticated actor while `CurrentUser.dataOwnerId` identifies the parent tenant for every business query. Leaf menu permissions are stored in a dedicated Prisma table and enforced by a NestJS permission guard; the Vue navigation catalog drives menu filtering and route fallback. Existing lab-sheet field-level concurrency is moved onto a tenant-wide realtime channel, while ordinary editable records use optimistic versions plus tenant change notifications.

**Tech Stack:** Vue 3, Pinia, Vue Router, Element Plus, Axios, NestJS 10, Prisma 6, PostgreSQL, RxJS SSE, Vitest, TypeScript, pnpm.

## Global Constraints

- A subaccount can view, create, and modify data only inside granted pages; no read-only menu mode is introduced.
- Checking a first-level menu selects all leaves; partial leaf selection renders an indeterminate parent.
- The access-password requirement is one boolean per subaccount, not per menu.
- Subaccounts cannot manage access groups or other subaccounts and can only change their own password.
- Admin can only view frontend subaccount details and permissions; no admin write endpoint is added.
- Business rows remain owned by the existing frontend main account ID; no data is copied to subaccounts.
- Authorization must be enforced by the API even when the browser route guard is bypassed.
- Concurrent same-field edits must return HTTP 409 and preserve local form contents; different lab-sheet fields may merge.
- Existing backend `SUB_ADMIN` behavior and current main-account behavior must remain compatible.
- Use TDD for every production behavior: write the test, observe the expected failure, then implement the minimum change.

---

## File Structure

**New server files**

- `server/src/auth/frontend-menu-permissions.ts`: authoritative server permission groups and helpers.
- `server/src/auth/frontend-permission.decorator.ts`: metadata decorator for leaf permissions.
- `server/src/auth/frontend-permission.guard.ts`: main/subaccount API authorization.
- `server/src/auth/frontend-permission.guard.test.ts`: guard behavior tests.
- `server/src/auth/frontend-subaccounts.service.ts`: main-account-only CRUD and password reset.
- `server/src/auth/frontend-subaccounts.service.test.ts`: ownership, validation, and session invalidation tests.
- `server/src/realtime/tenant-realtime.module.ts`: exports tenant change service/controller.
- `server/src/realtime/tenant-realtime.service.ts`: tenant-scoped lightweight events.
- `server/src/realtime/tenant-realtime.controller.ts`: authenticated SSE endpoint.
- `server/src/realtime/tenant-realtime.service.test.ts`: tenant isolation tests.
- `server/prisma/migrations/20260811000000_add_frontend_subaccounts/migration.sql`: role, relation, version, login time, access switch, permission table.

**New customer frontend files**

- `src/config/frontendNavigation.ts`: single menu tree, route-to-permission lookup, filtered tree, first allowed route.
- `src/config/frontendNavigation.test.ts`: catalog completeness and tree selection tests.
- `src/api/frontendSubAccounts.ts`: main-account CRUD API.
- `src/types/frontendSubAccount.ts`: DTO and permission types.
- `src/components/account/FrontendSubAccountManager.vue`: list and create/edit/reset/disable/delete dialogs.
- `src/components/account/FrontendSubAccountManager.test.ts`: UI permission and lifecycle tests.
- `src/views/dashboard/NoMenuPermissionPage.vue`: empty state for subaccounts without permissions.
- `src/api/tenantRealtime.ts`: EventSource creator.
- `src/stores/tenantRealtime.ts`: dirty-page-safe refresh notifications.
- `src/stores/tenantRealtime.test.ts`: automatic refresh versus dirty-form prompt tests.

**New admin files**

- `admin/src/components/FrontendSubAccountsReadOnly.vue`: nested read-only subaccount details.
- `admin/src/components/FrontendSubAccountsReadOnly.test.ts`: proves no write controls are rendered.

Existing files are modified only where listed in the tasks below.

---

### Task 1: Persist the frontend subaccount identity and permission catalog

**Files:**
- Modify: `server/prisma/schema.prisma:10-250`
- Create: `server/prisma/migrations/20260811000000_add_frontend_subaccounts/migration.sql`
- Create: `server/src/auth/frontend-menu-permissions.ts`
- Test: `server/src/auth/auth.service.test.ts`

**Interfaces:**
- Produces: Prisma `UserRole.FRONTEND_SUB_USER`, `FrontendMenuPermission`, `FrontendSubAccountPermission`, and the user fields `parentFrontendUserId`, `permissionVersion`, `requiresAccessGuardPassword`, `lastLoginAt`.
- Produces: `frontendMenuPermissionGroups`, `allFrontendMenuPermissions`, and `isFrontendMenuPermission(value)`.

- [ ] **Step 1: Write the failing permission-catalog test**

Add a test that imports `allFrontendMenuPermissions` and asserts the exact 24 leaf keys from the approved design, no duplicates, and no empty group.

```ts
expect(new Set(allFrontendMenuPermissions).size).toBe(allFrontendMenuPermissions.length)
expect(allFrontendMenuPermissions).toContain('DATA_MAIN')
expect(allFrontendMenuPermissions).toContain('ATTENDANCE_PAYROLL')
expect(allFrontendMenuPermissions).toContain('BLACKLIST')
expect(frontendMenuPermissionGroups.every((group) => group.children.length > 0)).toBe(true)
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts`

Expected: FAIL because `frontend-menu-permissions.ts` and the generated Prisma enum do not exist.

- [ ] **Step 3: Add schema, migration, and catalog**

Add the exact self-relation and permission relation to `User`; use `ON DELETE RESTRICT` from child to parent so soft deletion remains the lifecycle mechanism. The SQL migration must add the enum value, columns, foreign keys, permission enum/table, unique constraint, and indexes without changing existing main-account rows.

```ts
export const frontendMenuPermissionGroups = [
  { key: 'DATA', children: ['DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT'] },
  { key: 'LAB_REPORT', children: ['LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE'] },
  { key: 'ATTENDANCE', children: ['ATTENDANCE_OVERVIEW', 'ATTENDANCE_EMPLOYEES', 'ATTENDANCE_SCHEDULES', 'ATTENDANCE_RECORDS', 'ATTENDANCE_LEAVE', 'ATTENDANCE_COMPENSATION', 'ATTENDANCE_PAYROLL'] },
  { key: 'FINANCE', children: ['FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED', 'FINANCE_MONTHLY_SETTLEMENT', 'FINANCE_PREPAID_ADD', 'FINANCE_PREPAID_CUSTOMERS'] },
  { key: 'REPORTS', children: ['REPORTS'] },
  { key: 'MEDICINE', children: ['MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND'] },
  { key: 'CUSTOMER_OVERVIEW', children: ['CUSTOMER_OVERVIEW'] },
  { key: 'BLACKLIST', children: ['BLACKLIST'] }
] as const

export const allFrontendMenuPermissions = frontendMenuPermissionGroups.flatMap((group) => [...group.children])
```

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run: `pnpm --filter yangshao-server prisma:generate`

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260811000000_add_frontend_subaccounts server/src/auth/frontend-menu-permissions.ts server/src/auth/auth.service.test.ts
git commit -m "feat: add frontend subaccount data model"
```

### Task 2: Resolve actor, data owner, parent state, and token version

**Files:**
- Modify: `server/src/auth/current-user.ts`
- Modify: `server/src/auth/auth.guard.ts`
- Modify: `server/src/auth/auth.service.ts:20-80,320-380`
- Modify: `server/src/auth/auth.controller.ts:13-27`
- Modify: `server/src/lab-sheets/lab-sheet-stream-auth.service.ts`
- Test: `server/src/auth/auth.service.test.ts`
- Test: `server/src/lab-sheets/lab-sheets.controller.test.ts`

**Interfaces:**
- Produces: `CurrentUser.dataOwnerId`, `permissionVersion`, `permissions`, `requiresAccessGuardPassword`, `isFrontendMainAccount`, `isFrontendSubAccount`.
- Produces: JWT claims `{ sub, permissionVersion }`.
- Consumes: Prisma fields and permissions from Task 1.

- [ ] **Step 1: Write failing identity tests**

Cover three cases: a main account resolves `dataOwnerId=id`; a subaccount resolves its parent ID and permissions; a disabled/deleted parent or mismatched token version returns `UnauthorizedException`.

```ts
expect(resolved).toMatchObject({
  id: 'sub-1',
  dataOwnerId: 'front-1',
  role: UserRole.FRONTEND_SUB_USER,
  permissions: ['DATA_MAIN'],
  requiresAccessGuardPassword: false
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts lab-sheets.controller.test.ts`

Expected: FAIL because current identities contain only `id/account/username/role` and login rejects the new role.

- [ ] **Step 3: Implement one shared identity resolver**

Extract a reusable method in `AuthService` or a focused provider so HTTP and SSE authentication execute the same database checks. Login accepts `[FRONTEND_USER, FRONTEND_SUB_USER]`, updates `lastLoginAt`, signs the current `permissionVersion`, and returns permissions only for subaccounts. Never accept `dataOwnerId` from request input.

```ts
type AuthTokenPayload = { sub: string; permissionVersion: number }

if (user.role === UserRole.FRONTEND_SUB_USER) {
  if (!user.parentFrontendUser || user.parentFrontendUser.disabled || user.parentFrontendUser.deletedAt) {
    throw new UnauthorizedException('主账号已停用，请联系管理员')
  }
}
```

- [ ] **Step 4: Verify GREEN and regress admin login**

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts lab-sheets.controller.test.ts`

Expected: PASS, including existing `ROOT_ADMIN` and `SUB_ADMIN` login tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth server/src/lab-sheets/lab-sheet-stream-auth.service.ts server/src/lab-sheets/lab-sheets.controller.test.ts
git commit -m "feat: resolve frontend subaccount tenant identity"
```

### Task 3: Add main-account-only subaccount lifecycle APIs

**Files:**
- Create: `server/src/auth/frontend-subaccounts.service.ts`
- Create: `server/src/auth/frontend-subaccounts.service.test.ts`
- Modify: `server/src/auth/dto.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.module.ts`

**Interfaces:**
- Produces: `list(owner)`, `create(owner,dto)`, `update(owner,id,dto)`, `setStatus(owner,id,dto)`, `resetPassword(owner,id,dto)`, `softDelete(owner,id)`.
- Produces DTOs `CreateFrontendSubAccountDto`, `UpdateFrontendSubAccountDto`, `SetFrontendSubAccountStatusDto`, `ResetFrontendSubAccountPasswordDto`.

- [ ] **Step 1: Write failing service tests**

Tests must prove: only `FRONTEND_USER` can manage; account is globally unique; every target query includes `parentFrontendUserId=owner.id`; permission keys are deduplicated; writes replace permissions transactionally; update/disable/reset/delete increments `permissionVersion`; password reset verifies the main account's current password; list never returns password data.

```ts
await expect(service.update(subUser, 'sub-2', payload)).rejects.toBeInstanceOf(ForbiddenException)
expect(transaction.frontendSubAccountPermission.createMany).toHaveBeenCalledWith({
  data: [{ subAccountId: 'sub-1', permission: 'DATA_MAIN' }]
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter yangshao-server test -- frontend-subaccounts.service.test.ts`

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement DTOs, service, and controller routes**

Use the six approved `/auth/frontend-subaccounts` endpoints. Validate account/name lengths, password confirmation and minimum length, boolean status, and each permission via Prisma enum. Every security-sensitive update is one Prisma transaction.

```ts
private assertMain(user: CurrentUser) {
  if (user.role !== UserRole.FRONTEND_USER || user.dataOwnerId !== user.id) {
    throw new ForbiddenException('只有主账号可以管理子账号')
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --filter yangshao-server test -- frontend-subaccounts.service.test.ts auth.service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth
git commit -m "feat: manage frontend subaccounts"
```

### Task 4: Enforce leaf permissions and tenant ownership on every customer API

**Files:**
- Create: `server/src/auth/frontend-permission.decorator.ts`
- Create: `server/src/auth/frontend-permission.guard.ts`
- Create: `server/src/auth/frontend-permission.guard.test.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `server/src/finance/finance.controller.ts`
- Modify: `server/src/reports/reports.controller.ts`
- Modify: `server/src/blacklist/blacklist.controller.ts`
- Modify: `server/src/customers/customers.controller.ts`
- Modify: `server/src/customer-overview/customer-overview.controller.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/reminders/reminders.controller.ts`
- Modify: `server/src/uploads/uploads.controller.ts`
- Test: existing controller tests under `server/src/**`

**Interfaces:**
- Produces: `@FrontendPermission(...permissions)`; guard allows all main accounts and requires at least one declared permission for subaccounts.
- Consumes: `CurrentUser.dataOwnerId` and `CurrentUser.id` from Task 2.

- [ ] **Step 1: Write failing guard and representative controller tests**

Test main allow, sub allow, sub deny, admin-role deny, and missing metadata deny for frontend business routes. Add controller assertions proving services receive `dataOwnerId` for ownership and `id` for actor logging.

```ts
await controller.createEmployee(subUser, dto)
expect(attendance.createEmployee).toHaveBeenCalledWith('front-1', 'sub-1', dto)
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter yangshao-server test -- frontend-permission.guard.test.ts employee-attendance.controller.test.ts medicine-inventory.controller.test.ts`

Expected: FAIL because controllers still pass `user.id` as the tenant and do not accept the subaccount role.

- [ ] **Step 3: Implement guard and annotate routes**

Add `FRONTEND_SUB_USER` to frontend role boundaries, apply the leaf permission matching each page, and pass `user.dataOwnerId` to business services. Where services already accept `changedById`, pass `user.id`. Shared customer APIs used by data calculation must carry the permission of the page that invokes them; uploads must require the calling page permission rather than accepting any subaccount universally.

- [ ] **Step 4: Add a catalog coverage test**

The test must enumerate controller metadata and fail if a frontend route lacks `@FrontendPermission` unless explicitly marked main-account-only.

- [ ] **Step 5: Run the complete server suite**

Run: `pnpm --filter yangshao-server test`

Expected: all server tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src
git commit -m "feat: enforce frontend menu permissions on APIs"
```

### Task 5: Integrate access-password rules and tenant-wide lab realtime

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets-stream.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheet-stream-auth.service.ts`
- Modify: `server/src/lab-sheets/lab-sheet-realtime.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `src/api/labSheet.ts`
- Modify: `src/stores/labSheet.ts`
- Modify: `src/stores/labSheet.test.ts`

**Interfaces:**
- Access grants bind `{ sub: actorId, ownerId: dataOwnerId, groupId, groupVersion, permissionVersion, features }`.
- Realtime channel key is `{ dataOwnerId, date }`; payload keeps `sourceClientId` and `changedById`.

- [ ] **Step 1: Write failing access and realtime tests**

Prove: required subaccount validates against the parent's group; exempt subaccount skips only the access password; an actor/owner/version mismatch rejects the grant; parent and child subscribe to the same lab channel; saved cell log records owner and actor separately.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --filter yangshao-server test -- auth.service.test.ts lab-sheets.service.test.ts`

Run: `pnpm test -- src/stores/labSheet.test.ts`

Expected: FAIL because access groups and realtime currently key on the actual user ID.

- [ ] **Step 3: Implement tenant-aware access and realtime**

Subaccounts never receive access-group settings. Grant verification uses the actual actor and parent's live group. SSE authorization resolves `CurrentUser`, checks `DATA_MAIN`, and subscribes with `dataOwnerId`. Change logs write `frontendUserId=dataOwnerId` and `changedById=id`. Draft keys include both owner and actor.

- [ ] **Step 4: Verify GREEN**

Run the same focused server/frontend tests; expect PASS, including existing different-field merge and same-field conflict cases.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth server/src/lab-sheets src/api/labSheet.ts src/stores/labSheet.ts src/stores/labSheet.test.ts
git commit -m "feat: share lab realtime across frontend accounts"
```

### Task 6: Centralize frontend navigation and enforce route permissions

**Files:**
- Create: `src/config/frontendNavigation.ts`
- Create: `src/config/frontendNavigation.test.ts`
- Modify: `src/types/auth.ts`
- Modify: `src/stores/auth.ts`
- Modify: `src/router/guards.ts`
- Modify: `src/router/guards.test.ts`
- Modify: `src/router/index.ts`
- Modify: `src/components/layout/AppSidebar.vue`
- Create: `src/views/dashboard/NoMenuPermissionPage.vue`

**Interfaces:**
- Produces: `FrontendMenuPermission` string union, `frontendNavigation`, `permissionForPath(path)`, `navigationForUser(user)`, `firstAllowedPath(user)`, `canAccessPath(user,path)`.
- Consumes: auth response `permissions`, `isFrontendSubAccount`, and access-password switch from Task 2.

- [ ] **Step 1: Write failing navigation tests**

Assert exact route coverage, main-account full tree, subaccount filtered children, indeterminate parent helpers, direct denied URL fallback, and no-permission fallback.

```ts
expect(firstAllowedPath(subWithIncomeOnly)).toBe('/finance/income')
expect(navigationForUser(subWithIncomeOnly).find((item) => item.key === 'FINANCE')?.children)
  .toEqual([expect.objectContaining({ permission: 'FINANCE_INCOME' })])
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/config/frontendNavigation.test.ts src/router/guards.test.ts`

Expected: FAIL because navigation is embedded in `AppSidebar.vue` and redirects always target `/data`.

- [ ] **Step 3: Implement catalog, filtered sidebar, and router guard**

Move the existing labels/icons/routes unchanged into the catalog. Route meta contains leaf permission. Main account gets all routes; child gets only granted routes. Root/login redirects call `firstAllowedPath`; `/no-menu-permission` is available only to authenticated users with zero permissions.

- [ ] **Step 4: Verify GREEN**

Run focused tests and `pnpm build`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config src/types/auth.ts src/stores/auth.ts src/router src/components/layout/AppSidebar.vue src/views/dashboard/NoMenuPermissionPage.vue
git commit -m "feat: filter frontend navigation by subaccount permission"
```

### Task 7: Build main-account subaccount management UI

**Files:**
- Create: `src/types/frontendSubAccount.ts`
- Create: `src/api/frontendSubAccounts.ts`
- Create: `src/components/account/FrontendSubAccountManager.vue`
- Create: `src/components/account/FrontendSubAccountManager.test.ts`
- Modify: `src/components/layout/AppTopbar.vue`
- Modify: `src/api/auth.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/db.test.ts`

**Interfaces:**
- Consumes: navigation tree from Task 6 and six lifecycle endpoints from Task 3.
- Produces: `FrontendSubAccountDto` and API functions matching those endpoints.

- [ ] **Step 1: Write failing component tests**

Cover two-tab main settings, child-only password settings, tree parent select/all/partial behavior, create/edit/status/reset/delete calls, reset requiring main current password, API errors preserving form state, and absence of raw password display.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm test -- src/components/account/FrontendSubAccountManager.test.ts src/mocks/db.test.ts`

Expected: FAIL because the manager and mock lifecycle do not exist.

- [ ] **Step 3: Implement types, API, mocks, and UI**

Use Element Plus table, tabs, tree with `check-strictly=false`, status tags, confirmation dialogs, and separate reset-password dialog. `AppTopbar` shows the manager tab only when `role==='FRONTEND_USER'`; it hides “访问设置” for `FRONTEND_SUB_USER`.

- [ ] **Step 4: Verify GREEN and build**

Run focused tests and `pnpm build`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/frontendSubAccount.ts src/api/frontendSubAccounts.ts src/components/account src/components/layout/AppTopbar.vue src/api/auth.ts src/mocks/db.ts src/mocks/db.test.ts
git commit -m "feat: manage frontend subaccounts in account settings"
```

### Task 8: Show frontend subaccounts read-only in admin

**Files:**
- Modify: `server/src/admin/accounts.service.ts`
- Add test: `server/src/admin/accounts.service.test.ts`
- Modify: `admin/src/types.ts`
- Create: `admin/src/components/FrontendSubAccountsReadOnly.vue`
- Create: `admin/src/components/FrontendSubAccountsReadOnly.test.ts`
- Modify: `admin/src/views/AccountManagementPage.vue`
- Modify: `admin/src/api.ts`

**Interfaces:**
- Server returns `frontendSubAccounts` nested under each main account with `id, account, username, disabled, requiresAccessGuardPassword, permissions, createdAt, lastLoginAt`.
- No admin mutation interface is produced.

- [ ] **Step 1: Write failing server and admin tests**

Assert nested rows are limited to `FRONTEND_SUB_USER` children, password fields are absent, labels render grouped leaf permissions, and no edit/delete/reset/disable button or request exists.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter yangshao-server test -- accounts.service.test.ts`

Run: `pnpm test -- admin/src/components/FrontendSubAccountsReadOnly.test.ts`

Expected: FAIL because nested details are not returned/rendered.

- [ ] **Step 3: Implement read-only query and component**

Extend only the root-admin GET response. Rename the existing admin tab label from “子账号” to “后台子账号”; do not alter its behavior.

- [ ] **Step 4: Verify GREEN and admin build**

Run focused tests and `pnpm build:admin`; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/admin admin/src/types.ts admin/src/components/FrontendSubAccountsReadOnly.vue admin/src/components/FrontendSubAccountsReadOnly.test.ts admin/src/views/AccountManagementPage.vue admin/src/api.ts
git commit -m "feat: show frontend subaccounts in admin"
```

### Task 9: Add tenant change notifications that never overwrite dirty forms

**Files:**
- Create: `server/src/realtime/tenant-realtime.module.ts`
- Create: `server/src/realtime/tenant-realtime.service.ts`
- Create: `server/src/realtime/tenant-realtime.controller.ts`
- Create: `server/src/realtime/tenant-realtime.service.test.ts`
- Modify: `server/src/app.module.ts`
- Create: `src/api/tenantRealtime.ts`
- Create: `src/stores/tenantRealtime.ts`
- Create: `src/stores/tenantRealtime.test.ts`
- Modify: `src/components/layout/AppLayout.vue`

**Interfaces:**
- Produces server event `{ module, entityId, operation, changedById, updatedAt }` scoped internally by `dataOwnerId`.
- Produces client registration `registerModule(module, { isDirty, refresh })` and global `hasRemoteChanges`.

- [ ] **Step 1: Write failing isolation and dirty-form tests**

Server test proves tenant A never receives tenant B events and payload omits full record contents. Client test proves clean modules refresh, dirty modules only set a prompt, and self-originated client events are ignored.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm --filter yangshao-server test -- tenant-realtime.service.test.ts`

Run: `pnpm test -- src/stores/tenantRealtime.test.ts`

Expected: FAIL because the tenant event service/store do not exist.

- [ ] **Step 3: Implement SSE service, endpoint, and client store**

Authenticate the SSE endpoint using the shared identity resolver. Do not include sensitive row data. Connect once from `AppLayout`, reconnect with backoff, and disconnect on logout. Document in code that multi-instance deployment requires PostgreSQL LISTEN/NOTIFY or Redis before horizontal scaling.

- [ ] **Step 4: Verify GREEN**

Run the focused tests; expected PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/realtime server/src/app.module.ts src/api/tenantRealtime.ts src/stores/tenantRealtime.ts src/stores/tenantRealtime.test.ts src/components/layout/AppLayout.vue
git commit -m "feat: notify shared tenants about remote changes"
```

### Task 10: Apply optimistic concurrency to ordinary mutable records

**Files:**
- Modify: `server/src/blacklist/blacklist.service.ts`
- Modify: `server/src/blacklist/blacklist.controller.ts`
- Modify: `server/src/customers/customers.service.ts`
- Modify: `server/src/customers/customers.controller.ts`
- Modify: `server/src/finance/finance.service.ts`
- Modify: `server/src/finance/finance.controller.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.service.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.controller.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.dto.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.dto.ts`
- Modify: `server/src/employee-attendance/payroll.service.ts`
- Modify: `src/api/blacklist.ts`
- Modify: `src/api/customer.ts`
- Modify: `src/api/finance.ts`
- Modify: `src/api/financeBills.ts`
- Modify: `src/api/medicineInventory.ts`
- Modify: `src/api/employeeAttendance.ts`
- Modify: `src/stores/blacklist.ts`
- Modify: `src/stores/finance.ts`
- Modify: `src/stores/financeBills.ts`
- Modify: `src/stores/employeeAttendance.ts`
- Modify: `src/types/blacklist.ts`
- Modify: `src/types/customer.ts`
- Modify: `src/types/finance.ts`
- Modify: `src/types/financeBills.ts`
- Modify: `src/types/medicineInventory.ts`
- Modify: `src/types/employeeAttendance.ts`
- Modify: `src/components/blacklist/BlacklistTable.vue`
- Modify: `src/components/blacklist/BlacklistUploadForm.vue`
- Modify: `src/components/lab-sheet/CustomerCellEditor.vue`
- Modify: `src/views/dashboard/BlacklistPage.vue`
- Modify: `src/views/dashboard/FinancePage.vue`
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.vue`
- Modify: `src/views/dashboard/FinancePrepaidCustomersPage.vue`
- Modify: `src/views/dashboard/MedicineInventoryInboundPage.vue`
- Modify: `src/views/dashboard/MedicineInventoryOutboundPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeDirectoryPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeCompensationPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeePayrollPage.vue`
- Test: `server/src/finance/finance.service.test.ts`
- Test: `server/src/medicine-inventory/medicine-inventory.service.test.ts`
- Test: `server/src/employee-attendance/employee-attendance.service.test.ts`
- Test: `server/src/employee-attendance/payroll.service.test.ts`
- Test: `src/components/blacklist/BlacklistTable.test.ts`
- Test: `src/stores/financeBills.test.ts`
- Test: `src/stores/employeeAttendance.test.ts`
- Test: `src/views/dashboard/MedicineInventoryPages.test.ts`
- Test: `src/views/dashboard/EmployeeAttendancePages.test.ts`
- Test: `src/views/dashboard/FinanceMonthlySettlementPage.test.ts`

**Interfaces:**
- All mutable DTOs consume `baseUpdatedAt: string` or an explicit state/version token.
- Conflicts return HTTP 409 with `{ code: 'STALE_WRITE', message, current }` where `current` contains only fields the caller is allowed to view.
- Successful mutations publish a Task 9 tenant event after transaction commit.

- [ ] **Step 1: Write failing service tests for each mutation class**

At minimum cover blacklist update/delete, customer delete, prepaid/monthly remarks, employee/schedule/attendance/leave/commission/bonus updates and deletes. Existing append-only finance entries, medicine movements, payroll locks, and payment row locks must retain their transactional rules and gain actor/event assertions rather than redundant version checks.

```ts
prisma.blacklistRecord.updateMany.mockResolvedValue({ count: 0 })
await expect(service.update('front-1', 'sub-1', 'row-1', { ...dto, baseUpdatedAt }))
  .rejects.toMatchObject({ response: expect.objectContaining({ code: 'STALE_WRITE' }) })
```

- [ ] **Step 2: Run focused server tests and verify RED**

Run: `pnpm --filter yangshao-server test -- finance.service.test.ts medicine-inventory.service.test.ts employee-attendance.service.test.ts`

Expected: FAIL because several updates do not compare the base version or publish tenant events.

- [ ] **Step 3: Implement conditional writes and actor attribution**

Use `id + dataOwnerId + updatedAt` conditions. Preserve existing row locks/unique constraints for stock, settlement, payroll and approval workflows. Publish only after successful commit. Ensure change-log `changedById` receives the actual actor.

- [ ] **Step 4: Write failing client tests for form preservation**

For each edited page family, simulate HTTP 409 and assert typed values remain, a conflict message appears, and remote events refresh only when the form is clean.

- [ ] **Step 5: Implement client version submission and refresh registration**

Include `baseUpdatedAt` in mutations, retain reactive form state on 409, and register list refresh handlers with the tenant realtime store.

- [ ] **Step 6: Run all focused tests and verify GREEN**

Run: `pnpm --filter yangshao-server test -- finance.service.test.ts medicine-inventory.service.test.ts employee-attendance.service.test.ts payroll.service.test.ts`

Run: `pnpm test -- src/components/blacklist/BlacklistTable.test.ts src/stores/financeBills.test.ts src/stores/employeeAttendance.test.ts src/views/dashboard/MedicineInventoryPages.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts src/views/dashboard/FinanceMonthlySettlementPage.test.ts`

Expected: all listed server and frontend tests PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src src/api src/stores src/views/dashboard src/components
git commit -m "feat: prevent stale writes across shared frontend data"
```

### Task 11: Full migration, security, concurrency, and browser verification

**Files:**
- Modify only failing implementation/tests discovered by verification.
- Update: `docs/superpowers/specs/2026-08-11-frontend-subaccounts-design.md` only if verified behavior required a user-approved design correction.

**Interfaces:**
- Consumes all previous tasks; produces a releasable local implementation.

- [ ] **Step 1: Validate schema and migration**

Run: `pnpm --filter yangshao-server exec prisma validate`

Run: `pnpm --filter yangshao-server prisma:generate`

Run against a disposable test database: `pnpm --filter yangshao-server exec prisma migrate deploy`

Expected: migration applies once, existing main accounts remain unchanged, rollback is not attempted on real user data.

- [ ] **Step 2: Run all tests**

Run: `pnpm test:all`

Expected: all existing and new tests PASS with no unhandled errors.

- [ ] **Step 3: Run all production builds**

Run: `pnpm build:all`

Expected: customer frontend, admin frontend, and NestJS server builds PASS.

- [ ] **Step 4: Perform two-session browser verification**

Use separate browser sessions for a main account and subaccount. Verify create/login, menu filtering, direct URL 403/fallback, full CRUD in allowed pages, denied API calls, access-password on/off, same-field lab conflict, different-field merge, clean-list auto-refresh, dirty-form notification, permission revocation logout, parent disable, and admin read-only details.

- [ ] **Step 5: Inspect database invariants**

Confirm business rows retain the parent `frontendUserId`, change logs identify the actual child in `changedById`, permissions contain only valid leaves, and deleted/disabled children cannot use old tokens.

- [ ] **Step 6: Record a clean verification state**

Run: `git status --short`

Expected: no uncommitted implementation changes. If a verification failure required a code change, return to that owning task, add a failing regression test, complete its RED/GREEN cycle, and commit there before repeating this task.

---

## Plan Self-Review Results

- Every approved design requirement is assigned to at least one task.
- Main versus subaccount identity, data ownership, menu permission, and actual actor IDs use consistent names throughout the plan.
- No backend mutation capability is added for frontend subaccounts.
- Concurrency work distinguishes mergeable lab fields from ordinary entity versions and transactional stock/payment/payroll state.
- The plan has no deferred placeholders; horizontal multi-instance realtime is explicitly outside this release while database conflict protection remains instance-independent.
