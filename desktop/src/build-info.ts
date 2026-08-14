import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface BuildInfo {
  version: string
  buildTimeUtc: string
  gitCommit: string
  gitCommitShort: string
  target: string
  platform: string
  arch: string
}

export const unknownBuildInfo: Readonly<BuildInfo> = Object.freeze({
  version: 'unknown',
  buildTimeUtc: 'unknown',
  gitCommit: 'unknown',
  gitCommitShort: 'unknown',
  target: 'unknown',
  platform: 'unknown',
  arch: 'unknown',
})

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/iu
const SAFE_TOKEN_PATTERN = /^[a-z0-9_-]{1,32}$/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBuildTimeUtc(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value
}

function hasSafeCommit(
  gitCommit: unknown,
  gitCommitShort: unknown,
): gitCommit is string {
  if (gitCommit === 'unknown' && gitCommitShort === 'unknown') return true
  return (
    typeof gitCommit === 'string' &&
    COMMIT_PATTERN.test(gitCommit) &&
    typeof gitCommitShort === 'string' &&
    gitCommitShort === gitCommit.slice(0, 7)
  )
}

function isUnknownBuildInfo(
  buildInfo: BuildInfo | Readonly<BuildInfo>,
): boolean {
  return (
    buildInfo.version === 'unknown' &&
    buildInfo.buildTimeUtc === 'unknown' &&
    buildInfo.gitCommit === 'unknown' &&
    buildInfo.gitCommitShort === 'unknown' &&
    buildInfo.target === 'unknown' &&
    buildInfo.platform === 'unknown' &&
    buildInfo.arch === 'unknown'
  )
}

function normalizeBuildInfo(value: unknown): BuildInfo | null {
  if (!isRecord(value)) return null

  const {
    version,
    buildTimeUtc,
    gitCommit,
    gitCommitShort,
    target,
    platform,
    arch,
  } = value

  if (
    typeof version !== 'string' ||
    !VERSION_PATTERN.test(version) ||
    !isBuildTimeUtc(buildTimeUtc) ||
    !hasSafeCommit(gitCommit, gitCommitShort) ||
    typeof target !== 'string' ||
    !SAFE_TOKEN_PATTERN.test(target) ||
    typeof platform !== 'string' ||
    !SAFE_TOKEN_PATTERN.test(platform) ||
    typeof arch !== 'string' ||
    !SAFE_TOKEN_PATTERN.test(arch)
  ) {
    return null
  }

  return {
    version,
    buildTimeUtc,
    gitCommit,
    gitCommitShort: gitCommitShort as string,
    target,
    platform,
    arch,
  }
}

export function readBuildInfo(
  filename = fileURLToPath(new URL('./build-info.json', import.meta.url)),
): BuildInfo {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filename, 'utf8'))
    return normalizeBuildInfo(parsed) ?? { ...unknownBuildInfo }
  } catch {
    return { ...unknownBuildInfo }
  }
}

export function formatAboutDetail(
  appVersion: string,
  buildInfo: BuildInfo | Readonly<BuildInfo>,
): string {
  const safeAppVersion = VERSION_PATTERN.test(appVersion)
    ? appVersion
    : 'unknown'
  const safeBuildInfo = isUnknownBuildInfo(buildInfo)
    ? { ...unknownBuildInfo }
    : normalizeBuildInfo(buildInfo) ?? { ...unknownBuildInfo }

  return [
    `版本 ${safeAppVersion}`,
    `构建时间 ${safeBuildInfo.buildTimeUtc}`,
    `提交 ${safeBuildInfo.gitCommitShort}`,
    `目标 ${safeBuildInfo.target} / ${safeBuildInfo.platform} / ${safeBuildInfo.arch}`,
  ].join('\n')
}
