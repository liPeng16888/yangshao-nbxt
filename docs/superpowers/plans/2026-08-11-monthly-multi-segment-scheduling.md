# Monthly Multi-Segment Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace weekly scheduling with persisted monthly daily schedules containing multiple work intervals, add optional multi-interval manual attendance, default unrecorded attendance to normal, and add multi-employee leave filtering.

**Architecture:** Store each scheduled day and each planned interval in normalized Prisma tables, and store each manual actual interval below the existing attendance record. The server owns all duration, lateness, early-leave, absence, leave-coverage, payroll and locking calculations; customer and admin applications consume the same normalized contracts, while Mock mode implements identical semantics.

**Tech Stack:** Vue 3, Pinia, Element Plus, TypeScript, Vitest, NestJS, Prisma, PostgreSQL, Day.js, Axios.

## Global Constraints

- Do not add automatic clock-in, employee self-service accounts, location, attendance hardware or third-party attendance integrations.
- Do not support overnight shifts; every planned and actual interval belongs to one natural date.
- Do not add “按星期批量设置”.
- Keep overtime minutes manually entered; never derive overtime from actual intervals.
- An absent manual attendance record means normal attendance, not absence.
- Explicit absence remains manually recordable when actual intervals are empty.
- Selected dates are fully overwritten only after a confirmation that reports affected dates.
- Derive scheduled workdays from monthly daily schedules; keep only rest quota editable in monthly settings.
- Keep `EMPLOYEE_ATTENDANCE` access grants, tenant ownership, payroll month locks, sensitive-data rules and admin read-only behavior intact.
- Empty leave employee selection means all employees; leave creation and editing remain single-employee operations.
- Update local code and migration only; do not deploy or run a production migration.

---

## File Responsibility Map

- `server/prisma/schema.prisma`: normalized monthly schedule, planned interval and actual interval persistence.
- `server/prisma/migrations/20260811000000_add_monthly_schedule_segments/migration.sql`: reversible schema migration plus current-month legacy weekly/override and legacy single-punch backfill.
- `server/src/employee-attendance/attendance-intervals.ts`: pure interval validation and attendance metrics.
- `server/src/employee-attendance/employee-attendance.dto.ts`: exact request/query validation.
- `server/src/employee-attendance/employee-attendance.service.ts`: tenant-safe schedule, attendance and leave operations.
- `server/src/employee-attendance/payroll.service.ts`: payroll/overview/admin reads from monthly schedules.
- `server/src/employee-attendance/employee-attendance.controller.ts`: customer monthly schedule and attendance routes.
- `src/types/employeeAttendance.ts`: customer normalized contracts.
- `src/api/employeeAttendance.ts`: real API adapters.
- `src/mocks/employeeAttendance.ts`: account-scoped Mock persistence and calculations.
- `src/stores/employeeAttendance.ts`: page state, month schedule loads and leave multi-selection.
- `src/utils/attendanceIntervals.ts`: presentation-only schedule totals and labels.
- `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.vue`: monthly grid and date selection.
- `src/views/dashboard/employee-attendance/ScheduleDayDrawer.vue`: one-day interval editor.
- `src/views/dashboard/employee-attendance/ScheduleBatchDialog.vue`: batch overwrite editor and confirmation.
- `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`: orchestration, copy-previous-month and monthly rest quota.
- `src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue`: manual actual interval editor.
- `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`: multi-employee list filtering.
- `admin/src/views/EmployeeAttendancePage.vue`: read-only monthly schedules and intervals.
- `admin/src/api.ts`: admin real/Mock exact schedule contract.

---

### Task 1: Prisma Models and Pure Interval Calculator

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260811000000_add_monthly_schedule_segments/migration.sql`
- Create: `server/src/employee-attendance/attendance-intervals.ts`
- Create: `server/src/employee-attendance/attendance-intervals.test.ts`

**Interfaces:**
- Produces: `ClockInterval`, `ActualInterval`, `AttendanceMetrics`, `normalizeClockIntervals()`, `scheduledMinutes()`, `breakMinutes()`, and `deriveAttendanceMetrics()`.
- Produces Prisma delegates: `employeeMonthlyScheduleDay`, `employeeScheduleSegment`, and `employeeAttendanceSegment`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
import { describe, expect, it } from 'vitest'
import { breakMinutes, deriveAttendanceMetrics, normalizeClockIntervals, scheduledMinutes } from './attendance-intervals'

describe('attendance intervals', () => {
  it('sums work and excludes the gap as rest', () => {
    const intervals = normalizeClockIntervals([
      { startTime: '08:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:30' }
    ])
    expect(scheduledMinutes(intervals)).toBe(510)
    expect(breakMinutes(intervals)).toBe(60)
  })

  it.each([
    [[{ startTime: '20:00', endTime: '08:00' }], '同一自然日'],
    [[{ startTime: '08:00', endTime: '12:00' }, { startTime: '11:30', endTime: '15:00' }], '重叠']
  ])('rejects invalid planned intervals', (input, message) => {
    expect(() => normalizeClockIntervals(input)).toThrow(message)
  })

  it('defaults missing actual intervals to normal unless absence is explicit', () => {
    const plan = normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }])
    expect(deriveAttendanceMetrics(plan, [], 0, 0)).toMatchObject({ workedMinutes: 480, lateMinutes: 0, earlyLeaveMinutes: 0, absenceMinutes: 0 })
    expect(deriveAttendanceMetrics(plan, [], 0, 60).absenceMinutes).toBe(60)
  })

  it('derives late, early and uncovered absence from paired actual intervals', () => {
    const plan = normalizeClockIntervals([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }])
    const actual = [{ checkInAt: '2026-08-11T08:10:00+08:00', checkOutAt: '2026-08-11T11:50:00+08:00' }]
    expect(deriveAttendanceMetrics(plan, actual, 0, 0)).toMatchObject({ lateMinutes: 10, earlyLeaveMinutes: 10, absenceMinutes: 260 })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd server && ../node_modules/.bin/vitest run src/employee-attendance/attendance-intervals.test.ts`

