# Task 16 Implementation Report

## Status

DONE

## What I implemented

- Added a mobile-only monthly settlement view with a native month filter, exact two-decimal report totals, customer filters, daily rows, and mutually exclusive rendering from the existing desktop tables.
- Added presentation-only `MobileMonthlySettlementList` cards. Each card shows customer/month/sample count, exact amount/paid/unpaid values, all three settlement states, partial-payment input, remark editor, and a daily-detail action. The component imports neither Store nor API code and emits only `statusChange`, `paidAmountChange`, `remarkCommit`, and `openDailyDetails` intents.
- Kept authoritative settlement behavior in `FinanceMonthlySettlementPage`: paid amounts are clamped and rounded to `[0, amount]`, status changes retain the existing automatic paid/partial remark behavior, and remarks commit on blur through the existing Store mutation.
- Added mutually exclusive mobile cyclic sorting for amount, sample count, and settlement status. Each key cycles ascending → descending → source order; selecting another key clears the prior one. Status order reuses the existing desktop comparator (`已结款` → `部分结款` → `未结款`).
- Added a full-screen, safe-area-aware mobile customer detail panel with exact daily amount/sample values and positive-only element-count text.
- Kept the desktop table columns, sort orders, customer filtering, export rows, bill draft/content, filename generator, and `downloadMonthlyBillAsPng` download path intact.
- Made the export dialog full-screen on mobile. It reuses the same canvas drawing logic through a new shared `createMonthlyBillPngBlob()` boundary, keeps an `<img>` preview mounted with “长按保存图片”, and invokes system sharing only when `navigator.share` and `navigator.canShare({ files })` both support the generated PNG `File`.
- Added distinct successful, cancelled, failed, and unsupported-share states. Duplicate export triggers are locked, late work is ignored after close/unmount/layout changes, and every owned preview object URL is cleared before revocation so close, replacement, layout change, and unmount revoke it exactly once.
- Made monthly report loading latest-request-only with scoped `AbortSignal` cancellation, silent stale/owned aborts, current-error propagation, page retry state, and unmount cancellation. Older month responses can no longer replace the latest committed report.
- Added 44px mobile controls, safe-area bottom padding, named buttons/dialog regions, `aria-busy`, live/error status regions, and long-content wrapping.

## TDD evidence

### RED

1. Mobile settlement page:
   - Command: `pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts`
   - Result: 7 expected failures because no mobile settlement render path/cards/filters/sort/detail/error lifecycle existed and the desktop Element Plus tables still mounted in mobile mode.
2. Export Blob/share and monthly Store lifecycle:
   - Command: `pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts src/utils/monthlySettlementBillPng.test.ts src/stores/financeBills.test.ts --reporter=dot`
   - Result: 7 expected failures: missing shared PNG Blob generator, missing mobile fullscreen/share/preview/status UI, no file-capability branch, no preview URL lifecycle, and no latest/scoped monthly-load cancellation.

### GREEN

- Focused Task 16 + Store/PNG regression:
  - Command: `pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/components/finance/MonthlySettlementBillExportDialog.test.ts src/utils/monthlySettlementBillPng.test.ts src/stores/financeBills.test.ts --reporter=dot`
  - Result: 5 files passed, 60 tests passed.
- Full repository Vitest:
  - Command: `pnpm test`
  - Result: 119 files passed, 1255 tests passed.
- Type check:
  - Command: `pnpm exec vue-tsc --noEmit`
  - Result: exit 0.
- Production frontend build:
  - Command: `pnpm build`
  - Result: exit 0; Vite production bundle and PWA service worker generation completed.
- Whitespace/error-marker check:
  - Command: `git diff --check`
  - Result: exit 0.

## Files changed

- `src/components/finance/MobileMonthlySettlementList.vue` (new)
- `src/components/finance/MobileMonthlySettlementList.test.ts` (new)
- `src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts` (new)
- `src/views/dashboard/FinanceMonthlySettlementPage.vue`
- `src/views/dashboard/FinanceMonthlySettlementPage.test.ts`
- `src/components/finance/MonthlySettlementBillExportDialog.vue`
- `src/components/finance/MonthlySettlementBillExportDialog.test.ts`
- `src/utils/monthlySettlementBillPng.ts`
- `src/utils/monthlySettlementBillPng.test.ts`
- `src/api/financeBills.ts`
- `src/stores/financeBills.ts`
- `src/stores/financeBills.test.ts`
- `.superpowers/sdd/2026-08-15-mobile-frontend-full-adaptation/task-16-report.md` (new)

