# 北京时间凌晨 4 点业务日 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让数据计算表格在北京时间凌晨 4 点统一切换业务日期，并在该时刻同时把前一业务日设为只读。

**Architecture:** 前端和后端各自提供一个不依赖系统时区的 `businessDateInBeijing(now)` 纯函数，数据计算模块只使用该函数判断当前表和只读状态，其他财务自然日逻辑继续使用 `todayInBeijing()`。前端页面安排 04:00 边界检查，并在页面恢复焦点、可见或网络恢复时补检；切换前沿用现有保存结果，失败时保留旧表和本地草稿。

**Tech Stack:** Vue 3、Pinia、Vitest、NestJS、Prisma、TypeScript

## Global Constraints

- 北京时间 `00:00:00–03:59:59` 属于前一个业务日，`04:00:00` 起属于当天业务日。
- 业务日计算必须显式按 UTC+8，不能依赖浏览器、开发机或 VPS 系统时区。
- 新表仅在账号首次请求当前业务日时延迟创建，并沿用最近更早业务日的空白和系数。
- 不迁移、不复制、不删除已有数据，不修改 Prisma schema。
- 只修改本地代码，不推送 GitHub，不更新 VPS。

---

### Task 1: 前后端业务日期纯函数

**Files:**
- Create: `src/utils/date.test.ts`
- Create: `server/src/common/date.test.ts`
- Modify: `src/utils/date.ts`
- Modify: `server/src/common/date.ts`

**Interfaces:**
- Produces: `businessDateInBeijing(now?: Date): string`
- Produces: `millisecondsUntilNextBusinessDayInBeijing(now?: Date): number`（仅前端定时器使用）

- [ ] **Step 1: Write the failing boundary tests**

```ts
expect(businessDateInBeijing(new Date('2026-07-30T19:59:59.000Z'))).toBe('2026-07-30')
expect(businessDateInBeijing(new Date('2026-07-30T20:00:00.000Z'))).toBe('2026-07-31')
expect(millisecondsUntilNextBusinessDayInBeijing(new Date('2026-07-30T19:59:59.000Z'))).toBe(1000)
```

- [ ] **Step 2: Run tests and confirm missing exports fail**

Run: `pnpm test -- src/utils/date.test.ts && pnpm --filter yangshao-server test -- src/common/date.test.ts`

Expected: FAIL because the business-date helpers do not exist.

- [ ] **Step 3: Implement timezone-independent helpers**

```ts
const BEIJING_BUSINESS_DATE_OFFSET_MS = 4 * 60 * 60 * 1000
const BEIJING_TIME_OFFSET_MS = 8 * 60 * 60 * 1000

export function businessDateInBeijing(now = new Date()) {
  return new Date(now.getTime() + BEIJING_TIME_OFFSET_MS - BEIJING_BUSINESS_DATE_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
}
```

For the next boundary, construct Beijing-local 04:00 as a UTC instant and return a positive delay to that instant.

- [ ] **Step 4: Run both helper test files and confirm pass**

Run: `pnpm test -- src/utils/date.test.ts && pnpm --filter yangshao-server test -- src/common/date.test.ts`

Expected: PASS.

### Task 2: 后端当前表和只读规则统一到业务日

**Files:**
- Modify: `server/src/lab-sheets/lab-sheets.service.test.ts`
- Modify: `server/src/lab-sheets/lab-sheets.service.ts`

**Interfaces:**
- Consumes: `businessDateInBeijing(now?: Date): string`
- Preserves: existing `/api/lab-sheets/current`, save, parameter update, and append endpoints.

- [ ] **Step 1: Write failing service tests around 04:00**

Use `vi.setSystemTime()` for the two UTC instants and assert:

```ts
vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
expect((await service.getDefaultSheetForFrontendUser('front-1')).date).toBe('2026-07-30')

vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'))
expect((await service.getDefaultSheetForFrontendUser('front-1')).date).toBe('2026-07-31')
```

Also assert the July 30 sheet is editable before the boundary and rejected after it.

- [ ] **Step 2: Run the service tests and confirm natural-date behavior fails**

Run: `pnpm --filter yangshao-server test -- src/lab-sheets/lab-sheets.service.test.ts`

