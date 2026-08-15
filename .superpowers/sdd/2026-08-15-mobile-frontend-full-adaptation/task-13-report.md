# Task 13 Report: Mobile Blacklist Single Page

## Scope

- Base: `362116fa92eaf01f4707819662a1db2108a8f8a8`
- Task: mobile blacklist cards, search, create, supplement, hit highlighting, and lifecycle safety only.
- Preserved: desktop `BlacklistTable` rendering and `BlacklistUploadForm`; existing blacklist Store/API methods, validation, authorization ownership rule, confirmations, and router access-guard mapping.
- Not added: batch import, new business APIs, backend changes, or secondary mobile navigation.

## TDD Evidence

### RED

Command:

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts src/stores/blacklist.test.ts
```

Observed before implementation:

- `BlacklistPage.mobile.test.ts`: 9/9 failed because mobile cards, mobile create form, search drawer, fullscreen supplement, exact hit scrolling, and mobile actions were absent.
- `BlacklistTable.test.ts`: desktop root contract failed because `.blacklist-table` was absent.
- `blacklist.test.ts`: both request-order tests failed because an old request overwrote the latest result and `cancelPendingLoads` did not exist.
- Existing desktop ownership tests remained green.

A second RED cycle proved unsafe `javascript:` and SVG data image URLs were still rendered. A third RED cycle proved clearing a mobile supplement amount produced an invalid empty string instead of the existing nullable amount contract.

### GREEN

Focused command:

```bash
pnpm exec vitest run src/components/blacklist/BlacklistImagePreview.test.ts src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts src/stores/blacklist.test.ts src/utils/validators.test.ts src/router/guards.test.ts
```

Result: 6 files, 27 tests passed.

## Acceptance Evidence

- Layout: `useMobileLayout` exclusively selects one mobile panel or the unchanged desktop table/upload pair; no mobile secondary navigation is rendered.
- Cards: show nickname/contact fallbacks, status, hit reason, phone, WeChat, nickname, exact two-decimal amount, safe image previews, other, note, uploader, and upload time.
- Ownership/access: supplement/delete appear only when `uploadedBy` exactly matches the authenticated username; existing `/blacklist -> BLACKLIST` access-guard tests pass.
- Search: a 44px keyword drawer stages input, emits the same string payload, retains the keyword and prior records on failure, and retries with the same keyword.
- Loading lifecycle: Store request versions prevent stale results from replacing newer searches; page unmount cancels pending loads and prevents late error/UI writes.
- Hit route: string-only `?hit=` matching uses exact record IDs, element refs rather than selector interpolation, expands/highlights/scrolls after render, retries after loading, handles route reuse/change/clear, and safely ignores missing or injection-like values.
- Create: `save(payload)` is awaited; duplicate submit is locked; rejection retains all text/money fields and selected images; success alone clears fields and revokes owned blob URLs.
- Images: create and supplement accept images only, preserve valid selections after invalid/excess input, cap existing plus new images at two, revoke owned previews on removal/reset/unmount, and omit unsafe preview URL schemes.
- Supplement: mobile uses forced `MobileFullscreenDialog`; desktop retains `el-dialog`; both share `supplementForm`, validation, Store update, confirmation text, image state, and ownership. Failure retains the draft; success or cancel resets; cleared money becomes `null`; duplicate saves are locked to the captured record ID.
- Delete: exact existing confirmation is preserved; in-flight duplicate clicks are ignored; failure leaves the record; success removes only the requested ID.

## Final Verification

```bash
pnpm test
# 107 files passed; 1123 tests passed

pnpm exec vue-tsc --noEmit
# exit 0

pnpm build
# vue-tsc --noEmit + Vite production build; exit 0

git diff --check
# exit 0
```

Known output noise is pre-existing: Sass legacy API warnings, Element Plus deprecation warnings, localStorage experimental warnings, and the Vite chunk-size warning.
