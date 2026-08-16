# Mobile Frontend Full Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持客户前端电脑界面和管理后台不变的前提下，为客户前端全部现有功能提供可正常操作的 iPhone 布局，并让标样计算、系数计算草稿通过现有账号在电脑和手机间同步。

**Architecture:** 继续共用 Vue 路由、Pinia Store、NestJS API、JWT、业务规则和 PostgreSQL；`useMobileLayout()` 是唯一布局判断，复杂页面在同一路由下只挂载手机或桌面其中一套编辑视图。统一导航配置同时驱动桌面侧栏、手机一级抽屉和当前一级菜单的可滑动二级底栏；标样与系数草稿新增账号隔离的乐观锁服务端存储，其余业务接口和数据库表不改变。

**Tech Stack:** Vue 3、TypeScript、Vite、Pinia、Element Plus、Vitest、Vue Test Utils、NestJS、Prisma、PostgreSQL、Axios、Day.js、vite-plugin-pwa。

## Global Constraints

- 本次只优化客户前端手机版；管理后台和客户前端电脑布局不重新设计。
- 已确认的数据录入手机样品卡片保持当前结构，只接入共享导航、底部占位和必要回归修正。
- 手机端不通过压缩宽表格实现；宽表转换为卡片、折叠区、筛选抽屉或全屏表单。
- `useMobileLayout()` 是唯一布局判断；同一路由不能同时挂载两套可编辑控件。
- 手机一级菜单只出现在左侧抽屉；底部只显示当前一级菜单的二级菜单。
- 二级菜单两项时各占一半，三项时一屏显示，四项及以上横向滑动并自动显示当前项；单页一级模块不显示底栏。
- 所有手机触控区域至少 `44px`，使用 `100dvh`、`env(safe-area-inset-*)`，页面不得产生意外整页横向滚动。
- 手机端与电脑端继续使用相同账号、访问密码、权限、API、公式、金额精度、日期规则和现有业务数据。
- 标样与系数草稿由服务端按 JWT 当前前台账号隔离保存；客户端不能提交或读取其他账号标识。
- 旧 `localStorage` 草稿只在服务端为空时导入一次；本地存储异常不能阻断服务器加载、计算或保存。
- 并发保存使用 `baseRevision` 乐观锁；冲突必须保留本机内容并由用户选择加载服务器版本或明确覆盖。
- 在线使用，不实现离线业务提交；PWA 继续只缓存静态外壳，`/api`、`/uploads`、SSE、账号和业务数据始终走网络。
- Prisma 迁移只能新增计算草稿枚举、表、索引、外键和用户关系；不得修改或清空现有业务数据，不运行强制重置或 seed。
- 每个任务严格 RED → 最小 GREEN → 重构 → 定向验证 → 独立提交；前一任务通过后再进入下一任务。
- 本计划只完成代码和本地验收；生产发布、生产迁移与 iPhone 实机确认需要另行授权。

---

## Execution Order and Phase Gates

1. 导航与公共手机骨架：Task 1–3。
2. 标样/系数草稿服务端同步与手机视图：Task 4–8。
3. 化验报告：Task 9。
4. 药品、报表、客户总览、黑名单：Task 10–13。
5. 财务：Task 14–17。
6. 员工考勤：Task 18–21。
7. 全路由、本地浏览器、桌面/admin/PWA/服务端回归：Task 22。

每个阶段末运行该阶段所有定向测试；不跨过失败的阶段门禁。

## File Responsibility Map

### Navigation and shared mobile UI

- `src/config/customerNavigation.ts`: 客户前端唯一一级/二级菜单配置和默认入口。
- `src/config/customerNavigation.test.ts`: 路由覆盖、激活规则、二级菜单数量规则。
- `src/composables/useCustomerNavigation.ts`: 从当前路由派生一级菜单、当前二级菜单和底栏可见性。
- `src/components/layout/AppSidebar.vue`: 只消费统一配置，保持电脑侧栏外观。
- `src/components/layout/AppMobileShell.vue`: 手机顶部栏和一级抽屉。
- `src/components/layout/MobileSecondaryNav.vue`: 可滑动二级底栏和当前项自动定位。
- `src/components/layout/AppLayout.vue`: 根据移动导航上下文设置统一底部安全占位变量。
- `src/components/mobile/MobileFilterDrawer.vue`: 筛选摘要和全宽抽屉。
- `src/components/mobile/MobileRecordCard.vue`: 记录摘要、状态、详情折叠和选择态。
- `src/components/mobile/MobileFullscreenDialog.vue`: 手机全屏表单壳，桌面继续使用原对话框。
- `src/components/mobile/MobileActionBar.vue`: 位于二级底栏上方的固定业务操作区。
- `src/styles/global.scss`: 动态视口、安全区、触控尺寸和底部层级变量。

### Calculation draft synchronization

- `server/prisma/schema.prisma`: `CalculationDraftKind`、`FrontendCalculationDraft` 和 `User.calculationDrafts`。
- `server/prisma/migrations/20260815000000_add_frontend_calculation_drafts/migration.sql`: 仅新增草稿持久化对象。
- `server/src/calculation-drafts/calculation-draft.types.ts`: 两类规范化 payload 的服务端类型。
- `server/src/calculation-drafts/calculation-draft.validation.ts`: kind、字段白名单、行数、编号和有限数值验证。
- `server/src/calculation-drafts/calculation-draft.service.ts`: 账号隔离读取、创建、乐观锁更新和冲突响应。
- `server/src/calculation-drafts/calculation-draft.controller.ts`: JWT 前台账号的 GET/PUT 路由。
- `server/src/calculation-drafts/calculation-draft.module.ts`: Nest 模块注册。
- `src/types/calculationDraft.ts`: 前端 kind、payload、revision 和同步状态契约。
- `src/api/calculationDraft.ts`: GET/PUT API 与 409 响应适配。
- `src/composables/useCalculationDraft.ts`: 加载、延迟保存、失败重试、冲突选择和旧缓存导入。
- `src/components/calculation/CalculationDraftStatus.vue`: 保存、重试和冲突选择的统一状态条。
- `src/composables/useStandardSampleCalculation.ts`: 三类标样输入、共享公式和重置。
- `src/composables/useCoefficientCalculation.ts`: 两类样品行、九项参数、行操作和共享公式。
- `src/components/standard-sample/StandardSampleDesktopView.vue`: 原电脑标样视图。
- `src/components/standard-sample/MobileStandardSampleCards.vue`: 手机三张折叠算法卡。
- `src/components/coefficient/CoefficientCalculationDesktopView.vue`: 原电脑系数视图。
- `src/components/coefficient/MobileCoefficientCalculation.vue`: 手机三组折叠区和样品卡。

### Remaining mobile modules

- `src/components/lab-report/MobileLabReportTemplatePanel.vue`, `MobileLabReportSmsTemplatePanel.vue`: 手机报告模板表单和预览。
- `src/components/medicine/MobileMedicineStockList.vue`, `MobileMedicineMovementList.vue`: 库存和流水卡片。
- `src/components/report/MobileReportFilter.vue`: 单页报表筛选抽屉。
- `src/components/customer-overview/MobileCustomerOverviewList.vue`: 客户摘要卡和详情。
- `src/components/blacklist/MobileBlacklistList.vue`, `MobileBlacklistForm.vue`: 黑名单卡片和手机表单。
- `src/components/finance/MobileFinanceEntryForm.vue`, `MobileFinanceEntryList.vue`: 支出录入与账单卡。
- `src/components/finance/MobileIncomeList.vue`, `MobileUnsettledList.vue`, `MobileMonthlySettlementList.vue`, `MobilePrepaidList.vue`: 财务各业务卡片。
- `src/views/dashboard/employee-attendance/EmployeeAttendancePageShell.vue`: 考勤手机筛选摘要与操作区。
- `src/views/dashboard/employee-attendance/MobileAttendanceCalendar.vue`: 手机月份日历。
- `src/views/dashboard/employee-attendance/MobileEmployeeList.vue`, `MobileAttendanceRecordList.vue`, `MobileLeaveList.vue`, `MobileCompensationList.vue`, `MobilePayrollList.vue`: 考勤记录卡片。
- 现有页面组件继续负责 Store/API 调用、权限、错误和业务操作，只按 `isMobileLayout` 选择展示组件。

---

### Task 1: Single Customer Navigation Configuration

**Files:**
- Create: `src/config/customerNavigation.ts`
- Create: `src/config/customerNavigation.test.ts`
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/components/layout/AppMobileShell.test.ts`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`
- Modify: `src/views/dashboard/MedicineInventoryPages.test.ts`

**Interfaces:**
- Produces `CustomerNavChild { key, path, label, matchPrefixes? }`.
- Produces `CustomerNavSection { key, path, label, icon, children? }`.
- Produces `customerNavigation`, `findCustomerNavigation(path)` and `isCustomerNavChildActive(path, child)`.
- Desktop and mobile consumers may read this module but must not mutate it.

- [ ] **Step 1: Write the failing configuration tests**

```ts
expect(customerNavigation.map((item) => item.key)).toEqual([
  'data', 'lab-report', 'employee-attendance', 'finance',
  'reports', 'medicine-inventory', 'customers-overview', 'blacklist'
])
expect(findCustomerNavigation('/employee-attendance/payroll')?.children?.map((item) => item.label))
  .toEqual(['排班考勤概览', '员工档案', '考勤记录', '请假管理', '提成与奖金', '工资统计'])
expect(findCustomerNavigation('/finance/prepaid/customers')?.activeChild?.path)
  .toBe('/finance/prepaid/add')
expect(findCustomerNavigation('/reports')?.children).toBeUndefined()
```

Add an assertion that every non-redirect authenticated customer route from `src/router/index.ts` occurs once as a section path, child path, or a declared child `matchPrefixes` path.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec vitest run src/config/customerNavigation.test.ts
```

Expected: FAIL because `customerNavigation.ts` does not exist.

- [ ] **Step 3: Implement the immutable menu map**

```ts
export interface CustomerNavChild {
  key: string
  path: string
  label: string
  matchPrefixes?: readonly string[]
}

export interface CustomerNavSection extends Omit<CustomerNavChild, 'matchPrefixes'> {
  icon: Component
  children?: readonly CustomerNavChild[]
}

