# Schedule Attendance Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge customer and admin schedule/attendance overview navigation into one calendar page, derive daily attendance status and display duration on the server, keep customer scheduling editable and admin strictly read-only, and lock the approved rest-quota payroll rule with regression tests.

**Architecture:** Add a pure daily calendar classifier and one tenant-safe monthly calendar service. The service joins monthly schedules, current attendance, approved leave and leave types, then returns one normalized `{ month, employee, days, overview }` response. Customer and admin controllers expose the same daily contract, while admin queries are limited to authorized frontend accounts. Customer and admin UIs render separate components from the shared contract because they are separate Vite applications, but neither application recomputes business status. Mock mode mirrors the server response and rules.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, Vitest, NestJS, Prisma, PostgreSQL, Day.js, Axios.

## Global Constraints

- Keep all work local; do not deploy or execute a production migration.
- Do not add automatic clock-in, employee self-service accounts, location, attendance hardware or third-party attendance integrations.
- Do not add overnight shifts or “按星期批量设置”.
- Keep overtime manually entered; actual attendance intervals must not create overtime automatically.
- A missing manual attendance record means normal attendance for a reached scheduled workday.
- Future dates show planned schedules on white backgrounds and do not receive attendance classifications.
- Approved leave consumes rest quota only when its leave type has `countsTowardRestQuota=true`.
- Within-quota leave neither deducts salary nor removes the attendance bonus.
- Excess quota leave sets the attendance bonus to zero and deducts `baseSalary / scheduledWorkDays * excessLeaveDays`.
- Company rest days do not consume leave quota.
- Preserve payroll-month locks, immutable confirmed snapshots, tenant ownership, `EMPLOYEE_ATTENDANCE` grants and admin read-only behavior.
- Reuse the existing 2026-08-11 monthly scheduling schema. Do not add a Prisma migration unless an implementation task proves a new persisted field is unavoidable; the planned design requires no schema change.

---

## File Responsibility Map

- `server/src/employee-attendance/attendance-calendar.ts`: pure day status, display-minute and reason derivation.
- `server/src/employee-attendance/attendance-calendar.test.ts`: status precedence and duration unit tests.
- `server/src/employee-attendance/attendance-calendar.service.ts`: tenant-safe monthly join and unified response.
- `server/src/employee-attendance/attendance-calendar.service.test.ts`: account scope, date coverage and source-query tests.
- `server/src/employee-attendance/payroll.service.ts`: shared account-scope overview aggregation and existing payroll quota rules.
- `server/src/employee-attendance/payroll.service.test.ts`: overview parity and quota-payroll regression tests.
- `server/src/employee-attendance/employee-attendance.dto.ts`: customer/admin month and optional employee query validation.
- `server/src/employee-attendance/employee-attendance.controller.ts`: guarded customer combined-view GET.
- `server/src/employee-attendance/admin-employee-attendance.controller.ts`: authorized read-only admin combined-view GET.
- `server/src/employee-attendance/employee-attendance.module.ts`: register/export calendar service.
- `src/types/employeeAttendance.ts`: normalized customer calendar contracts.
- `src/api/employeeAttendance.ts`: real API response adapter.
- `src/mocks/employeeAttendance.ts`: account-scoped Mock calendar derivation.
- `src/stores/employeeAttendance.ts`: latest-request-safe combined-view state.
- `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.vue`: status calendar rendering and selection.
- `src/views/dashboard/employee-attendance/AttendanceOverviewPanel.vue`: overview cards and issues below calendar.
- `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`: combined page orchestration.
- `src/components/layout/AppSidebar.vue`, `src/router/index.ts`: merged menu and old-route redirect.
- `src/views/dashboard/EmployeeAttendancePages.test.ts`: customer navigation and combined-page acceptance.
- `admin/src/types.ts`, `admin/src/api.ts`: exact admin combined-view contract and Mock transport.
- `admin/src/components/employee-attendance/AdminMonthlyAttendanceCalendar.vue`: read-only calendar.
- `admin/src/views/EmployeeAttendancePage.vue`: schedules section plus overview.
- `admin/src/config/employeeAttendanceNavigation.ts`, `admin/src/router.ts`: merged admin menu and redirect.
- `admin/src/config/employeeAttendanceNavigation.test.ts`, `admin/src/views/EmployeeAttendancePage.test.ts`, `admin/src/api.employeeAttendance.test.ts`: admin read-only and Mock parity tests.

