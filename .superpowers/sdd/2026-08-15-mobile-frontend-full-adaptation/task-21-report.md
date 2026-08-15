# Task 21 Report: Mobile Compensation and Payroll

## Scope delivered

- Added presentation-only `MobileCompensationList` and `MobilePayrollList` components. Neither component imports a Store or API module; both receive authoritative data through props and emit page actions.
- Compensation now mounts exactly one editable presentation per layout: desktop keeps the existing tabs/tables, while mobile renders 44px touch tabs and cards for commission records, commission types, and bonus records.
- Mobile compensation shows the applied month/employee summary, exact two-decimal currency, employee/type/date/quantity/reason details, referenced-type state, and payroll-lock state. Referenced types cannot be edited, and locked commission/bonus rows expose no enabled mutation.
- Commission, bonus, commission-type, and payroll-adjustment mobile editors use `MobileFullscreenDialog`, `100dvh`, safe-area footer spacing, and decimal mobile keyboards. Validation rejects non-finite, non-positive, or otherwise invalid decimal input before API mutation.
- Compensation save state is visible in the sticky action area. Failed active saves preserve all current input, including edits made while a request is pending. Successful creates adopt the returned ID when a newer same-session draft exists, so the next save updates instead of creating a duplicate.
- Compensation loads and mutations use latest-operation, layout, page-session, editor-session, editing-ID, row-token, form-revision, and unmount guards. A late result cannot replace a newer list, close/error a newer editor, mutate a locked row, or continue page work after unmount/layout replacement.
- Mobile payroll cards display the existing authoritative run/item totals and calculation snapshots: status, total, payable/take-home, base salary, attendance bonus, overtime, commission, bonus, leave/absence deductions, adjustments, and issues. No salary formula was copied into the mobile component.
- Payroll composition expands within each card. Draft cards expose adjustment and confirmation actions; confirmed cards remove mutation controls and expose reopen. Generate/refresh, summary export, and employee-slip export reuse the existing page handlers.
- Payroll generate, load, adjustment, delete, confirm, and reopen flows use captured run/item/month identity plus latest-operation, layout/page/editor session, form-revision, row-token, and unmount guards. Mobile delete, confirm, and reopen keep the existing high-risk confirmations and exact reopen reason validation.
- `PayrollExportDialog` is full-screen and safe-area-aware on mobile, while desktop width, preview content, filename arguments, exporter calls, PNG download behavior, and success/failure messages remain unchanged. The current payroll export contract is download-only; it has no system-share contract, so no new `File`/`canShare`/preview-object-URL path was invented. Duplicate export, close/reopen staleness, layout change, and unmount lifecycle remain guarded.
- No Task 22 route matrix, navigation, admin, server, Store/API contract, payroll formula, database, migration, deployment, or production file was changed.

## TDD evidence

### RED

Command:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/components/employee-attendance/PayrollExportDialog.test.ts --reporter=dot
```

Observed result: 7 expected failures. The missing behavior was mobile compensation cards/tabs/forms/locks, mobile payroll cards/actions/details, export full-screen presentation, and export unmount invalidation; the pre-existing 103 tests passed.

Additional newer-draft RED:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts -t "retains and reports a newer bonus draft" --reporter=verbose
```

Observed result: the newer reason remained intact, but the page stayed at `保存中…` and did not surface the rejected request. The catch path was then narrowed to the active editor session rather than the submitted revision, preserving the newer draft while publishing the failure.

### GREEN

- Focused Task 21 suite: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/components/employee-attendance/PayrollExportDialog.test.ts --reporter=dot` -> 2 files passed, 112 tests passed.
- Newer-draft focused regression: 1 passed, 102 skipped.

## Verification

- Attendance frontend/Store/adapters/mock phase:
  - Command: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/views/dashboard/employee-attendance src/components/employee-attendance src/stores/employeeAttendance.test.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts --reporter=dot`
  - Result: 7 files passed, 180 tests passed.
- All server employee-attendance tests:
  - Command: `pnpm --filter yangshao-server exec vitest run src/employee-attendance --reporter=dot`
  - Result: 10 files passed, 163 tests passed.
- Controlled-clock full frontend/root suite:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 125 files passed, 1,395 tests passed.
- Type check: `pnpm exec vue-tsc --noEmit` -> exit 0.
- Production frontend build: `pnpm build` -> exit 0; Vite bundle and PWA service worker generated.
- Diff validation: `git diff --check` -> exit 0.

## Files changed

- `src/views/dashboard/employee-attendance/MobileCompensationList.vue` (new)
- `src/views/dashboard/employee-attendance/MobilePayrollList.vue` (new)
- `src/views/dashboard/employee-attendance/EmployeeCompensationPage.vue`
- `src/views/dashboard/employee-attendance/EmployeePayrollPage.vue`
- `src/components/employee-attendance/PayrollExportDialog.vue`
- `src/components/employee-attendance/PayrollExportDialog.test.ts`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-21-report.md` (new)

## Self-review

- Verified desktop/mobile exclusivity, exact currency, all compensation tabs, applied filters, referenced/locked states, fullscreen decimal editors, failed/newer draft retention, returned create-ID adoption, operation status, payroll snapshot-only composition, draft/confirmed locks, both export modes, exact confirm/reopen prompts, full-screen mobile export, and export late-result suppression.
- Confirmed mobile components contain no Store/API/network import. Salary fields come directly from `PayrollRun.items`, `PayrollItem.payableAmount`, and `calculationSnapshot`; only display formatting and deduction sign presentation occur locally.
- Confirmed the payroll PNG utility and filename builders were not modified. Desktop continues calling the same `downloadEmployeePayrollPng(item, month_number_name)` and `downloadPayrollSummaryPng(run)` paths.
- Confirmed the diff is Task 21-only. Existing warnings remain non-fatal: Vite CJS API, Dart Sass legacy API, Element Plus checkbox deprecation/duplicate loading registration, Node localStorage experimental warning, Rollup PURE annotation notices, and the existing large-chunk advisory.

## Concerns

- No known Task 21 correctness concern remains.