export function isCustomerNavChildActive(path: string, child: CustomerNavChild) {
  if (child.path === '/data') return path === '/data'
  return path === child.path || (child.matchPrefixes || []).some((prefix) => path.startsWith(prefix))
}
```

Use the exact section and child labels/paths from the approved design. Give the prepaid child `matchPrefixes: ['/finance/prepaid/']` so `/finance/prepaid/customers` remains under “预存款”. `findCustomerNavigation()` returns `{ section, activeChild } | undefined` and selects the first child as the section default.

- [ ] **Step 4: Replace only the duplicated arrays in desktop/mobile navigation**

```ts
import { customerNavigation, findCustomerNavigation } from '@/config/customerNavigation'

const navItems = customerNavigation
const navigation = computed(() => findCustomerNavigation(route.path))
```

Keep `AppSidebar` DOM classes and collapsed behavior unchanged. At this task, keep the existing three-button mobile bottom bar until Task 2, but make the drawer render only `customerNavigation` first-level entries.

- [ ] **Step 5: Run focused navigation regressions and verify GREEN**

```bash
pnpm exec vitest run \
  src/config/customerNavigation.test.ts \
  src/components/layout/AppMobileShell.test.ts \
  src/views/dashboard/EmployeeAttendancePages.test.ts \
  src/views/dashboard/MedicineInventoryPages.test.ts
```

Expected: all tests PASS and desktop child labels remain unchanged.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/config/customerNavigation.ts src/config/customerNavigation.test.ts src/components/layout/AppSidebar.vue src/components/layout/AppMobileShell.vue src/components/layout/AppMobileShell.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts src/views/dashboard/MedicineInventoryPages.test.ts
git commit -m "refactor: unify customer navigation config"
```

---

### Task 2: Sliding Mobile Secondary Navigation and Safe Offsets

**Files:**
- Create: `src/composables/useCustomerNavigation.ts`
- Create: `src/components/layout/MobileSecondaryNav.vue`
- Create: `src/components/layout/MobileSecondaryNav.test.ts`
- Modify: `src/components/layout/AppMobileShell.vue`
- Modify: `src/components/layout/AppMobileShell.test.ts`
- Modify: `src/components/layout/AppLayout.vue`
- Modify: `src/components/layout/AppLayout.test.ts`
- Modify: `src/styles/global.scss`
- Modify: `src/views/dashboard/LabDataPage.vue`
- Modify: `src/components/pwa/PwaPrompts.vue`

**Interfaces:**
- `useCustomerNavigation()` returns readonly computed `section`, `children`, `activeChild`, `showSecondaryNav`.
- `MobileSecondaryNav` accepts `items` and `activePath`, emits no business events, and routes with `RouterLink`.
- Global CSS exposes `--mobile-shell-bottom` and `--mobile-page-action-bottom`.

- [ ] **Step 1: Write failing two/three/six-item and auto-scroll tests**

```ts
expect(mountNav(2).classes()).toContain('mobile-secondary-nav--two')
expect(mountNav(3).classes()).toContain('mobile-secondary-nav--three')
expect(mountNav(6).classes()).toContain('mobile-secondary-nav--scrollable')
expect(wrapper.findAll('.mobile-secondary-nav__item')).toHaveLength(6)
expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'center' })
```

Also assert that `/reports`, `/customers-overview`, and `/blacklist` return `showSecondaryNav=false`, while all five multi-page groups return `true`.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
pnpm exec vitest run src/components/layout/MobileSecondaryNav.test.ts src/components/layout/AppMobileShell.test.ts src/components/layout/AppLayout.test.ts
```

Expected: FAIL because the secondary navigation component and shell state do not exist.

- [ ] **Step 3: Implement the route-derived secondary rail**

```vue
<nav
  ref="track"
  class="mobile-secondary-nav"
  :class="`mobile-secondary-nav--${items.length >= 4 ? 'scrollable' : items.length === 2 ? 'two' : 'three'}`"
  aria-label="当前模块二级菜单"
>
  <RouterLink
    v-for="item in items"
    :key="item.path"
    :ref="(element) => setItemRef(item.path, element)"
    :to="item.path"
    class="mobile-secondary-nav__item"
    :class="{ 'router-link-active': item.path === activePath }"
  >{{ item.label }}</RouterLink>
</nav>
```

Watch `activePath` with `{ immediate: true, flush: 'post' }` and call the active element's `scrollIntoView({ block: 'nearest', inline: 'center' })`. Use `overflow-x:auto`, `scroll-snap-type:x mandatory`, no wrapping, and `-webkit-overflow-scrolling:touch`; do not add arrow buttons.

- [ ] **Step 4: Replace the old mobile bottom buttons and define one offset contract**

```scss
.app-shell--mobile {
  --mobile-shell-bottom: env(safe-area-inset-bottom);
  --mobile-page-action-bottom: var(--mobile-shell-bottom);
}
.app-shell--mobile-has-secondary-nav {
  --mobile-shell-bottom: calc(58px + env(safe-area-inset-bottom));
  --mobile-page-action-bottom: var(--mobile-shell-bottom);
}
.app-shell--mobile .app-content {
  padding-bottom: calc(18px + var(--mobile-shell-bottom));
}
```

Set `app-shell--mobile-has-secondary-nav` from `showSecondaryNav`. Change the existing data-entry selection bar and PWA prompts to `bottom: var(--mobile-page-action-bottom)` so they stack above the secondary rail. Preserve the top header, drawer, access settings and logout flow.

- [ ] **Step 5: Verify navigation, single pages and existing data-entry action bar**

```bash
pnpm exec vitest run \
  src/components/layout/MobileSecondaryNav.test.ts \
  src/components/layout/AppMobileShell.test.ts \
  src/components/layout/AppLayout.test.ts \
  src/components/pwa/PwaPrompts.test.ts \
  src/views/dashboard/LabDataPage.test.ts
```

Expected: PASS; only one mobile bottom rail exists, single pages have none, and the data-entry bulk bar is above it.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/composables/useCustomerNavigation.ts src/components/layout/MobileSecondaryNav.vue src/components/layout/MobileSecondaryNav.test.ts src/components/layout/AppMobileShell.vue src/components/layout/AppMobileShell.test.ts src/components/layout/AppLayout.vue src/components/layout/AppLayout.test.ts src/styles/global.scss src/views/dashboard/LabDataPage.vue src/components/pwa/PwaPrompts.vue
git commit -m "feat: add sliding mobile secondary navigation"
```

---

### Task 3: Shared Mobile Interaction Primitives

**Files:**
- Create: `src/components/mobile/MobileFilterDrawer.vue`
- Create: `src/components/mobile/MobileRecordCard.vue`
- Create: `src/components/mobile/MobileFullscreenDialog.vue`
- Create: `src/components/mobile/MobileActionBar.vue`
- Create: `src/components/mobile/MobilePrimitives.test.ts`
- Modify: `src/styles/global.scss`

**Interfaces:**
- `MobileFilterDrawer`: props `title`, `summary`, `modelValue`; emits `update:modelValue`, `apply`, `reset`; default slot contains page-owned controls.
- `MobileRecordCard`: props `title`, `subtitle?`, `status?`, `selected?`, `selectable?`, `expanded?`; emits `select`, `update:expanded`; slots `summary`, `details`, `actions`.
- `MobileFullscreenDialog`: props `modelValue`, `title`, `saving?`; emits `update:modelValue`, `confirm`; does not close itself after a failed parent save.
- `MobileActionBar`: fixed container using `--mobile-page-action-bottom`.

- [ ] **Step 1: Write failing component-contract tests**

```ts
expect(filter.get('button').attributes('aria-label')).toContain('打开筛选')
expect(card.get('.mobile-record-card__toggle').attributes('aria-expanded')).toBe('false')
expect(dialog.get('.mobile-fullscreen-dialog').attributes('role')).toBe('dialog')
expect(actionBar.classes()).toContain('mobile-action-bar')
```

Assert all primary buttons have a 44px class contract, collapsed details are not mounted, selected cards expose `aria-selected`, and dialog footer input remains mounted after a rejected parent promise.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec vitest run src/components/mobile/MobilePrimitives.test.ts
```

Expected: FAIL because the four components do not exist.

- [ ] **Step 3: Implement presentation-only components**

```vue
<button class="mobile-filter-summary mobile-touch-target" type="button" :aria-label="`打开筛选：${summary}`" @click="open = true">
  <span>{{ summary }}</span><span>筛选</span>
</button>
```

Use Element Plus drawer/dialog only as rendering containers. Do not import page Stores or APIs. Fullscreen mobile dialogs use `width:100%`, `height:100dvh`, `margin:0`, top/bottom safe-area padding, and expose footer slots for cancel/save buttons.

- [ ] **Step 4: Add shared no-overflow and touch CSS**

```scss
.mobile-touch-target { min-width: 44px; min-height: 44px; }
.mobile-page { min-width: 0; overflow-x: clip; }
.mobile-action-bar {
  position: fixed;
  right: 0;
  bottom: var(--mobile-page-action-bottom);
  left: 0;
  z-index: 17;
}
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm exec vitest run src/components/mobile/MobilePrimitives.test.ts
git add src/components/mobile src/styles/global.scss
git commit -m "feat: add shared mobile interaction components"
```

---

### Task 4: Calculation Draft Prisma Schema and Safe Migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260815000000_add_frontend_calculation_drafts/migration.sql`
- Create: `server/src/calculation-drafts/calculation-draft.validation.ts`
- Create: `server/src/calculation-drafts/calculation-draft.validation.test.ts`
- Create: `server/src/calculation-drafts/calculation-draft.types.ts`

**Interfaces:**
- Prisma enum `CalculationDraftKind = STANDARD_SAMPLE | COEFFICIENT`.
- Unique key `[frontendUserId, kind]`.
- `normalizeCalculationDraft(kind, payload)` returns a strict normalized payload or throws `BadRequestException`.

- [ ] **Step 1: Write failing validation tests**

```ts
expect(normalizeCalculationDraft('STANDARD_SAMPLE', validStandard)).toEqual(validStandard)
expect(() => normalizeCalculationDraft('STANDARD_SAMPLE', { ...validStandard, injected: true })).toThrow('草稿字段无效')
expect(() => normalizeCalculationDraft('COEFFICIENT', coefficientWithNaN)).toThrow('必须是有限数字')
expect(() => normalizeCalculationDraft('COEFFICIENT', coefficientWith51Rows)).toThrow('样品最多 50 项')
expect(() => parseCalculationDraftKind('other')).toThrow('计算草稿类型无效')
```

