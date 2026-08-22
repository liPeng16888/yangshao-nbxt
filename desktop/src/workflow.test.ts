// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  fileURLToPath(
    new URL('../../.github/workflows/desktop-installers.yml', import.meta.url),
  ),
  'utf8',
)
const repositoryDirectory = fileURLToPath(new URL('../..', import.meta.url))
const desktopPackage = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { devDependencies?: Record<string, string> }

describe('private desktop installer workflow', () => {
  it('is manual, read-only and does not publish a release', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('contents: read')
    expect(workflow).not.toMatch(/\bpush:/u)
    expect(workflow).not.toContain('create-release')
    expect(workflow).not.toContain('softprops/action-gh-release')
  })

  it('validates all existing applications before packaging', () => {
    expect(workflow).toContain('runs-on: ubuntu-24.04')
    expect(workflow).toContain('pnpm desktop:test')
    expect(workflow).toContain('vitest run --dir src')
    expect(workflow).toContain('vitest run --dir admin/src')
    expect(workflow).toContain('vitest run --root server')
    expect(workflow).toContain('pnpm build:all')
    expect(workflow).toContain('https://www.ysjc.art/')
    expect(workflow).toContain('https://ys.ysjc.art/admin/login')
  })

  it('uses approved Windows and arm64 macOS runners for both targets', () => {
    expect(workflow).toContain('runs-on: windows-2025')
    expect(workflow).toContain('runs-on: macos-15')
    expect(workflow).toContain('target: [internal, backend]')
    expect(workflow).toContain('run pack -- --win --x64')
    expect(workflow).toContain('run pack -- --mac --arm64')
    expect(workflow).toContain('test "$(uname -m)" = "arm64"')
  })

  it('reads packaged macOS metadata from the exact Info.plist path', () => {
    expect(workflow).toContain(
      'plutil -extract CFBundleIdentifier raw -o - "$app_path/Contents/Info.plist"',
    )
    expect(workflow).toContain(
      'plutil -extract LSMinimumSystemVersion raw -o - "$app_path/Contents/Info.plist"',
    )
    expect(workflow).not.toContain('defaults read')
    expect(workflow).toContain('codesign --verify --deep --strict "$app_path"')
    expect(workflow).toContain(
      'plutil -extract ElectronAsarIntegrity raw -o - "$app_path/Contents/Info.plist"',
    )
  })

  it('bundles exactly four installers with SHA-256 for 30 private days', () => {
    const expectedFilenames = [
      'Yangshao-Internal-System-1.0.3-win-x64.exe',
      'Yangshao-Backend-System-1.0.3-win-x64.exe',
      'Yangshao-Internal-System-1.0.3-mac-arm64.dmg',
      'Yangshao-Backend-System-1.0.3-mac-arm64.dmg',
    ]
    for (const filename of expectedFilenames) {
      expect(workflow).toContain(filename)
    }
    expect(
      [
        ...new Set(
          workflow.match(
            /Yangshao-(?:Internal|Backend)-System-[\d.]+-(?:win-x64\.exe|mac-arm64\.dmg)/gu,
          ),
        ),
      ].sort(),
    ).toEqual([...expectedFilenames].sort())
    expect(workflow).not.toContain('1.0.0')
    expect(workflow).toContain('SHA256SUMS.txt')
    expect(workflow).toContain('retention-days: 30')
    expect(workflow).toContain('name: Yangshao-Desktop-Installers-1.0.3')
  })

  it('checks every packaged runtime before uploading an installer', () => {
    expect(desktopPackage.devDependencies?.['@electron/asar']).toBe('3.4.1')
    expect(workflow).toContain('Resources/app.asar')
    for (const runtimeFile of [
      'dist/build-info.json',
      'dist/main.js',
      'dist/find-preload.cjs',
    ]) {
      expect(
        workflow.match(new RegExp(runtimeFile.replace('.', '\\.'), 'g'))
          ?.length ?? 0,
      ).toBeGreaterThanOrEqual(2)
    }
  })

  it('passes absolute app.asar paths to the filtered desktop command', () => {
    expect(workflow).toContain(
      '$asar = (Resolve-Path -LiteralPath $asarRelative).Path',
    )
    expect(workflow).toContain(
      'asar="$(pwd)/$app_path/Contents/Resources/app.asar"',
    )
    expect(workflow).not.toContain('$asar = "desktop/release/')
    expect(workflow).not.toContain(
      'asar="$app_path/Contents/Resources/app.asar"',
    )

    const temporaryDirectory = mkdtempSync(
      join(tmpdir(), 'yangshao-workflow-asar-'),
    )
    const sourceDirectory = join(temporaryDirectory, 'source')
    const runtimeDirectory = join(sourceDirectory, 'dist')
    const archivePath = join(temporaryDirectory, 'app.asar')
    mkdirSync(runtimeDirectory, { recursive: true })
    writeFileSync(join(runtimeDirectory, 'main.js'), 'export {}\n')

    const command = (args: string[]) =>
      spawnSync(
        'pnpm',
        ['--filter', '@yangshao/desktop', 'exec', 'asar', ...args],
        {
          cwd: repositoryDirectory,
          encoding: 'utf8',
          env: { ...process.env, CI: 'true' },
        },
      )

    const pack = command(['pack', sourceDirectory, archivePath])
    expect(pack.status, pack.stderr).toBe(0)
    const list = command(['list', archivePath])
    expect(list.status, list.stderr).toBe(0)
    expect(list.stdout).toContain('/dist/main.js')
  })
})