Expected: FAIL because `attendance-intervals.ts` does not exist.

- [ ] **Step 3: Implement the pure contract**

```ts
export interface ClockInterval { startTime: string; endTime: string }
export interface ActualInterval { checkInAt: string | Date; checkOutAt: string | Date }
export interface AttendanceMetrics { workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; absenceMinutes: number }

export function normalizeClockIntervals(input: ClockInterval[]): ClockInterval[]
export function scheduledMinutes(input: ClockInterval[]): number
export function breakMinutes(input: ClockInterval[]): number
export function deriveAttendanceMetrics(
  planned: ClockInterval[], actual: ActualInterval[], approvedLeaveMinutes: number, explicitAbsenceMinutes: number
): AttendanceMetrics
```

Implementation requirements:

- Parse `HH:mm` into minute-of-day values.
- Require at least one interval for a workday at the service boundary.
- Require `0 <= start < end <= 1440`, strict ascending order and no overlap.
- Pair actual and planned intervals by sequence.
- When `actual.length === 0`, return scheduled work as worked and use only `explicitAbsenceMinutes` as absence.
- When actual intervals exist, calculate uncovered planned minutes, then subtract approved leave minutes with a zero floor.

- [ ] **Step 4: Add normalized Prisma models and relations**

```prisma
model EmployeeMonthlyScheduleDay {
  id               String   @id @default(uuid())
  frontendUserId   String
  employeeId       String
  date             String
  isWorkday        Boolean
  scheduledMinutes Int      @default(0)
  remark           String?
  payrollLockedAt  DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  segments         EmployeeScheduleSegment[]
  frontendUser     User     @relation(fields: [frontendUserId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  employee         Employee @relation(fields: [employeeId, frontendUserId], references: [id, frontendUserId], onDelete: Restrict, onUpdate: Cascade)
  @@unique([employeeId, date])
  @@unique([id, frontendUserId])
  @@index([frontendUserId, date])
}

model EmployeeScheduleSegment {
  id             String   @id @default(uuid())
  frontendUserId String
  scheduleDayId  String
  sequence       Int
  startTime      String
  endTime        String
  scheduleDay EmployeeMonthlyScheduleDay @relation(fields: [scheduleDayId, frontendUserId], references: [id, frontendUserId], onDelete: Cascade, onUpdate: Cascade)
  @@unique([scheduleDayId, sequence])
  @@index([frontendUserId, scheduleDayId])
}

model EmployeeAttendanceSegment {
  id                 String   @id @default(uuid())
  frontendUserId     String
  attendanceRecordId String
  sequence           Int
  checkInAt           DateTime
  checkOutAt          DateTime
  attendanceRecord EmployeeAttendanceRecord @relation(fields: [attendanceRecordId, frontendUserId], references: [id, frontendUserId], onDelete: Cascade, onUpdate: Cascade)
  @@unique([attendanceRecordId, sequence])
  @@index([frontendUserId, attendanceRecordId])
}
```

Add the corresponding arrays to `User`, `Employee`, and `EmployeeAttendanceRecord`. Add `@@unique([id, frontendUserId])` to `EmployeeAttendanceRecord` so its segment composite foreign key is valid.

- [ ] **Step 5: Write the SQL migration**

The migration must:

1. Create the three tables, uniqueness constraints, tenant indexes, `payrollLockedAt` storage on monthly schedule days and foreign keys.
2. Use PostgreSQL `generate_series(date_trunc('month', CURRENT_DATE), date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day', interval '1 day')` to backfill the deployment month from legacy weekly schedules.
3. Prefer a matching `EmployeeDateOverride` over `EmployeeWeeklySchedule` for each employee/date.
4. Create one legacy plan segment from `plannedStartTime` and `plannedEndTime` only when both are valid and the day is a workday.
5. Backfill one actual segment from legacy `checkInAt`/`checkOutAt` only when both are present.
6. Leave weekly schedule and override tables intact for rollback safety.

- [ ] **Step 6: Verify GREEN and Prisma integrity**

Run:

```bash
cd server
../node_modules/.bin/vitest run src/employee-attendance/attendance-intervals.test.ts
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma format
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma validate
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma generate
```

Expected: interval tests PASS; schema valid; client generated.

- [ ] **Step 7: Commit Task 1**

```bash
git add server/prisma server/src/employee-attendance/attendance-intervals.ts server/src/employee-attendance/attendance-intervals.test.ts
git commit -m "feat: add monthly schedule interval models"
```

---

### Task 2: Tenant-Safe Monthly Schedule APIs

**Files:**
- Modify: `server/src/employee-attendance/employee-attendance.dto.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.test.ts`
- Modify: `server/src/employee-attendance/employee-attendance.controller.test.ts`

**Interfaces:**
- Consumes: Task 1 interval helpers and Prisma delegates.
- Produces: `listMonthlySchedules()`, `saveMonthlyScheduleDay()`, `deleteMonthlyScheduleDay()`, `batchSaveMonthlySchedules()`, and `copyPreviousMonthSchedules()`.
- Produces routes under `/employee-attendance/monthly-schedules`.

- [ ] **Step 1: Add failing service tests**