Standard payload permits only `aluminum`, `silicon`, `iron` and their defined numeric/null input keys. Coefficient payload permits only nine numeric parameters, `standardAddCount`, `calculationAddCount`, `standardRows`, `calculationRows`; rows require unique non-empty `id`, string `code` of at most 40 characters, boolean `autoCode`, the six known fields, and one to 50 rows per collection.

- [ ] **Step 2: Run validation tests and verify RED**

```bash
pnpm --filter yangshao-server exec vitest run src/calculation-drafts/calculation-draft.validation.test.ts
```

Expected: FAIL because the validator and types are absent.

- [ ] **Step 3: Implement strict normalization and schema**

```prisma
enum CalculationDraftKind {
  STANDARD_SAMPLE
  COEFFICIENT
}

model FrontendCalculationDraft {
  id             String               @id @default(uuid())
  frontendUserId String
  kind           CalculationDraftKind
  payload        Json
  revision       Int                  @default(1)
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  frontendUser   User                 @relation(fields: [frontendUserId], references: [id], onDelete: Cascade)

  @@unique([frontendUserId, kind])
  @@index([frontendUserId])
}
```

Add `calculationDrafts FrontendCalculationDraft[]` to `User`. The migration creates only the enum, table, unique index, account index and cascade foreign key; it contains no `DROP`, `DELETE`, `TRUNCATE`, `UPDATE`, reset, or seed statements.

- [ ] **Step 4: Verify migration shape and GREEN**

```bash
pnpm --filter yangshao-server exec vitest run src/calculation-drafts/calculation-draft.validation.test.ts
pnpm --filter yangshao-server exec prisma format
pnpm --filter yangshao-server exec prisma validate
pnpm --filter yangshao-server exec prisma generate
rg -n "DROP|DELETE|TRUNCATE|UPDATE" server/prisma/migrations/20260815000000_add_frontend_calculation_drafts/migration.sql
```

Expected: tests, format, validate and generate PASS; the final `rg` returns no matches.

- [ ] **Step 5: Commit Task 4**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260815000000_add_frontend_calculation_drafts server/src/calculation-drafts/calculation-draft.types.ts server/src/calculation-drafts/calculation-draft.validation.ts server/src/calculation-drafts/calculation-draft.validation.test.ts
git commit -m "feat: add account calculation draft schema"
```

---

### Task 5: Tenant-Safe Calculation Draft API and Optimistic Lock

**Files:**
- Create: `server/src/calculation-drafts/calculation-draft.service.ts`
- Create: `server/src/calculation-drafts/calculation-draft.service.test.ts`
- Create: `server/src/calculation-drafts/calculation-draft.controller.ts`
- Create: `server/src/calculation-drafts/calculation-draft.controller.test.ts`
- Create: `server/src/calculation-drafts/calculation-draft.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- `GET /calculation-drafts/:kind` returns `{ kind, payload, revision, updatedAt }`; missing draft returns normalized defaults, revision `0`, updatedAt `null`.
- `PUT /calculation-drafts/:kind` consumes `{ baseRevision: number, payload: unknown }`.
- Conflict is HTTP 409 with `{ code:'CALCULATION_DRAFT_CONFLICT', serverDraft }`.

- [ ] **Step 1: Write failing service account and conflict tests**

```ts
await service.get('front-a', 'STANDARD_SAMPLE')
expect(prisma.frontendCalculationDraft.findUnique).toHaveBeenCalledWith({
  where: { frontendUserId_kind: { frontendUserId: 'front-a', kind: 'STANDARD_SAMPLE' } }
})

await expect(service.save('front-a', 'COEFFICIENT', 3, localPayload)).rejects.toMatchObject({ status: 409 })
expect(conflictResponse.serverDraft.revision).toBe(4)
expect(prisma.frontendCalculationDraft.updateMany).toHaveBeenCalledWith(expect.objectContaining({
  where: { id: 'draft-1', revision: 3 }
}))
```

Cover first create at revision 0, successful update to `revision + 1`, duplicate-create race becoming 409, cross-account rows never returned, invalid payload rejected before Prisma write, and empty server default per kind.

- [ ] **Step 2: Write failing guarded controller tests**

```ts
await controller.get(frontendUser, 'standard-sample')
expect(service.get).toHaveBeenCalledWith('front-1', 'STANDARD_SAMPLE')
await controller.put(frontendUser, 'coefficient', { baseRevision: 0, payload })
expect(service.save).toHaveBeenCalledWith('front-1', 'COEFFICIENT', 0, payload)
```

Reflect metadata to assert `AuthGuard`, `RolesGuard`, and `@Roles(UserRole.FRONTEND_USER)` protect the controller. The route body and params contain no `frontendUserId`.

- [ ] **Step 3: Run focused server tests and verify RED**

```bash
pnpm --filter yangshao-server exec vitest run \
  src/calculation-drafts/calculation-draft.service.test.ts \
  src/calculation-drafts/calculation-draft.controller.test.ts
```

Expected: FAIL because the module, controller and service do not exist.

- [ ] **Step 4: Implement optimistic persistence**

```ts
const updated = await this.prisma.frontendCalculationDraft.updateMany({
  where: { id: current.id, frontendUserId, kind, revision: baseRevision },
  data: { payload: normalized, revision: { increment: 1 } }
})
if (updated.count !== 1) throw await this.conflict(frontendUserId, kind)
```

For revision 0, create under the unique key and convert Prisma `P2002` to the same conflict response. For reads and conflict reloads always include both `frontendUserId` and `kind`. Register `CalculationDraftModule` in `AppModule`.

- [ ] **Step 5: Verify GREEN and build server**

```bash
pnpm --filter yangshao-server exec vitest run src/calculation-drafts
pnpm build:server
```

Expected: all draft tests and Nest production build PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add server/src/calculation-drafts server/src/app.module.ts
git commit -m "feat: add calculation draft sync api"
```

---

### Task 6: Frontend Draft API, Cache Migration, Retry and Conflict State

**Files:**
- Create: `src/types/calculationDraft.ts`
- Create: `src/api/calculationDraft.ts`
- Create: `src/api/calculationDraft.test.ts`
- Create: `src/composables/useCalculationDraft.ts`
- Create: `src/composables/useCalculationDraft.test.ts`
- Create: `src/components/calculation/CalculationDraftStatus.vue`
- Create: `src/components/calculation/CalculationDraftStatus.test.ts`

**Interfaces:**
- `CalculationDraftKind = 'standard-sample' | 'coefficient'`.
- `CalculationDraftSyncStatus = 'loading' | 'idle' | 'saving' | 'retrying' | 'saved' | 'error' | 'conflict'`.
- `useCalculationDraft<T>(adapter)` returns readonly `status`, `revision`, `conflict`, plus `load()`, `scheduleSave()`, `retry()`, `useServerVersion()`, `overwriteServerVersion()`.
- `CalculationDraftStatus` accepts `status`, `updatedAt?`, `conflict?` and emits `retry`, `useServer`, `overwrite`.

Define the payloads explicitly:

```ts
export interface StandardSampleDraft {
  aluminum: AluminumStandardInput
  silicon: RatioStandardInput
  iron: RatioStandardInput
}

export type CoefficientElementKey = 'aluminum' | 'silicon' | 'iron' | 'calcium' | 'magnesium' | 'titanium'
export type CoefficientRawKey = 'ironRaw' | 'siliconRaw' | 'aluminumRaw' | 'calciumRaw' | 'magnesiumRaw' | 'titaniumRaw'
export interface StandardContentRow extends Record<CoefficientElementKey, number | null> {
  id: string
  code: string
  autoCode: boolean
}
export interface CalculationRow {
  id: string
  code: string
  autoCode: boolean
  inputs: Record<CoefficientRawKey, number | null>
}

export interface CoefficientDraftPayload {
  parameters: Omit<LabParameter, 'savedAt'>
  standardAddCount: number
  calculationAddCount: number
  standardRows: StandardContentRow[]
  calculationRows: CalculationRow[]
}
```

- [ ] **Step 1: Write failing transport tests**

```ts
await getCalculationDraft('standard-sample')
expect(request.get).toHaveBeenCalledWith('/calculation-drafts/standard-sample')
await saveCalculationDraft('coefficient', { baseRevision: 2, payload })
expect(request.put).toHaveBeenCalledWith('/calculation-drafts/coefficient', { baseRevision: 2, payload })
```

Assert a 409 Axios response becomes a typed `CalculationDraftConflictError` carrying `serverDraft`; other errors remain ordinary request failures.

- [ ] **Step 2: Write failing synchronization-state tests**

```ts
await draft.load()
expect(adapter.apply).toHaveBeenCalledWith(serverPayload)
expect(draft.revision.value).toBe(4)

serverGet.mockResolvedValue({ payload: defaults, revision: 0, updatedAt: null })
localStorage.setItem(adapter.legacyKey, JSON.stringify(legacyPayload))
await draft.load()
expect(serverPut).toHaveBeenCalledWith(expect.objectContaining({ baseRevision: 0, payload: legacyPayload }))
```

Also cover: server data wins over old local data; `getItem`/`setItem`/`removeItem` exceptions do not block server flow; debounce coalesces rapid edits; network save failure keeps snapshot and sets `error`; retry sends the same snapshot; a 409 preserves local snapshot; `useServerVersion()` applies server payload; confirmed overwrite sends the conflict revision; unmount clears timers.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/api/calculationDraft.test.ts src/composables/useCalculationDraft.test.ts src/components/calculation/CalculationDraftStatus.test.ts
```

Expected: FAIL because the API, types and composable do not exist.

- [ ] **Step 4: Implement the adapter and best-effort cache contract**

```ts
export interface CalculationDraftAdapter<T> {
  kind: CalculationDraftKind
  legacyStorageKey: string
  cacheStorageKey: string
  defaults: () => T
  normalize: (value: unknown) => T
  snapshot: () => T
  apply: (payload: T) => void
}
```

