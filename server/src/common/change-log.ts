export type ChangeLogLike = {
  field: string
  oldValue?: unknown
  newValue?: unknown
  changedAt: unknown
}

export function collapseConsecutiveFieldChanges<T extends ChangeLogLike>(rows: T[], options: { windowMs?: number } = {}) {
  const windowMs = options.windowMs ?? Number.POSITIVE_INFINITY
  const collapsed: T[] = []
  rows.forEach((row) => {
    const previous = collapsed[collapsed.length - 1]
    if (previous?.field === row.field && isWithinWindow(previous.changedAt, row.changedAt, windowMs)) {
      collapsed[collapsed.length - 1] = {
        ...previous,
        newValue: row.newValue,
        changedAt: row.changedAt
      }
      return
    }
    collapsed.push({ ...row })
  })
  return collapsed
}

function isWithinWindow(previous: unknown, current: unknown, windowMs: number) {
  if (!Number.isFinite(windowMs)) return true
  const previousTime = new Date(previous as string | Date).getTime()
  const currentTime = new Date(current as string | Date).getTime()
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false
  return Math.abs(currentTime - previousTime) <= windowMs
}