```ts
it('recomputes scheduled minutes and replaces segments atomically', async () => {
  const result = await service.saveMonthlyScheduleDay('front-1', 'front-1', {
    employeeId: 'employee-1', date: '2026-08-11', isWorkday: true, remark: '',
    segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:30' }]
  })
  expect(result.scheduledMinutes).toBe(510)
  expect(tx.employeeScheduleSegment.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
    expect.objectContaining({ sequence: 0, startTime: '08:00', endTime: '12:00' }),
    expect.objectContaining({ sequence: 1, startTime: '13:00', endTime: '17:30' })
  ]) }))
})

it('rolls back a batch when one selected date belongs to a confirmed month', async () => {
  await expect(service.batchSaveMonthlySchedules('front-1', 'front-1', {
    employeeId: 'employee-1', dates: ['2026-08-11', '2026-09-01'], isWorkday: true,
    segments: [{ startTime: '08:00', endTime: '17:00' }], remark: ''
  })).rejects.toThrow('工资已确认')
  expect(tx.employeeMonthlyScheduleDay.upsert).not.toHaveBeenCalled()
})

it('copies by day number and ignores dates missing from the target month', async () => {
  const result = await service.copyPreviousMonthSchedules('front-1', 'front-1', {
    employeeId: 'employee-1', targetMonth: '2026-03', overwrite: true
  })
  expect(result).toMatchObject({ copied: 28, targetMonth: '2026-03' })
})
```

- [ ] **Step 2: Run focused service/controller tests and verify RED**

Run: `cd server && ../node_modules/.bin/vitest run src/employee-attendance/employee-attendance.service.test.ts src/employee-attendance/employee-attendance.controller.test.ts`

Expected: FAIL because monthly schedule DTOs, methods and routes are absent.

- [ ] **Step 3: Add exact DTOs**

```ts
export class ScheduleSegmentDto {
  @Matches(CLOCK_TIME_PATTERN) startTime!: string
  @Matches(CLOCK_TIME_PATTERN) endTime!: string
}
export class MonthlyScheduleDayDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @IsBoolean() isWorkday!: boolean
  @ValidateNested({ each: true }) @Type(() => ScheduleSegmentDto) @IsArray() segments!: ScheduleSegmentDto[]
  @IsOptional() @IsString() remark?: string
}
export class BatchMonthlyScheduleDto extends OmitType(MonthlyScheduleDayDto, ['date'] as const) {
  @IsArray() @Matches(BUSINESS_DATE_PATTERN, { each: true }) dates!: string[]
}
export class CopyMonthlyScheduleDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_MONTH_PATTERN) targetMonth!: string
  @IsBoolean() overwrite!: boolean
}
```

Add a query DTO requiring `employeeId` and `month`. Change `MonthlySettingDto` to accept only `employeeId`, `month`, and `restQuotaDays`; never accept client `scheduledWorkDays` as authoritative. When saving the monthly setting, derive the stored compatibility value for `scheduledWorkDays` from monthly schedule workdays in the same transaction.

- [ ] **Step 4: Implement transaction-safe schedule methods**

```ts
type MonthlySchedulePayload = {
  employeeId: string
  date: string
  isWorkday: boolean
  segments: Array<{ startTime: string; endTime: string }>
  remark?: string
}

async listMonthlySchedules(frontendUserId: string, employeeId: string, month: string)
async saveMonthlyScheduleDay(frontendUserId: string, actorUserId: string, payload: MonthlySchedulePayload)
async deleteMonthlyScheduleDay(frontendUserId: string, actorUserId: string, id: string)
async batchSaveMonthlySchedules(frontendUserId: string, actorUserId: string, payload: Omit<MonthlySchedulePayload, 'date'> & { dates: string[] })
async copyPreviousMonthSchedules(frontendUserId: string, actorUserId: string, payload: { employeeId: string; targetMonth: string; overwrite: boolean })
```

For every write:

- Resolve employee ownership inside the transaction.
- Acquire the shared tenant config advisory lock, then canonical sorted payroll month locks.
- Recheck confirmed payroll and row `payrollLockedAt` after the locks.
- Normalize intervals with Task 1 helpers and derive `scheduledMinutes` server-side.
- Replace child segments in sequence order.
- Record an `EmployeeAuditLog` entry containing action, entity ID, employee, dates and reason.
- Return ordered segments plus server-derived `scheduledMinutes` and `breakMinutes`; list and mutation responses use the same shape.

Batch dates must be deduplicated and sorted before locks. Copy must load source month and target month under one transaction, reject `overwrite: false` when target rows exist, delete target rows only after all validation succeeds, and map dates using their day number.

- [ ] **Step 5: Add controller routes and access-grant coverage**

```ts
@Get('monthly-schedules')
@Post('monthly-schedules/day')
@Delete('monthly-schedules/day/:id')
@Post('monthly-schedules/batch')
@Post('monthly-schedules/copy-previous')
```

Each handler calls `authorize(user.id, grant)` before the service and passes `user.id` as both tenant and actor. Add controller tests that assert missing or invalid `x-ys-access-grant` is rejected before mutations.

- [ ] **Step 6: Verify GREEN**

Run: `cd server && ../node_modules/.bin/vitest run src/employee-attendance/employee-attendance.service.test.ts src/employee-attendance/employee-attendance.controller.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add server/src/employee-attendance/employee-attendance.dto.ts server/src/employee-attendance/employee-attendance.controller.ts server/src/employee-attendance/employee-attendance.service.ts server/src/employee-attendance/employee-attendance.service.test.ts server/src/employee-attendance/employee-attendance.controller.test.ts
git commit -m "feat: add monthly schedule api"
```

---

### Task 3: Manual Actual Intervals, Leave Coverage and Payroll Defaults

**Files:**
- Modify: `server/src/employee-attendance/employee-attendance.dto.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.ts`
- Modify: `server/src/employee-attendance/employee-attendance.service.test.ts`
- Modify: `server/src/employee-attendance/payroll.service.ts`
- Modify: `server/src/employee-attendance/payroll.service.test.ts`
- Modify: `server/src/employee-attendance/payroll-calculator.test.ts`