All storage operations use guarded helpers returning `null`/`false`, never throwing to the page. Mark the legacy key imported only after a successful server save by removing the old key; if that removal fails, server revision on next load still prevents re-import. Debounce at 500ms. On conflict, cancel automatic retries until the user chooses one of the two conflict actions.

Render only the actions allowed by the status:

```vue
<button v-if="status === 'error'" type="button" @click="$emit('retry')">重试保存</button>
<template v-if="status === 'conflict'">
  <button type="button" @click="$emit('useServer')">加载服务器版本</button>
  <button type="button" @click="$emit('overwrite')">覆盖服务器版本</button>
</template>
```

- [ ] **Step 5: Verify GREEN and commit**

```bash
pnpm exec vitest run src/api/calculationDraft.test.ts src/composables/useCalculationDraft.test.ts src/components/calculation/CalculationDraftStatus.test.ts
git add src/types/calculationDraft.ts src/api/calculationDraft.ts src/api/calculationDraft.test.ts src/composables/useCalculationDraft.ts src/composables/useCalculationDraft.test.ts src/components/calculation
git commit -m "feat: synchronize calculation draft state"
```

---

### Task 7: Standard Sample Shared State and Mobile Cards

**Files:**
- Create: `src/composables/useStandardSampleCalculation.ts`
- Create: `src/components/standard-sample/StandardSampleDesktopView.vue`
- Create: `src/components/standard-sample/MobileStandardSampleCards.vue`
- Create: `src/views/dashboard/StandardSampleCalculationPage.test.ts`
- Modify: `src/views/dashboard/StandardSampleCalculationPage.vue`

**Interfaces:**
- `useStandardSampleCalculation()` owns `aluminum`, `silicon`, `iron`, computed results and three reset methods.
- Both views receive the same reactive models/results and emit `resetAluminum`, `resetSilicon`, `resetIron`.
- The page owns `useCalculationDraft<StandardSampleDraft>()`; views never call storage or API.

- [ ] **Step 1: Write failing shared-formula and exclusive-mount tests**

```ts
expect(mountAtWidth(1440).find('[data-testid="standard-desktop-view"]').exists()).toBe(true)
expect(mountAtWidth(1440).find('[data-testid="standard-mobile-view"]').exists()).toBe(false)
expect(mountAtWidth(390).find('[data-testid="standard-mobile-view"]').exists()).toBe(true)
expect(mountAtWidth(390).find('[data-testid="standard-desktop-view"]').exists()).toBe(false)
```

On mobile, assert three cards named 铝/硅/铁, all calculation sections initially collapsed, two-column numeric inputs with `inputmode="decimal"`, immediate result updates through `calculateAluminumStandard`/`calculateRatioStandard`, and individual reset. On both layouts, mock the draft composable and assert the same snapshot is saved.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/StandardSampleCalculationPage.test.ts src/utils/standardSampleCalculator.test.ts
```

Expected: FAIL because the mobile/desktop components and shared calculation composable do not exist.

- [ ] **Step 3: Extract state without changing formulas or defaults**

```ts
export function useStandardSampleCalculation() {
  const aluminum = reactive<AluminumStandardInput>({ ...defaultAluminum })
  const silicon = reactive<RatioStandardInput>({ ...defaultSilicon })
  const iron = reactive<RatioStandardInput>({ ...defaultIron })
  return {
    aluminum, silicon, iron,
    aluminumResult: computed(() => calculateAluminumStandard(aluminum)),
    siliconResult: computed(() => calculateRatioStandard(silicon)),
    ironResult: computed(() => calculateRatioStandard(iron)),
    resetAluminum: () => Object.assign(aluminum, defaultAluminum),
    resetSilicon: () => Object.assign(silicon, defaultSilicon),
    resetIron: () => Object.assign(iron, defaultIron)
  }
}
```

Move the exact current desktop markup and CSS into `StandardSampleDesktopView.vue`. Do not alter labels, defaults, precision or result colors.

- [ ] **Step 4: Implement mobile cards and server draft orchestration**

```vue
<StandardSampleDesktopView v-if="!isMobileLayout" v-bind="viewBindings" />
<MobileStandardSampleCards v-else v-bind="viewBindings" />
<CalculationDraftStatus :status="draft.status.value" @retry="draft.retry" @use-server="draft.useServerVersion" @overwrite="confirmOverwrite" />
```

The page calls `draft.load()` on mount, watches the three input objects deeply only after load, and schedules saves. Mobile card headers show algorithm label plus coefficient/back-calculated summary. Conflict overwrite first uses `ElMessageBox.confirm`; cancel keeps the local draft untouched.

- [ ] **Step 5: Verify focused behavior and desktop parity**

```bash
pnpm exec vitest run \
  src/views/dashboard/StandardSampleCalculationPage.test.ts \
  src/composables/useCalculationDraft.test.ts \
  src/utils/standardSampleCalculator.test.ts
```

Expected: PASS; one editor is mounted at a time and formulas are still supplied only by the existing calculator.

- [ ] **Step 6: Commit Task 7**

```bash
git add src/composables/useStandardSampleCalculation.ts src/components/standard-sample src/views/dashboard/StandardSampleCalculationPage.vue src/views/dashboard/StandardSampleCalculationPage.test.ts
git commit -m "feat: add synchronized mobile standard calculation"
```

---

### Task 8: Coefficient Shared State and Mobile Sample Cards

**Files:**
- Create: `src/composables/useCoefficientCalculation.ts`
- Create: `src/components/coefficient/CoefficientCalculationDesktopView.vue`
- Create: `src/components/coefficient/MobileCoefficientCalculation.vue`
- Create: `src/components/coefficient/MobileCoefficientCalculation.test.ts`
- Modify: `src/views/dashboard/CoefficientCalculationPage.vue`
- Modify: `src/views/dashboard/CoefficientCalculationPage.test.ts`
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.vue`
- Modify: `src/components/lab-sheet/CoefficientApplicationDialog.test.ts`

**Interfaces:**
- `useCoefficientCalculation()` owns parameters, independent standard/calculation rows, add counts, selection/delete state, normalization, row operations and formula results.
- Desktop/mobile views consume one state/action contract; neither duplicates `calculateSampleResults`, `deleteCoefficientRows`, numbering or validation.
- Draft snapshot is the exact normalized server `CoefficientDraftPayload`.

- [ ] **Step 1: Write failing mobile structure and business-rule tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-coefficient-section"]')).toHaveLength(3)
expect(wrapper.get('[data-testid="mobile-standard-card-standard-1"]').text()).toContain('001')
expect(wrapper.get('[data-testid="mobile-calculation-card-calculation-1"]').text()).toContain('铁')
expect(wrapper.find('[data-testid="coefficient-desktop-view"]').exists()).toBe(false)
```

Assert the three sections are “标样含量”“标样系数计算”“九项参数” and initially collapsed; each standard card has six content inputs; each calculation card has six raw inputs and six existing formula results; adding, manual code, auto code, select all, independent deletion and “至少保留一个样品” match desktop behavior; the application drawer lists sorted actual sample indices and emits the chosen start index.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run \
  src/components/coefficient/MobileCoefficientCalculation.test.ts \
  src/views/dashboard/CoefficientCalculationPage.test.ts \
  src/components/lab-sheet/CoefficientApplicationDialog.test.ts
```

Expected: FAIL because the mobile component and extracted shared state do not exist.

- [ ] **Step 3: Extract the current state/actions and preserve desktop DOM semantics**

```ts
export interface CoefficientCalculationState {
  parameters: LabParameter
  standardRows: StandardContentRow[]
  calculationRows: CalculationRow[]
  standardAddCount: Ref<number>
  calculationAddCount: Ref<number>
  getCalculatedResult: (row: CalculationRow, field: CalculationResultKey) => number | null
}
```

Move row creation, normalization, independent selection/deletion, add counts and calculation functions unchanged into the composable. Move current tables into `CoefficientCalculationDesktopView.vue` and preserve all existing `data-testid` values so current tests continue proving desktop parity.

- [ ] **Step 4: Implement cards, foldable parameters and full-screen application selection**

```vue
<section v-for="section in sections" :key="section.key" data-testid="mobile-coefficient-section">
  <button class="mobile-section-toggle" :aria-expanded="expanded.has(section.key)" @click="toggle(section.key)">
    <strong>{{ section.label }}</strong><span>{{ expanded.has(section.key) ? '收起' : '展开' }}</span>
  </button>
  <component :is="section.component" v-if="expanded.has(section.key)" />
</section>
```

Use `MobileActionBar` only while deletion/selection mode is active. Set application dialog `fullscreen` from `isMobileLayout`; its confirm payload and existing data-table application path remain unchanged.

- [ ] **Step 5: Connect the coefficient draft and test conflicts/apply ordering**

On mount: load server draft, apply it to shared state, then connect/load the current lab sheet only when “应用系数” opens. Deep changes schedule a draft save. Before applying parameters, flush any pending sample-block save exactly as existing tests require; draft sync failure does not silently block calculation but remains visible and retryable.

```bash
pnpm exec vitest run \
  src/components/coefficient/MobileCoefficientCalculation.test.ts \
  src/views/dashboard/CoefficientCalculationPage.test.ts \
  src/components/lab-sheet/CoefficientApplicationDialog.test.ts \
  src/utils/coefficientRows.test.ts \
  src/utils/formulaEngine.test.ts
```

