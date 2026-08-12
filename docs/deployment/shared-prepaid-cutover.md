# Shared prepaid ledger cutover

This runbook is the production gate for removing the legacy count-based prepaid tables. The cleanup migration is destructive. Never apply it to a real database until a timestamped backup has been restored into a temporary database and every verification gate below has passed.

The cleanup migration is intentionally strict: Prisma migration history is its idempotency boundary, its row delete is replay-safe, and its named `DROP TABLE` statements omit `IF EXISTS`. A manual replay or unexpected schema drift must fail loudly. It does not use `CASCADE`, does not update lab-sheet JSON, and does not delete ordinary finance, sample, customer, attendance, medicine, password, upload, or account data.

## Required inputs

Set these shell variables in the operator session. Do not paste their values into tickets, logs, or screenshots:

```bash
export SOURCE_DATABASE_URL='<production PostgreSQL URL>'
export RESTORE_DATABASE_URL='<temporary empty PostgreSQL database URL>'
export DATABASE_URL="$SOURCE_DATABASE_URL"
export CUTOVER_ID="$(date -u +%Y%m%dT%H%M%SZ)"
export BACKUP_DIR='<restricted backup directory outside the repository and web root>'
export BACKUP_FILE="$BACKUP_DIR/yangshao-before-shared-prepaid-$CUTOVER_ID.dump"
export BASELINE_COUNTS_BEFORE="$BACKUP_DIR/baseline-counts-before-$CUTOVER_ID.tsv"
export BASELINE_COUNTS_RESTORE="$BACKUP_DIR/baseline-counts-restore-$CUTOVER_ID.tsv"
export BASELINE_COUNTS_AFTER="$BACKUP_DIR/baseline-counts-after-$CUTOVER_ID.tsv"
export LEGACY_COUNTS_BEFORE="$BACKUP_DIR/legacy-counts-before-$CUTOVER_ID.tsv"
export LEGACY_COUNTS_RESTORE="$BACKUP_DIR/legacy-counts-restore-$CUTOVER_ID.tsv"
export PERMISSIONS_EXPECTED="$BACKUP_DIR/prepaid-permissions-expected-$CUTOVER_ID.csv"
export PERMISSIONS_RESTORE_PHASE_A="$BACKUP_DIR/prepaid-permissions-restore-phase-a-$CUTOVER_ID.csv"
export PERMISSIONS_SOURCE_PHASE_A="$BACKUP_DIR/prepaid-permissions-source-phase-a-$CUTOVER_ID.csv"
export PERMISSIONS_AFTER="$BACKUP_DIR/prepaid-permissions-after-$CUTOVER_ID.csv"
export PERMISSION_ISSUES_RESTORE_PHASE_A="$BACKUP_DIR/prepaid-permission-issues-restore-phase-a-$CUTOVER_ID.txt"
export PERMISSION_ISSUES_SOURCE_PHASE_A="$BACKUP_DIR/prepaid-permission-issues-source-phase-a-$CUTOVER_ID.txt"
export PERMISSION_ISSUES_AFTER="$BACKUP_DIR/prepaid-permission-issues-after-$CUTOVER_ID.txt"
export VERIFY_BEFORE="$BACKUP_DIR/shared-prepaid-verify-before-$CUTOVER_ID.json"
export VERIFY_AFTER="$BACKUP_DIR/shared-prepaid-verify-after-$CUTOVER_ID.json"
export VERIFY_RESTORE_PHASE_A="$BACKUP_DIR/shared-prepaid-verify-restore-phase-a-$CUTOVER_ID.json"
export PHASE_A_DIR='<immutable phase-A release directory>'
export PHASE_B_DIR='<immutable phase-B release directory>'
export PHASE_A_REVISION='1bf6efcffba9c10acefa9daadeedb5d9dfee829d'
export PHASE_B_REVISION='5a568e4cd49f1759ca39814eb4ae0470b5aedc7a'
export PHASE_A_TREE='44032364d84c754276ce7b07e4ac1a32699be6c6'
export PHASE_B_TREE='1fb0603b2c0271340d48f140c210c7907e2632a6'
```

