// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  formatAboutDetail,
  readBuildInfo,
  unknownBuildInfo,
} from './build-info'

describe('desktop build information', () => {
  it('reads a complete traceable build record and ignores arbitrary fields', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yangshao-build-info-'))
    const filename = join(directory, 'build-info.json')
    writeFileSync(
      filename,
      JSON.stringify({
        version: '1.0.1',
        buildTimeUtc: '2026-08-13T12:00:00.000Z',
        gitCommit: 'abcdef1234567890',
        gitCommitShort: 'abcdef1',
        target: 'internal',
        platform: 'darwin',
        arch: 'arm64',
        stack: '/Users/example/private/source/main.ts:42',
      }),
    )

    expect(readBuildInfo(filename)).toEqual({
      version: '1.0.1',
      buildTimeUtc: '2026-08-13T12:00:00.000Z',
      gitCommit: 'abcdef1234567890',
      gitCommitShort: 'abcdef1',
      target: 'internal',
      platform: 'darwin',
      arch: 'arm64',
    })
  })

  it('retains safe build fields when a source archive has no Git metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'yangshao-build-info-'))
    const filename = join(directory, 'build-info.json')
    const archiveBuild = {
      version: '1.0.1',
      buildTimeUtc: '2026-08-13T12:00:00.000Z',
      gitCommit: 'unknown',
      gitCommitShort: 'unknown',
      target: 'development',
      platform: 'darwin',
      arch: 'arm64',
    }
    writeFileSync(filename, JSON.stringify(archiveBuild))

    expect(readBuildInfo(filename)).toEqual(archiveBuild)
  })

  it.each([
    ['missing file', 'missing.json', undefined],
    ['malformed JSON', 'malformed.json', '{'],
    [
      'invalid record',
      'invalid.json',
      JSON.stringify({
        version: '/Users/example/private',
        buildTimeUtc: 'yesterday',
        gitCommit: 'not-a-commit',
        gitCommitShort: 'bad',
        target: '../../../private',
        platform: 'darwin',
        arch: 'arm64',
      }),
    ],
  ])('returns only safe unknown values for a %s', (_name, basename, contents) => {
    const directory = mkdtempSync(join(tmpdir(), 'yangshao-build-info-'))
    const filename = join(directory, basename)
    if (contents !== undefined) writeFileSync(filename, contents)

    expect(readBuildInfo(filename)).toEqual(unknownBuildInfo)
  })

  it('formats traceable about details with the application version as authority', () => {
    const detail = formatAboutDetail('1.0.1', {
      version: '9.9.9',
      buildTimeUtc: '2026-08-13T12:00:00.000Z',
      gitCommit: 'abcdef1234567890',
      gitCommitShort: 'abcdef1',
      target: 'internal',
      platform: 'darwin',
      arch: 'arm64',
    })

    expect(detail).toBe(
      '版本 1.0.1\n构建时间 2026-08-13T12:00:00.000Z\n提交 abcdef1\n目标 internal / darwin / arm64',
    )
    expect(detail).not.toContain('9.9.9')
  })

  it('never formats arbitrary JSON fields, local paths or stack traces', () => {
    const unsafe = {
      ...unknownBuildInfo,
      stack: 'Error at /Volumes/private/source/main.ts:42',
      localPath: '/Users/example/private',
    }

    const detail = formatAboutDetail('1.0.1', unsafe)

    expect(detail).toBe(
      '版本 1.0.1\n构建时间 unknown\n提交 unknown\n目标 unknown / unknown / unknown',
    )
    expect(detail).not.toMatch(/Volumes|Users|Error at/u)
  })

  it('keeps the generated build record beside the compiled runtime', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string>; version?: string }

    expect(packageJson.version).toBe('1.0.3')
    expect(packageJson.scripts?.build).toBe(
      'tsc -p tsconfig.json && node scripts/write-build-info.mjs',
    )
  })
})
