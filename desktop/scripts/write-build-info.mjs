import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i
const TARGET_PATTERN = /^(?:internal|backend|development)$/
const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const packageJson = JSON.parse(
  readFileSync(resolve(desktopDirectory, 'package.json'), 'utf8'),
)

function validCommit(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return COMMIT_PATTERN.test(normalized) ? normalized : null
}

function resolveGitCommit() {
  const githubCommit = validCommit(process.env.GITHUB_SHA)
  if (githubCommit) return githubCommit

  try {
    return (
      validCommit(
        execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: desktopDirectory,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ) ?? 'unknown'
    )
  } catch {
    return 'unknown'
  }
}

const target = process.env.YANGSHAO_DESKTOP_TARGET ?? 'development'
if (!TARGET_PATTERN.test(target)) {
  throw new Error(`Unsupported desktop build target: ${target}`)
}

const gitCommit = resolveGitCommit()
const buildInfo = {
  version: packageJson.version,
  buildTimeUtc: new Date().toISOString(),
  gitCommit,
  gitCommitShort: gitCommit === 'unknown' ? 'unknown' : gitCommit.slice(0, 7),
  target,
  platform: process.platform,
  arch: process.arch,
}

const destination = resolve(desktopDirectory, 'dist/build-info.json')
mkdirSync(dirname(destination), { recursive: true })
writeFileSync(destination, `${JSON.stringify(buildInfo, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'w',
})