Use a directory owned by the deployment user with mode `0700`; backup and verifier files may contain business identifiers and counts. Check free space before starting. The examples assume the repository is already deployed at the intended revision and `pnpm install --frozen-lockfile` has completed.

The baseline-count query used at every pre/post-cutover and rollback checkpoint contains only tables guaranteed to exist before Phase A and whose row counts Phase A does not change. It intentionally excludes `FrontendSubAccountPermission`, which Phase A transforms, as well as `LabSampleSaveRequest` and every shared-prepaid table created by Phase A:

```sql
SELECT table_name, row_count
FROM (
  VALUES
    ('User', (SELECT COUNT(*)::bigint FROM "User")),
    ('AccessGuardGroup', (SELECT COUNT(*)::bigint FROM "AccessGuardGroup")),
    ('AccessGuardGroupFeature', (SELECT COUNT(*)::bigint FROM "AccessGuardGroupFeature")),
    ('Customer', (SELECT COUNT(*)::bigint FROM "Customer")),
    ('InviteCode', (SELECT COUNT(*)::bigint FROM "InviteCode")),
    ('SubAdminFrontendPermission', (SELECT COUNT(*)::bigint FROM "SubAdminFrontendPermission")),
    ('LabSheet', (SELECT COUNT(*)::bigint FROM "LabSheet")),
    ('SampleBlock', (SELECT COUNT(*)::bigint FROM "SampleBlock")),
    ('CellChangeLog', (SELECT COUNT(*)::bigint FROM "CellChangeLog")),
    ('AbnormalRecord', (SELECT COUNT(*)::bigint FROM "AbnormalRecord")),
    ('FinanceEntry', (SELECT COUNT(*)::bigint FROM "FinanceEntry")),
    ('MonthlySettlementRecord', (SELECT COUNT(*)::bigint FROM "MonthlySettlementRecord")),
    ('MonthlyCustomerRemark', (SELECT COUNT(*)::bigint FROM "MonthlyCustomerRemark")),
    ('FinanceDeletionRequestOrdinary', (SELECT COUNT(*)::bigint FROM "FinanceDeletionRequest" WHERE "sourceType" <> 'PREPAID_RECHARGE')),
    ('BlacklistRecord', (SELECT COUNT(*)::bigint FROM "BlacklistRecord")),
    ('UploadedFile', (SELECT COUNT(*)::bigint FROM "UploadedFile")),
    ('Reminder', (SELECT COUNT(*)::bigint FROM "Reminder")),
    ('MedicineInventoryItem', (SELECT COUNT(*)::bigint FROM "MedicineInventoryItem")),
    ('MedicineInventoryMovement', (SELECT COUNT(*)::bigint FROM "MedicineInventoryMovement")),
    ('MedicineCommonName', (SELECT COUNT(*)::bigint FROM "MedicineCommonName")),
    ('Employee', (SELECT COUNT(*)::bigint FROM "Employee")),
    ('EmployeeWeeklySchedule', (SELECT COUNT(*)::bigint FROM "EmployeeWeeklySchedule")),
    ('EmployeeDateOverride', (SELECT COUNT(*)::bigint FROM "EmployeeDateOverride")),
    ('EmployeeMonthlySetting', (SELECT COUNT(*)::bigint FROM "EmployeeMonthlySetting")),
    ('EmployeeAttendanceRecord', (SELECT COUNT(*)::bigint FROM "EmployeeAttendanceRecord")),
    ('EmployeeLeaveType', (SELECT COUNT(*)::bigint FROM "EmployeeLeaveType")),
    ('EmployeeLeaveRequest', (SELECT COUNT(*)::bigint FROM "EmployeeLeaveRequest")),
    ('EmployeeCommissionType', (SELECT COUNT(*)::bigint FROM "EmployeeCommissionType")),
    ('EmployeeCommissionRecord', (SELECT COUNT(*)::bigint FROM "EmployeeCommissionRecord")),
    ('EmployeeBonus', (SELECT COUNT(*)::bigint FROM "EmployeeBonus")),
    ('EmployeePayrollRun', (SELECT COUNT(*)::bigint FROM "EmployeePayrollRun")),
    ('EmployeePayrollItem', (SELECT COUNT(*)::bigint FROM "EmployeePayrollItem")),
    ('EmployeePayrollAdjustment', (SELECT COUNT(*)::bigint FROM "EmployeePayrollAdjustment")),
    ('EmployeeAuditLog', (SELECT COUNT(*)::bigint FROM "EmployeeAuditLog"))
) AS counts(table_name, row_count)
ORDER BY table_name;
```

