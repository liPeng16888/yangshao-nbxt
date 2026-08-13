# 仰韶双端桌面软件实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every production behavior follows RED → GREEN → regression verification.

**Goal:** Add two isolated, secure Electron online shells and reproducible private Windows/macOS installer builds without changing the existing REST API, Prisma schema, production data, or server deployment.

**Architecture:** A new `desktop/` pnpm workspace contains shared target configuration, pure/testable security and behavior policies, and one Electron main process selected at package time as the customer or backend application. electron-builder packages the same compiled shell twice with different metadata and icons. GitHub Actions performs cross-platform packaging and private artifact delivery.

**Tech Stack:** Electron 43.2.0, electron-builder 26.15.7, TypeScript, Vitest, pnpm, NSIS, DMG, GitHub Actions.

## Global Constraints

- Product mapping and artifact filenames must exactly match the approved design.
- Remote pages receive no preload, IPC, Node, file-system or command-execution bridge.
- Only exact HTTPS target origins may navigate in the application window.
- Login state persists across restarts; only HTTP cache is cleared at startup.
- Customer and backend applications use different `userData` directories.
- Windows is x64 only; macOS is arm64 only and requires macOS 13+.
- Builds are unsigned/unnotarized; no auto-updater is included.
- Existing API contracts, Prisma schema and business data are untouched.
- Do not push, deploy or create a public Release until the user separately authorizes it.

---

### Task 1: Record the approved design and implementation plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-13-desktop-installers-design.md`
- Create: `docs/superpowers/plans/2026-08-13-desktop-installers.md`

- [ ] Verify the feature worktree is based on current `origin/main` and commit the two documents before production code.

### Task 2: Add the desktop workspace and target configuration

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/vitest.config.ts`
- Create: `desktop/src/config.test.ts`
- Create: `desktop/src/config.ts`

- [ ] Write a failing mapping test for product names, app IDs, fixed URLs, exact origins, artifact prefixes and independent `userData` directories.
- [ ] Run the focused test and record RED because the implementation does not exist.
- [ ] Add the minimum shared configuration and target resolver.
- [ ] Run focused GREEN and the desktop regression suite.

### Task 3: Add window, session and menu behavior

**Files:**
- Create: `desktop/src/window-options.test.ts`
- Create: `desktop/src/window-options.ts`
- Create: `desktop/src/menu.test.ts`
- Create: `desktop/src/menu.ts`
- Create: `desktop/src/session.test.ts`
- Create: `desktop/src/session.ts`

- [ ] RED-test `1440×900`, minimum `1100×700`, fixed title and hardened web preferences.
- [ ] RED-test reload, hard reload, about and quit menu actions.
- [ ] RED-test isolated `userData` paths and cache-only startup cleanup.
- [ ] Implement the minimum pure policies and verify GREEN.

### Task 4: Add exact-origin navigation and permission security

**Files:**
- Create: `desktop/src/security-policy.test.ts`
- Create: `desktop/src/security-policy.ts`

- [ ] RED-test exact origin matching, HTTPS enforcement, ports, user-info spoofing, look-alike domains, `blob:` scope and external-link classification.
- [ ] RED-test default permission rejection, certificate rejection and same-origin CSP contents.
- [ ] Implement the policy with the standard `URL` parser and verify GREEN.

### Task 5: Add download and offline behavior

**Files:**
- Create: `desktop/src/downloads.test.ts`
- Create: `desktop/src/downloads.ts`
- Create: `desktop/src/offline-page.test.ts`
- Create: `desktop/src/offline-page.ts`

- [ ] RED-test safe default filenames plus canceled and accepted save decisions.
- [ ] RED-test escaped offline HTML, retry target, offline CSP and retry behavior.
- [ ] Implement the minimum behavior and verify GREEN.

### Task 6: Wire the Electron main process

**Files:**
- Create: `desktop/src/main.ts`

- [ ] Run the desktop build and record the missing runtime wiring failure.
- [ ] Set the application name and isolated `userData` path before ready.
- [ ] Enforce single instance, permissions, certificates, navigation, external confirmation, CSP, downloads, cache clearing, menu and offline fallback.
- [ ] Keep the title fixed and disable production developer tools.
- [ ] Compile and run the complete desktop suite.

### Task 7: Normalize icons and add packaging configuration

**Files:**
- Create: `desktop/build/icons/internal/source.png`
- Create: `desktop/build/icons/internal/icon.png`
- Create: `desktop/build/icons/internal/icon.ico`
- Create: `desktop/build/icons/internal/icon.icns`
- Create: `desktop/build/icons/backend/source.png`
- Create: `desktop/build/icons/backend/icon.png`
- Create: `desktop/build/icons/backend/icon.ico`
- Create: `desktop/build/icons/backend/icon.icns`
- Create: `desktop/scripts/generate-icons.py`
- Create: `desktop/electron-builder.config.mjs`
- Create: `desktop/electron-builder.config.test.ts`

- [ ] RED-test both target configurations, platform metadata and exact artifact names.
- [ ] Copy the approved sources, remove only the backend black outer corners, add consistent safe space and generate platform assets.
- [ ] Configure per-user x64 NSIS and arm64 macOS 13+ DMG builds.
- [ ] Verify config tests, icon dimensions/formats and package metadata.

### Task 8: Add private one-click builds and operations documentation

**Files:**
- Create: `.github/workflows/desktop-installers.yml`
- Create: `docs/deployment/desktop-installers.md`

- [ ] Add manual Linux validation with desktop/current test suites, all builds and production URL reachability checks.
- [ ] Add `windows-2025` x64 jobs for both EXE files and `macos-15` arm64 jobs for both DMG files.
- [ ] Add checksum aggregation and private 30-day artifact retention with no Release.
- [ ] Document GitHub download click path, SmartScreen/Gatekeeper handling, overwrite install, uninstall, local-login cleanup, version checks and network recovery.

### Task 9: Full verification and local handoff

- [ ] Run desktop focused tests and TypeScript build.
- [ ] Run customer frontend, admin and server test suites with worktree/store exclusions.
- [ ] Build customer frontend, admin and server.
- [ ] Validate workflow syntax, target metadata, icon assets and SHA-256 script.
- [ ] Build and smoke-test both local macOS arm64 applications/DMGs where the machine permits unsigned packaging.
- [ ] Confirm no REST API, Prisma schema or production-data change exists.
- [ ] Review the diff and leave the local branch ready for a later user-authorized GitHub push and VPS action.