**Interfaces:**
- Consumes: monthly schedule days and Task 1 attendance metrics.
- Produces attendance responses containing `actualSegments`, derived `workedMinutes`, `lateMinutes`, `earlyLeaveMinutes`, and `absenceMinutes`.
- Produces payroll input whose `scheduledWorkDays` comes from monthly schedule days.

- [ ] **Step 1: Add failing attendance/payroll tests**

```ts
it('treats a scheduled day without a manual attendance row as normal', async () => {
  tx.employeeMonthlyScheduleDay.findMany.mockResolvedValue([
    { employeeId: employee.id, date: '2026-08-11', isWorkday: true, scheduledMinutes: 480, segments: [{ sequence: 0, startTime: '08:00', endTime: '16:00' }] }
  ])
  tx.employeeAttendanceRecord.findMany.mockResolvedValue([])
  const run = await service.generate('front-1', 'front-1', '2026-08')
  expect(run.items[0].calculationSnapshot.input).toMatchObject({ scheduledWorkDays: 1, absenceDays: 0 })
  expect(run.items[0].issues).not.toContain('缺少考勤记录')
})

it('derives punctuality when manual actual intervals exist', async () => {
  const saved = await attendance.createAttendance('front-1', 'front-1', {
    employeeId: 'employee-1', date: '2026-08-11', explicitAbsenceMinutes: 0, overtimeMinutes: 0, remark: '',
    actualSegments: [{ checkInAt: '2026-08-11T08:10:00+08:00', checkOutAt: '2026-08-11T15:50:00+08:00' }]
  })
  expect(saved).toMatchObject({ lateMinutes: 10, earlyLeaveMinutes: 10, absenceMinutes: 20 })
})

it('subtracts approved leave minutes from uncovered planned minutes', async () => {
  expect(await service.calculateAttendanceForDate('front-1', 'employee-1', '2026-08-11')).toMatchObject({ absenceMinutes: 0 })
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd server && ../node_modules/.bin/vitest run src/employee-attendance/employee-attendance.service.test.ts src/employee-attendance/payroll.service.test.ts src/employee-attendance/payroll-calculator.test.ts`

Expected: FAIL because payroll still requires attendance rows and attendance accepts one punch pair.

- [ ] **Step 3: Replace attendance mutation DTO authority**

```ts
export class ActualAttendanceSegmentDto {
  @Matches(ZONED_DATE_TIME_PATTERN) checkInAt!: string
  @Matches(ZONED_DATE_TIME_PATTERN) checkOutAt!: string
}
export class AttendanceDto {
  @IsString() @IsNotEmpty() employeeId!: string
  @Matches(BUSINESS_DATE_PATTERN) date!: string
  @ValidateNested({ each: true }) @Type(() => ActualAttendanceSegmentDto) @IsArray() actualSegments!: ActualAttendanceSegmentDto[]
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) @Max(1440) explicitAbsenceMinutes?: number
  @Transform(({ value }) => number(value)) @IsOptional() @IsInt() @Min(0) @Max(1440) overtimeMinutes?: number
  @IsOptional() @IsString() remark?: string
}
```

Do not accept `isScheduledWorkday`, `scheduledMinutes`, `workedMinutes`, `lateMinutes` or `earlyLeaveMinutes` as client authority.

Extend `AttendanceListQueryDto` with a transformed `employeeIds?: string[]` field that accepts a comma-separated value, validates every entry as a non-empty string, and is used only by leave listing. Add a service regression test proving `employeeIds: ['employee-1', 'employee-2']` becomes `employeeId: { in: [...] }` under the same tenant/date/status filters; an empty array must omit the employee predicate and return all employees.

- [ ] **Step 4: Save attendance against the monthly plan**

Inside the same payroll month lock transaction:

1. Load the monthly schedule day and its ordered plan segments.
2. Validate actual timestamps belong to `payload.date`, have both endpoints, are ascending and do not overlap.
3. Calculate approved leave minutes for that date using existing full-day, half-day and hourly rules.
4. Call `deriveAttendanceMetrics()`.
5. Upsert the parent attendance record with schedule snapshots and derived metrics.
6. Replace `EmployeeAttendanceSegment` children.
7. Return parent plus ordered `actualSegments`.

When `actualSegments` is empty, use `explicitAbsenceMinutes`; when non-empty, derived absence is authoritative. Preserve the explicit manual overtime value.

- [ ] **Step 5: Make payroll and overview schedule-driven**

Change payroll source loading to fetch monthly schedule days with segments for the payroll month. For each active employee:

- `scheduledWorkDays` equals the count of valid workdays within hire/termination bounds.
- A workday without an attendance record contributes zero absence.
- A workday with an attendance record contributes its derived absence fraction.
- Approved leave coverage reduces absence and continues to drive rest-quota/excess-leave deductions.
- Pending leave remains a confirmation blocker.
- Missing monthly schedule remains a blocker; missing attendance records do not.

Update overview so today is present by default when today is a scheduled workday without approved leave or explicit/manual derived absence.

Payroll confirmation must set `payrollLockedAt` on monthly schedule days as well as the existing payroll-source rows. Reopen must clear that lock consistently. Keep the confirmed-run recheck inside the shared advisory-lock transaction.

- [ ] **Step 6: Verify GREEN and locking regressions**

Run: `cd server && ../node_modules/.bin/vitest run src/employee-attendance/employee-attendance.service.test.ts src/employee-attendance/payroll.service.test.ts src/employee-attendance/payroll-calculator.test.ts`

Expected: all focused tests PASS, including existing confirmed-month and stale-row locking cases.