Save that SQL once as a protected temporary operator file, `/tmp/yangshao-baseline-counts.sql`. Also save this legacy-only query as `/tmp/yangshao-legacy-counts.sql`:

```sql
SELECT table_name, row_count
FROM (
  VALUES
    ('PrepaidRechargeRecord', (SELECT COUNT(*)::bigint FROM "PrepaidRechargeRecord")),
    ('PrepaidCustomerRemark', (SELECT COUNT(*)::bigint FROM "PrepaidCustomerRemark")),
    ('PrepaidUsageRemark', (SELECT COUNT(*)::bigint FROM "PrepaidUsageRemark")),
    ('FinanceDeletionRequest PREPAID_RECHARGE', (
      SELECT COUNT(*)::bigint
      FROM "FinanceDeletionRequest"
      WHERE "sourceType" = 'PREPAID_RECHARGE'
    ))
) AS counts(table_name, row_count)
ORDER BY table_name;
```

Use both files unchanged at every applicable checkpoint. The shared verifier is a Phase-A schema check and must never be used as a substitute for these baseline queries on a restored pre-Phase-A database.

Save the next query as `/tmp/yangshao-permission-expected.sql`. It derives the complete expected post-Phase-A permission set from the pre-Phase-A assignments, preserving every unaffected permission. Per `20260811230000_add_shared_prepaid_ledger`, `FINANCE_PREPAID_ADD` maps to `PREPAID_RECHARGE`, while `FINANCE_PREPAID_CUSTOMERS` maps to both `PREPAID_CUSTOMERS` and `PREPAID_CONSUMPTIONS`. No retired permission maps to `PREPAID_SETTLEMENTS`, so that new permission must have no migration-created row.

```sql
SELECT "subAccountId", permission
FROM (
  SELECT "subAccountId", "permission"::text AS permission
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text NOT IN ('FINANCE_PREPAID_ADD', 'FINANCE_PREPAID_CUSTOMERS')
  UNION ALL
  SELECT "subAccountId", 'PREPAID_RECHARGE'::text AS permission
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text = 'FINANCE_PREPAID_ADD'
  UNION ALL
  SELECT "subAccountId", 'PREPAID_CUSTOMERS'::text AS permission
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text = 'FINANCE_PREPAID_CUSTOMERS'
  UNION ALL
  SELECT "subAccountId", 'PREPAID_CONSUMPTIONS'::text AS permission
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text = 'FINANCE_PREPAID_CUSTOMERS'
) expected
ORDER BY "subAccountId", permission;
```

Save this post-Phase-A query as `/tmp/yangshao-permission-actual.sql`:

```sql
SELECT "subAccountId", "permission"::text AS permission
FROM "FrontendSubAccountPermission"
ORDER BY "subAccountId", permission;
```

Save this violation-only query as `/tmp/yangshao-permission-issues.sql`. With `psql -At`, a healthy result is an empty file:

```sql
SELECT issue
FROM (
  SELECT 'retired:' || "subAccountId" || ':' || "permission"::text AS issue
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text IN ('FINANCE_PREPAID_ADD', 'FINANCE_PREPAID_CUSTOMERS')
  UNION ALL
  SELECT 'unexpected-settlement:' || "subAccountId" AS issue
  FROM "FrontendSubAccountPermission"
  WHERE "permission"::text = 'PREPAID_SETTLEMENTS'
  UNION ALL
  SELECT 'duplicate:' || "subAccountId" || ':' || "permission"::text AS issue
  FROM "FrontendSubAccountPermission"
  GROUP BY "subAccountId", "permission"
  HAVING COUNT(*) > 1
) violations
ORDER BY issue;
```

All five protected SQL files and their outputs may contain business identifiers. Keep them under the same restricted handling as the backup and remove the temporary SQL files only after the cutover closes.

## Cutover procedure

### 1. Put prepaid writes in maintenance mode

