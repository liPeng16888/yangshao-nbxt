# 药品库存 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为前台账号增加独立药品库存、入库和出库管理，并为后台提供按授权账号和药品筛选的只读库存流水查询。

**Architecture:** 使用账号范围内的 `MedicineInventoryItem` 保存物化库存，使用不可变的 `MedicineInventoryMovement` 保存全部入库、出库和更正流水。库存变化与流水创建始终在同一个 Prisma 事务中完成，出库通过条件更新阻止并发负库存；前台和后台共享查询服务，但只有前台 controller 暴露写接口。

**Tech Stack:** Vue 3、Element Plus、Vue Router、Axios、NestJS、Prisma、PostgreSQL、Vitest、TypeScript、SCSS。

## Global Constraints

- 不同前台账号的药品、库存和流水完全隔离。
- 单位固定为 `BOTTLE | LITER | MILLILITER | GRAM`，中文显示为瓶、升、毫升、克。
- 同一账号同名同单位复用库存项；同名不同单位是独立库存项，不自动换算。
- “瓶”只允许正整数；升、毫升、克允许正数并最多保留三位小数。
- 超库存出库必须返回 `409`，不能扣减库存或创建流水。
- 已提交流水不能直接编辑或删除，只能通过带原因的反向更正流水完整冲销一次。
- 后台只有查询权限；ROOT_ADMIN 可查全部账号，SUB_ADMIN 只能查已授权账号。
- 新 Prisma 迁移只创建药品库存结构，不修改或清空任何现有数据，不运行 seed 或重置命令。
- 本次不做单位换算、财务支出联动、最低库存提醒或保质期提醒。

---

## File Structure

### Server

- `server/prisma/schema.prisma`: 药品单位、流水类型、库存项和流水模型。
- `server/prisma/migrations/20260802000000_add_medicine_inventory/migration.sql`: 只新增枚举、表、索引和外键的增量迁移。
- `server/src/medicine-inventory/medicine-inventory.types.ts`: 查询行和单位标签等内部类型。
- `server/src/medicine-inventory/medicine-inventory.dto.ts`: 前台写入 DTO、查询参数解析和数量校验。
- `server/src/medicine-inventory/medicine-inventory.service.ts`: 账号范围查询、事务入库、条件出库和更正逻辑。
- `server/src/medicine-inventory/medicine-inventory.service.test.ts`: 库存事务、隔离、并发和更正测试。
- `server/src/medicine-inventory/medicine-inventory.controller.ts`: FRONTEND_USER 查询与写入接口。
- `server/src/medicine-inventory/admin-medicine-inventory.controller.ts`: ROOT_ADMIN/SUB_ADMIN 只读接口。
- `server/src/medicine-inventory/medicine-inventory.controller.test.ts`: 账号范围、后台权限和无写接口测试。
- `server/src/medicine-inventory/medicine-inventory.module.ts`: 模块装配。
- `server/src/app.module.ts`: 注册模块。

### Frontend

- `src/types/medicineInventory.ts`: 单位、库存项、流水和写入 payload 类型。
- `src/api/medicineInventory.ts`: 前台库存 API。
- `src/utils/medicineInventory.ts`: 数量格式、显示格式和筛选辅助函数。
- `src/utils/medicineInventory.test.ts`: 单位数量规则和格式化测试。
- `src/views/dashboard/MedicineInventoryStockPage.vue`: 当前库存与多药品筛选。
- `src/views/dashboard/MedicineInventoryInboundPage.vue`: 入库表单、明细和更正。
- `src/views/dashboard/MedicineInventoryOutboundPage.vue`: 出库表单、剩余库存校验、明细和更正。
- `src/views/dashboard/MedicineInventoryPages.test.ts`: 三页交互和失败保留表单测试。
- `src/router/index.ts`: 三个路由和访问验证标题。
- `src/router/guards.ts`: 把 `/medicine-inventory` 加入敏感路径。
- `src/router/guards.test.ts`: 新敏感路径测试。
- `src/components/layout/AppSidebar.vue`: 在报表和客户总览之间增加可展开导航。