- [ ] **Step 7: Commit Task 3**

```bash
git add server/src/employee-attendance/employee-attendance.dto.ts server/src/employee-attendance/employee-attendance.service.ts server/src/employee-attendance/employee-attendance.service.test.ts server/src/employee-attendance/payroll.service.ts server/src/employee-attendance/payroll.service.test.ts server/src/employee-attendance/payroll-calculator.test.ts
git commit -m "feat: calculate attendance from monthly intervals"
```

---

### Task 4: Customer API, Store and Account-Scoped Mock

**Files:**
- Modify: `src/types/employeeAttendance.ts`
- Modify: `src/api/employeeAttendance.ts`
- Modify: `src/api/employeeAttendance.adapters.test.ts`
- Modify: `src/api/employeeAttendance.mock.test.ts`
- Modify: `src/mocks/employeeAttendance.ts`
- Modify: `src/stores/employeeAttendance.ts`
- Modify: `src/stores/employeeAttendance.test.ts`
- Create: `src/utils/attendanceIntervals.ts`
- Create: `src/utils/attendanceIntervals.test.ts`

**Interfaces:**
- Consumes: Task 2 and Task 3 server contracts.
- Produces customer types `ScheduleSegment`, `MonthlyScheduleDay`, `ActualAttendanceSegment`, `MonthlySchedulePayload`, `BatchMonthlySchedulePayload`.
- Produces store state `monthlySchedules` and `leaveEmployeeIds`.

- [ ] **Step 1: Write failing adapter, Mock and store tests**

```ts
it('normalizes monthly schedules and sends selected leave employee ids', async () => {
  await getLeaves({ employeeIds: ['emp-1', 'emp-2'], month: '2026-08' })
  expect(request.get).toHaveBeenCalledWith('/employee-attendance/leaves', {
    params: expect.objectContaining({ employeeIds: 'emp-1,emp-2', month: '2026-08' })
  })
})

it('mock batch overwrite replaces every selected day and persists intervals', async () => {
  await mockBatchSaveMonthlySchedules({ employeeId: 'emp-1', dates: ['2026-08-03', '2026-08-04'], isWorkday: true, segments: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }], remark: '' })
  const rows = await mockGetMonthlySchedules('emp-1', '2026-08')
  expect(rows.filter(row => ['2026-08-03', '2026-08-04'].includes(row.date)).every(row => row.scheduledMinutes === 480 && row.segments.length === 2)).toBe(true)
})

it('loads leaves for multiple employees while an empty selection loads all', async () => {
  store.leaveEmployeeIds = ['emp-1', 'emp-2']
  await store.loadLeaves()
  expect(store.leaves.every(row => ['emp-1', 'emp-2'].includes(row.employeeId))).toBe(true)
  store.leaveEmployeeIds = []
  await store.loadLeaves()
  expect(new Set(store.leaves.map(row => row.employeeId)).size).toBeGreaterThan(1)
})
```

- [ ] **Step 2: Run focused frontend tests and verify RED**

Run: `./node_modules/.bin/vitest run src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts src/stores/employeeAttendance.test.ts src/utils/attendanceIntervals.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'`

Expected: FAIL because the monthly schedule types, methods and multi-employee query do not exist.

- [ ] **Step 3: Define exact frontend types**

```ts
export interface ScheduleSegment { id?: string; sequence?: number; startTime: string; endTime: string }
export interface MonthlySchedulePayload { employeeId: string; date: string; isWorkday: boolean; segments: ScheduleSegment[]; remark?: string }
export interface MonthlyScheduleDay extends MonthlySchedulePayload { id: string; scheduledMinutes: number; breakMinutes: number }
export interface BatchMonthlySchedulePayload extends Omit<MonthlySchedulePayload, 'date'> { dates: string[] }
export interface ActualAttendanceSegment { id?: string; sequence?: number; checkInAt: string; checkOutAt: string }
export interface AttendancePayload { employeeId: string; date: string; actualSegments: ActualAttendanceSegment[]; explicitAbsenceMinutes?: number; overtimeMinutes?: number; remark?: string }
export interface AttendanceQuery { employeeId?: string; employeeIds?: string[]; month?: string; startDate?: string; endDate?: string; status?: LeaveStatus | '' }
```

Keep legacy weekly/override types only for migration compatibility; new pages must not consume them.

- [ ] **Step 4: Implement API adapters**

```ts
getMonthlySchedules(employeeId: string, month: string): Promise<MonthlyScheduleDay[]>
saveMonthlyScheduleDay(payload: MonthlySchedulePayload): Promise<MonthlyScheduleDay>
deleteMonthlyScheduleDay(id: string): Promise<void>
batchSaveMonthlySchedules(payload: BatchMonthlySchedulePayload): Promise<{ updated: number; overwritten: number }>
copyPreviousMonthSchedules(employeeId: string, targetMonth: string, overwrite: boolean): Promise<{ copied: number; targetMonth: string }>
```

Serialize `employeeIds` as a comma-separated query value. Normalize decimal/string totals and ordered nested segments without `any` assertions at the public adapter boundary.

- [ ] **Step 5: Implement Mock parity**

Extend `EmployeeAttendanceState` with `monthlySchedules`. Seed the current month from weekly schedules and overrides, matching the SQL migration. Implement:

- Interval validation and server-authoritative totals.
- Full selected-date overwrite.
- Natural day-number previous-month copy.
- Confirmed-month write locks on source and destination months.
- Default normal attendance when no actual segments exist.
- Account-scoped persistence; never mix Mock data across frontend accounts.
- Multi-employee leave filters combined with month/date/status.

- [ ] **Step 6: Implement store state without cross-page leakage**