---

### Task 1: Pure Daily Calendar Classification

**Files:**
- Create: `server/src/employee-attendance/attendance-calendar.ts`
- Create: `server/src/employee-attendance/attendance-calendar.test.ts`

**Interfaces:**
- Produces `AttendanceCalendarStatus`, `AttendanceCalendarDaySource`, `AttendanceCalendarDay`, `deriveAttendanceCalendarDay()` and `formatDisplayHours()`.
- Consumes already-derived attendance metrics; it does not read Prisma or mutate source data.

- [ ] **Step 1: Write failing status-precedence tests**

Cover these exact cases:

```ts
it.each([
  ['FUTURE', futureSource()],
  ['REST', restDaySource()],
  ['NORMAL', scheduledSource({ actualSegments: [], explicitAbsenceMinutes: 0 })],
  ['OVERTIME', scheduledSource({ overtimeMinutes: 30 })],
  ['SHORT', scheduledSource({ actualSegments: actualSixHours(), workedMinutes: 360 })],
  ['LEAVE', scheduledSource({ workedMinutes: 360, approvedLeaveMinutes: 240, leaveReason: '照顾家人' })],
  ['ABSENT', scheduledSource({ actualSegments: [], explicitAbsenceMinutes: 600, absenceMinutes: 600, remark: '无故未到' })]
])('derives %s with explicit precedence', (status, source) => {
  expect(deriveAttendanceCalendarDay(source).status).toBe(status)
})
```

Also assert:

- Future wins before every reached-date status and returns planned minutes.
- Approved leave wins over shortage and cannot also be `ABSENT`.
- Full-day absence requires no actual interval, no approved leave and effective absence at least scheduled minutes.
- Company rest returns all effective attendance metrics as zero but preserves raw actual/overtime/remark fields in the source contract.

- [ ] **Step 2: Write failing display-duration tests**

```ts
expect(day({ scheduled: 600, worked: 600, overtime: 30 })).toMatchObject({
  status: 'OVERTIME', displayMinutes: 630, durationText: '10.5 小时（工作10＋加班0.5）'
})
expect(day({ scheduled: 600, worked: 360, leave: 240 })).toMatchObject({
  status: 'LEAVE', displayMinutes: 600, durationText: '10 小时（工作6＋请假4）'
})
expect(day({ scheduled: 600, worked: 540 })).toMatchObject({
  status: 'SHORT', displayMinutes: 540, shortageMinutes: 60
})
```

Assert that overtime never reduces `shortageMinutes`, hours have at most one decimal, and a missing reason becomes `未填写原因`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
cd server
../node_modules/.bin/vitest run src/employee-attendance/attendance-calendar.test.ts
```

Expected: FAIL because `attendance-calendar.ts` does not exist.

- [ ] **Step 4: Implement the pure contract**

Use this status union:

```ts
export type AttendanceCalendarStatus =
  | 'FUTURE'
  | 'ABSENT'
  | 'LEAVE'
  | 'REST'
  | 'NORMAL'
  | 'OVERTIME'
  | 'SHORT'