### Admin

- `admin/src/types.ts`: 后台库存项和流水类型。
- `admin/src/api.ts`: 后台三个只读请求和 mocks。
- `admin/src/views/MedicineInventoryPage.vue`: 当前库存、入库明细、出库明细三个标签页及多账号、多药品筛选。
- `admin/src/views/MedicineInventoryPage.test.ts`: 筛选、标签页和只读界面测试。
- `admin/src/router.ts`: 后台药品库存路由。
- `admin/src/views/AdminLayout.vue`: 后台导航入口。

---

### Task 1: Prisma 药品库存结构与安全迁移

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260802000000_add_medicine_inventory/migration.sql`

**Interfaces:**
- Produces: Prisma models `MedicineInventoryItem` and `MedicineInventoryMovement`.
- Produces: enums `MedicineUnit` and `MedicineMovementType`.
- Produces unique key `@@unique([frontendUserId, name, unit])` and correction uniqueness `correctionOfId @unique`.

- [ ] **Step 1: Add schema models and relations**

Add these exact concepts to `schema.prisma`:

```prisma
enum MedicineUnit {
  BOTTLE
  LITER
  MILLILITER
  GRAM
}

enum MedicineMovementType {
  INBOUND
  OUTBOUND
  CORRECTION_IN
  CORRECTION_OUT
}

model MedicineInventoryItem {
  id              String       @id @default(uuid())
  frontendUserId  String
  name            String
  unit            MedicineUnit
  currentQuantity Decimal      @default(0) @db.Decimal(14, 3)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  frontendUser    User         @relation("FrontendMedicineItems", fields: [frontendUserId], references: [id])
  movements       MedicineInventoryMovement[]

  @@unique([frontendUserId, name, unit])
  @@index([frontendUserId, name])
}
```

Define `MedicineInventoryMovement` with positive `quantity`, immutable name/unit snapshots, optional unique `correctionOfId`, self-relations for original/correction, and indexes on `[frontendUserId, occurredOn]` and `[medicineItemId, occurredOn]`. Add matching `User` relations named `FrontendMedicineItems` and `FrontendMedicineMovements`.

- [ ] **Step 2: Create an additive SQL migration**

Write SQL that only creates the two enums, two tables, unique indexes, query indexes and foreign keys. Use `ON DELETE RESTRICT ON UPDATE CASCADE` for user/item/original movement references so historical inventory cannot be cascade-deleted.

- [ ] **Step 3: Validate the Prisma schema**

Run: `pnpm --filter yangshao-server exec prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 4: Generate Prisma Client**

Run: `pnpm --filter yangshao-server exec prisma generate`

Expected: Prisma Client generation succeeds with the new models and enums.