Announce the window. Stop or remove external access to all API instances that can write prepaid data, including sample saves that may create or reverse prepaid consumption. Do not rely on hiding frontend controls: deny write requests at the load balancer/reverse proxy or stop the API service, and confirm there are no remaining API workers or background jobs connected with write credentials.

Keep prepaid writes blocked until Step 10 passes. Read-only static frontend pages may remain available only if their API access cannot write.

### 2. Record ordinary business-table counts

With writes already stopped, use a read-only transaction and save the result:

```bash
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-baseline-counts.sql > "$BASELINE_COUNTS_BEFORE"
test -s "$BASELINE_COUNTS_BEFORE"
```

Also record the legacy counts separately for operator review:

```bash
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-legacy-counts.sql > "$LEGACY_COUNTS_BEFORE"
test -s "$LEGACY_COUNTS_BEFORE"
```

Derive and preserve the exact expected post-Phase-A prepaid permission mapping while the retired permissions still exist:

```bash
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-permission-expected.sql > "$PERMISSIONS_EXPECTED"
test -s "$PERMISSIONS_EXPECTED"
```

Gate: stop if any invariant ordinary table is missing or any saved baseline/expected file is empty. Do not compare the transform-sensitive permission table's total row count to the ordinary baseline.

### 3. Create a timestamped PostgreSQL backup

```bash
umask 077
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-acl --file="$BACKUP_FILE" "$SOURCE_DATABASE_URL"
test -s "$BACKUP_FILE"
pg_restore --list "$BACKUP_FILE" >/dev/null
shasum -a 256 "$BACKUP_FILE"
```

Gate: the backup filename must contain `$CUTOVER_ID`; `test -s`, `pg_restore --list`, and the checksum command must all exit 0. Preserve the checksum in the change record without recording either database URL.

### 4. Restore the backup to a temporary database and verify it

`$RESTORE_DATABASE_URL` must point to a disposable empty database, never production. Drop/recreate that temporary database through the hosting control plane or an approved administrator connection; do not construct a broad `dropdb` command from an unreviewed URL.

```bash
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_DATABASE_URL" "$BACKUP_FILE"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -c 'SELECT 1;'
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-baseline-counts.sql > "$BASELINE_COUNTS_RESTORE"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-legacy-counts.sql > "$LEGACY_COUNTS_RESTORE"
diff -u "$BASELINE_COUNTS_BEFORE" "$BASELINE_COUNTS_RESTORE"
diff -u "$LEGACY_COUNTS_BEFORE" "$LEGACY_COUNTS_RESTORE"
```

Gate: restore, `SELECT 1`, the exact baseline-count diff, and the exact legacy-count diff must all exit 0. Do not run the shared verifier yet: the restored backup is pre-Phase-A and is expected not to contain all required shared tables. Any failure means there is no verified backup: stop here and keep production unchanged. Keep the restored temporary database until the whole cutover is accepted.

### 5. Apply the immutable non-destructive Phase-A artifact

The reviewed release lineage is fixed to the full commit and tree identifiers declared above. It supersedes the prior final `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc` / `a86577a1d68c98c44a9d86a2e884ec27cb7a584b` pair and all earlier pairs. Phase A's parent is `099dda59d3999d2b5ffffd27a96b0538ececd355`; Phase B's direct parent is Phase A. These commits were created as new descendants without rewriting the earlier history. Verify the release system's signature/checksum and, when the artifacts retain Git metadata, run:

