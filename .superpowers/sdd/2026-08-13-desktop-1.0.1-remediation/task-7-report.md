# Task 7 — Electron native edit context menu

## Status

Completed on branch `codex/desktop-installers`.

## Delivered

- Added `desktop/src/context-menu.ts` with a pure
  `createContextMenuTemplate(params)` builder.
  - Editable contexts always expose Undo, Redo, Cut, Copy, Paste, Delete, and
    Select All native roles; every role's `enabled` value comes only from the
    matching Chromium `editFlags` value.
  - Missing edit flags are normalized to `false`.
  - Read-only selections expose Copy and, when allowed, Select All. Blank
    read-only contexts produce no menu.
- Added a lifecycle-safe `installContextMenu(window)` helper. It binds only to
  that `BrowserWindow`'s `webContents`, skips destroyed windows/web contents,
  returns an unsubscribe function, and is removed when the window closes.
- Attached the helper from `createMainWindow()`.
- Added six focused tests for template shape, disabled operations, missing
  flags, per-window popup binding/unsubscribe, and destroyed-window behavior.

The implementation adds no clipboard API use, IPC, preload exposure, spelling,
link/image, navigation, or inspect actions. The existing permission regression
continues to reject `clipboard-read`.

## TDD evidence

1. Initial focused test run was RED because `./context-menu` did not exist.
2. Lifecycle attachment tests were separately verified RED after removing the
   installer: `installContextMenu is not a function`.
3. The minimal builder and installer were restored, then all focused tests were
   GREEN.

## Verification

All commands were run from the linked desktop worktree:

```text
pnpm --filter @yangshao/desktop exec vitest run src/context-menu.test.ts src/security-policy.test.ts
20 tests passed in 2 files

pnpm desktop:test
67 tests passed in 12 files

pnpm desktop:build
tsc -p tsconfig.json (exit 0)

git diff --check
exit 0
```

## Commit

`feat: add native desktop edit context menu` (created after this report).

## Concerns

None. This task is intentionally constrained to Electron native roles and does
not change renderer permissions; the existing `clipboard-read` denial remains
covered by the security-policy test.
