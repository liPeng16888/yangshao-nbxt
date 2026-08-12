# Shared prepaid ledger final release hardening report

Date: 2026-08-12 (Asia/Shanghai)

Status: the original five confirmed Important fixes, the final independent-review corrections, rebuilt Phase A/B lineage, local tests, three builds, Prisma checks, and static release assertions are complete. The exact Phase A/B artifacts are ready for code review/merge. Phase B production deployment remains blocked on the runbook's real-environment gates. No database migration, backup, restore, deployment, browser acceptance, or real multi-account acceptance was performed.

## Ordered commits

1. `dda166ff4bd3f86e406a10a76179d0239f33695a` — `fix: scope prepaid mutation retries by auth identity`
2. `9cb22ebcc621193b3fbe3d4df32faf0c350d73ae` — `fix: reject unrepresentable prepaid allocations`
3. `e6e13404cd7229ea78b00946956aad02fff47db8` — `fix: bound prepaid settlement relation reads`
4. `a30caca2857dc530420767d793135c80e326f5d0` — `fix: enforce ASCII prepaid phone normalization`
5. `1dc84c95d2cecda85effd27bb4220798c01dc020` — `fix: constrain prepaid settlement direction`
6. `73be466a57cd3713ef274765cdf263d0cbffd101` — `fix: isolate prepaid read state by auth session`
7. `9d973df7abaa39d6efea3bbda4e06b5ee5d8c4a6` — `fix: partition settlement recharge projections`
8. `40cef368ce9fc4b85ea1c7b7a14974b4ffad410f` — `fix: require settlement direction participants`
9. `5be11564bacd36dddcb5311824d62e22d63f501b` — `fix: mirror prepaid quantization in mock`
10. **Phase A:** `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc` — `chore: assemble final shared prepaid phase A`
11. **Phase B:** `a86577a1d68c98c44a9d86a2e884ec27cb7a584b` — `chore: add final shared prepaid phase B cleanup`

The documentation-only descendant that updates this report and the cutover runbook does not alter either reviewed release tree. The former hardened pair `86b0b005b8c0657058740fc9f84c014d8c0777d4` / `6057d3b926e9ae770a6f926cbcf54076355a89a9` is superseded and must not be deployed.

## Confirmed fixes

### Identity-scoped mutations and reads

- Mutation slots, prepared fingerprints/keys, queues, and in-flight keys include a stable authentication scope derived from the session generation, token, actor ID, data-owner ID, permission version, role, and sorted permission set.
- Logout, login, token/session replacement, permission change, and account switch invalidate prepared public retry identities. Old-account promises cannot coalesce with, clear, or publish into the new account's state or retained key.
- Every asynchronous read apply/error/finally path is guarded by a read-session epoch. `runLatest`, `runPage`, preview, selected-payable refresh, and realtime refresh ignore late responses and errors from an earlier identity.
- An authentication change increments the epoch, invalidates read generations, resets loading/errors/realtime refresh bookkeeping, and clears all account-derived pages, details, previews, selections, payment drafts, and the recharge draft.
- Tests cover delayed account-A page, preview, selected-payable refresh, read error, and realtime failure after account B logs in, plus account-switch in-flight and retained-key cases for all eight money mutation families.

### Post-rounding representability and Mock parity

- Positive allocation economics are quantized before persistence to `Decimal(20,10)` paid ratio and `Decimal(20,8)` exact transfer. A positive value that rounds to zero is rejected before any database write with stable HTTP 400 code `PREPAID_AMOUNT_UNREPRESENTABLE`.
- Persisted exact allocation values feed exact payables; payable and settlement guards and database checks require positive representable values.
- Server tests cover paid `0.01`, gift `999999999999.98`, allocation `0.01`, plus exact representable boundaries `0.0000000001` for paid ratio and `0.00000001` for exact transfer.
- The Mock now prepares and validates the complete allocation/payable plan before changing a lot, history, ID/timestamp sequence, or draft-visible state. It mirrors paid-ratio, exact-transfer, and one-decimal payable rejection and preserves the exact boundary case.

### Bounded and partitioned settlement public relations

- Historical settlement associations remain independently capped at `100 + 1`, serialized to at most 100, and report per-relation truncation metadata.
- Recharge batches are fetched by one parameterized window query. `ROW_NUMBER()` partitions by `(consumptionId, sourceOwnerId)`, so each requested pair receives its own 101-row probe without N+1 reads or starvation by another source owner.
- Public serialization emits 100 rows and correct truncation per pair. The Mock applies the source-owner filter before the cap.
- Regression coverage places 101 source-A allocations before one source-B allocation on the same consumption and proves B still receives its row with `truncated: false`.

### ASCII-only phone parity

