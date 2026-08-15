# Task 18 Report: Mobile Attendance Shell, Calendar and Schedule Editing

## Scope delivered

- `EmployeeAttendancePageShell` now uses `useMobileLayout()` as the only layout selector. Desktop keeps its inline Element Plus month/employee filters; mobile gets a full-screen `MobileFilterDrawer`, selected month/employee summary, 44px native controls, refresh action, and existing action slot.
- `EmployeeSchedulesPage` mounts exactly one editable calendar: `MobileAttendanceCalendar` on mobile and the unchanged `MonthlyScheduleCalendar` on desktop. Existing Store/API payloads, monthly quota endpoint, batch endpoint, copy endpoint, and server-owned overview contract are unchanged.
- `MobileAttendanceCalendar` renders one unified seven-column cell sequence with leading and trailing `aria-hidden` blanks. August 2026 is a complete 42-cell grid and February 2026 is a boundary-case 28-cell grid. Every day retains server-provided status/tone and exposes textual planned, actual, approved-leave, overtime, and exception summaries. It only formats authoritative fields; it does not reimplement attendance or payroll calculations.
- Mobile overview metrics render as eight two-column cards and issues render as readable issue cards. Desktop overview alerts remain unchanged.
- Mobile batch mode uses `MobileActionBar` at `--mobile-page-action-bottom`, so the apply action remains above the employee-attendance secondary rail. It shows the selected-day count and retains the exact overwrite-count warning and confirmation.
- The day editor is a safe-area-aware `100dvh` bottom drawer only on mobile. Existing multiple-interval add/remove, `24:00` end, derived break/work display, validation, payload shape, and failed-save input retention remain. Mobile deletion now requires explicit confirmation; desktop deletion behavior is unchanged.
- The batch editor and copy-previous-month confirmation are full-screen only on mobile. Existing exact overwrite count, `ElMessageBox` confirmation, failure retention, and copy overwrite flag remain unchanged.
- Day save/delete completion is scoped by mounted state, layout, employee, month, date, editor-session epoch, operation epoch, and form revision. Batch and copy operations use equivalent dialog/session snapshots, locally scoped pending/error state, and duplicate-submit guards. Late success or failure cannot close, reset, reload, notify, or contaminate a newer session, while the active failure stays visible locally and retains the exact draft. Existing latest employee/month load protection remains unchanged.
- Mobile controls use 44px targets, safe-area padding, constrained width, wrapping text, scrollable full-screen bodies, and a landscape calendar adjustment. No server, admin, router, navigation configuration, business calculation, database, migration, deployment, or Task 19+ file changed.

## TDD evidence

### Initial RED

Command:

```bash
pnpm exec vitest run \
  src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts \
  src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.test.ts \
  src/views/dashboard/EmployeeAttendancePages.test.ts
```

Observed failures were requirement-specific:

- `MobileAttendanceCalendar.vue` did not exist.
- Mobile attendance filter and exclusive mobile calendar were absent.
- The day drawer was not full-screen on mobile.
- Day deletion did not request confirmation.
- Desktop `MonthlyScheduleCalendar` remained green.

An additional lifecycle RED reproduced an older day-save failure appearing inside a newer date editor. The context guard then made this case green without changing the payload or Store/API contract.

### Independent-review fix RED → GREEN

The review-fix tests first reproduced the rejected edge cases:

- same-date close/reopen, employee switch, newer form revision, delete, and unmount allowed obsolete day results to affect the active drawer or global Store error;
- batch close/reopen with a newer selection/edit and copy after an employee/context change allowed obsolete failures to enter the new dialog, and batch confirmation could be triggered twice;
- August 2026 had no trailing blank cells and the seventh-column rule counted only button elements;
- actual mobile switch, time-select, remark, rest-quota, copy-footer controls and prop-driven full-screen classes lacked direct contract coverage.

The GREEN implementation moved day/batch/copy mutations off the Store's global error boundary and retained the authoritative API calls/payloads. Per-operation and per-session snapshots now decide whether a confirmation may start an API call and whether an API result may affect UI state. Form-revision events make edits performed while a confirmation or request is pending newer than that operation. Full-screen and touch sizing are driven directly by `isMobileLayout`, including coarse/tablet mobile layouts, while desktop remains unchanged.

### Independent-review fix round 2 RED → GREEN

A focused regression test proved that the three always-visible mobile schedule actions—copy previous month, enter/exit batch selection, and save rest quota—still rendered as plain 32px Element Plus buttons. The same test also locks their labels, the batch-mode state transition, and desktop class absence. Each actual `el-button` now receives the existing global 44×44 `mobile-touch-target` class only when `isMobileLayout` is true; desktop classes and sizing remain unchanged.

### Final GREEN

- Focused Task 18 suite:
  - Command: `pnpm exec vitest run src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts src/views/dashboard/employee-attendance/MonthlyScheduleCalendar.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts --reporter=dot`
  - Result: 4 files passed, 56 tests passed.
- Type check:
  - Command: `pnpm exec vue-tsc --noEmit`
  - Result: exit 0.
- Production frontend build:
  - Command: `pnpm build`
  - Result: exit 0; Vue type check, Vite production bundle, and PWA service-worker generation completed. Existing dependency annotation and bundle-size warnings remained non-fatal.
- Controlled-clock full suite at the 2026-08-15 acceptance date:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 124 files passed, 1331 tests passed.
- Diff validation:
  - Command: `git diff --check`
  - Result: exit 0.

## Files changed

- `src/views/dashboard/employee-attendance/MobileAttendanceCalendar.vue`
- `src/views/dashboard/employee-attendance/MobileAttendanceCalendar.test.ts`
- `src/views/dashboard/employee-attendance/EmployeeAttendancePageShell.vue`
- `src/views/dashboard/employee-attendance/EmployeeSchedulesPage.vue`
- `src/views/dashboard/employee-attendance/AttendanceOverviewPanel.vue`
- `src/views/dashboard/employee-attendance/ScheduleDayDrawer.vue`
- `src/views/dashboard/employee-attendance/ScheduleBatchDialog.vue`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-18-report.md`
