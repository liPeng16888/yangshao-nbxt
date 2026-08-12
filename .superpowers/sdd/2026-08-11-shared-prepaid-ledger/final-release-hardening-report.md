# Shared prepaid ledger final release hardening report

Date: 2026-08-12 (Asia/Shanghai)

Status: the original five confirmed Important fixes, both independent-review correction rounds, rebuilt Phase A/B lineage, local tests, three builds, Prisma checks, and static release assertions are complete. The exact Phase A/B artifacts are ready for code review/merge. Phase B production deployment remains blocked on the runbook's real-environment gates. No database migration, backup, restore, deployment, browser acceptance, or real multi-account acceptance was performed.

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
10. `099dda59d3999d2b5ffffd27a96b0538ececd355` — `fix: cancel stale prepaid reads on auth change`
11. **Phase A:** `1bf6efcffba9c10acefa9daadeedb5d9dfee829d` — `chore: assemble reviewed shared prepaid phase A`
12. **Phase B:** `5a568e4cd49f1759ca39814eb4ae0470b5aedc7a` — `chore: add reviewed shared prepaid phase B cleanup`

The documentation-only descendant that updates this report and the cutover runbook does not alter either reviewed release tree. The prior final pair `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc` / `a86577a1d68c98c44a9d86a2e884ec27cb7a584b`, the former hardened pair `86b0b005b8c0657058740fc9f84c014d8c0777d4` / `6057d3b926e9ae770a6f926cbcf54076355a89a9`, and every earlier pair are superseded and must not be deployed.

## Confirmed fixes

### Identity-scoped mutations and reads

- Mutation slots, prepared fingerprints/keys, queues, and in-flight keys include a stable authentication scope derived from the session generation, token, actor ID, data-owner ID, permission version, role, and sorted permission set.
- Logout, login, token/session replacement, permission change, and account switch invalidate prepared public retry identities. Old-account promises cannot coalesce with, clear, or publish into the new account's state or retained key.
- Every asynchronous read Promise boundary is guarded by a read-session epoch. When the epoch changes, `runLatest` and `runPage` replace both a late payload and a late raw exception with `SharedPrepaidReadCancelledError` (`code: SHARED_PREPAID_READ_CANCELLED`); the exported `isSharedPrepaidReadCancelled` guard lets trusted consumers distinguish that internal cancellation. Old payloads and raw account-A errors therefore never escape to account-B consumers. Apply, page-error, and loading-finalization paths remain epoch-isolated.
- An authentication change increments the epoch, invalidates read generations, resets loading/errors/realtime refresh bookkeeping, and clears all account-derived pages, details, previews, selections, payment drafts, and the recharge draft.
- The complete `runLatest`/`runPage` read inventory was audited: member list, exact member lookup, lab-member lookup, member detail, paged member history, recharge list, consumption list, consumption filter options, settlement payable list, selected-payable refresh, settlement list, settlement detail, and settlement preview. Realtime refresh remains epoch-guarded around registration callbacks.
- Every public consumer was also audited. Recharge and consumption list/filter actions, member list/detail actions, settlement list/filter/realtime actions, and all-settled refreshes already intentionally consume read rejections while ordinary errors remain in the store's persistent page state. Member-history buttons now explicitly swallow only the internal cancellation and rethrow ordinary failures. Settlement preview/detail actions swallow only the internal cancellation and preserve their ordinary mutation-error UI. The lab member picker does the same for lookup failures.
- `PrepaidMemberPickerDialog` watches the same canonical token/actor/data-owner/permission-version/role/permissions signature as the store. A signature change synchronously advances its lookup generation and clears the local phone, amount, selected member, searching state, and error, so an account-A lookup cannot enable account B's confirmation control.
- Tests cover delayed account-A page, pure lookup payload, pure lookup raw error, preview, selected-payable refresh, read error, realtime failure, mounted picker success/failure, and mounted settlement preview/detail failure after account B logs in. Same-session picker and settlement failures remain visible. Mutation coverage still includes account-switch in-flight and retained-key cases for all eight money mutation families.

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