```ts
const monthlySchedules = ref<MonthlyScheduleDay[]>([])
const leaveEmployeeIds = ref<string[]>([])
const loadMonthlySchedules = () => run(async () => {
  monthlySchedules.value = employeeId.value ? await api.getMonthlySchedules(employeeId.value, month.value) : []
  return monthlySchedules.value
})
const loadLeaves = () => run(async () => {
  const query = { ...dateQuery(), employeeId: undefined, employeeIds: leaveEmployeeIds.value, status: leaveStatus.value || undefined }
  ;[leaveTypes.value, leaves.value] = await Promise.all([api.getLeaveTypes(), api.getLeaves(query)])
  return leaves.value
})
```

Do not reuse `employeeId` for leave multi-selection. Schedules, records and compensation retain their existing single-employee filter.

- [ ] **Step 7: Verify GREEN**

Run the Step 2 command again.

Expected: all focused tests PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/types/employeeAttendance.ts src/api/employeeAttendance.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts src/mocks/employeeAttendance.ts src/stores/employeeAttendance.ts src/stores/employeeAttendance.test.ts src/utils/attendanceIntervals.ts src/utils/attendanceIntervals.test.ts
git commit -m "feat: add monthly scheduling frontend contracts"
```

---

### Task 5: Calendar Scheduling User Interface

**Files:**
- Create: `src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.vue`
- Create: `src/views/dashboard/employee-attendance/ScheduleDayDrawer.vue`
- Create: `src/views/dashboard/employee-attendance/ScheduleBatchDialog.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- Consumes: Task 4 store, API and utility contracts.
- Produces: month calendar, day editor, arbitrary-date batch overwrite and previous-month copy flow.

- [ ] **Step 1: Write failing page tests**

```ts
it('renders a month calendar and edits multiple intervals in the day drawer', async () => {
  const wrapper = mount(EmployeeSchedulesPage, attendanceMountOptions())
  await flushPromises()
  expect(wrapper.get('[data-testid="monthly-schedule-calendar"]').exists()).toBe(true)
  await wrapper.get('[data-date="2026-08-03"]').trigger('click')
  expect(wrapper.get('[data-testid="schedule-day-drawer"]').text()).toContain('添加工作时段')
  expect(wrapper.findAll('[data-testid="planned-interval"]')).toHaveLength(2)
  expect(wrapper.text()).toContain('休息 60 分钟')
  expect(wrapper.text()).toContain('工作 8.5 小时')
})

it('confirms the count before fully overwriting selected dates', async () => {
  const wrapper = mount(EmployeeSchedulesPage, attendanceMountOptions())
  await flushPromises()
  await wrapper.get('[data-testid="batch-mode"]').trigger('click')
  await wrapper.get('[data-date="2026-08-03"]').trigger('click')
  await wrapper.get('[data-date="2026-08-04"]').trigger('click')
  await wrapper.get('[data-testid="apply-batch"]').trigger('click')
  expect(wrapper.text()).toContain('将完整覆盖 2 个日期')
})

it('copies the previous month only after overwrite confirmation', async () => {
  const wrapper = mount(EmployeeSchedulesPage, attendanceMountOptions())
  await flushPromises()
  await wrapper.get('[data-testid="copy-previous-month"]').trigger('click')
  expect(wrapper.text()).toContain('覆盖当前月已有排班')
})
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'`

Expected: FAIL because monthly calendar components and test IDs are absent.

- [ ] **Step 3: Implement `MonthlyScheduleCalendar.vue`**

Props and events:

```ts
defineProps<{ month: string; rows: MonthlyScheduleDay[]; selectedDates: string[]; batchMode: boolean }>()
defineEmits<{ selectDate: [date: string]; toggleDate: [date: string] }>()
```

Render a seven-column natural month grid including leading/trailing blank cells. A populated day shows all intervals, computed rest minutes and work hours; a persisted rest day shows “休息”; no row shows “未排班”. Add `data-date` and `data-testid="monthly-schedule-calendar"` for acceptance tests.

- [ ] **Step 4: Implement `ScheduleDayDrawer.vue`**

Use a local editable copy of `MonthlySchedulePayload`. Provide:

- Workday/rest-day switch.
- Paired start/end `el-time-select` controls at 30-minute steps.
- Add/remove interval buttons.
- Live display from `src/utils/attendanceIntervals.ts`.
- Persistent server error without clearing entered intervals.
- Save emits a fully typed payload; delete emits the persisted row ID.

- [ ] **Step 5: Implement `ScheduleBatchDialog.vue`**

Accept selected dates and existing rows. Reuse the interval editor structure, show `selectedDates.length`, compute `overwrittenCount`, and require an `ElMessageBox.confirm()` with text `将完整覆盖 X 个日期，其中 Y 天已有排班` before emitting.

- [ ] **Step 6: Rewrite `EmployeeSchedulesPage.vue` orchestration**

Remove weekly template and temporary override tabs. Keep one month calendar plus a compact rest-quota panel. Toolbar actions:

- Copy previous month.
- Enter/exit batch selection.
- Apply batch to selected dates.
- Refresh.

Load employee and month through `store.loadMonthlySchedules()`. Save rest quota through the existing month-setting API without a client-authoritative scheduled workday field. Display the derived workday count from `store.monthlySchedules`.

- [ ] **Step 7: Verify GREEN and type safety**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.app.json
```

Expected: page tests and Vue type check PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/views/dashboard/employee-attendance src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: add monthly schedule calendar"
```

---

### Task 6: Manual Actual Interval Editor and Leave Multi-Select

**Files:**
- Modify: `src/views/dashboard/employee-attendance/EmployeeAttendancePageShell.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue`
- Modify: `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`
- Modify: `src/views/dashboard/EmployeeAttendancePages.test.ts`

