# Employee attendance final review fix report

Date: 2026-08-11
Branch: `codex/employee-attendance`
Starting commit: `1e37658`
Scope: final whole-branch review fixes only; no production deployment and no database migration was applied.

## Outcome

All 12 Important review findings were reproduced or defended with focused regression tests and fixed consistently across the Nest/Prisma server, customer frontend, admin frontend and local Mock implementations. The final migration is additive and is byte-for-byte identical to a fresh Prisma schema diff from the branch base schema to the final schema.

The final automated result is:

- Complete repository Vitest: 75 files / 617 tests passed.
- Explicit admin Vitest: 9 files / 40 tests passed.
- Explicit server Vitest: 18 files / 210 tests passed.
- Customer and admin `vue-tsc --noEmit`: passed.
- Customer and admin Vite production builds: passed.
- Nest build: passed.
- Prisma format, validate and generate: passed.
- Fresh migration comparison and `git diff --check`: passed.

## Important findings closed

### 1. Attendance invariants and payroll absence behavior

- A scheduled workday must have `scheduledMinutes > 0`; a rest day must have exactly 0 minutes.
- Punches must be a complete pair and checkout must be later than checkin.
- A no-punch scheduled workday must explicitly record all time not covered by approved leave as absence.
- Payroll computes the uncovered portion after approved full-day, half-day or hourly leave. A one-minute placeholder absence cannot hide an otherwise full-day absence.
- Legacy invalid rows remain confirmation blockers: zero-minute workdays, lone punches and insufficient explicit absence each produce a precise issue.
- A partial update that changes only a remark now accepts trusted `Date` objects loaded from Prisma while the public request contract still requires timezone-aware strings. This final integration regression was reproduced as `上班时间必须包含明确时区` before the fix.
- Server and Mock tests cover zero minutes, rest-day normalization, lone punches, reversed punches, missing timezone, Beijing business-date mismatch, one-minute fake absence and partial approved leave.

### 2. Draft payroll preservation

- Regenerating a draft no longer deletes payroll items merely because an employee's status, hire date or termination date was edited after the draft was created.
- Existing draft employee IDs are included as preserved sources, and their item IDs and manual adjustments are retained.
- Existing rows that cannot be freshly sourced are retained rather than silently deleted.
- Employee deletion treats payroll items as history, deactivating the employee rather than orphaning the draft.
- The existing configuration lock and audit transaction continue to serialize employee edits with payroll generation/confirmation.

### 3. Immediate access-grant revocation

- `AccessGuardGroup` now has `grantVersion Int @default(1)`.
- Issued JWTs carry `groupId`, `grantVersion` and feature membership.
- `hasAccessGrant` is asynchronous and checks the current database row for tenant ownership, enabled state, exact version and current feature membership on every protected request.
- Group updates increment the version transactionally; password, feature and enabled-state changes invalidate old grants immediately. Deleted groups also invalidate their old grants.
- All completed-sample-data callers now await the asynchronous validation.
- Frontend sessions store group/version/features, select a token for the exact requested feature and clear affected sessions after group update, deletion, password reset or a structured `403 ACCESS_GRANT_INVALID` response. Login/logout/main-session 401 clears all secondary sessions.
- Upgrade behavior is intentional: legacy versionless cached grants become invalid once and require password re-entry.

### 4. Root Vite real-API proxy

- Root Vite now proxies `/api` to `http://127.0.0.1:3000` with `changeOrigin: true`.
- `vite-proxy.test.ts` defends the Mock-disabled local configuration.
- README now documents `/api` as the local real-backend path and distinguishes the local Vite proxy from deployed Nginx/gateway routing.

### 5. Planned schedule start/end times

- Weekly schedules and date overrides now persist nullable `plannedStartTime` and `plannedEndTime` fields.
- Workdays require valid `HH:mm` values; the server derives minutes and ignores client-supplied duration as an authority.
- Rest days normalize start/end to null and minutes to zero.
- Overnight or zero-length schedules are explicitly unsupported in this release (`end <= start` is rejected).
- Customer UI and Mock derive/display duration from the planned times. Admin shows both planned columns read-only.
- The unapplied migration was regenerated after these schema changes.

### 6. Punch timestamp contract