Expected: FAIL at the pre-04:00 business-date assertions.

- [ ] **Step 3: Replace lab-sheet-only natural-date calls**

Import `businessDateInBeijing` in `lab-sheets.service.ts` and use it for:

```ts
getSheetForFrontendUser(frontendUserId, date = businessDateInBeijing())
getDefaultSheetForFrontendUser(frontendUserId)
updateCurrentParameters(frontendUserId, parameters, sourceClientId)
isReadonlySheet(sheet)
```

Keep `todayInBeijing()` only where a natural calendar date is semantically required outside data calculation.

- [ ] **Step 4: Run service tests and confirm parameter inheritance remains green**

Run: `pnpm --filter yangshao-server test -- src/lab-sheets/lab-sheets.service.test.ts`

Expected: PASS, including existing latest-parameter carryover test.

### Task 3: 前端初始日期和跨 04:00 自动切换

**Files:**
- Modify: `src/views/dashboard/LabDataPage.test.ts`
- Modify: `src/views/dashboard/LabDataPage.vue`

**Interfaces:**
- Consumes: `businessDateInBeijing(now?: Date): string`
- Consumes: `millisecondsUntilNextBusinessDayInBeijing(now?: Date): number`
- Consumes: `labStore.loadCurrentSheet(): Promise<boolean | void>`; a false result means pending input was not safely saved.

- [ ] **Step 1: Write failing page tests**

Add tests with fake timers that verify:

```ts
vi.setSystemTime(new Date('2026-07-30T19:59:59.000Z'))
// Initial fallback date is 2026-07-30 and selecting it does not request historical access.

vi.setSystemTime(new Date('2026-07-30T20:00:00.000Z'))
await vi.runOnlyPendingTimersAsync()
expect(mocks.labStore.loadCurrentSheet).toHaveBeenCalled()
```

Add a failure case where `loadCurrentSheet` resolves `false`; the selected date and loaded sheet stay unchanged and an error is shown.

- [ ] **Step 2: Run the page test and confirm missing boundary behavior fails**

Run: `pnpm test -- src/views/dashboard/LabDataPage.test.ts`

Expected: FAIL because the page still uses natural today and has no 04:00 timer.

- [ ] **Step 3: Implement the page boundary coordinator**

In `LabDataPage.vue`:

```ts
const selectedDate = ref(businessDateInBeijing())
let businessDayBoundaryTimer: number | undefined
let businessDayPreflushTimer: number | undefined
let switchingBusinessDay = false
```

Schedule a preflush five seconds before the next boundary and a boundary check at 04:00. On focus, visibility restore, and online, call the same check. If the loaded sheet date differs from `businessDateInBeijing()`, call `loadCurrentSheet()`; only update the selector after success. Clear timers and listeners during unmount.

Use `businessDateInBeijing()` in `requestHistoricalDateAccess()` so the pre-04:00 active date is not treated as history.

- [ ] **Step 4: Run page and store tests**

Run: `pnpm test -- src/views/dashboard/LabDataPage.test.ts src/stores/labSheet.test.ts`

Expected: PASS.

### Task 4: Full local verification

**Files:**
- Verify only; no deployment files.

**Interfaces:**
- Verifies all prior tasks as one local release candidate.

- [ ] **Step 1: Run targeted tests**

Run: `pnpm test -- src/utils/date.test.ts src/views/dashboard/LabDataPage.test.ts src/stores/labSheet.test.ts`

Run: `pnpm --filter yangshao-server test -- src/common/date.test.ts src/lab-sheets/lab-sheets.service.test.ts`

- [ ] **Step 2: Run type checks and builds**

Run: `pnpm exec vue-tsc --noEmit`

Run: `pnpm build`

Run: `pnpm --filter yangshao-server build`

- [ ] **Step 3: Inspect local UI**

Use the in-app browser at `http://127.0.0.1:5173/data` to verify the current table renders, the date selector matches the backend-returned sheet date, and no controls overlap after hot reload.

- [ ] **Step 4: Confirm repository scope**

Run: `git diff --check` and `git status --short`. Confirm no GitHub push and no VPS command was executed.
