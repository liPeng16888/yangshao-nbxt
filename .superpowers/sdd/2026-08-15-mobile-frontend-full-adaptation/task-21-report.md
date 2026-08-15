# Task 21 Report: Mobile Compensation and Payroll

## Scope delivered

- Added presentation-only `MobileCompensationList` and `MobilePayrollList` components. Neither component imports a Store or API module; both receive authoritative data through props and emit page actions.
- Compensation now mounts exactly one editable presentation per layout: desktop keeps the existing tabs/tables, while mobile renders 44px touch tabs and cards for commission records, commission types, and bonus records.
- Mobile compensation shows the applied month/employee summary, exact two-decimal currency, employee/type/date/quantity/reason details, referenced-type state, and payroll-lock state. Referenced types cannot be edited, and locked commission/bonus rows expose no enabled mutation.
- Commission, bonus, commission-type, and payroll-adjustment mobile editors use `MobileFullscreenDialog`, `100dvh`, safe-area footer spacing, and decimal mobile keyboards. Validation rejects non-finite, non-positive, or otherwise invalid decimal input before API mutation.
- Compensation save state is visible in the sticky action area. All four editors (commission, commission type, bonus, and payroll adjustment) preserve newer input and surface an active same-editor failure. A successful save with a revision mismatch reports `有较新输入待保存`; successful creates adopt the returned ID so the next save updates instead of creating a duplicate; unchanged successes close normally.
- Compensation saves now use operation-owned busy tokens rather than page-global booleans or the Store's old-session request count. Layout replacement and unmount explicitly retire only the old owner, so a late old resolve/reject cannot leave the replacement layout busy or clear a newer operation. Loads and row mutations retain latest-operation, layout, page-session, editor-session, editing-ID, row-token, form-revision, and unmount guards.
- Mobile payroll cards display the existing authoritative run/item totals and calculation snapshots: status, total, payable/take-home, base salary, attendance bonus, overtime, commission, bonus, leave/absence deductions, adjustments, and issues. No salary formula was copied into the mobile component.
- Payroll composition expands within each card. Draft cards expose adjustment and confirmation actions; confirmed cards remove mutation controls and expose reopen. Generate/refresh, summary export, and employee-slip export reuse the existing page handlers.
- Payroll generate, load, adjustment, delete, confirm, and reopen flows capture the selected month, payroll run ID, and relevant item ID. They recheck that identity after prompts, immediately before APIs, and after APIs before committing or reloading. Month/run replacement invalidates prompt/action ownership, closes stale adjustment/export surfaces, and permits a new operation without an old completion clearing its busy state. Mobile delete, confirm, and reopen keep the existing high-risk confirmations and exact reopen reason validation.
- The payroll month watcher now invalidates the prior page session synchronously. The actual `EmployeeAttendancePageShell` apply sequence can therefore update `store.month` and emit its single refresh without the default-flush watcher subsequently discarding that new-month response. The shell remains the sole load owner: applying a month issues exactly one request, rapid changes commit only the latest response, and same-month refresh still issues exactly one request.
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

Independent-review fix-round RED:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts -t "retires the|surfaces an active|blocks a deferred payroll|blocks adjustment save" --reporter=verbose
```

Observed result: 10 failures exposed layout-retained busy state, missing active newer-draft errors for commission/type/adjustment, cross-month confirm/reopen calls, and stale adjustment submission. The valid bonus newer-draft behavior remained green. The tests were then expanded to cover old resolve and reject against a newer operation, unmount settlement, exact compensation/adjustment create-edit-delete payloads, returned-ID adoption, current and stale payroll identities, and generated-run publication.

Payroll PageShell synchronization RED:

```bash
pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts -t "commits exactly one new-month payroll load from the actual mobile PageShell apply flow" --reporter=verbose
```

Observed result: the actual mobile filter applied `2026-09` and issued the expected single new-month request, but its resolved response was discarded because the default-flush month watcher invalidated the page session after `load()` had already captured it. Changing month invalidation to synchronous made the shell-emitted refresh capture the new session without introducing a second load. Follow-up behavior tests cover rapid month changes, same-month refresh, stale response suppression, and a deferred old-run confirmation prompt.

### GREEN

- Focused Task 21 suite: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/components/employee-attendance/PayrollExportDialog.test.ts --reporter=dot` -> 2 files passed, 140 tests passed.
- Newer-draft focused regression: 1 passed, 102 skipped.

## Verification

- Attendance frontend/Store/adapters/mock phase:
  - Command: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/views/dashboard/employee-attendance src/components/employee-attendance src/stores/employeeAttendance.test.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts --reporter=dot`
  - Result: 7 files passed, 209 tests passed.
- All server employee-attendance tests:
  - Command: `pnpm --filter yangshao-server exec vitest run src/employee-attendance --reporter=dot`
  - Result: 10 files passed, 163 tests passed.
- Controlled-clock full frontend/root suite:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 125 files passed, 1,423 tests passed.
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

- Verified desktop/mobile exclusivity, exact currency, all compensation tabs, applied filters, referenced/locked states, fullscreen decimal editors, exact create/edit/delete payloads, failed/newer draft retention for all four editors, returned create-ID adoption, operation-owner replacement, payroll month/run/item identity, actual PageShell month apply/rapid change/same-month refresh behavior, current/stale generated runs, draft/confirmed locks, both export modes, exact confirm/reopen prompts, full-screen mobile export, and export late-result suppression.
- Confirmed mobile components contain no Store/API/network import. Salary fields come directly from `PayrollRun.items`, `PayrollItem.payableAmount`, and `calculationSnapshot`; only display formatting and deduction sign presentation occur locally.
- Confirmed the payroll PNG utility and filename builders were not modified. Desktop continues calling the same `downloadEmployeePayrollPng(item, month_number_name)` and `downloadPayrollSummaryPng(run)` paths.
- Confirmed the diff is Task 21-only. Existing warnings remain non-fatal: Vite CJS API, Dart Sass legacy API, Element Plus checkbox deprecation/duplicate loading registration, Node localStorage experimental warning, Rollup PURE annotation notices, and the existing large-chunk advisory.

## Pending authoritative payroll headline contract

- Independent review requested three distinct mobile headline values: authoritative gross/earnings (`应发`), deduction total (`扣款`), and net/payable (`实发`). The current server `PayrollCalculationResult`, persisted calculation snapshot, Prisma payroll item, frontend type, and response adapter expose component earnings, `leaveDeduction`, `absenceDeduction`, and `payableAmount`, but no authoritative gross aggregate or deduction-total aggregate.
- This fix round intentionally leaves the current two payable-backed headline values unchanged and characterizes them explicitly in the mobile test. Deriving gross or deduction total in Vue/adapter would duplicate the salary formula and violate server authority. Completing the three-headline request therefore requires explicit authorization for a server-owned calculation/contract expansion; no server/API payroll contract or formula was changed here.