- [ ] **Step 5: Commit the schema task**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260802000000_add_medicine_inventory/migration.sql
git commit -m "feat: add medicine inventory schema"
```

### Task 2: Quantity validation and transactional inventory service

**Files:**
- Create: `server/src/medicine-inventory/medicine-inventory.types.ts`
- Create: `server/src/medicine-inventory/medicine-inventory.dto.ts`
- Create: `server/src/medicine-inventory/medicine-inventory.service.ts`
- Create: `server/src/medicine-inventory/medicine-inventory.service.test.ts`

**Interfaces:**
- Produces: `MedicineInventoryService.listItems(frontendUserIds, itemIds?)`.
- Produces: `MedicineInventoryService.listMovements(frontendUserIds, kind, query)`.
- Produces: `MedicineInventoryService.createInbound(frontendUserId, payload)`.
- Produces: `MedicineInventoryService.createOutbound(frontendUserId, payload)`.
- Produces: `MedicineInventoryService.createCorrection(frontendUserId, movementId, reason)`.
- Produces DTOs `CreateMedicineInboundDto`, `CreateMedicineOutboundDto`, `CreateMedicineCorrectionDto`, `MedicineMovementQueryDto`.

- [ ] **Step 1: Write failing unit tests for validation and account isolation**

Create tests proving:

```ts
expect(validateMedicineQuantity(MedicineUnit.BOTTLE, 1.5)).toEqual({ ok: false, message: '瓶数量必须是正整数' })
expect(validateMedicineQuantity(MedicineUnit.GRAM, 1.234)).toEqual({ ok: true, value: '1.234' })
expect(validateMedicineQuantity(MedicineUnit.GRAM, 1.2345).ok).toBe(false)
```

Mock Prisma and verify `listItems(['front-1'])` always queries `frontendUserId: { in: ['front-1'] }` and item filters are combined with that scope.

- [ ] **Step 2: Run the focused service test and verify failure**

Run: `pnpm --filter yangshao-server test -- medicine-inventory.service.test.ts`

Expected: FAIL because the module and validation functions do not exist.

- [ ] **Step 3: Implement DTO normalization and display mapping**

Implement:

```ts
export const MEDICINE_UNIT_LABELS: Record<MedicineUnit, string> = {
  BOTTLE: '瓶',
  LITER: '升',
  MILLILITER: '毫升',
  GRAM: '克'
}
```

Trim names and remarks, parse comma-separated multi-value query parameters, reject zero/negative/non-finite quantities, reject fractional bottles, and reject more than three decimal places.

- [ ] **Step 4: Write failing inbound and outbound transaction tests**

Test these exact outcomes:

- inbound upserts `frontendUserId + normalized name + unit`, increments quantity and creates `INBOUND` in one transaction;
- outbound calls `updateMany` with `currentQuantity: { gte: quantity }` and creates `OUTBOUND` only when `count === 1`;
- `count === 0` throws `ConflictException` containing the latest stock and creates no movement;
- same name and different unit produce distinct item keys;
- two simulated outbound attempts cannot both succeed when their combined quantity exceeds stock.

- [ ] **Step 5: Implement list, inbound and outbound service methods**

Use `this.prisma.$transaction(async (tx) => { ... })`. Return quantities as numbers at the HTTP boundary, but pass Prisma `Decimal` values inside persistence code. Normalize item names with `trim()` before matching and storing.

- [ ] **Step 6: Write failing correction tests**

Verify full reverse behavior:

- correcting `OUTBOUND` increments stock and creates `CORRECTION_IN`;
- correcting `INBOUND` conditionally decrements stock and creates `CORRECTION_OUT`;
- correcting inbound cannot create negative stock;
- a movement with an existing correction returns `409`;
- correction reason is required and saved in `remark` with `correctionOfId`.

- [ ] **Step 7: Implement correction transactions**

Load the original movement with `frontendUserId`, reject correction records as originals, reject already-corrected records, and perform the opposite stock update plus correction creation atomically.

- [ ] **Step 8: Run service tests**

Run: `pnpm --filter yangshao-server test -- medicine-inventory.service.test.ts`

Expected: all medicine inventory service tests PASS.

- [ ] **Step 9: Commit the service task**

```bash
git add server/src/medicine-inventory/medicine-inventory.types.ts server/src/medicine-inventory/medicine-inventory.dto.ts server/src/medicine-inventory/medicine-inventory.service.ts server/src/medicine-inventory/medicine-inventory.service.test.ts
git commit -m "feat: implement medicine inventory transactions"
```

### Task 3: Frontend and admin API controllers with permission enforcement

**Files:**
- Create: `server/src/medicine-inventory/medicine-inventory.controller.ts`
- Create: `server/src/medicine-inventory/admin-medicine-inventory.controller.ts`
- Create: `server/src/medicine-inventory/medicine-inventory.controller.test.ts`
- Create: `server/src/medicine-inventory/medicine-inventory.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: all `MedicineInventoryService` methods from Task 2.
- Consumes: `AdminAccessService.getAllowedFrontendUserIds(user, requestedIds)`.
- Produces: front routes under `/medicine-inventory` and admin GET routes under `/admin/medicine-inventory`.

