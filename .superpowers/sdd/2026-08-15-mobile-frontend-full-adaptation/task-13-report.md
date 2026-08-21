# Task 13 Report: Mobile Blacklist Single Page

## Scope

- Base: `362116fa92eaf01f4707819662a1db2108a8f8a8`
- Task: mobile blacklist cards, search, create, supplement, hit highlighting, and lifecycle safety only.
- Preserved: desktop `BlacklistTable`/`BlacklistUploadForm` rendering, mutation authorization, confirmation text, router access-guard mapping, and the absence of secondary mobile navigation.
- Correctness fix scope after independent review: existing upload, blacklist read DTO, and upload-validation contracts only; no new endpoint, database migration, batch import, or production release.

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

### Independent review fix RED cycles

The rejected review findings were reproduced before fixes:

- Mobile create/supplement and desktop create saved `blob:` preview URLs and never called `uploadImages`; retry uploaded the same raw file again.
- Client/server accepted SVG/BMP and files over 5 MB; the server trusted the original extension, and the Multer interceptor had no file-size limit.
- Duplicate display usernames exposed actions because both mobile and desktop compared `uploadedBy` text.
- `-1` and `1.999` reached create/update; the server rounded over-precision values.
- A search started before delete/update could later resurrect stale data; global cancellation could invalidate another consumer.
- A staged keyword prevented `?hit=` from loading the exact reminder record.
- In-flight create/supplement drafts were lost across layout changes; retry re-uploaded raw files.
- The same hit scrolled repeatedly after a reload; unowned blob previews were rendered.

Each failure was observed in a focused Vitest run before the minimum corresponding production change.

### Independent review fix round 2 RED

The remaining review findings were reproduced through Element Plus itself rather than by directly invoking component callbacks:

```bash
pnpm exec vitest run src/components/blacklist/BlacklistUploadForm.test.ts
# 2 failed: real handleStart preview was not revoked after reset; focusable trigger had no name

pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts -t "retries the exact|awaits create|enforces two supplement|names the actual"
# 3 failed: hit-route retry used ''; mobile create leaked the real blob; focusable trigger had no name
```

The real file input path confirmed that Element Plus had already assigned a `blob:` URL before `onChange`. A first GREEN attempt also exposed a supplement double revoke (2 calls instead of 1), which was corrected by letting the unmounting Element Plus upload own close/unmount revocation while application resets own explicit list clearing.

A scoped self-review then added a real-image, pending-save layout-switch case. It failed RED because the outgoing mobile upload revoked its preview while the incoming desktop upload retained the dead URL (`createObjectURL` stayed at 1 instead of 2). The fix re-homes the same raw `File` to one freshly owned URL after each layout render, invalidates overlapping re-home work, preserves the upload-result cache, and excludes internal preview URL churn from the user-draft signature.

### Independent review fix round 3 RED

The test `DialogStub` was changed to match Element Plus production behavior: content mounts lazily on first open and remains mounted while hidden when `destroyOnClose` is false. Real file-input tests then proved the remaining defect:

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts -t "enforces two supplement|resets supplement edits|revokes desktop supplement"
# 3 failed: mobile success, mobile cancel, and desktop success each revoked the owned blob 0 times
```

The root cause was external `fileList` clearing combined with forgotten ownership: retained ElUpload instances neither unmounted nor revoke files removed through a parent model replacement.

### Independent review fix round 4 RED

Real Element Plus lifecycle tests opened legacy records containing an unowned stored `blob:` string and then exercised the actual picture-card delete control, page unmount, and an in-flight mobile-to-desktop layout swap:

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts -t "legacy unowned blob"
# 3 failed: Element Plus revoked blob:legacy-remove, blob:legacy-unmount, and blob:legacy-layout
```

Tracing confirmed the trust-boundary defect: `openSupplement` copied every server `row.images` value into ElUpload, whose own lifecycle correctly revokes every `blob:` URL without knowing the application's ownership registry.

### GREEN

Focused command:

```bash
pnpm exec vitest run src/components/blacklist/BlacklistImagePreview.test.ts src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts src/stores/blacklist.test.ts src/utils/validators.test.ts src/router/guards.test.ts
```

Initial result: 6 files, 27 tests passed.

