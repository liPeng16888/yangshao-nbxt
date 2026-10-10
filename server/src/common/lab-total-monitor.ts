export interface LabTotalMonitorRule {
  id: string
  name: string
  ironMin: number
  ironMax: number
  totalMin: number
  totalMax: number
  enabled: boolean
}

export interface LabTotalMonitorConfig {
  frontendUserId: string
  version: number
  rules: LabTotalMonitorRule[]
  updatedAt: string | null
}

export interface LabTotalMonitorBulkRequest {
  sourceFrontendUserId: string
  sourceVersion: number
  ruleIds: string[]
  frontendUserIds: string[]
}

export interface LabTotalMonitorBulkResult {
  frontendUserId: string
  status: 'applied' | 'unchanged' | 'skipped' | 'conflict' | 'failed'
  addedCount: number
  duplicateCount: number
  message: string
}

export function validateLabTotalBulkRequest(value: unknown): LabTotalMonitorBulkRequest {
  const dto = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id)
  if (!validId(dto.sourceFrontendUserId)) throw new Error('请选择有效的来源账号')
  if (!Number.isSafeInteger(dto.sourceVersion) || (dto.sourceVersion as number) < 1) throw new Error('请先保存来源账号的规则')
  if (!Array.isArray(dto.ruleIds) || !dto.ruleIds.length || dto.ruleIds.length > 100 || !dto.ruleIds.every(validId)) throw new Error('请选择要添加的规则，最多 100 条')
  if (!Array.isArray(dto.frontendUserIds) || !dto.frontendUserIds.length || dto.frontendUserIds.length > 100 || !dto.frontendUserIds.every(validId)) throw new Error('请选择目标前台账号，单次最多 100 个')
  const frontendUserIds = [...new Set(dto.frontendUserIds)]
  if (frontendUserIds.includes(dto.sourceFrontendUserId)) throw new Error('目标账号不能包含来源账号')
  return { sourceFrontendUserId: dto.sourceFrontendUserId, sourceVersion: dto.sourceVersion as number,
    ruleIds: [...new Set(dto.ruleIds)], frontendUserIds }
}

export function appendLabTotalRules(existing: readonly LabTotalMonitorRule[], incoming: readonly LabTotalMonitorRule[], createId: () => string) {
  const result = validateLabTotalRules(existing)
  const incomingRules = validateLabTotalRules(incoming)
  // Labels and identities are account-local; identical bounds/state represent the same indicator.
  const signature = (rule: LabTotalMonitorRule) => JSON.stringify([rule.ironMin, rule.ironMax, rule.totalMin, rule.totalMax, rule.enabled])
  const signatures = new Set(result.map(signature))
  let duplicateCount = 0, addedCount = 0
  for (const rule of incomingRules) {
    const key = signature(rule)
    if (signatures.has(key)) { duplicateCount++; continue }
    result.push({ ...rule, id: createId() }); signatures.add(key); addedCount++
  }
  return { rules: validateLabTotalRules(result), addedCount, duplicateCount }
}

export interface TotalMonitorSample {
  inputs: { ironRaw?: unknown; siliconRaw?: unknown; aluminumRaw?: unknown }
  results: { iron?: unknown; silicon?: unknown; aluminum?: unknown; total?: unknown }
  sensitiveFieldsHidden?: boolean
}

export type LabTotalAssessment =
  | { status: 'disabled' | 'incomplete'; abnormal: false }
  | { status: 'normal' | 'outside-range'; abnormal: boolean; iron: number; total: number; rule: LabTotalMonitorRule }
  | { status: 'unmatched'; abnormal: true; iron: number; total: number }

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

// Compare the computed results, never the raw readings. Zero is a filled numeric input.
export function assessLabTotal(sample: TotalMonitorSample, rules: readonly LabTotalMonitorRule[]): LabTotalAssessment {
  const enabled = rules.filter((rule) => rule.enabled)
  if (!enabled.length) return { status: 'disabled', abnormal: false }
  if (sample.sensitiveFieldsHidden ||
    ![sample.inputs.ironRaw, sample.inputs.siliconRaw, sample.inputs.aluminumRaw,
      sample.results.iron, sample.results.silicon, sample.results.aluminum, sample.results.total].every(finiteNumber)) {
    return { status: 'incomplete', abnormal: false }
  }
  const iron = sample.results.iron as number
  const total = sample.results.total as number
  const rule = enabled.find((item) => iron >= item.ironMin && iron <= item.ironMax)
  if (!rule) return { status: 'unmatched', abnormal: true, iron, total }
  const abnormal = total < rule.totalMin || total > rule.totalMax
  return { status: abnormal ? 'outside-range' : 'normal', abnormal, iron, total, rule }
}

export function totalAssessmentMessage(assessment: LabTotalAssessment): string {
  if (assessment.status === 'unmatched') {
    return `铁计算值 ${assessment.iron} 未匹配任何已启用的铁含量范围，合量 ${assessment.total} 判为异常`
  }
  if (assessment.status === 'outside-range') {
    return `合量 ${assessment.total} 超出正常范围 ${assessment.rule.totalMin}–${assessment.rule.totalMax}（铁计算值 ${assessment.iron}，规则：${assessment.rule.name}）`
  }
  return ''
}

export function validateLabTotalRules(value: unknown): LabTotalMonitorRule[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('规则必须为数组，最多添加 100 条')
  const ids = new Set<string>()
  const rules = value.map((item: unknown, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第 ${index + 1} 条规则格式错误`)
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(row.id) || ids.has(row.id)) {
      throw new Error('每条规则必须有唯一的有效标识')
    }
    ids.add(row.id)
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 60) throw new Error(`第 ${index + 1} 条规则名称必填，最多 60 字`)
    if (![row.ironMin, row.ironMax, row.totalMin, row.totalMax].every(finiteNumber)) throw new Error(`第 ${index + 1} 条规则的四个范围值必须为有效数字`)
    if ((row.ironMin as number) > (row.ironMax as number) || (row.totalMin as number) > (row.totalMax as number)) {
      throw new Error(`第 ${index + 1} 条规则下限不能大于上限`)
    }
    if (typeof row.enabled !== 'boolean') throw new Error(`第 ${index + 1} 条规则的启用状态格式错误`)
    return { id: row.id, name: row.name.trim(), ironMin: row.ironMin as number, ironMax: row.ironMax as number,
      totalMin: row.totalMin as number, totalMax: row.totalMax as number, enabled: row.enabled }
  })
  const enabled = rules.filter((row) => row.enabled).sort((left, right) => left.ironMin - right.ironMin)
  for (let index = 1; index < enabled.length; index++) {
    if (enabled[index].ironMin <= enabled[index - 1].ironMax) {
      throw new Error(`“${enabled[index - 1].name}”与“${enabled[index].name}”的铁含量范围重叠（区间包含端点）`)
    }
  }
  return rules
}
