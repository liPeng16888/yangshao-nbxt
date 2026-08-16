# Task 21 Report: Mobile Compensation and Payroll

## Scope delivered

- Added presentation-only `MobileCompensationList` and `MobilePayrollList` components. Neither component imports a Store or API module; both receive authoritative data through props and emit page actions.
- Compensation now mounts exactly one editable presentation per layout: desktop keeps the existing tabs/tables, while mobile renders 44px touch tabs and cards for commission records, commission types, and bonus records.
- Mobile compensation shows the applied month/employee summary, exact two-decimal currency, employee/type/date/quantity/reason details, referenced-type state, and payroll-lock state. Referenced types cannot be edited, and locked commission/bonus rows expose no enabled mutation.
- Commission, bonus, commission-type, and payroll-adjustment mobile editors use `MobileFullscreenDialog`, `100dvh`, safe-area footer spacing, and decimal mobile keyboards. Validation rejects non-finite, non-positive, or otherwise invalid decimal input before API mutation.
- Compensation save state is visible in the sticky action area. All four editors (commission, commission type, bonus, and payroll adjustment) preserve newer input and surface an active same-editor failure. A successful save with a revision mismatch reports `有较新输入待保存`; successful creates adopt the returned ID so the next save updates instead of creating a duplicate; unchanged successes close normally.
- Compensation saves now use operation-owned busy tokens rather than page-global booleans or the Store's old-session request count. Layout replacement and unmount explicitly retire only the old owner, so a late old resolve/reject cannot leave the replacement layout busy or clear a newer operation. Loads and row mutations retain latest-operation, layout, page-session, editor-session, editing-ID, row-token, form-revision, and unmount guards.
- Following explicit user authorization, the server payroll calculator now adds authoritative `grossEarningsAmount` and `deductionAmount` to every new or recalculated snapshot while preserving the existing `payableAmount` formula unchanged. Gross contains base salary, earned attendance bonus, overtime, commission, bonus, and positive manual adjustments; deductions contain leave, absence, and absolute negative manual adjustments. Decimal half-up tests cover zero and mixed adjustments, leave/absence rounding, and `gross - deductions = payable`.
- Legacy draft and confirmed snapshots are projected on GET from their stored snapshot input/result by the canonical server helper. This returns a copied response only: no database write, Prisma schema change, migration, or historical snapshot mutation occurs. Snapshots that already contain explicit authoritative totals are preserved without reinterpreting their legacy input.
- Mobile payroll cards display three distinct exact server-owned headlines: `应发`, `扣款`, and `实发`. `MobilePayrollList` only formats these values and performs no aggregate arithmetic; its run-level `totalAmount` label is `实发合计`, matching the existing sum-of-payable contract. Detailed salary components remain unchanged.
- Payroll composition expands within each card. Draft cards expose adjustment and confirmation actions; confirmed cards remove mutation controls and expose reopen. Generate/refresh, summary export, and employee-slip export reuse the existing page handlers.
- Payroll generate, load, adjustment, delete, confirm, and reopen flows capture the selected month, payroll run ID, and relevant item ID. They recheck that identity after prompts, immediately before APIs, and after APIs before committing or reloading. Month/run replacement invalidates prompt/action ownership, closes stale adjustment/export surfaces, and permits a new operation without an old completion clearing its busy state. Mobile delete, confirm, and reopen keep the existing high-risk confirmations and exact reopen reason validation.
- The payroll month watcher now invalidates the prior page session synchronously. The actual `EmployeeAttendancePageShell` apply sequence can therefore update `store.month` and emit its single refresh without the default-flush watcher subsequently discarding that new-month response. The shell remains the sole load owner: applying a month issues exactly one request, rapid changes commit only the latest response, and same-month refresh still issues exactly one request.
- `PayrollExportDialog` is full-screen and safe-area-aware on mobile, while desktop width, preview content, filename arguments, exporter calls, PNG download behavior, and success/failure messages remain unchanged. The current payroll export contract is download-only; it has no system-share contract, so no new `File`/`canShare`/preview-object-URL path was invented. Duplicate export, close/reopen staleness, layout change, and unmount lifecycle remain guarded.
- No Task 22 route matrix, navigation, admin behavior, Prisma schema, database, migration, historical data, deployment, or production file was changed. The only server/API change is the explicitly authorized additive payroll result contract; the existing payable formula is unchanged.

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

Authorized payroll totals RED:

```bash
pnpm --filter yangshao-server exec vitest run src/employee-attendance/payroll-calculator.test.ts src/employee-attendance/payroll.service.test.ts --reporter=verbose
pnpm exec vitest run src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts src/views/dashboard/EmployeeAttendancePages.test.ts --reporter=dot
```

Observed server result: 7 expected failures exposed missing gross/deduction calculator fields, missing new/recalculated snapshot fields, and absent legacy draft/confirmed GET projection; 46 related tests passed. A separate explicit-total legacy-input RED rejected because the projection unnecessarily interpreted an already authoritative snapshot. Observed frontend result: 4 expected failures exposed absent adapter normalization, absent Mock contract fields, and the duplicate payable-backed mobile headline; 186 related tests passed. A final mobile-label RED proved the run payable total was still mislabeled `应发合计` before it was corrected to `实发合计`.

