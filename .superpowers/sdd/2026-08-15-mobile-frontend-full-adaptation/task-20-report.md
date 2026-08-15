# Task 20 Report: Mobile Leave Management

## Scope delivered

- Added presentation-only `MobileLeaveList` rendering mutually exclusive mobile leave-record and leave-type cards while preserving the existing desktop tabs and tables.
- Mobile records show employee number/name, leave type, date range, unit/hours, server-returned counted days, reason, review remark, textual approval status, and payroll-lock/processed state. No quota, payroll, or salary rule was copied into Vue.
- Mobile leave types show name, active/inactive state, rest-quota participation, referenced/one-way-deactivate state, and disabled edit for referenced types.
- Added 44px touch tabs, controls, and card actions; safe-area spacing; `100dvh` full-screen create/edit dialogs; textual status in addition to color; semantic labels and tab roles; and long-text wrapping.
- Employee, approval-status, and date filters live in a full-screen draft drawer. Draft changes do not affect applied Store state until Apply; Reset returns to the current month/all employees/all statuses. Existing Store request sequencing keeps only the latest list/type response, retains the applied filter on failure, and retries the exact current query from the page error action.
- Leave create/edit and leave-type create/edit reuse the existing Store/API payloads. Failed active saves keep the exact form; duplicate submits are blocked; successful creates adopt only the returned ID when the same open form has newer edits so the next save updates that ID without overwriting the newer draft.
- Approve requires the exact mobile confirmation, mobile reject uses the exact reason prompt and nonblank validation, and leave/type delete-or-deactivate operations require explicit mobile confirmation. The legacy desktop reject path still submits an empty prompt result exactly as before. Processed or payroll-locked leave cards keep all mutation controls visibly disabled.
- Save, review, delete, and type mutations use mounted-state, layout, page-session, editor-session, operation-token, editing-context, and form-revision guards. Stale results cannot close/reload/error a newer form or continue after layout change/unmount, and duplicate actions are ignored.
- Page-owned leave loads now use a scoped Store cancellation signal. Layout changes and actual unmount release that page's loading ownership immediately; late resolve/reject settlements cannot publish rows, types, loading, or errors. A layout transition starts exactly one successor scope with the current applied filters, while unmount cancels without replacement. Rapid layout flips cancel each obsolete successor so only the latest can commit. Cancelling an owned load does not cancel a newer Store consumer, while an active latest failure remains visible and retries the exact applied filter.
- Leave-type save and delete/deactivate operations share one local/global operation lock on both desktop and mobile, retaining the prior `store.saving` serialization while confirmation, API work, or save is pending.
- No API endpoint or payload, API adapter, mock, server, admin, route, navigation, payroll/quota calculation, database, migration, production, or Task 21+ file changed.

## TDD evidence

### RED

Command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts --reporter=dot
```

Observed result: the new Task 20 mobile tests failed because mobile leave/type cards, the applied filter drawer, touch tabs, full-screen leave/type editors, guarded actions, and lifecycle behavior did not exist. The pre-existing page behavior remained green apart from a cascading spy cleanup failure after an earlier expected RED assertion.

The filter latest-response/retry case also received an explicit mutation check: disabling the `MobileLeaveList` mount made that focused test fail because the integration boundary was absent; restoring the mount made it pass.

Review-fix RED command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts --reporter=verbose
```

Observed result before the fix: 16 failures. The failures directly reproduced scoped leave loads retaining `loading` after cancellation, post-mutation refreshes surviving actual unmount for leave save/review/delete and type save/delete, the desktop empty-reason rejection regression, and overlapping leave-type operations. Existing create-ID tests already characterized the implementation; the added leave-type cases confirm same-session newer-edit ID adoption and stale-session non-adoption.

Review-fix round 2 RED command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts -t "layout transition|rapid layout flips|initial leave load on unmount" --reporter=verbose
```

Observed result before the fix: the two layout-transition cases failed because request counts remained at one instead of starting the expected successor; the unmount cancellation/no-replacement characterization passed. After the single watcher fix, all three passed.

Server authority check during RED:

```bash
pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts --reporter=dot
```

Result: 1 file passed, 9 tests passed.

### GREEN and refactor coverage

- Card tests cover exclusive desktop/mobile rendering, all requested leave fields, status text, type active/rest-quota flags, referenced state, and locked/processed disabled actions.
- Filter tests cover draft isolation, applied employee/status/date values, exact API query, latest-only out-of-order settlement, visible latest failure, and exact retry.
- Form tests cover mobile `100dvh` editors, active same-session/same-revision failure retention of every leave/type field and local error, duplicate save prevention, newer-draft preservation, successful leave/type create-ID adoption, subsequent update, stale-session non-adoption, layout invalidation, and unchanged desktop failure behavior.
- Action tests cover exact approve confirmation, exact reject-reason prompt and API remark, legacy desktop blank rejection, exact leave and type delete/deactivate confirmations, referenced-type edit disabled/no emit, and duplicate/overlap blocking.
- Lifecycle tests unmount the actual page after each successful leave save, review, leave delete, type save, and type delete has started its refresh; both late resolve and late reject are silent and cannot retain loading or publish rows/errors.
- Layout lifecycle tests cover an initial deferred load followed by one mobile/desktop transition, exact applied filters across rapid transitions, stale resolve/reject silence, latest-only row/type publication, balanced loading, no initial mount duplication, and unmount cancellation without replacement.

## Verification

- Focused page/Store suite: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/stores/employeeAttendance.test.ts --reporter=dot` -> 2 files passed, 104 tests passed (97 page, 7 Store).
- Focused API read-only verification: `pnpm exec vitest run src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts --reporter=dot` -> 2 files passed, 58 tests passed.
- Server payroll/quota read-only suite: `pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts src/employee-attendance/payroll.service.test.ts --reporter=dot` -> 2 files passed, 51 tests passed.
- Controlled-clock full frontend/root suite: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot` -> 125 files passed, 1,386 tests passed.
- Type check: `pnpm exec vue-tsc --noEmit` -> exit 0.
- Production frontend build: `pnpm build` -> exit 0; Vite bundle and PWA service worker generated.
- Diff validation: `git diff --check` -> exit 0.
- Existing non-fatal warnings: Vite CJS API, Sass legacy API, Element Plus checkbox deprecation, duplicate loading directive, Node localStorage experimental warning, Rollup misplaced PURE annotations, and the existing large-chunk advisory.

## Files changed

- `src/views/dashboard/employee-attendance/MobileLeaveList.vue`
- `src/views/dashboard/employee-attendance/EmployeeLeavePage.vue`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `src/stores/employeeAttendance.ts`
- `src/stores/employeeAttendance.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-20-report.md`
