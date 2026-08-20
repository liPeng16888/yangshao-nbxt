export function samplePayerName(inputs: Record<string, unknown>): string {
  if (typeof inputs.customerText === 'string' && inputs.customerText.trim()) return inputs.customerText.trim()
  if (Array.isArray(inputs.customers)) {
    const names = inputs.customers
      .map((item) => (item && typeof item === 'object' && 'name' in item ? String((item as { name?: unknown }).name || '') : ''))
      .filter(Boolean)
    if (names.length) return names.join('、')
  }
  return '无信息'
}
