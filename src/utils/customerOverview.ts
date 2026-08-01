import type { CustomerOverviewRow, CustomerOverviewSortField, SortDirection } from '@/types/customerOverview'

export function filterAndSortCustomerRows<T extends CustomerOverviewRow>(
  rows: T[],
  selectedKeys: string[],
  sortField: CustomerOverviewSortField,
  direction: SortDirection
): T[] {
  const selected = new Set(selectedKeys)
  const filtered = selected.size ? rows.filter((row) => selected.has(row.customerKey)) : rows
  const multiplier = direction === 'asc' ? 1 : -1

  return [...filtered].sort((left, right) => {
    const leftValue = left[sortField]
    const rightValue = right[sortField]
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'zh-CN')
    return comparison * multiplier || left.customerDisplay.localeCompare(right.customerDisplay, 'zh-CN')
  })
}