Expected: PASS, including existing application order, retry, duplicate-call and independent-row regressions.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/composables/useCoefficientCalculation.ts src/components/coefficient src/views/dashboard/CoefficientCalculationPage.vue src/views/dashboard/CoefficientCalculationPage.test.ts src/components/lab-sheet/CoefficientApplicationDialog.vue src/components/lab-sheet/CoefficientApplicationDialog.test.ts
git commit -m "feat: add synchronized mobile coefficient calculation"
```

---

### Task 9: Mobile Lab Report Template and SMS Template

**Files:**
- Create: `src/components/lab-report/MobileLabReportTemplatePanel.vue`
- Create: `src/components/lab-report/MobileLabReportSmsTemplatePanel.vue`
- Create: `src/views/dashboard/LabReportPage.mobile.test.ts`
- Modify: `src/views/dashboard/LabReportPage.vue`
- Modify: `src/components/lab-report/LabReportTemplatePanel.vue`
- Modify: `src/components/lab-report/LabReportSmsTemplatePanel.vue`
- Modify: `src/components/lab-report/LabReportDialog.vue`
- Modify: `src/components/lab-report/LabReportDialog.mobile.test.ts`
- Modify: `src/components/lab-report/LabSmsDialog.vue`

**Interfaces:**
- Desktop and mobile panels receive the same `v-model` types `LabReportTemplate` and `LabReportSmsTemplate`.
- Existing `createLabReportPngBlob()` and share/fallback flow remain the only image generator.
- Bottom navigation owns switching between image/SMS routes; the mobile page does not render duplicate tabs.

- [ ] **Step 1: Write failing mobile-page tests**

```ts
expect(imagePage.find('[data-testid="mobile-report-template"]').exists()).toBe(true)
expect(imagePage.find('.report-section-tabs').exists()).toBe(false)
expect(smsPage.find('[data-testid="mobile-sms-template"]').exists()).toBe(true)
expect(desktopPage.find('.report-section-tabs').exists()).toBe(true)
```

Assert image fields are grouped into collapsible “固定文本”“元素顺序”“显示选项”; preview width is constrained to the viewport; SMS has live preview, copy and restore-default actions; save failures retain inputs; share calls `navigator.share({ files })` when supported and otherwise shows PNG preview plus “长按保存图片”.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/LabReportPage.mobile.test.ts src/components/lab-report/LabReportDialog.mobile.test.ts
```

Expected: FAIL because mobile template panels are absent and page tabs are still duplicated on mobile.

- [ ] **Step 3: Implement exclusive panels with shared models**

```vue
<template v-if="isMobileLayout">
  <MobileLabReportTemplatePanel v-if="activeSection === 'image'" v-model="reportTemplate" />
  <MobileLabReportSmsTemplatePanel v-else v-model="smsTemplate" />
</template>
<template v-else>
  <div class="report-section-tabs">...</div>
  <LabReportTemplatePanel v-if="activeSection === 'image'" v-model="reportTemplate" />
  <LabReportSmsTemplatePanel v-else v-model="smsTemplate" />
</template>
```

Use existing load/save utilities and template types. Mobile inputs use one column, 44px controls and collapsible groups; do not change template defaults, element ordering semantics, SMS text, generated filename or PNG rendering code.

- [ ] **Step 4: Verify report behavior and PWA network-only policy**

```bash
pnpm exec vitest run \
  src/views/dashboard/LabReportPage.mobile.test.ts \
  src/components/lab-report \
  src/pwa/options.test.ts
```

Expected: PASS; generated content is unchanged and `/uploads` remains `NetworkOnly`.

- [ ] **Step 5: Commit Task 9**

```bash
git add src/views/dashboard/LabReportPage.vue src/views/dashboard/LabReportPage.mobile.test.ts src/components/lab-report
git commit -m "feat: adapt lab report templates for mobile"
```

---

### Task 10: Mobile Medicine Stock, Inbound and Outbound

**Files:**
- Create: `src/components/medicine/MobileMedicineStockList.vue`
- Create: `src/components/medicine/MobileMedicineMovementList.vue`
- Modify: `src/views/dashboard/MedicineInventoryStockPage.vue`
- Modify: `src/views/dashboard/MedicineInventoryInboundPage.vue`
- Modify: `src/views/dashboard/MedicineInventoryOutboundPage.vue`
- Modify: `src/views/dashboard/MedicineInventoryPages.test.ts`

**Interfaces:**
- Mobile list components receive rows/loading/selection and emit only page-level events (`filter`, `correct`, `retry`).
- Existing pages retain all API calls, quantity validation, common-name rules, insufficient-stock conflict refresh and correction confirmation.

- [ ] **Step 1: Add failing mobile medicine tests**

```ts
expect(stock.findAll('[data-testid="mobile-medicine-stock-card"]')).toHaveLength(3)
expect(inbound.find('[data-testid="mobile-inbound-form"]').exists()).toBe(true)
expect(outbound.find('[data-testid="mobile-outbound-card"]').text()).toContain('剩余库存')
expect(wrapper.find('.el-table').exists()).toBe(false)
```

Assert stock cards show name/quantity/unit/update time; filters open a `MobileFilterDrawer`; inbound/outbound forms default collapsed; movement records are cards; correction opens a full-screen reason form and still requires confirmation; inputs keep `inputmode="decimal"`; load errors retain active filters and retry.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/MedicineInventoryPages.test.ts
```

Expected: new mobile assertions FAIL while current desktop/business tests stay green.

- [ ] **Step 3: Implement mobile-only rendering around existing page state**

```vue
<MobileMedicineStockList v-if="isMobileLayout" :items="visibleItems" :loading="loading" />
<el-table v-else :data="visibleItems">...</el-table>
```

For inbound/outbound, keep one shared reactive `form` and handler set; use `v-if="isMobileLayout"` for mobile cards/forms and `v-else` for current panels/tables. Set correction dialog fullscreen only on mobile. Do not alter API payloads, unit locks, quantity precision, date queries, stale-request protection or correction-of-correction rules.

- [ ] **Step 4: Verify all medicine regressions and commit**

```bash
pnpm exec vitest run src/views/dashboard/MedicineInventoryPages.test.ts src/utils/medicineInventory.test.ts src/api/medicineInventory.mock.test.ts
git add src/components/medicine src/views/dashboard/MedicineInventoryStockPage.vue src/views/dashboard/MedicineInventoryInboundPage.vue src/views/dashboard/MedicineInventoryOutboundPage.vue src/views/dashboard/MedicineInventoryPages.test.ts
git commit -m "feat: adapt medicine inventory for mobile"
```

---

### Task 11: Mobile Reports Single Page

**Files:**
- Create: `src/components/report/MobileReportFilter.vue`
- Create: `src/views/dashboard/ReportPage.mobile.test.ts`
- Modify: `src/views/dashboard/ReportPage.vue`
- Modify: `src/components/report/ReportSummaryCards.vue`
- Modify: `src/components/report/ReportChart.vue`
- Modify: `src/components/report/SampleDetectionReport.vue`
- Modify: `src/components/report/FinanceReport.vue`

**Interfaces:**
- `MobileReportFilter` mirrors the current `ReportFilterBar` v-model/update/search contract.
- Report Store, API and computed report data stay shared; chart data is not recalculated in the view.

- [ ] **Step 1: Write failing single-page mobile tests**

```ts
expect(wrapper.find('.mobile-secondary-nav').exists()).toBe(false)
expect(wrapper.get('[data-testid="mobile-report-filter"]').text()).toContain('筛选')
expect(wrapper.findAll('.summary-card')).toHaveLength(expectedSummaryCount)
expect(wrapper.get('[data-testid="mobile-report-charts"]').classes()).toContain('mobile-report-charts--single-column')
```

Assert summary cards are two columns at 390px, charts stack one per row, touch tooltip handlers exist, empty/loading/error states remain visible, and desktop uses the current `ReportFilterBar`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/ReportPage.mobile.test.ts src/components/report/SampleDetectionReport.test.ts
```

Expected: FAIL because the mobile filter and explicit chart layout are absent.

- [ ] **Step 3: Implement responsive report presentation**

```vue
<MobileReportFilter v-if="isMobileLayout" v-bind="filterBindings" @search="reportStore.loadReport" />
<ReportFilterBar v-else v-bind="filterBindings" @search="reportStore.loadReport" />
```

Use CSS grid `repeat(2,minmax(0,1fr))` for mobile summaries and `minmax(0,1fr)` for charts. Add pointer/touch-compatible chart tooltip activation without changing dataset, labels, totals or report mode calculations.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/ReportPage.mobile.test.ts src/components/report
git add src/components/report src/views/dashboard/ReportPage.vue src/views/dashboard/ReportPage.mobile.test.ts
git commit -m "feat: adapt reports for mobile"
```

---

### Task 12: Mobile Customer Overview Single Page

**Files:**
- Create: `src/components/customer-overview/MobileCustomerOverviewList.vue`
- Modify: `src/views/dashboard/CustomerOverviewPage.vue`
- Modify: `src/views/dashboard/CustomerOverviewPage.test.ts`

**Interfaces:**
- Mobile list props: `rows`, `summary`, `loading`; emits `showDetails` only.
- Filtering and sorting continue to use existing `selectedCustomerKeys`, `sortField`, `sortDirection`, `displayRows` and `summary` computed values.

- [ ] **Step 1: Add failing mobile customer tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-customer-card"]')).toHaveLength(2)
expect(wrapper.get('[data-testid="mobile-customer-card"]').text()).toContain('客户甲')
expect(wrapper.get('[data-testid="mobile-customer-card"]').text()).toContain('3 个样品')
expect(wrapper.find('.el-table').exists()).toBe(false)
```

Assert the filter uses a full-screen multi-select, active sort appears in the summary, card detail shows contact/first date/last date/amount, loading failure offers retry without clearing selections, and the page has no secondary bottom navigation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/CustomerOverviewPage.test.ts
```

Expected: mobile assertions FAIL while existing totals/filter assertions pass.

- [ ] **Step 3: Implement mobile cards with the same computed rows**

```vue
<MobileCustomerOverviewList v-if="isMobileLayout" :rows="displayRows" :summary="summary" :loading="loading" />
<el-table v-else :data="displayRows">...</el-table>
```

Move mobile filter controls into `MobileFilterDrawer`; do not change `getCustomerOverview()`, customer keys, money precision or sorting cycle.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/CustomerOverviewPage.test.ts
git add src/components/customer-overview src/views/dashboard/CustomerOverviewPage.vue src/views/dashboard/CustomerOverviewPage.test.ts
git commit -m "feat: adapt customer overview for mobile"
```

---

### Task 13: Mobile Blacklist Single Page

**Files:**
- Create: `src/components/blacklist/MobileBlacklistList.vue`
- Create: `src/components/blacklist/MobileBlacklistForm.vue`
- Create: `src/views/dashboard/BlacklistPage.mobile.test.ts`
- Modify: `src/views/dashboard/BlacklistPage.vue`
- Modify: `src/components/blacklist/BlacklistTable.vue`
- Modify: `src/components/blacklist/BlacklistUploadForm.vue`
- Modify: `src/components/blacklist/BlacklistTable.test.ts`