## Self-review

- Checked Task 16 item by item: exact amount/paid/unpaid values; three states; page-authoritative clamp, status and blur persistence; cyclic sorting parity; month/customer filters; element counts; full-screen daily detail; export entry; mobile/desktop exclusivity; desktop contract preservation; full-screen mobile export; shared Blob/content/filename; share capability; preview fallback; cancel/failure distinction; duplicate/latest/close/layout/unmount guards; URL ownership; 44px controls; safe areas; accessibility; and latest load/error/retry/unmount safety.
- Confirmed `MobileMonthlySettlementList.vue` contains no Store/API/network import and never mutates input rows. Local remark drafts remain presentation state until the blur intent reaches the page.
- Confirmed the diff is limited to Task 16 customer frontend files, the existing PNG boundary, monthly load signal/Store lifecycle, their tests, and this report. No Task 17+, server, admin, navigation, database, migration, production, or deployment file changed.
- Mutation review: wrong paid/unpaid derivation, missing clamp ends, direct remark mutation, wrong sort direction/status rank, co-rendered desktop tables, filtered export rows, missing element counts, non-fullscreen detail/export, unconditional share, duplicate generation/share, late lifecycle effects, double URL revocation, stale month commits, and post-unmount report commits are covered by focused tests.

## Concerns

- No remaining Task 16 correctness concern is known.
- Verification output includes existing repository/toolchain warnings: Dart Sass legacy JS API, existing Element Plus deprecated checkbox usages elsewhere, Node localStorage experimental warnings, Rollup third-party pure-annotation notices, and the existing large-chunk warning. All verification commands exited successfully.

## Independent-review fix round

### Findings addressed

- Preserved a page-level requested month independently from the last committed Store month. A failed month change keeps the selected month visible, and refresh/retry requests the exact failed month instead of silently falling back to the previously committed report month.
- Invalidated the mobile PNG preview and its in-flight export generation on every committed bill/customer mutation: customer selection, element price, title, date group, entry element/quantity/price, and manual-entry commit. The owned URL is cleared before revocation, so subsequent draft changes, close, layout flips, and unmount cannot revoke the same ownership twice.
- Moved mobile export sizing to an explicit `monthly-bill-export-dialog--mobile` class rather than a narrow media query. Safe-area padding therefore applies to both narrow and coarse-pointer mobile layouts, while Element Plus selectors, inputs, bill cell editors, buttons, and the dialog close target receive a 44px minimum interaction height.

### Fix-round TDD evidence

1. Failed selected-month retry RED:
   - Command: `pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts -t "retries the exact failed month" --reporter=dot`
   - Expected failure: after a rejected July request, the month input returned to August and retry had no preserved July target.
   - GREEN: the same focused command passed after adding `requestedMonth` ownership.
2. Stale preview RED:
   - Command: `pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts -t "invalidates and revokes" --reporter=dot`
   - Expected failure: editing the visible title left the old PNG preview mounted.
   - GREEN: price, title, and customer mutations now each clear the preview and revoke the corresponding URL once.
3. Mobile safe-area/44px RED:
   - Command: `pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts -t "mobile safe-area" --reporter=dot`
   - Expected failure: the dialog lacked a mobile-specific class and its control-size contract.
   - GREEN: the mobile class, breakpoint-independent safe-area declarations, and 44px minimum controls passed the focused test.
4. Combined review-fix GREEN:
   - Command: `pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/components/finance/MonthlySettlementBillExportDialog.test.ts --reporter=dot`
   - Result: 2 files passed, 27 tests passed.

## Root independent-review fix round

### Findings addressed

