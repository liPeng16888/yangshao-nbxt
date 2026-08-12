# Shared prepaid ledger final release hardening report

Date: 2026-08-12 (Asia/Shanghai)

Status: the five confirmed Important fixes, rebuilt Phase A/B lineage, local tests, builds, Prisma checks, and static release assertions are complete. No database migration, backup, restore, deployment, browser acceptance, or real multi-account acceptance was performed.

## Ordered commits

1. `dda166ff4bd3f86e406a10a76179d0239f33695a` — `fix: scope prepaid mutation retries by auth identity`
2. `9cb22ebcc621193b3fbe3d4df32faf0c350d73ae` — `fix: reject unrepresentable prepaid allocations`
3. `e6e13404cd7229ea78b00946956aad02fff47db8` — `fix: bound prepaid settlement relation reads`
4. `a30caca2857dc530420767d793135c80e326f5d0` — `fix: enforce ASCII prepaid phone normalization`
5. `1dc84c95d2cecda85effd27bb4220798c01dc020` — `fix: constrain prepaid settlement direction`
6. **Phase A:** `86b0b005b8c0657058740fc9f84c014d8c0777d4` — `chore: assemble hardened shared prepaid phase A`
7. **Phase B:** `6057d3b926e9ae770a6f926cbcf54076355a89a9` — `chore: add hardened shared prepaid phase B cleanup`

The documentation-only descendant that adds this report and updates the cutover runbook does not alter either reviewed release tree.

## Confirmed fixes

### Identity-scoped mutation retry state

- The mutation slot, prepared fingerprint/key, queue, and in-flight key include a stable authentication scope derived from the session generation, canonical token, actor ID, data-owner ID, permission version, role, and sorted permission set.
- Logout, login, token/session replacement, permission change, and account switch invalidate prepared public retry identities for later calls. Requests from different identities cannot coalesce or reuse a retained key.
- A promise begun under an old identity cannot clear a new draft/key, publish old success into the new store, or overwrite the new identity's retained failure state.
- Table-driven account-switch coverage exercises recharge, recharge reversal, consumption reversal, settlement creation, payment, confirmation, rejection, and cancellation, including retained-key retry after the old request settles late.

### Post-rounding representability

- Positive allocation economics are quantized before persistence to `Decimal(20,10)` paid ratio and `Decimal(20,8)` exact transfer. A positive value that rounds to zero is rejected before any database write with stable HTTP 400 code `PREPAID_AMOUNT_UNREPRESENTABLE`.
- Persisted allocation exact values are the values accumulated into exact payables; payable and settlement line guards and database checks require positive representable amounts.
- Tests cover paid `0.01`, gift `999999999999.98`, allocation `0.01`, plus the exact representable boundaries `0.0000000001` for paid ratio and `0.00000001` for exact transfer.

### Bounded settlement public relations

- Each settlement payable query caps its consumption-allocation projection and historical settlement association independently at `100 + 1`, serializes at most 100, and returns `relationLimit` plus per-relation `relationTruncated` metadata.
- Eligibility uses a filtered database count rather than the capped historical association projection.
- Server, Mock, frontend types, list UI, and detail UI share the capped contract. Tests prove a first row with more than 100 nested records does not consume or starve the second row's independent allowance.

### ASCII-only phone parity

- Server DTO/service, Mock, client helpers/store, picker, forms, and filters accept only ASCII digits, ASCII space/tab/LF/VT/FF/CR, and ASCII hyphen.
- No phone field is Unicode-trimmed before validation. NBSP and em-space at the start, middle, or end are rejected rather than normalized.
- Mutation fingerprints are created from the strict normalized phone only after validation succeeds; invalid input creates neither an API request nor a retained mutation identity.

### Settlement directional database constraint