**Interfaces:**
- Mobile list emits `search`, `supplement`, `delete` with the same payloads as `BlacklistTable`.
- Mobile form receives `save: (payload: BlacklistPayload) => Promise<void>` so it can retain inputs on rejection and reset only after success.
- Existing Store, validation, upload, hit highlight, access guard and confirmation remain page-owned.

- [ ] **Step 1: Write failing mobile blacklist tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-blacklist-card"]')).toHaveLength(records.length)
expect(wrapper.get('[data-testid="mobile-blacklist-card"]').text()).toContain('命中原因')
expect(wrapper.get('[data-testid="mobile-blacklist-create"]').exists()).toBe(true)
expect(wrapper.find('.blacklist-table').exists()).toBe(false)
```

Assert search/filter drawer, add form, supplement full-screen form, maximum two images, money decimal keyboard, highlighted `?hit=` card scroll, delete confirmation, failed save retaining every input and successful save clearing the form. The single page must not show secondary navigation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts
```

Expected: FAIL because mobile cards/forms are absent.

- [ ] **Step 3: Implement exclusive mobile/desktop views**

```vue
<MobileBlacklistList v-if="isMobileLayout" v-bind="listBindings" @supplement="openSupplement" @delete="handleDelete" />
<BlacklistTable v-else v-bind="listBindings" @supplement="openSupplement" @delete="handleDelete" />
<MobileBlacklistForm v-if="isMobileLayout" :save="handleCreate" />
<BlacklistUploadForm v-else @submit="handleCreate" />
```

The supplement dialog uses `MobileFullscreenDialog` on mobile and the existing `el-dialog` on desktop, both bound to the same `supplementForm`. Keep `validateBlacklistPayload`, Store calls, image URL logic and confirmation text shared.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts
git add src/components/blacklist src/views/dashboard/BlacklistPage.vue src/views/dashboard/BlacklistPage.mobile.test.ts
git commit -m "feat: adapt blacklist for mobile"
```

---

### Task 14: Mobile Finance Expense Entry and Monthly Expense Cards

**Files:**
- Create: `src/components/finance/MobileFinanceEntryForm.vue`
- Create: `src/components/finance/MobileFinanceEntryList.vue`
- Create: `src/components/finance/useFinanceEntryDraft.ts`
- Create: `src/components/finance/useFinanceEntryDraft.test.ts`
- Create: `src/views/dashboard/FinancePage.mobile.test.ts`
- Modify: `src/views/dashboard/FinancePage.vue`
- Modify: `src/components/finance/FinanceEntryForm.vue`
- Modify: `src/components/finance/FinanceMonthTable.vue`

**Interfaces:**
- Mobile entry form receives `save: (payloads: FinancePayload[]) => Promise<void>`; desktop keeps the existing event contract and visual behavior.
- Mobile list props/events mirror `FinanceMonthTable`: `month`, `entries`, `loading`, `deletingId`, `monthChange`, `deleteRequest`.
- Existing `useFinanceStore()` remains the only mutation owner.

- [ ] **Step 1: Write failing mobile expense tests**

```ts
expect(wrapper.find('[data-testid="mobile-finance-entry-form"]').exists()).toBe(true)
expect(wrapper.findAll('[data-testid="mobile-expense-draft-card"]')).toHaveLength(1)
expect(wrapper.findAll('[data-testid="mobile-expense-card"]')).toHaveLength(entries.length)
expect(wrapper.find('.expense-entry-table').exists()).toBe(false)
```

Assert adding N draft cards, retaining at least one row, required item/positive amount/payment method validation, decimal keyboard, up to ten screenshots, submit payload equality, form reset only after successful parent submit, month filter drawer, screenshot preview, delete-request reason prompt and pending-review badge.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/FinancePage.mobile.test.ts
```

Expected: FAIL because mobile finance form/list components do not exist.

- [ ] **Step 3: Implement mobile components using existing upload/validation rules**

```vue
<MobileFinanceEntryForm v-if="isMobileLayout" :save="handleCreate" />
<FinanceEntryForm v-else @submit="handleCreate" />
<MobileFinanceEntryList v-if="isMobileLayout" v-bind="monthTableBindings" @delete-request="handleDeleteRequest" />
<FinanceMonthTable v-else v-bind="monthTableBindings" @delete-request="handleDeleteRequest" />
```

Extract shared draft helpers (`createRow`, `validateRows`, `buildPayloads`) into `src/components/finance/useFinanceEntryDraft.ts`; both desktop and mobile forms consume it. `useFinanceEntryDraft.test.ts` must prove both views produce identical `FinancePayload[]` and upload the same local files. The mobile form awaits `save(payloads)`, retains rows on rejection and resets only after resolution; desktop keeps its current event/reset behavior. Do not duplicate `uploadImages` behavior or change Store/API calls.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/FinancePage.mobile.test.ts src/components/finance/useFinanceEntryDraft.test.ts
git add src/components/finance src/views/dashboard/FinancePage.vue src/views/dashboard/FinancePage.mobile.test.ts
git commit -m "feat: adapt expense finance for mobile"
```

---

### Task 15: Mobile Income and Unsettled Payment Workflows

**Files:**
- Create: `src/components/finance/MobileIncomeList.vue`
- Create: `src/components/finance/MobileUnsettledList.vue`
- Create: `src/views/dashboard/FinanceIncomePage.mobile.test.ts`
- Modify: `src/views/dashboard/FinanceIncomePage.vue`
- Modify: `src/views/dashboard/FinanceUnsettledPage.vue`
- Modify: `src/views/dashboard/FinanceUnsettledPage.test.ts`

**Interfaces:**
- `MobileIncomeList` receives the existing report, visible rows/statuses and formatting callback; it performs no API work.
- `MobileUnsettledList` receives filtered rows and selected IDs; emits `selectionChange`, `settle`, `jump`.
- Existing `useFinanceBillsStore()` owns month loading, single/batch settlement and conflict errors.

- [ ] **Step 1: Write failing income-card tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-income-day-card"]')).toHaveLength(visibleRows.length)
expect(wrapper.get('[data-testid="mobile-income-summary"]').text()).toContain('收入合计')
expect(wrapper.find('.el-table').exists()).toBe(false)
```

Assert month filter, payment-status counts, daily customer/sample totals, zero-row omission and exact `¥0.00` precision. Desktop still mounts its current table.

- [ ] **Step 2: Write failing unsettled selection/batch tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-unsettled-card"]')).toHaveLength(2)
await wrapper.get('[data-testid="select-unsettled-sample-1"]').trigger('click')
expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('已选 1 项')
expect(wrapper.get('[data-testid="mobile-unsettled-action-bar"]').text()).toContain('¥6.00')
```

Assert filter drawer, single settlement, selected amount total, confirmation before batch settlement, failure preserving selection, successful refresh/clear, and sample jump route/query.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/FinanceIncomePage.mobile.test.ts src/views/dashboard/FinanceUnsettledPage.test.ts
```

Expected: mobile assertions FAIL.

- [ ] **Step 4: Implement mobile cards and action bar around the existing Store**

```vue
<MobileUnsettledList
  v-if="isMobileLayout"
  :rows="filteredRows"
  :selected-ids="selectedRows.map((row) => row.sampleId)"
  @selection-change="handleMobileSelectionChange"
  @settle="handleSettle"
  @jump="jumpToSample"
/>
<MobileActionBar v-if="isMobileLayout && selectedRows.length" data-testid="mobile-unsettled-action-bar">...</MobileActionBar>
```

Use the same `handleBatchSettle()` and `markSample(s)AsPaid` Store methods; do not create a separate settlement calculation.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/FinanceIncomePage.mobile.test.ts src/views/dashboard/FinanceUnsettledPage.test.ts src/stores/financeBills.test.ts src/api/financeBills.test.ts
git add src/components/finance/MobileIncomeList.vue src/components/finance/MobileUnsettledList.vue src/views/dashboard/FinanceIncomePage.vue src/views/dashboard/FinanceIncomePage.mobile.test.ts src/views/dashboard/FinanceUnsettledPage.vue src/views/dashboard/FinanceUnsettledPage.test.ts
git commit -m "feat: adapt income and unsettled finance for mobile"
```

---

### Task 16: Mobile Monthly Settlement Cards, Editor and Export

**Files:**
- Create: `src/components/finance/MobileMonthlySettlementList.vue`
- Create: `src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts`
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.vue`
- Modify: `src/views/dashboard/FinanceMonthlySettlementPage.test.ts`
- Modify: `src/components/finance/MonthlySettlementBillExportDialog.vue`
- Modify: `src/components/finance/MonthlySettlementBillExportDialog.test.ts`

**Interfaces:**
- Mobile summary cards emit `statusChange`, `paidAmountChange`, `remarkCommit`, `openDailyDetails`.
- Existing page handlers remain authoritative for clamping paid amount, sorting and Store writes.
- Export continues to use the existing PNG content/filename generator and mobile share fallback.

- [ ] **Step 1: Write failing mobile settlement tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-monthly-summary-card"]')).toHaveLength(summaryRows.length)
expect(wrapper.get('[data-testid="mobile-monthly-summary-card"]').text()).toContain('部分结款')
expect(wrapper.find('.monthly-settlement-table').exists()).toBe(false)
```

Assert month and customer filters, summary amount/paid/unpaid values, three-state status, paid amount clamped to `[0, amount]`, blur remark save, cyclic sorting parity, daily customer detail full-screen panel, element count text, and export button.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/components/finance/MonthlySettlementBillExportDialog.test.ts
```

Expected: mobile assertions FAIL.

- [ ] **Step 3: Implement mobile summary/detail components**

```vue
<MobileMonthlySettlementList
  v-if="isMobileLayout"
  :summaries="report?.summaries || []"
  :daily-rows="filteredDailyRows"
  @status-change="handleStatusChange"
  @paid-amount-change="handlePaidAmountChange"
  @remark-commit="handleRemarkBlur"
/>
```