- Added one module-level mobile share latch shared by every export-dialog instance. The latch is acquired before PNG Blob generation, survives close/reopen, unmount/new-instance, and mobile/desktop/mobile layout flips, and is released only when the original export path finishes (including `navigator.share` resolution or rejection). Instance tokens still suppress stale UI and own preview URL cleanup.
- Guarded unavailable `File` support after creating the long-press preview but before constructing a `File` or probing `navigator.canShare`. Unsupported devices retain the preview and receive “当前设备不支持系统文件分享，请长按保存图片” without a generic generation error.
- Removed Element Plus +/- steppers from every mobile export-dialog number input through the explicit `mobile` prop while retaining the desktop controls unchanged. The focusable mobile spinbutton remains covered by the existing 44px mobile-class rule.
- Replaced the whole-array remark reset with per-row `identity`, authoritative `base`, local `value`, and `submitted` snapshot state. Dirty drafts survive unrelated and same-row pending patches; a confirmed authoritative value only resyncs when the local text still matches the submitted snapshot or that authoritative value; removed rows drop state and new/re-added rows start from their current authoritative value.
- Removed the nested daily-detail `role="dialog"`. The existing `MobileFullscreenDialog` remains the sole dialog, while its content is a `region` labelled by a real heading.

### RED evidence

- Command: `pnpm exec vitest run src/components/finance/MonthlySettlementBillExportDialog.test.ts src/components/finance/MobileMonthlySettlementList.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts --reporter=dot`
- Result: 3 files failed with 8 expected failures and 28 passes. Failures directly showed: three cross-instance/lifecycle share duplicates, generic `File`-missing failure, rendered mobile price steppers, two dirty-draft overwrites, and the nested dialog role.
- The mobile stepper contract was tightened and rerun before production changes; it failed because the rendered `ElInputNumber` still reported `controls=true` and included actual `.el-input-number__increase`/`.el-input-number__decrease` controls at a 900px mobile layout width.

### GREEN and final verification

- Global share latch: 3/3 lifecycle tests passed for close/reopen, unmount/new instance, and layout flip; both resolve and reject release paths permit the next export only after settlement, with no second Blob/share while pending.
- `File` unavailable fallback: 1/1 passed; preview retained, no `canShare`/`share`, and URL revoked once on unmount.
- Rendered mobile number controls: 1/1 passed; no mobile +/- controls at coarse width, while desktop still renders both controls.
- Per-row remark reconciliation: 4/4 passed for A-dirty/B-patch, same-row submitted snapshot plus newer text, clean external update, and row removal/add/re-add.
- Labelled daily-detail region: 1/1 passed.
- Focused Task 16 suite:
  - Command: `pnpm exec vitest run src/views/dashboard/FinanceMonthlySettlementPage.test.ts src/views/dashboard/FinanceMonthlySettlementPage.mobile.test.ts src/components/finance/MobileMonthlySettlementList.test.ts src/components/finance/MonthlySettlementBillExportDialog.test.ts src/utils/monthlySettlementBillPng.test.ts src/stores/financeBills.test.ts --reporter=dot`
  - Result: 6 files passed, 69 tests passed.
- Type check:
  - Command: `pnpm exec vue-tsc --noEmit`
  - Result: exit 0.
- Default full-suite midnight diagnosis:
  - Command: `pnpm test`
  - Result: 119 files passed and 1 unrelated file failed; 1263 tests passed and 1 failed. `MedicineInventoryPages.test.ts` hard-codes `2026-08-15`, while `todayInBeijing()` correctly returned `2026-08-16` after local midnight. The failing test reproduced alone and Task 16 changed no medicine file.
- Controlled full-suite verification using a `/private/tmp`-only Vitest setup fixing `Date.now()` to the original 2026-08-15 acceptance date:
  - Command: `pnpm exec vitest run --config /private/tmp/task16-vitest.config.ts --reporter=dot`
  - Result: 120 files passed, 1264 tests passed. No temporary verification file is part of the repository diff.
- Production build and final type check:
  - Command: `pnpm build`
  - Result: exit 0; `vue-tsc --noEmit`, Vite production bundling, and PWA service-worker generation completed.

### Second-round self-review

- Confirmed the global latch has exactly one acquisition and one release site; local invalidation never clears it. Blob-generation throws, unsupported capability, share resolve, share cancel, and share reject all release through the same `finally` path.
- Confirmed preview ownership remains instance-local and is cleared before every revoke, so the module latch introduces no cross-instance URL ownership.
- Confirmed the mobile component still imports no Store/API and still emits exactly the same four intents; remark reconciliation changes presentation state only.
- Confirmed desktop bill inputs retain controls and the desktop filename/content/download path is unchanged.
- Confirmed the diff remains Task 16-only: no Task 17+, medicine, server, admin, API contract expansion, navigation, deployment, or production file was changed.