- [ ] **Step 1: Write failing controller permission tests**

Test that:

```ts
await frontController.items(frontendUser, { medicineItemIds: 'item-1,item-2' })
expect(service.listItems).toHaveBeenCalledWith(['front-1'], ['item-1', 'item-2'])
```

For admin queries, parse `frontendUserIds`, call `getAllowedFrontendUserIds`, then pass only the returned IDs to the service. Assert the admin controller prototype has only GET handlers and no POST/PATCH/DELETE write handlers.

- [ ] **Step 2: Run controller tests and verify failure**

Run: `pnpm --filter yangshao-server test -- medicine-inventory.controller.test.ts`

Expected: FAIL because controllers do not exist.

- [ ] **Step 3: Implement the frontend controller**

Protect with `AuthGuard`, `RolesGuard`, and `@Roles(UserRole.FRONTEND_USER)`. Implement:

```ts
@Get('items')
@Get('inbounds')
@Post('inbounds')
@Get('outbounds')
@Post('outbounds')
@Post('movements/:id/corrections')
```

Every method must derive `frontendUserId` from `@CurrentUserInfo()` and ignore any account ID in the request body.

- [ ] **Step 4: Implement the read-only admin controller and module**

Protect with ROOT_ADMIN/SUB_ADMIN roles. Implement only:

```ts
@Get('items')
@Get('inbounds')
@Get('outbounds')
```

Import `AdminModule` in `MedicineInventoryModule` to use exported `AdminAccessService`, then register `MedicineInventoryModule` in `AppModule`.

- [ ] **Step 5: Run controller and service tests**

Run: `pnpm --filter yangshao-server test -- medicine-inventory.controller.test.ts medicine-inventory.service.test.ts`

Expected: PASS.

- [ ] **Step 6: Build the server**

Run: `pnpm --filter yangshao-server build`

Expected: Nest TypeScript build succeeds.

- [ ] **Step 7: Commit the API task**

```bash
git add server/src/medicine-inventory server/src/app.module.ts
git commit -m "feat: expose medicine inventory APIs"
```

### Task 4: Frontend inventory types, API, and quantity utilities

**Files:**
- Create: `src/types/medicineInventory.ts`
- Create: `src/api/medicineInventory.ts`
- Create: `src/utils/medicineInventory.ts`
- Create: `src/utils/medicineInventory.test.ts`

**Interfaces:**
- Produces: `MedicineInventoryItem`, `MedicineInventoryMovement`, `MedicineUnit`, `CreateMedicineInboundPayload`, `CreateMedicineOutboundPayload`.
- Produces: `getMedicineItems`, `getMedicineMovements`, `createMedicineInbound`, `createMedicineOutbound`, `correctMedicineMovement`.
- Produces: `validateMedicineQuantity(unit, value)` and `formatMedicineQuantity(value)`.

- [ ] **Step 1: Write failing utility tests**

Cover positive integer bottle rules, three-decimal non-bottle rules, zero/negative rejection, quantity formatting without meaningless trailing zeros, and API query encoding for multiple `medicineItemIds`.

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- src/utils/medicineInventory.test.ts`

Expected: FAIL because the utility does not exist.

- [ ] **Step 3: Implement types and pure utilities**

Use the same unit keys as Prisma and this label map:

```ts
export const medicineUnitOptions = [
  { value: 'BOTTLE', label: '瓶' },
  { value: 'LITER', label: '升' },
  { value: 'MILLILITER', label: '毫升' },
  { value: 'GRAM', label: '克' }
] as const
```

- [ ] **Step 4: Implement Axios wrappers**

Use the existing `request` helper. Send multi-select IDs as comma-separated params and expose the server `409` response to page handlers without clearing form state.

- [ ] **Step 5: Run utility tests and typecheck**

Run: `pnpm test -- src/utils/medicineInventory.test.ts && pnpm exec vue-tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the frontend domain task**

