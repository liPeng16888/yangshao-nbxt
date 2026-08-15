# Task 17 Implementation Report

## Status

DONE

## What I implemented

- Added presentation-only `MobilePrepaidList` rendering recharge, customer-balance, and daily-usage cards through a `kind` prop. It imports no Store/API code and emits delete, remark-save, and usage-detail intents to the owning pages.
- Added a mobile recharge form with native date/text/decimal/integer inputs, a searchable full-screen customer selector that still permits a newly typed customer, safe-area spacing, 44px controls, accessible action names, exact two-decimal money display, and long-text wrapping.
- Kept duplicate-customer confirmation totals and payload derivation in the page over existing Store data. Submission now snapshots the whole draft, blocks duplicate confirmation/API work, retains failed saves, resets only an unchanged successful draft, preserves newer edits made while an older save is pending, and suppresses late confirmation/save effects after unmount.
- Rendered recharge records as mobile cards while retaining the existing desktop table exclusively. Pending deletion requests remain non-actionable; active rows use the exact existing reason prompt and Store deletion handler, with prompt/request duplicate and unmount guards.
- Added mobile customer balance cards showing cumulative amount, total usable, used, and remaining times. Each customer opens a nested full-screen panel containing only that customer's daily usage cards.
- Added customer and usage remark drafts that save on blur through existing Store mutations. Per-row pending/confirmed/failed result-token reconciliation preserves dirty, post-submit, and exact rejected drafts, accepts clean authoritative changes, ignores unrelated balance-total refreshes, and drops removed/re-added row state. Page-level per-row latches prevent duplicate saves.
- Added latest-only, scoped AbortController loading for prepaid recharge and report GETs, observable current failures, retry paths, silent stale/owned aborts, and page-unmount cancellation. Report scopes do not cancel one another, only the globally latest response may commit, and both successful and failed stale loads are invalidated by prepaid mutations.
- Made report loading visibility latest-owner-only through a dedicated `prepaidReportLoading` state. An older outstanding scope can no longer keep the current customer page loading after the latest report commits, and cancelling the latest scope clears visible loading even while an older request remains pending; that older request still cannot commit or surface an error later.
- Separated the authoritative recharge POST result from its follow-up report GET. A successful POST inserts the recharge, announces success once, clears only an unchanged draft, and starts a refresh-only request; a failed refresh exposes a dedicated stale-report error and can retry only GET without ever repeating POST.
- Added one shared strict recharge validator used by mobile submission and desktop Element Plus rules: real `YYYY-MM-DD` calendar dates, finite positive amounts with at most two decimal places and safe cents, and positive safe-integer usable times. Payload construction no longer rounds or truncates unsupported input.
- Preserved the existing API endpoints, Store ownership of create/delete/report/remark mutations, calculation and rounding boundaries, desktop controls, auth boundaries, and canonical prepaid bottom-nav route. Internal actions navigate both ways between `/finance/prepaid/add` and `/finance/prepaid/customers`; existing navigation tests confirm the latter remains active under the former.

## TDD evidence

### RED

1. Mobile prepaid pages and Store lifecycle:
   - Command: `pnpm exec vitest run src/views/dashboard/FinancePrepaidPages.mobile.test.ts src/stores/financeBills.test.ts --reporter=dot`
   - Result: expected failures because `MobilePrepaidList.vue` did not exist, prepaid loads did not pass AbortSignals or commit latest-only, and prepaid load cancellation methods did not exist.
2. Prepaid API AbortSignal forwarding:
   - Command: `pnpm exec vitest run src/api/financeBills.test.ts -t "both prepaid GET endpoints" --reporter=dot`
   - Result: expected failure because both existing prepaid GET calls omitted request signals.
3. Dirty-remark and delayed-report races:
   - Command: `pnpm exec vitest run src/views/dashboard/FinancePrepaidPages.mobile.test.ts src/stores/financeBills.test.ts -t "balance totals change|delayed post-recharge report" --reporter=dot`
   - Result: two expected failures showed a balance-only patch resetting a dirty customer remark and a delayed add-refresh overwriting a newer saved remark.
4. Independent-review fix round:
   - Successful POST plus failed report GET: the real Store/page test failed because the bundled Store action rejected the save and made a retry capable of repeating POST.
   - Cross-page report ordering: the deferred test failed because one global active report request aborted a different page scope.
   - Remark completion: customer/usage tests first failed because the presentation component emitted no result callback; exact rejected drafts then failed again after a matching and later authoritative refresh until an explicit failed snapshot was retained.
   - Strict validation: helper tests first failed because the shared validator did not exist; page tests showed `1.234`, `0.001`, and an unsafe integer reaching confirmation.
   - Stale mutation failure: the deletion race test failed because an older recharge GET rejection was still thrown after the successful mutation.
