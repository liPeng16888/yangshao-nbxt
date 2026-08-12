# Shared prepaid ledger final release hardening report

Date: 2026-08-12 (Asia/Shanghai)

Status: the original five confirmed Important fixes, both independent-review correction rounds, the PostgreSQL enum transaction-boundary correction, rebuilt Phase A/B lineage, local tests, three builds, Prisma checks, static release assertions, production backup/restore verification, and disposable-database Phase A/B rehearsals are complete. The exact Phase A/B artifacts are ready for code review/merge. Production deployment remains blocked until a fresh maintenance-window backup and the production Phase A verifier gates pass. No production database migration, application deployment, browser acceptance, or real multi-account acceptance has been performed.

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
11. `d32e5be` — `fix: split prepaid permission enum migration`
12. **Phase A:** `2b1a6b19eb658a52ceb92775053f43669191d70c` — `chore: assemble postgres-safe shared prepaid phase A`
13. **Phase B:** `8de3594df38262a589a9f5b69580fc4b5e6d55de` — `chore: add reviewed shared prepaid phase B cleanup`

The documentation-only descendant that updates this report and the cutover runbook does not alter either reviewed release tree. The prior final pair `1bf6efcffba9c10acefa9daadeedb5d9dfee829d` / `5a568e4cd49f1759ca39814eb4ae0470b5aedc7a` and every earlier pair are superseded and must not be deployed.

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

This lineage supersedes Phase A `1bf6efcffba9c10acefa9daadeedb5d9dfee829d` and Phase B `5a568e4cd49f1759ca39814eb4ae0470b5aedc7a`, as well as all earlier pairs.

- Phase A commit: `2b1a6b19eb658a52ceb92775053f43669191d70c`
- Phase A parent: `1bf6efcffba9c10acefa9daadeedb5d9dfee829d`
- Phase A tree: `aef10e66ebec26055f284f3d8e23f53f5b11c2da`
- Phase B commit: `8de3594df38262a589a9f5b69580fc4b5e6d55de`
- Phase B parent: `2b1a6b19eb658a52ceb92775053f43669191d70c`
- Phase B tree: `d876f1ea4d574a30fd6048f717b13435c68460f4`

Phase A contains every feature and non-destructive constraint fix, retains `PrepaidRechargeRecord`, `PrepaidCustomerRemark`, `PrepaidUsageRemark` and their `User` relations, excludes the cleanup migration, and contains exactly six reviewed non-destructive shared migrations through `20260812035000_add_shared_prepaid_money_checks`. `20260811220000_add_shared_prepaid_permissions` commits the four enum additions before `20260811230000_add_shared_prepaid_ledger` maps or inserts those values, satisfying PostgreSQL's new-enum-value transaction rule.

Phase B is Phase A's direct child. Its complete commit manifest is exactly:

- `A server/prisma/migrations/20260812040000_remove_legacy_prepaid/migration.sql`
- `M server/prisma/schema.prisma`

Phase B only removes the legacy schema models/relations and adds the cleanup migration. Static ancestry, exact parent/tree identifiers, Phase-A legacy presence, cleanup absence/presence, six-migration enumeration, exact two-path manifest, and whitespace diff checks passed. The cutover runbook records the same immutable identifiers and executable assertions.

## Verification

Both exact release commits were exported independently and tested using the installed local dependency binaries. The production backup was restored into a disposable database, and both phases were rehearsed there; no migration command was run against the production database.

### Phase A (`2b1a6b19eb658a52ceb92775053f43669191d70c`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1115 tests passed.
- Full server discovery: 39 test files / 520 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

### Phase B (`8de3594df38262a589a9f5b69580fc4b5e6d55de`)

- Prisma Client generation: passed.
- `prisma validate`: passed.
- Full root discovery: 117 test files / 1115 tests passed.
- Full server discovery: 39 test files / 520 tests passed.
- Customer Vue typecheck and Vite production build: passed.
- Admin Vue typecheck and Vite production build: passed.
- Nest production build: passed.

Focused second-review regression verification passed: 64 store/picker/settlement-page tests plus customer Vue typecheck. The earlier money/ledger/query/relation/phone/Mock regression sets remain included in the full discoveries above. `git diff --check` passed for both release commits.

The `pnpm test:all` wrapper remains unsuitable for the intentionally symlinked detached-worktree dependency layout: its established dependency-status preflight tries to replace `node_modules` and stops with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. It was not allowed to purge or reinstall dependencies. For both exact artifacts, every command underlying `test:all` and `build:all` was executed directly with the already installed local binaries: complete root/server test discoveries, customer/admin typecheck plus Vite builds, and the Nest build all passed as recorded above. This is a verification-harness constraint, not a code-test failure.

Known non-failing warnings remain: Sass legacy JS API, Element Plus checkbox deprecation, test-environment localStorage/Vue directive notices, Rollup third-party PURE-comment notices, and Vite large-chunk notices. No new failing warning category was observed.

## Deferred environment gates and concerns

- A complete production PostgreSQL/app/Nginx/environment backup was created at `/opt/yangshao-nbxt-backups/preflight-20260812-190311`; its database dump restored successfully into `ys_preflight_20260812_190311`, and the restored row counts exactly matched the captured production baseline.
- The first disposable Phase-A attempt correctly exposed PostgreSQL error `55P04`: the old migration added enum values and used them in the same transaction. The split migration was added by TDD, both release artifacts were rebuilt, and the corrected Phase A then completed with 14 migrations, unchanged baseline counts, zero shared-prepaid rows, and the production service still active.
- Phase B completed on the same disposable database with 15 migrations. All three legacy prepaid tables were removed, prepaid deletion requests were zero, all four shared-prepaid core tables remained empty, stable business-table counts matched, and the production service remained active.
- No production database migration or production application deployment has been performed. A fresh maintenance-window backup and the production Phase A verifier/permission gates remain mandatory before production Phase B cleanup.
- No browser smoke test or real two-account acceptance was performed or claimed.
- The realtime transport remains intentionally process-local. A multi-instance deployment still requires a shared transport such as PostgreSQL LISTEN/NOTIFY or Redis pub/sub.
- Local static verification found no unresolved code, test, build, Prisma, or release-lineage blocker.