**Interfaces:**
- Consumes: Task 4 attendance and leave contracts.
- Produces: manual multi-interval actual attendance and multi-employee leave list filtering.

- [ ] **Step 1: Write failing UI tests**

```ts
it('shows default normal attendance and lets an administrator add actual intervals', async () => {
  const wrapper = mount(EmployeeAttendanceRecordsPage, attendanceMountOptions())
  await flushPromises()
  expect(wrapper.text()).toContain('默认正常出勤')
  await wrapper.get('[data-testid="edit-attendance-emp-1"]').trigger('click')
  await wrapper.get('[data-testid="add-actual-interval"]').trigger('click')
  expect(wrapper.findAll('[data-testid="actual-interval"]')).toHaveLength(2)
  expect(wrapper.text()).toContain('迟到和早退由实际出勤时间计算')
  expect(wrapper.text()).not.toContain('按排班批量生成')
})

it('filters leave records by multiple employees and treats empty selection as all', async () => {
  const pinia = createPinia()
  const wrapper = mount(EmployeeLeavePage, { global: { plugins: [pinia, ElementPlus] } })
  await flushPromises()
  const select = wrapper.getComponent('[data-testid="leave-employee-filter"]')
  select.vm.$emit('update:modelValue', ['emp-1', 'emp-2'])
  await flushPromises()
  expect(useEmployeeAttendanceStore(pinia).leaveEmployeeIds).toEqual(['emp-1', 'emp-2'])
  select.vm.$emit('update:modelValue', [])
  await flushPromises()
  expect(useEmployeeAttendanceStore(pinia).leaveEmployeeIds).toEqual([])
})
```

- [ ] **Step 2: Run the page test and verify RED**

Run: `./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'`

Expected: FAIL because the actual interval controls and leave multi-select are absent.

- [ ] **Step 3: Rewrite the attendance dialog**

Replace single `checkInAt`/`checkOutAt` controls with a repeatable `actualSegments` array. Use datetime pickers whose date must match `form.date`. Show derived late/early values as read-only after save. When there are no actual segments:

- Display “默认正常出勤”.
- Allow explicit absence minutes.
- Keep overtime minutes and remark editable.

When actual segments exist, disable explicit absence input and explain that absence is derived from uncovered planned intervals.

Remove the “按排班批量生成” action and its page handler. Attendance rows now represent manual exceptions; the monthly schedule supplies normal attendance when no row exists. Keep the legacy generation endpoint callable only for backward compatibility, but do not use it from the new page.

- [ ] **Step 4: Add leave-only multi-select mode**

Extend `EmployeeAttendancePageShell.vue` with:

```ts
employeeMode?: 'single' | 'leave-multiple'
```

For `leave-multiple`, render an Element Plus select with `multiple`, `collapse-tags`, `collapse-tags-tooltip`, `filterable`, `clearable`, `data-testid="leave-employee-filter"`, and bind to `store.leaveEmployeeIds`. Empty array displays placeholder “全部员工”. Other pages keep the existing single `store.employeeId` selector unchanged.

- [ ] **Step 5: Verify GREEN and type safety**

Run:

```bash
./node_modules/.bin/vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.app.json
```

Expected: tests and Vue type check PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add src/views/dashboard/employee-attendance/EmployeeAttendancePageShell.vue src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue src/views/dashboard/employee-attendance/EmployeeLeavePage.vue src/views/dashboard/EmployeeAttendancePages.test.ts
git commit -m "feat: add manual attendance intervals and leave multiselect"
```

---

### Task 7: Admin Read-Only Monthly Schedule Parity

**Files:**
- Modify: `server/src/employee-attendance/payroll.service.ts`
- Modify: `server/src/employee-attendance/admin-employee-attendance.controller.test.ts`
- Modify: `admin/src/api.ts`
- Modify: `admin/src/api.employeeAttendance.test.ts`
- Modify: `admin/src/views/EmployeeAttendancePage.vue`
- Modify: `admin/src/views/EmployeeAttendancePage.test.ts`
- Modify: `admin/src/config/employeeAttendanceColumns.ts`

**Interfaces:**
- Consumes: Task 1 monthly schedule models and Task 3 attendance response.
- Produces read-only admin schedule rows with ordered intervals, break minutes and scheduled minutes.

- [ ] **Step 1: Add failing admin server/UI tests**

```ts
it('returns monthly schedule intervals only for allowed frontend accounts', async () => {
  await controller.schedules(adminUser, { frontendUserIds: ['front-1'], employeeId: 'employee-1', month: '2026-08' })
  expect(payroll.adminSchedules).toHaveBeenCalledWith(['front-1'], expect.objectContaining({ month: '2026-08' }))
})