```bash
test "$(git -C "$PHASE_A_DIR" rev-parse HEAD)" = "$PHASE_A_REVISION"
test "$(git -C "$PHASE_B_DIR" rev-parse HEAD)" = "$PHASE_B_REVISION"
test "$(git -C "$PHASE_A_DIR" rev-parse 'HEAD^{tree}')" = "$PHASE_A_TREE"
test "$(git -C "$PHASE_B_DIR" rev-parse 'HEAD^{tree}')" = "$PHASE_B_TREE"
git -C "$PHASE_B_DIR" merge-base --is-ancestor "$PHASE_A_REVISION" "$PHASE_B_REVISION"
test "$(git -C "$PHASE_B_DIR" rev-parse "$PHASE_B_REVISION^")" = "$PHASE_A_REVISION"
test ! -e "$PHASE_A_DIR/server/prisma/migrations/20260812040000_remove_legacy_prepaid"
test -f "$PHASE_B_DIR/server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql"
grep -q '^model PrepaidRechargeRecord {' "$PHASE_A_DIR/server/prisma/schema.prisma"
grep -q '^model PrepaidCustomerRemark {' "$PHASE_A_DIR/server/prisma/schema.prisma"
grep -q '^model PrepaidUsageRemark {' "$PHASE_A_DIR/server/prisma/schema.prisma"
test "$(git -C "$PHASE_B_DIR" diff-tree --no-commit-id --name-status -r "$PHASE_B_REVISION" | tr '\t' ' ')" = "$(printf '%s\n' \
  'A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql' \
  'M server/prisma/schema.prisma')"
```

The final comparison is intentionally exact: Phase B changes only the cleanup migration and Prisma schema. Any third path means the Phase-B artifact is not the approved cleanup commit.

The expected Phase-A shared migrations, in order, are exactly:

1. `20260811230000_add_shared_prepaid_ledger`
2. `20260812010000_add_shared_prepaid_idempotency_snapshots`
3. `20260812020000_add_lab_sample_save_requests`
4. `20260812030000_add_shared_prepaid_settlement_actions`
5. `20260812035000_add_shared_prepaid_money_checks`

First exercise Phase A on the restored temporary database. Run every command from the immutable Phase-A directory:

```bash
(cd "$PHASE_A_DIR" && DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
(cd "$PHASE_A_DIR" && DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate deploy)
(cd "$PHASE_A_DIR" && DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
(cd "$PHASE_A_DIR" && DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter yangshao-server prepaid:verify-cutover > "$VERIFY_RESTORE_PHASE_A")
test -s "$VERIFY_RESTORE_PHASE_A"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-permission-actual.sql > "$PERMISSIONS_RESTORE_PHASE_A"
diff -u "$PERMISSIONS_EXPECTED" "$PERMISSIONS_RESTORE_PHASE_A"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -At -f /tmp/yangshao-permission-issues.sql > "$PERMISSION_ISSUES_RESTORE_PHASE_A"
test ! -s "$PERMISSION_ISSUES_RESTORE_PHASE_A"
```

Before deploy, `prisma migrate status` must list the five expected shared migrations above as pending and must not know about `20260812040000_remove_legacy_prepaid`; stop on any unexpected pending migration. After deploy, status must report the Phase-A schema up to date. The restored-database verifier must exit 0 with `"ok": true`, both settlement subtable presence fields true, and an empty `failures` array. The permission diff must be empty and the issues file must remain empty, proving unaffected permissions were preserved, exact per-subaccount mapping, no retired values, no unexpected settlement grant, and no duplicate subaccount-permission pair.

Only after that restored-Phase-A gate passes, apply the same immutable Phase-A revision to production:

```bash
(cd "$PHASE_A_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
(cd "$PHASE_A_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate deploy)
(cd "$PHASE_A_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-permission-actual.sql > "$PERMISSIONS_SOURCE_PHASE_A"
diff -u "$PERMISSIONS_EXPECTED" "$PERMISSIONS_SOURCE_PHASE_A"
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -At -f /tmp/yangshao-permission-issues.sql > "$PERMISSION_ISSUES_SOURCE_PHASE_A"
test ! -s "$PERMISSION_ISSUES_SOURCE_PHASE_A"
```

Gate: production's pre-deploy status lists only the same expected pending Phase-A migrations; post-deploy status is up to date; the cleanup migration is absent from the artifact and therefore cannot be applied. The production permission snapshot must exactly match the precomputed expected mapping, and its issues file must be empty. Preserve both status outputs and the clean Phase-A permission snapshot for Step 8.

### 6. Run the verifier before cleanup

```bash
DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server prepaid:verify-cutover > "$VERIFY_BEFORE"
test -s "$VERIFY_BEFORE"
```

Inspect the JSON. It must contain `"ok": true` and an empty `failures` array. Legacy table entries are expected to report `exists: true` at this point. Confirm member cached balances, ledger deltas, and active lot totals are plausible before authorizing deletion.