```bash
git add src/types/medicineInventory.ts src/api/medicineInventory.ts src/utils/medicineInventory.ts src/utils/medicineInventory.test.ts
git commit -m "feat: add medicine inventory frontend domain"
```

### Task 5: Frontend inventory pages, navigation, and access guard

**Files:**
- Create: `src/views/dashboard/MedicineInventoryStockPage.vue`
- Create: `src/views/dashboard/MedicineInventoryInboundPage.vue`
- Create: `src/views/dashboard/MedicineInventoryOutboundPage.vue`
- Create: `src/views/dashboard/MedicineInventoryPages.test.ts`
- Modify: `src/router/index.ts`
- Modify: `src/router/guards.ts`
- Modify: `src/router/guards.test.ts`
- Modify: `src/components/layout/AppSidebar.vue`

**Interfaces:**
- Consumes: Task 4 API functions and types.
- Produces routes `/medicine-inventory/stock`, `/medicine-inventory/inbound`, `/medicine-inventory/outbound`.

- [ ] **Step 1: Write failing route and guard tests**

Add assertions:

```ts
expect(isSensitiveAccessPath('/medicine-inventory/stock')).toBe(true)
expect(isSensitiveAccessPath('/medicine-inventory/outbound')).toBe(true)
```

Mount navigation or inspect router records to verify the main item appears between 报表 and 客户总览 and contains all three child routes.

- [ ] **Step 2: Write failing page interaction tests**

Test these behaviors with mocked APIs:

- stock page loads all items and filters one or multiple selected IDs;
- inbound existing item locks its unit, new name requires a unit, successful confirmation refreshes data;
- outbound shows current and remaining quantity, disables submit above stock;
- a server `409` preserves selected item, quantity and remark while replacing displayed current stock with the latest server value;
- correction requires non-empty reason and a second confirmation.

- [ ] **Step 3: Run focused frontend tests and verify failure**

Run: `pnpm test -- src/router/guards.test.ts src/views/dashboard/MedicineInventoryPages.test.ts`

Expected: FAIL because routes and pages do not exist.

- [ ] **Step 4: Implement routes, access guard and sidebar**

Use the Element Plus `Box` icon for the main item. Its child labels are exactly “药品库存”“药品入库”“药品出库”. Redirect `/medicine-inventory` to `/medicine-inventory/stock`. Add `getAccessGuardTitle` handling that returns `药品库存访问验证`.

- [ ] **Step 5: Implement the stock page**

Use an unframed control band with a multi-select drug filter and one bordered `el-table`. Columns: 药品名称、现有库存、单位、最后变动时间. Do not expose editable inputs.

- [ ] **Step 6: Implement inbound and outbound pages**

Use compact form rows and separate detail tables. Existing inbound selections display `名称（单位）` and lock unit. Outbound only lists positive-stock items and computes remaining stock locally, but treats the server response as authoritative.

- [ ] **Step 7: Implement immutable correction actions**

Each history row has “更正” only when it is an original, uncorrected movement. Open a reason dialog, require text, show a second confirmation, call `correctMedicineMovement`, then refresh stock and history.

- [ ] **Step 8: Run focused tests and frontend build**

Run: `pnpm test -- src/router/guards.test.ts src/views/dashboard/MedicineInventoryPages.test.ts src/utils/medicineInventory.test.ts`

Run: `pnpm build`

Expected: tests and frontend build PASS.

- [ ] **Step 9: Commit the frontend pages task**

```bash
git add src/views/dashboard/MedicineInventoryStockPage.vue src/views/dashboard/MedicineInventoryInboundPage.vue src/views/dashboard/MedicineInventoryOutboundPage.vue src/views/dashboard/MedicineInventoryPages.test.ts src/router/index.ts src/router/guards.ts src/router/guards.test.ts src/components/layout/AppSidebar.vue
git commit -m "feat: add medicine inventory frontend pages"
```