- Server DTO/service, Mock, client helpers/store, picker, forms, and filters accept only ASCII digits, ASCII space/tab/LF/VT/FF/CR, and ASCII hyphen.
- No phone field is Unicode-trimmed before validation. NBSP and em-space at the start, middle, or end are rejected.
- Mutation fingerprints use the strict normalized result only after validation; invalid input creates neither an API request nor a retained mutation identity.

### Settlement directional database constraint

- For nonzero directions, the non-destructive `CHECK` now explicitly requires both payer and receiver to be non-null before comparing them with the directional participants. This closes SQL three-valued-logic acceptance of null payer/receiver values.
- A-to-B binds payer A/receiver B, B-to-A binds payer B/receiver A, and equality requires both participants null. Nonnegative directional values, the gross cap, and `netAmount = ABS(aToBAmount - bToAAmount)` remain enforced.
- The contract test extracts the actual migration expression and executes it as a SQL `CHECK` in in-memory SQLite, whose `CHECK` null acceptance follows SQL three-valued logic. Correct directions and null equality pass; swapped, partially null, fully null nonzero, and non-null equality rows fail. Service tests cover all three computed direction boundaries.

## Final release lineage

This lineage supersedes Phase A `86b0b005b8c0657058740fc9f84c014d8c0777d4` and Phase B `6057d3b926e9ae770a6f926cbcf54076355a89a9`, as well as all earlier pairs.

- Phase A commit: `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc`
- Phase A parent: `5be11564bacd36dddcb5311824d62e22d63f501b`
- Phase A tree: `8f84a363d629f19e94c31f02a7e9b224b175b36e`
- Phase B commit: `a86577a1d68c98c44a9d86a2e884ec27cb7a584b`
- Phase B parent: `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc`
- Phase B tree: `8035ad5c23d7843957a3fd57ca1a216d25de6422`

Phase A contains every feature and non-destructive constraint fix, retains `PrepaidRechargeRecord`, `PrepaidCustomerRemark`, `PrepaidUsageRemark` and their `User` relations, excludes the cleanup migration, and contains exactly the five reviewed non-destructive shared migrations through `20260812035000_add_shared_prepaid_money_checks`.

Phase B is Phase A's direct child. Its complete commit manifest is exactly:

- `A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql`
- `M server/prisma/schema.prisma`

Phase B only removes the legacy schema models/relations and adds the cleanup migration. Static ancestry, exact parent/tree identifiers, Phase-A legacy presence, cleanup absence/presence, five-migration enumeration, exact two-path manifest, and whitespace diff checks passed. The cutover runbook records the same immutable identifiers and executable assertions.

## Verification

Both exact release commits were exported independently and tested using the installed local dependency binaries. No migration command was run.

### Phase A (`ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1106 tests passed.
- Full server discovery: 39 test files / 519 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

### Phase B (`a86577a1d68c98c44a9d86a2e884ec27cb7a584b`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1106 tests passed.
- Full server discovery: 39 test files / 519 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

Focused regression verification also passed: 88 client/Mock tests and 185 server money/ledger/settlement/query/migration-contract tests. `git diff --check` passed for both release commits.

The `pnpm test:all` wrapper was also attempted in the exported Phase-A directory. Its dependency-status preflight tried to replace the intentionally symlinked `node_modules` layout and stopped before running tests with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. It was not allowed to purge or reinstall dependencies. The complete root/server test commands and customer/admin/server build commands were therefore executed directly with the already installed local binaries for both exact artifacts, with the passing results above. This was a verification-harness failure, not a code-test failure.

Known non-failing warnings remain: Sass legacy JS API, Element Plus checkbox deprecation, test-environment localStorage/Vue directive notices, Rollup third-party PURE-comment notices, and Vite large-chunk notices. No new failing warning category was observed.

## Deferred environment gates and concerns

- No database migration of any kind was executed.
- Neither `psql` nor `pg_isready` is installed in this environment, so a real PostgreSQL insertion test for the directional `CHECK` remains deferred. The extracted-expression SQL semantic test and migration text contract passed locally; the real PostgreSQL insert matrix must run on the verified disposable restore before Phase B is authorized.
- No PostgreSQL backup/checksum, disposable restore, migration status/deploy, cutover verifier, exact table/permission comparison, production service deployment, browser smoke test, or real two-account acceptance was performed or claimed.
- Phase B must remain blocked until every immutable Phase-A gate in `docs/deployment/shared-prepaid-cutover.md` passes against a verified disposable restore and then against maintenance-mode production.
- The realtime transport remains intentionally process-local. A multi-instance deployment still requires a shared transport such as PostgreSQL LISTEN/NOTIFY or Redis pub/sub.
- Local static verification found no unresolved code, test, build, Prisma, or release-lineage blocker.
