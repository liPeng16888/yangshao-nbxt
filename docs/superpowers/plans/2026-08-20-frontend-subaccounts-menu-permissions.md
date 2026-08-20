# Frontend Subaccounts and Menu Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes so progress survives handoffs.

**Goal:** Add main-account-controlled frontend subaccounts that share the main account's business data while receiving explicit first-level and second-level menu access, with server-side enforcement and the existing access-password protection preserved.

**Architecture:** Keep the existing `User` table, add the explicit `FRONTEND_SUB_USER` role, a parent-main-account relation, an `authVersion`, and a normalized permission table. Authentication resolves two identities: `id` is the acting user and `frontendUserId` is the business-data owner. A centralized menu-permission guard enforces leaf permissions at every frontend API boundary, while a separate access-password guard remains an additional check. The customer frontend uses one shared permission catalog for its sidebar, router, account settings, mocks, and API contracts.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Element Plus, Vite, Vitest, Vue Test Utils, NestJS, Prisma, PostgreSQL, JWT.

**Spec:** `docs/superpowers/specs/2026-08-20-frontend-subaccounts-menu-permissions-design.md`

## File and Responsibility Map

- `server/prisma/schema.prisma` and `server/prisma/migrations/20260820000000_add_frontend_subaccounts/migration.sql`: persistent role, parent relation, session version, permission enum, and permission rows.
- `server/src/auth/frontend-menu-permissions.ts`: the canonical server permission catalog and first-level group metadata.
- `server/src/auth/current-user.ts` and `server/src/auth/authenticated-user.service.ts`: actor/owner identity contract and database-backed token resolution.
- `server/src/auth/frontend-subaccounts.service.ts` plus DTOs: main-account-only create, list, update, enable/disable, reset-password, and delete behavior.
- `server/src/auth/frontend-permission.decorator.ts` and `server/src/auth/frontend-permission.guard.ts`: leaf permission metadata and server authorization.
- `server/src/auth/access-guard.decorator.ts` and `server/src/auth/access-guard.guard.ts`: reusable enforcement of the existing access-password feature protection.
- Customer-facing controllers in `server/src/*`: route-to-permission mapping and replacement of tenant ownership from `user.id` to `user.frontendUserId`.
- `src/config/frontendMenu.ts`: the canonical browser menu tree, route paths, icons, leaf permissions, and access-guard feature mapping.
- `src/types/auth.ts`, `src/stores/auth.ts`, `src/router/index.ts`, and `src/router/guards.ts`: current-user permissions, filtered navigation, direct-route enforcement, and stable redirects.
- `src/api/frontendSubaccounts.ts` and `src/mocks/frontendSubaccounts.ts`: matching real and mock child-account contracts.
- `src/components/account-settings/*`: password management plus the approved left-list/right-detail child-account manager.
- `src/api/accessGuard.ts` and `src/stores/accessGuard.ts`: full group settings for the main account and sanitized challenges for child accounts.

## Global Constraints

- [ ] Execute in an isolated worktree created with `superpowers:using-git-worktrees`; use branch `codex/frontend-subaccounts-menu-permissions` unless the user chooses another branch.
- [ ] Follow `superpowers:test-driven-development`: every behavior change begins with a focused failing test, then the smallest implementation that makes it pass.
- [ ] Preserve historical business rows and prepayment data. The new migration is additive and must contain no `UPDATE`, `DELETE`, `TRUNCATE`, or destructive column/type replacement.
- [ ] Treat `CurrentUser.id` as the actor and `CurrentUser.frontendUserId` as the business owner. Never substitute one for the other without a test that documents the business reason.
- [ ] Main accounts implicitly have all current permissions. Child accounts have only rows explicitly stored at assignment time; newly added permissions remain denied until granted.
- [ ] The account identifier is immutable after child creation. A child must always have at least one leaf permission.
- [ ] Existing `ROOT_ADMIN` and `SUB_ADMIN` behavior remains unchanged. A `FRONTEND_SUB_USER` cannot use the admin login or admin application.
- [ ] Menu authorization and access-password authorization are independent gates. Passing one never bypasses the other.
- [ ] Do not store or return a recoverable child password. Reset requires the main account's current password and stores only the normal password hash.
- [ ] Exclude `.worktrees/**`, `.pnpm-store/**`, and `.superpowers/**` from root Vitest discovery before interpreting full-suite results.
- [ ] Before claiming completion, use `superpowers:verification-before-completion` and capture fresh focused tests, full tests, builds, Prisma validation, and browser evidence.

---

### Task 1: Add the persistent subaccount and permission model

**Consumes:** Approved role, ownership, invalidation, and 22-leaf catalog from the spec.

**Produces:** Prisma types and an immutable server catalog that later tasks can import.

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260820000000_add_frontend_subaccounts/migration.sql`
- Create: `server/src/auth/frontend-menu-permissions.ts`
- Create: `server/src/auth/frontend-subaccounts.schema.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write a failing schema/catalog contract test**

Create `server/src/auth/frontend-subaccounts.schema.test.ts` with exact assertions for role, fields, all 22 enum values, the permission model, and non-destructive SQL:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(process.cwd(), 'prisma/migrations/20260820000000_add_frontend_subaccounts/migration.sql'),
  'utf8',
);

const permissionNames = [
  'DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT',
  'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE',
  'ATTENDANCE_SCHEDULES', 'ATTENDANCE_EMPLOYEES', 'ATTENDANCE_RECORDS',
  'ATTENDANCE_LEAVE', 'ATTENDANCE_COMPENSATION', 'ATTENDANCE_PAYROLL',
  'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED',
  'FINANCE_MONTHLY_SETTLEMENT', 'FINANCE_PREPAID', 'REPORTS',
  'MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND',
  'CUSTOMER_OVERVIEW', 'BLACKLIST',
] as const;