- Public punches require ISO timestamps with `Z` or an explicit numeric offset.
- Customer `datetime-local` values serialize with a fixed `+08:00` offset and restore to Beijing wall time for editing.
- Server validation normalizes the instant, verifies both punches belong to the row's Beijing business date and enforces checkout after checkin.
- Customer and admin displays use Beijing time.
- Trusted Prisma `Date` values are supported during partial updates without weakening the public DTO contract.

### 7. Month-scoped pending leave and payroll blocker UI

- Customer and admin overview pending-leave counts use month-overlap bounds.
- Overview overtime is sourced from the selected month rather than today's rows.
- Payroll confirmation pending-leave lookup uses the same selected-month overlap bounds.
- Mock generation and confirmation ignore a prior-month pending leave; a regression adds such a leave before successfully confirming the current month.
- The payroll page visibly lists draft issues and disables `确认工资并锁定` while `issueCount > 0`.

### 8. Mutually exclusive month/date filters

- Pinia exposes `selectMonth` and `selectDateRange`. Selecting a month clears both dates; entering either date clears the visible month value.
- Attendance, leave and compensation pages use the shared transitions rather than silently ignoring stale state.
- Generation snapshots the visible target month, restores month mode and reloads that same month.
- Customer API, customer Mock, admin API/Mock and server services reject requests that combine month and date range instead of applying hidden precedence.

### 9. Referenced leave and commission types

- Once referenced, a type can make only the one-way active-to-inactive transition. Name, quota semantics, unit and price edits are rejected.
- An existing leave or commission record may retain its same inactive type during another edit.
- Reassignment or creation using an inactive type is rejected.
- Type list responses include a `referenced` flag; the UI labels referenced rows `已使用，仅可停用`, disables generic editing and retains the explicit delete/deactivate action.
- Server, Mock and UI regressions cover both retention and reassignment cases.

### 10. Employee deletion history

- Weekly schedules, date overrides and monthly settings now count as employee history in both server and Mock deletion logic.
- Prisma relations for those three models use `onDelete: Restrict` instead of cascade.
- Employees with any schedule, attendance, leave, compensation, payroll or monthly-setting history are deactivated and assigned a termination date by the history-delete flow; only truly unused employees are hard-deleted.

### 11. Remove unsupported `TERMINATED`

- Customer types/UI, admin types/UI/table labels and Mock data now use only `ACTIVE | INACTIVE`.
- Departure is represented with `INACTIVE` plus `terminationDate`; the admin label is `停用/离职`.
- Invalid admin employee status is rejected rather than silently returning all rows.
- A final source scan finds no production `TERMINATED` reference. A regression first reproduced the old admin `离职` mapping, then verified the unsupported value is no longer recognized.

### 12. Selected-month overtime overview

- Server and Mock overview sum all attendance overtime rows in the selected month.
- The customer card label is exactly `本月加班总时长`.
- Tests distinguish selected-month rows from today's rows.

## Low-risk related fixes

- Mock private photos now round-trip through the same public API used by the employee page. The focused RED returned null before wiring `readEmployeePhoto` to the Mock repository.
- Private photo storage rejects a private root equal to or nested under the public `UPLOAD_DIR`.
- Photo reads detect JPEG/PNG/WebP content from bytes, return the detected content type and use `Cache-Control: private, no-store` plus `X-Content-Type-Options: nosniff`.
- Monthly overview aggregates late/early reminders without applying automatic salary deductions.
- The admin table's final stale `TERMINATED: '离职'` formatter entry was removed.

## Regression TDD evidence

Focused RED evidence included:

- Access revocation: 10 server failures and 11 frontend failures before version/current-group validation and session cleanup.
- Public Mock photo API: `expected null to be an instance of Blob`.
- Admin status map: unsupported `TERMINATED` rendered as `离职`.
- Partial attendance update: a trusted stored `Date` punch was rejected as lacking an explicit timezone.
- Attendance/payroll/schedule/filter/type tests failed against the pre-fix invariants, then passed after the minimal cross-layer implementation.

Focused final GREEN commands:

