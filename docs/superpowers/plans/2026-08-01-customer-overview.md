# Customer Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frontend and admin customer overview pages that aggregate every account's historical detected samples by customer combination, with customer/account multi-select filters and sortable totals.

**Architecture:** A reusable NestJS `CustomerOverviewService` reads existing lab sheets, sample blocks, and current customer records, then returns account-scoped aggregate rows without changing stored data. The frontend and admin expose separate authenticated routes over the same service; each UI performs local customer filtering and sorting over the returned aggregate rows.

**Tech Stack:** NestJS, Prisma, Vue 3, TypeScript, Pinia request utilities, Element Plus, Vitest.

## Global Constraints

- Treat multiple customers on one sample as one combined customer.
- Count only blocks with a non-empty customer and `hasLabDetectionInput(inputs) === true`.
- A missing or invalid historical price contributes `0` but the sample still contributes to `sampleCount`.
- Do not modify historical sample data.
- Do not modify Prisma schema or run a database migration.
- Frontend users can only query their own JWT account.
- Admin users can only query frontend accounts allowed by `AdminAccessService`.
- Customer overview covers all historical dates; do not add a date range filter.

---

### Task 1: Shared customer aggregation service

**Files:**
- Create: `server/src/customer-overview/customer-overview.service.ts`
- Create: `server/src/customer-overview/customer-overview.service.test.ts`
- Create: `server/src/customer-overview/customer-overview.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `hasLabDetectionInput`, `toMoney`.
- Produces: `CustomerOverviewService.getRows(frontendUserIds: string[]): Promise<CustomerOverviewRow[]>`.
- Produces row fields: `frontendUserId`, `frontendUserName`, `customerKey`, `customer`, `customerDisplay`, `sampleCount`, `totalAmount`, `firstDetectionDate`, `lastDetectionDate`.

- [ ] **Step 1: Write failing aggregation tests**

Cover these exact cases with a mocked Prisma service:

```ts
expect(rows[0]).toMatchObject({
  customer: '客户甲、客户乙',
  sampleCount: 2,
  totalAmount: 120,
  firstDetectionDate: '2026-07-01',
  lastDetectionDate: '2026-07-03'
})
expect(rowsForTwoAccounts).toHaveLength(2)
expect(rowsForMissingPrice[0].totalAmount).toBe(0)
```

Also assert that an empty customer and a block without detection input are excluded, and sorted customer IDs produce one grouping key regardless of input order.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter yangshao-server test -- src/customer-overview/customer-overview.service.test.ts`

Expected: FAIL because `CustomerOverviewService` does not exist.

- [ ] **Step 3: Implement customer identity and display helpers**

Implement these private rules inside the service:

```ts
const customerIds = uniqueStringArray([...inputs.customerIds, inputs.customerId])
const customerKey = customerIds.length
  ? `ids:${[...customerIds].sort().join('|')}`
  : `text:${String(inputs.customerText || '').trim()}`
```

Build `customer` from `customerText`, falling back to selected customer names. Build `customerDisplay` by joining each customer's name, phone, WeChat, WeChat nickname, and note with spaces, and joining combined customers with `、`. Prefer current customer rows by ID, then the stored `inputs.customers` snapshot.

- [ ] **Step 4: Implement historical aggregation**

Query every `LabSheet` for `frontendUserId in frontendUserIds`, including ordered sample blocks and frontend user display fields. Load referenced customer IDs in one query. Group by `${frontendUserId}__${customerKey}` and update count, money, minimum date, and maximum date.

Return rows sorted by `lastDetectionDate desc`, then `frontendUserName`, then `customerDisplay`.

- [ ] **Step 5: Register and verify the service**

Export `CustomerOverviewService` from `CustomerOverviewModule`, import the module in `AppModule`, then rerun:

`pnpm --filter yangshao-server test -- src/customer-overview/customer-overview.service.test.ts`

Expected: PASS.

