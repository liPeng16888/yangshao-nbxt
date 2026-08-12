export interface CoefficientRowIdentity {
  id: string
  code: string
  autoCode: boolean
}

export function formatCoefficientRowCode(index: number) {
  return String(index).padStart(3, '0')
}

export function inferCoefficientRowAutoCode(code: unknown, index: number, storedAutoCode?: unknown) {
  if (typeof storedAutoCode === 'boolean') return storedAutoCode
  return typeof code !== 'string' || code === formatCoefficientRowCode(index)
}

export function normalizeCoefficientAddCount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(50, Math.max(1, Math.trunc(value)))
}

export function normalizeCoefficientRowId(
  candidate: unknown,
  usedIds: Set<string>,
  createFallback: () => string
) {
  const storedId = typeof candidate === 'string' ? candidate.trim() : ''
  const fallbackBase = createFallback().trim() || 'coefficient-row'
  let id = storedId && !usedIds.has(storedId) ? storedId : fallbackBase
  let suffix = 2
  while (usedIds.has(id)) {
    id = `${fallbackBase}-${suffix}`
    suffix += 1
  }
  usedIds.add(id)
  return id
}

export function renumberAutomaticCoefficientRows<T extends CoefficientRowIdentity>(rows: T[]) {
  rows.forEach((row, index) => {
    if (row.autoCode) row.code = formatCoefficientRowCode(index + 1)
  })
}

export function deleteCoefficientRows<T extends CoefficientRowIdentity>(rows: T[], selectedIds: ReadonlySet<string>) {
  const remaining = rows.filter((row) => !selectedIds.has(row.id))
  if (!remaining.length) throw new Error('至少保留一个样品')
  renumberAutomaticCoefficientRows(remaining)
  return remaining
}