### GREEN

- Focused Task 21 suite: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/components/employee-attendance/PayrollExportDialog.test.ts --reporter=dot` -> 2 files passed, 140 tests passed.
- Newer-draft focused regression: 1 passed, 102 skipped.

## Verification

- Attendance frontend/Store/adapters/mock phase:
  - Command: `pnpm exec vitest run src/views/dashboard/EmployeeAttendancePages.test.ts src/views/dashboard/employee-attendance src/components/employee-attendance src/stores/employeeAttendance.test.ts src/api/employeeAttendance.adapters.test.ts src/api/employeeAttendance.mock.test.ts --reporter=dot`
  - Result: 7 files passed, 209 tests passed.
- All server employee-attendance tests:
  - Command: `pnpm --filter yangshao-server exec vitest run src/employee-attendance --reporter=dot`
  - Result: 10 files passed, 166 tests passed.
- Full server suite:
  - Command: `pnpm --filter yangshao-server test -- --reporter=dot`
  - Result: 28 files passed, 355 tests passed.
- Controlled-clock full frontend/root suite:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 125 files passed, 1,426 tests passed.
- Default-clock full frontend/root transparency run:
  - Command: `pnpm exec vitest run --reporter=dot`
  - Result: 124 files passed; 1 unrelated date-sensitive test failed and 1,425 tests passed. `MedicineInventoryPages.test.ts` expected fixed `occurredOn: '2026-08-15'` while the current date was `2026-08-16`; the same complete suite passes under the controlled clock above. This Task 21 change did not alter that medicine test.
- Type check: `pnpm exec vue-tsc --noEmit` -> exit 0.
- Production frontend build: `pnpm build` -> exit 0; Vite bundle and PWA service worker generated.
- Production server build: `pnpm --filter yangshao-server build` -> exit 0.
- Diff validation: `git diff --check` -> exit 0.
- Prisma format/validate/generate were not run because no Prisma schema was touched.

## Files changed

- `src/views/dashboard/employee-attendance/MobileCompensationList.vue` (new)
- `src/views/dashboard/employee-attendance/MobilePayrollList.vue` (new)
- `src/views/dashboard/employee-attendance/EmployeeCompensationPage.vue`
- `src/views/dashboard/employee-attendance/EmployeePayrollPage.vue`
- `src/components/employee-attendance/PayrollExportDialog.vue`
- `src/components/employee-attendance/PayrollExportDialog.test.ts`
- `src/views/dashboard/EmployeeAttendancePages.test.ts`
- `src/types/employeeAttendance.ts`
- `src/api/employeeAttendance.ts`
- `src/api/employeeAttendance.adapters.test.ts`
- `src/mocks/employeeAttendance.ts`
- `src/api/employeeAttendance.mock.test.ts`
- `src/utils/payrollPng.test.ts` (additive fixture fields only)
- `server/src/employee-attendance/payroll-calculator.ts`
- `server/src/employee-attendance/payroll-calculator.test.ts`
- `server/src/employee-attendance/payroll.service.ts`
- `server/src/employee-attendance/payroll.service.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-21-report.md` (new)

## Self-review

- Verified desktop/mobile exclusivity, exact currency, all compensation tabs, applied filters, referenced/locked states, fullscreen decimal editors, exact create/edit/delete payloads, failed/newer draft retention for all four editors, returned create-ID adoption, operation-owner replacement, payroll month/run/item identity, actual PageShell month apply/rapid change/same-month refresh behavior, current/stale generated runs, draft/confirmed locks, both export modes, exact confirm/reopen prompts, full-screen mobile export, and export late-result suppression.
- Confirmed mobile components contain no Store/API/network import. The three headline fields come directly from `PayrollItem.payableAmount` and the server-authored calculation snapshot; no gross, deduction, or payable arithmetic occurs in `MobilePayrollList`.
- Confirmed the payroll PNG utility and filename builders were not modified. Desktop continues calling the same `downloadEmployeePayrollPng(item, month_number_name)` and `downloadPayrollSummaryPng(run)` paths.
- Confirmed the server derives compatibility fields from stored snapshot data on read without calling employee/source reloads or any update method. New and adjustment-recalculated snapshots include both totals; explicit totals are preserved.
- Confirmed the diff is Task 21-only. Existing warnings remain non-fatal: Vite CJS API, Dart Sass legacy API, Element Plus checkbox deprecation/duplicate loading registration, Node localStorage experimental warning, Rollup PURE annotation notices, and the existing large-chunk advisory.

## Authorized authoritative payroll headline contract

- The user explicitly authorized the recommended minimal server-owned contract expansion after the earlier blocker was reported. `PayrollCalculationResult`, generated/recalculated snapshots, frontend types, adapters, and Mock fixtures now carry `grossEarningsAmount` and `deductionAmount` additively.
- The expansion requires no database columns: calculation snapshots remain JSON, legacy snapshots are enriched only in the response, and `payableAmount` remains the existing authoritative final result. Desktop export/download presentation and filenames remain byte-path compatible because their production code was not modified.