### Task 6: Admin read-only inventory page

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Create: `admin/src/views/MedicineInventoryPage.vue`
- Create: `admin/src/views/MedicineInventoryPage.test.ts`
- Modify: `admin/src/router.ts`
- Modify: `admin/src/views/AdminLayout.vue`

**Interfaces:**
- Consumes: admin GET routes from Task 3.
- Produces: admin route `/medicine-inventory` with tabs `stock | inbound | outbound`.

- [ ] **Step 1: Write failing admin page tests**

Mock frontend options and inventory API data. Verify:

- initial load selects all permitted accounts;
- account multi-select is sent to every tab request;
- medicine multi-select filters all three tabs;
- date range appears only for inbound/outbound;
- tables contain no editable controls or mutation buttons.

- [ ] **Step 2: Run the admin test and verify failure**

Run: `pnpm test -- admin/src/views/MedicineInventoryPage.test.ts`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Add admin types, API wrappers, and mock rows**

Add `getAdminMedicineItems`, `getAdminMedicineInbounds`, and `getAdminMedicineOutbounds`. Every request serializes selected frontend IDs and item IDs as comma-separated params.

- [ ] **Step 4: Implement the read-only page**

Use the existing admin control style. Current stock columns: 前台账号、药品名称、现有库存、单位、最后变动时间. Movement columns: 业务日期、前台账号、药品名称、数量、单位、类型、备注、录入时间. Do not render correction or edit actions.

- [ ] **Step 5: Add route and nav item**

Insert “药品库存” immediately after “客户总览” while preserving the existing sidebar icon-only collapsed state.

- [ ] **Step 6: Run admin test and build**

Run: `pnpm test -- admin/src/views/MedicineInventoryPage.test.ts`

Run: `pnpm build:admin`

Expected: PASS.

- [ ] **Step 7: Commit the admin task**

```bash
git add admin/src/types.ts admin/src/api.ts admin/src/views/MedicineInventoryPage.vue admin/src/views/MedicineInventoryPage.test.ts admin/src/router.ts admin/src/views/AdminLayout.vue
git commit -m "feat: add read-only admin medicine inventory"
```

### Task 7: Full verification and migration safety review

**Files:**
- Modify only files required to fix failures discovered by the commands below.

**Interfaces:**
- Verifies all interfaces from Tasks 1-6.

- [ ] **Step 1: Check migration is additive**

Run:

```bash
rg -n "DROP|TRUNCATE|DELETE FROM|ALTER TABLE .* DROP" server/prisma/migrations/20260802000000_add_medicine_inventory/migration.sql
```

Expected: no matches.

- [ ] **Step 2: Run all real source tests**

Run: `pnpm test -- --exclude '.worktrees/**' --exclude '.superpowers/**'`

Run: `pnpm --filter yangshao-server test`

Expected: all frontend/admin and server tests PASS.

- [ ] **Step 3: Build all applications**

Run: `pnpm build:all`

Expected: frontend, admin and server builds PASS.

- [ ] **Step 4: Check diffs and generated artifacts**

Run: `git diff --check`

Run: `git status --short`

Confirm no `.env`, production dump, upload, build cache or generated secret is staged.

- [ ] **Step 5: Browser verification**

At desktop and narrow viewports verify:

- front nav expands/collapses and three inventory pages render without overlap;
- same drug name can be created for different units;
- outbound above stock is blocked both before and after request;
- admin filters one/multiple accounts and drugs and exposes no edit action.

- [ ] **Step 6: Commit only verification fixes if needed**

If verification exposes a defect, return to the owning task, add a failing regression test, implement the smallest fix, rerun that task's focused tests, stage only the exact regression test and implementation files shown by `git diff --name-only`, and commit them with `git commit -m "fix: correct medicine inventory verification issue"`. Skip this step when no verification fix was required.
