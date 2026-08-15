# Task 20 Report: Mobile Leave Management

## Scope delivered

- Added presentation-only `MobileLeaveList` rendering mutually exclusive mobile leave-record and leave-type cards while preserving the existing desktop tabs and tables.
- Mobile records show employee number/name, leave type, date range, unit/hours, server-returned counted days, reason, review remark, textual approval status, and payroll-lock/processed state. No quota, payroll, or salary rule was copied into Vue.
- Mobile leave types show name, active/inactive state, rest-quota participation, referenced/one-way-deactivate state, and disabled edit for referenced types.
- Added 44px touch tabs, controls, and card actions; safe-area spacing; `100dvh` full-screen create/edit dialogs; textual status in addition to color; semantic labels and tab roles; and long-text wrapping.
- Employee, approval-status, and date filters live in a full-screen draft drawer. Draft changes do not affect applied Store state until Apply; Reset returns to the current month/all employees/all statuses. Existing Store request sequencing keeps only the latest list/type response, retains the applied filter on failure, and retries the exact current query from the page error action.
- Leave create/edit and leave-type create/edit reuse the existing Store/API payloads. Failed active saves keep the exact form; duplicate submits are blocked; successful creates adopt only the returned ID when the same open form has newer edits so the next save updates that ID without overwriting the newer draft.
- Approve requires the exact mobile confirmation, reject retains the existing reason prompt with nonblank validation, and leave/type delete-or-deactivate operations require explicit mobile confirmation. Processed or payroll-locked leave cards keep all mutation controls visibly disabled.
- Save, review, delete, and type mutations use mounted-state, layout, page-session, editor-session, operation-token, editing-context, and form-revision guards. Stale results cannot close/reload/error a newer form or continue after layout change/unmount, and same-row duplicate actions are ignored.
- No Store, API adapter, mock, server, admin, route, navigation, payroll/quota calculation, database, migration, production, or Task 21+ file changed.

## TDD evidence

### RED

Command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --reporter=dot
```

Observed result: the new Task 20 mobile tests failed because mobile leave/type cards, the applied filter drawer, touch tabs, full-screen leave/type editors, guarded actions, and lifecycle behavior did not exist. The pre-existing page behavior remained green apart from a cascading spy cleanup failure after an earlier expected RED assertion.

The filter latest-response/retry case also received an explicit mutation check: disabling the `MobileLeaveList` mount made that focused test fail because the integration boundary was absent; restoring the mount made it pass.

Server authority check during RED:

```bash
pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts --reporter=dot
```

Result: 1 file passed, 9 tests passed.

### GREEN and refactor coverage

- Card tests cover exclusive desktop/mobile rendering, all requested leave fields, status text, type active/rest-quota flags, referenced state, and locked/processed disabled actions.
- Filter tests cover draft isolation, applied employee/status/date values, exact API query, latest-only out-of-order settlement, visible latest failure, and exact retry.
- Form tests cover mobile `100dvh` editors, failure retention, duplicate save prevention, newer-draft preservation, successful-create ID adoption, subsequent update, layout invalidation, and unchanged desktop failure behavior.
- Action tests cover exact approve confirmation, exact reject-reason prompt and API remark, exact leave delete confirmation, and duplicate review blocking.

## Verification

- Focused leave/page suite: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --reporter=dot` -> 1 file passed, 76 tests passed.
- Server payroll/quota read-only suite: `pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts src/employee-attendance/payroll.service.test.ts --reporter=dot` -> 2 files passed, 51 tests passed.
- Controlled-clock full frontend/root suite: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot` -> 125 files passed, 1,363 tests passed.
- Type check: `pnpm exec vue-tsc --noEmit` -> exit 0.
- Production frontend build: `pnpm build` -> exit 0; Vite bundle and PWA service worker generated.
- Diff validation: `git diff --check` -> exit 0.
- Existing non-fatal warnings: Vite CJS API, Sass legacy API, Element Plus checkbox deprecation, duplicate loading directive, Node localStorage experimental warning, Rollup misplaced PURE annotations, and the existing large-chunk advisory.

## Files changed

- `src/views/dashboard/employee-attendance/MobileLeaveList.vue`
- `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-20-report.md`
