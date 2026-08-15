# Task 19 Report: Mobile Employee Directory and Attendance Records

## Scope delivered

- `EmployeeDirectoryPage` now mounts `MobileEmployeeList` only in mobile layout and keeps the existing Element Plus table only on desktop. The presentation component receives only normalized masked `Employee` rows; revealed identity, bank, address, contact, photo blobs, object URLs, passwords, and access-grant tokens never enter card props, caches, or persistence.
- Mobile employee cards show an initial avatar, employee number/name, active or inactive text status, phone, masked ID/bank values, salary, and explicit photo-present/photo-absent state. Search and status selection use a full-screen filter drawer, and create/edit/reveal/photo/upload/remove actions continue through the page's existing API handlers.
- Employee create/edit uses `MobileFullscreenDialog` with `100dvh`, safe-area padding, single-column mobile layout, 44px controls/actions, and the existing desktop 760px width. All four sensitive edit fields initialize blank and remain omitted from edit payloads unless explicitly supplied through the existing `buildEmployeeMutationPayload` contract. Failed saves retain every field; duplicate submissions are blocked; operation, editor-session, form-revision, layout, and mounted-state guards prevent stale success/failure from closing, reloading, notifying, or overwriting a newer draft.
- Sensitive reveal still requires the existing `EMPLOYEE_ATTENDANCE` access group/password session. Expired grants are discarded before reveal, repeated protected clicks do not duplicate requests, revealed values remain dialog-local and are cleared on close/layout change/unmount.
- Private employee photos still use the authenticated `readEmployeePhoto` API and browser-owned blob URLs. Preview requests are latest-only, same-row duplicates are blocked, stale/unmounted blobs never receive an object URL, and every owned URL is revoked on replacement, dialog close, layout change, or unmount. Mobile upload retains the existing private photo API and is guarded against duplicate row uploads.
- `EmployeeAttendanceRecordsPage` now mounts `MobileAttendanceRecordList` only on mobile and preserves the existing desktop table. The mobile filter exposes mutually exclusive month/date-range modes plus employee and derived display-status filters while retaining the Store's existing month/date query contract.
- Attendance cards show employee, date, status text, schedule summary, all actual intervals, and late/early-leave/absence/overtime exception text. Payroll-locked records display their lock and expose disabled edit/delete controls; unlocked mobile deletion now requires explicit confirmation.
- Attendance create/edit uses the shared full-screen dialog on mobile and the existing 760px desktop width. Multiple actual intervals, same-day validation, unsupported `24:00`, ordering/non-overlap rules, explicit-absence disabling/zeroing when intervals exist, existing API payload shape, and server-owned payroll/calculation authority are unchanged.
- Attendance save/delete operations use local saving/error boundaries plus operation, editor-session, form-revision, layout, mounted-state, and duplicate guards. A late result cannot affect a newer edit or reload after unmount, while an active unchanged failure remains visible with the exact draft retained.
- Cards and filter controls use native labels/buttons, textual statuses in addition to color, 44px touch targets, safe-area bottom spacing, min-width constraints, and `overflow-wrap` handling for long employee/contact/remark content.
- No Store, API adapter, mock implementation, server, admin, router, navigation, payroll calculation, database, migration, production, or Task 20+ file changed.

## TDD evidence

### Initial RED

Command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts
```

Observed result: 12 new mobile assertions failed while the pre-existing 52 assertions remained green. The failures were requirement-specific: employee/attendance mobile cards and selectors did not exist, both desktop tables still rendered in mobile layout, mobile filters and full-screen editors were absent, locked/remove controls were unavailable, and the new photo/auth/lifecycle selectors could not be reached.

### GREEN and refactor coverage

- Employee tests cover exclusive card rendering, mask/non-disclosure, avatar/photo states, full-screen search/status drawer, all sensitive edit fields blank, every entered value retained on failure, duplicate save/reveal/photo guards, newer-edit and close/reopen session retention, expired access-grant password flow, exact real `Blob` passed to `URL.createObjectURL`, exact URL revocation, layout cleanup, and no URL creation after unmount.
- Attendance tests cover exclusive cards, employee/date/status filtering, mutually exclusive month/range controls, actual/exception summaries, mobile full-screen multi-interval editing, explicit-absence disabling, existing same-day/`24:00`/overlap validation, payroll locks, delete confirmation, duplicate/newer-draft save retention, and no post-unmount reload/error.
- Existing desktop tests continue to exercise desktop tables, legacy attendance responses, unchanged multi-interval payloads, mutation failures, access verification, and monthly/date query behavior.

## Final verification

- Focused page, Store, adapter, and mock suite:
  - Command: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts --reporter=dot`
  - Result: 4 files passed, 124 tests passed.
- Controlled-clock full suite at the 2026-08-15 acceptance date:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 124 files passed, 1,345 tests passed.
- Type check:
  - Command: `pnpm exec vue-tsc --noEmit`
  - Result: exit 0.
- Production frontend build:
  - Command: `pnpm build`
  - Result: exit 0; Vue type check, Vite bundle, and PWA service-worker generation completed. Existing dependency annotation and bundle-size warnings remained non-fatal.
- Diff validation:
  - Command: `git diff --check`
  - Result: exit 0.

## Files changed

- `src/views/dashboard/employee-attendance/MobileEmployeeList.vue`
- `src/views/dashboard/employee-attendance/MobileAttendanceRecordList.vue`
- `src/views/dashboard/employee-attendance/EmployeeDirectoryPage.vue`
- `src/views/dashboard/employee-attendance/EmployeeAttendanceRecordsPage.vue`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-19-report.md`