it('renders monthly plan intervals without mutation controls', async () => {
  const wrapper = mountAdminAttendance('schedules')
  await flushPromises()
  expect(wrapper.text()).toContain('08:00—12:00')
  expect(wrapper.text()).toContain('休息 60 分钟')
  expect(wrapper.text()).not.toMatch(/保存|复制上月|批量覆盖|编辑|删除/)
})
```

- [ ] **Step 2: Run focused admin tests and verify RED**

Run:

```bash
cd server && ../node_modules/.bin/vitest run src/employee-attendance/admin-employee-attendance.controller.test.ts src/employee-attendance/payroll.service.test.ts
cd .. && ./node_modules/.bin/vitest run admin/src/api.employeeAttendance.test.ts admin/src/views/EmployeeAttendancePage.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
```

Expected: FAIL because admin schedules still expose weekly/override/month-setting shapes.

- [ ] **Step 3: Change admin schedule query**

`PayrollService.adminSchedules()` must query `employeeMonthlyScheduleDay.findMany()` with `segments: { orderBy: { sequence: 'asc' } }`, filter allowed frontend accounts, employee and month, and return account/employee snapshots plus derived break minutes. Ignore unrelated `status`, `startDate` and `endDate` when month is supplied, matching existing admin month precedence rules.

- [ ] **Step 4: Update admin real and Mock adapters**

Define exact admin monthly schedule types in `admin/src/api.ts`. Replace weekly/override seed rows for the schedules section with monthly day rows that include segments. Keep root and subpath POST/PATCH/PUT/DELETE rejection for `/admin/employee-attendance`.

- [ ] **Step 5: Render read-only monthly schedule rows**

Columns:

- Frontend account.
- Employee.
- Date.
- Workday/rest day.
- Ordered work intervals.
- Rest minutes.
- Total work hours.
- Remark.

Do not render edit, delete, copy, batch, approval, payroll confirmation or PNG controls.

- [ ] **Step 6: Verify GREEN and admin type safety**

Run:

```bash
cd server && ../node_modules/.bin/vitest run src/employee-attendance/admin-employee-attendance.controller.test.ts src/employee-attendance/payroll.service.test.ts
cd .. && ./node_modules/.bin/vitest run admin/src/api.employeeAttendance.test.ts admin/src/views/EmployeeAttendancePage.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
./node_modules/.bin/vue-tsc --noEmit -p admin/tsconfig.json
```

Expected: focused tests and admin type check PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add server/src/employee-attendance/payroll.service.ts server/src/employee-attendance/admin-employee-attendance.controller.test.ts admin/src/api.ts admin/src/api.employeeAttendance.test.ts admin/src/views/EmployeeAttendancePage.vue admin/src/views/EmployeeAttendancePage.test.ts admin/src/config/employeeAttendanceColumns.ts
git commit -m "feat: show monthly schedules in readonly admin"
```

---

### Task 8: Full Integration, Migration Parity and Browser Acceptance

**Files:**
- Modify: `README.md`
- Modify: `.env.example` only if a newly required setting is introduced; no new setting is expected.
- Modify: `docs/superpowers/plans/2026-08-11-monthly-multi-segment-scheduling.md` to mark completed checkboxes during execution.

**Interfaces:**
- Consumes all prior tasks.
- Produces a locally verified, documented feature with no production deployment.

- [ ] **Step 1: Add route-level integration assertions**

Extend existing page/controller suites to assert:

- Customer schedules route exposes month calendar controls.
- Customer records route displays default normal attendance and actual intervals.
- Customer leave route supports multiple selected employees.
- Admin schedules route is read-only.
- Every customer route sends `x-ys-access-grant` and every server write checks it.

- [ ] **Step 2: Run focused cross-layer regression suites**

```bash
./node_modules/.bin/vitest run src/api/employeeAttendance.mock.test.ts src/stores/employeeAttendance.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts admin/src/api.employeeAttendance.test.ts admin/src/views/EmployeeAttendancePage.test.ts --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
cd server && ../node_modules/.bin/vitest run src/employee-attendance
```

Expected: all focused customer, admin and server tests PASS.

- [ ] **Step 3: Verify the migration against a fresh schema diff**

Run Prisma format, validate and generate with a non-production `DATABASE_URL`. Create a fresh base-to-feature diff and compare it byte-for-byte with `server/prisma/migrations/20260811000000_add_monthly_schedule_segments/migration.sql`, excluding the intentional data backfill block from the structural comparison. Confirm all new tenant ownership indexes and composite foreign keys are present and no employee/history table is dropped.

- [ ] **Step 4: Run full repository verification**

```bash
./node_modules/.bin/vitest run --exclude '.worktrees/**' --exclude '.pnpm-store/**' --exclude '.superpowers/**'
cd server && ../node_modules/.bin/vitest run
cd ..
./node_modules/.bin/vue-tsc --noEmit -p tsconfig.app.json
./node_modules/.bin/vue-tsc --noEmit -p admin/tsconfig.json
./node_modules/.bin/vite build
cd admin && ../node_modules/.bin/vite build
cd ../server && ../node_modules/.bin/nest build
DATABASE_URL='postgresql://user:pass@localhost:5432/yangshao?schema=public' ../node_modules/.bin/prisma validate
cd .. && git diff --check
```

Expected: zero test failures, zero type errors, all builds exit 0, Prisma valid and diff check clean. Existing Vite chunk-size and dependency deprecation warnings are non-failing.

- [ ] **Step 5: Update local documentation**

Document:

- Monthly daily schedules replace weekly editing.
- Multiple same-day plan/actual intervals.
- Unrecorded actual attendance defaults to normal.
- Explicit absence and manual overtime rules.
- Previous-month copy behavior.
- Leave multi-employee filter.
- Migration backup/apply/rollback guidance without executing production commands.

- [ ] **Step 6: Start Mock previews and verify with the in-app browser**

Start customer port 5173 and admin port 5174 using installed Vite binaries and `VITE_USE_MOCKS=true`. Verify:

1. Customer schedule page: month grid, day drawer, multiple plan intervals, rest/work totals, arbitrary date batch overwrite and previous-month copy.
2. Customer records page: default normal label, multiple actual intervals, derived late/early/absence and manual overtime.
3. Customer leave page: empty selection shows all, two employees can be selected, create form remains single employee.
4. Payroll page: derived scheduled workdays and no missing-attendance blocker.
5. Admin schedule page: intervals visible and no write controls.
6. Browser console contains no new errors on fresh tabs.

Leave customer and admin attendance pages open as deliverables.

- [ ] **Step 7: Commit Task 8**

```bash
git add README.md docs/superpowers/plans/2026-08-11-monthly-multi-segment-scheduling.md
git commit -m "docs: document monthly attendance scheduling"
```

Do not push, deploy, or apply the production migration.