describe('frontend subaccount schema', () => {
  it('declares the role, identity fields, and every current leaf permission', () => {
    expect(schema).toContain('FRONTEND_SUB_USER');
    expect(schema).toContain('parentFrontendUserId String?');
    expect(schema).toMatch(/authVersion\s+Int\s+@default\(1\)/);
    expect(schema).toContain('model FrontendSubAccountPermission');
    permissionNames.forEach((name) => expect(schema).toContain(name));
  });

  it('uses an additive migration only', () => {
    expect(migration).toContain('FrontendSubAccountPermission');
    expect(migration).not.toMatch(/^\s*(?:UPDATE|DELETE\s+FROM|TRUNCATE)\b/im);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|COLUMN|TYPE)/i);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
pnpm --dir server test -- src/auth/frontend-subaccounts.schema.test.ts
```

Expected: FAIL because the migration file and schema declarations do not exist.

- [ ] **Step 3: Add the Prisma model and exact permission enum**

Add `FRONTEND_SUB_USER` to `UserRole`, add the following fields and relations to `User`, and add the new enum/model:

```prisma
enum FrontendMenuPermission {
  DATA_MAIN
  DATA_STANDARD_SAMPLE
  DATA_COEFFICIENT
  LAB_REPORT_IMAGE_TEMPLATE
  LAB_REPORT_SMS_TEMPLATE
  ATTENDANCE_SCHEDULES
  ATTENDANCE_EMPLOYEES
  ATTENDANCE_RECORDS
  ATTENDANCE_LEAVE
  ATTENDANCE_COMPENSATION
  ATTENDANCE_PAYROLL
  FINANCE_EXPENSES
  FINANCE_INCOME
  FINANCE_UNSETTLED
  FINANCE_MONTHLY_SETTLEMENT
  FINANCE_PREPAID
  REPORTS
  MEDICINE_STOCK
  MEDICINE_INBOUND
  MEDICINE_OUTBOUND
  CUSTOMER_OVERVIEW
  BLACKLIST
}

model User {
  parentFrontendUserId       String?
  authVersion                Int                            @default(1)
  parentFrontendUser         User?                          @relation("FrontendSubAccounts", fields: [parentFrontendUserId], references: [id], onDelete: Restrict)
  frontendSubAccounts        User[]                         @relation("FrontendSubAccounts")
  frontendSubAccountPermissions FrontendSubAccountPermission[]

  @@index([parentFrontendUserId])
}

model FrontendSubAccountPermission {
  id           String                 @id @default(uuid())
  subAccountId String
  permission   FrontendMenuPermission
  createdAt    DateTime               @default(now())
  subAccount   User                   @relation(fields: [subAccountId], references: [id], onDelete: Cascade)

  @@unique([subAccountId, permission])
  @@index([subAccountId])
}
```

Merge the shown `User` members into the existing model instead of creating a second `User` declaration.

- [ ] **Step 4: Write the additive SQL migration**

Create the enum with the exact 22 values, add `FRONTEND_SUB_USER`, add `parentFrontendUserId` and non-null `authVersion DEFAULT 1`, create the permission table, unique/index constraints, and foreign keys. Use `ON DELETE RESTRICT` for the parent relation and `ON DELETE CASCADE` for permission rows. Do not backfill or rewrite existing users.

- [ ] **Step 5: Create the immutable server catalog**

Create `server/src/auth/frontend-menu-permissions.ts` exporting:

```ts
import { FrontendMenuPermission } from '@prisma/client';

export const FRONTEND_MENU_PERMISSION_GROUPS = [
  { key: 'data', label: '数据计算', permissions: [FrontendMenuPermission.DATA_MAIN, FrontendMenuPermission.DATA_STANDARD_SAMPLE, FrontendMenuPermission.DATA_COEFFICIENT] },
  { key: 'labReport', label: '化验报告', permissions: [FrontendMenuPermission.LAB_REPORT_IMAGE_TEMPLATE, FrontendMenuPermission.LAB_REPORT_SMS_TEMPLATE] },
  { key: 'attendance', label: '员工考勤', permissions: [FrontendMenuPermission.ATTENDANCE_SCHEDULES, FrontendMenuPermission.ATTENDANCE_EMPLOYEES, FrontendMenuPermission.ATTENDANCE_RECORDS, FrontendMenuPermission.ATTENDANCE_LEAVE, FrontendMenuPermission.ATTENDANCE_COMPENSATION, FrontendMenuPermission.ATTENDANCE_PAYROLL] },
  { key: 'finance', label: '财务', permissions: [FrontendMenuPermission.FINANCE_EXPENSES, FrontendMenuPermission.FINANCE_INCOME, FrontendMenuPermission.FINANCE_UNSETTLED, FrontendMenuPermission.FINANCE_MONTHLY_SETTLEMENT, FrontendMenuPermission.FINANCE_PREPAID] },
  { key: 'reports', label: '报表', permissions: [FrontendMenuPermission.REPORTS] },
  { key: 'medicine', label: '药品库存', permissions: [FrontendMenuPermission.MEDICINE_STOCK, FrontendMenuPermission.MEDICINE_INBOUND, FrontendMenuPermission.MEDICINE_OUTBOUND] },
  { key: 'customerOverview', label: '客户总览', permissions: [FrontendMenuPermission.CUSTOMER_OVERVIEW] },
  { key: 'blacklist', label: '黑名单', permissions: [FrontendMenuPermission.BLACKLIST] },
] as const;

export const ALL_FRONTEND_MENU_PERMISSIONS = FRONTEND_MENU_PERMISSION_GROUPS.flatMap(
  (group) => [...group.permissions],
);
```

- [ ] **Step 6: Exclude workspace artifacts from root Vitest discovery**

Import `configDefaults` from `vitest/config` and configure:

```ts
exclude: [
  ...configDefaults.exclude,
  '.worktrees/**',
  '.pnpm-store/**',
  '.superpowers/**',
],
```

Keep the default exclusions so `node_modules` and build outputs remain ignored.

- [ ] **Step 7: Generate Prisma, validate, and confirm GREEN**

Run:

```bash
pnpm --dir server prisma:generate
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/yangshao?schema=public' pnpm --dir server exec prisma validate --schema prisma/schema.prisma
pnpm --dir server test -- src/auth/frontend-subaccounts.schema.test.ts
```

Expected: Prisma validation succeeds and the focused test passes.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260820000000_add_frontend_subaccounts/migration.sql server/src/auth/frontend-menu-permissions.ts server/src/auth/frontend-subaccounts.schema.test.ts vitest.config.ts
git commit -m "feat: add frontend subaccount permission schema"
```

---

### Task 2: Resolve actor identity, business owner, permissions, and session version

**Consumes:** Generated Prisma role/permission types from Task 1.

**Produces:** One `CurrentUser` contract used by HTTP auth, login responses, access grants, and lab-sheet SSE authentication.

**Files:**

- Modify: `server/src/auth/current-user.ts`
- Create: `server/src/auth/authenticated-user.service.ts`
- Create: `server/src/auth/authenticated-user.service.test.ts`
- Modify: `server/src/auth/auth.guard.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/auth/auth.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheet-stream-auth.service.ts`
- Create: `server/src/lab-sheets/lab-sheet-stream-auth.service.test.ts`

- [ ] **Step 1: Write failing identity-resolution tests**

Cover these exact cases in `authenticated-user.service.test.ts`:

```ts
it.each([
  ['FRONTEND_USER', null, 'main-1', ['DATA_MAIN', 'BLACKLIST']],
  ['FRONTEND_SUB_USER', 'main-1', 'main-1', ['DATA_MAIN']],
])('resolves %s actor and business owner', async (role, parentFrontendUserId, expectedOwner, storedPermissions) => {
  prisma.user.findUnique.mockResolvedValue({
    id: 'actor-1', account: 'actor', username: 'Actor', role,
    disabled: false, deletedAt: null, parentFrontendUserId, authVersion: 3,
    frontendSubAccountPermissions: storedPermissions.map((permission) => ({ permission })),
  });
  const user = await service.resolve('actor-1', 3);
  expect(user.id).toBe('actor-1');
  expect(user.frontendUserId).toBe(expectedOwner);
  expect(user.authVersion).toBe(3);
});

it('treats a legacy token without authVersion as version 1 only', async () => {
  prisma.user.findUnique.mockResolvedValue({
    id: 'main-1', account: 'main', username: 'Main', role: 'FRONTEND_USER',
    disabled: false, deletedAt: null, parentFrontendUserId: null, authVersion: 2,
    frontendSubAccountPermissions: [],
  });
  await expect(service.resolve('main-1', undefined)).rejects.toThrow('登录状态已失效');
});
```

Also test disabled actors, missing parents, subaccount chains, role/parent mismatches, and mismatched non-legacy token versions.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm --dir server test -- src/auth/authenticated-user.service.test.ts src/auth/auth.service.test.ts src/lab-sheets/lab-sheet-stream-auth.service.test.ts
```

Expected: FAIL because `AuthenticatedUserService`, expanded identity fields, and token versioning are missing.

- [ ] **Step 3: Define the expanded identity contract**

Replace the four-field interface with:

```ts
import { FrontendMenuPermission, UserRole } from '@prisma/client';

export interface CurrentUser {
  id: string;
  account: string;
  username: string;
  role: UserRole;
  frontendUserId: string;
  authVersion: number;
  permissions: FrontendMenuPermission[];
}

export interface JwtUserClaims {
  sub: string;
  authVersion?: number;
}
```

- [ ] **Step 4: Implement database-backed identity resolution**

`AuthenticatedUserService.resolve(userId, tokenAuthVersion)` must:

- reject missing or disabled users;
- accept a missing token version only when the database version is exactly `1`;
- reject version mismatches with `UnauthorizedException('登录状态已失效，请重新登录')`;
- resolve `FRONTEND_USER` to itself and `ALL_FRONTEND_MENU_PERMISSIONS`;
- resolve `FRONTEND_SUB_USER` only when its enabled parent is a `FRONTEND_USER`, using stored permission rows;
- reject parent chains and frontend/admin role-parent mismatches;
- leave admin identities owned by themselves with an empty frontend permission list.

Register and export `AuthenticatedUserService` from `AuthModule`, and mark `AuthModule` with `@Global()`. `AppModule` continues to import it exactly once. This lets `AuthGuard` resolve the same identity service when it is instantiated by controllers in finance, reports, blacklist, customers, reminders, uploads, medicine, and attendance modules without duplicating the resolver.

- [ ] **Step 5: Put `authVersion` in every newly signed JWT and return the expanded user**

Use this payload for login and access-token renewal:

```ts
const payload: JwtUserClaims = {
  sub: user.id,
  authVersion: user.authVersion,
};
```

Allow `FRONTEND_USER` and `FRONTEND_SUB_USER` in `/auth/login`, but keep `/auth/admin/login` limited to `ROOT_ADMIN` and `SUB_ADMIN`. Return the resolved `CurrentUser` in login and `/auth/me` responses.

- [ ] **Step 6: Reuse the resolver in HTTP and SSE authentication**

After JWT verification, both `AuthGuard` and `LabSheetStreamAuthService` call the same resolver. The SSE service must accept both frontend roles and return `CurrentUser`; the stream controller will use `frontendUserId` in Task 5.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run:

```bash
pnpm --dir server test -- src/auth/authenticated-user.service.test.ts src/auth/auth.service.test.ts src/lab-sheets/lab-sheet-stream-auth.service.test.ts
```

Expected: all identity, role, disabled-account, and version tests pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/auth/current-user.ts server/src/auth/authenticated-user.service.ts server/src/auth/authenticated-user.service.test.ts server/src/auth/auth.guard.ts server/src/auth/auth.service.ts server/src/auth/auth.controller.ts server/src/auth/auth.module.ts server/src/auth/auth.service.test.ts server/src/lab-sheets/lab-sheet-stream-auth.service.ts server/src/lab-sheets/lab-sheet-stream-auth.service.test.ts
git commit -m "feat: resolve frontend actor and owner identity"
```

---

### Task 3: Implement main-account-only child lifecycle APIs

**Consumes:** Actor/owner identity and permission catalog from Tasks 1–2.

**Produces:** The complete backend contract used by real and mock customer-front account management.

**Files:**

- Create: `server/src/auth/dto/create-frontend-subaccount.dto.ts`
- Create: `server/src/auth/dto/update-frontend-subaccount.dto.ts`
- Create: `server/src/auth/dto/set-frontend-subaccount-status.dto.ts`
- Create: `server/src/auth/dto/reset-frontend-subaccount-password.dto.ts`
- Create: `server/src/auth/frontend-subaccounts.service.ts`
- Create: `server/src/auth/frontend-subaccounts.service.test.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.test.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Create: `server/src/auth/auth.controller.test.ts`
- Modify: `server/src/auth/auth.module.ts`

- [ ] **Step 1: Write failing service tests for the full lifecycle**

Test the following cases before implementation:

- main lists only its direct children and never receives password hashes/ciphers;
- child callers receive `403 仅主账号可管理子账号`;
- create requires a globally unique account, username, password, and at least one valid permission;
- update changes username and the full permission set but cannot change account;
- permission replacement, enabled/disabled changes, password reset, and delete each increment `authVersion` in the same transaction;
- password reset fails unless the main account's current password verifies;
- cross-tenant IDs always return `404 子账号不存在`;
- delete soft-deletes and disables the child, preserves its permission/audit history, and never touches shared business data.
- create and reset store a password hash with `passwordCipher: null`; a child changing its own password also keeps `passwordCipher` null.
- both main and child self-password changes increment their own `authVersion` and invalidate the current token.

Use one contract fixture:

```ts
const mainUser = {
  id: 'main-1', account: 'main', username: 'Main', role: 'FRONTEND_USER',
  frontendUserId: 'main-1', authVersion: 1,
  permissions: ALL_FRONTEND_MENU_PERMISSIONS,
} as const;

const createInput = {
  account: 'cashier-a',
  username: '收款员A',
  password: 'ChildPass123!',
  confirmPassword: 'ChildPass123!',
  permissions: ['FINANCE_INCOME', 'FINANCE_UNSETTLED'],
} as const;
```

- [ ] **Step 2: Run service and controller tests and confirm RED**

Run:

```bash
pnpm --dir server test -- src/auth/frontend-subaccounts.service.test.ts src/auth/auth.controller.test.ts
```

Expected: FAIL because the DTOs, service, and routes do not exist.

- [ ] **Step 3: Define exact DTO validation**

Use `class-validator` and the generated permission enum:

```ts
export class CreateFrontendSubaccountDto {
  @IsString() @MinLength(1) @MaxLength(50) account!: string;
  @IsString() @MinLength(1) @MaxLength(50) username!: string;
  @IsString() @MinLength(6) @MaxLength(100) password!: string;
  @IsString() confirmPassword!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsEnum(FrontendMenuPermission, { each: true })
  permissions!: FrontendMenuPermission[];
}

export class UpdateFrontendSubaccountDto {
  @IsString() @MinLength(1) @MaxLength(50) username!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsEnum(FrontendMenuPermission, { each: true })
  permissions!: FrontendMenuPermission[];
}

export class SetFrontendSubaccountStatusDto {
  @IsBoolean() enabled!: boolean;
}

export class ResetFrontendSubaccountPasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(6) @MaxLength(100) newPassword!: string;
}
```

The service rejects create when `password !== confirmPassword` with `BadRequestException('两次输入的密码不一致')`. Do not forward `confirmPassword` to Prisma.

- [ ] **Step 4: Implement ownership-safe transactional service methods**

Expose these signatures:

```ts
list(main: CurrentUser): Promise<FrontendSubaccountView[]>;
create(main: CurrentUser, input: CreateFrontendSubaccountDto): Promise<FrontendSubaccountView>;
update(main: CurrentUser, childId: string, input: UpdateFrontendSubaccountDto): Promise<FrontendSubaccountView>;
setStatus(main: CurrentUser, childId: string, input: SetFrontendSubaccountStatusDto): Promise<FrontendSubaccountView>;
resetPassword(main: CurrentUser, childId: string, input: ResetFrontendSubaccountPasswordDto): Promise<void>;
remove(main: CurrentUser, childId: string): Promise<void>;
```

Every target query must include `{ id: childId, parentFrontendUserId: main.id, role: FRONTEND_SUB_USER, deletedAt: null }`. Create permission rows explicitly from the submitted set. Replace permissions with `deleteMany` plus `createMany` inside one transaction. Select only `id`, `account`, `username`, `disabled`, `createdAt`, and permission values, then expose `enabled: !disabled` in the response view. Keep `authVersion` internal to authentication and lifecycle transactions.

Creation writes `passwordHash` and explicitly sets `passwordCipher: null`. Reset writes the new hash, keeps `passwordCipher: null`, and increments `authVersion`. Soft delete atomically sets `deletedAt`, `disabled: true`, and increments `authVersion`; it does not call Prisma `delete` or remove permission rows.

Map validation and Prisma errors deliberately: duplicate account, empty/invalid permissions, password mismatch, and wrong main current password are `400`; a child caller is `403`; a missing, deleted, or cross-owner target is the same `404`. Catch Prisma `P2002` from concurrent create attempts and return `BadRequestException('账号已存在')` rather than exposing a database error. Wrong reset confirmation returns `BadRequestException('主账号当前密码不正确')`.

- [ ] **Step 5: Add the six main-only routes**

Add:

```text
GET    /auth/frontend-subaccounts
POST   /auth/frontend-subaccounts
PATCH  /auth/frontend-subaccounts/:id
PATCH  /auth/frontend-subaccounts/:id/status
POST   /auth/frontend-subaccounts/:id/reset-password
DELETE /auth/frontend-subaccounts/:id
```

Keep `AuthGuard` and a frontend-role guard on the controller. Enforce main-only status again inside the service so direct calls and future controllers cannot bypass it.

- [ ] **Step 6: Confirm GREEN**

Run:

```bash
pnpm --dir server test -- src/auth/frontend-subaccounts.service.test.ts src/auth/auth.controller.test.ts
```

Expected: all lifecycle, ownership, DTO, password, and invalidation cases pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/auth/dto server/src/auth/frontend-subaccounts.service.ts server/src/auth/frontend-subaccounts.service.test.ts server/src/auth/auth.service.ts server/src/auth/auth.service.test.ts server/src/auth/auth.controller.ts server/src/auth/auth.controller.test.ts server/src/auth/auth.module.ts
git commit -m "feat: add frontend subaccount lifecycle APIs"
```

---

### Task 4: Add the centralized frontend menu-permission guard

**Consumes:** `CurrentUser.permissions` from Task 2.

**Produces:** Reusable route metadata, an OR-semantics authorizer, and a guard for all customer-facing APIs, including manual checks for SSE and body-dependent endpoints.

**Files:**

- Create: `server/src/auth/frontend-permission.decorator.ts`
- Create: `server/src/auth/frontend-permission.authorizer.ts`
- Create: `server/src/auth/frontend-permission.authorizer.test.ts`
- Create: `server/src/auth/frontend-permission.guard.ts`
- Create: `server/src/auth/frontend-permission.guard.test.ts`

- [ ] **Step 1: Write failing guard tests**

Cover the authorizer and guard for main-account implicit access, child exact access, child OR access, child denial, child denial when metadata is absent, and unchanged admin behavior:

```ts
it.each([
  ['FRONTEND_USER', [], ['DATA_MAIN'], true],
  ['FRONTEND_SUB_USER', ['DATA_MAIN'], ['DATA_MAIN'], true],
  ['FRONTEND_SUB_USER', ['BLACKLIST'], ['DATA_MAIN', 'BLACKLIST'], true],
  ['FRONTEND_SUB_USER', ['BLACKLIST'], ['DATA_MAIN'], false],
  ['ROOT_ADMIN', [], [], true],
  ['SUB_ADMIN', [], [], true],
])('authorizes %s with OR semantics', (role, granted, required, allowed) => {
  reflector.getAllAndOverride.mockReturnValue(required);
  const context = contextFor({ role, permissions: granted });
  if (allowed) {
    expect(guard.canActivate(context)).toBe(true);
  } else {
    expect(() => guard.canActivate(context)).toThrow('无权访问该功能');
  }
});

it('denies a frontend child when a route has no permission metadata', () => {
  reflector.getAllAndOverride.mockReturnValue(undefined);
  expect(() => guard.canActivate(contextFor({
    role: 'FRONTEND_SUB_USER', permissions: ['DATA_MAIN'],
  }))).toThrow('无权访问该功能');
});
```

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
pnpm --dir server test -- src/auth/frontend-permission.authorizer.test.ts src/auth/frontend-permission.guard.test.ts
```

Expected: FAIL because the decorator and guard are missing.

- [ ] **Step 3: Implement exact metadata and guard behavior**

Use a single metadata key and an explicit decorator:

```ts
export const FRONTEND_PERMISSIONS_KEY = 'frontend-menu-permissions';

export const FrontendPermission = (...permissions: FrontendMenuPermission[]) =>
  SetMetadata(FRONTEND_PERMISSIONS_KEY, permissions);
```

Implement the pure function `assertFrontendPermission(user, required)` as the single authorization decision. `ROOT_ADMIN`, `SUB_ADMIN`, and `FRONTEND_USER` pass. `FRONTEND_SUB_USER` must receive a non-empty requirement and own at least one required permission. Denials throw `ForbiddenException('无权访问该功能')`.

The guard reads handler then class metadata and delegates to this authorizer. SSE token flows and endpoints whose required leaf depends on the validated request body call the same function directly; do not copy the decision logic or add module-scoped dependency injection for this stateless decision.

- [ ] **Step 4: Confirm GREEN**

Run:

```bash
pnpm --dir server test -- src/auth/frontend-permission.authorizer.test.ts src/auth/frontend-permission.guard.test.ts
```

Expected: all role and OR-semantics cases pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/frontend-permission.decorator.ts server/src/auth/frontend-permission.authorizer.ts server/src/auth/frontend-permission.authorizer.test.ts server/src/auth/frontend-permission.guard.ts server/src/auth/frontend-permission.guard.test.ts
git commit -m "feat: enforce frontend leaf permissions"
```

---

### Task 5: Apply owner identity and permissions to data, reports, customer, blacklist, reminders, uploads, and SSE

**Consumes:** Permission decorator/guard and actor/owner identity from Tasks 2 and 4.

**Produces:** Shared business data with per-page authorization for non-finance customer APIs and real-time lab updates.

**Files:**

- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Create: `server/src/lab-sheets/dto/coefficient-application.dto.ts`
- Modify: `server/src/lab-sheets/lab-sheets-stream.controller.ts`
- Create: `server/src/lab-sheets/lab-sheets-stream.controller.test.ts`
- Modify: `server/src/customers/customers.controller.ts`
- Create: `server/src/customers/customers.controller.test.ts`
- Modify: `server/src/reports/reports.controller.ts`
- Create: `server/src/reports/reports.controller.test.ts`
- Modify: `server/src/blacklist/blacklist.controller.ts`
- Create: `server/src/blacklist/blacklist.controller.test.ts`
- Modify: `server/src/blacklist/blacklist.service.ts`
- Create: `server/src/blacklist/blacklist.service.test.ts`
- Modify: `server/src/reminders/reminders.controller.ts`
- Create: `server/src/reminders/reminders.controller.test.ts`
- Modify: `server/src/reminders/reminders.service.ts`
- Create: `server/src/reminders/reminders.service.test.ts`
- Modify: `server/src/uploads/uploads.controller.ts`
- Create: `server/src/uploads/uploads.controller.test.ts`
- Modify: `src/types/blacklist.ts`
- Modify: `src/components/blacklist/BlacklistTable.vue`
- Modify: `src/components/blacklist/BlacklistTable.test.ts`
- Modify: `src/views/dashboard/BlacklistPage.vue`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/db.test.ts`
- Create: `src/api/coefficientApplication.ts`
- Create: `src/api/coefficientApplication.test.ts`
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts`

- [ ] **Step 1: Write failing owner/actor and permission-metadata tests**

For every modified controller, use a child fixture whose actor differs from its owner:

```ts
const childUser = {
  id: 'child-1', account: 'operator', username: '操作员',
  role: 'FRONTEND_SUB_USER', frontendUserId: 'main-1', authVersion: 1,
  permissions: ['DATA_MAIN'],
} as const;

it('queries shared data by owner and records the child as actor', async () => {
  await controller.saveBlock(
    childUser, 'sheet-1', { index: 1, customerText: '测试客户' }, 'client-1',
  );
  expect(service.saveSampleBlock).toHaveBeenCalledWith(
    'main-1', 'child-1', 'sheet-1',
    { index: 1, customerText: '测试客户' }, 'client-1', true,
  );
});
```

Add reflection tests for this exact mapping:

| Controller surface | Required leaf permission |
|---|---|
| Existing lab-sheet HTTP handlers and SSE | `DATA_MAIN` |
| Dedicated coefficient application GET/PUT endpoints | `DATA_COEFFICIENT` |
| Customer lookup used by calculation | `DATA_MAIN` |
| Report sample-detection, finance, and categories handlers | `REPORTS` |
| `GET /reports/customer-overview` | `CUSTOMER_OVERVIEW` |
| Blacklist list/write | `BLACKLIST` |
| Blacklist match/check used by calculation | `DATA_MAIN` OR `BLACKLIST` |
| Reminders | OR of `FINANCE_UNSETTLED`, `FINANCE_MONTHLY_SETTLEMENT`, `FINANCE_EXPENSES`, and `FINANCE_PREPAID`, followed by type-aware filtering |
| `POST /uploads/images` | `FINANCE_EXPENSES` for frontend roles; existing admin roles continue to bypass frontend permissions |

`DATA_STANDARD_SAMPLE`, `LAB_REPORT_IMAGE_TEMPLATE`, and `LAB_REPORT_SMS_TEMPLATE` are frontend-only leaves. `DATA_COEFFICIENT` is server-backed through dedicated application endpoints; it must not authorize the full current-sheet endpoint.

- [ ] **Step 2: Run focused controller/service tests and confirm RED**

Run:

```bash
pnpm --dir server test -- src/lab-sheets/lab-sheets.controller.test.ts src/lab-sheets/lab-sheets.service.test.ts src/lab-sheets/lab-sheets-stream.controller.test.ts src/customers/customers.controller.test.ts src/reports/reports.controller.test.ts src/blacklist/blacklist.controller.test.ts src/blacklist/blacklist.service.test.ts src/reminders/reminders.controller.test.ts src/reminders/reminders.service.test.ts src/uploads/uploads.controller.test.ts
./node_modules/.bin/vitest run src/api/coefficientApplication.test.ts src/views/dashboard/CoefficientCalculationPage.test.ts src/components/blacklist/BlacklistTable.test.ts src/mocks/db.test.ts
```

Expected: failures show owner calls still use the actor ID and permission metadata is absent.

- [ ] **Step 3: Separate lab-sheet owner and actor arguments**

Change mutating service signatures to accept owner then actor, for example:

```ts
saveSampleBlock(
  frontendUserId: string,
  actorUserId: string,
  sheetId: string,
  block: Record<string, unknown>,
  sourceClientId: string | undefined,
  includeCompletedValues: boolean,
): Promise<LabSheetView>;
```

All tenant queries, change broadcasts, and stream channel keys use `frontendUserId`. Existing audit/history fields that represent the person making a change use `actorUserId`. Read methods receive only `frontendUserId`.

Add `GET /lab-sheets/coefficient-application` returning only `{ date, readonly, sampleIndices }` and `PUT /lab-sheets/coefficient-application` accepting validated `{ parameters, startIndex }` and returning only `{ date, appliedFromIndex, updatedAt }`. Both use `DATA_COEFFICIENT`, the main owner ID, and the existing transactional parameter-application logic. Update `CoefficientCalculationPage.vue` to use this adapter instead of loading the full lab sheet or opening an SSE stream. A coefficient-only child must receive `403` from `/lab-sheets/current`, and neither dedicated response may contain sample inputs, results, customers, payment data, or prices.

- [ ] **Step 4: Update controllers and add guard ordering**

Customer HTTP controllers use:

```ts
@UseGuards(AuthGuard, RolesGuard, FrontendPermissionGuard)
@Roles(UserRole.FRONTEND_USER, UserRole.FRONTEND_SUB_USER)
```

Add the permissions from the mapping table at class or handler level. Pass `user.frontendUserId` to ownership filters and `user.id` only to true actor/audit parameters.

For blacklist records, preserve the existing global search/check visibility and record the real actor in `uploadedById`. Treat a record as manageable by the main account group when its uploader is either `frontendUserId` itself or a `FRONTEND_SUB_USER` whose `parentFrontendUserId` equals that owner. Update/delete use this relation predicate, so a main or authorized sibling can manage group records but another main account cannot. Return a computed `canManage` boolean and make `BlacklistTable.vue` use it instead of comparing the uploader name with the current username; remove the obsolete `currentUsername` prop from `BlacklistPage.vue`. Update the mock blacklist DTOs with the same field. This preserves truthful uploader display, shared group operations, and historical rows without a new blacklist migration. For the customer-overview report, call `getRows([user.frontendUserId])`, while all report data queries use the same owner ID.

Reminder reads are permission-filtered inside `RemindersService`: `UNSETTLED_PAYMENT` requires `FINANCE_UNSETTLED`, `MONTHLY_PAYMENT` requires `FINANCE_MONTHLY_SETTLEMENT`, and deletion-approved/rejected reminders look up their `FinanceDeletionRequest.sourceType` so `EXPENSE` requires `FINANCE_EXPENSES` while `PREPAID_RECHARGE` requires `FINANCE_PREPAID`. `markRead` applies the same rule and cannot mark a hidden reminder. Main accounts implicitly see all owner reminders.

- [ ] **Step 5: Key SSE authentication and subscriptions by the main owner**

After token resolution, the stream controller calls `assertFrontendPermission(currentUser, [DATA_MAIN])` and subscribes with `currentUser.frontendUserId`. Adding metadata alone is insufficient because this SSE route performs query-token authentication instead of `AuthGuard`. Verify a main session and its data-authorized child session receive the same owner's events, while a coefficient-only child and another main account do not.

- [ ] **Step 6: Confirm GREEN**

Run the focused command from Step 2 again.

Expected: all owner/actor and metadata cases pass; main and child share lab streams.

- [ ] **Step 7: Commit**

```bash
git add server/src/lab-sheets server/src/customers server/src/reports server/src/blacklist server/src/reminders server/src/uploads src/api/coefficientApplication.ts src/api/coefficientApplication.test.ts src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts src/types/blacklist.ts src/components/blacklist/BlacklistTable.vue src/components/blacklist/BlacklistTable.test.ts src/views/dashboard/BlacklistPage.vue src/mocks/db.ts src/mocks/db.test.ts
git commit -m "feat: scope core frontend APIs by owner and permission"
```

---

### Task 6: Apply owner identity and leaf permissions to finance and medicine inventory

**Consumes:** Shared guard and owner identity.

**Produces:** Fine-grained server enforcement across finance and inventory while preserving existing admin routes.

**Files:**

- Modify: `server/src/finance/finance.controller.ts`
- Create: `server/src/finance/finance.controller.test.ts`
- Modify: `server/src/finance/finance.service.ts`
- Modify: `server/src/finance/finance.service.test.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.controller.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.controller.test.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.service.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.service.test.ts`

- [ ] **Step 1: Add failing permission-matrix and ownership tests**

Assert this exact finance mapping:

```ts
const financePermissionCases = [
  ['listEntries', 'FINANCE_EXPENSES'],
  ['createEntry', 'FINANCE_EXPENSES'],
  ['listMonths', 'FINANCE_EXPENSES'],
  ['incomeBills', 'FINANCE_INCOME'],
  ['unsettledSamples', 'FINANCE_UNSETTLED'],
  ['markSamplesPaid', 'FINANCE_UNSETTLED'],
  ['markPaid', 'FINANCE_UNSETTLED'],
  ['monthlySettlements', 'FINANCE_MONTHLY_SETTLEMENT'],
  ['updateMonthlySettlement', 'FINANCE_MONTHLY_SETTLEMENT'],
  ['prepaidRecharges', 'FINANCE_PREPAID'],
  ['createPrepaidRecharge', 'FINANCE_PREPAID'],
  ['prepaidReport', 'FINANCE_PREPAID'],
  ['updatePrepaidCustomerRemark', 'FINANCE_PREPAID'],
  ['updatePrepaidUsageRemark', 'FINANCE_PREPAID'],
] as const;
```

`createDeletionRequest` carries OR metadata for coverage, then calls `assertFrontendPermission` with exactly `FINANCE_EXPENSES` when `body.type === 'EXPENSE'` and exactly `FINANCE_PREPAID` when `body.type === 'PREPAID_RECHARGE'`. Reject any other request type during DTO validation. This body-aware assertion prevents a child with expense-only access from submitting a prepaid deletion request, or the reverse.

Assert this medicine mapping:

| Surface | Permission |
|---|---|
| `items` | OR of all three medicine permissions |
| `commonNames`, `createCommonName`, `deleteCommonName` | `MEDICINE_INBOUND` |
| inbound records and writes | `MEDICINE_INBOUND` |
| outbound records and writes | `MEDICINE_OUTBOUND` |
| `createCorrection` | `MEDICINE_INBOUND` OR `MEDICINE_OUTBOUND` |

Every child call must pass `frontendUserId = main-1` into the service, never `child-1`.

- [ ] **Step 2: Run and confirm RED**

Run:

```bash
pnpm --dir server test -- src/finance/finance.controller.test.ts src/finance/finance.service.test.ts src/medicine-inventory/medicine-inventory.controller.test.ts src/medicine-inventory/medicine-inventory.service.test.ts
```

Expected: controller metadata and owner assertions fail.

- [ ] **Step 3: Apply permissions only to customer controller handlers**

Keep admin controllers and `ROOT_ADMIN`/`SUB_ADMIN` query paths unchanged. Add frontend permissions to customer-facing handlers and change their service arguments to `user.frontendUserId`. Pass `user.id` only where an existing field is explicitly an audit actor rather than a tenant owner.

- [ ] **Step 4: Verify cross-tenant isolation at the service boundary**

Add service tests proving a child of `main-1` can read and modify `main-1` rows, cannot target `main-2` rows through submitted IDs, and all create operations persist `frontendUserId: 'main-1'`.

- [ ] **Step 5: Confirm GREEN**

Run the focused command from Step 2 again.

Expected: the exact permission matrix, shared-owner behavior, and admin non-regression pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/finance server/src/medicine-inventory
git commit -m "feat: protect finance and inventory leaf APIs"
```

---

### Task 7: Apply owner/actor identity and six leaf permissions to attendance

**Consumes:** `CurrentUser.id`, `CurrentUser.frontendUserId`, and the menu guard.

**Produces:** Shared attendance data with independent schedule, employee, record, leave, compensation, and payroll authorization.

**Files:**

- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.test.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.test.ts`
- Create: `server/src/auth/frontend-permission-coverage.test.ts`

- [ ] **Step 1: Write failing attendance matrix tests**

Test these handler groups:

```ts
const attendanceGroups = {
  ATTENDANCE_SCHEDULES: [
    'listWeeklySchedules', 'createWeeklySchedule', 'updateWeeklySchedule',
    'deleteWeeklySchedule', 'listDateOverrides', 'createDateOverride',
    'updateDateOverride', 'deleteDateOverride', 'listMonthlySettings',
    'createMonthlySetting', 'deleteMonthlySetting', 'listMonthlySchedules',
    'scheduleAttendanceOverview', 'saveMonthlyScheduleDay',
    'deleteMonthlyScheduleDay', 'batchSaveMonthlySchedules',
    'copyPreviousMonthSchedules',
  ],
  ATTENDANCE_EMPLOYEES: [
    'getEmployee', 'revealEmployee', 'createEmployee', 'updateEmployee',
    'deleteEmployee', 'uploadPhoto', 'readPhoto',
  ],
  ATTENDANCE_RECORDS: [
    'listAttendance', 'createAttendance', 'createAttendanceGeneration',
    'updateAttendance', 'deleteAttendance',
  ],
  ATTENDANCE_LEAVE: [
    'listLeaveTypes', 'createLeaveType', 'updateLeaveType', 'deleteLeaveType',
    'listLeaveRequests', 'createLeaveRequest', 'updateLeaveRequest',
    'deleteLeaveRequest', 'approveLeave', 'rejectLeave',
  ],
  ATTENDANCE_COMPENSATION: [
    'listCommissionTypes', 'createCommissionType', 'updateCommissionType',
    'deleteCommissionType', 'listCommissionRecords', 'createCommissionRecord',
    'updateCommissionRecord', 'deleteCommissionRecord', 'listBonuses',
    'createBonus', 'updateBonus', 'deleteBonus', 'compensationTotals',
  ],
  ATTENDANCE_PAYROLL: [
    'overview', 'generatePayroll', 'getPayroll', 'createPayrollAdjustment',
    'updatePayrollAdjustment', 'deletePayrollAdjustment', 'confirmPayroll',
    'reopenPayroll',
  ],
} as const;
```

`listEmployees` is a shared selector read, so it receives the OR of all six attendance permissions. When the child lacks `ATTENDANCE_EMPLOYEES`, return only `id`, `employeeNumber`, `name`, and `status`; do not expose the full employee archive through a selector needed by schedules, records, leave, compensation, or payroll. Main accounts and children with `ATTENDANCE_EMPLOYEES` keep the existing full response. `getEmployee` remains employee-archive-only. This fixed selector projection is an API-boundary safeguard, not a configurable field-level permission. Every mutation that already accepts owner and operator arguments must be asserted in `(frontendUserId, id)` order with a child fixture.

- [ ] **Step 2: Run attendance tests and confirm RED**

Run:

```bash
pnpm --dir server test -- src/employee-attendance/employee-attendance.controller.test.ts src/employee-attendance/employee-attendance.service.test.ts
```

Expected: owner/actor and metadata assertions fail.

- [ ] **Step 3: Annotate all attendance handlers**

Add the six permissions according to the matrix. Shared lookup data that is required by multiple attendance pages uses an explicit OR decorator containing only the consuming attendance leaves.

- [ ] **Step 4: Correct owner and actor service calls**

Tenant reads/writes use `user.frontendUserId`. Employee-change, payroll-change, and schedule-change actor arguments use `user.id`. Existing transaction, SSE, payroll-quota, and calendar behaviors remain unchanged.

- [ ] **Step 5: Add a fail-closed customer-route coverage test**

Create `frontend-permission-coverage.test.ts` that enumerates these customer controllers:

```ts
const customerControllerTypes = [
  LabSheetsController,
  LabSheetsStreamController,
  CustomersController,
  ReportsController,
  BlacklistController,
  RemindersController,
  UploadsController,
  FinanceController,
  MedicineInventoryController,
  EmployeeAttendanceController,
] as const;
```

For every routed handler reachable by `FRONTEND_USER` or `FRONTEND_SUB_USER`, assert `FRONTEND_PERMISSIONS_KEY` resolves to a non-empty list. Maintain a separate explicit list of admin-only handlers and assert their role metadata excludes `FRONTEND_SUB_USER`.

Build a server-backed permission matrix from the discovered metadata. For each permission except the three explicitly frontend-only leaves (`DATA_STANDARD_SAMPLE`, `LAB_REPORT_IMAGE_TEMPLATE`, `LAB_REPORT_SMS_TEMPLATE`), prove a child holding that permission passes at least one corresponding handler and a child holding a different single permission is denied. This complements the complete 22-leaf router matrix in Task 9.

- [ ] **Step 6: Run all affected server permission tests and confirm GREEN**

Run:

```bash
pnpm --dir server test -- src/employee-attendance/employee-attendance.controller.test.ts src/employee-attendance/employee-attendance.service.test.ts src/auth/frontend-permission-coverage.test.ts
```

Expected: all attendance groups and all customer route coverage checks pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/employee-attendance server/src/auth/frontend-permission-coverage.test.ts
git commit -m "feat: protect attendance leaf APIs"
```

---

### Task 8: Preserve access-password protection as an independent second gate

**Consumes:** Actor/owner identity and menu authorization.

**Produces:** Sanitized child challenges, actor-bound grants, centralized server enforcement, and client challenge support without exposing group secrets.

**Files:**

- Create: `server/src/auth/access-guard.decorator.ts`
- Create: `server/src/auth/access-guard.guard.ts`
- Create: `server/src/auth/access-guard.guard.test.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.test.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.controller.test.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/finance/finance.controller.ts`
- Modify: `server/src/reports/reports.controller.ts`
- Modify: `server/src/blacklist/blacklist.controller.ts`
- Modify: `server/src/reminders/reminders.controller.ts`
- Modify: `server/src/medicine-inventory/medicine-inventory.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/lab-sheets/lab-sheets.controller.ts`
- Modify: `src/types/auth.ts`
- Create: `src/types/accessGuard.ts`
- Modify: `src/api/accessGuard.ts`
- Modify: `src/api/accessGuard.sessions.test.ts`
- Create: `src/utils/accessGuardSession.ts`
- Modify: `src/utils/request.ts`
- Create: `src/utils/request.accessGuard.test.ts`
- Modify: `src/stores/accessGuard.ts`
- Modify: `src/stores/accessGuard.test.ts`

- [ ] **Step 1: Write failing token-binding and sanitized-response tests**

Cover these exact rules:

- `GET /auth/access-groups` remains main-only and may return full settings needed for management;
- the legacy `GET/PATCH /auth/access-guard` settings and all access-group create/update/delete operations reject child callers;
- `GET /auth/access-challenges` returns only `id`, `name`, `ttlMinutes`, enabled state, protected features, and `grantVersion`;
- a child verifies a password against its parent's group;
- the signed grant includes actor ID, owner ID, actor `authVersion`, group ID/version, allowed features, and expiry;
- a grant is rejected after the actor's version changes, after the group version changes, when used by another actor, or when used under another owner;
- a valid menu permission without a valid required access grant returns `403 需要访问验证`;
- a valid access grant without the leaf permission still fails in `FrontendPermissionGuard`.
- after browser verification, finance, reports, blacklist, medicine, customer-overview, and attendance API requests carry the matching `X-YS-Access-Grant` header.

Use this exact grant contract:

```ts
interface AccessGrantClaims {
  sub: string;
  frontendUserId: string;
  authVersion: number;
  groupId: string;
  groupVersion: number;
  features: AccessGuardFeature[];
  exp: number;
}
```

- [ ] **Step 2: Run server and client access-guard tests and confirm RED**

Run:

```bash
pnpm --dir server test -- src/auth/access-guard.guard.test.ts src/auth/auth.service.test.ts src/auth/auth.controller.test.ts
./node_modules/.bin/vitest run src/api/accessGuard.sessions.test.ts src/utils/request.accessGuard.test.ts src/stores/accessGuard.test.ts
```

Expected: sanitized challenge endpoint, owner/version binding, and reusable server guard are missing.

- [ ] **Step 3: Add sanitized child challenges and identity-aware verification**

Expose:

```text
GET  /auth/access-challenges
POST /auth/access-groups/:id/verify
```

The verify route remains shared, but resolves group ownership through `user.frontendUserId`. Main-only checks live in `AuthService` as well as controller role metadata. Never serialize group passwords, recovery prompts/answers, `passwordCipher`, password hashes, or other management-only fields from the challenge endpoint. Implement the same sanitized challenge and main-only behavior in `useMocks` mode, with mock group storage namespaced by `frontendUserId` so a main and its child share groups while another main account cannot see or verify them. Mock grants carry the same actor ID, owner ID, actor version, group version, feature, and expiry claims. Export `assertMockAccessGrant(feature)` here; Task 10 applies it to the protected mock API adapters so they reject stale or cross-actor grants instead of relying only on the route dialog.

- [ ] **Step 4: Centralize the access-password server guard**

Define:

```ts
export const ACCESS_GUARD_FEATURE_KEY = 'access-guard-feature';

export interface AccessGuardRequirement {
  feature: AccessGuardFeature;
  alwaysRequire: boolean;
}

export const RequiresAccessGuard = (
  feature: AccessGuardFeature,
  alwaysRequire = false,
) => SetMetadata(ACCESS_GUARD_FEATURE_KEY, { feature, alwaysRequire });
```

The guard reads `X-YS-Access-Grant`, calls `AuthService.assertAccessGrant(user, token, feature, alwaysRequire)`, and runs after authentication and menu permission. Register/export it from the global `AuthModule` established in Task 2, so its `AuthService` dependency resolves consistently. Use `alwaysRequire = true` only on currently sensitive reveal endpoints.

- [ ] **Step 5: Annotate the existing protected server surfaces**

Apply existing `AccessGuardFeature` values as follows:

| Server surface | Access feature |
|---|---|
| Finance | `FINANCE` |
| Reminders | `FINANCE` |
| Reports | `REPORTS` |
| Blacklist | `BLACKLIST` |
| Medicine inventory | `MEDICINE_INVENTORY` |
| Customer overview | `CUSTOMER_OVERVIEW` |
| Attendance | `EMPLOYEE_ATTENDANCE` |
| Historical-date lab operations | `HISTORICAL_DATES` |
| Completed-sample restricted fields | `COMPLETED_SAMPLE_DATA` |

Keep conditional field masking where a whole-route guard would change existing semantics; update those service checks to pass the full `CurrentUser` identity instead of only `user.id`.

- [ ] **Step 6: Expand the frontend auth identity, then split main settings from child challenges**

Before branching the access store by role, add the exact permission and identity contract:

```ts
export const FRONTEND_MENU_PERMISSIONS = [
  'DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT',
  'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE',
  'ATTENDANCE_SCHEDULES', 'ATTENDANCE_EMPLOYEES', 'ATTENDANCE_RECORDS',
  'ATTENDANCE_LEAVE', 'ATTENDANCE_COMPENSATION', 'ATTENDANCE_PAYROLL',
  'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED',
  'FINANCE_MONTHLY_SETTLEMENT', 'FINANCE_PREPAID', 'REPORTS',
  'MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND',
  'CUSTOMER_OVERVIEW', 'BLACKLIST',
] as const;

export type FrontendMenuPermission = typeof FRONTEND_MENU_PERMISSIONS[number];

export interface AuthUser {
  id: string;
  account: string;
  username: string;
  role: 'ROOT_ADMIN' | 'SUB_ADMIN' | 'FRONTEND_USER' | 'FRONTEND_SUB_USER';
  frontendUserId: string;
  authVersion: number;
  permissions: FrontendMenuPermission[];
}
```

This is the first frontend consumer of the expanded identity; Task 9 reuses the same contract for navigation.

Use sanitized types:

```ts
export interface AccessGuardChallenge {
  id: string;
  name: string;
  ttlMinutes: number;
  enabled: boolean;
  grantVersion: number;
  features: AccessGuardFeature[];
}
```

Main accounts load settings; child accounts load challenges. Both can submit verification and cache grants by feature, but only mains receive or call settings mutation/recovery APIs.

- [ ] **Step 7: Attach the matching grant to protected API requests**

Move session parsing/selection into `src/utils/accessGuardSession.ts` so `src/utils/request.ts` can use it without importing the API module that imports Axios. Map URL prefixes in this order: `/reports/customer-overview` to `CUSTOMER_OVERVIEW`, then `/reports` to `REPORTS`, `/finance` and `/reminders` to `FINANCE`, `/blacklist` to `BLACKLIST`, `/medicine-inventory` to `MEDICINE_INVENTORY`, and `/employee-attendance` to `EMPLOYEE_ATTENDANCE`. Preserve the specialized lab-sheet helper for `COMPLETED_SAMPLE_DATA` and historical-date behavior. The request interceptor adds the header only when a non-expired matching session exists.

- [ ] **Step 8: Confirm both gates pass independently**

Run the command from Step 2 again, `src/utils/request.accessGuard.test.ts`, and the affected controller tests from Tasks 5–7.

Expected: server and frontend tests prove the full matrix: menu only fails, access grant only fails, both succeed.

- [ ] **Step 9: Commit**

```bash
git add server/src/auth server/src/finance server/src/reports server/src/blacklist server/src/reminders server/src/medicine-inventory server/src/employee-attendance server/src/lab-sheets src/types/auth.ts src/types/accessGuard.ts src/api/accessGuard.ts src/api/accessGuard.sessions.test.ts src/utils/accessGuardSession.ts src/utils/request.ts src/utils/request.accessGuard.test.ts src/stores/accessGuard.ts src/stores/accessGuard.test.ts
git commit -m "feat: bind access grants to frontend actors"
```

---

### Task 9: Build one frontend menu catalog and enforce permissions in navigation and routing

**Consumes:** Expanded `/auth/login` and `/auth/me` user contract.

**Produces:** A single source of truth for the visible menu, login landing route, direct-route protection, and first allowed redirect.

**Files:**

- Create: `src/config/frontendMenu.ts`
- Create: `src/config/frontendMenu.test.ts`
- Create: `src/config/frontendMenu.server-contract.test.ts`
- Modify: `src/stores/auth.ts`
- Create: `src/stores/auth.test.ts`
- Modify: `src/components/layout/AppSidebar.vue`
- Create: `src/components/layout/AppSidebar.test.ts`
- Modify: `src/views/dashboard/LabReportPage.vue`
- Create: `src/views/dashboard/LabReportPage.test.ts`
- Modify: `src/router/index.ts`
- Modify: `src/router/guards.ts`
- Modify: `src/router/guards.test.ts`
- Modify: `src/views/auth/LoginRegister.vue`
- Create: `src/views/auth/LoginRegister.test.ts`

- [ ] **Step 1: Write failing catalog, sidebar, and redirect tests**

Assert the catalog has exactly 22 unique permissions, those keys exactly match the Prisma `FrontendMenuPermission` enum, and every routed leaf carries its permission. Add these navigation cases:

```ts
it.each([
  [['FINANCE_INCOME'], '/finance/income'],
  [['ATTENDANCE_PAYROLL'], '/employee-attendance/payroll'],
  [['BLACKLIST'], '/blacklist'],
  [[], null],
])('selects the first permitted leaf', (permissions, expected) => {
  expect(firstAllowedFrontendPath(permissions)).toBe(expected);
});

it('redirects a child away from a forbidden direct URL', () => {
  const result = resolveFrontendPermissionRedirect(
    { role: 'FRONTEND_SUB_USER', permissions: ['FINANCE_INCOME'] },
    '/data',
  );
  expect(result).toBe('/finance/income');
});

it('reports a forbidden direct URL before redirecting', () => {
  const onDenied = vi.fn();
  resolveFrontendPermissionRedirect(
    { role: 'FRONTEND_SUB_USER', permissions: ['FINANCE_INCOME'] },
    '/data',
    onDenied,
  );
  expect(onDenied).toHaveBeenCalledWith('当前账号无访问权限');
});

it('returns the dedicated empty state when no leaf is available', () => {
  expect(resolveFrontendPermissionRedirect(
    { role: 'FRONTEND_SUB_USER', permissions: [] },
    '/data',
  )).toBe('/no-permission');
});
```

Also parameterize over all 22 leaves: a child with exactly the leaf permission may enter every `routePath` assigned to that leaf, while a child with the previous catalog permission is denied and redirected. This is the authoritative frontend allow/deny matrix, including the three frontend-only leaves.

Test that selecting a first-level node grants all current children, deselecting one leaf makes the parent indeterminate, and an unknown future permission is not inferred from parent selection.

- [ ] **Step 2: Run focused frontend tests and confirm RED**

Run:

```bash
./node_modules/.bin/vitest run src/config/frontendMenu.test.ts src/config/frontendMenu.server-contract.test.ts src/stores/auth.test.ts src/components/layout/AppSidebar.test.ts src/views/dashboard/LabReportPage.test.ts src/router/guards.test.ts src/views/auth/LoginRegister.test.ts
```

Expected: FAIL because the catalog, user permissions, and dynamic redirect do not exist.

- [ ] **Step 3: Verify and reuse the browser permission and identity types**

Task 8 establishes this exact contract; verify the catalog imports it rather than declaring a second permission union:

```ts
export const FRONTEND_MENU_PERMISSIONS = [
  'DATA_MAIN', 'DATA_STANDARD_SAMPLE', 'DATA_COEFFICIENT',
  'LAB_REPORT_IMAGE_TEMPLATE', 'LAB_REPORT_SMS_TEMPLATE',
  'ATTENDANCE_SCHEDULES', 'ATTENDANCE_EMPLOYEES', 'ATTENDANCE_RECORDS',
  'ATTENDANCE_LEAVE', 'ATTENDANCE_COMPENSATION', 'ATTENDANCE_PAYROLL',
  'FINANCE_EXPENSES', 'FINANCE_INCOME', 'FINANCE_UNSETTLED',
  'FINANCE_MONTHLY_SETTLEMENT', 'FINANCE_PREPAID', 'REPORTS',
  'MEDICINE_STOCK', 'MEDICINE_INBOUND', 'MEDICINE_OUTBOUND',
  'CUSTOMER_OVERVIEW', 'BLACKLIST',
] as const;

export type FrontendMenuPermission = typeof FRONTEND_MENU_PERMISSIONS[number];

export interface AuthUser {
  id: string;
  account: string;
  username: string;
  role: 'ROOT_ADMIN' | 'SUB_ADMIN' | 'FRONTEND_USER' | 'FRONTEND_SUB_USER';
  frontendUserId: string;
  authVersion: number;
  permissions: FrontendMenuPermission[];
}
```

Remove legacy lowercase role aliases from live auth decisions; isolate compatibility parsing at the mock/session boundary if an existing fixture still needs it.

- [ ] **Step 4: Create the exact menu tree**

Each leaf contains `key`, label, navigation `path`, all accepted `routePaths`, icon key, permission, and optional `AccessGuardFeature`. First-level groups contain only current leaf objects. `FINANCE_PREPAID`, for example, uses navigation path `/finance/prepaid` and route paths `/finance/prepaid`, `/finance/prepaid/add`, and `/finance/prepaid/customers`. `DATA_STANDARD_SAMPLE`, `LAB_REPORT_IMAGE_TEMPLATE`, and `LAB_REPORT_SMS_TEMPLATE` are explicitly flagged `serverMode: 'frontend-only'`; every other leaf is `serverMode: 'guarded-api'`.

Use this exact permission-to-navigation mapping:

| Permission | Navigation path |
|---|---|
| `DATA_MAIN` | `/data` |
| `DATA_STANDARD_SAMPLE` | `/data/standard-sample` |
| `DATA_COEFFICIENT` | `/data/coefficient` |
| `LAB_REPORT_IMAGE_TEMPLATE` | `/lab-report/image-template` |
| `LAB_REPORT_SMS_TEMPLATE` | `/lab-report/sms-template` |
| `ATTENDANCE_SCHEDULES` | `/employee-attendance/schedules` |
| `ATTENDANCE_EMPLOYEES` | `/employee-attendance/employees` |
| `ATTENDANCE_RECORDS` | `/employee-attendance/records` |
| `ATTENDANCE_LEAVE` | `/employee-attendance/leave` |
| `ATTENDANCE_COMPENSATION` | `/employee-attendance/compensation` |
| `ATTENDANCE_PAYROLL` | `/employee-attendance/payroll` |
| `FINANCE_EXPENSES` | `/finance/expenses` |
| `FINANCE_INCOME` | `/finance/income` |
| `FINANCE_UNSETTLED` | `/finance/unsettled` |
| `FINANCE_MONTHLY_SETTLEMENT` | `/finance/monthly-settlement` |
| `FINANCE_PREPAID` | `/finance/prepaid` |
| `REPORTS` | `/reports` |
| `MEDICINE_STOCK` | `/medicine-inventory/stock` |
| `MEDICINE_INBOUND` | `/medicine-inventory/inbound` |
| `MEDICINE_OUTBOUND` | `/medicine-inventory/outbound` |
| `CUSTOMER_OVERVIEW` | `/customers-overview` |
| `BLACKLIST` | `/blacklist` |

The server-contract test reads `server/prisma/schema.prisma`, extracts the `FrontendMenuPermission` enum block, and compares the sorted values with `FRONTEND_MENU_PERMISSIONS`. It fails when either side adds or removes a leaf without updating the other.

- [ ] **Step 5: Filter the sidebar and protect all direct routes**

Main accounts render all leaves. Child accounts render only catalog leaves in `user.permissions`, and a first-level group appears only when it has at least one visible child. Add route meta from the same leaf object. Unknown/forbidden routes redirect to the first allowed leaf, and `/no-permission` renders a stable empty state instead of redirecting again.

In `router.beforeEach`, run authentication first, menu permission second, and access-password challenge third. A child without the leaf permission is redirected before any challenge dialog opens, so knowing an access password can never reveal or enter an unauthorized page.

`LabReportPage.vue` currently renders both leaf tabs from a local array; replace that array with the permitted children of the canonical lab-report group. A child with image-template access must not see the SMS-template tab, and the inverse case behaves the same way.

- [ ] **Step 6: Use the same first-allowed logic after login**

Replace hard-coded `/data` navigation in `src/views/auth/LoginRegister.vue`. A valid child login lands on its first allowed leaf. Main-account behavior remains `/data` because `DATA_MAIN` is first in the canonical catalog.

- [ ] **Step 7: Confirm GREEN**

Run the focused command from Step 2 again.

Expected: catalog completeness, filtered sidebar, direct-route redirect, empty state, and login landing all pass.

- [ ] **Step 8: Commit**

```bash
git add src/config/frontendMenu.ts src/config/frontendMenu.test.ts src/config/frontendMenu.server-contract.test.ts src/stores/auth.ts src/stores/auth.test.ts src/components/layout/AppSidebar.vue src/components/layout/AppSidebar.test.ts src/views/dashboard/LabReportPage.vue src/views/dashboard/LabReportPage.test.ts src/router/index.ts src/router/guards.ts src/router/guards.test.ts src/views/auth/LoginRegister.vue src/views/auth/LoginRegister.test.ts
git commit -m "feat: drive frontend navigation from permissions"
```

---

### Task 10: Add real and mock subaccount API parity and shared mock ownership

**Consumes:** Backend child lifecycle contract and frontend auth/menu types.

**Produces:** One typed API used by the UI in both modes, with mock child logins sharing the main account's business data.

**Files:**

- Create: `src/types/frontendSubaccount.ts`
- Create: `src/api/frontendSubaccounts.ts`
- Create: `src/api/frontendSubaccounts.test.ts`
- Create: `src/mocks/frontendSubaccounts.ts`
- Create: `src/mocks/frontendSubaccounts.test.ts`
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/db.test.ts`
- Modify: `src/mocks/employeeAttendance.ts`
- Modify: `src/api/auth.ts`
- Modify: `src/api/employeeAttendance.ts`
- Modify: `src/api/medicineInventory.ts`

- [ ] **Step 1: Write failing API parity tests**

Define and test this public contract in real and mock modes:

```ts
export interface FrontendSubaccount {
  id: string;
  account: string;
  username: string;
  enabled: boolean;
  permissions: FrontendMenuPermission[];
  createdAt: string;
}

export interface CreateFrontendSubaccountInput {
  account: string;
  username: string;
  password: string;
  confirmPassword: string;
  permissions: FrontendMenuPermission[];
}

export interface UpdateFrontendSubaccountInput {
  username: string;
  permissions: FrontendMenuPermission[];
}
```

Assert every function uses the exact route/method from Task 3 and returns the same shape in mock and real modes. Assert responses never contain `password`, `passwordHash`, `passwordCipher`, or `currentPassword`.

- [ ] **Step 2: Write failing mock identity and data-sharing tests**

Test:

```ts
it('logs a child in as a distinct actor with the main business owner', async () => {
  const child = await mockCreateFrontendSubaccount(mainUser, {
    account: 'cashier-a', username: '收款员A', password: 'ChildPass123!',
    confirmPassword: 'ChildPass123!',
    permissions: ['FINANCE_INCOME'],
  });
  const session = await mockLogin('cashier-a', 'ChildPass123!');
  expect(session.user.id).toBe(child.id);
  expect(session.user.frontendUserId).toBe(mainUser.id);
  expect(session.user.permissions).toEqual(['FINANCE_INCOME']);
});

it('uses the same medicine and attendance mock owner key for main and child', async () => {
  expect(mockDataOwnerId(mainUser)).toBe('u-admin');
  expect(mockDataOwnerId(childUser)).toBe('u-admin');
});
```

Also cover immutable account, at least one permission, global duplicate account, ownership isolation, status invalidation, password-reset confirmation, and delete.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
./node_modules/.bin/vitest run src/api/frontendSubaccounts.test.ts src/mocks/frontendSubaccounts.test.ts src/mocks/db.test.ts
```

Expected: API module, mock lifecycle, and owner helper are missing.

- [ ] **Step 4: Implement the real API adapter**

Export:

```ts
listFrontendSubaccounts(): Promise<FrontendSubaccount[]>;
createFrontendSubaccount(input: CreateFrontendSubaccountInput): Promise<FrontendSubaccount>;
updateFrontendSubaccount(id: string, input: UpdateFrontendSubaccountInput): Promise<FrontendSubaccount>;
setFrontendSubaccountStatus(id: string, enabled: boolean): Promise<FrontendSubaccount>;
resetFrontendSubaccountPassword(id: string, currentPassword: string, newPassword: string): Promise<void>;
deleteFrontendSubaccount(id: string): Promise<void>;
```

Dispatch to HTTP or mock implementation using the same `useMocks` decision used by existing API modules.

- [ ] **Step 5: Implement mock credentials and lifecycle safely**

Keep mock plaintext passwords only inside the in-memory mock credential map; never include them in public objects. Issue a mock session containing actor ID and the `authVersion` snapshot, and call `assertMockSession()` from mock API entry points so permission/status/password changes reject the old session on the next request. Increment mock `authVersion` on the same lifecycle events as the server. The main seed remains `admin / admin123`, ID `u-admin`, role `FRONTEND_USER`, owner `u-admin`, and all permissions. New invite registrations also produce `FRONTEND_USER`, never the legacy `staff` role.

Expose `assertMockPermission(...permissions)` with the same main-implicit/child-explicit OR semantics as the server. Apply it to lab/customer/finance/report/blacklist/medicine functions in `src/mocks/db.ts` and to the six attendance groups in `src/mocks/employeeAttendance.ts`. The deletion-request mock performs the same body-type-specific expense/prepaid assertion as the server.

For mock adapters corresponding to protected server surfaces, also call `assertMockAccessGrant` from Task 8 with `FINANCE`, `REPORTS`, `BLACKLIST`, `MEDICINE_INVENTORY`, `CUSTOMER_OVERVIEW`, `EMPLOYEE_ATTENDANCE`, or the conditional lab-sheet feature. The mock result must require menu permission and access grant independently, matching the real server.

- [ ] **Step 6: Normalize mock business owner keys**

Introduce:

```ts
export const mockDataOwnerId = (user: AuthUser): string => user.frontendUserId;
```

Replace actor-keyed medicine and attendance mock storage lookups with the owner key. Keep audit-display values based on `user.id` only where the mock models a real actor field.

- [ ] **Step 7: Confirm GREEN**

Run the focused command from Step 3 again.

Expected: real/mock contract parity, lifecycle rules, and shared mock ownership pass.

- [ ] **Step 8: Commit**

```bash
git add src/types/frontendSubaccount.ts src/api/frontendSubaccounts.ts src/api/frontendSubaccounts.test.ts src/mocks/frontendSubaccounts.ts src/mocks/frontendSubaccounts.test.ts src/mocks/db.ts src/mocks/db.test.ts src/mocks/employeeAttendance.ts src/api/auth.ts src/api/employeeAttendance.ts src/api/medicineInventory.ts
git commit -m "feat: add frontend subaccount API and mocks"
```

---

### Task 11: Build the approved account-settings and child-manager UI

**Consumes:** Frontend catalog, auth role helpers, subaccount API, and access challenge store.

**Produces:** The selected C layout: child list on the left, child detail form and permission tree on the right.

**Files:**

- Create: `src/components/account-settings/AccountSettingsDialog.vue`
- Create: `src/components/account-settings/AccountSettingsDialog.test.ts`
- Create: `src/components/account-settings/FrontendSubaccountManager.vue`
- Create: `src/components/account-settings/FrontendSubaccountManager.test.ts`
- Create: `src/components/account-settings/FrontendPermissionTree.vue`
- Create: `src/components/account-settings/FrontendPermissionTree.test.ts`
- Modify: `src/components/layout/AppTopbar.vue`
- Create: `src/components/layout/AppTopbar.test.ts`

- [ ] **Step 1: Write failing role-visibility and layout tests**

Test the following visible behavior:

- main account sees `修改密码` and `子账号管理` tabs;
- child account sees only its own `修改密码` form;
- child account does not see the access-settings management button;
- child account still sees the access-verification dialog when a permitted protected page requires it;
- the manager renders a fixed left list and right editor on desktop;
- create mode validates account, name, password, and at least one leaf;
- edit mode shows immutable account and editable name/permissions;
- parent selection selects all current leaves; one leaf can then be removed and parent becomes indeterminate;
- enable/disable, reset, and delete display explicit confirmation;
- reset asks for the main current password, a new child password, and confirmation of the new child password;
- no DOM text or emitted payload reveals any stored child password.

Use direct component assertions:

```ts
expect(wrapper.get('[data-testid="subaccount-list"]')).toBeVisible();
expect(wrapper.get('[data-testid="subaccount-editor"]')).toBeVisible();
expect(wrapper.find('[data-testid="child-password-value"]').exists()).toBe(false);
```

- [ ] **Step 2: Run focused component tests and confirm RED**

Run:

```bash
./node_modules/.bin/vitest run src/components/account-settings/AccountSettingsDialog.test.ts src/components/account-settings/FrontendSubaccountManager.test.ts src/components/account-settings/FrontendPermissionTree.test.ts src/components/layout/AppTopbar.test.ts
```

Expected: the extracted dialog and manager components do not exist.

- [ ] **Step 3: Extract account settings from the topbar**

Keep the topbar trigger but move dialog state and forms into `AccountSettingsDialog.vue`. On successful self-password change, clear tokens/access grants and return to login, preserving the existing security behavior.

- [ ] **Step 4: Implement the C split layout**

Use a responsive dialog around `980px` wide on desktop. The left column contains create action, child search/list, status, and selection. The right column contains immutable account, display name, status action, permission tree, save/reset/delete actions. On narrow screens, stack list above editor without losing actions or labels.

- [ ] **Step 5: Implement the permission tree from the canonical catalog**

Do not duplicate permission names or group children in the component. Store selected leaf keys only. Parent check toggles all currently known child keys; submit only the selected leaf array. Never persist a parent/group wildcard.

- [ ] **Step 6: Connect lifecycle actions with stable error messages**

Map server responses to these user-facing results:

| Condition | UI result |
|---|---|
| Duplicate account | `账号已存在` beside account field |
| Empty permission set | `请至少选择一个菜单权限` |
| Wrong main password on reset | `主账号当前密码不正确` |
| Cross-tenant/stale child | close editor, refresh list, show `子账号不存在或已被删除` |
| Child session invalidated | clear local session and return to login |

- [ ] **Step 7: Keep reminder/access controls permission-aware**

Do not request reminder data for a child unless it has at least one of `FINANCE_UNSETTLED`, `FINANCE_MONTHLY_SETTLEMENT`, `FINANCE_EXPENSES`, or `FINANCE_PREPAID`. For both main and child accounts, load finance reminders only when the `FINANCE` feature is unprotected or has a valid access grant; reload them after `accessSessionRevision` changes. Hide access-settings management for child accounts, but leave the challenge dialog reachable through route access checks.

- [ ] **Step 8: Confirm GREEN**

Run the focused command from Step 2 again.

Expected: role visibility, split layout, tree semantics, lifecycle actions, and secret non-disclosure pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/account-settings src/components/layout/AppTopbar.vue src/components/layout/AppTopbar.test.ts
git commit -m "feat: add frontend subaccount management UI"
```

---

### Task 12: Verify the complete real, mock, admin, migration, and browser story

**Consumes:** All implementation tasks.

**Produces:** Fresh evidence that the feature is complete without customer/admin regressions or historical-data mutation.

**Files:**

- Modify only if a verification failure requires a tested fix.

- [ ] **Step 1: Run all focused feature suites**

Run:

```bash
pnpm --dir server test -- src/auth src/lab-sheets src/customers src/reports src/blacklist src/reminders src/uploads src/finance src/medicine-inventory src/employee-attendance
./node_modules/.bin/vitest run src/config/frontendMenu.test.ts src/stores/auth.test.ts src/router/guards.test.ts src/api/frontendSubaccounts.test.ts src/mocks/frontendSubaccounts.test.ts src/api/accessGuard.sessions.test.ts src/stores/accessGuard.test.ts src/components/account-settings src/components/layout/AppSidebar.test.ts src/components/layout/AppTopbar.test.ts src/views/dashboard/LabReportPage.test.ts src/views/auth/LoginRegister.test.ts
```

Expected: all feature tests pass with no skipped authorization cases.

- [ ] **Step 2: Run Prisma safety and generated-client checks**

Run:

```bash
pnpm --dir server prisma:generate
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/yangshao?schema=public' pnpm --dir server exec prisma validate --schema prisma/schema.prisma
pnpm --dir server test -- src/auth/frontend-subaccounts.schema.test.ts
```

Review the migration text once more and confirm it contains no business-table rewrite.

- [ ] **Step 3: Rehearse the migration against a disposable pre-feature fixture**

Create a disposable database at the pre-feature migration level and seed at least one `FRONTEND_USER`, `ROOT_ADMIN`, lab sheet, customer, finance entry, prepaid recharge, medicine item, employee, and access-guard group. Record counts and stable IDs for `User`, `LabSheet`, `Customer`, `FinanceEntry`, `PrepaidRechargeRecord`, `MedicineInventoryItem`, `Employee`, and `AccessGuardGroup`. Apply the new migration, then assert every recorded count and ID is unchanged, existing main/admin logins still succeed, existing main `/auth/me` resolves all 22 permissions, and the new permission table is empty.

Expected: only the new schema objects/default field are added; no historical row changes identity or ownership.

- [ ] **Step 4: Run full tests with workspace exclusions**

Run:

```bash
./node_modules/.bin/vitest run --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
pnpm --dir server test
```

Expected: customer frontend, server, and the admin tests discovered by the root Vitest run all pass. The admin package has no standalone `test` script. Classify pre-existing unrelated failures only with reproducible baseline evidence from the target branch.

- [ ] **Step 5: Run production builds**

Run:

```bash
pnpm build
pnpm build:server
pnpm build:admin
```

Expected: all three builds complete without TypeScript or bundler errors.

- [ ] **Step 6: Verify real API behavior against a disposable local database**

Use a local disposable database, apply migrations, and exercise this sequence through HTTP:

1. Main logs in and creates a child with only `FINANCE_INCOME`.
2. Child logs in; `/auth/me` reports distinct actor/owner IDs and exactly one permission.
3. Child can read and create income data owned by the main account.
4. Child receives `403` on finance expense and `/data` APIs.
5. A protected income route fails without the access grant, succeeds after challenge verification, and still rejects a grant copied from the main account.
6. Main adds `BLACKLIST`; the existing child token becomes invalid because `authVersion` changes.
7. Child logs in again, sees blacklist, and the main sees the child's shared blacklist mutation.
8. Disabling, password reset, and deletion each invalidate the prior child token.
9. Child credentials fail at `/auth/admin/login`.

Delete only the disposable database after evidence is captured; do not point this exercise at production or a database containing user history.

- [ ] **Step 7: Verify mock mode parity in the browser**

Start the customer frontend in mock mode and repeat create, login, filtered menu, shared medicine/attendance data, permission edit, disable, reset, and delete. Confirm the visible behavior and errors match real mode.

- [ ] **Step 8: Verify customer frontend and admin in the in-app browser**

Open both local applications and capture itemized evidence:

- main account: full 22-leaf sidebar, account-settings password tab, C-layout child management, access settings still available;
- child account: only granted first-level/leaf menus, own password only, no child manager, no access-settings manager;
- direct forbidden URL: redirected to first allowed leaf without a loop;
- protected permitted URL: challenge dialog appears and success grants access;
- no-permission abnormal fixture: stable empty page;
- admin: existing `ROOT_ADMIN`/`SUB_ADMIN` login, routes, read-only views, and APIs unchanged;
- network: child business requests use its token and return main-owned data; forbidden endpoints return `403` from the server.

- [ ] **Step 9: Fix any discovered gap with RED then GREEN**

For every failure, add or tighten the smallest focused regression test before changing production code. Re-run the focused test, the affected package suite, and its build. Commit fixes by coherent behavior rather than mixing unrelated corrections.

- [ ] **Step 10: Final repository check**

Run:

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree, task-ordered commits, and no generated secrets, database dumps, or `.superpowers` artifacts staged.

## Completion Evidence Checklist

- [ ] Prisma role, parent relation, `authVersion`, and 22 permission values validated.
- [ ] Main implicit-all and child explicit-only permission behavior proven.
- [ ] All customer routes have non-empty leaf metadata or are explicitly admin-only.
- [ ] Actor/owner separation proven in HTTP, SSE, finance, inventory, attendance, reports, customer, and blacklist flows.
- [ ] Existing access-password checks proven as a separate server-side gate with sanitized child challenges.
- [ ] Main-only lifecycle, immutable account, one-leaf minimum, reset confirmation, and invalidation proven.
- [ ] Real API and Mock parity proven.
- [ ] Customer frontend, admin frontend, and server full suites/builds proven.
- [ ] Browser evidence captured for main, child, direct URL, access challenge, zero-permission fallback, and admin non-regression.
- [ ] Historical business and prepayment data left untouched.
