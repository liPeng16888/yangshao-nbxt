export function toMoney(value: unknown) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0
}
