import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { appendLabTotalRules, validateLabTotalBulkRequest, validateLabTotalRules, type LabTotalMonitorBulkResult, type LabTotalMonitorConfig } from '../server/src/common/lab-total-monitor'

// Development-only shared mock storage: both Vite origins see the same configuration.
// configureServer is never included in either production build.
export function labTotalMonitorDevPlugin(audience: 'frontend' | 'admin'): Plugin {
  const repo = fileURLToPath(new URL('..', import.meta.url))
  const dir = join(tmpdir(), `yangshao-total-monitor-${createHash('sha256').update(repo).digest('hex').slice(0, 12)}`)
  let mutations = Promise.resolve()
  let enabled = false
  return { name: 'lab-total-monitor-local-mocks', configResolved(config) {
    enabled = config.env[audience === 'frontend' ? 'VITE_USE_MOCKS' : 'VITE_ADMIN_USE_MOCKS'] !== 'false'
  }, configureServer(server) {
    if (!enabled) return
    server.middlewares.use(async (req, res, next) => {
      const match = req.url?.match(/^\/__lab-total-monitor-mock\/([a-zA-Z0-9_-]{1,64})$/)
      if (!match) return next()
      const send = (status: number, value: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)) }
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) return send(403, { message: '模拟接口仅供本机预览' })
      const ownerId = match[1]
      const file = join(dir, `${ownerId}.json`)
      const read = async (id = ownerId): Promise<LabTotalMonitorConfig> => {
        try { return JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          return { frontendUserId: id, version: 0, rules: [], updatedAt: null }
        }
      }
      if (req.method === 'GET') {
        try { return send(200, await read()) } catch { return send(500, { message: '模拟配置读取失败' }) }
      }
      const isBulk = ownerId === 'bulk' && req.method === 'POST'
      if ((!isBulk && req.method !== 'PUT') || audience !== 'admin') return send(405, { message: '只允许后台修改规则' })
      try {
        let raw = ''
        for await (const chunk of req) {
          raw += chunk.toString()
          if (raw.length > 64_000) return send(413, { message: '规则数据过大' })
        }
        const dto = JSON.parse(raw)
        if (isBulk) {
          const payload = validateLabTotalBulkRequest(dto)
          const operation = mutations.then(async () => {
            const source = await read(payload.sourceFrontendUserId)
            if (source.version !== payload.sourceVersion) return send(409, { message: '来源账号的监测规则已更新，请重新加载' })
            const sourceRules = source.rules.filter((rule) => payload.ruleIds.includes(rule.id))
            if (sourceRules.length !== payload.ruleIds.length) return send(400, { message: '部分来源规则不存在，请重新加载' })
            const results: LabTotalMonitorBulkResult[] = []
            await mkdir(dir, { recursive: true })
            for (const frontendUserId of payload.frontendUserIds) {
              const current = await read(frontendUserId)
              let merged
              try { merged = appendLabTotalRules(current.rules, sourceRules, randomUUID) } catch (error) {
                results.push({ frontendUserId, status: 'skipped', addedCount: 0, duplicateCount: 0, message: (error as Error).message }); continue
              }
              if (!merged.addedCount) {
                results.push({ frontendUserId, status: 'unchanged', addedCount: 0, duplicateCount: merged.duplicateCount, message: '已有相同指标，无需重复添加' }); continue
              }
              const saved = { frontendUserId, version: current.version + 1, rules: merged.rules, updatedAt: new Date().toISOString() }
              const target = join(dir, `${frontendUserId}.json`)
              await writeFile(`${target}.tmp`, JSON.stringify(saved), { mode: 0o600 }); await rename(`${target}.tmp`, target)
              results.push({ frontendUserId, status: 'applied', addedCount: merged.addedCount, duplicateCount: merged.duplicateCount,
                message: `已追加 ${merged.addedCount} 条规则${merged.duplicateCount ? `，忽略 ${merged.duplicateCount} 条相同指标` : ''}` })
            }
            send(200, results)
          })
          mutations = operation.catch(() => undefined)
          await operation
          return
        }
        const rules = validateLabTotalRules(dto.rules)
        if (!Number.isSafeInteger(dto.baseVersion) || dto.baseVersion < 0) return send(400, { message: '配置版本无效' })
        const operation = mutations.then(async () => {
          const current = await read()
          if (current.version !== dto.baseVersion) return send(409, { message: '规则已更新，请重新加载后保存' })
          const saved = { frontendUserId: ownerId, version: current.version + 1, rules, updatedAt: new Date().toISOString() }
          await mkdir(dir, { recursive: true })
          await writeFile(`${file}.tmp`, JSON.stringify(saved), { mode: 0o600 })
          await rename(`${file}.tmp`, file)
          send(200, saved)
        })
        mutations = operation.catch(() => undefined)
        await operation
      } catch (error) { send(400, { message: error instanceof Error ? error.message : '规则保存失败' }) }
    })
  } }
}