```

Implementation rules:

- Clamp all minute inputs to non-negative integers.
- For an unreached date, return planned display minutes and `FUTURE` without applying actual status.
- For an explicit monthly rest day, return `REST` and zero effective scheduled/worked/late/early/absence/display minutes.
- With no actual intervals, derive default work as `scheduled - approvedLeave - effectiveAbsence`, floored at zero; this keeps unrecorded attendance normal while allowing explicit absence and approved leave to replace scheduled work.
- With actual intervals, use the service-provided current `workedMinutes`.
- Compute regular credited minutes as `min(scheduled, worked + approvedLeave)`.
- Compute shortage before adding overtime.
- Set `displayMinutes = regularCredited + overtime`.
- Produce semantic flags/classes in data, not literal CSS colors: `backgroundTone` and `durationTone` may map to `future`, `normal`, `leave`, `absent`, `rest`, `overtime`, and `short`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the Task 1 Vitest command again.

Expected: all daily classification and duration tests PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add server/src/employee-attendance/attendance-calendar.ts server/src/employee-attendance/attendance-calendar.test.ts
git commit -m "feat: derive attendance calendar states"
```

---

### Task 2: Unified Tenant-Safe Monthly Calendar Service

**Files:**
- Create: `server/src/employee-attendance/attendance-calendar.service.ts`
- Create: `server/src/employee-attendance/attendance-calendar.service.test.ts`
- Modify: `server/src/employee-attendance/employee-attendance.module.ts`
- Modify: `server/src/employee-attendance/payroll.service.ts`
- Modify: `server/src/employee-attendance/payroll.service.test.ts`

**Interfaces:**
- Produces `AttendanceCalendarService.customerView(frontendUserId, employeeId | undefined, month)`.
- Produces `AttendanceCalendarService.adminView(allowedFrontendUserIds, employeeId | undefined, month)`.
- Returns `{ month, employee, days, overview, readonly }`; `employee` is `null` and `days` is empty when no employee is selected.
- Refactors customer/admin overview aggregation to the same account-scope logic.

- [ ] **Step 1: Write failing monthly join tests**

Create fixtures for one employee/month containing:

- A two-segment schedule with no attendance record.
- A normal attendance record with manual overtime.
- A short attendance record.
- A partial approved leave with its type and reason.
- A full explicit absence with an attendance remark.
- A company rest day.
- A future scheduled day.

Assert that one service call returns every natural date of the month in ascending order, preserves planned segments, joins current attendance/leave data, and returns the Task 1 statuses and duration text.

- [ ] **Step 2: Write failing tenant and admin-scope tests**

Assert:

- Customer employee lookup always includes `frontendUserId`.
- A cross-account employee ID returns not found/forbidden without leaking its existence.
- Admin employee lookup includes `frontendUserId: { in: allowedFrontendUserIds }`.
- Empty admin authorization never queries unrestricted data.
- Admin response contains `readonly: true`; customer response contains `readonly: false`.
- No service method writes schedules, attendance, leave or payroll records.

- [ ] **Step 3: Write failing overview-parity tests**

Refactor tests so both customer and admin account scopes classify today using the same rules:

- No manual attendance defaults to present.
- Any approved hourly, half-day or full-day leave counts under today leave.
- Full effective absence counts under today absent.
- The selected month, not only today, supplies overtime and late/early reminders.
- Pending leave count and projected payroll remain scoped to allowed accounts.

- [ ] **Step 4: Run focused service tests and verify RED**

```bash
cd server
../node_modules/.bin/vitest run \
  src/employee-attendance/attendance-calendar.service.test.ts \
  src/employee-attendance/payroll.service.test.ts
```

Expected: FAIL because the service and shared overview scope are absent.

- [ ] **Step 5: Implement month source loading**

In one read flow:

- Validate `YYYY-MM` before querying.
- Resolve the employee within the caller's tenant/authorization scope.
- Load all monthly schedule days with ordered plan segments.
- Load all monthly attendance records with ordered actual segments.
- Load approved leaves overlapping the month with leave type name and quota flag.
- Compute approved leave minutes for each date using the existing schedule-aware full-day/half-day/hour behavior.
- Use Shanghai business dates and the service's injected/overridable `today()` boundary for deterministic tests.
- Feed normalized sources into `deriveAttendanceCalendarDay()`.
- Include employee number/name only; do not expose sensitive fields.