- The non-destructive settlement `CHECK` binds `aToBAmount > bToAAmount` to payer A/receiver B, the reverse inequality to payer B/receiver A, and equality to null payer/receiver.
- Nonnegative directional amounts, the gross cap, and `netAmount = ABS(aToBAmount - bToAAmount)` remain enforced.
- Migration SQL contract tests and service boundary tests cover A-to-B, B-to-A, and equal directions.

## Rebuilt release lineage

This lineage supersedes Phase A `0e35d886769697f13e3dc71c5c124dffa28a27de` and Phase B `5c6ccd082044668630f84aa5134341a0cedb7329`.

- Phase A commit: `86b0b005b8c0657058740fc9f84c014d8c0777d4`
- Phase A parent: `1dc84c95d2cecda85effd27bb4220798c01dc020`
- Phase A tree: `f5c2e309136ef5abd03d3e6ff495aac073b56087`
- Phase B commit: `6057d3b926e9ae770a6f926cbcf54076355a89a9`
- Phase B parent: `86b0b005b8c0657058740fc9f84c014d8c0777d4`
- Phase B tree: `e9614b9c78e3852830e420622f79f2a84937be9d`

Phase A contains all five hardening fixes, retains `PrepaidRechargeRecord`, `PrepaidCustomerRemark`, `PrepaidUsageRemark` and their `User` relations, excludes the cleanup migration, and contains exactly the five reviewed non-destructive shared migrations through `20260812035000_add_shared_prepaid_money_checks`.

Phase B is Phase A's direct child. Its complete manifest is exactly:

- `A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql`
- `M server/prisma/schema.prisma`

Phase B removes only the legacy schema models/relations and adds only the cleanup migration. Static ancestry, tree, Phase-A content, cleanup absence/presence, and exact two-path manifest assertions passed. The cutover runbook records the same immutable identifiers and executable checks.

## Verification

Both exact release commits were exported independently and checked without applying a migration.

### Phase A (`86b0b005b8c0657058740fc9f84c014d8c0777d4`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- `test:all` equivalent using the installed local binaries: repository discovery 117 files / 1092 tests passed, followed by server discovery 39 files / 517 tests passed.
- `build:all` equivalent using the installed local binaries: customer Vue typecheck/Vite build, admin Vue typecheck/Vite build, and Nest build passed.

### Phase B (`6057d3b926e9ae770a6f926cbcf54076355a89a9`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- `test:all` equivalent using the installed local binaries: repository discovery 117 files / 1092 tests passed, followed by server discovery 39 files / 517 tests passed.
- `build:all` equivalent using the installed local binaries: customer Vue typecheck/Vite build, admin Vue typecheck/Vite build, and Nest build passed.

The pnpm wrapper was attempted once in the exported Phase-A directory, but refused the intentionally symlinked dependency layout with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` before running Prisma. It was not allowed to reinstall or purge dependencies. The exact commands were then executed with the already installed local binaries. One combined Phase-A build invocation also called the admin typechecker from the repository root, producing path-resolution errors; the correct admin working directory was used immediately afterward and the full customer/admin/server build matrix passed. These were harness/cwd failures, not code-test failures.

Known non-failing warnings remain: Sass legacy JS API, Element Plus checkbox deprecation, test-environment localStorage/Vue directive notices, Rollup third-party PURE-comment notices, and Vite large-chunk notices. No new failing warning category was observed.

## Deferred environment gates and concerns

- No database migration of any kind was executed.
- No PostgreSQL backup/checksum, disposable restore, migration status/deploy, cutover verifier, exact table/permission comparison, production service deployment, browser smoke test, or real two-account acceptance was performed or claimed.
- Phase B must remain blocked until every immutable Phase-A gate in `docs/deployment/shared-prepaid-cutover.md` passes against a verified disposable restore and then against maintenance-mode production.
- The realtime transport remains intentionally process-local. A multi-instance deployment still requires a shared transport such as PostgreSQL LISTEN/NOTIFY or Redis pub/sub.
- Local static verification found no unresolved code, test, build, Prisma, or release-lineage blocker.