Use full-screen export dialog on mobile, call system share when `navigator.canShare({ files })`, otherwise keep image preview mounted and display “长按保存图片”. Desktop download behavior and generated bill content stay unchanged.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/components/finance/MonthlySettlementBillExportDialog.test.ts src/stores/financeBills.test.ts
git add src/components/finance/MobileMonthlySettlementList.vue src/components/finance/MonthlySettlementBillExportDialog.vue src/components/finance/MonthlySettlementBillExportDialog.test.ts src/views/dashboard/FinanceMonthlySettlementPage.vue src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts
git commit -m "feat: adapt monthly settlement for mobile"
```

---

### Task 17: Mobile Prepaid Recharge, Accounts and Usage

**Files:**
- Create: `src/components/finance/MobilePrepaidList.vue`
- Create: `src/views/dashboard/FinancePrepaidPages.mobile.test.ts`
- Modify: `src/views/dashboard/FinancePrepaidAddPage.vue`
- Modify: `src/views/dashboard/FinancePrepaidCustomersPage.vue`

**Interfaces:**
- `MobilePrepaidList` renders either recharge, customer-balance or usage rows selected by a `kind` prop.
- Existing Store methods own recharge creation, delete request, report load and remark saves.
- `/finance/prepaid/customers` stays active under bottom child `/finance/prepaid/add` and is reached from an internal page action.

- [ ] **Step 1: Write failing prepaid mobile tests**

```ts
expect(addPage.get('[data-testid="mobile-prepaid-form"]').exists()).toBe(true)
expect(addPage.findAll('[data-testid="mobile-prepaid-recharge-card"]')).toHaveLength(recharges.length)
expect(customers.findAll('[data-testid="mobile-prepaid-customer-card"]')).toHaveLength(customers.length)
expect(activeSecondaryLabel()).toBe('预存款')
```

Assert customer full-screen selector, amount/times numeric keyboards, duplicate-customer confirmation totals, successful reset, failed save retains form, delete-reason request, balance card, usage detail, customer/usage remark blur saves and two-way internal navigation.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/FinancePrepaidPages.mobile.test.ts src/stores/financeBills.test.ts
```

Expected: FAIL because mobile prepaid views do not exist.

- [ ] **Step 3: Implement prepaid mobile views with existing handlers**

```vue
<MobilePrepaidList v-if="isMobileLayout" kind="recharge" :rows="store.prepaidRecharges" @delete-request="handleDeleteRequest" />
<el-table v-else :data="store.prepaidRecharges">...</el-table>
```

On the customer page use `kind="customer"` and a nested full-screen usage panel. Do not change money rounding, available-times totals, request-deletion authorization, report derivation or remark endpoints.

- [ ] **Step 4: Run phase-level finance verification and commit**

```bash
pnpm exec vitest run \
  src/views/dashboard/FinancePage.mobile.test.ts \
  src/views/dashboard/FinanceIncomePage.mobile.test.ts \
  src/views/dashboard/FinanceUnsettledPage.test.ts \
  src/views/dashboard/FinanceMonthlySettlementPage.test.ts \
  src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts \
  src/views/dashboard/FinancePrepaidPages.mobile.test.ts \
  src/stores/financeBills.test.ts
git add src/components/finance/MobilePrepaidList.vue src/views/dashboard/FinancePrepaidAddPage.vue src/views/dashboard/FinancePrepaidCustomersPage.vue src/views/dashboard/FinancePrepaidPages.mobile.test.ts
git commit -m "feat: adapt prepaid finance for mobile"
```

---

### Task 18: Mobile Attendance Shell, Filters, Calendar and Day Editing

**Files:**
- Create: `src/views/dashboard/employee-attendance/MobileAttendanceCalendar.vue`
- Create: `src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts`
- Modify: `src/views/dashboard/employee-attendance/EmployeeAttendancePageShell.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`
- Modify: `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.vue`
- Modify: `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.test.ts`
- Modify: `src/views/dashboard/employee-attendance/AttendanceOverviewPanel.vue`
- Modify: `src/views/dashboard/employee-attendance/ScheduleDayDrawer.vue`
- Modify: `src/views/dashboard/employee-attendance/ScheduleBatchDialog.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- `EmployeeAttendancePageShell` keeps current props/events and selects desktop inline filters or `MobileFilterDrawer` from `useMobileLayout()`.
- Mobile calendar props/events match `MonthlyScheduleCalendar`: `month`, `days`, `selectedDates`, `batchMode`, `selectDate`, `toggleDate`.
- Schedule/day/batch payloads remain unchanged.

- [ ] **Step 1: Write failing mobile shell/calendar tests**

```ts
expect(wrapper.get('[data-testid="mobile-attendance-filter"]').text()).toContain('2026-08')
expect(wrapper.findAll('[data-testid="mobile-calendar-day"]')).toHaveLength(31)
expect(wrapper.find('[data-testid="monthly-schedule-calendar"]').exists()).toBe(false)
expect(wrapper.findAll('[data-testid="attendance-overview-card"]')).toHaveLength(expectedCardCount)
```

Assert selected employee/month summary, filter drawer, two-column overview cards, issue record cards, seven-column touchable date grid, text status plus color, planned/actual/leave/overtime/exception summaries, batch selection, current month rest quota and action bar.

- [ ] **Step 2: Add failing full-screen edit tests**

Assert tapping a date opens `ScheduleDayDrawer` as full-screen on mobile; adding/removing multiple same-day intervals, `24:00` end, break/work-hour display, validation, failed-save input retention and delete confirmation remain. Batch dialog states exact overwrite count and requires confirmation; copy previous month requires overwrite confirmation.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
pnpm exec vitest run \
  src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts \
  src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.test.ts \
  src/views/dashboard/EmployeeAttendancePages.test.ts
```

Expected: mobile calendar assertions FAIL while existing calendar rules remain green.

- [ ] **Step 4: Implement exclusive calendars and mobile filter/action layout**

```vue
<MobileAttendanceCalendar v-if="isMobileLayout" v-bind="calendarBindings" @select-date="openDay" @toggle-date="toggleDate" />
<MonthlyScheduleCalendar v-else v-bind="calendarBindings" @select-date="openDay" @toggle-date="toggleDate" />
```

Keep `load()` latest-request protection and Store/API calls unchanged. Fullscreen state affects only Element Plus presentation. Use `MobileActionBar` for batch apply and keep it above the employee-attendance secondary rail.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts
git add src/views/dashboard/employee-attendance src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: adapt attendance schedules for mobile"
```

---

### Task 19: Mobile Employee Directory and Attendance Records

**Files:**
- Create: `src/views/dashboard/employee-attendance/MobileEmployeeList.vue`
- Create: `src/views/dashboard/employee-attendance/MobileAttendanceRecordList.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeDirectoryPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- `MobileEmployeeList` emits `create`, `edit`, `reveal`, `previewPhoto`, `remove` using existing page handlers.
- `MobileAttendanceRecordList` emits `create`, `edit`, `remove` and receives locked status.
- Sensitive data reveal and photo blobs stay behind existing access-grant/session logic.

- [ ] **Step 1: Add failing employee-card tests**

```ts
expect(directory.findAll('[data-testid="mobile-employee-card"]')).toHaveLength(employeeCount)
expect(directory.get('[data-testid="mobile-employee-card-emp-1"]').text()).toContain('在职')
expect(directory.find('.el-table').exists()).toBe(false)
```

Assert search/status drawer, avatar/photo state, masked ID, full-screen create/edit, blank sensitive edit fields, failure retaining all entered values, private photo preview/revoke and access-password-controlled reveal.

- [ ] **Step 2: Add failing attendance-record card tests**

```ts
expect(records.findAll('[data-testid="mobile-attendance-record-card"]')).toHaveLength(recordCount)
expect(records.get('[data-testid="mobile-attendance-record-card"]').text()).toContain('实际时段')
expect(records.get('[data-testid="mobile-attendance-record-card"]').text()).toContain('异常')
```

Assert month mode and date-range mode are mutually exclusive, employee/date/status filters, full-screen multi-interval edit, same-day interval validation, explicit absence disabled when intervals exist, and payroll-locked records cannot edit/delete.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts
```

Expected: new mobile assertions FAIL.

- [ ] **Step 4: Implement mobile lists/forms and preserve page actions**

```vue
<MobileEmployeeList v-if="isMobileLayout" :employees="filtered" @edit="openEdit" @reveal="reveal" />
<el-table v-else :data="filtered">...</el-table>
```

Use the same pattern for attendance records. Mobile dialogs use `MobileFullscreenDialog`; desktop dialogs retain widths. Do not move sensitive fields into the card props or persist revealed values.

- [ ] **Step 5: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts
git add src/views/dashboard/employee-attendance/MobileEmployeeList.vue src/views/dashboard/employee-attendance/MobileAttendanceRecordList.vue src/views/dashboard/employee-attendance/EmployeeDirectoryPage.vue src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: adapt employee records for mobile"
```

---

### Task 20: Mobile Leave Management

**Files:**
- Create: `src/views/dashboard/employee-attendance/MobileLeaveList.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- Mobile leave cards emit `edit`, `approve`, `reject`, `remove`.
- Leave type cards emit `editType`, `removeType`.
- Existing Store/API and server payroll/quota rules remain the only business authority.

- [ ] **Step 1: Write failing mobile leave tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-leave-card"]')).toHaveLength(leaveCount)
expect(wrapper.get('[data-testid="mobile-leave-card"]').text()).toContain('待审批')
expect(wrapper.findAll('[data-testid="mobile-leave-type-card"]')).toHaveLength(typeCount)
```

Assert employee/status/date filters, employee/type/time/reason/status card fields, full-screen create/edit, approve confirmation, reject-reason prompt, locked/processed actions disabled, leave type active/quota flags and failure-retained form.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts
pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts
```

Expected: mobile assertions FAIL; server quota tests continue passing.

- [ ] **Step 3: Implement mobile cards using existing handlers**

```vue
<MobileLeaveList v-if="isMobileLayout" :rows="store.leaves" :types="store.leaveTypes" @approve="(id) => review(id, 'approve')" @reject="(id) => review(id, 'reject')" />
<el-table v-else :data="store.leaves">...</el-table>
```

Keep tabs for records/types but make each tab touch-friendly. Do not calculate rest-quota or salary effects in Vue.

- [ ] **Step 4: Verify and commit**

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts
pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts src/employee-attendance/payroll.service.test.ts
git add src/views/dashboard/employee-attendance/MobileLeaveList.vue src/views/dashboard/employee-attendance/EmployeeLeavePage.vue src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: adapt leave management for mobile"
```

---

### Task 21: Mobile Compensation and Payroll