- [ ] **Step 6: Consolidate overview scope**

Extract the common logic currently split between `overview()` and `adminOverview()` into an account-list-aware private method. Keep the public compatibility methods, but have them map from the shared result. Admin returns the same attendance cards plus `readonly: true`; customer keeps its existing normalized field names.

Do not calculate display colors in `PayrollService`. Only the pure calendar helper owns daily status; overview uses the same effective leave/absence decisions.

- [ ] **Step 7: Lock payroll quota behavior with regression tests**

The current calculator already implements the approved rule. Add/retain explicit assertions:

```ts
expect(calculatePayroll({ ...base, restQuotaDays: 4, countedLeaveDays: 4 })).toMatchObject({
  excessLeaveDays: 0, leaveDeduction: 0, attendanceBonus: base.attendanceBonus
})
expect(calculatePayroll({ ...base, restQuotaDays: 4, countedLeaveDays: 5.5 })).toMatchObject({
  excessLeaveDays: 1.5,
  leaveDeduction: round2(base.baseSalary / base.scheduledWorkDays * 1.5),
  attendanceBonus: 0
})
```

Also cover zero scheduled workdays: deduction remains zero, an issue blocks confirmation, and no division by zero occurs. Confirm Mock parity later in Task 4.

- [ ] **Step 8: Register the service and verify GREEN**

Add `AttendanceCalendarService` to module providers/exports, rerun Task 1 and Task 2 focused tests, and run:

```bash
cd server
../node_modules/.bin/tsc -p tsconfig.json --noEmit
```

Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 9: Commit Task 2**

```bash
git add server/src/employee-attendance/attendance-calendar* server/src/employee-attendance/employee-attendance.module.ts server/src/employee-attendance/payroll.service*
git commit -m "feat: add unified attendance calendar service"
```

---

### Task 3: Guarded Customer and Read-Only Admin Endpoints

**Files:**
- Modify: `server/src/employee-attendance/employee-attendance.dto.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.test.ts`
- Modify: `server/src/employee-attendance/admin-employee-attendance.controller.ts`
- Modify: `server/src/employee-attendance/admin-employee-attendance.controller.test.ts`

**Interfaces:**
- Customer: `GET /employee-attendance/schedule-attendance-overview?employeeId=&month=YYYY-MM`.
- Admin: `GET /admin/employee-attendance/schedule-attendance-overview?frontendUserIds=&employeeId=&month=YYYY-MM`.
- No POST, PUT, PATCH or DELETE companion route is allowed.

- [ ] **Step 1: Write failing DTO and controller tests**

Assert:

- `month` is required and matches `YYYY-MM`.
- `employeeId` is optional but, when present, must be a non-empty string.
- Customer controller verifies the `X-YS-Access-Grant` before calling the service.
- Missing/expired/wrong-feature grants reject without calling the calendar service.
- Customer caller ID is used as the only tenant ID.
- Admin controller passes only `AdminAccessService.getAllowedFrontendUserIds()` output.
- Admin returns read-only calendar data and exposes no mutation handler.

- [ ] **Step 2: Run focused controller tests and verify RED**

```bash
cd server
../node_modules/.bin/vitest run \
  src/employee-attendance/employee-attendance.controller.test.ts \
  src/employee-attendance/admin-employee-attendance.controller.test.ts
```

- [ ] **Step 3: Add exact query DTO and routes**

Use a dedicated query DTO rather than loosely reading `@Query('month')`. The admin route may reuse `AdminEmployeeAttendanceQueryDto` but must ignore date/status fields and require a valid month at service boundary.

- [ ] **Step 4: Add read-only route regression**

Extend admin Mock/request safety tests later, and add a server route inventory assertion that no POST/PUT/PATCH/DELETE handler exists for `schedule-attendance-overview`.

- [ ] **Step 5: Run Task 3 tests and server typecheck**

Expected: controller tests PASS; Nest TypeScript exits 0.

- [ ] **Step 6: Commit Task 3**