5. Independent-review fix round 2:
   - Command: `pnpm exec vitest run src/stores/financeBills.test.ts -t "report requests independently|latest report loading" --reporter=dot`
   - RED result: both deferred multi-scope tests failed because `prepaidReportLoading` did not exist and report visibility was coupled to all entries in the active-scope map.
   - GREEN coverage: B commits and clears loading while A remains pending, A's later rejection is silent, and cancelling latest B clears loading while pending A remains unable to commit. A real Store/customer-page integration test additionally confirms the latest card is immediately visible with no error UI or toast after stale A rejects.

### GREEN

- Focused Task 17 page/Store/API/validation suite after independent-review fixes:
  - Command: `pnpm exec vitest run src/views/dashboard/FinancePrepaidPages.mobile.test.ts src/views/dashboard/FinancePrepaidAddPage.store.test.ts src/utils/prepaidRecharge.test.ts src/stores/financeBills.test.ts src/api/financeBills.test.ts --reporter=dot`
  - Result: 5 files passed, 67 tests passed.
- Finance phase suite plus Store/API:
  - Command: `pnpm exec vitest run src/views/dashboard/FinancePage.mobile.test.ts src/views/dashboard/FinanceIncomePage.mobile.test.ts src/views/dashboard/FinanceUnsettledPage.test.ts src/views/dashboard/FinanceUnsettledPage.store.test.ts src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/views/dashboard/FinancePrepaidPages.mobile.test.ts src/views/dashboard/FinancePrepaidAddPage.store.test.ts src/utils/prepaidRecharge.test.ts src/stores/financeBills.test.ts src/api/financeBills.test.ts src/api/financeBills.mock.test.ts --reporter=dot`
  - Result: 12 files passed, 123 tests passed.
- Default full suite:
  - Command: `pnpm test -- --reporter=dot`
  - Result: 122 files passed and 1 unrelated file failed; 1310 tests passed and 1 failed. `MedicineInventoryPages.test.ts` hard-codes `2026-08-15`, while `todayInBeijing()` correctly returned `2026-08-16`. Task 17 changes no medicine file.
- Controlled-clock full suite at the original acceptance date:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 123 files passed, 1311 tests passed. The temporary configuration is outside the repository and no verification artifact is included in this diff.
- Canonical prepaid navigation regression:
  - Command: `pnpm exec vitest run src/config/customerNavigation.test.ts src/components/layout/AppMobileShell.test.ts --reporter=dot`
  - Result: 2 files passed, 9 tests passed.
- Production frontend build and type check:
  - Command: `pnpm build`
  - Result: exit 0; `vue-tsc --noEmit`, Vite production build, and PWA service-worker generation completed.
- Whitespace/error-marker check:
  - Command: `git diff --check`
  - Result: exit 0.

## Files changed

- `src/components/finance/MobilePrepaidList.vue` (new)
- `src/views/dashboard/FinancePrepaidPages.mobile.test.ts` (new)
- `src/views/dashboard/FinancePrepaidAddPage.store.test.ts` (new)
- `src/views/dashboard/FinancePrepaidAddPage.vue`
- `src/views/dashboard/FinancePrepaidCustomersPage.vue`
- `src/utils/prepaidRecharge.ts` (new)
- `src/utils/prepaidRecharge.test.ts` (new)
- `src/api/financeBills.ts`
- `src/api/financeBills.test.ts`
- `src/stores/financeBills.ts`
- `src/stores/financeBills.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-17-report.md` (new)

## Self-review

- Checked Task 17 item by item: three card kinds; mobile form; full-screen customer selection and custom entry; decimal/integer keyboards; duplicate totals; success/failure/newer-draft semantics; duplicate/lifecycle guards; exact deletion prompt/handler; customer balances; nested usage detail; customer/usage blur saves and draft reconciliation; two-way internal navigation; desktop/mobile exclusivity; canonical active route; latest load/error/retry/abort/unmount; safe areas; 44px targets; accessibility; and long-text handling.
- Confirmed `MobilePrepaidList.vue` contains no Store/API/network import and never mutates input rows. Remarks remain local presentation drafts until the page emits them into the existing Store mutation boundary.
- Confirmed no server, admin, router, navigation configuration, medicine, database, migration, production, deployment, or Task 18+ file changed.
- Mutation review covers wrong card kind/data, wrong money precision or count, co-rendered desktop tables, wrong navigation targets, duplicate submit/delete/save calls, missing draft retention/reset, late unmount continuation, stale load commits, missing AbortSignal forwarding, dirty remark loss, and delayed report overwrite.

## Concerns

- No remaining Task 17 correctness concern is known.
- Verification output retains existing repository/toolchain warnings: Dart Sass legacy JS API, existing Element Plus checkbox deprecations elsewhere, duplicate loading-directive warnings, Node localStorage experimental warnings, Rollup third-party pure-annotation notices, and the existing large-chunk warning.