**Files:**
- Create: `src/views/dashboard/employee-attendance/MobileCompensationList.vue`
- Create: `src/views/dashboard/employee-attendance/MobilePayrollList.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeCompensationPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeePayrollPage.vue`
- Modify: `src/components/employee-attendance/PayrollExportDialog.vue`
- Modify: `src/components/employee-attendance/PayrollExportDialog.test.ts`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- Compensation mobile component emits the existing commission/type/bonus create/edit/delete operations.
- Payroll mobile component emits `adjust`, `removeAdjustment`, `confirm`, `reopen`, `exportSummary`, `exportEmployee`.
- Payroll totals, locks, snapshot and export content stay in the existing Store/API/server contracts.

- [ ] **Step 1: Write failing compensation-card tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-commission-card"]')).toHaveLength(commissionCount)
expect(wrapper.findAll('[data-testid="mobile-bonus-card"]')).toHaveLength(bonusCount)
expect(wrapper.get('[data-testid="mobile-commission-card"]').text()).toContain('¥')
```

Assert employee/month filter summary, records/types/bonuses tabs, amount decimal keyboard, full-screen forms, referenced type cannot edit, locked rows cannot mutate, batch/save status in the action area and failed save input retention.

- [ ] **Step 2: Write failing payroll-card tests**

```ts
expect(wrapper.findAll('[data-testid="mobile-payroll-card"]')).toHaveLength(payrollItemCount)
expect(wrapper.get('[data-testid="mobile-payroll-card"]').text()).toContain('应发')
expect(wrapper.get('[data-testid="mobile-payroll-card"]').text()).toContain('实发')
```

Assert expandable salary composition, deductions/bonuses/adjustments, draft vs confirmed label, generate/refresh, adjustment full-screen form, confirm and reopen confirmations, locked behavior, summary export and employee slip export.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/components/employee-attendance/PayrollExportDialog.test.ts
```

Expected: mobile assertions FAIL.

- [ ] **Step 4: Implement mobile cards and export presentation**

```vue
<MobilePayrollList
  v-if="isMobileLayout"
  :run="store.payrollRun"
  @confirm="confirm"
  @reopen="reopen"
  @export-summary="openSummaryExport"
  @export-employee="openEmployeeExport"
/>
```

Use the same page handlers for all actions. Payroll export dialog becomes fullscreen on mobile and preserves desktop PDF/PNG/download behavior and filename. Do not recompute salary components in the mobile component.

- [ ] **Step 5: Run attendance phase verification and commit**

```bash
pnpm exec vitest run \
  src/views/dashboard/EmployeeAttendancePages.test.ts \
  src/views/dashboard/employee-attendance \
  src/components/employee-attendance \
  src/stores/employeeAttendance.test.ts \
  src/api/employeeAttendance.adapters.test.ts \
  src/api/employeeAttendance.mock.test.ts
pnpm --filter yangshao-server exec vitest run src/employee-attendance
git add src/views/dashboard/employee-attendance/MobileCompensationList.vue src/views/dashboard/employee-attendance/MobilePayrollList.vue src/views/dashboard/employee-attendance/EmployeeCompensationPage.vue src/views/dashboard/employee-attendance/EmployeePayrollPage.vue src/components/employee-attendance/PayrollExportDialog.vue src/components/employee-attendance/PayrollExportDialog.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: adapt compensation and payroll for mobile"
```

---

### Task 22: Full Route Coverage, Regression, Browser Acceptance and Handoff

**Files:**
- Create: `src/views/dashboard/MobileRouteCoverage.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- No new business interface. This task proves all prior interfaces together and prepares real-iPhone handoff.

- [ ] **Step 1: Write the failing route-coverage matrix before final UI changes**

```ts
const routes = [
  '/data', '/data/standard-sample', '/data/coefficient',
  '/lab-report/image-template', '/lab-report/sms-template',
  '/employee-attendance/schedules', '/employee-attendance/employees', '/employee-attendance/records',
  '/employee-attendance/leave', '/employee-attendance/compensation', '/employee-attendance/payroll',
  '/finance/expenses', '/finance/income', '/finance/unsettled', '/finance/monthly-settlement',
  '/finance/prepaid/add', '/finance/prepaid/customers',
  '/medicine-inventory/stock', '/medicine-inventory/inbound', '/medicine-inventory/outbound',
  '/reports', '/customers-overview', '/blacklist'
]
expect(coveredMobileRoutes).toEqual(routes)
```

Derive `coveredMobileRoutes` from `appRouter.getRoutes()` after excluding redirects and login; do not hard-code a second coverage list that merely repeats `routes`. For every route assert: one mobile page root at mobile width, no desktop table/editor mounted where a mobile alternate exists, no duplicate editable form, correct secondary group/current item, and no secondary rail for reports/customer/blacklist. Add desktop-width assertions that current desktop roots remain mounted. Whole-page horizontal overflow is verified at the real browser sizes in Step 6, not with JSDOM layout metrics.

Also lock the existing access-feature mapping:

```ts
expect(featureForPath('/employee-attendance/payroll')).toBe('EMPLOYEE_ATTENDANCE')
expect(featureForPath('/finance/monthly-settlement')).toBe('FINANCE')
expect(featureForPath('/medicine-inventory/outbound')).toBe('MEDICINE_INVENTORY')
expect(featureForPath('/reports')).toBe('REPORTS')
expect(featureForPath('/customers-overview')).toBe('CUSTOMER_OVERVIEW')
expect(featureForPath('/blacklist')).toBe('BLACKLIST')
```

- [ ] **Step 2: Run coverage test and repair only uncovered routes**

```bash
pnpm exec vitest run src/views/dashboard/MobileRouteCoverage.test.ts
```

Expected initially: FAIL listing any route without an explicit mobile acceptance marker. Add only the missing marker/layout binding in the owning task component, then rerun to PASS.

- [ ] **Step 3: Lock Vitest workspace exclusions**

```ts
import { configDefaults, defineConfig } from 'vitest/config'

test: {
  environment: 'jsdom',
  globals: true,
  exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.pnpm-store/**', '**/.superpowers/**']
}
```

Run a targeted test after the config change and confirm no legitimate `src/**` or `server/src/**` tests disappear.

- [ ] **Step 4: Run complete automated regression**

```bash
pnpm test
pnpm test:server
pnpm exec vue-tsc --noEmit
pnpm build
pnpm build:admin
pnpm build:server
pnpm --filter yangshao-server exec prisma format
pnpm --filter yangshao-server exec prisma validate
pnpm --filter yangshao-server exec prisma generate
```

Expected: every command exits 0. Record exact file/test counts in the handoff. Confirm `src/pwa/options.test.ts` still proves `/api`, `/uploads`, auth and realtime traffic are `NetworkOnly`.

- [ ] **Step 5: Review migration without applying it to production**

```bash
git diff --check
git diff -- server/prisma/schema.prisma server/prisma/migrations/20260815000000_add_frontend_calculation_drafts/migration.sql
rg -n "DROP|DELETE|TRUNCATE|force-reset|seed" server/prisma/migrations/20260815000000_add_frontend_calculation_drafts/migration.sql
```

Expected: diff check passes; migration contains only additive DDL; destructive search returns no matches. Do not run production `migrate deploy` in this task.

- [ ] **Step 6: Start local services and perform browser acceptance**

Use local Vite/server processes and inspect these viewports in the in-app browser:

```text
375×812
390×844
393×882
430×932
844×390 landscape
1440×900 desktop
```

At each phone portrait size, verify login, first-level drawer, secondary swipe/current-item visibility, all 23 customer routes, 44px targets, no whole-page horizontal scroll, full-screen forms, bottom action-bar stacking, retry/error states and safe-area spacing. At desktop size, compare data calculation, report, attendance, finance, medicine, reports, customer and blacklist against the pre-change layout. Open admin locally and verify its navigation/pages remain unchanged.

- [ ] **Step 7: Verify cross-device draft behavior locally**

With one account in two browser contexts:

1. Edit standard inputs on desktop and verify mobile loads the same revision/payload.
2. Edit coefficient rows/parameters on mobile and verify desktop loads them.
3. Create simultaneous edits, save one, verify the other receives 409 and preserves its local draft.
4. Choose “加载服务器版本” and verify the server payload replaces local state.
5. Repeat conflict, confirm “覆盖服务器版本”, and verify revision increments.
6. Simulate failed `localStorage` access and network loss; calculation remains usable, save status becomes retryable, and reconnect/retry succeeds.

- [ ] **Step 8: Commit final regression evidence**

```bash
git add vitest.config.ts src/views/dashboard/MobileRouteCoverage.test.ts
git commit -m "test: verify full mobile frontend coverage"
```

- [ ] **Step 9: Stop before production and hand off iPhone checks**

Provide the user with the local URL and this real-device checklist: add PWA to Home Screen on iOS 16.4+, launch standalone, login/reopen session, numeric keyboards, swipe secondary menus, every mobile page, customer/full-screen selectors, standard/coefficient sync, report/bill/payroll sharing or long-press fallback, network interruption recovery. State explicitly that production backup, migration and cutover have not run and require separate authorization.

---

## Self-Review Checklist

- [x] Every approved customer route is named in Task 22 and owned by exactly one implementation task.
- [x] Desktop customer navigation/views are preserved by paired mobile/desktop mount assertions.
- [x] Admin source is not modified except read-only build/regression execution.
- [x] Navigation drawer, two/three/four-plus secondary behavior, auto-scroll, single-page hiding and action-bar offsets are covered by Tasks 1–3.
- [x] Standard/coefficient formulas, row rules, parameter application, sync states, legacy import, local cache failure and 409 conflict choices are covered by Tasks 4–8.
- [x] Report sharing and long-press fallback are covered by Tasks 9 and 16; PWA network-only rules are re-run in Tasks 9 and 22.
- [x] Medicine, report, customer and blacklist mobile flows are covered by Tasks 10–13.
- [x] Finance entry, income, unsettled, monthly and prepaid flows are covered by Tasks 14–17.
- [x] Attendance schedules, employees, records, leave, compensation and payroll are covered by Tasks 18–21.
- [x] Full Vitest, server Vitest, type checks, builds, Prisma checks, phone sizes, landscape, desktop and iPhone handoff are covered by Task 22.
- [x] Production backup/migration/deploy remains outside this implementation authorization.