Review-fix focused frontend result:

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts src/components/blacklist/BlacklistUploadForm.test.ts src/components/blacklist/BlacklistImagePreview.test.ts src/stores/blacklist.test.ts src/utils/validators.test.ts src/api/upload.test.ts vite-proxy.test.ts
# 8 files, 43 tests passed
```

Latest review-fix focused frontend result:

```bash
pnpm exec vitest run src/views/dashboard/BlacklistPage.mobile.test.ts src/components/blacklist/BlacklistTable.test.ts src/components/blacklist/BlacklistUploadForm.test.ts src/components/blacklist/BlacklistImagePreview.test.ts src/stores/blacklist.test.ts src/utils/validators.test.ts src/api/upload.test.ts vite-proxy.test.ts
# 8 files, 53 tests passed
```

Review-fix focused server result:

```bash
pnpm --dir server exec vitest run src/blacklist/blacklist.service.test.ts src/blacklist/blacklist.controller.test.ts src/uploads/uploads.service.test.ts src/uploads/uploads.controller.test.ts
# 4 files, 14 tests passed
```

## Acceptance Evidence

- Layout: `useMobileLayout` exclusively selects one mobile panel or the unchanged desktop table/upload pair; no mobile secondary navigation is rendered.
- Cards: show nickname/contact fallbacks, status, hit reason, phone, WeChat, nickname, exact two-decimal amount, safe image previews, other, note, uploader, and upload time.
- Ownership/access: server reads derive `canManage` from authenticated user ID versus `uploadedById`; duplicate or empty display usernames cannot expose actions. Mutation authorization still checks the same stable uploader ID, and `/blacklist -> BLACKLIST` access-guard tests pass.
- Search: a 44px keyword drawer stages input, emits the same string payload, retains the keyword and prior records on failure, and retries the exact last failed keyword even while `?hit=` remains active. Initial hit navigation and later route changes still load unfiltered so the exact target can be found.
- Loading lifecycle: per-consumer AbortSignals replace global cancellation; search ordering remains latest-wins, while a mutation epoch prevents an older search from resurrecting a deleted or pre-supplement record. Unmount aborts only this page and prevents late error/UI writes.
- Hit route: string-only `?hit=` forces an unfiltered load, uses exact record IDs and element refs rather than selector interpolation, expands/highlights/scrolls once after render, handles route reuse/layout change/clear, prunes cached refs, and safely ignores missing or injection-like values.
- Create: mobile and desktop call and await `uploadImages` and then `save(payload)`; duplicate submit is locked; rejection retains all fields and raw Files, with successful upload URLs cached for retry; unchanged success alone clears and revokes owned previews. KeepAlive preserves an in-flight mobile create draft across layout changes.
- Images: PNG/JPEG/WebP/GIF only, 5 MB per file, maximum two record images, MIME-derived server extensions, 5 MB Multer and service defenses, and persistent `/uploads/...` URLs. Absolute API bases resolve server URLs to their API origin; relative development uses the added `/uploads` proxy. Real Element Plus `handleStart` previews are registered from the raw `File`, retained for upload retry, and revoked exactly once on removal/reset/unmount. Supplement reset first clears the retained ElUpload instance's internal list and then explicitly revokes page-owned URLs, while removal/page-unmount remain Element-owned. The `row.images` trust boundary accepts safe HTTP(S), relative server, and raster data URLs but drops stored `blob:` values before ElUpload, payload persistence, removal, unmount, or layout swap. App-owned raw File previews remain supported. Mock uploads use persistent raster data URLs.
- Accessibility: desktop create, mobile create, and mobile/desktop supplement upload triggers contain visually hidden label text inside the actual focusable `.el-upload[role="button"]`; the decorative plus icon is hidden from assistive technology.
- Money: both create and supplement reject negative, non-finite, and over-two-decimal amounts in the client and server; `0`, two-decimal values, and nullable clearing retain the established contract.
- Supplement: mobile uses forced `MobileFullscreenDialog`; desktop retains `el-dialog`; both share `supplementForm`, validation, Store update, confirmation text, image state, and permission. Fields/uploads are locked while saving; failed saves and layout switches retain every field/raw image; each layout gets a fresh valid owned preview; retry reuses uploaded URLs; unchanged success or cancel resets; cleared money becomes `null`; duplicate saves remain tied to the captured record ID.
- Delete: exact existing confirmation is preserved; in-flight duplicate clicks are ignored; failure leaves the record; success removes only the requested ID.

## Final Verification

```bash
pnpm test
# 113 files passed; 1167 tests passed

pnpm --dir server test
# 28 files passed; 352 tests passed

pnpm exec vue-tsc --noEmit
# exit 0

pnpm build
# vue-tsc --noEmit + Vite production build; exit 0

pnpm --dir server build
# Nest production build; exit 0

git diff --check
# exit 0
```

Known output noise is pre-existing: Sass legacy API warnings, Element Plus deprecation warnings, localStorage experimental warnings, and the Vite chunk-size warning.
