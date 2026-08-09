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