```bash
cd server
./node_modules/.bin/vitest run \
  src/auth/auth.service.test.ts \
  src/employee-attendance/employee-attendance.service.test.ts \
  src/employee-attendance/payroll.service.test.ts \
  src/employee-attendance/private-employee-photo.service.test.ts \
  src/employee-attendance/employee-attendance.controller.test.ts \
  src/lab-sheets/lab-sheets.controller.test.ts
```

Result: 6 files / 83 tests passed after the additional stored-Date regression.

```bash
./node_modules/.bin/vitest run \
  src/api/accessGuard.sessions.test.ts \
  src/stores/accessGuard.test.ts \
  src/stores/auth.accessSessions.test.ts \
  src/utils/request.test.ts \
  src/api/labSheet.test.ts \
  src/api/employeeAttendance.mock.test.ts \
  src/api/employeeAttendance.adapters.test.ts \
  src/stores/employeeAttendance.test.ts \
  src/views/dashboard/EmployeeAttendancePages.test.ts \
  admin/src/api.employeeAttendance.test.ts \
  admin/src/views/EmployeeAttendancePage.test.ts \
  vite-proxy.test.ts
```

The final complete repository run supersedes the earlier focused count.

## Prisma and migration verification

Commands:

```bash
cd server
DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/db?schema=public' \
  ./node_modules/.bin/prisma format --schema prisma/schema.prisma
DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/db?schema=public' \
  ./node_modules/.bin/prisma validate --schema prisma/schema.prisma
DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/db?schema=public' \
  ./node_modules/.bin/prisma generate --schema prisma/schema.prisma
DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/db?schema=public' \
  ./node_modules/.bin/prisma migrate diff \
  --from-schema-datamodel='<base-worktree>/server/prisma/schema.prisma' \
  --to-schema-datamodel=prisma/schema.prisma --script \
  --output=/private/tmp/employee-attendance-final-migration.sql
cmp -s prisma/migrations/20260810000000_add_employee_attendance/migration.sql \
  /private/tmp/employee-attendance-final-migration.sql
```

Results:

- Schema formatted, validated and generated with Prisma 6.19.3.
- Migration comparison exited 0 (`migration exact: yes`).
- The single unapplied attendance migration now includes `grantVersion`, planned schedule fields and restrictive schedule/month-setting employee foreign keys.
- A destructive SQL scan found no `DROP`, `DELETE FROM` or `TRUNCATE` statement.
- No local or production database was changed.

## Final verification

```text
./node_modules/.bin/vitest run
  75 files / 617 tests passed

./node_modules/.bin/vitest run admin/src
  9 files / 40 tests passed

cd server && ./node_modules/.bin/vitest run
  18 files / 210 tests passed

./node_modules/.bin/vue-tsc --noEmit
  passed

cd admin && ./node_modules/.bin/vue-tsc --noEmit
  passed

./node_modules/.bin/vite build
  passed; 2,418 modules transformed

cd admin && ./node_modules/.bin/vite build
  passed; 2,265 modules transformed

cd server && ./node_modules/.bin/nest build
  passed

git diff --check
  passed
```

`COREPACK_ENABLE_PROJECT_SPEC=0 pnpm build:all` was attempted as requested. The workspace wrapper tried to fetch pnpm registry metadata and then refused to purge the linked worktree `node_modules` directories without a TTY:

```text
ERR_PNPM_META_FETCH_FAIL
ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY
```

It stopped before project scripts. No purge was authorized. Each exact build stage was then run from the installed local binaries as shown above, and all passed.

Existing non-failing warnings remain: Sass legacy API deprecation, Element Plus checkbox deprecation, localStorage experimental warning in Node, Rollup annotation cleanup and large Vite chunks.

## Deferred items and scope boundary

- A bulk atomic weekly-schedule endpoint remains deferred. The current UI still saves seven owned weekday rows through the existing endpoints. This was explicitly permitted as a non-blocking minor and was not allowed to expand the final fix wave.
- Phone encryption remains deferred. The locked sensitive-field encryption scope is ID card, bank card, address and emergency contact; changing phone storage would require a data migration and wider product decision.
- No production deployment, external message, database migration application or data mutation was performed.
- In-app browser acceptance is left to the primary agent after this commit; automated UI, API and build verification is complete.
- The three worktree `node_modules` symlinks remain untracked and must not be staged.