```bash
git add server/src/employee-attendance/employee-attendance.dto.ts server/src/employee-attendance/*controller*
git commit -m "feat: expose attendance calendar views"
```

---

### Task 4: Customer Contracts, Adapter, Store and Mock Parity

**Files:**
- Modify: `src/types/employeeAttendance.ts`
- Modify: `src/api/employeeAttendance.ts`
- Modify: `src/api/employeeAttendance.adapters.test.ts`
- Modify: `src/api/employeeAttendance.mock.test.ts`
- Modify: `src/mocks/employeeAttendance.ts`
- Modify: `src/stores/employeeAttendance.ts`
- Modify: `src/stores/employeeAttendance.test.ts`

**Interfaces:**
- Produces `AttendanceCalendarStatus`, `AttendanceCalendarDay`, `ScheduleAttendanceOverview`.
- Produces `getScheduleAttendanceOverview(employeeId | undefined, month)`.
- Produces store state `scheduleAttendanceOverview` and latest-request-safe `loadScheduleAttendanceOverview()`.

- [ ] **Step 1: Write failing real-adapter tests**

Assert that the adapter:

- Calls the new endpoint with access-grant forwarding.
- Omits an empty employee ID.
- Normalizes numeric/Decimal-like minute fields to numbers.
- Preserves all plan/actual segments, leave type/reason, absence reason, semantic tones and overview issues.
- Rejects malformed response objects rather than silently inventing writable schedule IDs.

- [ ] **Step 2: Write failing Mock calendar tests**

Seed the same cases as Task 2 and assert Mock returns the exact statuses/text/minutes. Add explicit payroll parity:

- Quota 4, leave 4 => bonus retained and leave deduction zero.
- Quota 4, leave 5.5 => bonus zero and 1.5 daily rates deducted.
- Company rest days do not consume quota.
- Partial approved leave is yellow and displays `工作6＋请假4`.
- A future manually scheduled day remains white.

- [ ] **Step 3: Write failing store race tests**

Create request A for employee/month A and request B for employee/month B. Resolve B first, then fail A. Assert:

- B remains in store.
- A cannot overwrite data or `store.error`.
- Loading remains true until both requests settle.
- One response atomically updates `monthlySchedules` and `overview`.

- [ ] **Step 4: Run focused client tests and verify RED**

```bash
./node_modules/.bin/vitest run \
  src/api/employeeAttendance.adapters.test.ts \
  src/api/employeeAttendance.mock.test.ts \
  src/stores/employeeAttendance.test.ts
```

- [ ] **Step 5: Add exact TypeScript contracts and adapter**

Calendar days must include a nested optional schedule object or enough exact schedule fields to reconstruct `MonthlyScheduleDay` without fabrication. Prefer:

```ts
interface AttendanceCalendarDay {
  date: string
  day: number
  isFuture: boolean
  status: AttendanceCalendarStatus
  schedule: MonthlyScheduleDay | null
  actualSegments: ActualAttendanceSegment[]
  scheduledMinutes: number
  workedMinutes: number
  approvedLeaveMinutes: number
  overtimeMinutes: number
  displayMinutes: number
  shortageMinutes: number
  durationText: string
  leaveTypeName: string
  leaveReason: string
  absenceReason: string
  backgroundTone: string
  durationTone: string
}
```

Keep the route read response separate from mutation payload types.

- [ ] **Step 6: Implement account-scoped Mock derivation**

Use existing per-account Mock persistence. Derive current attendance using the current monthly schedule authority, approved leave overlap and strict Shanghai date comparison. Do not store derived colors/statuses. Recompute on every read after schedule, attendance or leave mutations.

- [ ] **Step 7: Implement store request isolation**

Use an incrementing load version and key containing both employee ID and month. Update calendar days, `monthlySchedules` and overview together only if the response is still current. Keep existing save loading counters and persistent mutation errors.

- [ ] **Step 8: Run focused tests and customer typecheck**

