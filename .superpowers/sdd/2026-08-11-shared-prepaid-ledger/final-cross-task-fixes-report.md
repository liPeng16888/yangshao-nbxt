# Shared prepaid ledger final cross-task fixes report

Date: 2026-08-12 (Asia/Shanghai)

Status: code, schema, release lineage, tests, builds, and local artifact checks are complete. No database migration, backup, restore, production deployment, or environment acceptance was performed.

## Ordered commits

1. `212b040e0f27a8a2c1a2dd7a8e5181e319498ccc` — `fix: retain prepaid mutation identities`
2. `74c83d8db08d360cd4e4da9e1506fb04eaed0987` — `fix: invalidate settlement dependent views`
3. `1a6c21c9eb10e4d8bc79effbc8e493e797879ac6` — `fix: bound shared prepaid public histories`
4. `aec8195d3da2a95f8a028fdf0e9e9bfe3dc003f0` — `fix: enforce shared prepaid decimal bounds`
5. `c4b31779b4b19721d35090ee563ba827e550d7fc` — `fix: reject invalid prepaid phone characters`
6. **Phase A:** `0e35d886769697f13e3dc71c5c124dffa28a27de` — `chore: assemble deployable shared prepaid phase A`
7. **Phase B:** `5c6ccd082044668630f84aa5134341a0cedb7329` — `chore: add shared prepaid phase B cleanup`
8. `895d1d11823418b69a6c32d67cce091a7fe945b8` — `docs: record shared prepaid release lineage`

## Confirmed review fixes

### 1. Network idempotency

- The store now retains the prepared canonical request fingerprint and idempotency key after transport failures, timeouts, connection resets, 5xx, 409, and other failed responses. Only confirmed success clears it; a canonical payload change rotates it.
- The behavior covers recharge creation/reversal, consumption reversal, settlement creation, payment, confirmation, rejection, and cancellation.
- Identical in-flight calls coalesce to one API request and one key. Lost-response/exact-retry coverage exercises all eight mutation families. Canonical key ordering, numeric formatting, phone separators, dates, selection ordering, and trimmed remarks do not create false payload changes.
- TDD evidence: new retry/coalescing assertions failed against the prior per-call key allocation, then all `src/stores/sharedPrepaid.test.ts` tests passed (29/29).

### 2. Settlement cross-module realtime

- A real committed create or settlement action now publishes exactly one metadata-only invalidation for each dependent leaf: `settlements`, `consumptions`, and `members`.
- Publication happens only after the transaction resolves. Idempotent replay and rollback publish nothing. Release/status actions use the same path.
- The stream continues to authorize per leaf. A subaccount with only `PREPAID_SETTLEMENTS`, `PREPAID_CONSUMPTIONS`, or `PREPAID_CUSTOMERS` receives only its permitted event.
- Tests verify three-event shape, no phone/balance/proof/remark leak, no replay/rollback burst, per-leaf delivery, and existing per-module burst bounding.

### 3. Bounded public member reads

- Member pages select only public base columns and use fixed database `groupBy` aggregate batches plus one bounded account lookup; no recharge/consumption history is included and there is no per-member query loop.
- Member detail recharge, consumption, and ledger collections are independently paginated with a maximum page size of 100, a 100+1 sentinel, stable `createdAt_DESC,id_DESC` ordering, `hasMore`, and `nextPage`. The customer page exposes independent load-more controls.
- Nested public consumption allocations/payables/reversal relations are capped at 100+1 and return `relationLimit`/`relationTruncated` metadata.
- Explicit public Prisma selects and serializers omit `idempotencyKey`, `requestFingerprint`, `responseSnapshot`, recharge internals, and settlement-action snapshots. Those operational fields were removed from public frontend types and mutation/read responses; Mock/API/store/page contracts were updated.
- Focused GREEN evidence: server shared-prepaid reads/ledger 146 tests, frontend API/store/page/Mock 64 tests, and both typechecks passed at the commit checkpoint.

### 4. Real two-stage release lineage

- Phase A is a genuine new commit, not rewritten history. Its parent is `c4b31779b4b19721d35090ee563ba827e550d7fc`; its tree is `ce41a3236e0015a836a23dae55ec426cd62fd95c`.
- The Phase-A tree physically excludes `server/prisma/migrations/20260812040000_remove_legacy_prepaid`, restores all three legacy Prisma models and their `User` relations, and retains the verifier, runbook, all feature fixes, and exactly these five non-destructive shared migrations:
  1. `20260811230000_add_shared_prepaid_ledger`
  2. `20260812010000_add_shared_prepaid_idempotency_snapshots`
  3. `20260812020000_add_lab_sample_save_requests`
  4. `20260812030000_add_shared_prepaid_settlement_actions`
  5. `20260812035000_add_shared_prepaid_money_checks`