This lineage supersedes Phase A `ca5b32dcde9b725ec0db0320fb1d73287b9ad0dc` and Phase B `a86577a1d68c98c44a9d86a2e884ec27cb7a584b`, as well as all earlier pairs.

- Phase A commit: `1bf6efcffba9c10acefa9daadeedb5d9dfee829d`
- Phase A parent: `099dda59d3999d2b5ffffd27a96b0538ececd355`
- Phase A tree: `44032364d84c754276ce7b07e4ac1a32699be6c6`
- Phase B commit: `5a568e4cd49f1759ca39814eb4ae0470b5aedc7a`
- Phase B parent: `1bf6efcffba9c10acefa9daadeedb5d9dfee829d`
- Phase B tree: `1fb0603b2c0271340d48f140c210c7907e2632a6`

Phase A contains every feature and non-destructive constraint fix, retains `PrepaidRechargeRecord`, `PrepaidCustomerRemark`, `PrepaidUsageRemark` and their `User` relations, excludes the cleanup migration, and contains exactly the five reviewed non-destructive shared migrations through `20260812035000_add_shared_prepaid_money_checks`.

Phase B is Phase A's direct child. Its complete commit manifest is exactly:

- `A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql`
- `M server/prisma/schema.prisma`

Phase B only removes the legacy schema models/relations and adds the cleanup migration. Static ancestry, exact parent/tree identifiers, Phase-A legacy presence, cleanup absence/presence, five-migration enumeration, exact two-path manifest, and whitespace diff checks passed. The cutover runbook records the same immutable identifiers and executable assertions.

## Verification

Both exact release commits were exported independently and tested using the installed local dependency binaries. No migration command was run.

### Phase A (`1bf6efcffba9c10acefa9daadeedb5d9dfee829d`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1114 tests passed.
- Full server discovery: 39 test files / 519 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

### Phase B (`5a568e4cd49f1759ca39814eb4ae0470b5aedc7a`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1114 tests passed.
- Full server discovery: 39 test files / 519 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

Focused second-review regression verification passed: 64 store/picker/settlement-page tests plus customer Vue typecheck. The earlier money/ledger/query/relation/phone/Mock regression sets remain included in the full discoveries above. `git diff --check` passed for both release commits.

The `pnpm test:all` wrapper remains unsuitable for the intentionally symlinked detached-worktree dependency layout: its established dependency-status preflight tries to replace `node_modules` and stops with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. It was not allowed to purge or reinstall dependencies. For both exact artifacts, every command underlying `test:all` and `build:all` was executed directly with the already installed local binaries: complete root/server test discoveries, customer/admin typecheck plus Vite builds, and the Nest build all passed as recorded above. This is a verification-harness constraint, not a code-test failure.

Known non-failing warnings remain: Sass legacy JS API, Element Plus checkbox deprecation, test-environment localStorage/Vue directive notices, Rollup third-party PURE-comment notices, and Vite large-chunk notices. No new failing warning category was observed.

## Deferred environment gates and concerns

- No database migration of any kind was executed.
- Neither `psql` nor `pg_isready` is installed in this environment, so a real PostgreSQL insertion test for the directional `CHECK` remains deferred. The extracted-expression SQL semantic test and migration text contract passed locally; the real PostgreSQL insert matrix must run on the verified disposable restore before Phase B is authorized.
- No PostgreSQL backup/checksum, disposable restore, migration status/deploy, cutover verifier, exact table/permission comparison, production service deployment, browser smoke test, or real two-account acceptance was performed or claimed.
- Phase B must remain blocked until every immutable Phase-A gate in `docs/deployment/shared-prepaid-cutover.md` passes against a verified disposable restore and then against maintenance-mode production.
- The realtime transport remains intentionally process-local. A multi-instance deployment still requires a shared transport such as PostgreSQL LISTEN/NOTIFY or Redis pub/sub.
- Local static verification found no unresolved code, test, build, Prisma, or release-lineage blocker.