Gate: the command must exit 0. Do not redirect stderr into this file, and do not bypass a nonzero status.

### 7. Apply the immutable Phase-B cleanup migration

Reconfirm the verified backup filename/checksum, successful temporary restore, both exact baseline diffs, restored-Phase-A verifier, production Phase-A status, and Step 6 verifier in the change record. Switch to the approved immutable Phase-B artifact. Its timestamp ordering places cleanup after every non-destructive shared migration. Before deploy, status must show exactly one pending migration, `20260812040000_remove_legacy_prepaid`:

```bash
(cd "$PHASE_B_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
(cd "$PHASE_B_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate deploy)
(cd "$PHASE_B_DIR" && DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server exec prisma migrate status)
```

Gate: the pre-deploy status contains no pending migration other than `20260812040000_remove_legacy_prepaid`; deploy exits 0; post-deploy status reports the Phase-B schema up to date. Stop if the Phase-B revision differs from the approved descendant or contains any unreviewed migration.

The migration deletes only `FinanceDeletionRequest` rows whose `sourceType` is `PREPAID_RECHARGE`, then drops the three named legacy tables in one transaction. It must not be run manually piecemeal. Do not run `prisma migrate reset`, `prisma db push --force-reset`, or any SQL using `CASCADE`.

### 8. Verify again and compare ordinary counts

```bash
DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter yangshao-server prepaid:verify-cutover > "$VERIFY_AFTER"
test -s "$VERIFY_AFTER"
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-baseline-counts.sql > "$BASELINE_COUNTS_AFTER"
diff -u "$BASELINE_COUNTS_BEFORE" "$BASELINE_COUNTS_AFTER"
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X --csv -f /tmp/yangshao-permission-actual.sql > "$PERMISSIONS_AFTER"
diff -u "$PERMISSIONS_SOURCE_PHASE_A" "$PERMISSIONS_AFTER"
psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -X -At -f /tmp/yangshao-permission-issues.sql > "$PERMISSION_ISSUES_AFTER"
test ! -s "$PERMISSION_ISSUES_AFTER"
```

Gate: verifier exit 0; JSON `ok` is true; the three legacy table entries report `exists: false`; legacy deletion-request count is zero; the exact invariant ordinary-count diff is empty; the permission diff against the post-Phase-A snapshot is empty; and the permission issues file is empty. Never compare the permission table's transformed post-Phase-A count to a pre-Phase-A ordinary count. Old `LabSheet.parameters`, `SampleBlock.inputs`, `SampleBlock.results`, and `SampleBlock.parameterSnapshot` JSON remain untouched. Historical `paymentStatus='预存款'` input values are display/history only and never create balances.

### 9. Start services and enter opening balances

Start the deployed API and both frontends using the normal service manager. Verify the API process has the intended database URL without printing it. Each main frontend account—not a subaccount or admin—then opens `/prepaid/recharges` and enters its approved opening lots using the “期初余额” option. Use one line per source account/member balance and an idempotency key per request; retain the independently approved opening-balance worksheet.

Rerun the verifier after all opening balances are entered. Gate: it exits 0, and the approved worksheet total equals member balance, ledger delta, and active lot total in the JSON.

### 10. Complete two-account smoke tests

Use two real main frontend test accounts A and B and a dedicated test phone. Preserve screenshots/IDs for rollback review.

1. From A, recharge paid `1000.00` plus gift `100.00`; member detail must show `1100.00`.
2. From B, create/save a `100.00` prepaid sample against that member. Verify one A-to-B payable of `90.9` and no duplicate active consumption.
3. Add both A-owned and B-owned lots, then consume from B. Verify B's local-account lot is allocated before A's remote lot; remaining-lot and member totals stay equal.
4. Attempt an amount greater than the remaining balance from the lab form. The form input must remain visible, while neither the sample nor ledger changes; rerun the verifier.
5. Create gross payables of A-to-B `100.0` and B-to-A `60.0`. Select both: gross lists remain visible and the preview/settlement net is `40.0`.
6. The payer submits a non-zero settlement with transfer time and no proof image. The receiver confirms receipt; the settlement and every active line/payable become completed.
7. From admin, open all four prepaid read-only routes and confirm there are no mutation controls. Send authenticated direct `POST`, `PATCH`, and `DELETE` attempts to admin prepaid paths; each must return a route rejection (`404`/`405`) or authorization rejection, never a 2xx response or data change.
8. Rerun the cutover verifier and ordinary counts one last time; both must remain clean.