- Phase B is Phase A's direct child; its tree is `c92e5ea54120c9bc0cee1825167d0828b897835b`. Its complete commit manifest is exactly:
  - `A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql`
  - `M server/prisma/schema.prisma`
- Phase B alone re-removes `PrepaidRechargeRecord`, `PrepaidCustomerRemark`, `PrepaidUsageRemark` and the three `User` relations, then adds the cleanup migration. It contains no feature code.
- `docs/deployment/shared-prepaid-cutover.md` records full commit/tree identifiers and executable ancestry, tree-content, and exact-manifest checks.
- Both Phase-A and Phase-B trees independently passed Prisma generate/validate, full tests, and all builds. The cleanup migration was not executed.

### 5. Decimal bounds and database checks

- Decimal guards use `Prisma.Decimal` only and return stable HTTP 400 domain payloads with `PREPAID_AMOUNT_OUT_OF_RANGE`, preventing raw PostgreSQL numeric overflow from surfacing as 500.
- `Decimal(14,2)` is capped at `999999999999.99`; `Decimal(14,1)` is capped at `9999999999999.9`; exact `Decimal(20,8)` transfers are also bounded.
- Guards run before writes for paid/gift totals, cached-balance changes, recharge remaining/total state, consumption/allocation/exact payable values, reversal restoration, payable amounts, and settlement directional/gross/net aggregation.
- Boundary tests cover exact maxima, one cent/one tenth over, cumulative cached-balance overflow, aggregate lot balance overflow, and settlement gross aggregation overflow.
- Phase A adds `20260812035000_add_shared_prepaid_money_checks`, a non-destructive migration using named `CHECK ... NOT VALID` constraints followed by `VALIDATE CONSTRAINT`. It checks positive/nonnegative state, recharge total consistency, remaining not above total, numeric business bounds, ledger signs/range, allocation ratios/exact amounts, settlement gross/net consistency, participant state, and line bounds.
- Existing reversal rows are accommodated: reversal consumption amounts stay positive while `active = FALSE`; signed ledger deltas allow both directions within range.

### 6. Phone normalization

- Server, Mock, and client identity helpers accept only ASCII digits plus approved ASCII whitespace and hyphens, remove only those separators, then enforce `^1[3-9]\\d{9}$`.
- Letters, parentheses, dots, country-code punctuation, underscores, and other unapproved characters are rejected instead of stripped into a valid identity.
- Partial filter normalization follows the same server/Mock boundary; invalid filter text is preserved for server rejection rather than converted into a different phone.
- Consumption idempotency fingerprinting no longer strips arbitrary punctuation from invalid phone inputs.
- Focused GREEN evidence: 18 frontend helper/Mock tests, 34 server money/query tests, 49 API/store/page tests, 86 ledger tests, and both typechecks passed.

## Final verification

All commands below completed successfully on the final Phase-B code plus lineage documentation:

- `DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder pnpm --dir server run prisma:generate`
- `DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder pnpm --dir server exec prisma validate`
- `pnpm test:all`
  - repository Vitest: 116 files, 1046 tests passed
  - server Vitest: 38 files, 496 tests passed
- `pnpm build:all`
  - customer Vue typecheck/Vite build passed
  - admin Vue typecheck/Vite build passed
  - Nest server build passed
- Phase lineage/tree/manifest shell assertions passed.
- `git diff --check` passed.

The suite retains known non-failing warnings: Sass legacy JS API notices, Element Plus checkbox deprecation notices, test-environment localStorage/Vue directive warnings, Rollup third-party PURE-comment notices, and Vite large-chunk warnings. No new failing warning category was observed.

Three local dependency symlinks were temporarily recreated solely to use the already installed parent-workspace dependencies (`node_modules`, `server/node_modules`, `admin/node_modules`). They were never staged or committed and were removed before final handoff.

## Deferred environment gates and concerns

- No destructive cleanup migration or non-destructive migration was applied to any database.
- No production database backup, checksum, disposable restore, migration status/deploy, verifier execution against PostgreSQL, exact table/permission comparison, service deployment, browser smoke test, or real two-account acceptance was performed or claimed.
- Follow the immutable Phase-A then Phase-B procedure in `docs/deployment/shared-prepaid-cutover.md`. Phase B remains blocked until the timestamped backup restores successfully, exact baseline/legacy comparisons pass, restored Phase A verifies cleanly, and the pre-cleanup production verifier passes.
- The realtime transport remains intentionally in-process/single-instance. Multi-instance deployment requires PostgreSQL LISTEN/NOTIFY or Redis pub/sub before relying on cross-instance invalidations.
- No unresolved code/test/build blocker remains in the reviewed local scope.