```bash
./node_modules/.bin/vitest run \
  src/api/employeeAttendance.adapters.test.ts \
  src/api/employeeAttendance.mock.test.ts \
  src/stores/employeeAttendance.test.ts
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
```

- [ ] **Step 9: Commit Task 4**

```bash
git add src/types/employeeAttendance.ts src/api/employeeAttendance* src/mocks/employeeAttendance.ts src/stores/employeeAttendance*
git commit -m "feat: add attendance calendar client contract"
```

---

### Task 5: Customer Combined Menu and Editable Status Calendar

**Files:**
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/router/index.ts`
- Delete: `src/views/dashboard/employee-attendance/EmployeeAttendanceOverviewPage.vue`
- Create: `src/views/dashboard/employee-attendance/AttendanceOverviewPanel.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`
- Modify: `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`
- Add focused tests beside the two new/changed components if the existing page test becomes too broad.

- [ ] **Step 1: Write failing navigation tests**

Assert:

- The employee attendance submenu contains six items, with `排班考勤概览` first.
- `/employee-attendance` redirects to `/employee-attendance/schedules`.
- `/employee-attendance/overview` redirects to `/employee-attendance/schedules`.
- The schedules route title is `排班考勤概览`.
- No menu entry named `考勤概览` or `排班管理` remains.

- [ ] **Step 2: Write failing calendar rendering tests**

Use one fixture per semantic state and assert:

- Future is white and still displays planned intervals.
- Normal is light green.
- Overtime uses dark-blue duration text and `10.5 小时（工作10＋加班0.5）`.
- Short work uses red duration text and displays 9 hours for a 10-hour plan.
- Leave is light yellow and displays type, duration and reason.
- Full absence is light red and displays `旷工` plus reason.
- Company rest is neutral gray.
- Plan interval text has the enlarged class/font.
- The rendered text does not contain `休息 90 分钟` or any `休息 X 分钟` summary.
- A visible legend contains textual labels in addition to colors.

Use semantic classes and `data-testid` assertions; do not assert browser-generated RGB values alone.

- [ ] **Step 3: Write failing combined-layout tests**

Assert the page order is:

1. Schedule summary and editing actions.
2. Monthly calendar.
3. Attendance overview cards.
4. Issue list.

Also assert save day, delete day, batch overwrite, copy previous month and rest-quota save still work and reload the combined response.

- [ ] **Step 4: Run focused page tests and verify RED**

```bash
./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts
```

- [ ] **Step 5: Merge navigation and routes**

Remove the overview component import/route component, add explicit redirect entries, and keep access-guard matching under `/employee-attendance/*` unchanged.

- [ ] **Step 6: Extract and place overview panel**

Move cards/issues into `AttendanceOverviewPanel.vue`. The panel receives `AttendanceOverview | null`; it must not independently fetch data. Render it below `MonthlyScheduleCalendar` so one page load supplies both sections.

- [ ] **Step 7: Render server-owned status data**

Change `MonthlyScheduleCalendar` from `MonthlyScheduleDay[]` to calendar days. Use `day.schedule` for editing selection and the server-provided status/text/tones for display. Do not reconstruct leave, shortage, absence or overtime rules in the component.

CSS requirements:

- Future: white.
- Normal/overtime/short scheduled day background: light green.
- Leave: light yellow.
- Absence: light red.
- Rest: neutral light gray.
- Overtime duration: dark blue.
- Short duration: red.
- Plan interval font larger than the current 12px and still readable on narrow screens.

- [ ] **Step 8: Preserve interactions and latest-request behavior**

After save/delete/batch/copy/rest-quota mutations, reload the unified response. Keep the drawer/batch dialog form state on failure. Ensure old requests cannot replace the newly selected employee/month.

- [ ] **Step 9: Run customer focused tests, typecheck and build**

```bash
./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
./node_modules/.bin/vite build
```

Expected: tests/typecheck/build PASS. Existing dependency/chunk warnings may remain but no new compile error is allowed.

- [ ] **Step 10: Commit Task 5**

```bash
git add src/components/layout/AppSidebar.vue src/router/index.ts src/views/dashboard/employee-attendance src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: merge schedule and attendance overview"
```

---

### Task 6: Admin Read-Only Calendar and Merged Navigation

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/api.employeeAttendance.test.ts`
- Modify: `admin/src/config/employeeAttendanceNavigation.ts`
- Modify: `admin/src/config/employeeAttendanceNavigation.test.ts`
- Modify: `admin/src/router.ts`
- Create: `admin/src/components/employee-attendance/AdminMonthlyAttendanceCalendar.vue`
- Modify: `admin/src/views/EmployeeAttendancePage.vue`
- Modify: `admin/src/views/EmployeeAttendancePage.test.ts`

- [ ] **Step 1: Write failing admin navigation tests**

Assert six submenu entries, schedules as the default page, old overview redirect, and unknown employee-attendance paths resolving safely to schedules rather than an obsolete overview page.

- [ ] **Step 2: Write failing admin API and Mock tests**

Assert:

- Account IDs, optional employee ID and month reach the new GET endpoint.
- Month takes precedence and obsolete date/status filters are not sent for the combined page.
- Mock enforces allowed account IDs and returns the same statuses/minutes as customer Mock.
- POST/PUT/PATCH/DELETE to both `/admin/employee-attendance/schedule-attendance-overview` and descendant paths are rejected.
- The existing employee password-reveal POST remains the only documented admin employee-attendance write-shaped exception.

- [ ] **Step 3: Write failing read-only calendar tests**

Mount the schedules route and assert:

- Same month grid, status labels, duration text, leave reason and absence reason as customer fixtures.
- Frontend account and employee identity are visible.
- Overview cards and issues appear below the calendar.
- No save, edit, delete, copy, batch, approval, payroll confirmation or export control exists.
- Employee selection is required for daily cells; without one, show an explanatory empty state while retaining aggregate overview cards.

- [ ] **Step 4: Run focused admin tests and verify RED**

```bash
./node_modules/.bin/vitest run \
  admin/src/config/employeeAttendanceNavigation.test.ts \
  admin/src/api.employeeAttendance.test.ts \
  admin/src/views/EmployeeAttendancePage.test.ts
```

- [ ] **Step 5: Add exact admin contract and adapter**

Mirror the customer read contract in `admin/src/types.ts`, with admin employee/frontend-account identity and `readonly: true`. Avoid `any` at the new API boundary. Keep sensitive employee fields out of the calendar response.

- [ ] **Step 6: Merge admin navigation and route**

Use `schedules` as the combined page key and label it `排班考勤概览`. Remove the overview navigation item, make `/employee-attendance` and `/employee-attendance/overview` redirect to schedules, and preserve the remaining five pages.

- [ ] **Step 7: Render the admin calendar**

Use a dedicated read-only component with the same semantic status classes and responsive seven-column layout. The admin component emits no mutation events and receives no writable schedule payload.

- [ ] **Step 8: Update page loading and request isolation**

For the schedules section, request the combined view rather than separate schedule table/overview calls. Use a load sequence so stale account/employee/month responses and errors cannot overwrite the latest page.

- [ ] **Step 9: Run admin focused tests, typecheck and build**

```bash
./node_modules/.bin/vitest run \
  admin/src/config/employeeAttendanceNavigation.test.ts \
  admin/src/api.employeeAttendance.test.ts \
  admin/src/views/EmployeeAttendancePage.test.ts
./node_modules/.bin/vue-tsc --noEmit -p admin/tsconfig.json
cd admin && ../node_modules/.bin/vite build
```

- [ ] **Step 10: Commit Task 6**

```bash
git add admin/src
git commit -m "feat: show readonly schedule attendance calendar"
```

---

### Task 7: Cross-Layer Parity, Regression and Documentation

**Files:**
- Modify: `README.md` only if local feature instructions or route inventory need updating.
- Modify tests from Tasks 1–6 where final parity gaps are found.
- Do not create a Prisma migration when `schema.prisma` is unchanged.

- [ ] **Step 1: Add one full-contract parity fixture**

Use the same logical August fixture in server, customer Mock and admin Mock tests. Assert at least these exact outputs:

- Normal day: green semantic tone, 600 displayed minutes.
- Overtime day: blue duration tone, 630 displayed minutes.
- Short day: red duration tone, 540 displayed minutes and 60 shortage minutes.
- Partial leave: yellow semantic tone, 360 work + 240 leave = 600 displayed minutes.
- Full absence: red semantic tone and stored remark reason.
- Future schedule: white semantic tone and planned intervals.

- [ ] **Step 2: Verify route and access behavior**

Test customer grant propagation, expired grant rejection, admin root/sub-account scope, old route redirects and lack of admin mutations.

- [ ] **Step 3: Verify payroll and lock behavior**

Run focused payroll tests for quota boundary, fractional excess, zero workdays, confirmed snapshot stability and confirmed-month write locks. The calendar read must remain available for confirmed months.

- [ ] **Step 4: Run all automated verification**

```bash
./node_modules/.bin/vitest run --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
cd server && ../node_modules/.bin/vitest run
cd ..
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.json
./node_modules/.bin/vue-tsc --noEmit -p admin/tsconfig.json
./node_modules/.bin/vite build
cd admin && ../node_modules/.bin/vite build
cd ..
cd server && ../node_modules/.bin/nest build
```

Expected: all suites, both typechecks, both Vite builds and Nest build PASS.

- [ ] **Step 5: Verify Prisma remains unchanged**

```bash
cd server
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma format
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma validate
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma generate
git diff --exit-code -- prisma/schema.prisma
```

Expected: schema validates/generates and no schema diff exists. If implementation legitimately needs persistence, stop and amend both design and plan before adding a migration.

- [ ] **Step 6: Start local Mock previews**

Use the repository-local Vite binaries and explicit Mock flags so customer and admin can be verified without production data. Keep ports `5173` and `5174` when available.

- [ ] **Step 7: Perform in-app browser acceptance**

Customer checks:

- Only “排班考勤概览” appears in the employee attendance submenu.
- Old overview URL redirects to schedules.
- Editing, batch overwrite, copy previous month and rest quota still work.
- Calendar backgrounds, larger plan time, removed rest-minute text and exact duration examples render correctly.
- Overview cards/issues appear below the calendar.

Admin checks:

- Same calendar semantics and account/employee/month filtering.
- No writable controls or export actions.
- Old overview URL redirects correctly.

- [ ] **Step 8: Review working tree and commit integration changes**

```bash
git diff --check
git status --short
git add README.md server/src src admin/src
git commit -m "test: verify schedule attendance overview"
```

Only stage files intentionally changed by this plan. Leave pre-existing unrelated files and untracked dependency links untouched.

---

## Final Review Checklist

- [ ] The calendar status and duration rules live in the server pure helper, not separately in customer/admin UI.
- [ ] Customer and admin use the same normalized daily read contract.
- [ ] Missing manual attendance defaults to normal only for reached scheduled workdays.
- [ ] Approved leave replaces the equivalent scheduled work and does not double-count absence.
- [ ] Overtime cannot hide normal-hours shortage.
- [ ] Future dates remain white and show manually configured schedules.
- [ ] Full absence requires the confirmed business conditions and shows the attendance remark.
- [ ] Rest-quota leave within allowance keeps attendance bonus and salary.
- [ ] Excess leave removes the attendance bonus and deducts fractional daily salary.
- [ ] Company rest days do not consume rest quota.
- [ ] Customer retains all schedule editing flows.
- [ ] Admin is strictly read-only and account-scoped.
- [ ] Old overview routes redirect without breaking access guards.
- [ ] No Prisma migration or production deployment is performed.
- [ ] Full tests, typechecks, builds and in-app browser acceptance pass before completion is claimed.