### Task 2: Frontend and admin API routes

**Files:**
- Modify: `server/src/reports/reports.controller.ts`
- Modify: `server/src/reports/reports.module.ts`
- Modify: `server/src/admin/data.controller.ts`
- Modify: `server/src/admin/admin.module.ts`
- Create: `server/src/customer-overview/customer-overview.controller.test.ts`

**Interfaces:**
- Consumes: `CustomerOverviewService.getRows()` from Task 1.
- Produces: `GET /reports/customer-overview` for `FRONTEND_USER`.
- Produces: `GET /admin/customer-overview?frontendUserIds=id1,id2` for `ROOT_ADMIN` and `SUB_ADMIN`.

- [ ] **Step 1: Write failing route authorization tests**

Assert the frontend method calls `getRows([currentUser.id])`. Assert the admin method parses requested IDs and passes them through `AdminAccessService.getAllowedFrontendUserIds` before calling `getRows(allowedIds)`.

- [ ] **Step 2: Run the focused route test**

Run: `pnpm --filter yangshao-server test -- src/customer-overview/customer-overview.controller.test.ts`

Expected: FAIL because the controller methods do not exist.

- [ ] **Step 3: Add the frontend route**

Add to `ReportsController`:

```ts
@Get('customer-overview')
customerOverview(@CurrentUserInfo() user: CurrentUser) {
  return this.customerOverviewService.getRows([user.id]).then((rows) =>
    rows.map(({ frontendUserId, frontendUserName, ...row }) => row)
  )
}
```

Inject the service and import `CustomerOverviewModule` in `ReportsModule`.

- [ ] **Step 4: Add the admin route**

Add `AdminDataService.customerOverview(admin, query)` to resolve allowed IDs through `AdminAccessService`, then return `CustomerOverviewService.getRows(ids)`. Expose it as `GET /admin/customer-overview` in `AdminDataController`, and import `CustomerOverviewModule` in `AdminModule`.

- [ ] **Step 5: Verify routes**

Run the focused route test and the complete server test suite:

```bash
pnpm --filter yangshao-server test -- src/customer-overview/customer-overview.controller.test.ts
pnpm --filter yangshao-server test
```

Expected: PASS.

### Task 3: Shared frontend customer filtering and sorting

**Files:**
- Create: `src/types/customerOverview.ts`
- Create: `src/utils/customerOverview.ts`
- Create: `src/utils/customerOverview.test.ts`
- Create: `src/api/customerOverview.ts`

**Interfaces:**
- Produces: `CustomerOverviewRow`, `CustomerOverviewSortField`, `SortDirection`.
- Produces: `filterAndSortCustomerRows(rows, selectedKeys, sortField, direction)`.
- Produces: `getCustomerOverview(): Promise<CustomerOverviewRow[]>`.

- [ ] **Step 1: Write failing filter and sorting tests**

Assert one selected key returns one customer, multiple keys return their union, empty selection returns all rows, numeric totals sort numerically, and date sorting uses ISO date order.

- [ ] **Step 2: Run focused utility tests**

Run: `pnpm test -- src/utils/customerOverview.test.ts`

Expected: FAIL because the utility does not exist.

- [ ] **Step 3: Implement types, utility, and API**

Use this signature:

```ts
export function filterAndSortCustomerRows(
  rows: CustomerOverviewRow[],
  selectedKeys: string[],
  sortField: CustomerOverviewSortField,
  direction: SortDirection
): CustomerOverviewRow[]
```

Clone before sorting, use `localeCompare('zh-CN')` for customer text, and support `customerDisplay`, `sampleCount`, `totalAmount`, `firstDetectionDate`, and `lastDetectionDate`.

- [ ] **Step 4: Verify utility tests**

Run: `pnpm test -- src/utils/customerOverview.test.ts`

Expected: PASS.

### Task 4: Frontend customer overview page and protected navigation