Approved URLs:

- Customer login: `/login`
- Recharge: `/prepaid/recharges`
- Members: `/prepaid/customers`
- Consumptions: `/prepaid/consumptions`
- Settlements: `/prepaid/settlements`
- Admin login: `/admin/login`
- Admin recharge: `/admin/shared-prepaid/recharges`
- Admin members: `/admin/shared-prepaid/customers`
- Admin consumptions: `/admin/shared-prepaid/consumptions`
- Admin settlements: `/admin/shared-prepaid/settlements`

Gate: customer menu order is `员工考勤 → 预充值客户 → 财务`, the four leaves are in the route order above, all eight checks pass, and no browser/API console error remains unexplained.

Only after this gate may prepaid maintenance mode be removed.

## Rollback

If any migration, verifier, count comparison, service startup, opening-balance reconciliation, smoke test, or direct admin mutation check fails:

1. Immediately stop/block every API writer again. Do not attempt to repair cached balances, lots, payables, settlements, or historical lab JSON manually.
2. Preserve failed verifier JSON and service/database logs without exposing credentials.
3. Verify the backup checksum still matches the checksum recorded in Step 3. The temporary restored database must still answer `SELECT 1` and match both `$BASELINE_COUNTS_BEFORE` and `$LEGACY_COUNTS_BEFORE` using the protected baseline SQL files. Its later Phase-A tables do not replace these baseline comparisons.
4. Restore exactly that verified backup into a newly created empty replacement production database, or use the provider's atomic database replacement workflow. Do not overlay the dump onto the partially migrated database.
5. Point one isolated API check process at the restored replacement database through the approved secret/config mechanism. Run `SELECT 1`, save the baseline and legacy counts again, and require exact diffs against `$BASELINE_COUNTS_BEFORE` and `$LEGACY_COUNTS_BEFORE`.
6. Do **not** run the shared verifier on this exact pre-Phase-A restore: missing new shared tables are expected, so it must execution-fail. For an exact rollback, deploy/start the pre-cutover application revision that matches the restored migration history.
7. Verify customer login, ordinary lab read/write, finance, and legacy prepaid read paths before reopening traffic. If the incident owner instead authorizes a renewed Phase-A attempt, reapply the same approved immutable Phase-A artifact with `prisma migrate status`, `prisma migrate deploy`, post-deploy status, exact expected permission diff, and empty permission-issues check exactly as in Step 5; only then may the shared verifier run.
8. Keep prepaid writes in maintenance mode until the incident owner explicitly approves reopening. Opening balances or test transactions created after the backup are intentionally discarded by rollback and must not be recreated until the cutover is rescheduled.

Record the rollback database identifier and backup checksum, but never print or store database URLs, passwords, JWT secrets, encryption keys, dumps, or backup files in the repository.

## Local browser preparation

For UI-only rehearsal without PostgreSQL, start the customer and admin frontends in Mock mode:

```bash
VITE_USE_MOCKS=true ./node_modules/.bin/vite --host 127.0.0.1 --port 5173
cd admin
VITE_ADMIN_USE_MOCKS=true ./node_modules/.bin/vite --host 127.0.0.1 --port 5174
```

Customer Mock login is `admin / admin123`; admin Mock login is `admin / admin123456`. The customer shared-prepaid mock resets whenever the browser reloads the module (a hard reload or dev-server restart is the clean reset). It supports one browser-local main identity; use the automated mock tests for exact A/B ownership and netting behavior. Server-backed two-session acceptance requires PostgreSQL, two seeded `FRONTEND_USER` main accounts, and real API startup; the ordinary seed command creates only the root admin and must not be treated as two-account prepaid seed data.

Mock mode is UI rehearsal only. It cannot satisfy the production backup, migration, verifier-before/after, direct server authorization, or durable two-account acceptance gates.