**Files:**
- Create: `src/views/dashboard/CustomerOverviewPage.vue`
- Modify: `src/router/index.ts`
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/stores/accessGuard.ts`
- Modify: `src/router/guards.test.ts`
- Create: `src/views/dashboard/CustomerOverviewPage.test.ts`

**Interfaces:**
- Consumes: types, API, and sorting utility from Task 3.
- Produces: authenticated and access-protected `/customers-overview` page.

- [ ] **Step 1: Write failing page and guard tests**

Mount the page with mocked rows. Assert the customer multi-select can retain one or multiple keys and the rendered rows follow the selected sort. Extend guard coverage so `/customers-overview` is classified as protected.

- [ ] **Step 2: Run focused frontend tests**

Run:

`pnpm test -- src/views/dashboard/CustomerOverviewPage.test.ts src/router/guards.test.ts`

Expected: FAIL because the page and protected path are missing.

- [ ] **Step 3: Implement the page**

Create an unframed page stack containing:

- Header row with title and refresh icon button.
- Searchable Element Plus multi-select populated from unique `customerKey/customerDisplay` values.
- Sort field select and ascending/descending segmented control.
- Summary strip for customer count, sample count, and total amount.
- Element Plus table with customer full information, sample count, total amount, first date, and last date.
- Loading, API failure, and empty states.

- [ ] **Step 4: Add navigation and access protection**

Register `/customers-overview`, place its sidebar entry between reports and blacklist, and include it in `isProtectedPath()` plus the access dialog title mapping.

- [ ] **Step 5: Verify the frontend page**

Run focused tests and `pnpm exec vue-tsc --noEmit`.

Expected: PASS.

### Task 5: Admin customer overview page

**Files:**
- Create: `admin/src/views/CustomerOverviewPage.vue`
- Modify: `admin/src/router.ts`
- Modify: `admin/src/views/AdminLayout.vue`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/types.ts`

**Interfaces:**
- Consumes: `GET /admin/customer-overview`, `getFrontendOptions()`, and `buildFrontendIds()`.
- Produces: `/admin/customer-overview` with account and customer multi-select filters.

- [ ] **Step 1: Add admin API types and request helper**

Define `AdminCustomerOverviewRow` by extending the frontend row fields with `frontendUserId` and `frontendUserName`. Add:

```ts
getAdminCustomerOverview(frontendUserIds: string[]): Promise<AdminCustomerOverviewRow[]>
```

- [ ] **Step 2: Implement the admin page**

Reuse existing account selector behavior: load allowed frontend options on mount, select all by default, and reload rows when account selection changes or refresh is clicked. Add customer multi-select and the same sort controls as the frontend page.

Render account name, full customer information, sample count, total amount, first date, and last date. Keep rows from different frontend accounts separate.

- [ ] **Step 3: Add admin route and sidebar entry**

Register `/admin/customer-overview` and add “客户总览” with a user icon in `AdminLayout.vue` without changing existing sidebar collapse behavior.

- [ ] **Step 4: Verify the admin build**

Run: `pnpm build:admin`

Expected: PASS.

### Task 6: Full regression and visual verification

**Files:**
- Modify only files required by failures caused by Tasks 1-5.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified local frontend, admin, and server build.

- [ ] **Step 1: Run all automated checks**

```bash
pnpm test
pnpm test:server
pnpm build
pnpm build:admin
pnpm build:server
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 2: Verify frontend behavior in the in-app browser**

Open `/customers-overview`, confirm its sidebar position, access guard, complete customer display, one/multiple customer filters, summary totals, and each sort field.

- [ ] **Step 3: Verify admin behavior in the in-app browser**

Open `/admin/customer-overview`, confirm one/multiple account filters, one/multiple customer filters, account-separated rows, and sorting.

- [ ] **Step 4: Confirm data safety**

Review the final diff and verify there is no `schema.prisma` change, migration file, update/delete query against lab sheets or sample blocks, GitHub push, or VPS deployment.
